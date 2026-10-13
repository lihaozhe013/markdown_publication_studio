import { spawn } from 'node:child_process';
import {
  readMcpSessionManifests,
  type McpSessionManifest,
} from './mcp-session-host.js';
import { detectMcpApplicationLaunch } from './mcp-launch-service.js';
import type { McpSessionGateway } from '../mcp-server.js';

const SESSION_START_TIMEOUT_MS = 15_000;
const SESSION_POLL_INTERVAL_MS = 250;

type SessionReply =
  { ok: true; result: Record<string, unknown> } | { ok: false; error: string };

export class McpSessionClient implements McpSessionGateway {
  private readonly manifests = new Map<string, McpSessionManifest>();
  private activeJob: Record<string, unknown> | undefined;

  async list(): Promise<Record<string, unknown>[]> {
    const manifests = await readMcpSessionManifests();
    this.manifests.clear();
    const sessions: Record<string, unknown>[] = [];
    for (const manifest of manifests) {
      this.manifests.set(manifest.sessionId, manifest);
      try {
        const state = await this.request(manifest, 'session_get_state', {
          sessionId: manifest.sessionId,
        });
        sessions.push({
          ...state,
          version: manifest.version,
          compatible: true,
        });
      } catch (error) {
        sessions.push({
          sessionId: manifest.sessionId,
          version: manifest.version,
          compatible: true,
          ready: false,
          status: 'loading',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return sessions;
  }

  getActiveJob(): Record<string, unknown> | undefined {
    return this.activeJob;
  }

  async cancelActiveJob(): Promise<Record<string, unknown> | undefined> {
    const active = this.activeJob;
    if (
      !active ||
      typeof active.jobId !== 'string' ||
      typeof active.sessionId !== 'string'
    )
      return undefined;
    const result = await this.invoke('job_cancel', {
      jobId: active.jobId,
      sessionId: active.sessionId,
    });
    this.activeJob = result;
    return result;
  }

  async open(): Promise<Record<string, unknown>> {
    const sessions = await this.list();
    if (sessions.length > 1)
      return {
        candidates: sessions,
        error:
          'Multiple GUI sessions are running. Pass a sessionId from session_list.',
      };
    if (sessions.length === 1) {
      const sessionId = String(sessions[0]!.sessionId);
      if (sessions[0]!.ready === false)
        return this.waitForSessionState(sessionId);
      return sessions[0]!;
    }

    const launch = detectMcpApplicationLaunch();
    if (!launch.mcp.available)
      throw new Error(
        launch.mcp.error ?? 'The application executable is unavailable.',
      );
    const args = [...launch.applicationArgs, '--mps-session-gui'];
    const child = spawn(launch.command, args, {
      detached: process.platform !== 'win32',
      stdio: 'ignore',
      shell: false,
      windowsHide: true,
    });
    await new Promise<void>((resolveSpawn, rejectSpawn) => {
      child.once('spawn', () => resolveSpawn());
      child.once('error', rejectSpawn);
    });
    child.unref();

    const deadline = Date.now() + SESSION_START_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise((resolve) =>
        setTimeout(resolve, SESSION_POLL_INTERVAL_MS),
      );
      const candidates = await this.list();
      if (candidates.length === 1) {
        if (candidates[0]!.ready === false) continue;
        return candidates[0]!;
      }
      if (candidates.length > 1)
        return {
          candidates,
          error:
            'Multiple GUI sessions are running. Pass a sessionId from session_list.',
        };
    }
    throw new Error(
      'The GUI did not publish a compatible session within 15 seconds. Check that a graphical desktop session is available.',
    );
  }

  private async waitForSessionState(
    sessionId: string,
  ): Promise<Record<string, unknown>> {
    const deadline = Date.now() + SESSION_START_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const manifest = this.manifests.get(sessionId);
      if (!manifest) break;
      try {
        return await this.request(manifest, 'session_get_state', { sessionId });
      } catch {
        await new Promise((resolve) =>
          setTimeout(resolve, SESSION_POLL_INTERVAL_MS),
        );
      }
    }
    throw new Error(
      'The selected GUI session did not finish loading within 15 seconds.',
    );
  }

  async invoke(
    operation: string,
    parameters: unknown,
  ): Promise<Record<string, unknown> & { image?: string }> {
    const input =
      parameters && typeof parameters === 'object'
        ? (parameters as Record<string, unknown>)
        : {};
    let sessionId =
      typeof input.sessionId === 'string' ? input.sessionId : undefined;
    if (sessionId) {
      const known = this.manifests.get(sessionId);
      if (known)
        return this.request(known, operation, parameters) as Promise<
          Record<string, unknown> & { image?: string }
        >;
      const sessions = await this.list();
      if (this.manifests.has(sessionId))
        return this.request(
          this.manifests.get(sessionId)!,
          operation,
          parameters,
        ) as Promise<Record<string, unknown> & { image?: string }>;
      if (sessions.length > 1)
        throw new Error(
          `Unknown GUI sessionId ${sessionId}. Call session_list and choose a candidate.`,
        );
      throw new Error(
        `GUI session ${sessionId} is no longer available. Call session_list.`,
      );
    }
    const sessions = await this.list();
    if (sessions.length !== 1) {
      if (sessions.length === 0)
        throw new Error(
          'No GUI session is running. Call session_open to start one.',
        );
      throw new Error(
        'Multiple GUI sessions are running. Pass a sessionId returned by session_list.',
      );
    }
    sessionId = String(sessions[0]!.sessionId);
    const manifest = this.manifests.get(sessionId);
    if (!manifest)
      throw new Error('The selected GUI session is no longer available.');
    const result = await this.request(manifest, operation, {
      ...input,
      sessionId,
    });
    if (operation === 'session_export' && typeof result.jobId === 'string') {
      this.activeJob = { ...result, sessionId };
    }
    if (
      operation === 'job_get' &&
      input.jobId === this.activeJob?.jobId &&
      ['succeeded', 'failed', 'cancelled'].includes(String(result.status))
    ) {
      this.activeJob = undefined;
    }
    return result as Record<string, unknown> & { image?: string };
  }

  private async request(
    manifest: McpSessionManifest,
    operation: string,
    parameters: unknown,
  ): Promise<Record<string, unknown>> {
    const response = await fetch(`http://127.0.0.1:${manifest.port}/session`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${manifest.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ operation, parameters }),
      signal: AbortSignal.timeout(35_000),
    });
    if (!response.ok)
      throw new Error(`GUI session bridge returned HTTP ${response.status}.`);
    const reply = (await response.json()) as SessionReply;
    if (!reply.ok) throw new Error(reply.error);
    return reply.result;
  }
}
