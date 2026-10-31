import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { renderPublicationHtml } from './html.js';
import { createMarkdownCompiler } from './markdown.js';

const execute = promisify(execFile);
const requireDesktop = createRequire(resolve('apps/desktop/package.json'));
const { PDFDocument } = requireDesktop('pdf-lib') as {
  PDFDocument: { load(bytes: Uint8Array): Promise<{ getPageCount(): number }> };
};
const runElectronTests = process.env.MPS_RUN_ELECTRON_PRINT_TESTS === '1';

describe.runIf(runElectronTests)(
  'page-ending directives in Chromium PDF',
  () => {
    it('prints the following content on a new page without accidental blank sheets', async () => {
      const directory = await mkdtemp(join(tmpdir(), 'mps-clearpage-test-'));
      try {
        const compiler = await createMarkdownCompiler();
        const chapter = await compiler.compile(
          {
            path: join(directory, 'source.md'),
            content: [
              '\\clearpage',
              '',
              '# First page',
              '',
              'First page content.',
              '',
              '\\clearpage',
              '\\clearpage',
              '',
              '# Second page',
              '',
              'Second page content.',
              '',
              '\\clearpage',
            ].join('\n'),
          },
          { projectRoot: directory },
        );
        const html = renderPublicationHtml([chapter], {
          title: 'Page breaks',
        }).html;
        const inputPath = join(directory, 'fixture.html');
        const outputPath = join(directory, 'fixture.pdf');
        await writeFile(inputPath, html);
        await execute(
          resolve('node_modules/.bin/electron'),
          [
            resolve('scripts/print-publication-fixture.cjs'),
            inputPath,
            outputPath,
          ],
          { timeout: 30000 },
        );
        const pdf = await PDFDocument.load(await readFile(outputPath));
        expect(pdf.getPageCount()).toBe(2);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }, 60000);
  },
);
