import { readFile, rename, writeFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { basename, dirname, extname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  compileMarkdownFile,
  createMarkdownCompiler,
  getKatexFontAssetSummary,
  renderPublicationHtml,
} from '@markdown-publication/publication-core';
import type {
  ExportResult,
  PageLayoutSettings,
  PageNumberSettings,
  PageSizeId,
  PaginationSummary,
  PreviewResult,
  PublicationStyleOverrides,
  TocSettings,
  ThemeId,
} from '@markdown-publication/shared';
import type { PublicationDiagnostic } from '@markdown-publication/shared';
import {
  DEFAULT_PAGE_NUMBER_SETTINGS,
  DEFAULT_PAGE_SIZE,
  DEFAULT_PUBLICATION_STYLE_OVERRIDES,
  DEFAULT_TOC_SETTINGS,
  getBuiltInTheme,
} from '@markdown-publication/shared';
import type { PrintBackend } from './electron-print-backend.js';
import type { MermaidRenderer } from './mermaid-renderer.js';
import type {
  PdfAssemblyCovers,
  PdfAssembler,
} from './pdf-assembly-service.js';
import type { CoverAssetFile } from './cover-asset-service.js';
import { loadThemeStylesheet } from './theme-service.js';
import { appLogger, isRenderingDebugEnabled } from './app-logger.js';
import { PageNumberPdfService } from './page-number-pdf-service.js';
import type { PaginatedLayoutService } from './paginated-layout-service.js';

interface PublicationBuildOptions {
  pageNumber?: PageNumberSettings;
  pageLayout?: PageLayoutSettings;
  frontCoverPages?: number;
  backCoverPages?: number;
  signal?: AbortSignal;
}

interface BuiltPublication extends PreviewResult {
  paginated: boolean;
}

function logAssetDiagnostics(
  sourcePath: string,
  diagnostics: PreviewResult['diagnostics'],
): void {
  for (const diagnostic of diagnostics) {
    if (diagnostic.feature !== 'asset') continue;
    const referenceKind =
      typeof diagnostic.details?.referenceKind === 'string'
        ? diagnostic.details.referenceKind
        : 'unknown';
    const reason =
      typeof diagnostic.details?.reason === 'string'
        ? diagnostic.details.reason
        : undefined;
    const details = {
      code: diagnostic.code,
      sourceFile: basename(sourcePath),
      referenceKind,
      ...(reason ? { reason } : {}),
    };
    if (diagnostic.severity === 'error') {
      appLogger.error(
        '[asset] Asset resolution error',
        diagnostic.code,
        details,
      );
    } else if (diagnostic.severity === 'warning') {
      appLogger.warn('[asset] Asset resolution warning', details);
    } else {
      appLogger.info('[asset] Asset resolution info', details);
    }
  }
}

async function countCoverPages(covers: PdfAssemblyCovers): Promise<{
  frontCoverPages: number;
  backCoverPages: number;
}> {
  const count = async (asset: CoverAssetFile | undefined): Promise<number> => {
    if (!asset) return 0;
    if (asset.kind !== 'pdf') return 1;
    try {
      const document = await PDFDocument.load(await readFile(asset.path), {
        updateMetadata: false,
      });
      return document.getPageCount();
    } catch {
      return 1;
    }
  };
  return {
    frontCoverPages: await count(covers.front),
    backCoverPages: await count(covers.back),
  };
}

export class PublicationService {
  private readonly compilerPromise = createMarkdownCompiler();

  constructor(
    private readonly printBackend: PrintBackend,
    private readonly mermaidRenderer: MermaidRenderer,
    private readonly pageNumberPdfService: PageNumberPdfService,
    private readonly pdfAssembler: PdfAssembler,
    private readonly layoutService?: PaginatedLayoutService,
  ) {}

  /** Page-first layout is the production default once a layout backend exists. */
  private resolvePageLayout(
    pageLayout: PageLayoutSettings | undefined,
  ): PageLayoutSettings {
    return (
      pageLayout ?? {
        enabled: this.layoutService !== undefined,
        restartBodyAfterToc: false,
      }
    );
  }

  async buildPreview(
    sourcePath: string,
    themeId: ThemeId,
    pageSize: PageSizeId = DEFAULT_PAGE_SIZE,
    styleOverrides: PublicationStyleOverrides = DEFAULT_PUBLICATION_STYLE_OVERRIDES,
    tocSettings: TocSettings = DEFAULT_TOC_SETTINGS,
    options: PublicationBuildOptions = {},
  ): Promise<PreviewResult> {
    const built = await this.buildPublication(
      sourcePath,
      themeId,
      pageSize,
      styleOverrides,
      tocSettings,
      options,
    );
    const { paginated: _paginated, ...preview } = built;
    return preview;
  }

  private async buildPublication(
    sourcePath: string,
    themeId: ThemeId,
    pageSize: PageSizeId,
    styleOverrides: PublicationStyleOverrides,
    tocSettings: TocSettings,
    options: PublicationBuildOptions = {},
  ): Promise<BuiltPublication> {
    if (isRenderingDebugEnabled) {
      appLogger.debug('[math-render] KaTeX stylesheet asset summary', {
        report: JSON.stringify(getKatexFontAssetSummary()),
      });
    }
    const compiler = await this.compilerPromise;
    const theme = getBuiltInTheme(themeId);
    const chapter = await compileMarkdownFile(compiler, sourcePath, {
      codeTheme: theme.codeTheme,
      math: { enabled: true },
      mermaid: { enabled: true },
      html: { policy: 'safe-static' },
    });
    logAssetDiagnostics(sourcePath, chapter.diagnostics);
    const tocEntries = tocSettings.enabled ? chapter.tocEntries : [];
    const pageLayout = this.resolvePageLayout(options.pageLayout);
    const paginate = pageLayout.enabled && this.layoutService !== undefined;
    const tocOptions =
      tocEntries.length > 0
        ? {
            preset: tocSettings.preset,
            entries: tocEntries,
            ...(paginate ? { pageReferences: true } : {}),
          }
        : undefined;
    const rendered = renderPublicationHtml([chapter], {
      title: chapter.title,
      themeId,
      pageSize,
      pageCanvasMode: theme.pageCanvasMode,
      features: {
        codeTheme: theme.codeTheme,
        math: { enabled: true },
        mermaid: { enabled: true },
        html: { policy: 'safe-static' },
      },
      stylesheet: await loadThemeStylesheet(themeId, styleOverrides),
      styleOverrides,
      ...(tocOptions ? { toc: tocOptions } : {}),
    });
    const mermaid = await this.mermaidRenderer.render(
      rendered.html,
      themeId,
      sourcePath,
    );
    const diagnostics = [...rendered.diagnostics, ...mermaid.diagnostics];
    if (tocSettings.enabled && tocEntries.length === 0) {
      diagnostics.push({
        severity: 'warning',
        code: 'toc-empty',
        message:
          'No H1-H3 headings were found; the table of contents was omitted.',
        sourcePath,
        feature: 'toc',
      });
    }
    if (paginate && this.layoutService) {
      this.throwOnFatalDiagnostics(diagnostics);
      const paginated = await this.layoutService.layout({
        html: mermaid.html,
        themeId,
        pageSize,
        pageNumber: options.pageNumber ?? DEFAULT_PAGE_NUMBER_SETTINGS,
        restartBodyAfterToc: pageLayout.restartBodyAfterToc,
        tocEnabled: tocSettings.enabled,
        frontCoverPages: options.frontCoverPages ?? 0,
        backCoverPages: options.backCoverPages ?? 0,
        ...(options.signal ? { signal: options.signal } : {}),
      });
      diagnostics.push(...paginated.diagnostics);
      this.throwOnFatalDiagnostics(diagnostics);
      const pagination: PaginationSummary = {
        ...paginated.plan,
        revision: paginated.revision,
      };
      return {
        title: chapter.title,
        html: paginated.html,
        diagnostics,
        pagination,
        paginated: true,
      };
    }
    return {
      title: chapter.title,
      html: mermaid.html,
      diagnostics,
      paginated: false,
    };
  }

  async exportPdf(
    sourcePath: string,
    outputPath: string,
    themeId: ThemeId,
    pageSize: PageSizeId,
    pageNumber: PageNumberSettings,
    covers: PdfAssemblyCovers,
    styleOverrides: PublicationStyleOverrides = DEFAULT_PUBLICATION_STYLE_OVERRIDES,
    tocSettings: TocSettings = DEFAULT_TOC_SETTINGS,
    pageLayout?: PageLayoutSettings,
    options: { signal?: AbortSignal } = {},
  ): Promise<ExportResult> {
    const { pdf, diagnostics, pagination } = await this.renderPdf(
      sourcePath,
      themeId,
      pageSize,
      pageNumber,
      covers,
      styleOverrides,
      tocSettings,
      pageLayout,
      options,
    );
    const temporaryPath = resolve(
      dirname(outputPath),
      `.${randomUUID()}${extname(outputPath) || '.pdf'}`,
    );
    await writeFile(temporaryPath, pdf);
    await rename(temporaryPath, outputPath);
    return {
      outputPath,
      diagnostics,
      ...(pagination ? { pagination } : {}),
    };
  }

  async renderPdf(
    sourcePath: string,
    themeId: ThemeId,
    pageSize: PageSizeId,
    pageNumber: PageNumberSettings,
    covers: PdfAssemblyCovers,
    styleOverrides: PublicationStyleOverrides = DEFAULT_PUBLICATION_STYLE_OVERRIDES,
    tocSettings: TocSettings = DEFAULT_TOC_SETTINGS,
    pageLayout?: PageLayoutSettings,
    options: { signal?: AbortSignal } = {},
  ): Promise<{
    pdf: Uint8Array;
    diagnostics: PreviewResult['diagnostics'];
    pagination?: PaginationSummary;
  }> {
    const coverPages = await countCoverPages(covers);
    const publication = await this.buildPublication(
      sourcePath,
      themeId,
      pageSize,
      styleOverrides,
      tocSettings,
      {
        pageNumber,
        ...(pageLayout ? { pageLayout } : {}),
        ...(options.signal ? { signal: options.signal } : {}),
        ...coverPages,
      },
    );
    this.throwOnFatalDiagnostics(publication.diagnostics);
    const printedPdf = await this.printBackend.render(publication.html);
    let numberedBodyPdf: Uint8Array;
    if (publication.paginated) {
      // Shared page HTML already carries the finalized folios for this revision.
      numberedBodyPdf = printedPdf;
    } else {
      if (pageNumber.enabled) {
        appLogger.info('[page-number] Applying PDF page-number settings', {
          fontFamily: pageNumber.fontFamily,
          fontSizePt: pageNumber.fontSizePt,
          style: pageNumber.style,
          firstPageMode: pageNumber.firstPageMode,
        });
      }
      numberedBodyPdf = await this.pageNumberPdfService.apply(
        printedPdf,
        pageNumber,
      );
    }
    if (covers.front || covers.back) {
      appLogger.info('[cover] Assembling selected cover assets', {
        front: covers.front?.name,
        back: covers.back?.name,
        pageSize,
      });
    }
    const pdf = await this.pdfAssembler.assemble({
      bodyPdf: numberedBodyPdf,
      pageSize,
      covers,
    });
    return {
      pdf,
      diagnostics: publication.diagnostics,
      ...(publication.pagination ? { pagination: publication.pagination } : {}),
    };
  }

  async exportHtml(
    sourcePath: string,
    outputPath: string,
    themeId: ThemeId,
    pageSize: PageSizeId,
    styleOverrides: PublicationStyleOverrides = DEFAULT_PUBLICATION_STYLE_OVERRIDES,
  ): Promise<ExportResult> {
    const { html, diagnostics } = await this.renderHtml(
      sourcePath,
      themeId,
      pageSize,
      styleOverrides,
    );
    const temporaryPath = resolve(
      dirname(outputPath),
      `.${randomUUID()}${extname(outputPath) || '.html'}`,
    );
    await writeFile(temporaryPath, html, 'utf8');
    await rename(temporaryPath, outputPath);
    return { outputPath, diagnostics };
  }

  async renderHtml(
    sourcePath: string,
    themeId: ThemeId,
    pageSize: PageSizeId,
    styleOverrides: PublicationStyleOverrides = DEFAULT_PUBLICATION_STYLE_OVERRIDES,
  ): Promise<{ html: string; diagnostics: PreviewResult['diagnostics'] }> {
    const publication = await this.buildPreview(
      sourcePath,
      themeId,
      pageSize,
      styleOverrides,
      DEFAULT_TOC_SETTINGS,
      // The flowing HTML profile stays flow-based and never fixes pages.
      { pageLayout: { enabled: false, restartBodyAfterToc: false } },
    );
    this.throwOnFatalDiagnostics(publication.diagnostics);
    return { html: publication.html, diagnostics: publication.diagnostics };
  }

  private throwOnFatalDiagnostics(
    diagnostics: PreviewResult['diagnostics'],
  ): void {
    const fatal = diagnostics.find(
      (diagnostic) => diagnostic.severity === 'error',
    );
    if (fatal) {
      throw new PublicationDiagnosticsError(fatal.message, diagnostics);
    }
  }
}

export class PublicationDiagnosticsError extends Error {
  constructor(
    message: string,
    readonly diagnostics: PublicationDiagnostic[],
  ) {
    super(message);
    this.name = 'PublicationDiagnosticsError';
  }
}

export async function validateMarkdownPath(sourcePath: string): Promise<void> {
  const stat = await readFile(sourcePath);
  if (stat.length === 0) {
    throw new Error('The selected Markdown file is empty.');
  }
  if (!['.md', '.markdown'].includes(extname(sourcePath).toLowerCase())) {
    throw new Error(
      'Only Markdown files are supported in the first vertical slice.',
    );
  }
}
