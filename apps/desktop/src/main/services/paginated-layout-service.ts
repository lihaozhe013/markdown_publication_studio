import { BrowserWindow } from 'electron';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import type {
  PaginationApplyOptions,
  PaginationApplyReport,
  PaginationPassReport,
  PaginationProgramOptions,
  PageNumberSettings,
  PageSizeId,
  PageTemplateId,
  PaginatedPage,
  PaginationPlan,
  PublicationDiagnostic,
  ThemeId,
} from '@markdown-publication/shared';
import {
  DEFAULT_PAGE_NUMBER_SETTINGS,
  getBuiltInTheme,
} from '@markdown-publication/shared';
import {
  assertPaginationPlanMatches,
  planPagination,
} from '@markdown-publication/publication-core';
import { applyWindowSecurity } from '../security/window-security.js';
import { appLogger } from './app-logger.js';

export interface PaginatedLayoutRequest {
  html: string;
  themeId: ThemeId;
  pageSize: PageSizeId;
  pageNumber?: PageNumberSettings;
  restartBodyAfterToc?: boolean;
  tocEnabled?: boolean;
  frontCoverPages?: number;
  backCoverPages?: number;
  signal?: AbortSignal;
}

export interface PaginatedLayoutResult {
  html: string;
  plan: PaginationPlan;
  revision: string;
  diagnostics: PublicationDiagnostic[];
}

interface LayoutPassResult {
  report: PaginationPassReport;
  plan: PaginationPlan;
  labels: Record<string, string>;
  applied: PaginationApplyReport;
}

const MAX_CONVERGENCE_PASSES = 3;
const LAYOUT_CACHE_LIMIT = 6;

interface LayoutSession {
  window?: BrowserWindow;
  url: string;
}

/**
 * Wait for fonts and images without hanging on hidden-window decode work.
 * Readiness is bounded; missing resources surface as layout diagnostics.
 */
const PUBLICATION_READINESS_SCRIPT = `(async () => {
  const within = (promise, fallback) =>
    Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(fallback), 5000))]);
  await within(document.fonts.ready, undefined);
  await within(
    Promise.all(
      Array.from(document.images).map((image) =>
        image.complete
          ? Promise.resolve()
          : new Promise((resolve) => {
              image.addEventListener('load', resolve, { once: true });
              image.addEventListener('error', resolve, { once: true });
            }),
      ),
    ),
    undefined,
  );
  return document.images.length + '/' + document.fonts.size;
})()`;
const LAYOUT_DEADLINE_MS = 180_000;

const FOLIO_FONT_STACKS: Record<string, string> = {
  'source-sans-3': '"Source Sans 3", system-ui, sans-serif',
  'source-serif-4': '"Source Serif 4", Georgia, serif',
  inter: 'Inter, system-ui, sans-serif',
  lora: 'Lora, Georgia, serif',
  merriweather: 'Merriweather, Georgia, serif',
  'ibm-plex-sans': '"IBM Plex Sans", system-ui, sans-serif',
  'ibm-plex-mono': '"IBM Plex Mono", ui-monospace, monospace',
  'jetbrains-mono': '"JetBrains Mono", ui-monospace, monospace',
};

/** Resolve theme templates into whole-sheet background colors. */
export function templateBackgrounds(
  pageCanvasMode: 'full-bleed' | 'inset' | undefined,
): Record<PageTemplateId, string> {
  return {
    default: '#ffffff',
    // Generated contents pages use the body sheet so a publication reads as one
    // continuous document instead of marking the contents as a special surface.
    toc: '#ffffff',
    section: pageCanvasMode === 'full-bleed' ? '#fff6e5' : '#fdf8ee',
  };
}

/** Identify a paginated artifact from its inputs and layout configuration. */
export function paginationRevision(
  html: string,
  options: {
    themeId: ThemeId;
    pageSize: PageSizeId;
    pageNumber: PageNumberSettings;
    restartBodyAfterToc: boolean;
    frontCoverPages: number;
    backCoverPages: number;
    engineVersion: string;
    electronVersion: string;
  },
): string {
  const hash = createHash('sha256');
  hash.update(html);
  hash.update(
    JSON.stringify({
      themeId: options.themeId,
      pageSize: options.pageSize,
      pageNumber: options.pageNumber,
      restartBodyAfterToc: options.restartBodyAfterToc,
      frontCoverPages: options.frontCoverPages,
      backCoverPages: options.backCoverPages,
      engine: options.engineVersion,
      electron: options.electronVersion,
    }),
  );
  return hash.digest('hex');
}

/**
 * Render a revision-bound paginated artifact. The returned static HTML is what
 * the desktop preview shows and what Chromium prints; both consume the same
 * page boxes, folios, backgrounds, and contents references.
 */
export class PaginatedLayoutService {
  constructor(private readonly engineBundlePath: string) {
    this.programBundlePath = join(
      dirname(this.engineBundlePath),
      'paginated-program.js',
    );
  }

  private readonly programBundlePath: string;

  /**
   * Paginated artifacts are revision-bound, deterministic, and small once theme
   * assets are served by URL. Reusing one makes switching back to a previous
   * theme or re-exporting an unchanged publication immediate.
   */
  private readonly artifactCache = new Map<string, PaginatedLayoutResult>();

  private engineVersionPromise?: Promise<string>;

  private async readBundle(
    path: string,
    kind: 'engine' | 'program',
  ): Promise<string> {
    try {
      return await readFile(path, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      // A missing bundle means the application was launched from an incomplete
      // build tree, most often a dev session started before `pnpm build`.
      throw new Error(
        `The pagination ${kind} bundle is missing at ${path}. Run "pnpm build" or restart "pnpm dev" to generate it.`,
        { cause: error },
      );
    }
  }

  private engineVersion(): Promise<string> {
    this.engineVersionPromise ??= readFile(
      join(dirname(this.engineBundlePath), 'paged-engine.json'),
      'utf8',
    )
      .then(
        (source) =>
          (JSON.parse(source) as { version?: string }).version ?? 'unknown',
      )
      .catch(() => 'unknown');
    return this.engineVersionPromise;
  }

  async layout(
    request: PaginatedLayoutRequest,
  ): Promise<PaginatedLayoutResult> {
    const engineVersion = await this.engineVersion();
    const revision = paginationRevision(request.html, {
      themeId: request.themeId,
      pageSize: request.pageSize,
      pageNumber: request.pageNumber ?? DEFAULT_PAGE_NUMBER_SETTINGS,
      restartBodyAfterToc: request.restartBodyAfterToc ?? false,
      frontCoverPages: request.frontCoverPages ?? 0,
      backCoverPages: request.backCoverPages ?? 0,
      engineVersion,
      electronVersion: process.versions.electron ?? 'unknown',
    });
    const cached = this.artifactCache.get(revision);
    if (cached) {
      appLogger.info('[layout] Reusing paginated artifact', {
        revision: revision.slice(0, 12),
        pages: cached.plan.pages.length,
      });
      return { ...cached, diagnostics: [...cached.diagnostics] };
    }

    const engine = await this.readBundle(this.engineBundlePath, 'engine');
    const program = await this.readBundle(this.programBundlePath, 'program');

    const diagnostics: PublicationDiagnostic[] = [];
    let prefillLabels: Record<string, string> = {};
    const seenLabels = new Set<string>();
    const directory = await mkdtemp(join(tmpdir(), 'mps-layout-'));
    const htmlPath = join(directory, 'publication.html');
    const session: LayoutSession = {
      url: pathToFileURL(htmlPath).toString(),
    };

    try {
      await writeFile(htmlPath, request.html, 'utf8');
      for (let pass = 1; pass <= MAX_CONVERGENCE_PASSES; pass += 1) {
        throwIfAborted(request.signal);
        const result = await this.runPass(
          request,
          engine,
          program,
          prefillLabels,
          diagnostics,
          session,
        );
        assertPaginationPlanMatches(result.plan, result.report.pageCount);
        if (result.applied.geometryStable) {
          const output: PaginatedLayoutResult = {
            html: result.applied.html,
            plan: result.plan,
            revision,
            diagnostics,
          };
          this.rememberArtifact(revision, output);
          return output;
        }
        const signature = JSON.stringify(result.labels);
        if (seenLabels.has(signature)) {
          throw new Error(
            'Page references did not converge; the contents page kept changing size.',
          );
        }
        seenLabels.add(signature);
        prefillLabels = result.labels;
        appLogger.info('[layout] Reflowing to converge contents references', {
          pass,
        });
      }
      throw new Error(
        `Page references did not stabilize after ${MAX_CONVERGENCE_PASSES} layout passes.`,
      );
    } finally {
      if (session.window && !session.window.isDestroyed()) {
        session.window.destroy();
      }
      await rm(directory, { recursive: true, force: true }).catch(
        () => undefined,
      );
    }
  }

  private rememberArtifact(
    revision: string,
    artifact: PaginatedLayoutResult,
  ): void {
    this.artifactCache.set(revision, artifact);
    while (this.artifactCache.size > LAYOUT_CACHE_LIMIT) {
      const oldest = this.artifactCache.keys().next().value;
      if (oldest === undefined) break;
      this.artifactCache.delete(oldest);
    }
  }

  private async runPass(
    request: PaginatedLayoutRequest,
    engine: string,
    program: string,
    prefillLabels: Record<string, string>,
    diagnostics: PublicationDiagnostic[],
    session: LayoutSession,
  ): Promise<LayoutPassResult> {
    const window = this.ensureWindow(session);
    const abort = (): void => {
      if (!window.isDestroyed()) window.destroy();
    };
    request.signal?.addEventListener('abort', abort, { once: true });
    const evaluate = async (script: string, label: string): Promise<string> =>
      withDeadline(
        window.webContents.executeJavaScript(script, true),
        label,
        request.signal,
      ).then((value) => String(value));
    try {
      appLogger.info('[layout] Loading publication window');
      await withDeadline(
        window.loadURL(session.url),
        'Publication layout load',
        request.signal,
      );
      appLogger.info('[layout] Publication window loaded');
      await evaluate(
        PUBLICATION_READINESS_SCRIPT,
        'Publication resource readiness',
      );
      appLogger.info('[layout] Resources ready');
      // Layout windows may be hidden by the host application, which pauses
      // animation frames. Fall back to timers so measurement keeps running.
      await evaluate(
        `new Promise((resolve) => {
          let settled = false;
          const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            window.requestAnimationFrame = (callback) =>
              setTimeout(() => callback(performance.now()), 16);
            resolve('timer-fallback');
          }, 250);
          window.requestAnimationFrame(() => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve('animation-frame');
          });
        })`,
        'Layout animation frames',
      );
      await evaluate(engine, 'Pagination engine startup');
      appLogger.info('[layout] Engine ready');
      await evaluate(program, 'Pagination program startup');
      appLogger.info('[layout] Program ready');
      const report = JSON.parse(
        await evaluate(
          `(async () => JSON.stringify(await window.__publicationPaginate(${JSON.stringify(this.programOptions(request, prefillLabels))})))()`,
          'Publication pagination',
        ),
      ) as PaginationPassReport;
      for (const item of report.diagnostics) {
        diagnostics.push({
          severity: item.severity,
          code: item.code,
          message: item.message,
          feature: 'render',
          ...(item.details ? { details: item.details } : {}),
        });
      }
      appLogger.info('[layout] Layout pass finished', {
        pages: report.pageCount,
      });
      const plan = this.createPlan(report, request, diagnostics);
      const labels = this.resolveLabels(report, plan);
      const applied = JSON.parse(
        await evaluate(
          `(async () => JSON.stringify(await window.__publicationApply(${JSON.stringify(this.applyOptions(request, plan, labels, report.geometry))})))()`,
          'Publication artifact finalization',
        ),
      ) as PaginationApplyReport;
      if (process.env.MPS_LAYOUT_DUMP_DIR) {
        mkdirSync(process.env.MPS_LAYOUT_DUMP_DIR, { recursive: true });
        const stamp = String(Date.now());
        writeFileSync(
          join(process.env.MPS_LAYOUT_DUMP_DIR, `report-${stamp}.json`),
          JSON.stringify({ report, plan, labels }, null, 2),
        );
        writeFileSync(
          join(process.env.MPS_LAYOUT_DUMP_DIR, `artifact-${stamp}.html`),
          applied.html,
        );
      }
      return { report, plan, labels, applied };
    } finally {
      request.signal?.removeEventListener('abort', abort);
    }
  }

  /**
   * Convergence passes reload the same artifact file. Keep one hidden window
   * for the whole layout call instead of paying window creation per pass.
   */
  private ensureWindow(session: LayoutSession): BrowserWindow {
    if (session.window && !session.window.isDestroyed()) return session.window;
    const window = this.createWindow();
    session.window = window;
    return window;
  }

  private createPlan(
    report: PaginationPassReport,
    request: PaginatedLayoutRequest,
    diagnostics: PublicationDiagnostic[],
  ): PaginationPlan {
    const plan = planPagination(report.pages, {
      pageNumber: request.pageNumber ?? DEFAULT_PAGE_NUMBER_SETTINGS,
      restartBodyAfterToc: request.restartBodyAfterToc ?? false,
      frontCoverPages: request.frontCoverPages ?? 0,
      backCoverPages: request.backCoverPages ?? 0,
    });
    if ((request.tocEnabled ?? false) && plan.tocPages.length === 0) {
      diagnostics.push({
        severity: 'warning',
        code: 'toc-missing',
        message: 'No table of contents was found in the paginated publication.',
        feature: 'toc',
      });
    }
    for (const [target, page] of Object.entries(report.anchorPages)) {
      if (page > 0) continue;
      diagnostics.push({
        severity: 'error',
        code: 'toc-reference-unresolved',
        message: `The contents entry ${JSON.stringify(target)} has no destination page.`,
        feature: 'toc',
        details: { target },
      });
    }
    return plan;
  }

  private resolveLabels(
    report: PaginationPassReport,
    plan: PaginationPlan,
  ): Record<string, string> {
    const labels: Record<string, string> = {};
    const byPage = new Map<number, PaginatedPage>(
      plan.pages.map((page) => [page.generatedPage, page]),
    );
    for (const [target, page] of Object.entries(report.anchorPages)) {
      labels[target] = byPage.get(page)?.label ?? '';
    }
    return labels;
  }

  private programOptions(
    request: PaginatedLayoutRequest,
    labels: Record<string, string>,
  ): PaginationProgramOptions {
    const pageNumber = request.pageNumber ?? DEFAULT_PAGE_NUMBER_SETTINGS;
    const folio = this.folioTypography(pageNumber);
    return {
      pageSize: request.pageSize,
      pageMarginTop: '18mm',
      pageMarginRight: '16mm',
      pageMarginBottom: '20mm',
      pageMarginLeft: '16mm',
      screenBackground: '#eef1f5',
      pageBackground: '#ffffff',
      templateBackgrounds: templateBackgrounds(
        getBuiltInTheme(request.themeId).pageCanvasMode,
      ),
      ...folio,
      prefillLabels: labels,
    };
  }

  private applyOptions(
    request: PaginatedLayoutRequest,
    plan: PaginationPlan,
    labels: Record<string, string>,
    geometry: string,
  ): PaginationApplyOptions {
    return {
      pageSize: request.pageSize,
      labels,
      folios: plan.pages.map((page) => page.folio),
      templates: plan.pages.map((page) => page.template),
      templateBackgrounds: templateBackgrounds(
        getBuiltInTheme(request.themeId).pageCanvasMode,
      ),
      screenBackground: '#eef1f5',
      pageBackground: '#ffffff',
      geometry,
      ...this.folioTypography(
        request.pageNumber ?? DEFAULT_PAGE_NUMBER_SETTINGS,
      ),
    };
  }

  private folioTypography(pageNumber: PageNumberSettings): {
    folioFontFamily: string;
    folioFontSizePt: number;
    folioFontWeight: number;
    folioFontStyle: 'normal' | 'italic';
    folioColor: string;
  } {
    return {
      folioFontFamily:
        FOLIO_FONT_STACKS[pageNumber.fontFamily] ?? 'system-ui, sans-serif',
      folioFontSizePt: pageNumber.fontSizePt,
      folioFontWeight: pageNumber.style === 'bold' ? 700 : 400,
      folioFontStyle: pageNumber.style === 'italic' ? 'italic' : 'normal',
      folioColor: '#3c4a5a',
    };
  }

  private createWindow(): BrowserWindow {
    const window = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });
    applyWindowSecurity(window);
    window.webContents.setBackgroundThrottling(false);
    return window;
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new Error('Publication layout was cancelled.');
}

async function withDeadline<T>(
  promise: Promise<T>,
  label: string,
  signal: AbortSignal | undefined,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(
            new Error(`${label} timed out after ${LAYOUT_DEADLINE_MS}ms.`),
          );
        }, LAYOUT_DEADLINE_MS);
        if (signal) {
          onAbort = () =>
            reject(new Error('Publication layout was cancelled.'));
          signal.addEventListener('abort', onAbort, { once: true });
        }
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    if (onAbort && signal) signal.removeEventListener('abort', onAbort);
  }
}
