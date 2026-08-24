import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  type MenuItemConstructorOptions,
} from 'electron';
import { existsSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDirectory = fileURLToPath(new URL('.', import.meta.url));
const productName = 'Markdown Publication Studio';

function findIconPath(): string | undefined {
  const candidates = [
    join(app.getAppPath(), 'assets', 'icon-light.png'),
    join(app.getAppPath(), 'apps', 'desktop', 'assets', 'icon-light.png'),
    join(currentDirectory, '../../assets/icon-light.png'),
    join(currentDirectory, '../../../assets/icon-light.png'),
    join(currentDirectory, '../../../../apps/desktop/assets/icon-light.png'),
  ];
  return candidates.find((p) => existsSync(p));
}

let aboutWindow: BrowserWindow | null = null;
const ABOUT_CLOSE_CHANNEL = 'about:close';

function showAboutWindow(): void {
  if (aboutWindow && !aboutWindow.isDestroyed()) {
    aboutWindow.focus();
    return;
  }

  const iconPath = findIconPath();
  const iconSrc = iconPath
    ? nativeImage.createFromPath(iconPath).toDataURL()
    : '';

  // Prepare temp directory for about page assets
  const tmpDir = join(app.getPath('temp'), 'markdown-publication-studio');
  try {
    mkdirSync(tmpDir, { recursive: true });
  } catch {
    /* exists */
  }

  // Write a minimal preload script for the close button IPC
  const preloadPath = join(tmpDir, 'about-preload.cjs');
  writeFileSync(
    preloadPath,
    `const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('aboutAPI', {
  close: () => ipcRenderer.send('${ABOUT_CLOSE_CHANNEL}'),
});`,
    'utf-8',
  );

  // Register the IPC handler (only one at a time)
  ipcMain.removeAllListeners(ABOUT_CLOSE_CHANNEL);
  ipcMain.on(ABOUT_CLOSE_CHANNEL, () => {
    if (aboutWindow && !aboutWindow.isDestroyed()) {
      aboutWindow.close();
    }
  });

  const win = new BrowserWindow({
    width: 320,
    height: 360,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    title: productName,
    show: false,
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset' }
      : { frame: false }),
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  aboutWindow = win;

  const iconHtml = iconSrc
    ? `<img class="icon" src="${iconSrc}" alt="App icon">`
    : `<div class="icon-fallback">MPS</div>`;

  const closeHtml =
    process.platform !== 'darwin'
      ? `<button class="close-btn" id="closeBtn">&times;</button>`
      : '';

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    height: 100%;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: #ffffff;
    color: #1a1a1a;
    -webkit-app-region: drag;
    user-select: none;
  }
  body {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 48px 32px 32px;
    text-align: center;
    gap: 8px;
    position: relative;
  }
  .icon {
    width: 80px;
    height: 80px;
    border-radius: 18px;
    box-shadow: 0 2px 12px rgba(0,0,0,0.08);
    margin-bottom: 12px;
  }
  .icon-fallback {
    width: 80px;
    height: 80px;
    border-radius: 18px;
    background: linear-gradient(135deg, #6366f1, #8b5cf6);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    font-weight: 700;
    letter-spacing: -0.5px;
    margin-bottom: 12px;
    box-shadow: 0 2px 12px rgba(99,102,241,0.25);
  }
  .app-name {
    font-size: 17px;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: #111111;
  }
  .version {
    font-size: 12px;
    color: #888888;
    margin-bottom: 16px;
  }
  .description {
    font-size: 12.5px;
    color: #666666;
    line-height: 1.55;
    max-width: 260px;
    margin-bottom: 24px;
  }
  .copyright {
    font-size: 11px;
    color: #aaaaaa;
    position: absolute;
    bottom: 16px;
    left: 0;
    right: 0;
    text-align: center;
  }
  .close-btn {
    position: absolute;
    top: 12px;
    right: 12px;
    -webkit-app-region: no-drag;
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 50%;
    background: #e5e5e5;
    color: #555;
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s;
  }
  .close-btn:hover { background: #d4d4d4; }
  .close-btn:active { background: #c0c0c0; }
</style>
</head>
<body>
  ${closeHtml}
  ${iconHtml}
  <div class="app-name">${productName}</div>
  <div class="version">Version ${app.getVersion()}</div>
  <p class="description">A deterministic Markdown publication compiler with a desktop control panel.</p>
  <div class="copyright">&copy; ${new Date().getFullYear()} ${productName}</div>
  <script>
    const btn = document.getElementById('closeBtn');
    if (btn) btn.addEventListener('click', () => window.aboutAPI.close());
  </script>
</body>
</html>`;

  const tmpFile = join(tmpDir, 'about.html');
  writeFileSync(tmpFile, html, 'utf-8');

  win.on('closed', () => {
    aboutWindow = null;
    ipcMain.removeAllListeners(ABOUT_CLOSE_CHANNEL);
    try {
      unlinkSync(tmpFile);
    } catch {
      /* ignore */
    }
    try {
      unlinkSync(preloadPath);
    } catch {
      /* ignore */
    }
  });

  void win.loadFile(tmpFile);
  win.once('ready-to-show', () => {
    win.show();
  });
}

export function setupApplicationMenu(): void {
  const iconPath = findIconPath();

  if (iconPath) {
    app.setAboutPanelOptions({
      applicationName: productName,
      applicationVersion: app.getVersion(),
      version: app.getVersion(),
      copyright: `© ${new Date().getFullYear()} ${productName}`,
      iconPath,
    });
  }

  const template: MenuItemConstructorOptions[] = [];

  if (process.platform === 'darwin') {
    template.push({
      label: app.name,
      submenu: [
        {
          label: `About ${productName}`,
          click: () => showAboutWindow(),
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    });
  }

  template.push({ role: 'editMenu' }, { role: 'viewMenu' });

  if (process.platform !== 'darwin') {
    template.push({
      label: 'Help',
      submenu: [
        {
          label: 'About',
          click: () => showAboutWindow(),
        },
      ],
    });
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
