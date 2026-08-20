import { mkdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { compileMarkdownFile, createMarkdownCompiler } from './markdown.js';
import { renderPublicationHtml } from './html.js';
import { getKatexFontAssetSummary } from './math.js';
import {
  katexFontAssetSummary,
  removedSvgStructure,
  summarizeSvgMarkup,
} from './render-debug.js';
import { sanitizePublicationHtml } from './sanitizer.js';

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
    expect(publication.html).toContain('.code-block.shiki code');
    expect(publication.diagnostics).toEqual([]);
  });

  it('embeds an absolute image path outside the Markdown project root', async () => {
    const projectRoot = join(
      tmpdir(),
      `markdown-publication-project-${Date.now()}`,
    );
    const assetRoot = join(
      tmpdir(),
      `markdown-publication-assets-${Date.now()}`,
    );
    await mkdir(projectRoot, { recursive: true });
    await mkdir(assetRoot, { recursive: true });
    const sourcePath = join(projectRoot, 'sample.md');
    const imagePath = join(assetRoot, 'absolute.svg');
    await writeFile(
      imagePath,
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>',
    );
    const markdownImagePath =
      process.platform === 'win32'
        ? imagePath.replaceAll('\\', '/')
        : imagePath;
    await writeFile(
      sourcePath,
      `# Sample\n\n![External](${markdownImagePath})`,
    );

    const compiler = await createMarkdownCompiler();
    const chapter = await compileMarkdownFile(compiler, sourcePath);

    expect(chapter.html).toContain('data:image/svg+xml;base64,');
    expect(chapter.html).not.toContain(markdownImagePath);
    expect(
      chapter.diagnostics.some(
        (diagnostic) => diagnostic.code === 'asset-outside-project-root',
      ),
    ).toBe(false);
    expect(chapter.diagnostics).toEqual([]);
  });

  it('decodes URL-encoded Unicode, spaces, and percent signs exactly once', async () => {
    const projectRoot = join(
      tmpdir(),
      `markdown-publication-project-${Date.now()}`,
    );
    const assetRoot = join(
      tmpdir(),
      `markdown-publication-encoded-assets-${Date.now()}`,
    );
    await mkdir(projectRoot, { recursive: true });
    await mkdir(assetRoot, { recursive: true });
    const sourcePath = join(projectRoot, 'sample.md');
    const unicodeImagePath = join(assetRoot, '绝对路径图片.svg');
    const spacedImagePath = join(assetRoot, 'absolute image.svg');
    const percentImagePath = join(assetRoot, '100%25.svg');
    const imageContents =
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>';
    await Promise.all([
      writeFile(unicodeImagePath, imageContents),
      writeFile(spacedImagePath, imageContents),
      writeFile(percentImagePath, imageContents),
    ]);
    const toMarkdownPath = (value: string): string =>
      value.replaceAll('\\', '/');
    const markdownSpacedPath = toMarkdownPath(spacedImagePath).replaceAll(
      ' ',
      '%20',
    );
    const markdownPercentPath = toMarkdownPath(percentImagePath).replaceAll(
      '%',
      '%25',
    );
    await writeFile(
      sourcePath,
      [
        `![Unicode](${toMarkdownPath(unicodeImagePath)})`,
        `![Space](${markdownSpacedPath})`,
        `![Percent](${markdownPercentPath})`,
      ].join('\n\n'),
    );

    const compiler = await createMarkdownCompiler();
    const chapter = await compileMarkdownFile(compiler, sourcePath);

    expect(
      chapter.html.match(/data:image\/svg\+xml;base64,/gu) ?? [],
    ).toHaveLength(3);
    expect(chapter.html).not.toContain('%E7');
    expect(chapter.html).not.toContain('%20');
    expect(chapter.html).not.toContain('%2525');
    expect(chapter.diagnostics).toEqual([]);
  });

  it('keeps relative images outside the project root blocked', async () => {
    const projectRoot = join(
      tmpdir(),
      `markdown-publication-project-${Date.now()}`,
    );
    const assetRoot = join(
      tmpdir(),
      `markdown-publication-outside-${Date.now()}`,
    );
    await mkdir(projectRoot, { recursive: true });
    await mkdir(assetRoot, { recursive: true });
    const sourcePath = join(projectRoot, 'sample.md');
    const imagePath = join(assetRoot, 'outside.svg');
    await writeFile(
      imagePath,
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>',
    );
    const relativeImagePath = relative(projectRoot, imagePath)
      .replaceAll('\\', '/')
      .replace('../', '%2E%2E/');
    await writeFile(sourcePath, `# Sample\n\n![Outside](${relativeImagePath})`);

    const compiler = await createMarkdownCompiler();
    const chapter = await compileMarkdownFile(compiler, sourcePath);

    expect(chapter.html).not.toContain('data:image/svg+xml;base64,');
    expect(
      chapter.diagnostics.some(
        (diagnostic) => diagnostic.code === 'asset-outside-project-root',
      ),
    ).toBe(true);
  });

  it('reports malformed URL encoding without attempting to read the image', async () => {
    const projectRoot = join(
      tmpdir(),
      `markdown-publication-project-${Date.now()}`,
    );
    await mkdir(projectRoot, { recursive: true });
    const sourcePath = join(projectRoot, 'sample.md');
    const malformedImagePath = join(projectRoot, 'invalid-%E0%A4%A.svg');
    await writeFile(
      sourcePath,
      `# Sample\n\n![Invalid](${malformedImagePath})`,
    );

    const compiler = await createMarkdownCompiler();
    const chapter = await compileMarkdownFile(compiler, sourcePath);

    expect(chapter.html).not.toContain('data:image/');
    expect(chapter.diagnostics).toEqual([
      expect.objectContaining({
        code: 'invalid-image-reference',
        feature: 'asset',
      }),
    ]);
  });

  it('reports missing absolute images with the existing diagnostic', async () => {
    const projectRoot = join(
      tmpdir(),
      `markdown-publication-project-${Date.now()}`,
    );
    await mkdir(projectRoot, { recursive: true });
    const sourcePath = join(projectRoot, 'sample.md');
    const missingImagePath = join(
      tmpdir(),
      `markdown-publication-missing-${Date.now()}.png`,
    );
    const markdownImagePath =
      process.platform === 'win32'
        ? missingImagePath.replaceAll('\\', '/')
        : missingImagePath;
    await writeFile(sourcePath, `# Sample\n\n![Missing](${markdownImagePath})`);

    const compiler = await createMarkdownCompiler();
    const chapter = await compileMarkdownFile(compiler, sourcePath);

    expect(chapter.html).not.toContain('data:image/');
    expect(chapter.diagnostics).toEqual([
      expect.objectContaining({ code: 'missing-image', feature: 'asset' }),
    ]);
  });

  it('supports broad language coverage, math, Mermaid placeholders, and safe HTML', async () => {
    const compiler = await createMarkdownCompiler();
    const chapter = await compiler.compile(
      {
        path: '/tmp/features.md',
        content: `# Features

Inline math $x^2 + y^2 = z^2$.

$$
\\frac{1}{2}x^2
$$

$$
\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}
$$

$$
\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}
$$

<details><summary>More</summary><div class="callout">Static HTML</div></details>
<script>alert('blocked')</script>
<div onclick="alert('blocked')">No event handlers</div>

~~~python
def answer() -> int:
    return 42
~~~

~~~mermaid
flowchart TD
  A[Start] --> B[Finish]
~~~

~~~not-a-real-language
plain text
~~~`,
      },
      { projectRoot: '/tmp' },
    );

    expect(chapter.html).toContain('class="shiki code-block"');
    expect(chapter.html).toContain('data-language="python"');
    expect(chapter.html).toContain('class="katex"');
    expect(chapter.html).toContain('katex-display');
    expect(chapter.html).toContain('<mtable');
    expect(chapter.html).toContain('class="math-block"');
    expect(chapter.html).toContain('class="mermaid-placeholder"');
    expect(chapter.html).toContain('<details>');
    expect(chapter.html).not.toContain('<script');
    expect(chapter.html).not.toContain('onclick');
    expect(
      chapter.diagnostics.some(
        (diagnostic) => diagnostic.code === 'unsupported-language',
      ),
    ).toBe(true);
    expect(chapter.mermaidDiagramCount).toBe(1);

    const publication = renderPublicationHtml([chapter], {
      title: 'Features',
      themeId: 'rose',
      features: {
        math: { enabled: true },
        mermaid: { enabled: true },
        html: { policy: 'safe-static' },
      },
    });
    expect(publication.html).not.toMatch(/url\(fonts\//u);
    expect(publication.html).toContain('overflow-y: visible');
    expect(publication.html).not.toContain('.math-block .katex {');
  });

  it('removes dangerous HTML while preserving the safe static subset', () => {
    const result = sanitizePublicationHtml(
      '<div class="safe">ok</div><script>alert(1)</script><iframe src="https://example.com"></iframe><a href="javascript:alert(1)">bad</a>',
    );

    expect(result.html).toContain('<div class="safe">ok</div>');
    expect(result.html).not.toContain('<script');
    expect(result.html).not.toContain('<iframe');
    expect(result.html).not.toContain('javascript:');
    expect(result.removedContent).toBe(true);
  });

  it('reports font assets and structural changes for rendering diagnostics', () => {
    const bundledFonts = getKatexFontAssetSummary();
    const fontAssets = katexFontAssetSummary(
      '@font-face { font-family: KaTeX_Main; src: url(fonts/KaTeX_Main-Regular.woff2); }',
    );
    const raw = summarizeSvgMarkup(
      '<svg viewBox="0 0 100 20"><defs><clipPath id="clip"><rect width="100" height="20" /></clipPath></defs><g clip-path="url(#clip)"><path d="M0 0" /></g></svg>',
    );
    const sanitized = summarizeSvgMarkup(
      '<svg viewBox="0 0 100 20"><defs><rect width="100" height="20" /></defs><g><path d="M0 0" /></g></svg>',
    );

    expect(bundledFonts.relativeFontUrlCount).toBe(0);
    expect(bundledFonts.dataFontUrlCount).toBe(20);
    expect(fontAssets.relativeFontUrlCount).toBe(1);
    expect(fontAssets.dataFontUrlCount).toBe(0);
    expect(removedSvgStructure(raw, sanitized)).toEqual({
      elements: 'clippath',
      attributes: 'clip-path,id',
    });
  });
});
