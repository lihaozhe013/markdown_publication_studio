import { readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  compileMarkdownFile,
  createMarkdownCompiler,
  renderPublicationHtml,
} from '@markdown-publication/publication-core';
import type { ExportResult, PreviewResult } from '@markdown-publication/shared';
import type { PrintBackend } from './electron-print-backend.js';

export class PublicationService {
  private readonly compilerPromise = createMarkdownCompiler();

  constructor(private readonly printBackend: PrintBackend) {}

  async buildPreview(sourcePath: string): Promise<PreviewResult> {
    const compiler = await this.compilerPromise;
    const chapter = await compileMarkdownFile(compiler, sourcePath);
    const rendered = renderPublicationHtml([chapter], { title: chapter.title });
    return {
      title: chapter.title,
      html: rendered.html,
      diagnostics: rendered.diagnostics,
    };
  }

  async exportPdf(
    sourcePath: string,
    outputPath: string,
  ): Promise<ExportResult> {
    const preview = await this.buildPreview(sourcePath);
    const pdf = await this.printBackend.render(preview.html);
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
  ): Promise<ExportResult> {
    const preview = await this.buildPreview(sourcePath);
    const temporaryPath = resolve(
      dirname(outputPath),
      `.${randomUUID()}${extname(outputPath) || '.html'}`,
    );
    await writeFile(temporaryPath, preview.html, 'utf8');
    await rename(temporaryPath, outputPath);
    return { outputPath, diagnostics: preview.diagnostics };
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
