#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import {
  basename,
  delimiter,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { parseArgs } from 'node:util';
import cliPackage from '../package.json' with { type: 'json' };
import { load as loadYaml } from 'js-yaml';
import { z } from 'zod';
import {
  BUILT_IN_THEMES,
  CLI_WORKER_PROTOCOL_VERSION,
  CliWorkerRequestSchema,
  CliWorkerResponseSchema,
  DEFAULT_PAGE_NUMBER_SETTINGS,
  DEFAULT_TOC_SETTINGS,
  PAGE_SIZE_DEFINITIONS,
  PageNumberFirstPageModeSchema,
  PageNumberFontIdSchema,
  PageNumberStyleSchema,
  PageSizeIdSchema,
  PageNumberSettingsSchema,
  PublishConfigurationSchema,
  PublicationStyleOverridesSchema,
  ThemeIdSchema,
  TOC_PRESET_DEFINITIONS,
  type CliWorkerRequest,
  type CliWorkerResponse,
  type PublicationDiagnostic,
  type PublishConfiguration,
} from '@markdown-publication/shared';

const PRODUCT_ID = 'com.markdownpublication.studio';
const PRODUCT_NAME = 'Markdown Publication Studio';
const DEFAULT_TIMEOUT_MS = 120_000;
const CONFIG_MAX_BYTES = 1024 * 1024;

const CLI_RESULT_SCHEMA = z
  .object({
    schemaVersion: z.literal(1),
    command: z.string(),
    ok: z.boolean(),
    data: z.record(z.string(), z.unknown()).optional(),
    diagnostics: CliWorkerResponseSchema.shape.diagnostics.default([]),
    error: z.string().optional(),
    errorCode: z.string().optional(),
    versions: z
      .object({
        cli: z.string(),
        desktop: z.string().optional(),
        workerProtocol: z.number().optional(),
      })
      .strict(),
  })
  .strict();

const RUNTIME_REGISTRATION_SCHEMA = z
  .object({
    productId: z.literal(PRODUCT_ID),
    executablePath: z.string().min(1),
    version: z.string().min(1),
    workerProtocol: z.number().int().positive(),
  })
  .strict();

const RUNTIME_MANIFEST_SCHEMA = z
  .object({
    productId: z.literal(PRODUCT_ID),
    version: z.string().min(1),
    workerProtocol: z.number().int().positive(),
  })
  .strict();

type CliResult = z.infer<typeof CLI_RESULT_SCHEMA>;

class CliError extends Error {
  constructor(
    message: string,
    readonly exitCode: number,
    readonly errorCode: string,
    readonly diagnostics: PublicationDiagnostic[] = [],
  ) {
    super(message);
    this.name = 'CliError';
  }
}

interface CliOptions {
  help?: boolean;
  version?: boolean;
  json?: boolean;
  config?: string;
  format?: 'pdf' | 'html';
  output?: string;
  theme?: string;
  'page-size'?: string;
  toc?: boolean;
  'page-numbers'?: boolean;
  'front-cover'?: string;
  'back-cover'?: string;
  strict?: boolean;
  force?: boolean;
  'timeout-ms'?: string;
  app?: string;
  agent?: string;
  scope?: string;
  dir?: string;
}

interface LocatedRuntime {
  executablePath: string;
  version: string;
  workerProtocol: number;
  manifestPath?: string;
  registrationPath?: string;
}

interface ParsedCommand {
  command: string;
  subcommand?: string;
  positionals: string[];
  options: CliOptions;
}

const cliVersion = cliPackage.version;

function createResult(
  command: string,
  ok: boolean,
  options: {
    data?: Record<string, unknown>;
    diagnostics?: PublicationDiagnostic[];
    error?: string;
    errorCode?: string;
    desktop?: string;
    workerProtocol?: number;
  } = {},
): CliResult {
  return CLI_RESULT_SCHEMA.parse({
    schemaVersion: 1,
    command,
    ok,
    ...(options.data ? { data: options.data } : {}),
    diagnostics: options.diagnostics ?? [],
    ...(options.error ? { error: options.error } : {}),
    ...(options.errorCode ? { errorCode: options.errorCode } : {}),
    versions: {
      cli: cliVersion,
      ...(options.desktop ? { desktop: options.desktop } : {}),
      ...(options.workerProtocol !== undefined
        ? { workerProtocol: options.workerProtocol }
        : {}),
    },
  });
}

function toPublicationDiagnostics(
  diagnostics: CliWorkerResponse['diagnostics'],
): PublicationDiagnostic[] {
  return diagnostics.map((diagnostic) => ({
    severity: diagnostic.severity,
    code: diagnostic.code,
    message: diagnostic.message,
    ...(diagnostic.sourcePath !== undefined
      ? { sourcePath: diagnostic.sourcePath }
      : {}),
    ...(diagnostic.line !== undefined ? { line: diagnostic.line } : {}),
    ...(diagnostic.chapterId !== undefined
      ? { chapterId: diagnostic.chapterId }
      : {}),
    ...(diagnostic.feature !== undefined
      ? { feature: diagnostic.feature }
      : {}),
    ...(diagnostic.details !== undefined
      ? { details: diagnostic.details }
      : {}),
  }));
}

function printHumanResult(result: CliResult): void {
  if (result.error) process.stderr.write(`Error: ${result.error}\n`);
  for (const diagnostic of result.diagnostics) {
    const prefix = diagnostic.severity.toUpperCase();
    process.stderr.write(
      `${prefix} ${diagnostic.code}: ${diagnostic.message}\n`,
    );
  }
  if (result.ok && typeof result.data?.outputPath === 'string') {
    process.stdout.write(`Created ${result.data.outputPath}\n`);
  } else if (result.ok && result.command === 'doctor') {
    process.stdout.write(
      `Markdown Publication Studio ${String(result.versions.desktop)} is ready.\n`,
    );
  } else if (result.ok && result.command === 'skill install') {
    process.stdout.write(`${String(result.data?.skillPath)}\n`);
  } else if (result.ok && result.command === 'validate') {
    process.stdout.write('Publication inputs are valid.\n');
  } else if (result.ok && result.command === 'describe') {
    process.stdout.write(`${JSON.stringify(result.data, null, 2)}\n`);
  } else if (result.ok && result.command === 'version') {
    process.stdout.write(`mps ${cliVersion}\n`);
  }
}

function writeResult(result: CliResult, json: boolean): void {
  if (json) process.stdout.write(`${JSON.stringify(result)}\n`);
  else printHumanResult(result);
}

function getParseOptions() {
  return {
    allowPositionals: true,
    strict: true,
    options: {
      help: { type: 'boolean' as const, short: 'h' },
      version: { type: 'boolean' as const, short: 'v' },
      json: { type: 'boolean' as const },
      config: { type: 'string' as const },
      format: { type: 'string' as const },
      output: { type: 'string' as const, short: 'o' },
      theme: { type: 'string' as const },
      'page-size': { type: 'string' as const },
      toc: { type: 'boolean' as const },
      'page-numbers': { type: 'boolean' as const },
      'front-cover': { type: 'string' as const },
      'back-cover': { type: 'string' as const },
      strict: { type: 'boolean' as const },
      force: { type: 'boolean' as const },
      'timeout-ms': { type: 'string' as const },
      app: { type: 'string' as const },
      agent: { type: 'string' as const },
      scope: { type: 'string' as const },
      dir: { type: 'string' as const },
    },
  };
}

function parseCommand(argv: string[]): ParsedCommand {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({ ...getParseOptions(), args: argv });
  } catch (error) {
    throw new CliError(
      error instanceof Error ? error.message : String(error),
      2,
      'usage',
    );
  }

  const options = parsed.values as CliOptions;
  const positionals = [...parsed.positionals];
  let command = positionals.shift() ?? 'help';
  let subcommand: string | undefined;
  if (command === 'skill') {
    subcommand = positionals.shift();
    command = 'skill install';
  }
  return {
    command,
    ...(subcommand !== undefined ? { subcommand } : {}),
    positionals,
    options,
  };
}

function printHelp(): void {
  process.stdout.write(`Markdown Publication Studio CLI\n\n`);
  process.stdout.write(`Usage:\n`);
  process.stdout.write(`  mps build [file.md] [options]\n`);
  process.stdout.write(
    `  mps validate [file.md] [--config publish.yaml] [options]\n`,
  );
  process.stdout.write(`  mps doctor [--app /path/to/application] [--json]\n`);
  process.stdout.write(`  mps describe [--json]\n`);
  process.stdout.write(
    `  mps skill install (--agent codex|claude | --dir path) [--scope user|project] [--force]\n\n`,
  );
  process.stdout.write(`Build options:\n`);
  process.stdout.write(`  --config path       Read versioned publish.yaml\n`);
  process.stdout.write(`  --format pdf|html   Output format (default: pdf)\n`);
  process.stdout.write(`  -o, --output path   Output path\n`);
  process.stdout.write(
    `  --theme id          rose, github-markdown, modern-serif, claude\n`,
  );
  process.stdout.write(`  --page-size size    A4 or Letter\n`);
  process.stdout.write(`  --toc               Enable PDF table of contents\n`);
  process.stdout.write(
    `  --page-numbers      Enable default PDF page numbers\n`,
  );
  process.stdout.write(`  --front-cover path  Add PDF front cover\n`);
  process.stdout.write(`  --back-cover path   Add PDF back cover\n`);
  process.stdout.write(`  --strict            Treat warnings as failures\n`);
  process.stdout.write(
    `  --force             Replace an existing output or skill\n`,
  );
  process.stdout.write(
    `  --timeout-ms value  Job timeout (default: ${DEFAULT_TIMEOUT_MS})\n`,
  );
  process.stdout.write(
    `  --json              Write one machine-readable result to stdout\n`,
  );
}

function runtimeRegistrationPath(): string {
  const appData =
    process.platform === 'win32'
      ? process.env.APPDATA || join(homedir(), 'AppData', 'Roaming')
      : process.platform === 'darwin'
        ? join(homedir(), 'Library', 'Application Support')
        : process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return join(appData, PRODUCT_NAME, 'cli-runtime.json');
}

async function readJsonFile(path: string): Promise<unknown | undefined> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as unknown;
  } catch {
    return undefined;
  }
}

function candidateResourcePaths(executablePath: string): {
  executablePath: string;
  manifestPaths: string[];
} {
  const normalized = resolve(executablePath);
  if (process.platform === 'darwin' && normalized.endsWith('.app')) {
    return {
      executablePath: join(normalized, 'Contents', 'MacOS', PRODUCT_NAME),
      manifestPaths: [
        join(normalized, 'Contents', 'Resources', 'mps-runtime.json'),
      ],
    };
  }
  const parent = dirname(normalized);
  const manifestPaths = [
    join(parent, 'resources', 'mps-runtime.json'),
    join(parent, 'mps-runtime.json'),
  ];
  if (process.platform === 'darwin') {
    const appBundle = normalized.split('.app')[0];
    if (appBundle && appBundle !== normalized) {
      return {
        executablePath: normalized,
        manifestPaths: [`${appBundle}.app/Contents/Resources/mps-runtime.json`],
      };
    }
  }
  return { executablePath: normalized, manifestPaths };
}

async function resolveRuntimeCandidate(
  executablePath: string,
  registrationPath?: string,
): Promise<LocatedRuntime> {
  const candidate = candidateResourcePaths(executablePath);
  let registration: z.infer<typeof RUNTIME_REGISTRATION_SCHEMA> | undefined;
  if (registrationPath) {
    const rawRegistration = await readJsonFile(registrationPath);
    const parsedRegistration =
      RUNTIME_REGISTRATION_SCHEMA.safeParse(rawRegistration);
    if (
      parsedRegistration.success &&
      resolve(parsedRegistration.data.executablePath) ===
        resolve(candidate.executablePath)
    ) {
      registration = parsedRegistration.data;
    }
  }

  for (const manifestPath of candidate.manifestPaths) {
    const manifestResult = RUNTIME_MANIFEST_SCHEMA.safeParse(
      await readJsonFile(manifestPath),
    );
    if (manifestResult.success) {
      if (manifestResult.data.workerProtocol !== CLI_WORKER_PROTOCOL_VERSION) {
        throw new CliError(
          `Desktop runtime protocol ${manifestResult.data.workerProtocol} is incompatible with CLI protocol ${CLI_WORKER_PROTOCOL_VERSION}. Update Markdown Publication Studio.`,
          3,
          'runtime',
        );
      }
      return {
        executablePath: candidate.executablePath,
        version: manifestResult.data.version,
        workerProtocol: manifestResult.data.workerProtocol,
        manifestPath,
        ...(registrationPath ? { registrationPath } : {}),
      };
    }
  }

  if (registration) {
    if (registration.workerProtocol !== CLI_WORKER_PROTOCOL_VERSION) {
      throw new CliError(
        `Desktop runtime protocol ${registration.workerProtocol} is incompatible with CLI protocol ${CLI_WORKER_PROTOCOL_VERSION}. Update Markdown Publication Studio.`,
        3,
        'runtime',
      );
    }
    return {
      executablePath: candidate.executablePath,
      version: registration.version,
      workerProtocol: registration.workerProtocol,
      ...(registrationPath ? { registrationPath } : {}),
    };
  }

  throw new CliError(
    `Could not find CLI runtime metadata beside ${candidate.executablePath}. Launch the desktop application once after updating it, or point --app / MPS_APP_PATH to a supported installation.`,
    3,
    'runtime',
  );
}

async function findDefaultExecutable(): Promise<string | undefined> {
  const candidates =
    process.platform === 'darwin'
      ? [
          '/Applications/Markdown Publication Studio.app',
          join(homedir(), 'Applications', 'Markdown Publication Studio.app'),
        ]
      : process.platform === 'win32'
        ? [
            process.env.LOCALAPPDATA
              ? join(
                  process.env.LOCALAPPDATA,
                  'Programs',
                  PRODUCT_NAME,
                  `${PRODUCT_NAME}.exe`,
                )
              : undefined,
            process.env.ProgramFiles
              ? join(
                  process.env.ProgramFiles,
                  PRODUCT_NAME,
                  `${PRODUCT_NAME}.exe`,
                )
              : undefined,
          ]
        : [];

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      await stat(candidate);
      return candidate;
    } catch {
      continue;
    }
  }

  if (process.platform === 'linux') {
    const executableName = 'markdown-publication-studio';
    for (const directory of (process.env.PATH ?? '').split(delimiter)) {
      if (!directory) continue;
      const candidate = join(directory, executableName);
      try {
        await stat(candidate);
        return candidate;
      } catch {
        continue;
      }
    }
  }
  return undefined;
}

async function locateRuntime(appOption?: string): Promise<LocatedRuntime> {
  const registeredPath = runtimeRegistrationPath();
  let executablePath: string | undefined;
  let registrationPath: string | undefined;

  if (appOption) {
    executablePath = appOption;
  } else if (process.env.MPS_APP_PATH) {
    executablePath = process.env.MPS_APP_PATH;
  } else {
    const registration = RUNTIME_REGISTRATION_SCHEMA.safeParse(
      await readJsonFile(registeredPath),
    );
    if (registration.success) {
      executablePath = registration.data.executablePath;
      registrationPath = registeredPath;
    }
    if (!executablePath) executablePath = await findDefaultExecutable();
  }

  if (!executablePath) {
    throw new CliError(
      'Markdown Publication Studio was not found. Install the desktop application, then run it once to register its location.',
      3,
      'runtime',
    );
  }

  if (!registrationPath) {
    const registration = RUNTIME_REGISTRATION_SCHEMA.safeParse(
      await readJsonFile(registeredPath),
    );
    if (
      registration.success &&
      resolve(registration.data.executablePath) ===
        resolve(candidateResourcePaths(executablePath).executablePath)
    ) {
      registrationPath = registeredPath;
    }
  }

  const runtime = await resolveRuntimeCandidate(
    executablePath,
    registrationPath,
  );
  try {
    await stat(runtime.executablePath);
  } catch {
    throw new CliError(
      `The registered desktop application no longer exists: ${runtime.executablePath}`,
      3,
      'runtime',
    );
  }
  return runtime;
}

function readTimeout(options: CliOptions): number {
  if (options['timeout-ms'] === undefined) return DEFAULT_TIMEOUT_MS;
  const timeout = Number(options['timeout-ms']);
  if (!Number.isSafeInteger(timeout) || timeout <= 0) {
    throw new CliError('--timeout-ms must be a positive integer.', 2, 'usage');
  }
  return timeout;
}

function normalizeDiagnosticError(error: unknown): CliError {
  if (error instanceof CliError) return error;
  if (error instanceof z.ZodError) {
    return new CliError(formatSchemaError(error), 2, 'usage');
  }
  if (
    error &&
    typeof error === 'object' &&
    'name' in error &&
    error.name === 'YAMLException'
  ) {
    return new CliError(
      'The publish.yaml file contains invalid YAML.',
      2,
      'usage',
    );
  }
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    return new CliError(
      error instanceof Error ? error.message : String(error),
      4,
      'io',
    );
  }
  return new CliError(
    error instanceof Error ? error.message : String(error),
    1,
    'publish',
  );
}

async function loadPublishConfiguration(
  configPath: string | undefined,
): Promise<{ config: PublishConfiguration; configDirectory: string }> {
  if (!configPath)
    return { config: { version: 1 }, configDirectory: process.cwd() };
  const absoluteConfigPath = resolve(configPath);
  const configStat = await stat(absoluteConfigPath);
  if (configStat.size > CONFIG_MAX_BYTES) {
    throw new CliError(
      'Configuration files must be 1 MiB or smaller.',
      2,
      'usage',
    );
  }
  const source = await readFile(absoluteConfigPath, 'utf8');
  const parsed = loadYaml(source, { maxAliasCount: 100 });
  const config = PublishConfigurationSchema.parse(parsed);
  return { config, configDirectory: dirname(absoluteConfigPath) };
}

function resolveConfigPath(
  value: string | undefined,
  baseDirectory: string,
): string | undefined {
  if (value === undefined) return undefined;
  return isAbsolute(value) ? value : resolve(baseDirectory, value);
}

async function buildWorkerRequest(
  command: 'build' | 'validate',
  parsed: ParsedCommand,
): Promise<CliWorkerRequest> {
  if (parsed.positionals.length > 1) {
    throw new CliError(
      `${parsed.command} accepts at most one Markdown source path.`,
      2,
      'usage',
    );
  }
  const { config, configDirectory } = await loadPublishConfiguration(
    parsed.options.config,
  );
  const positionalSource = parsed.positionals[0];
  const sourceValue = positionalSource ?? config.source;
  if (!sourceValue) {
    throw new CliError(
      'Provide a Markdown source path or set source in the configuration.',
      2,
      'usage',
    );
  }

  const sourceBase = positionalSource ? process.cwd() : configDirectory;
  const sourcePath = resolveConfigPath(sourceValue, sourceBase)!;
  const outputValue = parsed.options.output ?? config.output;
  const format = parsed.options.format ?? config.format ?? 'pdf';
  if (format !== 'pdf' && format !== 'html') {
    throw new CliError('--format must be pdf or html.', 2, 'usage');
  }
  const outputPath =
    command === 'validate'
      ? undefined
      : resolveConfigPath(
          outputValue ??
            `${basename(sourcePath, extname(sourcePath))}.${format}`,
          parsed.options.output !== undefined
            ? process.cwd()
            : config.output !== undefined
              ? configDirectory
              : dirname(sourcePath),
        );

  const raw = {
    schemaVersion: 1,
    command,
    sourcePath,
    ...(outputPath ? { outputPath } : {}),
    format,
    themeId: parsed.options.theme ?? config.themeId ?? 'rose',
    pageSize: parsed.options['page-size'] ?? config.pageSize ?? 'A4',
    toc: parsed.options.toc
      ? { ...(config.toc ?? DEFAULT_TOC_SETTINGS), enabled: true }
      : (config.toc ?? DEFAULT_TOC_SETTINGS),
    pageNumber: parsed.options['page-numbers']
      ? {
          ...(config.pageNumber ?? DEFAULT_PAGE_NUMBER_SETTINGS),
          enabled: true,
        }
      : (config.pageNumber ?? DEFAULT_PAGE_NUMBER_SETTINGS),
    covers: {
      ...(config.covers?.front
        ? {
            front: {
              path: resolveConfigPath(config.covers.front, configDirectory),
            },
          }
        : {}),
      ...(config.covers?.back
        ? {
            back: {
              path: resolveConfigPath(config.covers.back, configDirectory),
            },
          }
        : {}),
      ...(parsed.options['front-cover']
        ? {
            front: {
              path: resolveConfigPath(
                parsed.options['front-cover'],
                process.cwd(),
              ),
            },
          }
        : {}),
      ...(parsed.options['back-cover']
        ? {
            back: {
              path: resolveConfigPath(
                parsed.options['back-cover'],
                process.cwd(),
              ),
            },
          }
        : {}),
    },
    styleOverrides:
      config.styleOverrides ??
      PublicationStyleOverridesSchema.parse({ version: 1 }),
    strict: Boolean(parsed.options.strict),
    force: Boolean(parsed.options.force),
  };

  try {
    return CliWorkerRequestSchema.parse(raw);
  } catch (error) {
    throw new CliError(
      error instanceof z.ZodError
        ? formatSchemaError(error)
        : error instanceof Error
          ? error.message
          : String(error),
      2,
      'usage',
    );
  }
}

function killWorkerTree(child: ReturnType<typeof spawn>): void {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    const killer = spawn(
      'taskkill.exe',
      ['/pid', String(child.pid), '/t', '/f'],
      { windowsHide: true, stdio: 'ignore' },
    );
    killer.on('error', () => child.kill('SIGTERM'));
    return;
  }
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
}

async function runWorker(
  request: CliWorkerRequest,
  runtime: LocatedRuntime,
  timeoutMs: number,
): Promise<CliWorkerResponse> {
  const taskDirectory = await mkdtemp(join(tmpdir(), 'mps-cli-'));
  const requestPath = join(taskDirectory, 'request.json');
  const resultPath = join(taskDirectory, 'result.json');
  await writeFile(requestPath, JSON.stringify(request), {
    encoding: 'utf8',
    flag: 'wx',
  });

  try {
    await new Promise<void>((resolvePromise, rejectPromise) => {
      const child = spawn(
        runtime.executablePath,
        ['--mps-worker', requestPath],
        {
          cwd: process.cwd(),
          detached: process.platform !== 'win32',
          shell: false,
          windowsHide: true,
          stdio: ['ignore', 'ignore', 'pipe'],
        },
      );
      let stderr = '';
      let settled = false;
      let terminationError: CliError | undefined;
      let forceKillTimer: ReturnType<typeof setTimeout> | undefined;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (forceKillTimer) clearTimeout(forceKillTimer);
        process.off('SIGINT', onCancel);
        process.off('SIGTERM', onCancel);
        callback();
      };
      const stop = (error: CliError) => {
        if (settled || terminationError) return;
        terminationError = error;
        killWorkerTree(child);
        forceKillTimer = setTimeout(() => {
          if (process.platform === 'win32') {
            if (child.exitCode === null && child.signalCode === null) {
              child.kill('SIGKILL');
            }
          } else {
            try {
              if (child.pid) process.kill(-child.pid, 'SIGKILL');
            } catch {
              child.kill('SIGKILL');
            }
          }
        }, 1500);
      };
      const onCancel = () =>
        stop(
          new CliError('The publication job was cancelled.', 130, 'cancelled'),
        );
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr = `${stderr}${chunk.toString('utf8')}`.slice(-4096);
      });
      child.on('error', (error) => {
        finish(() => rejectPromise(new CliError(error.message, 3, 'runtime')));
      });
      child.on('close', (_code, signal) => {
        finish(async () => {
          if (terminationError) {
            rejectPromise(terminationError);
            return;
          }
          const workerResult = CliWorkerResponseSchema.safeParse(
            await readJsonFile(resultPath),
          );
          if (workerResult.success) {
            resolvePromise();
            return;
          }
          rejectPromise(
            new CliError(
              stderr.trim() ||
                `Desktop worker stopped without a result${signal ? ` (${signal})` : ''}.`,
              3,
              'runtime',
            ),
          );
        });
      });
      const timeout = setTimeout(() => {
        stop(
          new CliError(
            `The publication job exceeded its ${timeoutMs} ms timeout.`,
            124,
            'timeout',
          ),
        );
      }, timeoutMs);
      process.once('SIGINT', onCancel);
      process.once('SIGTERM', onCancel);
    });

    const result = CliWorkerResponseSchema.parse(
      await readJsonFile(resultPath),
    );
    return result;
  } finally {
    await rm(taskDirectory, { recursive: true, force: true });
  }
}

function jsonSchemaForConfig(): Record<string, unknown> {
  return z.toJSONSchema(PublishConfigurationSchema, {
    target: 'draft-07',
    unrepresentable: 'any',
  });
}

function formatSchemaError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.map(String).join('.') || '<root>';
      return `${path}: ${issue.message}`;
    })
    .join('; ');
}

function exitCodeForResult(result: CliResult): number {
  if (result.ok) return 0;
  switch (result.errorCode) {
    case 'usage':
      return 2;
    case 'runtime':
      return 3;
    case 'io':
      return 4;
    case 'timeout':
      return 124;
    case 'cancelled':
      return 130;
    default:
      return 1;
  }
}

function describeData(): Record<string, unknown> {
  return {
    runtime: {
      productId: PRODUCT_ID,
      workerProtocol: CLI_WORKER_PROTOCOL_VERSION,
      minimumNodeVersion: '22.21.1',
    },
    commands: {
      build: 'Export one Markdown file to PDF or HTML.',
      validate:
        'Validate configuration and publication inputs without writing output.',
      doctor: 'Check desktop runtime discovery and protocol compatibility.',
      describe: 'Print supported configuration and option schemas.',
      'skill install':
        'Copy the Agent Skill for Codex, Claude Code, or a custom skills directory.',
    },
    configuration: jsonSchemaForConfig(),
    options: {
      themes: ThemeIdSchema.options,
      pageSizes: PageSizeIdSchema.options,
      tocPresets: TOC_PRESET_DEFINITIONS.map(({ id }) => id),
      pageNumberFonts: PageNumberFontIdSchema.options,
      pageNumberStyles: PageNumberStyleSchema.options,
      pageNumberFirstPageModes: PageNumberFirstPageModeSchema.options,
      builtInThemes: BUILT_IN_THEMES,
      pageSizesWithDimensions: PAGE_SIZE_DEFINITIONS,
      pageNumberSettings: z.toJSONSchema(PageNumberSettingsSchema, {
        target: 'draft-07',
        unrepresentable: 'any',
      }),
      pageNumberFormat: {
        description:
          'Must include {page} or {pages}. Only these placeholders are accepted; the value cannot contain newlines and is limited to 160 characters.',
        supportedPlaceholders: ['{page}', '{pages}'],
      },
    },
  };
}

async function allSkillFiles(
  directory: string,
  root = directory,
): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return allSkillFiles(path, root);
      if (entry.isFile()) return [relative(root, path)];
      return [];
    }),
  );
  return paths.flat();
}

async function skillTarget(options: CliOptions): Promise<string> {
  if (options.dir) {
    if (options.agent || options.scope) {
      throw new CliError(
        '--dir cannot be combined with --agent or --scope.',
        2,
        'usage',
      );
    }
    return resolve(options.dir, 'markdown-publication');
  }
  const agent = options.agent;
  const scope = options.scope ?? 'user';
  if (agent !== 'codex' && agent !== 'claude') {
    throw new CliError(
      'Choose --agent codex|claude or provide --dir.',
      2,
      'usage',
    );
  }
  if (scope !== 'user' && scope !== 'project') {
    throw new CliError('--scope must be user or project.', 2, 'usage');
  }
  const skillRoot =
    scope === 'project'
      ? join(process.cwd(), agent === 'codex' ? '.agents' : '.claude', 'skills')
      : join(homedir(), agent === 'codex' ? '.agents' : '.claude', 'skills');
  return join(skillRoot, 'markdown-publication');
}

async function installSkill(options: CliOptions): Promise<string> {
  const sourceRoot = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../skills/markdown-publication',
  );
  const targetRoot = await skillTarget(options);
  const files = await allSkillFiles(sourceRoot);
  if (files.length === 0) {
    throw new CliError(
      'The packaged Markdown Publication Studio skill is missing.',
      4,
      'io',
    );
  }

  let targetExists = false;
  try {
    targetExists = (await lstat(targetRoot)).isDirectory();
  } catch {
    targetExists = false;
  }

  if (targetExists) {
    let identical = true;
    for (const relativePath of files) {
      try {
        const [source, target] = await Promise.all([
          readFile(join(sourceRoot, relativePath)),
          readFile(join(targetRoot, relativePath)),
        ]);
        if (!source.equals(target)) identical = false;
      } catch {
        identical = false;
      }
    }
    if (identical) return targetRoot;
    if (!options.force) {
      throw new CliError(
        `The skill already exists with different files: ${targetRoot}. Use --force to update it.`,
        4,
        'io',
      );
    }
  }

  await mkdir(targetRoot, { recursive: true });
  for (const relativePath of files) {
    const sourcePath = join(sourceRoot, relativePath);
    const targetPath = join(targetRoot, relativePath);
    await mkdir(dirname(targetPath), { recursive: true });
    const temporaryPath = `${targetPath}.${randomUUID()}.tmp`;
    try {
      await copyFile(sourcePath, temporaryPath);
      await rename(temporaryPath, targetPath);
    } catch (error) {
      await rm(temporaryPath, { force: true });
      throw error;
    }
  }
  return targetRoot;
}

async function commandResult(parsed: ParsedCommand): Promise<CliResult> {
  const { command, options } = parsed;
  if (options.version)
    return createResult('version', true, { data: { version: cliVersion } });
  if (options.help || command === 'help') {
    if (options.json) {
      return createResult('help', true, { data: { command: 'help' } });
    }
    printHelp();
    return createResult('help', true);
  }
  if (command === 'describe') {
    return createResult('describe', true, { data: describeData() });
  }
  if (command === 'skill install') {
    if (parsed.subcommand !== 'install' || parsed.positionals.length > 0) {
      throw new CliError(
        'Usage: mps skill install (--agent codex|claude | --dir path).',
        2,
        'usage',
      );
    }
    const skillPath = await installSkill(options);
    return createResult('skill install', true, { data: { skillPath } });
  }
  if (command === 'doctor') {
    if (parsed.positionals.length > 0) {
      throw new CliError(
        'doctor does not accept positional arguments.',
        2,
        'usage',
      );
    }
    const runtime = await locateRuntime(options.app);
    return createResult('doctor', true, {
      data: {
        desktopPath: runtime.executablePath,
        manifestPath: runtime.manifestPath,
        registrationPath: runtime.registrationPath,
        desktopVersion: runtime.version,
        compatible: true,
      },
      desktop: runtime.version,
      workerProtocol: runtime.workerProtocol,
    });
  }
  if (command !== 'build' && command !== 'validate') {
    throw new CliError(`Unknown command: ${command}`, 2, 'usage');
  }
  const request = await buildWorkerRequest(command, parsed);
  const timeoutMs = readTimeout(options);
  const runtime = await locateRuntime(options.app);
  const workerResult = await runWorker(request, runtime, timeoutMs);
  return createResult(command, workerResult.ok, {
    ...(workerResult.data?.outputPath
      ? { data: { outputPath: workerResult.data.outputPath } }
      : {}),
    diagnostics: toPublicationDiagnostics(workerResult.diagnostics),
    ...(workerResult.error !== undefined ? { error: workerResult.error } : {}),
    ...(workerResult.errorCode !== undefined
      ? { errorCode: workerResult.errorCode }
      : {}),
    desktop: workerResult.versions.desktop,
    workerProtocol: workerResult.versions.workerProtocol,
  });
}

async function main(): Promise<void> {
  let json = process.argv.includes('--json');
  let command = 'help';
  try {
    const parsed = parseCommand(process.argv.slice(2));
    command = parsed.command;
    json = Boolean(parsed.options.json);
    const result = await commandResult(parsed);
    writeResult(result, json);
    process.exitCode = exitCodeForResult(result);
  } catch (error) {
    const normalized = normalizeDiagnosticError(error);
    const result = createResult(command, false, {
      error: normalized.message,
      errorCode: normalized.errorCode,
      diagnostics: normalized.diagnostics,
    });
    writeResult(result, json);
    process.exitCode = normalized.exitCode;
  }
}

const runningFile = process.argv[1] ? realpathSync(process.argv[1]) : undefined;
if (runningFile === realpathSync(fileURLToPath(import.meta.url))) await main();

export {
  buildWorkerRequest,
  installSkill,
  parseCommand,
  resolveRuntimeCandidate,
  runWorker,
  exitCodeForResult,
};
