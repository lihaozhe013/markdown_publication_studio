import { readFile } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';

/** Application-owned scheme that serves built-in theme assets to the preview. */
export const THEME_ASSET_SCHEME = 'mps-asset';

/**
 * `inline` embeds every asset as a data URL for self-contained exports.
 * `asset-url` keeps references so the preview can stream and cache font files.
 */
export type ThemeAssetMode = 'inline' | 'asset-url';

export type ThemeAssetCache = Map<string, Promise<string>>;

const themeAssetMimeTypes: Record<string, string> = {
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.otf': 'font/otf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const assetPattern = /url\(\s*(?:"([^"]+)"|'([^']+)'|([^\s)]+))\s*\)/gu;

const fontFacePattern = /@font-face\s*\{[^}]*\}/gu;

export function themeAssetMimeType(assetPath: string): string | undefined {
  return themeAssetMimeTypes[extname(assetPath).toLowerCase()];
}

export function isWithinRoot(candidate: string, root: string): boolean {
  const relativePath = relative(root, candidate);
  return (
    relativePath === '' ||
    (!relativePath.startsWith('..') && !isAbsolute(relativePath))
  );
}

function isExternalUrl(value: string): boolean {
  return /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value);
}

/** Build the URL the preview protocol serves for a theme asset. */
export function themeAssetUrl(assetPath: string, root: string): string {
  const encodedPath = relative(root, assetPath)
    .split(sep)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${THEME_ASSET_SCHEME}://theme/${encodedPath}`;
}

/**
 * Normalized font declaration used to drop repeated `@font-face` blocks.
 * Themes compose several stylesheets, and the same bundled CJK face is often
 * declared by more than one of them.
 */
function fontFaceSignature(block: string): string {
  return block
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/\s+/gu, ' ')
    .replace(/font-weight:\s*normal\b/giu, 'font-weight: 400')
    .replace(/font-weight:\s*bold\b/giu, 'font-weight: 700')
    .trim();
}

/** Remove `@font-face` blocks that repeat an earlier declaration. */
export function dedupeFontFaces(css: string): string {
  const seen = new Set<string>();
  return css.replace(fontFacePattern, (block) => {
    const signature = fontFaceSignature(block);
    if (seen.has(signature)) return '';
    seen.add(signature);
    return block;
  });
}

/**
 * Rewrite local `url()` references in theme CSS. Remote references stay
 * rejected and every resolved file must stay inside the built-in theme root.
 */
export async function rewriteLocalAssets(
  css: string,
  cssPath: string,
  root: string,
  mode: ThemeAssetMode = 'inline',
  cache: ThemeAssetCache = new Map(),
): Promise<string> {
  const replacements: Array<{
    start: number;
    end: number;
    assetPath: string;
    mimeType: string;
  }> = [];

  for (const match of css.matchAll(assetPattern)) {
    const reference = match[1] ?? match[2] ?? match[3];
    if (
      !reference ||
      match.index === undefined ||
      reference.startsWith('data:') ||
      reference.startsWith('#')
    ) {
      continue;
    }
    if (isExternalUrl(reference)) {
      throw new Error(`Remote theme assets are not allowed: ${reference}`);
    }

    const assetPath = resolve(cssPath, '..', reference);
    if (!isWithinRoot(assetPath, root)) {
      throw new Error(
        `Theme asset escapes the built-in theme directory: ${reference}`,
      );
    }

    const mimeType = themeAssetMimeType(assetPath);
    if (!mimeType) continue;

    replacements.push({
      start: match.index,
      end: match.index + match[0].length,
      assetPath,
      mimeType,
    });
  }

  if (replacements.length === 0) return css;

  const values = new Map<string, string>();
  if (mode === 'asset-url') {
    for (const { assetPath } of replacements) {
      values.set(assetPath, themeAssetUrl(assetPath, root));
    }
  } else {
    const pending = new Map<string, Promise<string>>();
    for (const { assetPath, mimeType } of replacements) {
      if (values.has(assetPath) || pending.has(assetPath)) continue;
      const cached = cache.get(assetPath);
      if (cached) {
        pending.set(assetPath, cached);
        continue;
      }
      const loading = readFile(assetPath).then(
        (data) => `data:${mimeType};base64,${data.toString('base64')}`,
      );
      cache.set(assetPath, loading);
      pending.set(assetPath, loading);
    }
    const resolvedValues = await Promise.all(
      [...pending].map(async ([assetPath, loading]) => {
        const value = await loading;
        return [assetPath, value] as const;
      }),
    );
    for (const [assetPath, value] of resolvedValues) {
      values.set(assetPath, value);
    }
  }

  let result = '';
  let cursor = 0;
  for (const { start, end, assetPath } of replacements) {
    const value = values.get(assetPath);
    if (value === undefined) continue;
    result += `${css.slice(cursor, start)}url("${value}")`;
    cursor = end;
  }
  return result + css.slice(cursor);
}

/** Embed every local theme asset as a data URL. */
export function inlineLocalAssets(
  css: string,
  cssPath: string,
  root: string,
): Promise<string> {
  return rewriteLocalAssets(css, cssPath, root, 'inline');
}
