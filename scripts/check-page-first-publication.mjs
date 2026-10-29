import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { app } from 'electron';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const requireDesktop = createRequire(
  join(repository, 'apps/desktop/package.json'),
);
const { PDFDocument, PDFArray, PDFDict, PDFName, StandardFonts, rgb } =
  requireDesktop('pdf-lib');

const failures = [];
const notes = [];
let artifacts = '';

function check(condition, message, details) {
  if (condition) return;
  failures.push(
    details === undefined ? message : `${message} (${JSON.stringify(details)})`,
  );
}

function pdfInfo(path, options = []) {
  return execFileSync('pdfinfo', [...options, path], { encoding: 'utf8' });
}

function pdfText(path) {
  return execFileSync('pdftotext', ['-layout', path, '-'], {
    encoding: 'utf8',
  });
}

function sheetColor(pdfPath, page) {
  const outputPath = join(artifacts, `sheet-${page}.png`);
  execFileSync('pdftoppm', [
    '-r',
    '36',
    '-f',
    String(page),
    '-l',
    String(page),
    '-singlefile',
    '-png',
    pdfPath,
    outputPath.replace(/\.png$/u, ''),
  ]);
  return execFileSync(
    'python3',
    [
      '-c',
      `from PIL import Image; im=Image.open(${JSON.stringify(outputPath)}).convert("RGB"); print(im.getpixel((3,3)))`,
    ],
    { encoding: 'utf8' },
  ).trim();
}

async function runWorker(request, label) {
  const directory = join(artifacts, label);
  await mkdir(directory, { recursive: true });
  const requestPath = join(directory, 'request.json');
  const resultPath = join(directory, 'result.json');
  const requestBody = {
    schemaVersion: 1,
    themeId: 'claude',
    pageSize: 'A4',
    toc: { enabled: true, preset: 'classic-book' },
    pageNumber: {
      enabled: true,
      fontFamily: 'source-sans-3',
      fontSizePt: 10,
      style: 'normal',
      format: '{page} / {pages}',
      firstPageMode: 'all-pages',
    },
    pageLayout: { enabled: true, restartBodyAfterToc: true },
    covers: {},
    strict: false,
    force: true,
    ...request,
  };
  await writeFile(requestPath, JSON.stringify(requestBody));
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(
      process.execPath,
      [repository, '--mps-worker', requestPath],
      { cwd: repository, stdio: ['ignore', 'ignore', 'pipe'] },
    );
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-4000);
    });
    child.on('error', rejectPromise);
    child.on('close', async () => {
      try {
        const result = JSON.parse(await readFile(resultPath, 'utf8'));
        if (!result.ok) {
          rejectPromise(
            new Error(
              `${label} failed: ${result.error ?? 'unknown error'}\n${stderr}`,
            ),
          );
          return;
        }
        resolvePromise(result);
      } catch (error) {
        rejectPromise(
          new Error(`${label} produced no result: ${String(error)}\n${stderr}`),
        );
      }
    });
  });
}

async function main() {
  artifacts = await mkdtemp(join(tmpdir(), 'mps-page-first-'));
  const rows = Array.from(
    { length: 40 },
    (_, index) => `| Row ${index} | 内容 ${index} |`,
  ).join('\n');
  const code = Array.from(
    { length: 90 },
    (_, index) => `const line${index} = ${index};`,
  ).join('\n');
  const sections = Array.from(
    { length: 36 },
    (_, index) =>
      `### Section ${index}\n\nParagraph ${index} for pagination. ${'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(4)}`,
  ).join('\n\n');
  const book = [
    '# Acceptance book',
    '',
    'Opening paragraph with inline math $E = mc^2$.',
    '',
    '$$',
    '\\int_0^1 x^2 dx = \\frac{1}{3}',
    '$$',
    '',
    '```mermaid',
    'flowchart LR',
    '  Markdown --> Preview --> PDF',
    '```',
    '',
    sections,
    '',
    '| Column | Value |',
    '| --- | --- |',
    rows,
    '',
    '```ts',
    '// This literal directive must not end a page.',
    'const escaped = "\\\\clearpage";',
    code,
    '```',
    '',
    '\\clearpage',
    '',
    '## After clear page',
    '',
    'This heading must open a new page.',
    '',
    '\\pagetemplate{section}',
    '',
    '## Section template',
    '',
    `${'Section body copy for the tinted template page. '.repeat(20)}`,
    '',
  ].join('\n');
  const sourcePath = join(artifacts, 'book.md');
  await writeFile(sourcePath, book);

  const cover = await PDFDocument.create();
  const coverPage = cover.addPage([595.28, 841.89]);
  const coverFont = await cover.embedFont(StandardFonts.HelveticaBold);
  coverPage.drawText('ACCEPTANCE COVER', {
    x: 120,
    y: 600,
    size: 26,
    font: coverFont,
    color: rgb(0.1, 0.2, 0.4),
  });
  const coverPath = join(artifacts, 'cover.pdf');
  await writeFile(coverPath, await cover.save());

  const validated = await runWorker(
    { command: 'validate', sourcePath },
    'validate',
  );
  const plan = validated.data?.pagination;
  check(Boolean(plan), 'validation reports a page plan');
  if (!plan) throw new Error('No pagination plan was produced.');

  const generatedPages = plan.pages.length;
  check(generatedPages > 2, 'publication spans multiple pages', {
    generatedPages,
  });
  check(plan.tocPages.length >= 2, 'contents section spans multiple pages', {
    tocPages: plan.tocPages,
  });
  check(
    plan.bodyStartPage === plan.tocPages.length + 1,
    'body starts after contents',
    { bodyStartPage: plan.bodyStartPage, tocPages: plan.tocPages },
  );

  const tocPages = plan.pages.filter((page) => page.kind === 'toc');
  const bodyPages = plan.pages.filter((page) => page.kind === 'body');
  check(
    tocPages.every((page) => page.template === 'toc'),
    'every contents page uses the contents template',
  );
  check(
    bodyPages[0]?.folio === `1 / ${bodyPages.length}`,
    'body numbering restarts at one after the contents',
    { folio: bodyPages[0]?.folio },
  );
  check(
    bodyPages.at(-1)?.folio === `${bodyPages.length} / ${bodyPages.length}`,
    'body folios use the scoped body total',
    { folio: bodyPages.at(-1)?.folio },
  );
  check(
    plan.pages.every((page) => page.physicalPage === page.generatedPage),
    'the preview plan numbers generated pages from one',
  );

  const sectionPages = plan.pages.filter((page) => page.template === 'section');
  check(sectionPages.length >= 1, 'a section uses the section template');

  const build = await runWorker(
    {
      command: 'build',
      sourcePath,
      outputPath: join(artifacts, 'book.pdf'),
      covers: { front: { path: coverPath } },
    },
    'build',
  );
  const plannedWithCover = build.data?.pagination;
  check(Boolean(plannedWithCover), 'build reports the assembled page plan');
  if (!plannedWithCover) throw new Error('Build produced no page plan.');
  check(
    plannedWithCover.coverPages === 1,
    'front cover occupies one planned page',
    { coverPages: plannedWithCover.coverPages },
  );
  const pdfPath = join(artifacts, 'book.pdf');
  const info = pdfInfo(pdfPath);
  const pdfPages = Number(/^Pages:\s*(\d+)/m.exec(info)?.[1]);
  check(
    pdfPages === plannedWithCover.pages.length + plannedWithCover.coverPages,
    'PDF page count equals generated pages plus covers',
    { pdfPages, generated: plannedWithCover.pages.length },
  );
  check(
    /Page size:\s+595(?:\.\d+)? x 841(?:\.\d+)? pts \(A4\)/u.test(info),
    'PDF pages keep the A4 media box',
    { size: /Page size:.*/u.exec(info)?.[0] },
  );

  const text = pdfText(pdfPath);
  const pdfPageTexts = text.split('\f');
  check(
    pdfPageTexts[0]?.includes('ACCEPTANCE COVER'),
    'the front cover is the first PDF page',
    { first: pdfPageTexts[0]?.trim().slice(0, 40) },
  );
  check(
    pdfPageTexts[1]?.includes('Contents'),
    'the contents page follows the cover',
    { second: pdfPageTexts[1]?.trim().slice(0, 40) },
  );

  for (const page of plannedWithCover.pages) {
    if (!page.folio) continue;
    const pageText = pdfPageTexts[page.physicalPage - 1] ?? '';
    const normalized = page.folio.replaceAll(' / ', '/');
    check(
      pageText.replaceAll(' / ', '/').includes(normalized),
      `page ${page.physicalPage} shows its folio`,
      { expected: page.folio, text: pageText.trim().slice(-40) },
    );
  }

  const destinations = pdfInfo(pdfPath, ['-dests']);
  const named = Object.fromEntries(
    [...destinations.matchAll(/^\s*(\d+)\s+\[.*\]\s+"([^"]+)"/gmu)].map(
      (match) => [match[2], Number(match[1])],
    ),
  );
  check(
    Object.keys(named).length >= 20,
    'PDF exposes named destinations for headings',
    { destinations: Object.keys(named).length },
  );

  const document = await PDFDocument.load(await readFile(pdfPath));
  const linkTargets = [];
  for (const page of document.getPages()) {
    const annotations = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
    if (!annotations) continue;
    for (let index = 0; index < annotations.size(); index += 1) {
      const annotation = annotations.lookup(index, PDFDict);
      const destination = annotation.get(PDFName.of('Dest'));
      if (destination instanceof PDFName) {
        linkTargets.push(destination.decodeText());
      }
    }
  }
  check(
    linkTargets.length >= 20,
    'contents links stay clickable after assembly',
    { links: linkTargets.length },
  );
  check(
    linkTargets.every((target) => named[target] !== undefined),
    'every contents link resolves to a named destination',
  );

  const assembledSectionPage = plannedWithCover.pages.find(
    (page) => page.template === 'section',
  );
  check(
    named['heading-book-section-template'] ===
      assembledSectionPage?.physicalPage,
    'the section template heading starts its planned page',
    {
      destination: named['heading-book-section-template'],
      planned: assembledSectionPage?.physicalPage,
    },
  );
  check(
    (pdfPageTexts[(named['heading-book-section-template'] ?? 0) - 1] ?? '')
      .trimStart()
      .startsWith('Section template'),
    'the section template heading opens its destination page',
  );
  const clearPageIndex = named['heading-book-after-clear-page'];
  check(
    Boolean(clearPageIndex) &&
      (pdfPageTexts[clearPageIndex - 1] ?? '')
        .trimStart()
        .startsWith('After clear page'),
    'the heading after clearpage opens its destination page',
    {
      page: clearPageIndex,
      text: (pdfPageTexts[clearPageIndex - 1] ?? '').trim().slice(0, 40),
    },
  );
  check(
    pdfPageTexts.some((pageText) => pageText.includes('clearpage')),
    'a literal clearpage inside code is preserved as text',
  );
  check(
    text.includes('Row 39') && text.includes('line89 = 89'),
    'table rows and code lines survive pagination',
  );
  const tablePages = pdfPageTexts.filter((pageText) =>
    /Row\s+\d+/u.test(pageText),
  );
  check(
    tablePages.length >= 2 &&
      tablePages.every((pageText) => pageText.includes('Column')),
    'every table page repeats the header',
  );

  const tocColor = sheetColor(pdfPath, plannedWithCover.pages[0].physicalPage);
  const defaultBodyPage = plannedWithCover.pages.find(
    (page) => page.template === 'default',
  );
  const bodyColor = sheetColor(pdfPath, defaultBodyPage.physicalPage);
  const sectionColor = sheetColor(pdfPath, assembledSectionPage.physicalPage);
  check(
    tocColor !== '(255, 255, 255)',
    'contents pages paint the whole sheet',
    { tocColor },
  );
  check(
    bodyColor === '(255, 255, 255)',
    'default body pages keep a white sheet',
    { bodyColor },
  );
  check(
    sectionColor !== bodyColor && sectionColor !== tocColor,
    'section template paints a different whole sheet',
    { sectionColor, bodyColor, tocColor },
  );

  const large = await runWorker(
    {
      command: 'validate',
      sourcePath,
      styleOverrides: { version: 1, body: { fontSizePt: 16 } },
    },
    'validate-large',
  );
  const largePlan = large.data?.pagination;
  check(Boolean(largePlan), 'typography change still produces a plan');
  if (largePlan) {
    const largeBody = largePlan.pages.filter((page) => page.kind === 'body');
    check(
      largePlan.pages.length !== generatedPages,
      'typography change repaginates the publication',
      { before: generatedPages, after: largePlan.pages.length },
    );
    check(
      largeBody[0]?.folio === `1 / ${largeBody.length}`,
      'typography change updates scoped totals',
      { folio: largeBody[0]?.folio },
    );
    check(
      largePlan.pages.some((page) => page.template === 'section'),
      'typography change keeps template scoping',
    );
  }

  notes.push(`generated pages: ${generatedPages}`);
  notes.push(`PDF pages: ${pdfPages} (with cover)`);
  notes.push(`contents pages: ${plannedWithCover.tocPages.join(', ')}`);
  notes.push(`PDF size: ${/^File size:.*/mu.exec(info)?.[0]?.trim()}`);
}

app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  try {
    await main();
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  } finally {
    if (failures.length === 0) {
      console.log('Page-first publication checks passed.');
      for (const note of notes) console.log(`  ${note}`);
      console.log(`Artifacts: ${artifacts}`);
      app.exit(0);
    } else {
      console.error('Page-first publication checks failed:');
      for (const failure of failures) console.error(`  - ${failure}`);
      console.error(`Artifacts: ${artifacts}`);
      app.exit(1);
    }
  }
});
