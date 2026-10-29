import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createMarkdownCompiler,
  renderPublicationHtml,
} from '@markdown-publication/publication-core';
import {
  getBuiltInTheme,
  ThemeIdSchema,
  PageSizeIdSchema,
} from '@markdown-publication/shared';
import { inlineLocalAssets } from './theme-assets.js';

const outputPath = process.env.MPS_PAGED_FIXTURE_PATH;

describe.runIf(Boolean(outputPath))(
  'actual publication pagination fixture',
  () => {
    it('builds a real compiled sample with embedded theme and math assets', async () => {
      if (!outputPath) throw new Error('Missing fixture output path.');
      const root = resolve('themes');
      const themeId = ThemeIdSchema.parse(
        process.env.MPS_PAGED_THEME ?? 'claude',
      );
      const pageSize = PageSizeIdSchema.parse(
        process.env.MPS_PAGED_PAGE_SIZE ?? 'A4',
      );
      const themeFiles: Record<string, string[]> = {
        rose: ['github.css', 'rose.css'],
        'github-markdown': ['github.css'],
        'modern-serif': ['modern-serif.css'],
        claude: ['modern-serif.css', 'claude.css'],
        'academic-paper': [
          'modern-serif.css',
          'publication-presets.css',
          'font-eb-garamond.css',
        ],
        'classic-book': [
          'modern-serif.css',
          'publication-presets.css',
          'font-eb-garamond.css',
        ],
        'minimal-print': [
          'github.css',
          'publication-presets.css',
          'font-ibm-plex-sans.css',
        ],
        notebook: [
          'github.css',
          'publication-presets.css',
          'font-ibm-plex-sans.css',
        ],
        'solarized-light': [
          'github.css',
          'palette-presets.css',
          'font-ibm-plex-sans.css',
        ],
        'nordic-light': [
          'github.css',
          'palette-presets.css',
          'font-ibm-plex-sans.css',
        ],
      };
      const theme = getBuiltInTheme(themeId);
      const stylesheets = await Promise.all(
        themeFiles[themeId]!.map(async (name) => {
          const path = resolve(root, 'css', name);
          return inlineLocalAssets(await readFile(path, 'utf8'), path, root);
        }),
      );
      const compiler = await createMarkdownCompiler();
      const sourcePath = resolve('examples/sample-book/sample.md');
      const original = await readFile(sourcePath, 'utf8');
      const prose = Array.from(
        { length: 20 },
        (_, index) =>
          `Paragraph ${index}: ${'\u4e2d\u6587\u6392\u7248 mixed English publication content. '.repeat(4)}`,
      ).join('\n\n');
      const rows = Array.from(
        { length: 85 },
        (_, index) => `| Row ${index} | Example content |`,
      ).join('\n');
      const code = Array.from(
        { length: 110 },
        (_, index) => `const line${index} = ${index};`,
      ).join('\n');
      const longContents =
        process.env.MPS_PAGED_LONG_TOC === '1'
          ? Array.from(
              { length: 40 },
              (_, index) =>
                `## Additional section ${index + 1}\n\nSection content ${index + 1}.`,
            ).join('\n\n')
          : '';
      const content = [
        original,
        longContents,
        prose,
        '\\clearpage',
        '## After break',
        `| Column | Value |\n| ------ | ----- |\n${rows}`,
        `\`\`\`typescript\n${code}\n\`\`\``,
        'END-OF-DOCUMENT',
      ].join('\n\n');
      const chapter = await compiler.compile(
        { path: sourcePath, content },
        {
          projectRoot: resolve('examples/sample-book'),
          features: { mermaid: { enabled: true }, codeTheme: theme.codeTheme },
        },
      );
      const publication = renderPublicationHtml([chapter], {
        title: chapter.title,
        themeId,
        pageSize,
        pageCanvasMode: theme.pageCanvasMode,
        stylesheet: stylesheets.join('\n'),
        toc: { preset: 'classic-book', entries: chapter.tocEntries },
      });
      expect(publication.diagnostics).toEqual([]);
      expect(publication.html).toContain('class="katex');
      expect(publication.html).toContain('class="shiki');
      expect(publication.html).toContain('data:image/svg+xml;base64,');
      expect(publication.html).toContain('data-toc="true"');
      expect(publication.html).toContain('class="mermaid-placeholder"');
      await writeFile(outputPath, publication.html);
    }, 60000);
  },
);
