import { app } from 'electron';
import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

type LogDetails = Record<string, boolean | number | string | undefined>;
type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export const isDevelopmentLogEnabled =
  process.env.MARKDOWN_PUBLICATION_DEV_LOG === '1';

export const isRenderingDebugEnabled =
  isDevelopmentLogEnabled ||
  process.env.MARKDOWN_PUBLICATION_RENDER_DEBUG === '1';

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

  debug(message: string, details?: LogDetails): void {
    this.enqueue('DEBUG', message, details);
  }

  warn(message: string, details?: LogDetails): void {
    this.enqueue('WARN', message, details);
  }

  error(message: string, error: unknown, details?: LogDetails): void {
    this.enqueue('ERROR', `${message}: ${formatError(error)}`, details);
  }

  private enqueue(
    level: LogLevel,
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
        if (isDevelopmentLogEnabled) {
          await appendFile(join(process.cwd(), 'debug.log'), line, 'utf8');
        }
      })
      .catch((error: unknown) => {
        console.error('[logging] Could not write application log.', error);
      });
  }
}

export const appLogger = new AppLogger();
