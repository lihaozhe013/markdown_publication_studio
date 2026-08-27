import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { app } from 'electron';
import {
  DEFAULT_PAGE_NUMBER_SETTINGS,
  DEFAULT_PUBLICATION_STYLE_OVERRIDES,
  PageNumberSettingsSchema,
  PublicationStyleOverridesSchema,
  type PageNumberSettings,
  type PublicationStyleOverrides,
} from '@markdown-publication/shared';
import { appLogger } from './app-logger.js';

interface StoredAppSettings {
  pageNumber: PageNumberSettings;
  customStyle: PublicationStyleOverrides;
}

interface AppSettings {
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

export class AppSettingsService {
  private writeQueue: Promise<void> = Promise.resolve();

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
      const pageNumberResult = PageNumberSettingsSchema.safeParse(
        propertyFrom(parsed, 'pageNumber'),
      );
      const persistedCustomStyle = propertyFrom(parsed, 'customStyle');
      const customStyleResult =
        PublicationStyleOverridesSchema.safeParse(persistedCustomStyle);

      if (!pageNumberResult.success) {
        appLogger.warn(
          '[page-number] Invalid persisted settings; using defaults.',
        );
      }
      if (!customStyleResult.success && persistedCustomStyle !== undefined) {
        appLogger.warn('[style] Invalid persisted style; using defaults.');
      }

      return {
        pageNumber: pageNumberResult.success
          ? pageNumberResult.data
          : { ...DEFAULT_PAGE_NUMBER_SETTINGS },
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
