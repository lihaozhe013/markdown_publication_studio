const { app, BrowserWindow } = require('electron');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { performance } = require('node:perf_hooks');
const { pathToFileURL } = require('node:url');

const bundlePath = process.env.MPS_PAGEDJS_BUNDLE;
if (!bundlePath) {
  throw new Error('Set MPS_PAGEDJS_BUNDLE to the Paged.js browser bundle.');
}
const bundle = readFileSync(resolve(bundlePath), 'utf8');
const theme = readFileSync(resolve('themes/css/claude.css'), 'utf8');
const directory = mkdtempSync(join(tmpdir(), 'mps-pagedjs-probe-'));
const paragraphs = Array.from(
  { length: 70 },
  (_, index) =>
    `<p>Paragraph ${index}: ${'\u4e2d\u6587\u6392\u7248 mixed English publication content and typography. '.repeat(8)}</p>`,
).join('');
const rows = Array.from(
  { length: 85 },
  (_, index) => `<tr><td>Row ${index}</td><td>Example content</td></tr>`,
).join('');
const code = Array.from(
  { length: 110 },
  (_, index) => `<span class="line">const line${index} = ${index};</span>`,
).join('\n');
const html = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:;">
<style>@page {size:A4;margin:18mm 16mm 20mm} body {font:11pt sans-serif;line-height:1.5}
.break {break-before:page} table {border-collapse:collapse} td,th {border:1px solid;padding:4px}
pre {white-space:pre-wrap} ${theme}</style></head>
<body class="markdown-body" data-theme="claude"><article class="chapter"><h1 id="start">Start</h1>
${paragraphs}<div class="break"></div><h2 id="after">After break</h2>
<table><thead><tr><th>Column</th><th>Value</th></tr></thead><tbody>${rows}</tbody></table>
<pre class="code-block"><code>${code}</code></pre><p>END-OF-DOCUMENT</p></article></body></html>`;
const inputPath = join(directory, 'input.html');
writeFileSync(inputPath, html);

function createWindow() {
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  window.webContents.setBackgroundThrottling(false);
  return window;
}

async function run() {
  const window = createWindow();
  let staticWindow;
  try {
    await window.loadURL(pathToFileURL(inputPath).href);
    await window.webContents.executeJavaScript('document.fonts.ready');
    await window.webContents.executeJavaScript(bundle, true);
    const start = performance.now();
    const report = JSON.parse(
      await window.webContents.executeJavaScript(
        `(async () => {
          const previewer = new Paged.Previewer();
          const flow = await previewer.preview();
          const pages = [...document.querySelectorAll('.pagedjs_page')];
          return JSON.stringify({
            total: flow.total,
            pages: pages.length,
            afterPage: pages.findIndex(page => page.querySelector('#after')) + 1,
            pageText: pages.map(page => page.innerText).join('\\n'),
            overflow: pages.map((page, index) => {
              const content = page.querySelector('.pagedjs_page_content');
              return {page: index + 1, scrollWidth: content.scrollWidth,
                clientWidth: content.clientWidth, scrollHeight: content.scrollHeight,
                clientHeight: content.clientHeight,
                descendants: [...content.querySelectorAll('*')].filter(el => {
                  const rect = el.getBoundingClientRect();
                  const parent = content.getBoundingClientRect();
                  return rect.right > parent.right + 1 || rect.left < parent.left - 1;
                }).slice(0, 12).map(el => ({tag: el.tagName, className: el.getAttribute('class'), text: el.textContent.slice(0, 50), width: el.getBoundingClientRect().width}))};
            }).filter(item => item.scrollWidth > item.clientWidth + 1 ||
              item.scrollHeight > item.clientHeight + 1),
          });
        })()`,
        true,
      ),
    );
    const elapsedMs = Math.round(performance.now() - start);
    const artifact = await window.webContents.executeJavaScript(
      "'<!doctype html>' + document.documentElement.outerHTML",
    );
    const artifactPath = join(directory, 'artifact.html');
    writeFileSync(artifactPath, artifact);
    const pdfPath = join(directory, 'document.pdf');
    writeFileSync(
      pdfPath,
      await window.webContents.printToPDF({
        printBackground: true,
        preferCSSPageSize: true,
      }),
    );
    const pdfInfo = execFileSync('pdfinfo', [pdfPath], { encoding: 'utf8' });
    const pdfText = execFileSync('pdftotext', [pdfPath, '-'], {
      encoding: 'utf8',
    });
    const missingRows = Array.from({ length: 85 }, (_, index) => index).filter(
      (index) => !new RegExp(`Row\\s+${index}(?!\\d)`).test(pdfText),
    );
    staticWindow = createWindow();
    await staticWindow.loadURL(pathToFileURL(artifactPath).href);
    const staticReport = JSON.parse(
      await staticWindow.webContents.executeJavaScript(
        `JSON.stringify({
          pages: document.querySelectorAll('.pagedjs_page').length,
          afterPage: [...document.querySelectorAll('.pagedjs_page')]
            .findIndex(page => page.querySelector('#after')) + 1,
          hasEnd: document.body.innerText.includes('END-OF-DOCUMENT'),
        })`,
      ),
    );
    const staticPdfPath = join(directory, 'static.pdf');
    writeFileSync(
      staticPdfPath,
      await staticWindow.webContents.printToPDF({
        printBackground: true,
        preferCSSPageSize: true,
      }),
    );
    const staticPdfInfo = execFileSync('pdfinfo', [staticPdfPath], {
      encoding: 'utf8',
    });
    console.log(
      JSON.stringify(
        {
          electron: process.versions.electron,
          chrome: process.versions.chrome,
          elapsedMs,
          pageCount: report.pages,
          enginePageCount: report.total,
          afterPage: report.afterPage,
          pdfPageCount: Number(pdfInfo.match(/^Pages:\s*(\d+)/m)?.[1]),
          staticPdfPageCount: Number(
            staticPdfInfo.match(/^Pages:\s*(\d+)/m)?.[1],
          ),
          staticReport,
          overflow: report.overflow,
          missingRows,
          hasLastCodeLine: pdfText.includes('line109'),
          hasEnd: pdfText.includes('END-OF-DOCUMENT'),
        },
        null,
        2,
      ),
    );
  } finally {
    staticWindow?.destroy();
    window.destroy();
    rmSync(directory, { recursive: true, force: true });
  }
}

app.whenReady().then(async () => {
  try {
    await run();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    app.quit();
  }
});
