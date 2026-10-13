import { clipboard } from 'electron';
import type {
  McpConnectionSetup,
  McpPromptMode,
} from '@markdown-publication/shared/mcp';
import { detectMcpApplicationLaunch } from './mcp-launch-service.js';
import type { McpSessionHost } from './mcp-session-host.js';

function createPrompt(
  mode: McpPromptMode,
  launch: McpConnectionSetup['launch'],
): string {
  const connection = JSON.stringify(
    { command: launch.command, args: launch.args },
    null,
    2,
  );
  if (mode === 'configure') {
    return (
      `Connect Markdown Publication Studio to this AI agent as an MCP server.\n\n` +
      `First identify this agent client and its documented MCP configuration format. Add the server while preserving all existing configuration. If an entry named "markdown-publication-studio" already exists and is identical, leave it unchanged. If it differs, report the conflict and ask before changing it. Do not install dependencies or modify application files.\n\n` +
      `Use this generic launch information and translate it to the client's required format:\n${connection}\n\n` +
      `After saving configuration, reconnect the MCP server and verify the connection by calling only publication_describe and session_list. Do not open a document, validate a document, or export a file during setup. Report whether the client connected and which of those two checks succeeded. This application only reports whether its local executable is available; it cannot verify your client's connection. If the launch path is unavailable, stop and report the displayed reason.\n`
    );
  }
  return (
    `Use Markdown Publication Studio for the user's next publication task through a temporary MCP connection.\n\n` +
    `Identify this agent client's documented support for temporary or per-task MCP servers. Prefer that capability. Otherwise use an MCP SDK already available in the environment, or a temporary Python standard-library stdio JSON-RPC client. Do not install packages, alter persistent client configuration, or modify application files.\n\n` +
    `Launch information:\n${connection}\n\n` +
    `Ask the user for a concrete task first if none has been provided. Keep the same server process and connection open for the entire task, including polling job_get until jobs finish. Use the publication tools only as needed for the task. Close the connection and process after completion, then report the result and any diagnostics. Do not use publication_describe or session_list as setup verification for this one-time flow unless the task requires them. If the executable is unavailable, stop and report the displayed reason.\n`
  );
}

export function getMcpConnectionSetup(
  sessionHost: McpSessionHost,
): McpConnectionSetup {
  const detected = detectMcpApplicationLaunch();
  return {
    launch: detected.mcp,
    prompts: {
      configure: createPrompt('configure', detected.mcp),
      oneTime: createPrompt('one-time', detected.mcp),
    },
    diagnostics: sessionHost.getDiagnostics(),
  };
}

export async function copyMcpPrompt(
  mode: McpPromptMode,
  sessionHost: McpSessionHost,
): Promise<{ copied: boolean }> {
  const setup = getMcpConnectionSetup(sessionHost);
  if (!setup.launch.available)
    throw new Error(setup.launch.error ?? 'The MCP executable is unavailable.');
  const prompt =
    mode === 'configure' ? setup.prompts.configure : setup.prompts.oneTime;
  clipboard.writeText(prompt);
  if (clipboard.readText() !== prompt)
    throw new Error(
      'The clipboard did not retain the prompt. Select and copy it manually.',
    );
  return { copied: true };
}
