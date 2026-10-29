import { app } from 'electron';
import { isAbsolute } from 'node:path';
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod/v4';
import {
  BUILT_IN_THEMES,
  PAGE_SIZE_DEFINITIONS,
  PublishConfigurationSchema,
  TocSettingsSchema,
} from '@markdown-publication/shared';
import {
  McpJobAcceptedSchema,
  McpJobLookupSchema,
  McpJobSchema,
  McpPublicationExportRequestSchema,
  McpPublicationRequestSchema,
  McpPublicationDescriptionSchema,
  McpSessionCaptureSchema,
  McpSessionCaptureOutputSchema,
  McpSessionDocumentSchema,
  McpSessionExportSchema,
  McpSessionListOutputSchema,
  McpSessionOpenSchema,
  McpSessionOpenOutputSchema,
  McpSessionIdSchema,
  McpSessionSaveSettingsSchema,
  McpSessionStateSchema,
  McpSessionUpdateSchema,
  McpSessionViewSchema,
} from '@markdown-publication/shared/mcp';
import { buildPublicationRequest } from '@markdown-publication/publishing-runtime';
import { McpJobService } from './services/mcp-job-service.js';

export interface McpSessionGateway {
  invoke(
    operation: string,
    parameters: unknown,
  ): Promise<Record<string, unknown> & { image?: string }>;
  list(): Promise<Record<string, unknown>[]>;
  getActiveJob(): Record<string, unknown> | undefined;
  cancelActiveJob(): Promise<Record<string, unknown> | undefined>;
  open(): Promise<Record<string, unknown>>;
}

function structuredResult(value: Record<string, unknown>) {
  const { image, ...data } = value;
  return {
    content: [
      ...(typeof image === 'string'
        ? [{ type: 'image' as const, data: image, mimeType: 'image/png' }]
        : []),
      { type: 'text' as const, text: JSON.stringify(data) },
    ],
    structuredContent: data,
  };
}

function errorResult(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const code = message.includes('state_conflict')
    ? 'state_conflict'
    : message.includes('must be an absolute path') ||
        message.includes('Provide sourcePath')
      ? 'invalid_request'
      : message.includes('must not replace an input file')
        ? 'protected_path'
        : message.includes('preview_timeout')
          ? 'preview_timeout'
          : 'operation_failed';
  return {
    isError: true,
    content: [{ type: 'text' as const, text: message }],
    structuredContent: { error: { code, message } },
  };
}

function toolHandler<T extends Record<string, unknown>>(
  handler: (input: T) => Promise<Record<string, unknown>>,
) {
  return async (input: T) => {
    try {
      return structuredResult(await handler(input));
    } catch (error) {
      return errorResult(error);
    }
  };
}

export async function runMcpServer(session?: McpSessionGateway): Promise<void> {
  const fileJobs = new McpJobService('file');
  const server = new McpServer(
    { name: 'markdown-publication-studio', version: app.getVersion() },
    {
      maxToolInputElements: 10_000,
    },
  );

  server.registerTool(
    'publication_describe',
    {
      title: 'Describe publication options',
      description:
        'Return supported themes, page sizes, configuration schema, and tool behavior without opening or reading a document.',
      inputSchema: z.object({}),
      outputSchema: McpPublicationDescriptionSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    toolHandler(async () => ({
      product: 'Markdown Publication Studio',
      version: app.getVersion(),
      themes: BUILT_IN_THEMES,
      pageSizes: PAGE_SIZE_DEFINITIONS,
      configurationSchema: z.toJSONSchema(PublishConfigurationSchema, {
        target: 'draft-07',
        unrepresentable: 'any',
      }) as Record<string, unknown>,
      tocSchema: z.toJSONSchema(TocSettingsSchema, {
        target: 'draft-07',
      }) as Record<string, unknown>,
      tools: {
        publication_validate:
          'Validate one Markdown publication and return a jobId.',
        publication_export:
          'Export one Markdown source to an explicit absolute outputPath.',
        session_list: 'Find GUI sessions. This operation never starts the GUI.',
      },
    })),
  );

  server.registerTool(
    'publication_validate',
    {
      title: 'Validate a publication',
      description:
        'Validate one Markdown source and its assets without writing a publication. Pass an absolute sourcePath or configPath; poll the returned jobId with job_get.',
      inputSchema: McpPublicationRequestSchema,
      outputSchema: McpJobAcceptedSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    toolHandler(async (input) => {
      assertMcpPathsAreAbsolute(input);
      const request = await buildMcpPublicationRequest(input, 'validate');
      const job = fileJobs.enqueue('validate', request);
      return { jobId: job.jobId, status: job.status, kind: job.kind };
    }),
  );

  server.registerTool(
    'publication_export',
    {
      title: 'Export a publication',
      description:
        'Render one Markdown source to PDF or self-contained HTML. Requires an absolute outputPath and does not overwrite existing files unless overwrite is true. Poll jobId with job_get.',
      inputSchema: McpPublicationExportRequestSchema,
      outputSchema: McpJobAcceptedSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    toolHandler(async (input) => {
      assertMcpPathsAreAbsolute(input);
      const request = await buildMcpPublicationRequest(input, 'build');
      const job = fileJobs.enqueue('export', request);
      return {
        jobId: job.jobId,
        status: job.status,
        kind: job.kind,
        outputPath: request.outputPath,
      };
    }),
  );

  server.registerTool(
    'job_get',
    {
      title: 'Get publication job status',
      description:
        'Return current or final status, diagnostics, error, and output path for a file or GUI publication job.',
      inputSchema: McpJobLookupSchema,
      outputSchema: McpJobSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    toolHandler(async ({ jobId, sessionId }) => {
      if (sessionId) {
        if (!session) throw new Error('No GUI session bridge is available.');
        return session.invoke('job_get', { jobId, sessionId });
      }
      const job = fileJobs.get(jobId);
      if (!job) throw new Error(`Unknown file job: ${jobId}`);
      return job as unknown as Record<string, unknown>;
    }),
  );

  server.registerTool(
    'job_cancel',
    {
      title: 'Cancel publication job',
      description:
        'Request cooperative cancellation. Check the final job status before assuming the export was cancelled.',
      inputSchema: McpJobLookupSchema,
      outputSchema: McpJobSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    toolHandler(async ({ jobId, sessionId }) => {
      if (sessionId) {
        if (!session) throw new Error('No GUI session bridge is available.');
        return session.invoke('job_cancel', { jobId, sessionId });
      }
      const job = fileJobs.cancel(jobId);
      if (!job) throw new Error(`Unknown file job: ${jobId}`);
      return job as unknown as Record<string, unknown>;
    }),
  );

  if (session) {
    server.registerTool(
      'session_list',
      {
        title: 'List publication windows',
        description:
          'List compatible running GUI sessions without opening or focusing a window.',
        inputSchema: z.object({}),
        outputSchema: McpSessionListOutputSchema,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
        },
      },
      toolHandler(async () => ({ sessions: await session.list() })),
    );

    server.registerTool(
      'session_open',
      {
        title: 'Open a publication session',
        description:
          'Connect to a selected GUI session or start the installed GUI when none is running. If multiple sessions exist, pass a sessionId returned by session_list.',
        inputSchema: McpSessionOpenSchema,
        outputSchema: McpSessionOpenOutputSchema,
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
        },
      },
      toolHandler(async ({ sessionId }) =>
        sessionId
          ? session.invoke('session_get_state', { sessionId })
          : session.open(),
      ),
    );

    const sessionTools: Array<[string, string, z.ZodType, z.ZodType, string]> =
      [
        [
          'session_get_state',
          'Get current document, settings, revision, diagnostics, preview status, and view position.',
          z.object({ sessionId: McpSessionIdSchema }),
          McpSessionStateSchema,
          'session_get_state',
        ],
        [
          'session_document',
          'Open, close, or reload a Markdown document. Replacing a document with a dirty style draft requires discardChanges=true.',
          McpSessionDocumentSchema,
          McpSessionStateSchema,
          'session_document',
        ],
        [
          'session_update',
          'Replace selected publication settings in the current session. The full section value is validated; updates require expectedRevision.',
          McpSessionUpdateSchema,
          McpSessionStateSchema,
          'session_update',
        ],
        [
          'session_save_settings',
          'Explicitly persist the current page-number and/or style settings as application-wide defaults.',
          McpSessionSaveSettingsSchema,
          McpSessionStateSchema,
          'session_save_settings',
        ],
        [
          'session_export',
          'Export the effective settings at expectedRevision to an absolute outputPath.',
          McpSessionExportSchema,
          McpJobSchema,
          'session_export',
        ],
        [
          'session_view',
          'Set preview zoom or scroll to a vertical position or document heading.',
          McpSessionViewSchema,
          McpSessionStateSchema,
          'session_view',
        ],
        [
          'session_capture',
          'Capture a PNG of the preview area or current application window. Preview capture is not final PDF pagination.',
          McpSessionCaptureSchema,
          McpSessionCaptureOutputSchema,
          'session_capture',
        ],
      ];
    for (const [
      name,
      description,
      schema,
      outputSchema,
      operation,
    ] of sessionTools) {
      server.registerTool(
        name,
        {
          title: name.replaceAll('_', ' '),
          description,
          inputSchema: schema as never,
          outputSchema,
          annotations: {
            readOnlyHint: name === 'session_get_state',
            destructiveHint: false,
            idempotentHint: ['session_get_state', 'session_capture'].includes(
              name,
            ),
          },
        },
        toolHandler((input) => session.invoke(operation, input)) as never,
      );
    }
  } else {
    server.registerTool(
      'session_list',
      {
        title: 'List publication windows',
        description:
          'List running Markdown Publication Studio GUI sessions without opening the application.',
        inputSchema: z.object({}),
        outputSchema: McpSessionListOutputSchema,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
        },
      },
      toolHandler(async () => ({ sessions: [] })),
    );
  }

  process.stdin.once('end', () => {
    void shutdown();
  });
  const handle = serveStdio(() => server, { legacy: 'serve' });
  let isShuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    await fileJobs.close();
    await handle.close();
    app.quit();
  };
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
}

function assertMcpPathsAreAbsolute(input: Record<string, unknown>): void {
  for (const key of ['sourcePath', 'configPath'] as const) {
    const value = input[key];
    if (typeof value === 'string' && !isAbsolute(value))
      throw new Error(`${key} must be an absolute path.`);
  }
  const covers = input.covers;
  if (covers && typeof covers === 'object') {
    for (const slot of ['front', 'back'] as const) {
      const value = (covers as Record<string, unknown>)[slot];
      if (typeof value === 'string' && !isAbsolute(value))
        throw new Error(`covers.${slot} must be an absolute path.`);
    }
  }
}

async function buildMcpPublicationRequest(
  input: Record<string, unknown>,
  command: 'build' | 'validate',
) {
  const covers = input.covers as
    { front?: string | null; back?: string | null } | undefined;
  return buildPublicationRequest({
    ...Object.fromEntries(
      Object.entries(input).filter(
        ([key, value]) => key !== 'covers' && value !== undefined,
      ),
    ),
    ...(covers?.front !== undefined ? { frontCover: covers.front } : {}),
    ...(covers?.back !== undefined ? { backCover: covers.back } : {}),
    command,
  } as Parameters<typeof buildPublicationRequest>[0]);
}
