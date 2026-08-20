import { BrowserWindow } from 'electron';
import type {
  MermaidGeometryReport,
  MermaidSvgMetrics,
  PublicationDiagnostic,
  ThemeId,
} from '@markdown-publication/shared';
import { compareMermaidGeometry } from '@markdown-publication/shared';
import { applyWindowSecurity } from '../security/window-security.js';
import { appLogger, isRenderingDebugEnabled } from './app-logger.js';

export interface MermaidRenderer {
  render(
    html: string,
    themeId: ThemeId,
    sourcePath?: string,
  ): Promise<{ html: string; diagnostics: PublicationDiagnostic[] }>;
}

interface MermaidInput {
  id: string;
  source: string;
}

interface MermaidOutput {
  id: string;
  svg?: string;
  error?: string;
  errorCode?: 'mermaid-render-failed' | 'mermaid-svg-invalid';
  rawSummary?: MermaidSvgSummary;
  sanitizedSummary?: MermaidSvgSummary;
  metrics?: MermaidSvgMetrics;
  styledMetrics?: MermaidSvgMetrics;
  sanitizedMetrics?: MermaidSvgMetrics;
  restoredMetrics?: MermaidSvgMetrics;
  geometry?: MermaidGeometryReport;
  removed?: MermaidSanitizationReport;
}

interface MermaidSvgSummary {
  elementCount: number;
  elements: string;
  attributeCount: number;
  attributes: string;
  viewBox?: string;
  width?: string;
  height?: string;
  style?: string;
}

interface MermaidSanitizationReport {
  tags: string[];
  attributes: string[];
}

const RENDER_TIMEOUT_MS = 30_000;

async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} timed out after ${RENDER_TIMEOUT_MS}ms.`));
        }, RENDER_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function isMermaidOutput(value: unknown): value is MermaidOutput {
  if (!value || typeof value !== 'object') return false;
  const output = value as Record<string, unknown>;
  return (
    typeof output.id === 'string' &&
    (output.svg === undefined || typeof output.svg === 'string') &&
    (output.error === undefined || typeof output.error === 'string') &&
    (output.errorCode === undefined ||
      output.errorCode === 'mermaid-render-failed' ||
      output.errorCode === 'mermaid-svg-invalid') &&
    (output.rawSummary === undefined ||
      isMermaidSvgSummary(output.rawSummary)) &&
    (output.sanitizedSummary === undefined ||
      isMermaidSvgSummary(output.sanitizedSummary)) &&
    (output.metrics === undefined || isMermaidSvgMetrics(output.metrics)) &&
    (output.sanitizedMetrics === undefined ||
      isMermaidSvgMetrics(output.sanitizedMetrics)) &&
    (output.styledMetrics === undefined ||
      isMermaidSvgMetrics(output.styledMetrics)) &&
    (output.restoredMetrics === undefined ||
      isMermaidSvgMetrics(output.restoredMetrics)) &&
    (output.geometry === undefined || isMermaidGeometryReport(output.geometry))
  );
}

function isMermaidSvgSummary(value: unknown): value is MermaidSvgSummary {
  if (!value || typeof value !== 'object') return false;
  const summary = value as Record<string, unknown>;
  return (
    typeof summary.elementCount === 'number' &&
    typeof summary.elements === 'string' &&
    typeof summary.attributeCount === 'number' &&
    typeof summary.attributes === 'string'
  );
}

function isMermaidSvgMetrics(value: unknown): value is MermaidSvgMetrics {
  if (!value || typeof value !== 'object') return false;
  const metrics = value as Record<string, unknown>;
  return (
    typeof metrics.viewBox === 'string' &&
    typeof metrics.clientWidth === 'number' &&
    typeof metrics.clientHeight === 'number' &&
    typeof metrics.boundingBoxX === 'number' &&
    typeof metrics.boundingBoxY === 'number' &&
    typeof metrics.boundingBoxWidth === 'number' &&
    typeof metrics.boundingBoxHeight === 'number'
  );
}

function isMermaidGeometryReport(
  value: unknown,
): value is MermaidGeometryReport {
  if (!value || typeof value !== 'object') return false;
  const report = value as Record<string, unknown>;
  return (
    typeof report.preserved === 'boolean' &&
    typeof report.beforeElementCount === 'number' &&
    typeof report.afterElementCount === 'number' &&
    typeof report.beforeGeometryAttributeCount === 'number' &&
    typeof report.afterGeometryAttributeCount === 'number' &&
    typeof report.maxBoundingBoxDelta === 'number' &&
    (report.firstDifference === undefined ||
      typeof report.firstDifference === 'string')
  );
}

function hasUsableMermaidGeometry(
  metrics: MermaidSvgMetrics | undefined,
): boolean {
  if (!metrics) return false;
  const values = metrics.viewBox.split(/\s+/u).map(Number);
  const viewBoxWidth = values[2] ?? Number.NaN;
  const viewBoxHeight = values[3] ?? Number.NaN;
  if (
    !Number.isFinite(viewBoxWidth) ||
    !Number.isFinite(viewBoxHeight) ||
    viewBoxWidth <= 0 ||
    viewBoxHeight <= 0 ||
    metrics.clientWidth <= 0 ||
    metrics.clientHeight <= 0
  ) {
    return false;
  }
  const expectedHeight = (metrics.clientWidth * viewBoxHeight) / viewBoxWidth;
  return Math.abs(metrics.clientHeight - expectedHeight) <= 2;
}

function hasPreservedMermaidGeometry(output: MermaidOutput): boolean {
  if (!output.geometry?.preserved) return false;
  const restoredMetrics = output.restoredMetrics ?? output.sanitizedMetrics;
  const metricReport = compareMermaidGeometry(
    { elementCount: 0, geometryAttributeCount: 0, entries: [] },
    { elementCount: 0, geometryAttributeCount: 0, entries: [] },
    output.metrics,
    restoredMetrics,
  );
  return metricReport.preserved;
}

function isMermaidOutputList(value: unknown): value is MermaidOutput[] {
  return Array.isArray(value) && value.every(isMermaidOutput);
}

function diagnosticWithSourcePath(
  diagnostic: Omit<PublicationDiagnostic, 'sourcePath'>,
  sourcePath: string | undefined,
): PublicationDiagnostic {
  return sourcePath === undefined ? diagnostic : { ...diagnostic, sourcePath };
}

function mermaidTheme(
  themeId: ThemeId,
): 'default' | 'dark' | 'forest' | 'neutral' {
  if (themeId === 'claude') return 'neutral';
  if (themeId === 'github-markdown') return 'default';
  return 'forest';
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export class ElectronMermaidRenderer implements MermaidRenderer {
  constructor(private readonly rendererPagePath: string) {}

  async render(
    html: string,
    themeId: ThemeId,
    sourcePath?: string,
  ): Promise<{ html: string; diagnostics: PublicationDiagnostic[] }> {
    const placeholderPattern =
      /<pre class="mermaid-placeholder" data-mermaid-id="([^"]+)" data-mermaid-source="([^"]+)">[\s\S]*?<\/pre>/gu;
    const matches = [...html.matchAll(placeholderPattern)];
    if (matches.length === 0) return { html, diagnostics: [] };

    const inputs: MermaidInput[] = matches.map((match, index) => ({
      id: match[1] ?? `mermaid-${index}`,
      source: Buffer.from(match[2] ?? '', 'base64').toString('utf8'),
    }));

    const window = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });
    applyWindowSecurity(window);
    const diagnostics: PublicationDiagnostic[] = [];

    try {
      await withTimeout(
        this.rendererPagePath.startsWith('http://') ||
          this.rendererPagePath.startsWith('https://')
          ? window.loadURL(this.rendererPagePath)
          : window.loadFile(this.rendererPagePath),
        'Mermaid renderer load',
      );
      const rawOutput: unknown = await withTimeout(
        window.webContents.executeJavaScript(
          `window.__publicationRenderMermaid(${JSON.stringify(inputs)}, ${JSON.stringify(mermaidTheme(themeId))})`,
          true,
        ),
        'Mermaid diagram rendering',
      );
      if (!isMermaidOutputList(rawOutput)) {
        throw new Error('Mermaid renderer returned an invalid result.');
      }

      let renderedHtml = html;
      for (const [index, match] of matches.entries()) {
        const input = inputs[index];
        const output = rawOutput.find((item) => item.id === input?.id);
        if (!input || !output) continue;
        if (!output.svg) {
          if (isRenderingDebugEnabled) {
            appLogger.debug('[mermaid-render] SVG stage failure', {
              diagramId: input.id,
              report: JSON.stringify({
                error: output.error,
                raw: output.rawSummary,
                sanitized: output.sanitizedSummary,
                rawLayout: output.metrics,
                styledLayout: output.styledMetrics,
                sanitizedLayout: output.sanitizedMetrics,
                restoredLayout: output.restoredMetrics,
                geometry: output.geometry,
                removed: output.removed,
              }),
            });
          }
          diagnostics.push(
            diagnosticWithSourcePath(
              {
                severity:
                  output.errorCode === 'mermaid-svg-invalid'
                    ? 'error'
                    : 'warning',
                code: output.errorCode ?? 'mermaid-render-failed',
                message: `Mermaid diagram could not be rendered: ${output.error ?? 'unknown error'}`,
                feature: 'mermaid',
                details: {
                  diagramId: input.id,
                  raw: output.rawSummary,
                  rawLayout: output.metrics,
                  styledLayout: output.styledMetrics,
                  sanitizedLayout: output.sanitizedMetrics,
                  restoredLayout: output.restoredMetrics,
                  geometry: output.geometry,
                },
              },
              sourcePath,
            ),
          );
          continue;
        }
        if (
          !output.sanitizedSummary?.viewBox ||
          !hasUsableMermaidGeometry(
            output.restoredMetrics ?? output.sanitizedMetrics,
          ) ||
          !hasPreservedMermaidGeometry(output)
        ) {
          diagnostics.push(
            diagnosticWithSourcePath(
              {
                severity: 'error',
                code: 'mermaid-svg-invalid',
                message:
                  'The Mermaid SVG has invalid or unpreserved geometry after sanitization.',
                feature: 'mermaid',
                details: {
                  diagramId: input.id,
                  raw: output.rawSummary,
                  rawLayout: output.metrics,
                  styledLayout: output.styledMetrics,
                  sanitizedLayout: output.sanitizedMetrics,
                  restoredLayout: output.restoredMetrics,
                  geometry: output.geometry,
                },
              },
              sourcePath,
            ),
          );
          continue;
        }
        if (isRenderingDebugEnabled) {
          appLogger.debug('[mermaid-render] SVG stage summary', {
            diagramId: input.id,
            report: JSON.stringify({
              raw: output.rawSummary,
              sanitized: output.sanitizedSummary,
              rawLayout: output.metrics,
              styledLayout: output.styledMetrics,
              sanitizedLayout: output.sanitizedMetrics,
              restoredLayout: output.restoredMetrics,
              geometry: output.geometry,
              removed: output.removed,
            }),
          });
        }
        const wrappedSvg = `<figure class="mermaid-container" data-mermaid-id="${escapeAttribute(input.id)}">${output.svg}</figure>`;
        renderedHtml = renderedHtml.replace(match[0], wrappedSvg);
      }
      return { html: renderedHtml, diagnostics };
    } catch (error) {
      diagnostics.push(
        diagnosticWithSourcePath(
          {
            severity: 'error',
            code: 'mermaid-renderer-unavailable',
            message: 'The isolated Mermaid renderer could not be started.',
            feature: 'mermaid',
            details: {
              reason: error instanceof Error ? error.message : String(error),
            },
          },
          sourcePath,
        ),
      );
      return { html, diagnostics };
    } finally {
      if (!window.isDestroyed()) window.destroy();
    }
  }
}
