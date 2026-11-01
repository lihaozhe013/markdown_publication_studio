import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import {
  dedupeFontFaces,
  inlineLocalAssets,
  rewriteLocalAssets,
} from './theme-assets.js';

let fixtureRoot: string | undefined;

afterEach(async () => {
  if (fixtureRoot) {
    await rm(fixtureRoot, { recursive: true, force: true });
    fixtureRoot = undefined;
  }
});

async function createThemeFixture(): Promise<{
  cssPath: string;
  root: string;
}> {
  fixtureRoot = await mkdtemp(join(tmpdir(), 'markdown-theme-assets-'));
  const cssDirectory = join(fixtureRoot, 'css');
  await mkdir(join(fixtureRoot, 'fonts'), { recursive: true });
  await mkdir(join(fixtureRoot, 'images'), { recursive: true });
  const cssPath = join(cssDirectory, 'theme.css');
  await mkdir(cssDirectory, { recursive: true });
  await writeFile(join(fixtureRoot, 'fonts', 'test.ttf'), 'font');
  await writeFile(join(fixtureRoot, 'images', 'paper.svg'), '<svg />');
  return { cssPath, root: fixtureRoot };
}

describe('Theme asset inlining', () => {
  it('inlines local fonts and image assets as data URLs', async () => {
    const { cssPath, root } = await createThemeFixture();
    const stylesheet = await inlineLocalAssets(
      ':root { font: url("../fonts/test.ttf"); background: url(../images/paper.svg); }',
      cssPath,
      root,
    );

    expect(stylesheet).toContain('data:font/ttf;base64,Zm9udA==');
    expect(stylesheet).toContain(
      `data:image/svg+xml;base64,${Buffer.from('<svg />').toString('base64')}`,
    );
    expect(await readFile(join(root, 'images', 'paper.svg'), 'utf8')).toBe(
      '<svg />',
    );
  });

  it('rejects remote and out-of-root assets', async () => {
    const { cssPath, root } = await createThemeFixture();

    await expect(
      inlineLocalAssets(
        '.page { background: url("https://example.com/paper.png"); }',
        cssPath,
        root,
      ),
    ).rejects.toThrow('Remote theme assets are not allowed');

    await expect(
      inlineLocalAssets(
        '.page { background: url("../../outside.png"); }',
        cssPath,
        root,
      ),
    ).rejects.toThrow('escapes the built-in theme directory');
  });

  it('keeps theme assets as URLs for the preview profile', async () => {
    const { cssPath, root } = await createThemeFixture();
    const stylesheet = await rewriteLocalAssets(
      ':root { font: url("../fonts/test.ttf"); background: url(../images/paper.svg); }',
      cssPath,
      root,
      'asset-url',
    );

    expect(stylesheet).toContain('url("mps-asset://theme/fonts/test.ttf")');
    expect(stylesheet).toContain('url("mps-asset://theme/images/paper.svg")');
    expect(stylesheet).not.toContain('base64');
  });

  it('drops repeated font declarations from composed stylesheets', () => {
    const css = [
      "@font-face { font-family: 'Inter'; src: url('../fonts/inter.ttf'); font-weight: normal; }",
      "@font-face { font-family: 'Inter'; src: url('../fonts/inter.ttf'); font-weight: 400; }",
      "@font-face { font-family: 'Inter'; src: url('../fonts/inter-bold.ttf'); font-weight: bold; }",
      '.body { color: red; }',
    ].join('\n');

    const deduped = dedupeFontFaces(css);

    expect(deduped.match(/@font-face/gu)).toHaveLength(2);
    expect(deduped).toContain('inter-bold.ttf');
    expect(deduped).toContain('.body { color: red; }');
  });
});
