import { readFile, rename, writeFile } from 'node:fs/promises';
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
  PageNumberSettings,
  PageSizeId,
  PreviewResult,
  PublicationStyleOverrides,
  TocSettings,
  ThemeId,
} from '@markdown-publication/shared';
import {
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
import { loadThemeStylesheet } from './theme-service.js';
import { appLogger, isRenderingDebugEnabled } from './app-logger.js';
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
    private readonly pdfAssembler: PdfAssembler,
  ) {}

  async buildPreview(
    sourcePath: string,
    themeId: ThemeId,
    pageSize: PageSizeId = DEFAULT_PAGE_SIZE,
    styleOverrides: PublicationStyleOverrides = DEFAULT_PUBLICATION_STYLE_OVERRIDES,
    tocSettings: TocSettings = DEFAULT_TOC_SETTINGS,
  ): Promise<PreviewResult> {
    return this.buildPublication(
      sourcePath,
      themeId,
      pageSize,
      styleOverrides,
      tocSettings,
    );
  }

  private async buildPublication(
    sourcePath: string,
    themeId: ThemeId,
    pageSize: PageSizeId,
    styleOverrides: PublicationStyleOverrides,
    tocSettings: TocSettings,
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
    const theme = getBuiltInTheme(themeId);
    const tocEntries = tocSettings.enabled ? chapter.tocEntries : [];
    const tocOptions =
      tocEntries.length > 0
        ? {
            preset: tocSettings.preset,
            entries: tocEntries,
          }
        : undefined;
    const rendered = renderPublicationHtml([chapter], {
      title: chapter.title,
      themeId,
      pageSize,
      pageCanvasMode: theme.pageCanvasMode,
      features: {
        codeTheme: 'github-dark',
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
    return {
      title: chapter.title,
      html: mermaid.html,
      diagnostics,
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
  ): Promise<ExportResult> {
    const publication = await this.buildPublication(
      sourcePath,
      themeId,
      pageSize,
      styleOverrides,
      tocSettings,
    );
    this.throwOnFatalDiagnostics(publication.diagnostics);
    const printedPdf = await this.printBackend.render(publication.html);
    if (pageNumber.enabled) {
      appLogger.info('[page-number] Applying PDF page-number settings', {
        fontFamily: pageNumber.fontFamily,
        fontSizePt: pageNumber.fontSizePt,
        style: pageNumber.style,
        firstPageMode: pageNumber.firstPageMode,
      });
    }
    const numberedBodyPdf = await this.pageNumberPdfService.apply(
      printedPdf,
      pageNumber,
    );
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
    const temporaryPath = resolve(
      dirname(outputPath),
      `.${randomUUID()}${extname(outputPath) || '.pdf'}`,
    );
    await writeFile(temporaryPath, pdf);
    await rename(temporaryPath, outputPath);
    return { outputPath, diagnostics: publication.diagnostics };
  }

  async exportHtml(
    sourcePath: string,
    outputPath: string,
    themeId: ThemeId,
    pageSize: PageSizeId,
    styleOverrides: PublicationStyleOverrides = DEFAULT_PUBLICATION_STYLE_OVERRIDES,
  ): Promise<ExportResult> {
    const preview = await this.buildPreview(
      sourcePath,
      themeId,
      pageSize,
      styleOverrides,
      DEFAULT_TOC_SETTINGS,
    );
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
