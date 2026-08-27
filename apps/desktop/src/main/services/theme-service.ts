import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { app } from 'electron';
import type {
  PublicationFontId,
  PublicationStyleOverrides,
  ThemeId,
} from '@markdown-publication/shared';
import { collectStyleOverrideFontIds } from '@markdown-publication/publication-core';
import { inlineLocalAssets } from './theme-assets.js';

const themeStylesheets: Record<ThemeId, readonly string[]> = {
  rose: ['github.css', 'rose.css'],
  'github-markdown': ['github.css'],
  'modern-serif': ['modern-serif.css'],
  claude: ['modern-serif.css', 'claude.css'],
};

const stylesheetCache = new Map<ThemeId, Promise<string>>();
const customFontStylesheetCache = new Map<string, Promise<string>>();

interface FontFaceDefinition {
  familyName: string;
  relativePath: string;
  weight: string;
  style: 'normal' | 'italic';
}

const customFontFaces: Record<
  PublicationFontId,
  readonly FontFaceDefinition[]
> = {
  inter: [
    {
      familyName: 'Inter',
      relativePath: '../fonts/Inter/static/Inter_18pt-Regular.ttf',
      weight: '400',
      style: 'normal',
    },
    {
      familyName: 'Inter',
      relativePath: '../fonts/Inter/static/Inter_18pt-Bold.ttf',
      weight: '700',
      style: 'normal',
    },
    {
      familyName: 'Inter',
      relativePath: '../fonts/Inter/static/Inter_18pt-Italic.ttf',
      weight: '400',
      style: 'italic',
    },
  ],
  'open-sans': [
    {
      familyName: 'Open Sans',
      relativePath: '../fonts/Open_Sans/static/OpenSans-Regular.ttf',
      weight: '400',
      style: 'normal',
    },
    {
      familyName: 'Open Sans',
      relativePath: '../fonts/Open_Sans/static/OpenSans-Bold.ttf',
      weight: '700',
      style: 'normal',
    },
    {
      familyName: 'Open Sans',
      relativePath: '../fonts/Open_Sans/static/OpenSans-Italic.ttf',
      weight: '400',
      style: 'italic',
    },
  ],
  'source-han-sans': [
    {
      familyName: 'Source Han Sans SC',
      relativePath: '../fonts/SourceHanSansSC-VF.ttf',
      weight: '250 900',
      style: 'normal',
    },
  ],
  'jetbrains-mono': [
    {
      familyName: 'JetBrains Mono',
      relativePath: '../fonts/JetBrains_Mono/static/JetBrainsMono-Regular.ttf',
      weight: '400',
      style: 'normal',
    },
    {
      familyName: 'JetBrains Mono',
      relativePath: '../fonts/JetBrains_Mono/static/JetBrainsMono-Bold.ttf',
      weight: '700',
      style: 'normal',
    },
    {
      familyName: 'JetBrains Mono',
      relativePath: '../fonts/JetBrains_Mono/static/JetBrainsMono-Italic.ttf',
      weight: '400',
      style: 'italic',
    },
  ],
  'source-sans-3': [
    {
      familyName: 'Source Sans 3',
      relativePath: '../fonts/SourceSans3-VariableFont_wght.ttf',
      weight: '200 900',
      style: 'normal',
    },
    {
      familyName: 'Source Sans 3',
      relativePath: '../fonts/SourceSans3-Italic-VariableFont_wght.ttf',
      weight: '200 900',
      style: 'italic',
    },
  ],
  'source-serif-4': [
    {
      familyName: 'Source Serif 4',
      relativePath: '../fonts/SourceSerif4-VariableFont_opsz,wght.ttf',
      weight: '200 900',
      style: 'normal',
    },
    {
      familyName: 'Source Serif 4',
      relativePath: '../fonts/SourceSerif4-Italic-VariableFont_opsz,wght.ttf',
      weight: '200 900',
      style: 'italic',
    },
  ],
  'source-han-serif': [
    {
      familyName: 'Source Han Serif SC',
      relativePath: '../fonts/SourceHanSerifSC-VF.ttf',
      weight: '250 900',
      style: 'normal',
    },
  ],
};

function themeRoot(): string {
  return resolve(app.getAppPath(), 'themes');
}

export async function loadThemeStylesheet(
  themeId: ThemeId,
  styleOverrides?: PublicationStyleOverrides,
): Promise<string> {
  const cached = stylesheetCache.get(themeId);
  const baseStylesheet = cached ?? loadAndCacheThemeStylesheet(themeId);
  const fontIds = collectStyleOverrideFontIds(styleOverrides);
  if (fontIds.length === 0) return baseStylesheet;

  const customFonts = await loadCustomFontStylesheet(fontIds);
  return `${await baseStylesheet}\n${customFonts}`;
}

function loadAndCacheThemeStylesheet(themeId: ThemeId): Promise<string> {
  const loading = loadThemeStylesheetUncached(themeId);
  stylesheetCache.set(themeId, loading);
  loading.catch(() => {
    stylesheetCache.delete(themeId);
  });
  return loading;
}

async function loadThemeStylesheetUncached(themeId: ThemeId): Promise<string> {
  const root = themeRoot();
  const cssDirectory = resolve(root, 'css');
  const files = themeStylesheets[themeId];
  const stylesheets = await Promise.all(
    files.map(async (fileName) => {
      const cssPath = resolve(cssDirectory, fileName);
      const css = await readFile(cssPath, 'utf8');
      return inlineLocalAssets(css, cssPath, root);
    }),
  );
  return stylesheets.join('\n');
}

async function loadCustomFontStylesheet(
  fontIds: readonly PublicationFontId[],
): Promise<string> {
  const key = [...fontIds].sort().join(',');
  const cached = customFontStylesheetCache.get(key);
  if (cached) return cached;

  const loading = loadCustomFontStylesheetUncached(fontIds);
  customFontStylesheetCache.set(key, loading);
  loading.catch(() => {
    customFontStylesheetCache.delete(key);
  });
  return loading;
}

async function loadCustomFontStylesheetUncached(
  fontIds: readonly PublicationFontId[],
): Promise<string> {
  const root = themeRoot();
  const cssPath = resolve(root, 'css/custom-fonts.css');
  const css = fontIds
    .flatMap((fontId) => customFontFaces[fontId])
    .map(
      ({ familyName, relativePath, weight, style }) => `
@font-face {
  font-family: '${familyName}';
  src: url('${relativePath}') format('truetype');
  font-weight: ${weight};
  font-style: ${style};
  font-display: swap;
}`,
    )
    .join('\n');
  return inlineLocalAssets(css, cssPath, root);
}
