import { describe, expect, it, vi } from 'vitest';
import { loadThemeStylesheet } from './theme-service.js';

vi.mock('electron', () => ({
  app: {
    getAppPath: vi.fn(() => process.cwd()),
  },
}));

describe('theme stylesheet composition', () => {
  it('serves theme assets by URL and declares each font file once', async () => {
    const stylesheet = await loadThemeStylesheet('rose', undefined, {
      assets: 'asset-url',
    });

    expect(stylesheet).toContain(
      'url("mps-asset://theme/fonts/SourceHanSansSC-VF.ttf")',
    );
    expect(stylesheet.match(/SourceHanSansSC-VF\.ttf/gu)).toHaveLength(1);
    expect(stylesheet).not.toContain('data:font');
  });

  it('reuses the custom font declaration already present in the theme', async () => {
    const stylesheet = await loadThemeStylesheet(
      'rose',
      { version: 1, body: { fontFamily: 'source-han-sans' } },
      { assets: 'asset-url' },
    );

    expect(stylesheet.match(/SourceHanSansSC-VF\.ttf/gu)).toHaveLength(1);
  });
});
