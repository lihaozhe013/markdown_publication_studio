import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CliWorkerRequestSchema } from '@markdown-publication/shared';
import {
  buildWorkerRequest,
  exitCodeForResult,
  installSkill,
  parseCommand,
  resolveRuntimeCandidate,
  runWorker,
} from './index.js';

let fixtureDirectory: string;

beforeEach(async () => {
  fixtureDirectory = await mkdtemp(join(tmpdir(), 'mps-cli-tests-'));
});

afterEach(async () => {
  await rm(fixtureDirectory, { recursive: true, force: true });
});

describe('CLI configuration', () => {
  it('resolves source, output, and covers relative to publish.yaml', async () => {
    const configPath = join(fixtureDirectory, 'publish.yaml');
    await writeFile(
      configPath,
      [
        'version: 1',
        'source: ./draft one.md',
        'format: pdf',
        'output: ./published/book.pdf',
        'themeId: claude',
        'covers:',
        '  front: ./cover.png',
        'pageNumber:',
        '  enabled: true',
        '  fontFamily: source-han-sans',
        '  fontSizePt: 10',
        '  style: normal',
        "  format: '{page} / {pages}'",
        '  firstPageMode: all-pages',
      ].join('\n'),
    );

    const request = await buildWorkerRequest(
      'build',
      parseCommand(['build', '--config', configPath]),
    );

    expect(request.sourcePath).toBe(join(fixtureDirectory, 'draft one.md'));
    expect(request.outputPath).toBe(
      join(fixtureDirectory, 'published/book.pdf'),
    );
    expect(request.themeId).toBe('claude');
    expect(request.covers.front?.path).toBe(
      join(fixtureDirectory, 'cover.png'),
    );
    expect(request.pageNumber.enabled).toBe(true);
  });

  it('gives command arguments precedence over configuration and preserves config output paths', async () => {
    const configPath = join(fixtureDirectory, 'publish.yaml');
    await writeFile(
      configPath,
      'version: 1\nsource: config.md\nformat: html\noutput: ./configured.html\nthemeId: claude\ntoc:\n  enabled: false\n  preset: modern-technical\n',
    );

    const request = await buildWorkerRequest(
      'build',
      parseCommand([
        'build',
        'explicit.md',
        '--config',
        configPath,
        '--format',
        'pdf',
        '--theme',
        'rose',
        '--toc',
      ]),
    );

    expect(request.sourcePath).toBe(resolve('explicit.md'));
    expect(request.outputPath).toBe(join(fixtureDirectory, 'configured.html'));
    expect(request.format).toBe('pdf');
    expect(request.themeId).toBe('rose');
    expect(request.toc).toEqual({ enabled: true, preset: 'modern-technical' });
  });

  it('rejects unsupported fields and values before starting a desktop worker', async () => {
    const configPath = join(fixtureDirectory, 'publish.yaml');
    await writeFile(configPath, 'version: 1\nsource: book.md\npageSize: A3\n');

    await expect(
      buildWorkerRequest(
        'build',
        parseCommand(['build', '--config', configPath]),
      ),
    ).rejects.toThrow('A4');

    await writeFile(configPath, 'version: 1\nsource: book.md\nunknown: true\n');
    await expect(
      buildWorkerRequest(
        'build',
        parseCommand(['build', '--config', configPath]),
      ),
    ).rejects.toThrow('Unrecognized key');
  });
});

describe('CLI result exit codes', () => {
  it('preserves the documented failure categories', () => {
    expect(
      exitCodeForResult({
        schemaVersion: 1,
        command: 'build',
        ok: true,
        diagnostics: [],
        versions: { cli: '0.1.0' },
      }),
    ).toBe(0);
    expect(
      exitCodeForResult({
        schemaVersion: 1,
        command: 'build',
        ok: false,
        diagnostics: [],
        errorCode: 'usage',
        versions: { cli: '0.1.0' },
      }),
    ).toBe(2);
    expect(
      exitCodeForResult({
        schemaVersion: 1,
        command: 'doctor',
        ok: false,
        diagnostics: [],
        errorCode: 'runtime',
        versions: { cli: '0.1.0' },
      }),
    ).toBe(3);
    expect(
      exitCodeForResult({
        schemaVersion: 1,
        command: 'build',
        ok: false,
        diagnostics: [],
        errorCode: 'io',
        versions: { cli: '0.1.0' },
      }),
    ).toBe(4);
    expect(
      exitCodeForResult({
        schemaVersion: 1,
        command: 'build',
        ok: false,
        diagnostics: [],
        errorCode: 'timeout',
        versions: { cli: '0.1.0' },
      }),
    ).toBe(124);
    expect(
      exitCodeForResult({
        schemaVersion: 1,
        command: 'build',
        ok: false,
        diagnostics: [],
        errorCode: 'cancelled',
        versions: { cli: '0.1.0' },
      }),
    ).toBe(130);
  });
});

describe('Agent Skill installation', () => {
  it('installs to a custom directory, is idempotent, preserves other files, and requires force for edits', async () => {
    const skillRoot = join(fixtureDirectory, 'agent skills');
    const options = { dir: skillRoot };
    const targetPath = join(skillRoot, 'markdown-publication');

    expect(await installSkill(options)).toBe(targetPath);
    await writeFile(join(targetPath, 'local-note.md'), 'keep this file');
    expect(await installSkill(options)).toBe(targetPath);
    await writeFile(join(targetPath, 'SKILL.md'), 'user edit');

    await expect(installSkill(options)).rejects.toThrow('Use --force');
    expect(await installSkill({ ...options, force: true })).toBe(targetPath);
    await expect(
      readFile(join(targetPath, 'SKILL.md'), 'utf8'),
    ).resolves.toContain('name: markdown-publication');
    await expect(
      readFile(join(targetPath, 'local-note.md'), 'utf8'),
    ).resolves.toBe('keep this file');
  });
});

describe('Desktop runtime protocol', () => {
  it('discovers a packaged runtime and rejects a mismatched worker protocol', async () => {
    const runtimeDirectory = join(fixtureDirectory, 'studio');
    const executablePath = join(
      runtimeDirectory,
      'markdown-publication-studio',
    );
    const manifestPath = join(
      runtimeDirectory,
      'resources',
      'mps-runtime.json',
    );
    await mkdir(join(runtimeDirectory, 'resources'), { recursive: true });
    await writeFile(executablePath, '');
    await writeFile(
      manifestPath,
      JSON.stringify({
        productId: 'com.markdownpublication.studio',
        version: '0.1.0',
        workerProtocol: 1,
      }),
    );

    await expect(
      resolveRuntimeCandidate(executablePath),
    ).resolves.toMatchObject({
      executablePath,
      version: '0.1.0',
      workerProtocol: 1,
      manifestPath,
    });

    await writeFile(
      manifestPath,
      JSON.stringify({
        productId: 'com.markdownpublication.studio',
        version: '0.2.0',
        workerProtocol: 2,
      }),
    );
    await expect(resolveRuntimeCandidate(executablePath)).rejects.toThrow(
      'incompatible',
    );
  });

  it.skipIf(process.platform === 'win32')(
    'reads a JSON result from the child and terminates the worker tree on timeout',
    async () => {
      const runnerPath = join(fixtureDirectory, 'worker.mjs');
      const executablePath = join(fixtureDirectory, 'studio-worker');
      const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
      await writeFile(
        runnerPath,
        [
          "import { dirname, join } from 'node:path';",
          "import { writeFile } from 'node:fs/promises';",
          "await writeFile(join(dirname(process.argv[2]), 'result.json'), JSON.stringify({ schemaVersion: 1, command: 'validate', ok: true, diagnostics: [], versions: { desktop: '0.1.0', workerProtocol: 1 } }));",
        ].join('\n'),
      );
      await writeFile(
        executablePath,
        `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(runnerPath)} "$2"\n`,
      );
      await chmod(executablePath, 0o755);

      const request = CliWorkerRequestSchema.parse({
        schemaVersion: 1,
        command: 'validate',
        sourcePath: join(fixtureDirectory, 'book.md'),
      });
      await expect(
        runWorker(
          request,
          { executablePath, version: '0.1.0', workerProtocol: 1 },
          2000,
        ),
      ).resolves.toMatchObject({ ok: true, versions: { desktop: '0.1.0' } });

      await writeFile(executablePath, '#!/bin/sh\nsleep 10\n');
      await chmod(executablePath, 0o755);
      await expect(
        runWorker(
          request,
          { executablePath, version: '0.1.0', workerProtocol: 1 },
          30,
        ),
      ).rejects.toMatchObject({ exitCode: 124 });
    },
  );
});
