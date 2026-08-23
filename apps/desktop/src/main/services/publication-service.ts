import { readFile, rename, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  compileMarkdownFile,
  createMarkdownCompiler,
  getKatexFontAssetSummary,
  renderPublicationHtml,
  type PublicationPageNumberOptions,
} from '@markdown-publication/publication-core';
import type {
  ExportResult,
  PageNumberSettings,
  PreviewResult,
  ThemeId,
} from '@markdown-publication/shared';
import type { PrintBackend } from './electron-print-backend.js';
import type { MermaidRenderer } from './mermaid-renderer.js';
import { loadThemeStylesheet } from './theme-service.js';
import { appLogger, isRenderingDebugEnabled } from './app-logger.js';
import { loadPageNumberFont } from './page-number-font-service.js';
import { PageNumberPdfService } from './page-number-pdf-service.js';

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

export class PublicationService {
  private readonly compilerPromise = createMarkdownCompiler();

  constructor(
    private readonly printBackend: PrintBackend,
    private readonly mermaidRenderer: MermaidRenderer,
    private readonly pageNumberPdfService: PageNumberPdfService,
  ) {}

  async buildPreview(
    sourcePath: string,
    themeId: ThemeId,
    pageNumber: PageNumberSettings,
  ): Promise<PreviewResult> {
    if (isRenderingDebugEnabled) {
      appLogger.debug('[math-render] KaTeX stylesheet asset summary', {
        report: JSON.stringify(getKatexFontAssetSummary()),
      });
    }
    const compiler = await this.compilerPromise;
    const chapter = await compileMarkdownFile(compiler, sourcePath, {
      codeTheme: 'github-dark',
      math: { enabled: true },
      mermaid: { enabled: true },
      html: { policy: 'safe-static' },
    });
    logAssetDiagnostics(sourcePath, chapter.diagnostics);
    const pageNumberOptions = await this.loadPageNumberOptions(pageNumber);
    const rendered = renderPublicationHtml([chapter], {
      title: chapter.title,
      themeId,
      features: {
        codeTheme: 'github-dark',
        math: { enabled: true },
        mermaid: { enabled: true },
        html: { policy: 'safe-static' },
      },
      stylesheet: await loadThemeStylesheet(themeId),
      ...(pageNumberOptions ? { pageNumber: pageNumberOptions } : {}),
    });
    const mermaid = await this.mermaidRenderer.render(
      rendered.html,
      themeId,
      sourcePath,
    );
    return {
      title: chapter.title,
      html: mermaid.html,
      diagnostics: [...rendered.diagnostics, ...mermaid.diagnostics],
    };
  }

  async exportPdf(
    sourcePath: string,
    outputPath: string,
    themeId: ThemeId,
    pageNumber: PageNumberSettings,
  ): Promise<ExportResult> {
    const preview = await this.buildPreview(sourcePath, themeId, pageNumber);
    this.throwOnFatalDiagnostics(preview.diagnostics);
    const printedPdf = await this.printBackend.render(preview.html);
    const pdf = await this.pageNumberPdfService.apply(printedPdf, pageNumber);
    const temporaryPath = resolve(
      dirname(outputPath),
      `.${randomUUID()}${extname(outputPath) || '.pdf'}`,
    );
    await writeFile(temporaryPath, pdf);
    await rename(temporaryPath, outputPath);
    return { outputPath, diagnostics: preview.diagnostics };
  }

  async exportHtml(
    sourcePath: string,
    outputPath: string,
    themeId: ThemeId,
    pageNumber: PageNumberSettings,
  ): Promise<ExportResult> {
    const preview = await this.buildPreview(sourcePath, themeId, pageNumber);
    this.throwOnFatalDiagnostics(preview.diagnostics);
    const temporaryPath = resolve(
      dirname(outputPath),
      `.${randomUUID()}${extname(outputPath) || '.html'}`,
    );
    await writeFile(temporaryPath, preview.html, 'utf8');
    await rename(temporaryPath, outputPath);
    return { outputPath, diagnostics: preview.diagnostics };
  }

  private throwOnFatalDiagnostics(
    diagnostics: PreviewResult['diagnostics'],
  ): void {
    const fatal = diagnostics.find(
      (diagnostic) => diagnostic.severity === 'error',
    );
    if (fatal) {
      throw new Error(fatal.message);
    }
  }

  private async loadPageNumberOptions(
    settings: PageNumberSettings,
  ): Promise<PublicationPageNumberOptions | undefined> {
    if (!settings.enabled) return undefined;

    const font = await loadPageNumberFont(settings.fontFamily);
    appLogger.info('[page-number] Page number rendering configured', {
      fontFamily: font.familyName,
      fontEmbedding: font.allowSubsetting ? 'subset' : 'full',
      fontSizePt: settings.fontSizePt,
      style: settings.style,
      firstPageMode: settings.firstPageMode,
    });
    return {
      ...settings,
      fontFamilyName: font.familyName,
      fontFaceCss: font.fontFaceCss,
    };
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
