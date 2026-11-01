import { describe, expect, it, vi } from 'vitest';
import { PaginatedLayoutService } from './paginated-layout-service.js';

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => process.cwd()),
  },
  BrowserWindow: class {},
}));

describe('paginated layout bundles', () => {
  it('explains how to regenerate a missing bundle', async () => {
    const service = new PaginatedLayoutService('/missing/paged.js');

    await expect(
      service.layout({ html: '<p>Text</p>', themeId: 'rose', pageSize: 'A4' }),
    ).rejects.toThrow(
      /pagination engine bundle is missing at .*Run "pnpm build" or restart "pnpm dev"/u,
    );
  });
});
