import { protocol } from 'electron';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  THEME_ASSET_SCHEME,
  isWithinRoot,
  themeAssetMimeType,
} from './theme-assets.js';
import { themeRoot } from './theme-service.js';

export interface ThemeAssetResolution {
  path: string;
  mimeType: string;
}

/**
 * Resolve a `mps-asset://theme/...` request into a file inside the built-in
 * theme directory. Kept pure so containment can be tested without Electron.
 */
export function resolveThemeAssetRequest(
  requestUrl: string,
  root: string = themeRoot(),
): ThemeAssetResolution | undefined {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return undefined;
  }
  if (url.protocol !== `${THEME_ASSET_SCHEME}:`) return undefined;
  if (url.hostname !== 'theme') return undefined;
  const relativePath = decodeURIComponent(url.pathname).replace(/^\/+/u, '');
  if (!relativePath) return undefined;
  const assetPath = resolve(root, relativePath);
  if (!isWithinRoot(assetPath, root)) return undefined;
  const mimeType = themeAssetMimeType(assetPath);
  if (!mimeType) return undefined;
  return { path: assetPath, mimeType };
}

/**
 * Register the preview asset scheme. Must run before the application is ready;
 * the scheme is standard and secure so `@font-face` sources can be CORS-fetched
 * from both the preview iframe and the isolated layout window.
 */
let schemePrivileged = false;

/**
 * Register the preview asset scheme. Must run before the application is ready;
 * the scheme is standard and secure so `@font-face` sources can be CORS-fetched
 * from both the preview iframe and the isolated layout window.
 *
 * Embedding hosts that import the main bundle after `ready` cannot declare
 * privileges any more. They fall back to inline assets instead of failing.
 */
export function registerThemeAssetScheme(): void {
  if (schemePrivileged) return;
  try {
    protocol.registerSchemesAsPrivileged([
      {
        scheme: THEME_ASSET_SCHEME,
        privileges: {
          standard: true,
          secure: true,
          supportFetchAPI: true,
          corsEnabled: true,
        },
      },
    ]);
    schemePrivileged = true;
  } catch {
    schemePrivileged = false;
  }
}

/** Whether preview artifacts may reference theme assets by URL. */
export function isThemeAssetSchemeAvailable(): boolean {
  return schemePrivileged;
}

let handlerRegistered = false;

export function registerThemeAssetProtocol(): void {
  if (handlerRegistered || !schemePrivileged) return;
  handlerRegistered = true;
  protocol.handle(THEME_ASSET_SCHEME, async (request) => {
    const resolution = resolveThemeAssetRequest(request.url);
    if (!resolution) {
      return new Response('Unknown theme asset.', { status: 404 });
    }
    try {
      const data = await readFile(resolution.path);
      // Fonts are always CORS-fetched, and the preview iframe has a different
      // origin than the asset scheme. The bytes stay inside the app either way.
      return new Response(new Uint8Array(data), {
        headers: {
          'content-type': resolution.mimeType,
          'access-control-allow-origin': '*',
          'cache-control': 'public, max-age=31536000, immutable',
        },
      });
    } catch {
      return new Response('Theme asset is unavailable.', { status: 404 });
    }
  });
}
