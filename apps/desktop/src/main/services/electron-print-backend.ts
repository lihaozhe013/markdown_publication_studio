import { BrowserWindow } from 'electron';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { applyWindowSecurity } from '../security/window-security.js';

export interface PrintBackend {
  render(html: string): Promise<Uint8Array>;
}

export class ElectronPrintBackend implements PrintBackend {
  async render(html: string): Promise<Uint8Array> {
    const htmlPath = join(
      tmpdir(),
      `markdown-publication-${randomUUID()}.html`,
    );
    await writeFile(htmlPath, html, 'utf8');

    const window = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });
    applyWindowSecurity(window);

    try {
      await window.loadURL(pathToFileURL(htmlPath).toString());
      await window.webContents.executeJavaScript(
        `(() => Promise.all([
          document.fonts.ready,
          ...Array.from(document.images, (image) => image.complete ? Promise.resolve() : new Promise((resolve) => {
            image.addEventListener('load', resolve, { once: true });
            image.addEventListener('error', resolve, { once: true });
          }))
        ]).then(() => {
          document.body.dataset.publicationRenderReady = 'true';
          return document.body.dataset.publicationRenderReady;
        }))()`,
        true,
      );
      const isReady = await window.webContents.executeJavaScript(
        `document.body?.dataset.publicationRenderReady === 'true'`,
        true,
      );
      if (!isReady) {
        throw new Error('Publication render did not reach its ready state.');
      }
      return await window.webContents.printToPDF({
        printBackground: true,
        preferCSSPageSize: true,
      });
    } finally {
      if (!window.isDestroyed()) {
        window.destroy();
      }
    }
  }
}
