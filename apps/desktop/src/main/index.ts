import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  type OpenDialogOptions,
} from 'electron';
import { existsSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ExportRequestSchema,
  PreviewRequestSchema,
  type DesktopApi,
  type MarkdownFileReference,
} from '@markdown-publication/shared';
import { ElectronPrintBackend } from './services/electron-print-backend.js';
import { appLogger } from './services/app-logger.js';
import {
  PublicationService,
  validateMarkdownPath,
} from './services/publication-service.js';
import { applyWindowSecurity } from './security/window-security.js';

const currentDirectory = fileURLToPath(new URL('.', import.meta.url));
const publicationService = new PublicationService(new ElectronPrintBackend());
const approvedSourcePaths = new Set<string>();

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 680,
    webPreferences: {
      preload: join(currentDirectory, '../preload/index.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  applyWindowSecurity(window);
  window.webContents.on('preload-error', (_event, preloadPath, error) => {
    appLogger.error('[startup] Preload failed', error, {
      preloadFile: basename(preloadPath),
    });
  });
  window.webContents.on(
    'console-message',
    (_event, level, message, line, sourceId) => {
      const details = { line, sourceId };
      if (level >= 3) {
        appLogger.error('[renderer] Console error', message, details);
      } else if (level === 2) {
        appLogger.warn('[renderer] Console warning', { message, ...details });
      } else if (level === 1) {
        appLogger.info('[renderer] Console message', { message, ...details });
      } else {
        appLogger.debug('[renderer] Console debug message', {
          message,
          ...details,
        });
      }
    },
  );
  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(currentDirectory, '../renderer/index.html'));
  }
  return window;
}

function registerIpcHandlers(): void {
  ipcMain.handle(
    'project:open-markdown',
    async (event): Promise<MarkdownFileReference | null> => {
      appLogger.info('[open-file] IPC request received', {
        rendererId: event.sender.id,
      });
      try {
        const ownerWindow = BrowserWindow.fromWebContents(event.sender);
        const dialogOptions: OpenDialogOptions = {
          title: 'Open Markdown file',
          properties: ['openFile'],
          filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
        };
        const result = ownerWindow
          ? await dialog.showOpenDialog(ownerWindow, dialogOptions)
          : await dialog.showOpenDialog(dialogOptions);
        const selectedPath = result.filePaths[0];
        appLogger.info('[open-file] Native dialog completed', {
          canceled: result.canceled,
          selectedFileCount: result.filePaths.length,
        });
        if (result.canceled || !selectedPath) {
          return null;
        }
        await validateMarkdownPath(selectedPath);
        approvedSourcePaths.add(selectedPath);
        appLogger.info('[open-file] Markdown file approved', {
          fileName: basename(selectedPath),
        });
        return { path: selectedPath, name: basename(selectedPath) };
      } catch (error) {
        appLogger.error('[open-file] Failed to open Markdown file', error);
        throw error;
      }
    },
  );

  ipcMain.handle('preview:build', async (_event, rawRequest: unknown) => {
    const request = PreviewRequestSchema.parse(rawRequest);
    if (!approvedSourcePaths.has(request.sourcePath)) {
      throw new Error(
        'The Markdown file must be selected through the native file dialog first.',
      );
    }
    await validateMarkdownPath(request.sourcePath);
    return publicationService.buildPreview(request.sourcePath, request.themeId);
  });

  ipcMain.handle('export:start', async (_event, rawRequest: unknown) => {
    const request = ExportRequestSchema.parse(rawRequest);
    if (!approvedSourcePaths.has(request.sourcePath)) {
      throw new Error(
        'The Markdown file must be selected through the native file dialog first.',
      );
    }
    await validateMarkdownPath(request.sourcePath);
    const result = await dialog.showSaveDialog({
      defaultPath: join(
        process.cwd(),
        `${basename(request.sourcePath, extname(request.sourcePath))}.pdf`,
      ),
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (result.canceled || !result.filePath) {
      return null;
    }
    return publicationService.exportPdf(
      request.sourcePath,
      result.filePath,
      request.themeId,
    );
  });
}

app.whenReady().then(() => {
  appLogger.info('[startup] Application is ready', {
    logDirectory: app.getPath('logs'),
  });
  registerIpcHandlers();
  createMainWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

if (!existsSync(join(currentDirectory, '../preload/index.cjs'))) {
  appLogger.warn(
    '[startup] preload bundle is missing; run the build before launching Electron.',
  );
}

export type { DesktopApi };
