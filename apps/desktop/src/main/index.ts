import { app, BrowserWindow, dialog, ipcMain } from 'electron';
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
      preload: join(currentDirectory, '../preload/index.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  applyWindowSecurity(window);
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
    async (): Promise<MarkdownFileReference | null> => {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
      });
      const selectedPath = result.filePaths[0];
      if (result.canceled || !selectedPath) {
        return null;
      }
      await validateMarkdownPath(selectedPath);
      approvedSourcePaths.add(selectedPath);
      return { path: selectedPath, name: basename(selectedPath) };
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
    return publicationService.buildPreview(request.sourcePath);
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
    return publicationService.exportPdf(request.sourcePath, result.filePath);
  });
}

app.whenReady().then(() => {
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

if (!existsSync(join(currentDirectory, '../preload/index.mjs'))) {
  console.warn(
    '[startup] preload bundle is missing; run the build before launching Electron.',
  );
}

export type { DesktopApi };
