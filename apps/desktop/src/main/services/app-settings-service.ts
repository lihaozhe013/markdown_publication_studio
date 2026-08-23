import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { app } from 'electron';
import {
  DEFAULT_PAGE_NUMBER_SETTINGS,
  PageNumberSettingsSchema,
  type PageNumberSettings,
} from '@markdown-publication/shared';
import { appLogger } from './app-logger.js';

interface StoredAppSettings {
  pageNumber: PageNumberSettings;
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

export class AppSettingsService {
  async loadPageNumber(): Promise<PageNumberSettings> {
    try {
      const raw = await readFile(settingsPath(), 'utf8');
      const parsed: unknown = JSON.parse(raw);
      const storedPageNumber =
        typeof parsed === 'object' && parsed !== null && 'pageNumber' in parsed
          ? parsed.pageNumber
          : undefined;
      const result = PageNumberSettingsSchema.safeParse(storedPageNumber);
      if (!result.success) {
        appLogger.warn(
          '[page-number] Invalid persisted settings; using defaults.',
        );
        return { ...DEFAULT_PAGE_NUMBER_SETTINGS };
      }
      return result.data;
    } catch (error) {
      if (!isFileNotFound(error)) {
        appLogger.warn(
          '[page-number] Settings could not be loaded; using defaults.',
        );
      }
      return { ...DEFAULT_PAGE_NUMBER_SETTINGS };
    }
  }

  async savePageNumber(
    settings: PageNumberSettings,
  ): Promise<PageNumberSettings> {
    const pageNumber = PageNumberSettingsSchema.parse(settings);
    const targetPath = settingsPath();
    const temporaryPath = `${targetPath}.${randomUUID()}.tmp`;
    const stored: StoredAppSettings = { pageNumber };

    await mkdir(app.getPath('userData'), { recursive: true });
    await writeFile(temporaryPath, JSON.stringify(stored, null, 2), 'utf8');
    try {
      await rename(temporaryPath, targetPath);
    } catch (error) {
      appLogger.error('[page-number] Settings could not be saved.', error);
      throw error;
    }
    return pageNumber;
  }
}
