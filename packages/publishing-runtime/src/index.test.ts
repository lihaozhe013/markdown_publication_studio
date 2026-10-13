import {
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildPublicationRequest,
  SerialTaskQueue,
  writePublicationAtomically,
} from './index.js';

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'mps-publishing-runtime-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('publication runtime request construction', () => {
  it('resolves config paths, applies explicit options, and chooses a source-relative default output', async () => {
    const sourcePath = join(directory, 'book.md');
    const configPath = join(directory, 'publish.yaml');
    await writeFile(sourcePath, '# Book');
    await writeFile(
      configPath,
      'version: 1\nsource: ./book.md\nformat: html\ntoc:\n  enabled: false\n  preset: modern-technical\n',
    );

    const request = await buildPublicationRequest({
      command: 'build',
      configPath,
      themeId: 'claude',
      enableToc: true,
    });

    expect(request.sourcePath).toBe(sourcePath);
    expect(request.outputPath).toBe(join(directory, 'book.html'));
    expect(request.format).toBe('html');
    expect(request.themeId).toBe('claude');
    expect(request.toc.enabled).toBe(true);
  });

  it('never lets overwrite replace a source, config, or cover asset through a path alias', async () => {
    const sourcePath = join(directory, 'book.md');
    const aliasPath = join(directory, 'source-alias.md');
    await writeFile(sourcePath, '# Book');
    await symlink(sourcePath, aliasPath);

    await expect(
      buildPublicationRequest({
        command: 'build',
        sourcePath,
        outputPath: aliasPath,
        overwrite: true,
      }),
    ).rejects.toThrow('must not replace an input file');
  });

  it('does not add an output path to validation requests', async () => {
    const sourcePath = join(directory, 'book.md');
    await writeFile(sourcePath, '# Book');

    const request = await buildPublicationRequest({
      command: 'validate',
      sourcePath,
    });

    expect(request.outputPath).toBeUndefined();
  });

  it('writes atomically and only replaces an existing output when requested', async () => {
    const outputPath = join(directory, 'book.html');
    await writePublicationAtomically(outputPath, '<h1>First</h1>', false);
    await expect(
      writePublicationAtomically(outputPath, '<h1>Second</h1>', false),
    ).rejects.toThrow('Output already exists');
    await writePublicationAtomically(outputPath, '<h1>Second</h1>', true);
    expect(await readFile(outputPath, 'utf8')).toBe('<h1>Second</h1>');
  });

  it('removes a temporary file when the commit guard rejects a cancelled task', async () => {
    const outputPath = join(directory, 'cancelled.html');
    await expect(
      writePublicationAtomically(
        outputPath,
        '<h1>Cancelled</h1>',
        false,
        () => {
          throw new Error('cancelled');
        },
      ),
    ).rejects.toThrow('cancelled');
    expect(await readdir(directory)).toEqual([]);
  });

  it('keeps serial task order and stops accepting work after close', () => {
    const queue = new SerialTaskQueue<number>();
    queue.enqueue(1);
    queue.enqueue(2);
    expect(queue.take()).toBe(1);
    expect(queue.take()).toBeUndefined();
    queue.complete();
    expect(queue.take()).toBe(2);
    queue.close();
    expect(queue.take()).toBeUndefined();
    expect(() => queue.enqueue(3)).toThrow('closed');
  });
});
