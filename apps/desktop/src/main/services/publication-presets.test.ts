import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUILT_IN_THEMES, ThemeIdSchema } from '@markdown-publication/shared';
import { inlineLocalAssets } from './theme-assets.js';

describe('publication presets', () => {
  it.each([
    ['font-eb-garamond.css', 'EB Garamond', 'Source Han Serif SC'],
    ['font-ibm-plex-sans.css', 'IBM Plex Sans', 'Source Han Sans SC'],
  ])(
    'embeds the normal and italic faces in %s',
    async (file, family, fallback) => {
      const root = resolve(process.cwd(), 'themes');
      const path = resolve(root, 'css', file);
      const css = await readFile(path, 'utf8');
      const inlined = await inlineLocalAssets(css, path, root);
      expect(inlined.match(/data:font\/ttf;base64,/gu)).toHaveLength(2);
      expect(inlined).not.toContain('../fonts/');
      expect(inlined).toContain(`'${family}'`);
      expect(inlined).toContain(`'${fallback}'`);
      expect(inlined).toContain('font-style: italic');
      expect(inlined).toContain('.markdown-body:where(');
    },
  );
  it('registers each preset and provides an explicit light canvas', async () => {
    const css = await readFile(
      resolve(process.cwd(), 'themes/css/publication-presets.css'),
      'utf8',
    );
    for (const id of [
      'academic-paper',
      'classic-book',
      'minimal-print',
      'notebook',
    ]) {
      expect(ThemeIdSchema.parse(id)).toBe(id);
      expect(BUILT_IN_THEMES.some((theme) => theme.id === id)).toBe(true);
      expect(css).toContain(`[data-theme='${id}']`);
    }
    expect(css).toContain('color-scheme: light');
  });

  it('registers palette presets with an explicit light color scheme', async () => {
    const css = await readFile(
      resolve(process.cwd(), 'themes/css/palette-presets.css'),
      'utf8',
    );
    for (const id of ['solarized-light', 'nordic-light']) {
      expect(ThemeIdSchema.parse(id)).toBe(id);
      expect(BUILT_IN_THEMES.some((theme) => theme.id === id)).toBe(true);
      expect(css).toContain(`[data-theme='${id}']`);
    }
    expect(css).toContain('color-scheme: light');
  });
});
