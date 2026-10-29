const { app, BrowserWindow } = require('electron');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { createRequire } = require('node:module');
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
const fixturePath = process.env.MPS_PAGED_FIXTURE_PATH;
const inputPath = join(directory, 'input.html');

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
    let input = fixturePath ? readFileSync(resolve(fixturePath), 'utf8') : html;
    if (process.env.MPS_PAGED_RENDER_MERMAID === '1') {
      const pattern =
        /<pre class="mermaid-placeholder" data-mermaid-id="([^"]+)" data-mermaid-source="([^"]+)">[\s\S]*?<\/pre>/gu;
      const matches = [...input.matchAll(pattern)];
      const diagrams = matches.map((match) => ({
        id: match[1],
        source: Buffer.from(match[2], 'base64').toString('utf8'),
      }));
      const mermaidWindow = createWindow();
      try {
        await mermaidWindow.loadFile(resolve('out/renderer/mermaid.html'));
        const result = await mermaidWindow.webContents.executeJavaScript(
          `window.__publicationRenderMermaid(${JSON.stringify(diagrams)}, 'neutral')`,
          true,
        );
        for (const match of matches) {
          const diagram = result.find((item) => item.id === match[1]);
          if (!diagram?.svg || !diagram.geometry?.preserved)
            throw new Error(`Mermaid rendering failed: ${match[1]}`);
          input = input.replace(
            match[0],
            `<figure class="mermaid-container" data-mermaid-id="${match[1]}">${diagram.svg}</figure>`,
          );
        }
      } finally {
        mermaidWindow.destroy();
      }
    }
    writeFileSync(inputPath, input);
    input = '';
    console.error('[probe] Loading publication HTML');
    await window.loadURL(pathToFileURL(inputPath).href);
    console.error('[probe] Waiting for fonts');
    await window.webContents.executeJavaScript(`Promise.all([
      document.fonts.ready,
      ...Array.from(document.images, image => image.decode().catch(() => undefined)),
    ])`);
    if (process.env.MPS_PAGED_DECORATE === '1') {
      await window.webContents.executeJavaScript(`(() => {
        const style = document.createElement('style');
        style.dataset.pagedjsIgnore = 'true';
        style.textContent = \`
          .probe-toc-page { flex: 0 0 4em; width: 4em; text-align: right; white-space: nowrap; }
          .probe-folio { position: absolute; bottom: 6mm; left: 0; right: 0; text-align: center;
            font: 10pt sans-serif; line-height: 1; }
        \`;
        document.head.append(style);
        for (const anchor of document.querySelectorAll('[data-toc="true"] a[href^="#"]')) {
          const label = document.createElement('span');
          label.className = 'probe-toc-page';
          label.textContent = '0000';
          anchor.append(label);
        }
      })()`);
    }
    const fontSizePt = Number(process.env.MPS_PAGED_FONT_SIZE_PT || 0);
    if (!Number.isFinite(fontSizePt) || fontSizePt < 0 || fontSizePt > 72) {
      throw new Error('MPS_PAGED_FONT_SIZE_PT must be between 0 and 72.');
    }
    if (process.env.MPS_PAGED_NORMALIZE_STYLES === '1') {
      await window.webContents.executeJavaScript(`(() => {
        const style = document.createElement('style');
        style.dataset.pagedjsIgnore = 'true';
        style.textContent = \`
          html { background: transparent !important; }
          body.markdown-body { width: auto !important; max-width: none !important; margin: 0 !important; padding: 0 !important; }
          .markdown-body .chapter, .markdown-body .publication-toc {
            width: auto !important; max-width: none !important; margin: 0 !important;
            padding: 0 !important; box-shadow: none !important;
          }
          .publication-page-break { display: block !important; break-after: page !important; }
          ${fontSizePt ? `body.markdown-body { font-size: ${fontSizePt}pt !important; }` : ''}
        \`;
        document.head.append(style);
      })()`);
    }
    console.error('[probe] Loading pagination bundle');
    await window.webContents.executeJavaScript(bundle, true);
    if (process.env.MPS_REPEAT_TABLE_HEADERS === '1') {
      await window.webContents.executeJavaScript(
        `
        class RepeatTableHeaders extends Paged.Handler {
          afterParsed(content) {
            window.__headerDebug = [];
            this.headers = new Map();
            for (const table of content.querySelectorAll('table[data-ref]')) {
              const header = table.querySelector(':scope > thead');
              if (header) this.headers.set(table.dataset.ref, header.cloneNode(true));
            }
            window.__headerDebug.push({ event: 'parsed', count: this.headers.size });
          }
          afterOverflowAdded(content) {
            window.__headerDebug.push({ event: 'overflow', tables: content.querySelectorAll('table').length });
            for (const table of content.querySelectorAll('table[data-ref]')) {
              const current = table.querySelector(':scope > thead');
              window.__headerDebug.push({ event: 'table', matched: this.headers.has(table.dataset.ref) });
              if (current && getComputedStyle(current).visibility === 'visible') continue;
              current?.remove();
              const original = this.headers.get(table.dataset.ref);
              if (!original) continue;
              const header = original.cloneNode(true);
              for (const node of [header, ...header.querySelectorAll('*')]) {
                node.removeAttribute('id');
                node.removeAttribute('data-id');
                node.removeAttribute('data-ref');
              }
              header.dataset.repeatedHeader = 'true';
              table.insertBefore(header, table.firstChild);
            }
          }
        }
        Paged.registerHandlers(RepeatTableHeaders);
      `,
        true,
      );
    }
    const start = performance.now();
    const fastStyles = process.env.MPS_PAGED_FAST_STYLES === '1';
    const pageSize = process.env.MPS_PAGED_PAGE_SIZE ?? 'A4';
    if (pageSize !== 'A4' && pageSize !== 'Letter') {
      throw new Error('MPS_PAGED_PAGE_SIZE must be A4 or Letter.');
    }
    const compactStyles = [
      {
        'publication.css': `@page { size: ${pageSize}; margin: 18mm 16mm 20mm; } .publication-page-break { break-after: page; } .publication-toc { break-after: page; }`,
      },
    ];
    const restoreAnchors = process.env.MPS_PAGED_RESTORE_ANCHORS === '1';
    const decorate = process.env.MPS_PAGED_DECORATE === '1';
    const restartBody = process.env.MPS_PAGED_RESTART_BODY === '1';
    console.error(`[probe] Starting layout (compact styles: ${fastStyles})`);
    const cancelAfterMs = Number(process.env.MPS_PAGED_CANCEL_AFTER_MS || 0);
    if (!Number.isFinite(cancelAfterMs) || cancelAfterMs < 0) {
      throw new Error('MPS_PAGED_CANCEL_AFTER_MS must be nonnegative.');
    }
    let cancelTimer;
    const cancellation = new Promise((resolve) => {
      if (cancelAfterMs) {
        cancelTimer = setTimeout(() => {
          if (!window.isDestroyed()) window.destroy();
          resolve('{"cancelled":true}');
        }, cancelAfterMs);
      }
    });
    let report;
    try {
      report = JSON.parse(
        await Promise.race([
          window.webContents.executeJavaScript(
            `(async () => {
          const previewer = new Paged.Previewer();
          const styles = ${fastStyles ? JSON.stringify(compactStyles) : 'undefined'};
          const flow = await previewer.preview(undefined, styles);
          const pages = [...document.querySelectorAll('.pagedjs_page')];
          if (${restoreAnchors}) {
            const headings = pages.flatMap(page => [...page.querySelectorAll('[data-toc-id]')]);
            for (const heading of headings) {
              const id = heading.dataset.tocId;
              if (!id || pages.some(page => page.querySelector('[id="' + CSS.escape(id) + '"]'))) continue;
              heading.id = id;
            }
          }
          const tocGeometry = () => pages.flatMap(page =>
            [...page.querySelectorAll('[data-toc="true"] a')].map(anchor => {
              const rect = anchor.getBoundingClientRect();
              return [rect.x, rect.y, rect.width, rect.height];
            }));
          const tocBefore = JSON.stringify(tocGeometry());
          const bodyStart = ${restartBody} ? pages.findIndex(page => !page.querySelector('[data-toc="true"]')) : 0;
          const logicalPage = index => index < bodyStart ? index + 1 : index - bodyStart + 1;
          if (${decorate}) {
            pages.forEach((page, index) => {
              const box = page.querySelector('.pagedjs_pagebox');
              if (page.querySelector('[data-toc="true"]')) box.style.backgroundColor = '#e8eefb';
              if (page.querySelector('#after, [id$="-after-break"]')) box.style.backgroundColor = '#ffeecc';
              const folio = document.createElement('div');
              folio.className = 'probe-folio';
              folio.textContent = String(logicalPage(index));
              box.append(folio);
            });
            for (const anchor of pages.flatMap(page => [...page.querySelectorAll('[data-toc="true"] a[href^="#"]')])) {
              const target = anchor.getAttribute('href').slice(1);
              const targetPage = pages.findIndex(page => page.querySelector('[id="' + CSS.escape(target) + '"]')) + 1;
              const label = anchor.querySelector('.probe-toc-page');
              if (label) label.textContent = targetPage > 0 ? String(logicalPage(targetPage - 1)) : '?';
            }
          }
          return JSON.stringify({
            total: flow.total,
            tocRefillGeometryMatches: tocBefore === JSON.stringify(tocGeometry()),
            headerDebug: window.__headerDebug,
            pages: pages.length,
            afterPage: pages.findIndex(page => page.querySelector('#after, [id$="-after-break"]')) + 1,
            afterStartsPage: pages.some(page => {
              const first = [...page.querySelectorAll('h1,h2,h3,p,pre,table,img')]
                .find(node => node.getBoundingClientRect().height > 0);
              return Boolean(first?.matches('#after, [id$="-after-break"]'));
            }),
            tocPages: pages.map((page, index) => page.querySelector('[data-toc="true"]') ? index + 1 : null).filter(Boolean),
            tocLinks: pages.flatMap(page => [...page.querySelectorAll('[data-toc="true"] a[href^="#"]')])
              .map(anchor => ({target: anchor.getAttribute('href').slice(1),
                label: anchor.querySelector('.probe-toc-page')?.textContent,
                destinationPage: pages.findIndex(page => page.querySelector('[id="' + CSS.escape(anchor.getAttribute('href').slice(1)) + '"]')) + 1,
                destinationCount: pages.filter(page => page.querySelector('[id="' + CSS.escape(anchor.getAttribute('href').slice(1)) + '"]')).length})),
            mermaidCount: pages.reduce((sum, page) => sum + page.querySelectorAll('svg.mermaid-diagram').length, 0),
            visibleOverflow: pages.flatMap((page, index) => {
              const content = page.querySelector('.pagedjs_page_content');
              const bounds = content.getBoundingClientRect();
              return [...content.querySelectorAll('h1,h2,h3,p,pre,table,img,svg.mermaid-diagram,.math-block')]
                .map(node => ({node, rect: node.getBoundingClientRect()}))
                .filter(({rect}) => rect.width > 0 && rect.height > 0 &&
                  (rect.left < bounds.left - 1 || rect.right > bounds.right + 1 ||
                   rect.top < bounds.top - 1 || rect.bottom > bounds.bottom + 1))
                .map(({node, rect}) => ({page: index + 1, tag: node.tagName,
                  width: rect.width, height: rect.height,
                  left: rect.left - bounds.left, top: rect.top - bounds.top}));
            }),
            folios: pages.map(page => page.querySelector('.probe-folio')?.textContent),
            pageColors: pages.map(page => getComputedStyle(page.querySelector('.pagedjs_pagebox')).backgroundColor),
            headingAnchors: pages.flatMap((page, index) => [...page.querySelectorAll('h1,h2,h3')].map(heading => ({
              page: index + 1, id: heading.id, dataId: heading.dataset.id, sourceId: heading.dataset.tocId,
            }))),
            pageTexts: pages.map(page => page.innerText),
            pageSizes: pages.map(page => {
              const bounds = page.getBoundingClientRect();
              return [bounds.width, bounds.height];
            }),
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
          cancellation,
        ]),
      );
      if (report.cancelled) {
        console.log(
          JSON.stringify(
            {
              cancelled: true,
              elapsedMs: Math.round(performance.now() - start),
            },
            null,
            2,
          ),
        );
        return;
      }
    } catch (error) {
      if (cancelAfterMs && window.isDestroyed()) {
        console.log(
          JSON.stringify(
            {
              cancelled: true,
              elapsedMs: Math.round(performance.now() - start),
            },
            null,
            2,
          ),
        );
        return;
      }
      throw error;
    } finally {
      if (cancelTimer) clearTimeout(cancelTimer);
    }
    if (cancelAfterMs)
      throw new Error('Layout finished before the cancellation test fired.');
    const elapsedMs = Math.round(performance.now() - start);
    console.error(`[probe] Layout finished after ${elapsedMs}ms; serializing`);
    const artifact = await window.webContents.executeJavaScript(
      "'<!doctype html>' + document.documentElement.outerHTML",
    );
    const artifactPath = join(directory, 'artifact.html');
    writeFileSync(artifactPath, artifact);
    console.error('[probe] Printing original pagination');
    const pdfPath = join(directory, 'document.pdf');
    writeFileSync(
      pdfPath,
      await window.webContents.printToPDF({
        printBackground: true,
        preferCSSPageSize: true,
      }),
    );
    const pdfInfo = execFileSync('pdfinfo', [pdfPath], { encoding: 'utf8' });
    let coverAssembly;
    if (process.env.MPS_PAGED_INCLUDE_COVER === '1') {
      const requireDesktop = createRequire(
        resolve('apps/desktop/package.json'),
      );
      const { PDFDocument, PDFArray, PDFDict, PDFName } =
        requireDesktop('pdf-lib');
      const body = await PDFDocument.load(readFileSync(pdfPath));
      const firstPageSize = body.getPage(0).getSize();
      body.insertPage(0, [firstPageSize.width, firstPageSize.height]);
      const assembledPath = join(directory, 'assembled.pdf');
      writeFileSync(assembledPath, await body.save());
      const destinations = execFileSync('pdfinfo', ['-dests', assembledPath], {
        encoding: 'utf8',
      });
      const namedDestinations = Object.fromEntries(
        [...destinations.matchAll(/^\s*(\d+)\s+\[.*\]\s+"([^"]+)"/gmu)].map(
          (match) => [match[2], Number(match[1])],
        ),
      );
      const annotations = [];
      for (const page of body.getPages()) {
        const array = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
        if (!array) continue;
        for (let index = 0; index < array.size(); index += 1) {
          const annotation = array.lookup(index, PDFDict);
          const destination = annotation.get(PDFName.of('Dest'));
          if (destination instanceof PDFName)
            annotations.push(destination.decodeText());
        }
      }
      coverAssembly = {
        pages: body.getPageCount(),
        destinationsMatch: report.tocLinks.every(
          (link) => namedDestinations[link.target] === link.destinationPage + 1,
        ),
        annotationsMatch: report.tocLinks.every((link) =>
          annotations.includes(link.target),
        ),
      };
    }
    const pdfText = execFileSync('pdftotext', ['-layout', pdfPath, '-'], {
      encoding: 'utf8',
    });
    const tablePages = pdfText
      .split('\f')
      .map((text, index) => ({ page: index + 1, text }))
      .filter(({ text }) => /\bRow\s+\d+/u.test(text));
    const tablePagesMissingHeader = tablePages
      .filter(({ text }) => !/\bColumn\b/u.test(text))
      .map(({ page }) => page);
    const mergedCodeLines = pdfText
      .split('\n')
      .filter((line) => /\bline\d+\b.*\bline\d+\b/u.test(line)).length;
    const missingRows = Array.from({ length: 85 }, (_, index) => index).filter(
      (index) => !new RegExp(`Row\\s+${index}(?!\\d)`).test(pdfText),
    );
    const actualRows = [...pdfText.matchAll(/\bRow\s+(\d+)\b/gu)].map((match) =>
      Number(match[1]),
    );
    const actualCodeLines = [
      ...pdfText.matchAll(/\bline(\d+)\s*=\s*(\d+)/gu),
    ].map((match) => [Number(match[1]), Number(match[2])]);
    const rowOrderValid =
      actualRows.length === 85 &&
      actualRows.every((row, index) => row === index);
    const codeOrderValid =
      actualCodeLines.length === 110 &&
      actualCodeLines.every(
        ([line, value], index) => line === index && value === index,
      );
    console.error('[probe] Loading static pagination');
    staticWindow = createWindow();
    await staticWindow.loadURL(pathToFileURL(artifactPath).href);
    await staticWindow.webContents.executeJavaScript(`Promise.all([
      document.fonts.ready,
      ...Array.from(document.images, image => image.decode().catch(() => undefined)),
    ])`);
    const geometryProbe = `JSON.stringify([...document.querySelectorAll('.pagedjs_page')].map(page => {
      const pageRect = page.getBoundingClientRect();
      return [...page.querySelectorAll('h1,h2,h3,p,pre,table,img,svg,.katex-display')].map(node => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        const round = value => Math.round(value * 100) / 100;
        return [node.tagName, round(rect.x-pageRect.x), round(rect.y-pageRect.y),
          round(rect.width), round(rect.height), style.fontFamily, style.fontSize, style.display];
      });
    }))`;
    const screenGeometry =
      await staticWindow.webContents.executeJavaScript(geometryProbe);
    staticWindow.webContents.debugger.attach('1.3');
    await staticWindow.webContents.debugger.sendCommand(
      'Emulation.setEmulatedMedia',
      { media: 'print' },
    );
    const printGeometry =
      await staticWindow.webContents.executeJavaScript(geometryProbe);
    await staticWindow.webContents.debugger.sendCommand(
      'Emulation.setEmulatedMedia',
      { media: '' },
    );
    staticWindow.webContents.debugger.detach();
    const staticReport = JSON.parse(
      await staticWindow.webContents.executeJavaScript(
        `JSON.stringify({
          pages: document.querySelectorAll('.pagedjs_page').length,
          afterPage: [...document.querySelectorAll('.pagedjs_page')]
            .findIndex(page => page.querySelector('#after, [id$="-after-break"]')) + 1,
          hasEnd: document.body.innerText.includes('END-OF-DOCUMENT'),
          pageTexts: [...document.querySelectorAll('.pagedjs_page')].map(page => page.innerText),
          pageSizes: [...document.querySelectorAll('.pagedjs_page')].map(page => {
            const bounds = page.getBoundingClientRect();
            return [bounds.width, bounds.height];
          }),
        })`,
      ),
    );
    console.error('[probe] Printing static pagination');
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
    const staticPdfText = execFileSync(
      'pdftotext',
      ['-layout', staticPdfPath, '-'],
      {
        encoding: 'utf8',
      },
    );
    const screenPages = JSON.parse(screenGeometry);
    const printPages = JSON.parse(printGeometry);
    const geometryDifferences = screenPages
      .flatMap((page, pageIndex) =>
        page.flatMap((entry, index) =>
          JSON.stringify(entry) ===
          JSON.stringify(printPages[pageIndex]?.[index])
            ? []
            : [
                {
                  page: pageIndex + 1,
                  index,
                  screen: entry,
                  print: printPages[pageIndex]?.[index],
                },
              ],
        ),
      )
      .slice(0, 10);
    const staticPageTextMatches =
      JSON.stringify(staticReport.pageTexts) ===
      JSON.stringify(report.pageTexts);
    const staticPageSizesMatch =
      JSON.stringify(staticReport.pageSizes) ===
      JSON.stringify(report.pageSizes);
    delete staticReport.pageTexts;
    delete staticReport.pageSizes;
    console.log(
      JSON.stringify(
        {
          electron: process.versions.electron,
          chrome: process.versions.chrome,
          fixture: fixturePath ? 'external' : 'synthetic',
          pageSize,
          elapsedMs,
          pageCount: report.pages,
          enginePageCount: report.total,
          headerDebug: report.headerDebug,
          afterPage: report.afterPage,
          afterStartsPage: report.afterStartsPage,
          tocPages: report.tocPages,
          tocRefillGeometryMatches: report.tocRefillGeometryMatches,
          tocLinks: report.tocLinks,
          mermaidCount: report.mermaidCount,
          visibleOverflow: report.visibleOverflow,
          folios: report.folios,
          pageColors: report.pageColors,
          headingAnchors: report.headingAnchors,
          coverAssembly,
          pdfPageCount: Number(pdfInfo.match(/^Pages:\s*(\d+)/m)?.[1]),
          staticPdfPageCount: Number(
            staticPdfInfo.match(/^Pages:\s*(\d+)/m)?.[1],
          ),
          staticReport,
          staticPageTextMatches,
          staticPageSizesMatch,
          screenPrintGeometryMatches: screenGeometry === printGeometry,
          geometryDifferences,
          staticPdfTextMatches: pdfText === staticPdfText,
          overflow: report.overflow,
          missingRows,
          rowOrderValid,
          codeOrderValid,
          tablePagesMissingHeader,
          mergedCodeLines,
          hasLastCodeLine: pdfText.includes('line109'),
          hasEnd: pdfText.includes('END-OF-DOCUMENT'),
        },
        null,
        2,
      ),
    );
    if (process.env.MPS_PAGED_ASSERT === '1') {
      const failures = [];
      const requireCheck = (condition, name) => {
        if (!condition) failures.push(name);
      };
      requireCheck(Boolean(fixturePath), 'real fixture');
      requireCheck(report.pages === report.total, 'engine page count');
      requireCheck(
        report.pages === Number(pdfInfo.match(/^Pages:\s*(\d+)/m)?.[1]),
        'PDF page count',
      );
      requireCheck(
        report.pages === Number(staticPdfInfo.match(/^Pages:\s*(\d+)/m)?.[1]),
        'static PDF page count',
      );
      requireCheck(
        staticPageTextMatches &&
          staticPageSizesMatch &&
          pdfText === staticPdfText,
        'static artifact parity',
      );
      requireCheck(screenGeometry === printGeometry, 'screen/print geometry');
      requireCheck(report.tocRefillGeometryMatches, 'TOC refill geometry');
      requireCheck(report.afterStartsPage, 'explicit page break');
      requireCheck(report.visibleOverflow.length === 0, 'visible overflow');
      requireCheck(
        rowOrderValid && codeOrderValid && mergedCodeLines === 0,
        'ordered table and code',
      );
      requireCheck(
        tablePagesMissingHeader.length === 0,
        'repeated table headers',
      );
      requireCheck(report.mermaidCount > 0, 'Mermaid diagram');
      requireCheck(
        report.tocLinks.length > 0 &&
          report.tocLinks.every(
            (link) =>
              link.destinationCount === 1 &&
              link.label === report.folios[link.destinationPage - 1],
          ),
        'TOC references',
      );
      requireCheck(
        report.tocPages.length > 0 &&
          report.tocPages.every(
            (page) => report.pageColors[page - 1] === 'rgb(232, 238, 251)',
          ),
        'TOC page background',
      );
      requireCheck(
        report.pageColors[report.afterPage - 1] === 'rgb(255, 238, 204)',
        'section page background',
      );
      requireCheck(
        coverAssembly?.pages === report.pages + 1 &&
          coverAssembly?.destinationsMatch &&
          coverAssembly?.annotationsMatch,
        'cover assembly links',
      );
      if (failures.length)
        throw new Error(`Feasibility checks failed: ${failures.join(', ')}`);
    }
  } finally {
    if (staticWindow && !staticWindow.isDestroyed()) staticWindow.destroy();
    if (!window.isDestroyed()) window.destroy();
    if (process.env.MPS_PAGED_KEEP_ARTIFACTS === '1') {
      console.error(`[probe] Retained temporary artifacts: ${directory}`);
    } else {
      rmSync(directory, { recursive: true, force: true });
    }
  }
}

app.on('window-all-closed', () => {});
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
