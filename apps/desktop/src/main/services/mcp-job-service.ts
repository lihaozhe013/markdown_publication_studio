import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { app } from 'electron';
import {
  CliWorkerResponseSchema,
  type CliWorkerRequest,
  type PublicationDiagnostic,
} from '@markdown-publication/shared';
import { McpJobSchema, type McpJob } from '@markdown-publication/shared/mcp';
import { SerialTaskQueue } from '@markdown-publication/publishing-runtime';
import { appLogger } from './app-logger.js';

const DEFAULT_TIMEOUT_MS = 120_000;
const TERMINATION_GRACE_MS = 15_000;

interface ActiveJob {
  record: McpJob;
  request: CliWorkerRequest;
  directory?: string;
  child: ChildProcess | undefined;
  cancelRequested: boolean;
  timer?: ReturnType<typeof setTimeout>;
}

export class McpJobService {
  private readonly jobs = new Map<string, ActiveJob>();
  private readonly queue = new SerialTaskQueue<ActiveJob>();
  private current: ActiveJob | undefined;
  private closed = false;

  constructor(
    private readonly owner: 'file' | 'session',
    private readonly sessionId?: string,
  ) {}

  getActiveJob(): McpJob | undefined {
    return this.current ? { ...this.current.record } : undefined;
  }

  get(jobId: string): McpJob | undefined {
    const job = this.jobs.get(jobId);
    return job
      ? { ...job.record, diagnostics: [...job.record.diagnostics] }
      : undefined;
  }

  enqueue(kind: 'validate' | 'export', request: CliWorkerRequest): McpJob {
    if (this.closed)
      throw new Error('The publication task runner is shutting down.');
    const now = new Date().toISOString();
    const active: ActiveJob = {
      record: McpJobSchema.parse({
        jobId: randomUUID(),
        kind,
        status: 'queued',
        stage: 'queued',
        createdAt: now,
        updatedAt: now,
        diagnostics: [],
        owner: this.owner,
        ...(this.sessionId ? { sessionId: this.sessionId } : {}),
      }),
      request,
      child: undefined,
      cancelRequested: false,
    };
    this.jobs.set(active.record.jobId, active);
    this.queue.enqueue(active);
    this.pump();
    return { ...active.record };
  }

  cancel(jobId: string): McpJob | undefined {
    const job = this.jobs.get(jobId);
    if (
      !job ||
      ['succeeded', 'failed', 'cancelled'].includes(job.record.status)
    ) {
      return job ? { ...job.record } : undefined;
    }
    job.cancelRequested = true;
    if (job.record.status === 'queued') {
      if (this.queue.remove(job))
        this.finish(
          job,
          'cancelled',
          undefined,
          'The publication job was cancelled before it started.',
        );
    } else if (job.child) {
      this.signal(job.child, 'SIGTERM');
      setTimeout(() => {
        if (
          job.child &&
          job.child.exitCode === null &&
          job.child.signalCode === null
        ) {
          this.signal(job.child, 'SIGKILL');
        }
      }, TERMINATION_GRACE_MS).unref();
    }
    return { ...job.record };
  }

  async close(): Promise<void> {
    this.closed = true;
    this.queue.close();
    for (const job of this.jobs.values()) {
      if (job.record.status === 'queued' || job.record.status === 'running')
        this.cancel(job.record.jobId);
    }
    await new Promise<void>((resolve) => {
      const deadline = Date.now() + TERMINATION_GRACE_MS + 500;
      const check = (): void => {
        if (!this.current || Date.now() >= deadline) resolve();
        else setTimeout(check, 50).unref();
      };
      check();
    });
  }

  private pump(): void {
    if (this.current || this.closed) return;
    const job = this.queue.take();
    if (!job) return;
    this.current = job;
    job.record.status = 'running';
    job.record.stage = 'preparing';
    job.record.updatedAt = new Date().toISOString();
    void this.run(job);
  }

  private async run(job: ActiveJob): Promise<void> {
    try {
      const directory = await mkdtemp(join(tmpdir(), 'mps-mcp-'));
      job.directory = directory;
      const requestPath = join(directory, 'request.json');
      const resultPath = join(directory, 'result.json');
      await writeFile(requestPath, JSON.stringify(job.request), {
        flag: 'wx',
        mode: 0o600,
      });
      if (job.cancelRequested)
        throw Object.assign(new Error('The publication job was cancelled.'), {
          cancelled: true,
        });
      const executable = process.env.APPIMAGE ?? process.execPath;
      const args = app.isPackaged
        ? ['--mps-worker', requestPath]
        : [app.getAppPath(), '--mps-worker', requestPath];
      await new Promise<void>((resolvePromise, rejectPromise) => {
        const child = spawn(executable, args, {
          cwd: directory,
          detached: process.platform !== 'win32',
          shell: false,
          windowsHide: true,
          stdio: ['ignore', 'ignore', 'pipe'],
        });
        job.child = child;
        if (job.cancelRequested) {
          this.signal(child, 'SIGTERM');
          setTimeout(() => {
            if (child.exitCode === null && child.signalCode === null)
              this.signal(child, 'SIGKILL');
          }, TERMINATION_GRACE_MS).unref();
        }
        let stderr = '';
        let settled = false;
        let timedOut = false;
        const finish = (callback: () => void): void => {
          if (settled) return;
          settled = true;
          if (job.timer) clearTimeout(job.timer);
          callback();
        };
        child.stderr?.on('data', (chunk: Buffer) => {
          stderr = `${stderr}${chunk.toString('utf8')}`.slice(-4096);
        });
        child.once('error', (error) => finish(() => rejectPromise(error)));
        child.once('close', (code, signal) =>
          finish(() => {
            if (code === 0) {
              resolvePromise();
              return;
            }
            if (timedOut) {
              rejectPromise(
                Object.assign(
                  new Error(
                    `The publication job exceeded its ${DEFAULT_TIMEOUT_MS} ms timeout.`,
                  ),
                  { timedOut: true },
                ),
              );
              return;
            }
            if (code !== 0 && job.cancelRequested) {
              rejectPromise(
                Object.assign(new Error('The publication job was cancelled.'), {
                  cancelled: true,
                }),
              );
              return;
            }
            if (code !== 0) {
              rejectPromise(
                new Error(
                  stderr.trim() ||
                    `Desktop worker exited with ${signal ?? code ?? 'unknown status'}.`,
                ),
              );
              return;
            }
            resolvePromise();
          }),
        );
        job.timer = setTimeout(() => {
          timedOut = true;
          this.signal(child, 'SIGTERM');
          setTimeout(() => {
            if (child.exitCode === null && child.signalCode === null)
              this.signal(child, 'SIGKILL');
          }, TERMINATION_GRACE_MS).unref();
        }, DEFAULT_TIMEOUT_MS);
        job.timer.unref();
      });
      const response = CliWorkerResponseSchema.parse(
        JSON.parse(await readFile(resultPath, 'utf8')),
      );
      job.record.diagnostics = response.diagnostics as PublicationDiagnostic[];
      if (!response.ok)
        throw new Error(response.error ?? 'Publication validation failed.');
      if (response.data?.outputPath)
        job.record.outputPath = response.data.outputPath;
      this.finish(job, 'succeeded');
    } catch (error) {
      let message = error instanceof Error ? error.message : String(error);
      const cancelled = Boolean(
        error && typeof error === 'object' && 'cancelled' in error,
      );
      const timedOut = Boolean(
        error && typeof error === 'object' && 'timedOut' in error,
      );
      if (job.directory) {
        try {
          const response = CliWorkerResponseSchema.parse(
            JSON.parse(
              await readFile(join(job.directory, 'result.json'), 'utf8'),
            ),
          );
          job.record.diagnostics =
            response.diagnostics as PublicationDiagnostic[];
          if (!response.ok && response.error && !cancelled && !timedOut)
            message = response.error;
        } catch {
          // The worker may have been terminated before writing its result file.
        }
      }
      this.finish(job, cancelled ? 'cancelled' : 'failed', undefined, message);
      appLogger.info('[mcp] Publication job finished', {
        jobId: job.record.jobId,
        status: job.record.status,
        file: basename(job.request.sourcePath),
        timedOut,
      });
    } finally {
      if (job.directory)
        await rm(job.directory, { recursive: true, force: true }).catch(
          () => undefined,
        );
      job.child = undefined;
      this.current = undefined;
      this.queue.complete();
      this.pump();
    }
  }

  private finish(
    job: ActiveJob,
    status: McpJob['status'],
    _outputPath?: string,
    error?: string,
  ): void {
    job.record.status = status;
    job.record.stage = status;
    job.record.updatedAt = new Date().toISOString();
    if (error) job.record.error = error;
  }

  private signal(child: ChildProcess, signal: NodeJS.Signals): void {
    if (child.exitCode !== null || child.signalCode !== null) return;
    if (process.platform !== 'win32' && child.pid) {
      try {
        process.kill(-child.pid, signal);
        return;
      } catch {
        // The process may have exited between the state check and signal.
      }
    }
    child.kill(signal);
  }
}
