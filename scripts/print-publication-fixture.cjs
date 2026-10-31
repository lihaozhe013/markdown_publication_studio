const { app, BrowserWindow } = require('electron');
const { writeFile } = require('node:fs/promises');
const { pathToFileURL } = require('node:url');

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  try {
    const [inputPath, outputPath] = process.argv.slice(2);
    if (!inputPath || !outputPath) {
      throw new Error('Provide input HTML and output PDF paths.');
    }
    await window.loadURL(pathToFileURL(inputPath).href);
    await window.webContents.executeJavaScript(`Promise.all([
      document.fonts.ready,
      ...Array.from(document.images, image => image.decode().catch(() => undefined)),
    ])`);
    const pdf = await window.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
    });
    await writeFile(outputPath, pdf);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    window.destroy();
    app.quit();
  }
});
