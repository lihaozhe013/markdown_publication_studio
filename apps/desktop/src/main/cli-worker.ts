import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  link,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { app } from 'electron';
import {
  CliWorkerRequestSchema,
  CliWorkerResponseSchema,
  type CliWorkerResponse,
  type PublicationDiagnostic,
} from '@markdown-publication/shared';
import {
  PublicationDiagnosticsError,
  PublicationService,
  validateMarkdownPath,
} from './services/publication-service.js';
import { inspectCoverAsset } from './services/cover-asset-service.js';
import { CLI_WORKER_PROTOCOL } from './services/cli-runtime-registry.js';
import { ElectronPrintBackend } from './services/electron-print-backend.js';
import { ElectronMermaidRenderer } from './services/mermaid-renderer.js';
import { PageNumberPdfService } from './services/page-number-pdf-service.js';
import { PdfAssemblyService } from './services/pdf-assembly-service.js';
import type { PdfAssemblyCovers } from './services/pdf-assembly-service.js';
import type { CliWorkerRequest } from '@markdown-publication/shared';

function errorCode(error: unknown): 'usage' | 'io' | 'publish' {
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    return 'io';
  }
  return error instanceof SyntaxError ? 'usage' : 'publish';
}

function diagnosticsFromError(error: unknown): PublicationDiagnostic[] {
  if (error instanceof PublicationDiagnosticsError) return error.diagnostics;
  return [];
}

async function loadCovers(
  request: CliWorkerRequest,
): Promise<PdfAssemblyCovers> {
  const load = async (path: string) => {
    const id = randomUUID();
    const reference = await inspectCoverAsset(path, id);
    return { id, path, name: reference.name, kind: reference.kind };
  };
  return {
    ...(request.covers.front
      ? { front: await load(request.covers.front.path) }
      : {}),
    ...(request.covers.back
      ? { back: await load(request.covers.back.path) }
      : {}),
  };
}

async function writePublication(
  outputPath: string,
  data: Uint8Array | string,
  force: boolean,
): Promise<void> {
  if (!force) {
    try {
      await stat(outputPath);
      throw Object.assign(new Error(`Output already exists: ${outputPath}`), {
        code: 'EEXIST',
      });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error) {
        if (error.code === 'EEXIST') throw error;
        if (error.code !== 'ENOENT') throw error;
      }
    }
  }

  const temporaryPath = join(
    dirname(outputPath),
    `.${basename(outputPath, extname(outputPath))}-${randomUUID()}.tmp`,
  );
  try {
    await writeFile(temporaryPath, data, { flag: 'wx' });
    if (force) {
      await rename(temporaryPath, outputPath);
    } else {
      await link(temporaryPath, outputPath);
      await unlink(temporaryPath).catch(() => undefined);
    }
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

function response(
  command: 'build' | 'validate',
  ok: boolean,
  options: {
    outputPath?: string;
    diagnostics?: PublicationDiagnostic[];
    error?: string;
    errorCode?: 'usage' | 'io' | 'publish';
  } = {},
): CliWorkerResponse {
  return CliWorkerResponseSchema.parse({
    schemaVersion: 1,
    command,
    ok,
    ...(options.outputPath ? { data: { outputPath: options.outputPath } } : {}),
    diagnostics: options.diagnostics ?? [],
    ...(options.error ? { error: options.error } : {}),
    ...(options.errorCode ? { errorCode: options.errorCode } : {}),
    versions: {
      desktop: app.getVersion(),
      workerProtocol: CLI_WORKER_PROTOCOL,
    },
  });
}

export async function runCliWorker(requestPath: string): Promise<void> {
  const resultPath = join(dirname(requestPath), 'result.json');
  let command: 'build' | 'validate' = 'build';
  let result: CliWorkerResponse;

  try {
    const raw = JSON.parse(await readFile(requestPath, 'utf8')) as unknown;
    const request = CliWorkerRequestSchema.parse(raw);
    command = request.command;
    await validateMarkdownPath(request.sourcePath);
    if (request.command === 'build' && request.outputPath && !request.force) {
      try {
        await stat(request.outputPath);
        throw Object.assign(
          new Error(`Output already exists: ${request.outputPath}`),
          { code: 'EEXIST' },
        );
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error) {
          if (error.code === 'EEXIST') throw error;
          if (error.code !== 'ENOENT') throw error;
        }
      }
    }

    const covers =
      request.command === 'validate' || request.format === 'pdf'
        ? await loadCovers(request)
        : {};

    const hasPdfOnlyOptions =
      request.toc.enabled ||
      request.pageNumber.enabled ||
      Boolean(request.covers.front || request.covers.back);
    const diagnostics: PublicationDiagnostic[] =
      request.format === 'html' && hasPdfOnlyOptions
        ? [
            {
              severity: 'warning',
              code: 'html-pdf-options-ignored',
              message:
                'Table of contents, page numbers, and cover options only affect PDF output and were ignored.',
              sourcePath: request.sourcePath,
              feature: 'html',
            },
          ]
        : [];

    const publicationService = new PublicationService(
      new ElectronPrintBackend(dirname(requestPath)),
      new ElectronMermaidRenderer(
        fileURLToPath(new URL('../renderer/mermaid.html', import.meta.url)),
      ),
      new PageNumberPdfService(),
      new PdfAssemblyService(),
    );

    if (request.command === 'validate') {
      const preview = await publicationService.buildPreview(
        request.sourcePath,
        request.themeId,
        request.pageSize,
        request.styleOverrides,
        request.toc,
      );
      diagnostics.push(...preview.diagnostics);
    } else if (request.format === 'html') {
      const { html, diagnostics: buildDiagnostics } =
        await publicationService.renderHtml(
          request.sourcePath,
          request.themeId,
          request.pageSize,
          request.styleOverrides,
        );
      diagnostics.push(...buildDiagnostics);
      if (
        request.strict &&
        diagnostics.some(({ severity }) => severity === 'warning')
      ) {
        throw new PublicationDiagnosticsError(
          'Warnings were found; strict mode did not write the output.',
          diagnostics,
        );
      }
      if (!request.outputPath)
        throw new Error('Build request is missing outputPath.');
      await writePublication(request.outputPath, html, request.force);
      result = response(command, true, {
        outputPath: request.outputPath,
        diagnostics,
      });
      await writeFile(resultPath, JSON.stringify(result), 'utf8');
      app.exit(0);
      return;
    } else {
      const { pdf, diagnostics: buildDiagnostics } =
        await publicationService.renderPdf(
          request.sourcePath,
          request.themeId,
          request.pageSize,
          request.pageNumber,
          covers,
          request.styleOverrides,
          request.toc,
        );
      diagnostics.push(...buildDiagnostics);
      if (
        request.strict &&
        diagnostics.some(({ severity }) => severity === 'warning')
      ) {
        throw new PublicationDiagnosticsError(
          'Warnings were found; strict mode did not write the output.',
          diagnostics,
        );
      }
      if (!request.outputPath)
        throw new Error('Build request is missing outputPath.');
      await writePublication(request.outputPath, pdf, request.force);
      result = response(command, true, {
        outputPath: request.outputPath,
        diagnostics,
      });
      await writeFile(resultPath, JSON.stringify(result), 'utf8');
      app.exit(0);
      return;
    }

    const hasErrors = diagnostics.some(({ severity }) => severity === 'error');
    const hasStrictWarnings =
      request.strict &&
      diagnostics.some(({ severity }) => severity === 'warning');
    result = response(command, !hasErrors && !hasStrictWarnings, {
      diagnostics,
      ...(hasErrors || hasStrictWarnings
        ? {
            error: hasStrictWarnings
              ? 'Warnings were found; strict mode marked validation as failed.'
              : 'Validation found publication errors.',
            errorCode: 'publish',
          }
        : {}),
    });
  } catch (error) {
    result = response(command, false, {
      diagnostics: diagnosticsFromError(error),
      error: error instanceof Error ? error.message : String(error),
      errorCode: errorCode(error),
    });
  }

  await writeFile(resultPath, JSON.stringify(result), 'utf8');
  app.exit(result.ok ? 0 : 1);
}
