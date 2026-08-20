import { BrowserWindow } from 'electron';
import { unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { applyWindowSecurity } from '../security/window-security.js';
import { appLogger, isRenderingDebugEnabled } from './app-logger.js';

export interface PrintBackend {
  render(html: string): Promise<Uint8Array>;
}

const RENDER_TIMEOUT_MS = 30_000;

const printRenderProbe = `(() => {
  const stylesheet = [...document.querySelectorAll('style')]
    .map((style) => style.textContent ?? '')
    .join('\\n');
  const mathElement = document.querySelector('.katex .mord');
  const delimiterElement = document.querySelector('.katex .delimsizing');
  const fontFamilies = ['KaTeX_Main', 'KaTeX_Math', 'KaTeX_Size1', 'KaTeX_Size2', 'KaTeX_Size3', 'KaTeX_Size4'];
  const fonts = Object.fromEntries(fontFamilies.map((family) => [
    family,
    document.fonts.check('16px "' + family + '"', '∫[]'),
  ]));
  const diagrams = [...document.querySelectorAll('svg.mermaid-diagram')].map((svg) => {
    const rectangle = svg.getBoundingClientRect();
    const viewBox = svg.viewBox.baseVal;
    let bounds;
    try {
      bounds = svg.getBBox();
    } catch {
      bounds = undefined;
    }
    return {
      id: svg.closest('.mermaid-container')?.dataset.mermaidId,
      viewBox: [viewBox.x, viewBox.y, viewBox.width, viewBox.height].join(' '),
      clientRect: { width: rectangle.width, height: rectangle.height },
      bounds: bounds && { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
    };
  });
  return JSON.stringify({
    math: {
      mathElementCount: document.querySelectorAll('.katex').length,
      relativeFontUrlCount: (stylesheet.match(/url\\((?!data:)/g) ?? []).length,
      dataFontUrlCount: (stylesheet.match(/url\\(data:/g) ?? []).length,
      fonts,
      mathFontFamily: mathElement ? getComputedStyle(mathElement).fontFamily : undefined,
      delimiterFontFamily: delimiterElement ? getComputedStyle(delimiterElement).fontFamily : undefined,
    },
    diagrams,
  });
})()`;

async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} timed out after ${RENDER_TIMEOUT_MS}ms.`));
        }, RENDER_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
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
      await withTimeout(
        window.loadURL(pathToFileURL(htmlPath).toString()),
        'Publication print load',
      );
      await withTimeout(
        window.webContents.executeJavaScript(
          `(() => Promise.all([
          document.fonts.ready,
          ...Array.from(document.images, (image) => image.complete ? Promise.resolve() : new Promise((resolve) => {
            image.addEventListener('load', resolve, { once: true });
            image.addEventListener('error', resolve, { once: true });
          }))
        ]).then(async () => {
          const mathFontFamilies = ['KaTeX_Main', 'KaTeX_Math', 'KaTeX_Size1', 'KaTeX_Size2', 'KaTeX_Size3', 'KaTeX_Size4'];
          if (document.querySelector('.katex')) {
            await Promise.all(mathFontFamilies.map((family) => document.fonts.load('16px "' + family + '"', '∫[]')));
            const missingMathFonts = mathFontFamilies.filter((family) => !document.fonts.check('16px "' + family + '"', '∫[]'));
            if (missingMathFonts.length > 0) {
              throw new Error('KaTeX fonts are not ready: ' + missingMathFonts.join(', '));
            }
          }
          if (document.querySelector('.mermaid-placeholder')) {
            throw new Error('Publication contains an unrendered Mermaid diagram.');
          }
          for (const svg of document.querySelectorAll('svg.mermaid-diagram')) {
            const viewBox = svg.viewBox.baseVal;
            const rectangle = svg.getBoundingClientRect();
            if (viewBox.width <= 0 || viewBox.height <= 0 || rectangle.height <= 0) {
              throw new Error('Publication contains a Mermaid diagram with invalid geometry.');
            }
            const expectedHeight = rectangle.width * viewBox.height / viewBox.width;
            if (Math.abs(rectangle.height - expectedHeight) > 2) {
              throw new Error('Publication contains a Mermaid diagram with an invalid aspect ratio.');
            }
          }
          document.body.dataset.publicationRenderReady = 'true';
          return document.body.dataset.publicationRenderReady;
        }))()`,
          true,
        ),
        'Publication readiness',
      );
      const isReady = await window.webContents.executeJavaScript(
        `document.body?.dataset.publicationRenderReady === 'true'`,
        true,
      );
      if (!isReady) {
        throw new Error('Publication render did not reach its ready state.');
      }
      if (isRenderingDebugEnabled) {
        try {
          const result = await withTimeout(
            window.webContents.executeJavaScript(printRenderProbe, true),
            'Publication debug inspection',
          );
          if (typeof result !== 'string') {
            throw new Error('Publication debug inspection returned no report.');
          }
          const report = result;
          appLogger.debug('[math-render] Print document probe', { report });
          appLogger.debug('[mermaid-render] Print document probe', { report });
        } catch (error) {
          appLogger.error('[render] Print document probe failed', error);
        }
      }
      return await withTimeout(
        window.webContents.printToPDF({
          printBackground: true,
          preferCSSPageSize: true,
        }),
        'PDF printing',
      );
    } finally {
      if (!window.isDestroyed()) {
        window.destroy();
      }
      await unlink(htmlPath).catch(() => undefined);
    }
  }
}
