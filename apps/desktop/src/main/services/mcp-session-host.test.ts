import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_PAGE_NUMBER_SETTINGS,
  DEFAULT_PUBLICATION_STYLE_OVERRIDES,
  DEFAULT_TOC_SETTINGS,
} from '@markdown-publication/shared';
import {
  McpSessionStateSchema,
  type McpRendererSnapshot,
} from '@markdown-publication/shared/mcp';
import type { AppSettingsService } from './app-settings-service.js';
import { McpSessionHost } from './mcp-session-host.js';

vi.mock('electron', () => ({ app: {} }));
vi.mock('./app-logger.js', () => ({
  appLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function createHost() {
  return new McpSessionHost({
    appSettings: {} as AppSettingsService,
    getWindow: () => undefined,
    registerSource: vi.fn(),
    revokeSource: vi.fn(),
    approveCover: vi.fn(),
    registerCover: vi.fn(),
    resolveCoverPath: (id) => `/covers/${id}.pdf`,
  });
}

function createSnapshot(): McpRendererSnapshot {
  return {
    source: null,
    settings: {
      themeId: 'rose',
      pageSize: 'A4',
      toc: DEFAULT_TOC_SETTINGS,
      pageNumber: DEFAULT_PAGE_NUMBER_SETTINGS,
      styleOverrides: { version: 1, body: { fontSizePt: 14 } },
      savedStyle: DEFAULT_PUBLICATION_STYLE_OVERRIDES,
      covers: { front: null, back: null },
    },
    styleDirty: true,
    diagnostics: [],
    preview: { status: 'empty', revision: null },
    view: { zoom: 1, scrollY: 0, previewRect: null },
  };
}

describe('McpSessionHost renderer snapshots', () => {
  it('publishes effective settings without renderer-only saved style', async () => {
    const host = createHost();
    const snapshot = createSnapshot();

    expect(() => host.reportSnapshot(snapshot)).not.toThrow();
    const state = McpSessionStateSchema.parse(
      await host.invoke('session_get_state', { sessionId: host.sessionId }),
    );

    expect(state.settings.styleOverrides).toEqual(
      snapshot.settings.styleOverrides,
    );
    expect(state.settings).not.toHaveProperty('savedStyle');
    expect(state.styleDirty).toBe(true);
    expect(state.revision).toBe(0);

    host.reportSnapshot({
      ...snapshot,
      settings: { ...snapshot.settings, themeId: 'claude' },
    });
    const updated = await host.invoke('session_get_state', {
      sessionId: host.sessionId,
    });
    expect(updated.revision).toBe(1);
    expect(updated.settings).toMatchObject({ themeId: 'claude' });
  });

  it('ignores malformed snapshots and replies without losing the current state', async () => {
    const host = createHost();
    host.reportSnapshot(createSnapshot());
    const before = await host.invoke('session_get_state', {
      sessionId: host.sessionId,
    });

    expect(() => host.reportSnapshot({ settings: {} })).not.toThrow();
    await expect(
      host.completeCommand({ requestId: 42 }),
    ).resolves.toBeUndefined();
    await expect(
      host.invoke('session_get_state', { sessionId: host.sessionId }),
    ).resolves.toEqual(before);
  });
});
