import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { app } from 'electron';
import type {
  PublicationFontId,
  PublicationStyleOverrides,
  ThemeId,
} from '@markdown-publication/shared';
import { collectStyleOverrideFontIds } from '@markdown-publication/publication-core';
import {
  dedupeFontFaces,
  rewriteLocalAssets,
  type ThemeAssetCache,
  type ThemeAssetMode,
} from './theme-assets.js';

const themeStylesheets: Record<ThemeId, readonly string[]> = {
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
  notebook: ['github.css', 'publication-presets.css', 'font-ibm-plex-sans.css'],
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

const rawStylesheetCache = new Map<ThemeId, Promise<string>>();
const rawCustomFontStylesheetCache = new Map<string, Promise<string>>();
const stylesheetCache = new Map<string, Promise<string>>();

export interface LoadThemeStylesheetOptions {
  /**
   * `inline` produces self-contained CSS for export and printing. `asset-url`
   * keeps theme assets on the application scheme so the desktop preview never
   * ships font binaries through IPC or re-parses them on every build.
   */
  assets?: ThemeAssetMode;
}

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

export function themeRoot(): string {
  return resolve(app.getAppPath(), 'themes');
}

export function loadThemeStylesheet(
  themeId: ThemeId,
  styleOverrides?: PublicationStyleOverrides,
  options: LoadThemeStylesheetOptions = {},
): Promise<string> {
  const mode = options.assets ?? 'inline';
  const fontIds = collectStyleOverrideFontIds(styleOverrides);
  const cacheKey = `${mode}:${themeId}:${[...fontIds].sort().join(',')}`;
  const cached = stylesheetCache.get(cacheKey);
  if (cached) return cached;

  const loading = loadThemeStylesheetUncached(themeId, fontIds, mode);
  stylesheetCache.set(cacheKey, loading);
  loading.catch(() => {
    stylesheetCache.delete(cacheKey);
  });
  return loading;
}

async function loadThemeStylesheetUncached(
  themeId: ThemeId,
  fontIds: readonly PublicationFontId[],
  mode: ThemeAssetMode,
): Promise<string> {
  const [baseStylesheet, customFonts] = await Promise.all([
    loadRawThemeStylesheet(themeId),
    fontIds.length > 0 ? loadRawCustomFontStylesheet(fontIds) : '',
  ]);
  const combined = dedupeFontFaces(
    customFonts ? `${baseStylesheet}\n${customFonts}` : baseStylesheet,
  );
  const cssDirectory = resolve(themeRoot(), 'css');
  return rewriteLocalAssets(
    combined,
    resolve(cssDirectory, 'theme.css'),
    themeRoot(),
    mode,
    new Map<string, Promise<string>>() satisfies ThemeAssetCache,
  );
}

/** Read the theme stylesheets without resolving their asset references. */
function loadRawThemeStylesheet(themeId: ThemeId): Promise<string> {
  const cached = rawStylesheetCache.get(themeId);
  if (cached) return cached;
  const loading = (async () => {
    const cssDirectory = resolve(themeRoot(), 'css');
    const stylesheets = await Promise.all(
      themeStylesheets[themeId].map((fileName) =>
        readFile(resolve(cssDirectory, fileName), 'utf8'),
      ),
    );
    return stylesheets.join('\n');
  })();
  rawStylesheetCache.set(themeId, loading);
  loading.catch(() => {
    rawStylesheetCache.delete(themeId);
  });
  return loading;
}

function loadRawCustomFontStylesheet(
  fontIds: readonly PublicationFontId[],
): Promise<string> {
  const key = [...fontIds].sort().join(',');
  const cached = rawCustomFontStylesheetCache.get(key);
  if (cached) return cached;
  const loading = Promise.resolve(
    fontIds
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
      .join('\n'),
  );
  rawCustomFontStylesheetCache.set(key, loading);
  return loading;
}
