import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { resolveThemeAssetRequest } from './theme-asset-protocol.js';

vi.mock('electron', () => ({
  protocol: {
    handle: vi.fn(),
    registerSchemesAsPrivileged: vi.fn(),
  },
}));

describe('theme asset protocol', () => {
  const root = resolve('/app', 'themes');

  it('resolves theme asset URLs inside the theme directory', () => {
    expect(
      resolveThemeAssetRequest(
        'mps-asset://theme/fonts/SourceHanSansSC-VF.ttf',
        root,
      ),
    ).toEqual({
      path: resolve(root, 'fonts/SourceHanSansSC-VF.ttf'),
      mimeType: 'font/ttf',
    });
  });

  it('decodes percent-encoded file names', () => {
    expect(
      resolveThemeAssetRequest('mps-asset://theme/fonts/My%20Face.woff2', root),
    ).toEqual({
      path: resolve(root, 'fonts/My Face.woff2'),
      mimeType: 'font/woff2',
    });
  });

  it('rejects unknown hosts, escaped paths, and unsupported types', () => {
    expect(
      resolveThemeAssetRequest('mps-asset://other/fonts/test.ttf', root),
    ).toBeUndefined();
    expect(
      resolveThemeAssetRequest(
        'mps-asset://theme/%2e%2e%2f%2e%2e%2fetc%2fpasswd.ttf',
        root,
      ),
    ).toBeUndefined();
    expect(
      resolveThemeAssetRequest('mps-asset://theme/css/github.css', root),
    ).toBeUndefined();
    expect(resolveThemeAssetRequest('https://theme/fonts/test.ttf', root)).toBe(
      undefined,
    );
  });
});
