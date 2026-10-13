import { randomUUID, timingSafeEqual } from 'node:crypto';
import {
  chmod,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { isAbsolute, join, resolve } from 'node:path';
import { app, type BrowserWindow } from 'electron';
import { z } from 'zod/v4';
import {
  PageNumberSettingsSchema,
  PublicationStyleOverridesSchema,
  TocSettingsSchema,
  ThemeIdSchema,
  PageSizeIdSchema,
  type CoverAssetReference,
  type CoverSelection,
  type PublicationDiagnostic,
} from '@markdown-publication/shared';
import {
  McpJobLookupSchema,
  McpSessionIdSchema,
  McpRendererCommandSchema,
  McpRendererCommandReplySchema,
  McpRendererSnapshotSchema,
  McpSessionCaptureSchema,
  McpSessionDocumentSchema,
  McpSessionExportSchema,
  McpSessionSaveSettingsSchema,
  McpSessionStateSchema,
  McpSessionUpdateSchema,
  McpSessionViewSchema,
  type McpJob,
  type McpRendererCommand,
  type McpRendererSnapshot,
  type McpSessionState,
} from '@markdown-publication/shared/mcp';
import { buildPublicationRequest } from '@markdown-publication/publishing-runtime';
import { McpJobService } from './mcp-job-service.js';
import { appLogger } from './app-logger.js';
import { validateMarkdownPath } from './publication-service.js';
import type { AppSettingsService } from './app-settings-service.js';
import type { CoverAssetFile } from './cover-asset-service.js';
import {
  McpSessionManifestSchema,
  type McpSessionManifest,
} from '@markdown-publication/shared/mcp';

const BRIDGE_PROTOCOL = 1;
const MAX_REQUEST_BYTES = 1024 * 1024;
const COMMAND_TIMEOUT_MS = 30_000;

export type { McpSessionManifest } from '@markdown-publication/shared/mcp';

interface PendingCommand {
  resolve: (value: McpRendererSnapshot) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

type SessionServices = {
  appSettings: AppSettingsService;
  getWindow: () => BrowserWindow | undefined;
  registerSource: (path: string) => void;
  revokeSource: (path: string) => void;
  approveCover: (
    path: string,
  ) => Promise<{ path: string; reference: CoverAssetReference }>;
  registerCover: (asset: CoverAssetFile) => void;
  resolveCoverPath: (id: string) => string | undefined;
};

export function getMcpSessionDirectory(): string {
  return join(app.getPath('appData'), app.getName(), 'mcp', 'sessions');
}

export async function readMcpSessionManifests(): Promise<McpSessionManifest[]> {
  const directory = getMcpSessionDirectory();
  const entries = await import('node:fs/promises')
    .then(({ readdir }) => readdir(directory, { withFileTypes: true }))
    .catch(() => []);
  const manifests: McpSessionManifest[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const path = join(directory, entry.name);
    try {
      const parsed = McpSessionManifestSchema.parse(
        JSON.parse(await readFile(path, 'utf8')),
      );
      if (parsed.protocol !== BRIDGE_PROTOCOL) {
        await rm(path, { force: true });
        continue;
      }
      try {
        process.kill(parsed.pid, 0);
      } catch (error) {
        if (
          error &&
          typeof error === 'object' &&
          'code' in error &&
          error.code === 'EPERM'
        ) {
          manifests.push(parsed);
          continue;
        }
        await rm(path, { force: true });
        continue;
      }
      manifests.push(parsed);
    } catch {
      await rm(path, { force: true }).catch(() => undefined);
    }
  }
  return manifests;
}

function writeJson(
  response: ServerResponse,
  status: number,
  data: unknown,
): void {
  const body = JSON.stringify(data);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  response.end(body);
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const declaredLength = Number(request.headers['content-length'] ?? 0);
  if (
    !Number.isSafeInteger(declaredLength) ||
    declaredLength < 0 ||
    declaredLength > MAX_REQUEST_BYTES
  ) {
    throw new Error('Request body exceeds the 1 MiB limit.');
  }
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > MAX_REQUEST_BYTES)
      throw new Error('Request body exceeds the 1 MiB limit.');
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

export class McpSessionHost {
  readonly sessionId = randomUUID();
  private token = '';
  private server: Server | undefined;
  private manifestPath = '';
  private snapshot: McpRendererSnapshot | undefined;
  private state: McpSessionState | undefined;
  private contentSignature: string | undefined;
  private readonly jobs: McpJobService;
  private readonly pending = new Map<string, PendingCommand>();
  private commandTail: Promise<unknown> = Promise.resolve();
  private lastRequestAt: string | undefined;

  constructor(private readonly services: SessionServices) {
    this.jobs = new McpJobService('session', this.sessionId);
  }

  async start(): Promise<void> {
    this.token = randomUUID() + randomUUID();
    const directory = getMcpSessionDirectory();
    await mkdir(directory, { recursive: true, mode: 0o700 });
    if (process.platform !== 'win32')
      await chmod(directory, 0o700).catch(() => undefined);
    this.server = createServer(
      (request, response) => void this.handleRequest(request, response),
    );
    await new Promise<void>((resolve, reject) => {
      this.server?.once('error', reject);
      this.server?.listen(0, '127.0.0.1', () => resolve());
    });
    const address = this.server.address();
    if (!address || typeof address === 'string')
      throw new Error('Could not determine the GUI session bridge address.');
    this.manifestPath = join(directory, `${this.sessionId}.json`);
    const manifest: McpSessionManifest = {
      schemaVersion: 1,
      protocol: BRIDGE_PROTOCOL,
      sessionId: this.sessionId,
      port: address.port,
      token: this.token,
      pid: process.pid,
      version: app.getVersion(),
      createdAt: new Date().toISOString(),
    };
    const temporaryPath = `${this.manifestPath}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(manifest), {
      mode: 0o600,
      flag: 'wx',
    });
    if (process.platform !== 'win32')
      await chmod(temporaryPath, 0o600).catch(() => undefined);
    await rename(temporaryPath, this.manifestPath);
    this.refreshState();
    appLogger.info('[mcp] GUI session bridge ready', {
      sessionId: this.sessionId,
      port: address.port,
    });
  }

  getDiagnostics(): Record<string, unknown> {
    const address = this.server?.address();
    return {
      sessionId: this.sessionId,
      port: address && typeof address !== 'string' ? address.port : undefined,
      status: this.server?.listening ? 'listening' : 'stopped',
      recentRequestAt: this.lastRequestAt,
      activeJob: this.jobs.getActiveJob(),
    };
  }

  getActiveJob(): McpJob | undefined {
    return this.jobs.getActiveJob();
  }

  cancelActiveJob(): McpJob | undefined {
    const active = this.jobs.getActiveJob();
    return active ? this.jobs.cancel(active.jobId) : undefined;
  }

  reportSnapshot(rawSnapshot: unknown): void {
    const parsed = McpRendererSnapshotSchema.safeParse(rawSnapshot);
    if (!parsed.success) {
      appLogger.warn('[mcp] Ignored an invalid renderer session snapshot.', {
        issueCount: parsed.error.issues.length,
      });
      return;
    }
    this.snapshot = parsed.data;
    this.refreshState();
  }

  async completeCommand(rawReply: unknown): Promise<void> {
    const parsed = McpRendererCommandReplySchema.safeParse(rawReply);
    if (!parsed.success) return;
    const pending = this.pending.get(parsed.data.requestId);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pending.delete(parsed.data.requestId);
    if (parsed.data.error) {
      pending.reject(new Error(parsed.data.error));
      return;
    }
    if (parsed.data.snapshot) {
      this.snapshot = parsed.data.snapshot;
      this.refreshState();
      pending.resolve(parsed.data.snapshot);
    } else if (this.snapshot) {
      pending.resolve(this.snapshot);
    } else {
      pending.reject(
        new Error('The renderer did not return a publication state.'),
      );
    }
  }

  async invoke(
    operation: string,
    parameters: unknown,
  ): Promise<Record<string, unknown> & { image?: string }> {
    const next = this.commandTail.then(() =>
      this.invokeSerialized(operation, parameters),
    );
    this.commandTail = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  async close(): Promise<void> {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('The GUI session is closing.'));
    }
    this.pending.clear();
    await this.jobs.close();
    if (this.server?.listening) {
      await new Promise<void>((resolveClose) =>
        this.server?.close(() => resolveClose()),
      );
    }
    await rm(this.manifestPath, { force: true }).catch(() => undefined);
  }

  private refreshState(): void {
    const snapshot = this.snapshot;
    if (!snapshot) return;
    const signature = JSON.stringify({
      source: snapshot.source,
      settings: snapshot.settings,
      styleDirty: snapshot.styleDirty,
    });
    const changed =
      this.contentSignature !== undefined &&
      this.contentSignature !== signature;
    const revision = this.state ? this.state.revision + (changed ? 1 : 0) : 0;
    this.contentSignature = signature;
    this.state = McpSessionStateSchema.parse({
      sessionId: this.sessionId,
      revision,
      source: snapshot.source,
      settings: {
        ...snapshot.settings,
        covers: {
          front: this.coverPath(snapshot.settings.covers.front),
          back: this.coverPath(snapshot.settings.covers.back),
        },
      },
      styleDirty: snapshot.styleDirty,
      preview: {
        ...snapshot.preview,
        revision: snapshot.preview.status === 'ready' ? revision : null,
      },
      diagnostics: snapshot.diagnostics,
      view: { zoom: snapshot.view.zoom, scrollY: snapshot.view.scrollY },
    });
  }

  private coverPath(reference: CoverAssetReference | null): string | null {
    if (!reference) return null;
    const path = this.services.resolveCoverPath(reference.id);
    return path ?? null;
  }

  private checkRevision(revision: number, sessionId: string): McpSessionState {
    if (sessionId !== this.sessionId) throw new Error('Unknown GUI session.');
    this.refreshState();
    if (!this.state)
      throw new Error(
        'The GUI session has not reported its initial state yet.',
      );
    if (this.state.revision !== revision) {
      throw new Error(
        `state_conflict: expected revision ${revision}, current revision is ${this.state.revision}. Read session_get_state and retry with the current revision.`,
      );
    }
    return this.state;
  }

  private async sendCommand(
    command: Omit<McpRendererCommand, 'requestId'>,
  ): Promise<McpRendererSnapshot> {
    const window = this.services.getWindow();
    if (!window || window.isDestroyed())
      throw new Error('The publication window is not available.');
    const requestId = randomUUID();
    const payload = McpRendererCommandSchema.parse({ ...command, requestId });
    const result = new Promise<McpRendererSnapshot>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(requestId);
        reject(
          new Error(
            `The publication window did not complete the ${command.operation} request in ${COMMAND_TIMEOUT_MS} ms.`,
          ),
        );
      }, COMMAND_TIMEOUT_MS);
      this.pending.set(requestId, { resolve, reject, timeout });
    });
    window.webContents.send('mcp:session-command', payload);
    return result;
  }

  private async invokeSerialized(
    operation: string,
    parameters: unknown,
  ): Promise<Record<string, unknown> & { image?: string }> {
    this.lastRequestAt = new Date().toISOString();
    const state = this.state;
    if (!state && operation !== 'session_get_state')
      throw new Error(
        'The publication window is still loading. Try again shortly.',
      );
    if (operation === 'session_get_state') {
      const input = z
        .object({ sessionId: McpSessionIdSchema })
        .parse(parameters);
      if (input.sessionId !== this.sessionId)
        throw new Error('Unknown GUI session.');
      this.refreshState();
      if (!this.state)
        throw new Error('The publication window is still loading.');
      return this.state as unknown as Record<string, unknown>;
    }

    if (operation === 'session_document') {
      const input = McpSessionDocumentSchema.parse(parameters);
      const current = this.checkRevision(input.revision, input.sessionId);
      if (
        current.styleDirty &&
        input.action !== 'reload' &&
        !input.discardChanges
      ) {
        throw new Error(
          'The style draft has unsaved changes. Pass discardChanges=true to continue.',
        );
      }
      let sourcePath = input.sourcePath;
      if (input.action === 'open') {
        if (!sourcePath || !isAbsolute(sourcePath))
          throw new Error('sourcePath must be an absolute Markdown path.');
        await validateMarkdownPath(sourcePath);
        sourcePath = resolvePath(sourcePath);
        this.services.registerSource(sourcePath);
      } else if (input.action === 'reload') {
        if (!current.source) throw new Error('No Markdown document is open.');
        sourcePath = current.source.path;
        await validateMarkdownPath(sourcePath);
      }
      const snapshot = await this.sendCommand({
        operation: 'document',
        documentAction: input.action,
        expectedRevision: input.revision,
        sourcePath,
        discardChanges: input.discardChanges,
      });
      if (input.action === 'close' && current.source)
        this.services.revokeSource(current.source.path);
      this.refreshState();
      return this.state as unknown as Record<string, unknown>;
    }

    if (operation === 'session_update') {
      const input = McpSessionUpdateSchema.parse(parameters);
      const current = this.checkRevision(input.revision, input.sessionId);
      const settings = { ...current.settings };
      if (input.themeId !== undefined)
        settings.themeId = ThemeIdSchema.parse(input.themeId);
      if (input.pageSize !== undefined)
        settings.pageSize = PageSizeIdSchema.parse(input.pageSize);
      if (input.toc !== undefined)
        settings.toc = TocSettingsSchema.parse(input.toc);
      if (input.pageNumber !== undefined)
        settings.pageNumber = PageNumberSettingsSchema.parse(input.pageNumber);
      if (input.styleOverrides !== undefined)
        settings.styleOverrides = PublicationStyleOverridesSchema.parse(
          input.styleOverrides,
        );
      const refs: CoverSelection = {};
      for (const slot of ['front', 'back'] as const) {
        const reference = this.snapshot?.settings.covers[slot];
        if (reference) refs[slot] = reference;
      }
      for (const slot of ['front', 'back'] as const) {
        const requestedPath = input.covers?.[slot];
        if (requestedPath === null) {
          delete refs[slot];
          settings.covers[slot] = null;
        } else if (requestedPath !== undefined) {
          if (!isAbsolute(requestedPath))
            throw new Error(`covers.${slot} must be an absolute path.`);
          const approved = await this.services.approveCover(requestedPath);
          this.services.registerCover({
            id: approved.reference.id,
            path: approved.path,
            name: approved.reference.name,
            kind: approved.reference.kind,
          });
          refs[slot] = approved.reference;
          settings.covers[slot] = approved.path;
        }
      }
      const snapshot = await this.sendCommand({
        operation: 'update',
        expectedRevision: input.revision,
        settings,
        covers: { front: refs.front ?? null, back: refs.back ?? null },
      });
      this.refreshState();
      return this.state as unknown as Record<string, unknown>;
    }

    if (operation === 'session_save_settings') {
      const input = McpSessionSaveSettingsSchema.parse(parameters);
      const current = this.checkRevision(input.revision, input.sessionId);
      if (input.sections.includes('pageNumber'))
        await this.services.appSettings.savePageNumber(
          current.settings.pageNumber,
        );
      if (input.sections.includes('style'))
        await this.services.appSettings.saveCustomStyle(
          current.settings.styleOverrides,
        );
      await this.sendCommand({
        operation: 'save',
        expectedRevision: input.revision,
        sections: input.sections,
      });
      this.refreshState();
      return this.state as unknown as Record<string, unknown>;
    }

    if (operation === 'session_export') {
      const input = McpSessionExportSchema.parse(parameters);
      const current = this.checkRevision(input.revision, input.sessionId);
      if (!current.source)
        throw new Error(
          'Open a Markdown source before exporting the GUI session.',
        );
      if (!isAbsolute(input.outputPath))
        throw new Error('outputPath must be an absolute path.');
      const request = await buildPublicationRequest({
        command: 'build',
        sourcePath: current.source.path,
        outputPath: input.outputPath,
        format: input.format,
        themeId: current.settings.themeId,
        pageSize: current.settings.pageSize,
        toc: current.settings.toc,
        pageNumber: current.settings.pageNumber,
        styleOverrides: current.settings.styleOverrides,
        frontCover: current.settings.covers.front,
        backCover: current.settings.covers.back,
        strict: input.strict,
        overwrite: input.overwrite,
      });
      const job = this.jobs.enqueue('export', request);
      return job as unknown as Record<string, unknown>;
    }

    if (operation === 'session_view') {
      const input = McpSessionViewSchema.parse(parameters);
      this.checkRevision(input.revision, input.sessionId);
      const snapshot = await this.sendCommand({
        operation: 'view',
        expectedRevision: input.revision,
        ...(input.zoom !== undefined ? { zoom: input.zoom } : {}),
        ...(input.scrollY !== undefined ? { scrollY: input.scrollY } : {}),
        ...(input.heading !== undefined ? { heading: input.heading } : {}),
      });
      this.refreshState();
      return { ...this.state, view: snapshot.view } as unknown as Record<
        string,
        unknown
      >;
    }

    if (operation === 'session_capture') {
      const input = McpSessionCaptureSchema.parse(parameters);
      let current = this.checkRevision(input.revision, input.sessionId);
      if (input.scope === 'preview') {
        if (!current.source)
          throw new Error(
            'Open a Markdown source before capturing the preview.',
          );
        const previewDeadline = Date.now() + 15_000;
        while (
          (current.preview.status !== 'ready' ||
            current.preview.revision !== input.revision) &&
          Date.now() < previewDeadline
        ) {
          await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
          current = this.checkRevision(input.revision, input.sessionId);
        }
        if (
          current.preview.status !== 'ready' ||
          current.preview.revision !== input.revision
        ) {
          throw new Error(
            'preview_timeout: The preview did not finish loading fonts, images, and layout within 15 seconds for the requested revision.',
          );
        }
      }
      const window = this.services.getWindow();
      if (!window || window.isDestroyed())
        throw new Error('The publication window is not available for capture.');
      const rect =
        input.scope === 'preview' ? this.snapshot?.view.previewRect : null;
      if (input.scope === 'preview' && !rect)
        throw new Error('The preview viewport is not currently measurable.');
      const image = await window.webContents.capturePage(rect ?? undefined, {
        stayHidden: true,
      });
      if (image.isEmpty())
        throw new Error(
          'The application content window could not be captured.',
        );
      return {
        image: image.toPNG().toString('base64'),
        sessionId: this.sessionId,
        revision: input.revision,
        scope: input.scope,
        view: this.state?.view,
        disclaimer:
          'Continuous preview capture. PDF determines final publication pagination.',
      };
    }

    if (operation === 'job_get' || operation === 'job_cancel') {
      const input = McpJobLookupSchema.parse(parameters);
      if (input.sessionId !== this.sessionId)
        throw new Error('Unknown GUI session.');
      const job =
        operation === 'job_get'
          ? this.jobs.get(input.jobId)
          : this.jobs.cancel(input.jobId);
      if (!job) throw new Error(`Unknown GUI job: ${input.jobId}`);
      return job as unknown as Record<string, unknown>;
    }

    throw new Error(`Unsupported GUI session operation: ${operation}`);
  }

  private async handleRequest(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const remoteAddress = request.socket.remoteAddress;
    if (remoteAddress !== '127.0.0.1' && remoteAddress !== '::ffff:127.0.0.1') {
      writeJson(response, 403, { error: 'loopback_only' });
      return;
    }
    if (request.method !== 'POST' || request.url !== '/session') {
      writeJson(response, 404, { error: 'not_found' });
      return;
    }
    const supplied =
      request.headers.authorization?.replace(/^Bearer\s+/iu, '') ?? '';
    const expected = Buffer.from(this.token);
    const actual = Buffer.from(supplied);
    if (
      expected.length !== actual.length ||
      !timingSafeEqual(expected, actual)
    ) {
      writeJson(response, 401, { error: 'unauthorized' });
      return;
    }
    try {
      const value = (await readJson(request)) as {
        operation?: unknown;
        parameters?: unknown;
      };
      if (typeof value.operation !== 'string')
        throw new Error('operation is required.');
      const result = await this.invoke(value.operation, value.parameters);
      writeJson(response, 200, { ok: true, result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeJson(response, 200, { ok: false, error: message });
    }
  }
}

function resolvePath(path: string): string {
  return resolve(path);
}
