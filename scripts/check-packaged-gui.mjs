import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Run the actual Linux AppImage with isolated settings and inspect its GUI bridge.
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const executable = process.argv[2];
assert.ok(
  executable,
  'Usage: node scripts/check-packaged-gui.mjs /path/to/app.AppImage',
);
const directory = await mkdtemp(join(tmpdir(), 'mps-packaged-gui-'));
const child = spawn(resolve(executable), ['--remote-debugging-port=0'], {
  env: { ...process.env, XDG_CONFIG_HOME: directory },
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
});
let stderr = '';
let launchError;
let socket;
let nextId = 0;
const pending = new Map();
child.on('error', (error) => (launchError = error));
child.stdout.resume();
child.stderr.on('data', (chunk) => (stderr += chunk.toString()));

async function waitFor(action, label) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (launchError) throw launchError;
    assert.equal(child.exitCode, null, `AppImage exited: ${stderr}`);
    const result = await action();
    if (result) return result;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error(`Timed out waiting for ${label}. ${stderr}`);
}

function evaluate(expression) {
  const id = ++nextId;
  return new Promise((resolveResult, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('Timed out evaluating the packaged renderer.'));
    }, 10_000);
    pending.set(id, (message) => {
      clearTimeout(timer);
      if (message.error || message.result?.exceptionDetails) {
        reject(new Error(JSON.stringify(message)));
      } else resolveResult(message.result.result.value);
    });
    socket.send(
      JSON.stringify({
        id,
        method: 'Runtime.evaluate',
        params: { expression, returnByValue: true, awaitPromise: true },
      }),
    );
  });
}

try {
  const port = await waitFor(
    () => stderr.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/)?.[1],
    'the packaged debugging endpoint',
  );
  const target = await waitFor(async () => {
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(
      (response) => response.json(),
    );
    return targets.find(
      (entry) => entry.type === 'page' && entry.url.startsWith('file:'),
    );
  }, 'the publication window');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    const resolveResult = pending.get(message.id);
    if (resolveResult) {
      pending.delete(message.id);
      resolveResult(message);
    }
  });
  await new Promise((resolveOpen, reject) => {
    socket.addEventListener('open', resolveOpen, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  await waitFor(
    () =>
      evaluate(
        'Boolean(window.desktopApi && document.querySelector(".connect-ai-button"))',
      ),
    'the workspace',
  );
  const diagnostics = await evaluate('window.desktopApi.mcp.getDiagnostics()');
  assert.equal(diagnostics.status, 'listening');
  const manifestPath = (await readdir(directory, { recursive: true })).find(
    (path) => path.endsWith(`${diagnostics.sessionId}.json`),
  );
  assert.ok(manifestPath, 'GUI session manifest exists');
  const manifest = JSON.parse(
    await readFile(join(directory, manifestPath), 'utf8'),
  );
  async function invoke(operation, parameters) {
    return fetch(`http://127.0.0.1:${manifest.port}/session`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${manifest.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ operation, parameters }),
      signal: AbortSignal.timeout(35_000),
    }).then((response) => response.json());
  }
  async function state() {
    const reply = await invoke('session_get_state', {
      sessionId: manifest.sessionId,
    });
    return reply.ok ? reply.result : undefined;
  }
  const initial = await waitFor(state, 'the initial renderer snapshot');
  assert.equal(initial.source, null);
  assert.equal(initial.revision, 0);
  assert.equal('savedStyle' in initial.settings, false);
  await evaluate('document.querySelector(".connect-ai-button").click()');
  await waitFor(
    () =>
      evaluate(
        'Boolean(document.querySelector(".mcp-dialog textarea")?.value)',
      ),
    'the connection prompt',
  );
  await evaluate('document.querySelector(".mcp-dialog-close").click()');
  const opened = await invoke('session_document', {
    sessionId: manifest.sessionId,
    revision: initial.revision,
    action: 'open',
    sourcePath: join(repository, 'examples/sample-book/sample.md'),
  });
  assert.equal(opened.ok, true, JSON.stringify(opened));
  const ready = await waitFor(async () => {
    const current = await state();
    return current?.preview.status === 'ready' ? current : undefined;
  }, 'the document preview');
  assert.ok(ready.revision > initial.revision);
  assert.equal(
    ready.source.path,
    join(repository, 'examples/sample-book/sample.md'),
  );
  assert.equal('savedStyle' in ready.settings, false);
  assert.doesNotMatch(stderr, /Uncaught Exception|ZodError/);
  console.log(
    'Packaged GUI smoke passed: startup, session snapshots, Connect AI, and document preview.',
  );
} finally {
  socket?.close();
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch (error) {
    if (error.code !== 'ESRCH')
      console.error('Could not stop the smoke test process:', error.message);
  }
  await rm(directory, { recursive: true, force: true });
}
