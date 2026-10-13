import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { app } from 'electron';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mcpExecutable = process.env.MPS_MCP_EXECUTABLE ?? process.execPath;
const mcpArguments = process.env.MPS_MCP_EXECUTABLE
  ? ['--mps-mcp']
  : [repository, '--mps-mcp'];
const child = spawn(mcpExecutable, mcpArguments, {
  cwd: repository,
  stdio: ['pipe', 'pipe', 'pipe'],
  shell: false,
  windowsHide: true,
});
let stdoutBuffer = '';
let stderr = '';
const responses = new Map();
let rejectReader;
const readerFailure = new Promise((_, reject) => {
  rejectReader = reject;
});

child.stdout.setEncoding('utf8');
child.stdout.on('data', (chunk) => {
  stdoutBuffer += chunk;
  while (stdoutBuffer.includes('\n')) {
    const newline = stdoutBuffer.indexOf('\n');
    const line = stdoutBuffer.slice(0, newline);
    stdoutBuffer = stdoutBuffer.slice(newline + 1);
    if (!line.trim()) continue;
    try {
      const message = JSON.parse(line);
      if (typeof message.id === 'number') responses.set(message.id, message);
    } catch {
      rejectReader(
        new Error(`MCP stdout contained non-protocol output: ${line}`),
      );
    }
  }
});
child.stderr.setEncoding('utf8');
child.stderr.on('data', (chunk) => {
  stderr = `${stderr}${chunk}`.slice(-4000);
});

let nextId = 1;
async function request(method, params = {}) {
  const id = nextId++;
  child.stdin.write(
    `${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`,
  );
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const response = responses.get(id);
    if (response) {
      responses.delete(id);
      return response;
    }
    await Promise.race([
      new Promise((resolveDelay) => setTimeout(resolveDelay, 25)),
      readerFailure,
    ]);
  }
  throw new Error(`Timed out waiting for MCP ${method}. stderr: ${stderr}`);
}

async function verifyModernProtocol() {
  const modernChild = spawn(mcpExecutable, mcpArguments, {
    cwd: repository,
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: false,
    windowsHide: true,
  });
  let modernStdoutBuffer = '';
  let modernStderr = '';
  const modernResponses = new Map();
  let rejectModernReader;
  const modernReaderFailure = new Promise((_, reject) => {
    rejectModernReader = reject;
  });
  modernChild.stdout.setEncoding('utf8');
  modernChild.stdout.on('data', (chunk) => {
    modernStdoutBuffer += chunk;
    while (modernStdoutBuffer.includes('\n')) {
      const newline = modernStdoutBuffer.indexOf('\n');
      const line = modernStdoutBuffer.slice(0, newline);
      modernStdoutBuffer = modernStdoutBuffer.slice(newline + 1);
      if (!line.trim()) continue;
      try {
        const message = JSON.parse(line);
        if (typeof message.id === 'number')
          modernResponses.set(message.id, message);
      } catch {
        rejectModernReader(
          new Error(`Modern MCP stdout contained non-protocol output: ${line}`),
        );
      }
    }
  });
  modernChild.stderr.setEncoding('utf8');
  modernChild.stderr.on('data', (chunk) => {
    modernStderr = `${modernStderr}${chunk}`.slice(-4000);
  });
  let modernNextId = 1;
  async function modernRequest(method, params = {}) {
    const id = modernNextId++;
    modernChild.stdin.write(
      `${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`,
    );
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const response = modernResponses.get(id);
      if (response) {
        modernResponses.delete(id);
        return response;
      }
      await Promise.race([
        new Promise((resolveDelay) => setTimeout(resolveDelay, 25)),
        modernReaderFailure,
      ]);
    }
    throw new Error(
      `Timed out waiting for modern MCP ${method}. stderr: ${modernStderr}`,
    );
  }
  try {
    const envelope = {
      'io.modelcontextprotocol/protocolVersion': '2026-07-28',
      'io.modelcontextprotocol/clientCapabilities': {},
    };
    const discovery = await modernRequest('server/discover', {
      _meta: envelope,
    });
    assert.ok(discovery.result?.supportedVersions?.includes('2026-07-28'));
    const list = await modernRequest('tools/list', { _meta: envelope });
    assert.ok(
      list.result?.tools?.some((tool) => tool.name === 'publication_describe'),
    );
    modernChild.stdin.end();
    const exit = await Promise.race([
      new Promise((resolveExit, rejectExit) => {
        modernChild.once('error', rejectExit);
        modernChild.once('close', (code, signal) =>
          resolveExit({ code, signal }),
        );
      }),
      new Promise((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                `Modern MCP server did not exit after stdin closed. stderr: ${modernStderr}`,
              ),
            ),
          10_000,
        ),
      ),
    ]);
    assert.equal(
      exit.code,
      0,
      `Modern MCP server exited unexpectedly (${exit.signal ?? exit.code}): ${modernStderr}`,
    );
  } catch (error) {
    modernChild.kill('SIGKILL');
    throw error;
  }
}

async function waitForJob(jobId) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const response = await request('tools/call', {
      name: 'job_get',
      arguments: { jobId },
    });
    assert.ok(!response.result?.isError);
    const job = response.result?.structuredContent;
    if (['succeeded', 'failed', 'cancelled'].includes(job?.status)) return job;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error(`MCP job ${jobId} did not finish within 120 seconds.`);
}

try {
  const initialize = await request('initialize', {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'mps-smoke-check', version: '1.0.0' },
  });
  assert.ok(
    initialize.result?.serverInfo?.name === 'markdown-publication-studio' ||
      initialize.result?.serverInfo?.name === 'Markdown Publication Studio',
  );
  child.stdin.write(
    `${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`,
  );

  const list = await request('tools/list');
  const names = new Set(list.result?.tools?.map((tool) => tool.name));
  for (const name of [
    'publication_describe',
    'publication_validate',
    'publication_export',
    'job_get',
    'job_cancel',
    'session_list',
    'session_open',
  ]) {
    assert.ok(names.has(name), `Expected MCP tool ${name}`);
  }

  const describe = await request('tools/call', {
    name: 'publication_describe',
    arguments: {},
  });
  assert.ok(!describe.result?.isError);
  const sessions = await request('tools/call', {
    name: 'session_list',
    arguments: {},
  });
  assert.ok(!sessions.result?.isError);
  const invalidPath = await request('tools/call', {
    name: 'publication_validate',
    arguments: { sourcePath: 'relative.md' },
  });
  assert.ok(invalidPath.result?.isError);
  assert.equal(
    invalidPath.result?.structuredContent?.error?.code,
    'invalid_request',
  );

  const sourcePath = join(repository, 'examples/sample-book/sample.md');
  const validation = await request('tools/call', {
    name: 'publication_validate',
    arguments: { sourcePath },
  });
  assert.ok(!validation.result?.isError);
  const validationJobId = validation.result?.structuredContent?.jobId;
  assert.equal(typeof validationJobId, 'string');
  const validationResult = await waitForJob(validationJobId);
  assert.equal(validationResult?.status, 'succeeded');

  const outputDirectory = await mkdtemp(join(tmpdir(), 'mps-mcp-smoke-'));
  const htmlOutputPath = join(outputDirectory, 'sample.html');
  const pdfOutputPath = join(outputDirectory, 'sample.pdf');
  try {
    const exportResponse = await request('tools/call', {
      name: 'publication_export',
      arguments: {
        sourcePath,
        format: 'html',
        outputPath: htmlOutputPath,
      },
    });
    assert.ok(!exportResponse.result?.isError);
    const exportJobId = exportResponse.result?.structuredContent?.jobId;
    assert.equal(typeof exportJobId, 'string');
    const exportResult = await waitForJob(exportJobId);
    assert.equal(exportResult?.status, 'succeeded');
    assert.ok((await stat(htmlOutputPath)).isFile());

    const pdfResponse = await request('tools/call', {
      name: 'publication_export',
      arguments: {
        sourcePath,
        format: 'pdf',
        outputPath: pdfOutputPath,
      },
    });
    assert.ok(!pdfResponse.result?.isError);
    const pdfJobId = pdfResponse.result?.structuredContent?.jobId;
    assert.equal(typeof pdfJobId, 'string');
    const pdfResult = await waitForJob(pdfJobId);
    assert.equal(pdfResult?.status, 'succeeded');
    assert.ok((await stat(pdfOutputPath)).isFile());
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }

  child.stdin.end();
  let timeout;
  const exit = await Promise.race([
    new Promise((resolveExit, rejectExit) => {
      child.once('error', rejectExit);
      child.once('close', (code, signal) => resolveExit({ code, signal }));
    }),
    new Promise((_, reject) => {
      timeout = setTimeout(
        () =>
          reject(
            new Error(
              `MCP server did not exit after stdin closed. stderr: ${stderr}`,
            ),
          ),
        10_000,
      );
    }),
  ]).finally(() => clearTimeout(timeout));
  assert.equal(
    exit.code,
    0,
    `MCP server exited unexpectedly (${exit.signal ?? exit.code}): ${stderr}`,
  );
  await verifyModernProtocol();
  console.log(
    `MCP stdio smoke check passed: ${names.size} tools listed, legacy and modern protocols succeeded, file validation and PDF/HTML exports completed, stdin EOF closed both servers.`,
  );
  app.exit(0);
} catch (error) {
  child.kill('SIGKILL');
  console.error(error);
  app.exit(1);
}
