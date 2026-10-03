import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { app } from 'electron';
import { CLI_WORKER_PROTOCOL_VERSION } from '@markdown-publication/shared';

export const CLI_WORKER_PROTOCOL = CLI_WORKER_PROTOCOL_VERSION;

export interface CliRuntimeRegistration {
  productId: string;
  executablePath: string;
  version: string;
  workerProtocol: number;
}

export function getCliRuntimeRegistrationPath(): string {
  return join(app.getPath('appData'), app.getName(), 'cli-runtime.json');
}

export async function registerCliRuntime(): Promise<void> {
  const registrationPath = getCliRuntimeRegistrationPath();
  const directory = dirname(registrationPath);
  const temporaryPath = join(directory, `.${randomUUID()}.tmp`);
  const registration: CliRuntimeRegistration = {
    productId: 'com.markdownpublication.studio',
    executablePath: process.env.APPIMAGE ?? process.execPath,
    version: app.getVersion(),
    workerProtocol: CLI_WORKER_PROTOCOL,
  };

  try {
    await mkdir(directory, { recursive: true });
    await writeFile(temporaryPath, JSON.stringify(registration), 'utf8');
    await rename(temporaryPath, registrationPath);
  } catch {
    await unlink(temporaryPath).catch(() => undefined);
  }
}
