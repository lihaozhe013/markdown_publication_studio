import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { app } from 'electron';
import {
  DEFAULT_UI_PREFERENCES,
  UiPreferencesSchema,
  type UiPreferences,
  DEFAULT_PAGE_NUMBER_SETTINGS,
  DEFAULT_PUBLICATION_STYLE_OVERRIDES,
  PageNumberSettingsSchema,
  PublicationStyleOverridesSchema,
  type PageNumberSettings,
  type PublicationStyleOverrides,
} from '@markdown-publication/shared';
import { appLogger } from './app-logger.js';

interface StoredAppSettings {
  uiPreferences: UiPreferences;
  pageNumber: PageNumberSettings;
  customStyle: PublicationStyleOverrides;
}

interface AppSettings {
  uiPreferences: UiPreferences;
  pageNumber: PageNumberSettings;
  customStyle: PublicationStyleOverrides;
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json');
}

function isFileNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}

function propertyFrom(value: unknown, property: string): unknown {
  if (typeof value !== 'object' || value === null) return undefined;
  return property in value ? value[property as keyof typeof value] : undefined;
}

// Older releases allowed CJK page-number fonts and CJK format text, which
// embedded a full CJK font into every PDF. Replace only the unsupported fields
// so the remaining user preferences survive the upgrade.
function migratePageNumberSettings(
  value: unknown,
): PageNumberSettings | undefined {
  const parsed = PageNumberSettingsSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  if (typeof value !== 'object' || value === null) return undefined;

  const withFontReplaced = {
    ...(value as Record<string, unknown>),
    fontFamily: DEFAULT_PAGE_NUMBER_SETTINGS.fontFamily,
  };
  const fontMigrated = PageNumberSettingsSchema.safeParse(withFontReplaced);
  if (fontMigrated.success) {
    appLogger.warn(
      '[page-number] Replaced an unsupported persisted page-number font with the default.',
    );
    return fontMigrated.data;
  }

  const fullyReplaced = {
    ...withFontReplaced,
    format: DEFAULT_PAGE_NUMBER_SETTINGS.format,
  };
  const fullyMigrated = PageNumberSettingsSchema.safeParse(fullyReplaced);
  if (fullyMigrated.success) {
    appLogger.warn(
      '[page-number] Replaced an unsupported persisted page-number font and format with defaults.',
    );
    return fullyMigrated.data;
  }

  return undefined;
}

export class AppSettingsService {
  private writeQueue: Promise<void> = Promise.resolve();

  async loadUiPreferences(): Promise<UiPreferences> {
    return (await this.readSettings()).uiPreferences;
  }

  async saveUiPreferences(preferences: UiPreferences): Promise<UiPreferences> {
    const uiPreferences = UiPreferencesSchema.parse(preferences);
    const next = await this.updateSettings(
      (current) => ({ ...current, uiPreferences }),
      '[settings] UI preferences could not be saved.',
    );
    return next.uiPreferences;
  }

  async loadPageNumber(): Promise<PageNumberSettings> {
    const settings = await this.readSettings();
    return settings.pageNumber;
  }

  async savePageNumber(
    settings: PageNumberSettings,
  ): Promise<PageNumberSettings> {
    const pageNumber = PageNumberSettingsSchema.parse(settings);
    const next = await this.updateSettings(
      (current) => ({ ...current, pageNumber }),
      '[page-number] Settings could not be saved.',
    );
    return next.pageNumber;
  }

  async loadCustomStyle(): Promise<PublicationStyleOverrides> {
    const settings = await this.readSettings();
    return settings.customStyle;
  }

  async saveCustomStyle(
    styleOverrides: PublicationStyleOverrides,
  ): Promise<PublicationStyleOverrides> {
    const customStyle = PublicationStyleOverridesSchema.parse(styleOverrides);
    const next = await this.updateSettings(
      (current) => ({ ...current, customStyle }),
      '[style] Settings could not be saved.',
    );
    return next.customStyle;
  }

  private async readSettings(): Promise<AppSettings> {
    try {
      const raw = await readFile(settingsPath(), 'utf8');
      const parsed: unknown = JSON.parse(raw);
      const uiPreferences = UiPreferencesSchema.safeParse(
        propertyFrom(parsed, 'uiPreferences'),
      );
      const rawPageNumber = propertyFrom(parsed, 'pageNumber');
      const pageNumber = migratePageNumberSettings(rawPageNumber);
      const persistedCustomStyle = propertyFrom(parsed, 'customStyle');
      const customStyleResult =
        PublicationStyleOverridesSchema.safeParse(persistedCustomStyle);

      if (rawPageNumber !== undefined && pageNumber === undefined) {
        appLogger.warn(
          '[page-number] Invalid persisted settings; using defaults.',
        );
      }
      if (!customStyleResult.success && persistedCustomStyle !== undefined) {
        appLogger.warn('[style] Invalid persisted style; using defaults.');
      }

      return {
        uiPreferences: uiPreferences.success
          ? uiPreferences.data
          : { ...DEFAULT_UI_PREFERENCES },
        pageNumber: pageNumber ?? { ...DEFAULT_PAGE_NUMBER_SETTINGS },
        customStyle: customStyleResult.success
          ? customStyleResult.data
          : { ...DEFAULT_PUBLICATION_STYLE_OVERRIDES },
      };
    } catch (error) {
      if (!isFileNotFound(error)) {
        appLogger.warn(
          '[settings] Settings could not be loaded; using defaults.',
        );
      }
      return {
        uiPreferences: { ...DEFAULT_UI_PREFERENCES },
        pageNumber: { ...DEFAULT_PAGE_NUMBER_SETTINGS },
        customStyle: { ...DEFAULT_PUBLICATION_STYLE_OVERRIDES },
      };
    }
  }

  private async updateSettings(
    update: (current: AppSettings) => AppSettings,
    failureMessage: string,
  ): Promise<AppSettings> {
    const operation = this.writeQueue.then(async () => {
      const current = await this.readSettings();
      const next = update(current);
      await this.writeSettings(next, failureMessage);
      return next;
    });
    this.writeQueue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  private async writeSettings(
    settings: AppSettings,
    failureMessage: string,
  ): Promise<void> {
    const targetPath = settingsPath();
    const temporaryPath = `${targetPath}.${randomUUID()}.tmp`;
    const stored: StoredAppSettings = {
      uiPreferences: settings.uiPreferences,
      pageNumber: settings.pageNumber,
      customStyle: settings.customStyle,
    };

    await mkdir(app.getPath('userData'), { recursive: true });
    await writeFile(temporaryPath, JSON.stringify(stored, null, 2), 'utf8');
    try {
      await rename(temporaryPath, targetPath);
    } catch (error) {
      appLogger.error(failureMessage, error);
      throw error;
    }
  }
}
