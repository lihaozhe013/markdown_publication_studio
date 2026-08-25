import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { app } from 'electron';
import type { ThemeId } from '@markdown-publication/shared';

const themeStylesheets: Record<ThemeId, readonly string[]> = {
  rose: ['github.css', 'rose.css'],
  'github-markdown': ['github.css'],
  claude: ['modern-serif.css'],
};

const fontMimeTypes: Record<string, string> = {
  '.otf': 'font/otf',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};
const stylesheetCache = new Map<ThemeId, Promise<string>>();

function themeRoot(): string {
  return resolve(app.getAppPath(), 'themes');
}

function isWithinRoot(candidate: string, root: string): boolean {
  const relativePath = relative(root, candidate);
  return (
    relativePath === '' ||
    (!relativePath.startsWith('..') && !isAbsolute(relativePath))
  );
}

function isExternalUrl(value: string): boolean {
  return /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(value);
}

async function inlineLocalAssets(
  css: string,
  cssPath: string,
): Promise<string> {
  const assetPattern = /url\(\s*(?:"([^"]+)"|'([^']+)'|([^\s)]+))\s*\)/g;
  const matches = [...css.matchAll(assetPattern)];
  const replacements = await Promise.all(
    matches.map(async (match) => {
      const reference = match[1] ?? match[2] ?? match[3];
      if (!reference || isExternalUrl(reference)) {
        return { match, replacement: undefined };
      }

      const assetPath = resolve(cssPath, '..', reference);
      if (!isWithinRoot(assetPath, themeRoot())) {
        throw new Error(
          `Theme asset escapes the built-in theme directory: ${reference}`,
        );
      }

      const extension = assetPath
        .slice(assetPath.lastIndexOf('.'))
        .toLowerCase();
      const mimeType = fontMimeTypes[extension];
      if (!mimeType) {
        return { match, replacement: undefined };
      }

      const data = await readFile(assetPath);
      return {
        match,
        replacement: `data:${mimeType};base64,${data.toString('base64')}`,
      };
    }),
  );

  let result = css;
  for (const { match, replacement } of replacements) {
    if (!replacement || match.index === undefined || !match[0]) {
      continue;
    }
    result = result.replace(match[0], `url("${replacement}")`);
  }
  return result;
}

export async function loadThemeStylesheet(themeId: ThemeId): Promise<string> {
  const cached = stylesheetCache.get(themeId);
  if (cached) {
    return cached;
  }

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
      return inlineLocalAssets(css, cssPath);
    }),
  );
  return stylesheets.join('\n');
}
