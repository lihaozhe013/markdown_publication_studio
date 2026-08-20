import { z } from 'zod';

export const ThemeIdSchema = z.enum(['rose', 'github-markdown', 'claude']);

export const PreviewRequestSchema = z.object({
  sourcePath: z.string().min(1),
  themeId: ThemeIdSchema.default('rose'),
});

export const ExportRequestSchema = z.object({
  sourcePath: z.string().min(1),
  themeId: ThemeIdSchema.default('rose'),
});

export type PreviewRequest = z.infer<typeof PreviewRequestSchema>;
export type ExportRequest = z.infer<typeof ExportRequestSchema>;
export type ThemeId = PreviewRequest['themeId'];

export interface PublicationTheme {
  id: ThemeId;
  name: string;
  description: string;
}

export const BUILT_IN_THEMES: readonly PublicationTheme[] = [
  {
    id: 'rose',
    name: 'Rose',
    description: 'Soft rose palette with GitHub Markdown structure.',
  },
  {
    id: 'github-markdown',
    name: 'GitHub Markdown',
    description: 'Clean GitHub-inspired technical documentation styling.',
  },
  {
    id: 'claude',
    name: 'Claude',
    description: 'Serif-led reading layout with Claude-inspired typography.',
  },
];

export interface PublicationDiagnostic {
  severity: 'info' | 'warning' | 'error';
  code: string;
  message: string;
  sourcePath?: string;
  line?: number;
  chapterId?: string;
  feature?: 'asset' | 'code' | 'html' | 'math' | 'mermaid' | 'render';
  details?: Record<string, unknown>;
}

export interface MarkdownFileReference {
  path: string;
  name: string;
}

export interface PreviewResult {
  title: string;
  html: string;
  diagnostics: PublicationDiagnostic[];
}

export interface ExportResult {
  outputPath: string;
  diagnostics: PublicationDiagnostic[];
}

export interface DesktopApi {
  project: {
    openMarkdown(): Promise<MarkdownFileReference | null>;
  };
  preview: {
    build(request: PreviewRequest): Promise<PreviewResult>;
  };
  export: {
    start(request: ExportRequest): Promise<ExportResult | null>;
    html(request: ExportRequest): Promise<ExportResult | null>;
  };
}
