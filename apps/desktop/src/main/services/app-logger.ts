import { app } from 'electron';
import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

type LogDetails = Record<string, boolean | number | string | undefined>;

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export class AppLogger {
  private writeQueue = Promise.resolve();

  info(message: string, details?: LogDetails): void {
    this.enqueue('INFO', message, details);
  }

  error(message: string, error: unknown, details?: LogDetails): void {
    this.enqueue('ERROR', `${message}: ${formatError(error)}`, details);
  }

  private enqueue(
    level: 'INFO' | 'ERROR',
    message: string,
    details?: LogDetails,
  ): void {
    const detailsText = details ? ` ${JSON.stringify(details)}` : '';
    const line = `${new Date().toISOString()} [${level}] ${message}${detailsText}\n`;
    this.writeQueue = this.writeQueue
      .then(async () => {
        const logsDirectory = app.getPath('logs');
        await mkdir(logsDirectory, { recursive: true });
        await appendFile(join(logsDirectory, 'main.log'), line, 'utf8');
      })
      .catch((error: unknown) => {
        console.error('[logging] Could not write application log.', error);
      });
  }
}

export const appLogger = new AppLogger();
