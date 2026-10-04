import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
} from 'electron';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

async function run() {
  // Exercise the built application and real preload/IPC/publishing services.
  // Native dialogs are substituted so the check remains unattended and isolated.
  const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const artifacts = await mkdtemp(join(tmpdir(), 'mps-workspace-'));
  for (const name of ['appData', 'userData', 'sessionData', 'logs']) {
    const directory = join(artifacts, name);
    await mkdir(directory);
    app.setPath(name, directory);
  }
  app.getAppPath = () => repository;
  app.on('browser-window-created', (_event, window) => {
    window.hide();
    window.webContents.setBackgroundThrottling(false);
  });
  const rendererErrors = [];
  app.on('web-contents-created', (_event, contents) => {
    contents.on('preload-error', (_event, _path, error) =>
      rendererErrors.push(error.message),
    );
    contents.on('console-message', (event) => {
      if (event.level === 'error' && !event.message.startsWith('[open-file]'))
        rendererErrors.push(event.message);
    });
  });
  let nextSource = join(repository, 'examples/sample-book/sample.md');
  let nextCover;
  let cancelDialog = false;
  let rejectPreview = false;
  let previewBuilds = 0;
  const registerHandler = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = (channel, listener) =>
    registerHandler(channel, async (...args) => {
      if (channel === 'preview:build') {
        previewBuilds += 1;
        if (rejectPreview) {
          rejectPreview = false;
          throw new Error('UI check: preview unavailable');
        }
      }
      const result = await listener(...args);
      if (channel === 'settings:save-page-number') await pause(150);
      return result;
    });
  dialog.showOpenDialog = async (_owner, options) => ({
    canceled: cancelDialog,
    filePaths: cancelDialog
      ? []
      : [options.title.startsWith('Choose cover') ? nextCover : nextSource],
  });
  dialog.showSaveDialog = async (options) => ({
    canceled: cancelDialog,
    filePath: cancelDialog
      ? undefined
      : join(artifacts, `publication.${options.filters[0].extensions[0]}`),
  });
  const requireDesktop = createRequire(
    join(repository, 'apps/desktop/package.json'),
  );
  const { PDFDocument } = requireDesktop('pdf-lib');
  const cover = await PDFDocument.create();
  cover.addPage([612, 792]);
  nextCover = join(artifacts, 'letter-cover.pdf');
  await writeFile(nextCover, await cover.save());
  const image = nativeImage.createFromPath(
    join(repository, 'apps/desktop/assets/icon-light.png'),
  );
  await writeFile(join(artifacts, 'art.png'), image.toPNG());
  const fixture = join(artifacts, 'publication.md');
  const chapters = Array.from(
    { length: 5 },
    (_, index) =>
      `## Chapter ${index + 1} · 技术出版\n\n${'A paragraph for checking continuous publication layout. 中文排版、图表与数学公式。\n\n'.repeat(15)}\n`,
  );
  await writeFile(
    fixture,
    `# Workspace verification\n\n![Local artwork](./art.png)\n\n${chapters.join('\n')}\n\n$E = mc^2$\n\n$$\n\\int_{0}^{1} x^2 dx = \\frac{1}{3}\n$$\n\n\`\`\`typescript\nconst example = '${'wide code '.repeat(25)}';\n\`\`\`\n\n| Column | 中文 | Detail |\n| --- | --- | --- |\n| Value | 内容 | Publication |\n\n\`\`\`mermaid\nflowchart LR\n  Markdown --> Preview --> PDF\n\`\`\`\n`,
  );

  const pause = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds));
  async function waitFor(predicate, label) {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      if (await predicate()) return;
      await pause(30);
    }
    throw new Error(`Timed out: ${label}`);
  }
  let window;
  const evaluate = (code) =>
    window.webContents.executeJavaScript(code, true).catch((error) => {
      throw new Error(`${error.message}\nRenderer check: ${code}`);
    });
  const click = (selector) =>
    evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const select = (selector, value) =>
    evaluate(
      `(() => { const element = document.querySelector(${JSON.stringify(selector)}); element.value = ${JSON.stringify(value)}; element.dispatchEvent(new Event('change', { bubbles: true })); })()`,
    );
  const idle = () =>
    waitFor(
      async () =>
        evaluate(
          `!document.querySelector('.status-indicator').classList.contains('is-busy')`,
        ),
      'idle workspace',
    );
  const rendered = () =>
    waitFor(
      async () =>
        evaluate(
          `document.querySelector('.status-message').textContent === 'Preview ready.' && Boolean(document.querySelector('iframe')?.contentDocument.querySelector('[data-preview-viewport]'))`,
        ),
      'ready preview',
    );
  async function capture(name) {
    await pause(80);
    await writeFile(
      join(artifacts, `${name}.png`),
      (
        await window.webContents.capturePage(undefined, { stayHidden: true })
      ).toPNG(),
    );
  }
  function command(label) {
    const search = (menu) => {
      for (const item of menu.items) {
        if (item.label === label) return item;
        if (item.submenu) {
          const match = search(item.submenu);
          if (match) return match;
        }
      }
    };
    const item = search(Menu.getApplicationMenu());
    assert.ok(item, `Menu command ${label}`);
    item.click();
  }
  async function geometry() {
    return evaluate(
      `(() => {
    const frame = document.querySelector('iframe');
    const body = frame?.contentDocument.body;
    const stage = document.querySelector('.paper-stage');
    const footer = document.querySelector('.style-panel-footer');
    return {
      windowWidth: innerWidth, rootWidth: document.documentElement.scrollWidth,
      toolbarHeight: document.querySelector('.document-toolbar').getBoundingClientRect().height,
      statusHeight: document.querySelector('.status-bar').getBoundingClientRect().height,
      frameWidth: frame?.clientWidth, frameHeight: frame?.clientHeight,
      bodyHeight: body?.scrollHeight, bodyWidth: body?.getBoundingClientRect().width,
      stageWidth: stage?.getBoundingClientRect().width,
      footerBottom: footer && !footer.closest('[hidden]') ? footer.getBoundingClientRect().bottom : null,
      statusTop: document.querySelector('.status-bar').getBoundingClientRect().top,
      documentDark: frame?.contentWindow.matchMedia('(prefers-color-scheme: dark)').matches,
      bodyColor: body ? frame.contentWindow.getComputedStyle(body).color : null,
      scheme: nativeSchemePlaceholder,
    };
  })()`.replace(
        'nativeSchemePlaceholder',
        JSON.stringify(nativeTheme.themeSource),
      ),
    );
  }
  const watchdog = setTimeout(() => {
    console.error('Desktop UI check exceeded its time limit.');
    app.exit(1);
  }, 180000);
  try {
    await import(pathToFileURL(join(repository, 'out/main/index.js')).href);
    await waitFor(
      () => BrowserWindow.getAllWindows().length > 0,
      'main window',
    );
    window = BrowserWindow.getAllWindows()[0];
    await waitFor(
      async () =>
        evaluate(
          `Boolean(document.querySelector('.workspace')) && !document.querySelector('.document-toolbar button').disabled`,
        ),
      'renderer and settings startup',
    );
    window.setContentSize(1280, 800);
    await capture('empty-light');
    await click('.document-toolbar button');
    await rendered();
    await click('#tab-style');
    await evaluate(
      `Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Customize styles').click()`,
    );
    assert.equal(
      await evaluate(
        `document.querySelectorAll('.style-section[open]').length`,
      ),
      2,
    );
    const buildsBeforeZoom = previewBuilds;
    command('Actual Size');
    await waitFor(
      async () =>
        evaluate(
          `document.querySelector('.zoom-value').textContent === '100%'`,
        ),
      'actual size',
    );
    const original = await geometry();
    command('Zoom In Preview');
    await waitFor(
      async () =>
        evaluate(
          `document.querySelector('.zoom-value').textContent === '110%'`,
        ),
      'zoom in',
    );
    const zoomed = await geometry();
    assert.equal(original.frameWidth, zoomed.frameWidth);
    assert.equal(original.bodyHeight, zoomed.bodyHeight);
    assert.equal(previewBuilds, buildsBeforeZoom, 'zoom must not compile');
    assert.ok(zoomed.stageWidth > original.stageWidth);
    await click('.zoom-controls button');
    await evaluate(
      `(() => { const input = document.querySelector('#style-body-size'); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(input, '15'); input.dispatchEvent(new Event('input', { bubbles: true })); })()`,
    );
    // The body font control's stable ID is provided by the existing style editor.
    await waitFor(
      async () =>
        evaluate(
          `document.querySelector('.style-panel-footer-status').textContent.includes('Unsaved')`,
        ),
      'draft style',
    );
    await waitFor(
      async () =>
        evaluate(
          `(() => { const frame = document.querySelector('iframe'); const body = frame?.contentDocument?.body; return Boolean(body) && frame.contentWindow.getComputedStyle(body).fontSize === '20px' && !document.querySelector('.status-indicator').classList.contains('is-busy'); })()`,
        ),
      'draft rendered',
    );
    await click('#tab-layout');
    await click('[aria-label="Show properties"]');
    await click('[aria-label="Show properties"]');
    await click('#tab-style');
    assert.equal(
      await evaluate(`document.querySelector('#style-body-size').value`),
      '15',
      'navigation preserves drafts',
    );
    const savedBefore = JSON.parse(
      await readFile(join(artifacts, 'userData/settings.json'), 'utf8').catch(
        () => '{}',
      ),
    );
    command('Export HTML…');
    await waitFor(
      async () =>
        evaluate(
          `document.querySelector('.status-message').textContent.startsWith('HTML written')`,
        ),
      'HTML draft export',
    );
    const exported = await readFile(
      join(artifacts, 'publication.html'),
      'utf8',
    );
    assert.match(exported, /font-size: 15pt/);
    assert.ok(
      !exported.includes('data-preview-viewport'),
      'viewport stays out of exports',
    );
    const savedAfter = JSON.parse(
      await readFile(join(artifacts, 'userData/settings.json'), 'utf8').catch(
        () => '{}',
      ),
    );
    assert.deepEqual(
      savedAfter.customStyle,
      savedBefore.customStyle,
      'export does not save draft',
    );
    await evaluate(
      `document.querySelector('.style-panel-footer > div button').click()`,
    );
    await rendered();
    await click('#tab-layout');
    nextSource = fixture;
    await click('.document-toolbar button');
    await rendered();
    assert.ok(
      await evaluate(
        `Boolean(document.querySelector('iframe').contentDocument.querySelector('.katex'))`,
      ),
    );
    assert.ok(
      await evaluate(
        `Boolean(document.querySelector('iframe').contentDocument.querySelector('svg.mermaid-diagram'))`,
      ),
    );
    await click('#toc-enabled');
    await rendered();
    await select('#page-size-select', 'Letter');
    await rendered();
    assert.equal((await geometry()).frameWidth, 816);
    await select('#page-size-select', 'A4');
    await rendered();
    await click('#page-number-enabled');
    await waitFor(
      async () =>
        evaluate(`!document.querySelector('#page-number-format').disabled`),
      'page number editing',
    );
    await evaluate(
      `(() => { const input = document.querySelector('#page-number-format'); input.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Page {page} of {pages}'); input.dispatchEvent(new Event('input', { bubbles: true })); })()`,
    );
    await pause(250);
    assert.equal(
      await evaluate(`document.querySelector('#page-number-format').value`),
      'Page {page} of {pages}',
      'older save responses preserve newer typing',
    );
    await evaluate(`document.querySelector('#page-number-format').blur()`);
    await idle();
    await click('#tab-covers');
    await click('.cover-choose-button');
    await idle();
    assert.equal(
      await evaluate(
        `document.querySelector('.export-control > button').disabled`,
      ),
      true,
      'mismatched cover disables PDF',
    );
    command('Export HTML…');
    await waitFor(
      async () =>
        evaluate(
          `document.querySelector('.status-message').textContent.startsWith('HTML written')`,
        ),
      'HTML with mismatched PDF cover',
    );
    nextCover = join(artifacts, 'art.png');
    await click('.cover-choose-button');
    await idle();
    command('Export PDF…');
    await waitFor(
      async () =>
        evaluate(
          `document.querySelector('.status-message').textContent.startsWith('PDF written')`,
        ),
      'real PDF export',
    );
    const pdf = await PDFDocument.load(
      await readFile(join(artifacts, 'publication.pdf')),
    );
    assert.ok(pdf.getPageCount() > 2);
    await click('#tab-style');
    for (const theme of ['github-markdown', 'modern-serif', 'claude', 'rose']) {
      await click(`.theme-option input[value="${theme}"]`);
      await waitFor(
        async () =>
          evaluate(
            `document.querySelector('iframe')?.contentDocument.body?.dataset.theme === '${theme}' && document.querySelector('.status-message').textContent === 'Preview ready.'`,
          ),
        `render ${theme}`,
      );
      assert.equal(
        await evaluate(
          `document.querySelector('iframe').contentDocument.body.dataset.theme`,
        ),
        theme,
      );
    }
    await evaluate(
      `Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Customize styles').click()`,
    );
    for (const appearance of ['light', 'dark']) {
      const before = await geometry();
      await select('.appearance-control select', appearance);
      await waitFor(
        async () =>
          evaluate(
            `document.querySelector('.workspace').dataset.appearance === '${appearance}'`,
          ),
        'appearance',
      );
      const after = await geometry();
      assert.equal(
        before.documentDark,
        after.documentDark,
        'application appearance must not alter publication media',
      );
      assert.equal(
        before.bodyColor,
        after.bodyColor,
        'application appearance must not alter publication colors',
      );
      assert.equal(nativeTheme.themeSource, 'system');
      for (const [width, height] of [
        [980, 680],
        [1280, 800],
        [1440, 920],
      ]) {
        window.setContentSize(width, height);
        await pause(80);
        const sizes = await geometry();
        assert.equal(sizes.rootWidth, sizes.windowWidth);
        assert.equal(sizes.toolbarHeight, 48);
        assert.equal(sizes.statusHeight, 26);
        assert.ok(sizes.frameHeight >= sizes.bodyHeight);
        assert.ok(
          sizes.footerBottom <= sizes.statusTop,
          'style actions remain visible',
        );
        await capture(`${appearance}-${width}`);
      }
    }
    await evaluate(
      `document.querySelector('.inspector-resizer').dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))`,
    );
    await waitFor(
      async () =>
        evaluate(
          `document.querySelector('.properties-panel').getBoundingClientRect().width === 440`,
        ),
      'panel width',
    );
    await waitFor(
      async () =>
        JSON.parse(
          await readFile(join(artifacts, 'userData/settings.json'), 'utf8'),
        ).uiPreferences.inspectorWidth === 440,
      'persisted width',
    );
    assert.equal(
      await evaluate(
        `document.querySelector('.diagnostics-toggle').textContent`,
      ),
      '0 errors · 0 warnings',
      'unused KaTeX size fonts do not produce warnings',
    );
    await click('.diagnostics-toggle');
    window.setContentSize(980, 680);
    await capture('dark-diagnostics-980');
    assert.ok(
      (await geometry()).footerBottom <= (await geometry()).statusTop - 220,
      'style actions remain visible with diagnostics',
    );
    await click('.diagnostics-panel .icon-button');
    rejectPreview = true;
    await click('#tab-layout');
    await select('#page-size-select', 'Letter');
    await waitFor(
      async () =>
        evaluate(
          `!document.querySelector('.diagnostics-panel').hidden && document.querySelector('.status-message').textContent.includes('preview unavailable')`,
        ),
      'automatic error diagnostics',
    );
    await select('#page-size-select', 'A4');
    await rendered();
    cancelDialog = true;
    command('Export PDF…');
    await waitFor(
      async () =>
        evaluate(
          `document.querySelector('.status-message').textContent === 'Export cancelled.'`,
        ),
      'cancelled export',
    );
    cancelDialog = false;
    command('Close Current Publication');
    await waitFor(
      async () =>
        evaluate(
          `Boolean(document.querySelector('.empty-state')) && !document.querySelector('iframe')`,
        ),
      'close publication',
    );
    window.webContents.reload();
    await waitFor(
      async () =>
        evaluate(
          `Boolean(document.querySelector('.workspace')) && !document.querySelector('.document-toolbar button').disabled`,
        ),
      'reopen preferences',
    );
    assert.equal(
      await evaluate(`document.querySelector('.workspace').dataset.appearance`),
      'dark',
    );
    assert.equal(
      await evaluate(
        `document.querySelector('.properties-panel').getBoundingClientRect().width`,
      ),
      440,
    );
    assert.equal(rendererErrors.length, 0, rendererErrors.join('\n'));
    console.log(
      `Desktop UI checks passed: real preview, drafts, PDF/HTML, diagnostics, menus, persisted preferences, six size/appearance combinations.\nArtifacts: ${artifacts}`,
    );
    clearTimeout(watchdog);
    app.exit(0);
  } catch (error) {
    console.error(error);
    console.error(`Artifacts: ${artifacts}`);
    clearTimeout(watchdog);
    app.exit(1);
  }
}
void run().catch((error) => {
  console.error(error);
  app.exit(1);
});
