import { z } from 'zod/v4';
import {
  CoverAssetKindSchema,
  CoverAssetReferenceSchema,
  DEFAULT_PAGE_NUMBER_SETTINGS,
  DEFAULT_PUBLICATION_STYLE_OVERRIDES,
  DEFAULT_TOC_SETTINGS,
  PageNumberSettingsSchema,
  PageSizeIdSchema,
  PublicationDiagnosticSchema,
  PublicationStyleOverridesSchema,
  ThemeCodeThemeSchema,
  ThemePageCanvasModeSchema,
  TocSettingsSchema,
  ThemeIdSchema,
} from './index.js';

export const MCP_SERVER_NAME = 'markdown-publication-studio';
export const MCP_SERVER_VERSION = '0.1.0';

export const McpPromptModeSchema = z.enum(['configure', 'one-time']);
export type McpPromptMode = z.infer<typeof McpPromptModeSchema>;

export const McpLaunchSpecSchema = z
  .object({
    command: z.string().min(1),
    args: z.array(z.string()),
    version: z.string().min(1),
    available: z.boolean(),
    error: z.string().optional(),
  })
  .strict();
export type McpLaunchSpec = z.infer<typeof McpLaunchSpecSchema>;

export const McpConnectionSetupSchema = z
  .object({
    launch: McpLaunchSpecSchema,
    prompts: z.object({ configure: z.string(), oneTime: z.string() }).strict(),
    diagnostics: z.record(z.string(), z.unknown()),
  })
  .strict();
export type McpConnectionSetup = z.infer<typeof McpConnectionSetupSchema>;

export const McpSessionManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    protocol: z.literal(1),
    sessionId: z.string().uuid(),
    port: z.number().int().min(1).max(65535),
    token: z.string().min(64),
    pid: z.number().int().positive(),
    version: z.string().min(1),
    createdAt: z.iso.datetime(),
  })
  .strict();
export type McpSessionManifest = z.infer<typeof McpSessionManifestSchema>;

export const McpPublicationOptionsSchema = z
  .object({
    themeId: ThemeIdSchema.optional(),
    pageSize: PageSizeIdSchema.optional(),
    toc: TocSettingsSchema.optional(),
    pageNumber: PageNumberSettingsSchema.optional(),
    styleOverrides: PublicationStyleOverridesSchema.optional(),
    covers: z
      .object({
        front: z.string().min(1).nullable().optional(),
        back: z.string().min(1).nullable().optional(),
      })
      .strict()
      .optional(),
    strict: z.boolean().optional(),
  })
  .strict();

export const McpPublicationRequestSchema = McpPublicationOptionsSchema.extend({
  sourcePath: z.string().min(1).optional(),
  configPath: z.string().min(1).optional(),
})
  .strict()
  .superRefine((value, context) => {
    if (!value.sourcePath && !value.configPath) {
      context.addIssue({
        code: 'custom',
        path: ['sourcePath'],
        message: 'Provide sourcePath or configPath.',
      });
    }
  });

export const McpPublicationExportRequestSchema =
  McpPublicationRequestSchema.extend({
    outputPath: z.string().min(1),
    format: z.enum(['pdf', 'html']).default('pdf'),
    overwrite: z.boolean().default(false),
  }).strict();

export const McpJobStatusSchema = z.enum([
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
]);
export const McpJobSchema = z
  .object({
    jobId: z.string().min(1),
    kind: z.enum(['validate', 'export']),
    status: McpJobStatusSchema,
    stage: z.string().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
    outputPath: z.string().optional(),
    diagnostics: z.array(PublicationDiagnosticSchema).default([]),
    error: z.string().optional(),
    owner: z.enum(['file', 'session']),
    sessionId: z.string().optional(),
  })
  .strict();
export type McpJob = z.infer<typeof McpJobSchema>;

export const McpSessionIdSchema = z.string().min(1);
export const McpExpectedRevisionSchema = z.number().int().nonnegative();
export const McpSessionRefSchema = z
  .object({
    sessionId: McpSessionIdSchema,
    revision: McpExpectedRevisionSchema,
  })
  .strict();

export const McpSessionOpenSchema = z
  .object({ sessionId: McpSessionIdSchema.optional() })
  .strict();
export const McpSessionDocumentSchema = McpSessionRefSchema.extend({
  action: z.enum(['open', 'close', 'reload']),
  sourcePath: z.string().min(1).optional(),
  discardChanges: z.boolean().default(false),
}).strict();

export const McpSessionUpdateSchema = McpSessionRefSchema.extend({
  themeId: ThemeIdSchema.optional(),
  pageSize: PageSizeIdSchema.optional(),
  toc: TocSettingsSchema.optional(),
  pageNumber: PageNumberSettingsSchema.optional(),
  styleOverrides: PublicationStyleOverridesSchema.optional(),
  covers: z
    .object({
      front: z.string().min(1).nullable().optional(),
      back: z.string().min(1).nullable().optional(),
    })
    .strict()
    .optional(),
}).strict();

export const McpSessionSaveSettingsSchema = McpSessionRefSchema.extend({
  sections: z
    .array(z.enum(['pageNumber', 'style']))
    .min(1)
    .max(2),
}).strict();

export const McpSessionExportSchema = McpSessionRefSchema.extend({
  format: z.enum(['pdf', 'html']),
  outputPath: z.string().min(1),
  overwrite: z.boolean().default(false),
  strict: z.boolean().default(false),
}).strict();

export const McpSessionViewSchema = McpSessionRefSchema.extend({
  zoom: z.number().finite().min(0.25).max(2).optional(),
  scrollY: z.number().finite().nonnegative().optional(),
  heading: z.string().min(1).optional(),
})
  .strict()
  .refine(
    (value) =>
      value.zoom !== undefined ||
      value.scrollY !== undefined ||
      value.heading !== undefined,
    {
      message: 'Provide zoom, scrollY, or heading.',
    },
  );

export const McpSessionCaptureSchema = McpSessionRefSchema.extend({
  scope: z.enum(['preview', 'window']).default('preview'),
}).strict();

export const McpJobLookupSchema = z
  .object({
    jobId: z.string().min(1),
    sessionId: z.string().min(1).optional(),
  })
  .strict();

export const McpSessionStateSchema = z
  .object({
    sessionId: McpSessionIdSchema,
    revision: McpExpectedRevisionSchema,
    source: z
      .object({ path: z.string(), name: z.string() })
      .strict()
      .nullable(),
    settings: z
      .object({
        themeId: ThemeIdSchema,
        pageSize: PageSizeIdSchema,
        toc: TocSettingsSchema,
        pageNumber: PageNumberSettingsSchema,
        styleOverrides: PublicationStyleOverridesSchema,
        covers: z
          .object({ front: z.string().nullable(), back: z.string().nullable() })
          .strict(),
      })
      .strict(),
    styleDirty: z.boolean(),
    preview: z
      .object({
        status: z.enum(['empty', 'building', 'ready', 'failed']),
        revision: z.number().int().nonnegative().nullable(),
      })
      .strict(),
    diagnostics: z.array(PublicationDiagnosticSchema),
    view: z
      .object({
        zoom: z.number().finite().min(0.25).max(2),
        scrollY: z.number().finite().nonnegative(),
      })
      .strict(),
  })
  .strict();
export type McpSessionState = z.infer<typeof McpSessionStateSchema>;

export const McpRendererSnapshotSchema = z
  .object({
    source: z
      .object({ path: z.string(), name: z.string() })
      .strict()
      .nullable(),
    settings: z
      .object({
        themeId: ThemeIdSchema,
        pageSize: PageSizeIdSchema,
        toc: TocSettingsSchema,
        pageNumber: PageNumberSettingsSchema,
        styleOverrides: PublicationStyleOverridesSchema,
        savedStyle: PublicationStyleOverridesSchema,
        covers: z
          .object({
            front: CoverAssetReferenceSchema.nullable(),
            back: CoverAssetReferenceSchema.nullable(),
          })
          .strict(),
      })
      .strict(),
    styleDirty: z.boolean(),
    diagnostics: z.array(PublicationDiagnosticSchema),
    preview: z
      .object({
        status: z.enum(['empty', 'building', 'ready', 'failed']),
        revision: z.number().int().nonnegative().nullable(),
      })
      .strict(),
    view: z
      .object({
        zoom: z.number().finite().min(0.25).max(2),
        scrollY: z.number().finite().nonnegative(),
        previewRect: z
          .object({
            x: z.number(),
            y: z.number(),
            width: z.number().positive(),
            height: z.number().positive(),
          })
          .strict()
          .nullable(),
      })
      .strict(),
  })
  .strict();
export type McpRendererSnapshot = z.infer<typeof McpRendererSnapshotSchema>;

export const McpRendererCommandSchema = z
  .object({
    requestId: z.string().min(1),
    operation: z.enum(['update', 'document', 'save', 'view']),
    expectedRevision: McpExpectedRevisionSchema,
    documentAction: z.enum(['open', 'close', 'reload']).optional(),
    sourcePath: z.string().optional(),
    discardChanges: z.boolean().optional(),
    settings: McpSessionStateSchema.shape.settings.optional(),
    covers: z
      .object({
        front: CoverAssetReferenceSchema.nullable(),
        back: CoverAssetReferenceSchema.nullable(),
      })
      .strict()
      .optional(),
    zoom: z.number().finite().min(0.25).max(2).optional(),
    scrollY: z.number().finite().nonnegative().optional(),
    heading: z.string().optional(),
    sections: z.array(z.enum(['pageNumber', 'style'])).optional(),
  })
  .strict();
export type McpRendererCommand = z.infer<typeof McpRendererCommandSchema>;

export const McpRendererCommandReplySchema = z
  .object({
    requestId: z.string().min(1),
    snapshot: McpRendererSnapshotSchema.optional(),
    error: z.string().optional(),
  })
  .strict();
export type McpRendererCommandReply = z.infer<
  typeof McpRendererCommandReplySchema
>;

export const DEFAULT_MCP_SESSION_SETTINGS = {
  themeId: 'rose',
  pageSize: 'A4',
  toc: DEFAULT_TOC_SETTINGS,
  pageNumber: DEFAULT_PAGE_NUMBER_SETTINGS,
  styleOverrides: DEFAULT_PUBLICATION_STYLE_OVERRIDES,
  covers: { front: null, back: null },
} as const;

export const McpCoverPathSchema = z
  .object({
    path: z.string().min(1),
    kind: CoverAssetKindSchema,
  })
  .strict();

export const McpPublicationDescriptionSchema = z
  .object({
    product: z.string(),
    version: z.string(),
    themes: z.array(
      z
        .object({
          id: ThemeIdSchema,
          name: z.string(),
          description: z.string(),
          pageCanvasMode: ThemePageCanvasModeSchema,
          codeTheme: ThemeCodeThemeSchema,
        })
        .strict(),
    ),
    pageSizes: z.record(
      z.string(),
      z
        .object({
          id: PageSizeIdSchema,
          label: z.string(),
          widthPt: z.number(),
          heightPt: z.number(),
        })
        .strict(),
    ),
    configurationSchema: z.record(z.string(), z.unknown()),
    tocSchema: z.record(z.string(), z.unknown()),
    tools: z.record(z.string(), z.string()),
  })
  .strict();

export const McpJobAcceptedSchema = z
  .object({
    jobId: z.string().min(1),
    status: McpJobStatusSchema,
    kind: z.enum(['validate', 'export']),
    outputPath: z.string().optional(),
  })
  .strict();

const McpReadySessionEntrySchema = McpSessionStateSchema.extend({
  version: z.string(),
  compatible: z.literal(true),
}).strict();

const McpLoadingSessionEntrySchema = z
  .object({
    sessionId: McpSessionIdSchema,
    version: z.string(),
    compatible: z.literal(true),
    ready: z.literal(false),
    status: z.literal('loading'),
    error: z.string(),
  })
  .strict();

export const McpSessionDiscoveryEntrySchema = z.union([
  McpReadySessionEntrySchema,
  McpLoadingSessionEntrySchema,
]);

export const McpSessionListOutputSchema = z
  .object({ sessions: z.array(McpSessionDiscoveryEntrySchema) })
  .strict();

export const McpSessionOpenOutputSchema = z.union([
  McpSessionStateSchema,
  McpReadySessionEntrySchema,
  z
    .object({
      candidates: z.array(McpSessionDiscoveryEntrySchema),
      error: z.string(),
    })
    .strict(),
]);

export const McpSessionCaptureOutputSchema = z
  .object({
    sessionId: McpSessionIdSchema,
    revision: McpExpectedRevisionSchema,
    scope: z.enum(['preview', 'window']),
    view: z
      .object({
        zoom: z.number().finite().min(0.25).max(2),
        scrollY: z.number().finite().nonnegative(),
      })
      .strict()
      .optional(),
    disclaimer: z.string(),
  })
  .strict();
