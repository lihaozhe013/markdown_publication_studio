import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { compileMarkdownFile, createMarkdownCompiler } from './markdown.js';
import { renderPublicationHtml } from './html.js';

describe('publication core', () => {
  it('compiles Markdown with syntax highlighting and embedded local images', async () => {
    const root = join(tmpdir(), `markdown-publication-${Date.now()}`);
    await mkdir(root, { recursive: true });
    const sourcePath = join(root, 'sample.md');
    await writeFile(
      join(root, 'asset.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>',
    );
    await writeFile(
      sourcePath,
      '# Sample\n\nA paragraph.\n\n![Asset](./asset.svg)\n\n```typescript\nconst answer = 42;\n```\n\n| A | B |\n|---|---|\n| 1 | 2 |',
    );

    const compiler = await createMarkdownCompiler();
    const chapter = await compileMarkdownFile(compiler, sourcePath);
    const publication = renderPublicationHtml([chapter], {
      title: 'Sample',
      themeId: 'github-markdown',
      stylesheet: '.markdown-body { --test-theme: enabled; }',
    });

    expect(publication.html).toContain('<h1>Sample</h1>');
    expect(publication.html).toContain('data:image/svg+xml;base64,');
    expect(publication.html).toContain('class="shiki');
    expect(publication.html).toContain('<table>');
    expect(publication.html).toContain('@page { size: A4;');
    expect(publication.html).toContain('class="markdown-body"');
    expect(publication.html).toContain('--test-theme: enabled');
    expect(publication.diagnostics).toEqual([]);
  });
});
