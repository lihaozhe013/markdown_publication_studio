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
  OpenDroppedMarkdownRequestSchema,
  PreviewRequestSchema,
  type DesktopApi,
  type MarkdownFileReference,
} from '@markdown-publication/shared';
import { ElectronPrintBackend } from './services/electron-print-backend.js';
import { ElectronMermaidRenderer } from './services/mermaid-renderer.js';
import { appLogger } from './services/app-logger.js';
import {
  PublicationService,
  validateMarkdownPath,
} from './services/publication-service.js';
import { applyWindowSecurity } from './security/window-security.js';

const currentDirectory = fileURLToPath(new URL('.', import.meta.url));
const mermaidRendererPage = process.env.ELECTRON_RENDERER_URL
  ? new URL(
      'mermaid.html',
      process.env.ELECTRON_RENDERER_URL.endsWith('/')
        ? process.env.ELECTRON_RENDERER_URL
        : `${process.env.ELECTRON_RENDERER_URL}/`,
    ).toString()
  : join(currentDirectory, '../renderer/mermaid.html');
const publicationService = new PublicationService(
  new ElectronPrintBackend(),
  new ElectronMermaidRenderer(mermaidRendererPage),
);
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
      navigateOnDragDrop: false,
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
    ({ level, message, lineNumber, sourceId }) => {
      const details = { line: lineNumber, sourceId };
      if (level === 'error') {
        appLogger.error('[renderer] Console error', message, details);
      } else if (level === 'warning') {
        appLogger.warn('[renderer] Console warning', { message, ...details });
      } else if (level === 'info') {
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

  ipcMain.handle(
    'project:open-dropped-markdown',
    async (event, rawRequest: unknown): Promise<MarkdownFileReference> => {
      appLogger.info('[open-file] Dropped Markdown open request received', {
        rendererId: event.sender.id,
      });
      try {
        const request = OpenDroppedMarkdownRequestSchema.parse(rawRequest);
        await validateMarkdownPath(request.sourcePath);
        approvedSourcePaths.add(request.sourcePath);
        appLogger.info('[open-file] Dropped Markdown file approved', {
          fileName: basename(request.sourcePath),
        });
        return {
          path: request.sourcePath,
          name: basename(request.sourcePath),
        };
      } catch (error) {
        appLogger.error(
          '[open-file] Failed to open dropped Markdown file',
          error,
        );
        throw error;
      }
    },
  );

  ipcMain.handle('preview:build', async (_event, rawRequest: unknown) => {
    const request = PreviewRequestSchema.parse(rawRequest);
    if (!approvedSourcePaths.has(request.sourcePath)) {
      throw new Error(
        'The Markdown file must be opened through the application first.',
      );
    }
    await validateMarkdownPath(request.sourcePath);
    return publicationService.buildPreview(request.sourcePath, request.themeId);
  });

  ipcMain.handle('export:start', async (_event, rawRequest: unknown) => {
    const request = ExportRequestSchema.parse(rawRequest);
    if (!approvedSourcePaths.has(request.sourcePath)) {
      throw new Error(
        'The Markdown file must be opened through the application first.',
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

  ipcMain.handle('export:html', async (_event, rawRequest: unknown) => {
    const request = ExportRequestSchema.parse(rawRequest);
    if (!approvedSourcePaths.has(request.sourcePath)) {
      throw new Error(
        'The Markdown file must be opened through the application first.',
      );
    }
    await validateMarkdownPath(request.sourcePath);
    const result = await dialog.showSaveDialog({
      defaultPath: join(
        process.cwd(),
        `${basename(request.sourcePath, extname(request.sourcePath))}.html`,
      ),
      filters: [{ name: 'HTML', extensions: ['html'] }],
    });
    if (result.canceled || !result.filePath) {
      return null;
    }
    return publicationService.exportHtml(
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
