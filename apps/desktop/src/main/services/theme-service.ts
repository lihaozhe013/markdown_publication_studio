import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { app } from 'electron';
import type { ThemeId } from '@markdown-publication/shared';
import { inlineLocalAssets } from './theme-assets.js';

const themeStylesheets: Record<ThemeId, readonly string[]> = {
  rose: ['github.css', 'rose.css'],
  'github-markdown': ['github.css'],
  'modern-serif': ['modern-serif.css'],
  claude: ['modern-serif.css', 'claude.css'],
};

const stylesheetCache = new Map<ThemeId, Promise<string>>();

function themeRoot(): string {
  return resolve(app.getAppPath(), 'themes');
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
      return inlineLocalAssets(css, cssPath, root);
    }),
  );
  return stylesheets.join('\n');
}
