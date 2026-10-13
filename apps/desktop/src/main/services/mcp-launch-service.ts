import { accessSync, constants, statSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { app } from 'electron';
import {
  McpLaunchSpecSchema,
  type McpLaunchSpec,
} from '@markdown-publication/shared/mcp';

export interface McpApplicationLaunch {
  command: string;
  applicationArgs: string[];
  mcp: McpLaunchSpec;
}

export function detectMcpApplicationLaunch(): McpApplicationLaunch {
  const appImage =
    process.platform === 'linux' ? process.env.APPIMAGE : undefined;
  const command = appImage || process.execPath;
  const applicationArgs = app.isPackaged ? [] : [app.getAppPath()];
  const args = [...applicationArgs, '--mps-mcp'];
  let available = false;
  let error: string | undefined;
  if (!isAbsolute(command)) {
    error = `The application executable path is not absolute: ${command}`;
  } else {
    try {
      const info = statSync(command);
      if (!info.isFile())
        error = `The application executable path is not a file: ${command}`;
      else {
        accessSync(
          command,
          process.platform === 'win32' ? constants.F_OK : constants.X_OK,
        );
        available = true;
      }
    } catch {
      error = `The application executable is missing or cannot be launched: ${command}`;
    }
  }
  return {
    command,
    applicationArgs,
    mcp: McpLaunchSpecSchema.parse({
      command,
      args,
      version: app.getVersion(),
      available,
      ...(error ? { error } : {}),
    }),
  };
}
