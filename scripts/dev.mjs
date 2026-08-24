import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { resolve } from 'node:path';

const debugLogPath = resolve(process.cwd(), 'debug.log');
const debugLog = createWriteStream(debugLogPath, {
  encoding: 'utf8',
  flags: 'w',
});
const args = [
  'exec',
  'electron-vite',
  'dev',
  '--watch',
  '--config',
  'apps/desktop/electron.vite.config.ts',
];
const common = {
  env: { ...process.env, MARKDOWN_PUBLICATION_DEV_LOG: '1' },
  stdio: ['inherit', 'pipe', 'pipe'],
};
const child =
  process.platform === 'win32'
    ? spawn(
        process.env.ComSpec ?? 'cmd.exe',
        ['/d', '/s', '/c', 'pnpm', ...args],
        { ...common, windowsVerbatimArguments: true },
      )
    : spawn('pnpm', args, { ...common, detached: true });

function forwardOutput(stream, target) {
  stream.on('data', (chunk) => {
    debugLog.write(chunk);
    target.write(chunk);
  });
}

forwardOutput(child.stdout, process.stdout);
forwardOutput(child.stderr, process.stderr);

function stopChild(signal) {
  if (child.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
    });
    return;
  }
  try {
    process.kill(-child.pid, signal);
  } catch {
    child.kill(signal);
  }
}

process.once('SIGINT', () => stopChild('SIGINT'));
process.once('SIGTERM', () => stopChild('SIGTERM'));

child.on('error', (error) => {
  const message = `${new Date().toISOString()} [ERROR] [dev] Failed to start the development server: ${error.message}\n`;
  debugLog.write(message);
  process.stderr.write(message);
});

child.on('close', (code, signal) => {
  debugLog.end(() => {
    process.exitCode = code ?? (signal ? 1 : 0);
  });
});
