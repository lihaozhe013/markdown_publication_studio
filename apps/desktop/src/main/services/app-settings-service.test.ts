import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from 'electron';
import {
  DEFAULT_PAGE_NUMBER_SETTINGS,
  DEFAULT_PUBLICATION_STYLE_OVERRIDES,
  type PageNumberSettings,
  type PublicationStyleOverrides,
} from '@markdown-publication/shared';
import { AppSettingsService } from './app-settings-service.js';

vi.mock('electron', () => ({
  app: { getPath: vi.fn() },
}));

let userDataDirectory: string;
let logsDirectory: string;

beforeEach(async () => {
  userDataDirectory = await mkdtemp(join(tmpdir(), 'markdown-settings-'));
  logsDirectory = join(userDataDirectory, 'logs');
  await mkdir(logsDirectory, { recursive: true });
  vi.mocked(app.getPath).mockImplementation((name) =>
    name === 'userData' ? userDataDirectory : logsDirectory,
  );
});

afterEach(async () => {
  await rm(userDataDirectory, { recursive: true, force: true });
});

const pageNumber: PageNumberSettings = {
  ...DEFAULT_PAGE_NUMBER_SETTINGS,
  enabled: true,
};

const firstStyle: PublicationStyleOverrides = {
  version: 1,
  body: { fontSizePt: 13, color: '#403630' },
};

describe('AppSettingsService custom styles', () => {
  it('migrates an existing settings file without a custom style', async () => {
    await writeFile(
      join(userDataDirectory, 'settings.json'),
      JSON.stringify({ pageNumber }),
      'utf8',
    );

    const service = new AppSettingsService();

    await expect(service.loadPageNumber()).resolves.toEqual(pageNumber);
    await expect(service.loadCustomStyle()).resolves.toEqual(
      DEFAULT_PUBLICATION_STYLE_OVERRIDES,
    );
  });

  it('replaces the single saved style and preserves page number settings', async () => {
    const service = new AppSettingsService();
    await service.savePageNumber(pageNumber);
    await service.saveCustomStyle(firstStyle);

    const replacement: PublicationStyleOverrides = {
      version: 1,
      headings: { fontWeight: 700 },
    };
    await service.saveCustomStyle(replacement);

    await expect(service.loadCustomStyle()).resolves.toEqual(replacement);
    const stored = JSON.parse(
      await readFile(join(userDataDirectory, 'settings.json'), 'utf8'),
    ) as {
      pageNumber: PageNumberSettings;
      customStyle: PublicationStyleOverrides;
    };
    expect(stored.pageNumber).toEqual(pageNumber);
    expect(stored.customStyle).toEqual(replacement);
  });

  it('serializes page number and style writes without losing either update', async () => {
    const service = new AppSettingsService();

    await Promise.all([
      service.savePageNumber(pageNumber),
      service.saveCustomStyle(firstStyle),
    ]);

    const stored = JSON.parse(
      await readFile(join(userDataDirectory, 'settings.json'), 'utf8'),
    ) as {
      pageNumber: PageNumberSettings;
      customStyle: PublicationStyleOverrides;
    };
    expect(stored.pageNumber).toEqual(pageNumber);
    expect(stored.customStyle).toEqual(firstStyle);
  });

  it('falls back only the custom style when its persisted value is invalid', async () => {
    await writeFile(
      join(userDataDirectory, 'settings.json'),
      JSON.stringify({
        pageNumber,
        customStyle: { version: 1, body: { color: 'red' } },
      }),
      'utf8',
    );

    const service = new AppSettingsService();

    await expect(service.loadPageNumber()).resolves.toEqual(pageNumber);
    await expect(service.loadCustomStyle()).resolves.toEqual(
      DEFAULT_PUBLICATION_STYLE_OVERRIDES,
    );
  });
});

describe('AppSettingsService UI preferences', () => {
  it('loads defaults from older files and preserves publication settings on UI saves', async () => {
    await writeFile(
      join(userDataDirectory, 'settings.json'),
      JSON.stringify({ pageNumber, customStyle: firstStyle }),
      'utf8',
    );
    const service = new AppSettingsService();
    await expect(service.loadUiPreferences()).resolves.toEqual({
      appearance: 'system',
      inspectorWidth: 320,
    });
    await service.saveUiPreferences({
      appearance: 'dark',
      inspectorWidth: 440,
    });
    await expect(service.loadCustomStyle()).resolves.toEqual(firstStyle);
    await expect(service.loadPageNumber()).resolves.toEqual(pageNumber);
    await expect(new AppSettingsService().loadUiPreferences()).resolves.toEqual(
      { appearance: 'dark', inspectorWidth: 440 },
    );
  });
  it('serializes simultaneous UI, page number and style saves without losing fields', async () => {
    const service = new AppSettingsService();
    await Promise.all([
      service.saveUiPreferences({ appearance: 'light', inspectorWidth: 280 }),
      service.savePageNumber(pageNumber),
      service.saveCustomStyle(firstStyle),
    ]);
    await expect(service.loadUiPreferences()).resolves.toEqual({
      appearance: 'light',
      inspectorWidth: 280,
    });
    await expect(service.loadPageNumber()).resolves.toEqual(pageNumber);
    await expect(service.loadCustomStyle()).resolves.toEqual(firstStyle);
  });
  it('falls back invalid UI preferences without resetting valid publication settings', async () => {
    await writeFile(
      join(userDataDirectory, 'settings.json'),
      JSON.stringify({
        pageNumber,
        customStyle: firstStyle,
        uiPreferences: { appearance: 'dark', inspectorWidth: 900 },
      }),
      'utf8',
    );
    const service = new AppSettingsService();
    await expect(service.loadUiPreferences()).resolves.toEqual({
      appearance: 'system',
      inspectorWidth: 320,
    });
    await expect(service.loadPageNumber()).resolves.toEqual(pageNumber);
    await expect(service.loadCustomStyle()).resolves.toEqual(firstStyle);
    await expect(
      service.saveUiPreferences({ appearance: 'light', inspectorWidth: 100 }),
    ).rejects.toThrow();
  });
});
