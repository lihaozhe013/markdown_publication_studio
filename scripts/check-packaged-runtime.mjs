import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { app } from 'electron';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const requireDesktop = createRequire(
  join(repository, 'apps/desktop/package.json'),
);
const { PDFDocument } = requireDesktop('pdf-lib');
const failures = [];

function hasPoppler() {
  try {
    execFileSync('pdfinfo', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function pdfPageCount(path) {
  if (hasPoppler()) {
    const info = execFileSync('pdfinfo', [path], { encoding: 'utf8' });
    return Number(/^Pages:\s*(\d+)/mu.exec(info)?.[1]);
  }
  const document = await PDFDocument.load(await readFile(path));
  return document.getPageCount();
}

function check(condition, message, details) {
  if (condition) return;
  failures.push(
    details === undefined ? message : `${message} (${JSON.stringify(details)})`,
  );
}

async function findExecutable() {
  const candidates = [
    join(repository, 'release/linux-unpacked/markdown-publication-studio'),
    join(repository, 'release/win-unpacked/Markdown Publication Studio.exe'),
    join(
      repository,
      'release/mac-arm64/Markdown Publication Studio.app/Contents/MacOS/Markdown Publication Studio',
    ),
    join(
      repository,
      'release/mac/Markdown Publication Studio.app/Contents/MacOS/Markdown Publication Studio',
    ),
  ];
  for (const candidate of candidates) {
    try {
      await stat(candidate);
      return candidate;
    } catch {
      // Try the next packaged layout.
    }
  }
  return undefined;
}

function runPackagedWorker(executable, requestPath) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(executable, ['--mps-worker', requestPath], {
      cwd: repository,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-4000);
    });
    child.on('error', rejectPromise);
    child.on('close', async () => {
      try {
        resolvePromise(
          JSON.parse(
            await readFile(join(dirname(requestPath), 'result.json'), 'utf8'),
          ),
        );
      } catch (error) {
        rejectPromise(
          new Error(
            `Packaged worker produced no result: ${String(error)}\n${stderr}`,
          ),
        );
      }
    });
  });
}

async function main() {
  const executable = await findExecutable();
  if (!executable) {
    console.log(
      'No packaged application found. Build one first, for example: pnpm exec electron-builder --linux dir --publish never',
    );
    return;
  }
  const artifacts = await mkdtemp(join(tmpdir(), 'mps-packaged-'));
  const directory = join(artifacts, 'job');
  await mkdir(directory, { recursive: true });
  const sourcePath = join(artifacts, 'packaged.md');
  await writeFile(
    sourcePath,
    [
      '# Packaged publication',
      '',
      ...Array.from(
        { length: 6 },
        (_, index) =>
          `## Chapter ${index}\n\n${'Packaged runtime body copy. '.repeat(30)}\n`,
      ),
      '',
      '\\clearpage',
      '',
      '## After clear page',
      '',
      '\\pagetemplate{section}',
      '',
      '## Section template',
      '',
      'Section body.',
    ].join('\n'),
  );
  const requestPath = join(directory, 'request.json');
  const outputPath = join(artifacts, 'packaged.pdf');
  await writeFile(
    requestPath,
    JSON.stringify({
      schemaVersion: 1,
      command: 'build',
      sourcePath,
      outputPath,
      format: 'pdf',
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
    }),
  );

  const result = await runPackagedWorker(executable, requestPath);
  check(result.ok, 'packaged worker exports a PDF', { error: result.error });
  const plan = result.data?.pagination;
  check(Boolean(plan), 'packaged worker reports a page plan');
  if (!result.ok || !plan) return;

  const pdfPages = await pdfPageCount(outputPath);
  check(
    pdfPages === plan.pages.length,
    'packaged PDF matches the planned page count',
    { pdfPages, planned: plan.pages.length },
  );
  check(
    plan.pages.some((page) => page.template === 'section'),
    'packaged runtime applies section templates',
  );
  check(
    plan.pages.filter((page) => page.kind === 'body')[0]?.folio ===
      `1 / ${plan.pages.filter((page) => page.kind === 'body').length}`,
    'packaged runtime restarts body numbering',
  );
  if (hasPoppler()) {
    const text = execFileSync('pdftotext', ['-layout', outputPath, '-'], {
      encoding: 'utf8',
    });
    check(
      text.includes('After clear page') && text.includes('Section template'),
      'packaged runtime preserves layout directives',
    );
  } else {
    console.log('  pdf text checks skipped: poppler is not installed');
  }
  // A successful page plan proves the packaged asar contains both the engine
  // bundle and the layout program; a missing asset fails layout outright.
  console.log('Packaged page-first runtime checks passed.');
  console.log(`  executable: ${executable}`);
  console.log(`  PDF pages: ${pdfPages}`);
  console.log(`  generated pages: ${plan.pages.length}`);
}

app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  try {
    await main();
  } catch (error) {
    failures.push(
      error instanceof Error ? (error.stack ?? error.message) : String(error),
    );
  } finally {
    if (failures.length > 0) {
      console.error('Packaged runtime checks failed:');
      for (const failure of failures) console.error(`  - ${failure}`);
      app.exit(1);
    } else {
      app.exit(0);
    }
  }
});
