import { randomUUID } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { link, rename, unlink, writeFile } from 'node:fs/promises';
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  resolve,
} from 'node:path';
import { load as loadYaml } from 'js-yaml';
import {
  CliWorkerRequestSchema,
  DEFAULT_PAGE_NUMBER_SETTINGS,
  DEFAULT_PUBLICATION_STYLE_OVERRIDES,
  DEFAULT_TOC_SETTINGS,
  PageNumberSettingsSchema,
  PublishConfigurationSchema,
  PublicationStyleOverridesSchema,
  TocSettingsSchema,
  ThemeIdSchema,
  PageSizeIdSchema,
  type CliWorkerRequest,
} from '@markdown-publication/shared';
import type { z } from 'zod/v4';

const MAX_CONFIG_BYTES = 1024 * 1024;

export interface PublicationRequestOptions {
  command: 'build' | 'validate';
  sourcePath?: string;
  configPath?: string;
  outputPath?: string;
  format?: 'pdf' | 'html';
  themeId?: z.input<typeof ThemeIdSchema>;
  pageSize?: z.input<typeof PageSizeIdSchema>;
  toc?: z.input<typeof TocSettingsSchema>;
  pageNumber?: z.input<typeof PageNumberSettingsSchema>;
  styleOverrides?: z.input<typeof PublicationStyleOverridesSchema>;
  frontCover?: string | null;
  backCover?: string | null;
  strict?: boolean;
  overwrite?: boolean;
  enableToc?: boolean;
  enablePageNumber?: boolean;
  workingDirectory?: string;
}

export class SerialTaskQueue<T> {
  private readonly items: T[] = [];
  private running = false;
  private closed = false;

  enqueue(item: T): void {
    if (this.closed) throw new Error('The task queue is closed.');
    this.items.push(item);
  }

  remove(item: T): boolean {
    const index = this.items.indexOf(item);
    if (index < 0) return false;
    this.items.splice(index, 1);
    return true;
  }

  take(): T | undefined {
    if (this.closed || this.running) return undefined;
    const item = this.items.shift();
    if (item !== undefined) this.running = true;
    return item;
  }

  complete(): void {
    this.running = false;
  }

  close(): void {
    this.closed = true;
  }
}

interface LoadedConfiguration {
  config: z.infer<typeof PublishConfigurationSchema>;
  directory: string;
}

function resolveConfigPath(value: string, baseDirectory: string): string {
  return isAbsolute(value) ? resolve(value) : resolve(baseDirectory, value);
}

async function loadConfiguration(
  configPath: string | undefined,
  workingDirectory: string,
): Promise<LoadedConfiguration> {
  if (!configPath)
    return { config: { version: 1 }, directory: workingDirectory };
  if (!isAbsolute(configPath)) throw new Error('configPath must be absolute.');
  const path = resolve(configPath);
  const info = await stat(path);
  if (!info.isFile()) throw new Error('configPath must point to a file.');
  if (info.size > MAX_CONFIG_BYTES)
    throw new Error('Configuration files must be 1 MiB or smaller.');
  const config = PublishConfigurationSchema.parse(
    loadYaml(await readFile(path, 'utf8'), { maxAliasCount: 100 }),
  );
  return { config, directory: dirname(path) };
}

async function assertOutputIsSafe(
  outputPath: string,
  protectedPaths: string[],
): Promise<void> {
  if (!isAbsolute(outputPath)) throw new Error('outputPath must be absolute.');
  const target = resolve(outputPath);
  const targetReal = await realpath(target).catch(async () => {
    const parent = await realpath(dirname(target)).catch(() =>
      resolve(dirname(target)),
    );
    return resolve(parent, basename(target));
  });
  for (const protectedPath of protectedPaths) {
    if (!protectedPath) continue;
    const normalizedProtected = resolve(protectedPath);
    const protectedReal = await realpath(normalizedProtected).catch(
      async () => {
        const parent = await realpath(dirname(normalizedProtected)).catch(() =>
          resolve(dirname(normalizedProtected)),
        );
        return resolve(parent, basename(normalizedProtected));
      },
    );
    if (targetReal === protectedReal)
      throw new Error(
        `Output path must not replace an input file: ${basename(protectedPath)}.`,
      );
    const [outputInfo, protectedInfo] = await Promise.all([
      stat(targetReal).catch(() => undefined),
      stat(protectedReal).catch(() => undefined),
    ]);
    if (
      outputInfo &&
      protectedInfo &&
      outputInfo.dev === protectedInfo.dev &&
      outputInfo.ino === protectedInfo.ino
    ) {
      throw new Error(
        `Output path must not replace an input file: ${basename(protectedPath)}.`,
      );
    }
  }
}

export async function buildPublicationRequest(
  options: PublicationRequestOptions,
): Promise<CliWorkerRequest> {
  const workingDirectory = resolve(options.workingDirectory ?? process.cwd());
  const configPath = options.configPath;
  if (!configPath && !options.sourcePath)
    throw new Error('Provide sourcePath or configPath.');
  if (options.sourcePath && !isAbsolute(options.sourcePath))
    throw new Error('sourcePath must be absolute.');
  if (configPath && !isAbsolute(configPath))
    throw new Error('configPath must be absolute.');
  const { config, directory } = await loadConfiguration(
    configPath,
    workingDirectory,
  );
  const sourceValue = options.sourcePath ?? config.source;
  if (!sourceValue)
    throw new Error(
      'The configuration must contain source when sourcePath is omitted.',
    );
  const sourcePath = resolveConfigPath(
    sourceValue,
    options.sourcePath ? workingDirectory : directory,
  );
  const format = options.format ?? config.format ?? 'pdf';
  const outputValue = options.outputPath ?? config.output;
  const outputPath =
    options.command === 'validate'
      ? undefined
      : outputValue
        ? resolveConfigPath(
            outputValue,
            options.outputPath ? workingDirectory : directory,
          )
        : resolve(
            dirname(sourcePath),
            `${basename(sourcePath, extname(sourcePath))}.${format}`,
          );
  if (outputPath && !isAbsolute(outputPath))
    throw new Error('outputPath must be absolute.');

  const configuredFront = config.covers?.front
    ? resolveConfigPath(config.covers.front, directory)
    : undefined;
  const configuredBack = config.covers?.back
    ? resolveConfigPath(config.covers.back, directory)
    : undefined;
  const front =
    options.frontCover === null
      ? undefined
      : options.frontCover
        ? resolve(options.frontCover)
        : configuredFront;
  const back =
    options.backCover === null
      ? undefined
      : options.backCover
        ? resolve(options.backCover)
        : configuredBack;
  if (options.command === 'build' && outputPath) {
    await assertOutputIsSafe(outputPath, [
      sourcePath,
      configPath ?? '',
      front ?? '',
      back ?? '',
    ]);
  }

  const configuredToc = options.toc ?? config.toc ?? DEFAULT_TOC_SETTINGS;
  const configuredPageNumber =
    options.pageNumber ?? config.pageNumber ?? DEFAULT_PAGE_NUMBER_SETTINGS;
  const toc = options.enableToc
    ? { ...configuredToc, enabled: true }
    : configuredToc;
  const pageNumber = options.enablePageNumber
    ? { ...configuredPageNumber, enabled: true }
    : configuredPageNumber;

  return CliWorkerRequestSchema.parse({
    schemaVersion: 1,
    command: options.command,
    sourcePath,
    ...(outputPath ? { outputPath: resolve(outputPath) } : {}),
    format,
    themeId: options.themeId ?? config.themeId ?? 'rose',
    pageSize: options.pageSize ?? config.pageSize ?? 'A4',
    toc,
    pageNumber,
    covers: {
      ...(front ? { front: { path: front } } : {}),
      ...(back ? { back: { path: back } } : {}),
    },
    styleOverrides:
      options.styleOverrides ??
      config.styleOverrides ??
      DEFAULT_PUBLICATION_STYLE_OVERRIDES,
    strict: options.strict ?? false,
    force: options.overwrite ?? false,
  });
}

export function parsePublicationConfiguration(value: unknown) {
  return PublishConfigurationSchema.parse(value);
}

export async function writePublicationAtomically(
  outputPath: string,
  data: Uint8Array | string,
  overwrite: boolean,
  beforeCommit: () => void = () => undefined,
): Promise<void> {
  if (!isAbsolute(outputPath)) throw new Error('outputPath must be absolute.');
  if (!overwrite) {
    try {
      await stat(outputPath);
      throw Object.assign(new Error(`Output already exists: ${outputPath}`), {
        code: 'EEXIST',
      });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error) {
        if (error.code === 'EEXIST') throw error;
        if (error.code !== 'ENOENT') throw error;
      }
    }
  }
  const temporaryPath = join(
    dirname(outputPath),
    `.${basename(outputPath, extname(outputPath))}-${randomUUID()}.tmp`,
  );
  try {
    await writeFile(temporaryPath, data, { flag: 'wx' });
    beforeCommit();
    if (overwrite) await rename(temporaryPath, outputPath);
    else {
      await link(temporaryPath, outputPath);
      await unlink(temporaryPath).catch(() => undefined);
    }
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}
