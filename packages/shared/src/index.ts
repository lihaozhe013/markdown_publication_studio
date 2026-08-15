import { z } from 'zod';

export const PreviewRequestSchema = z.object({
  sourcePath: z.string().min(1),
});

export const ExportRequestSchema = z.object({
  sourcePath: z.string().min(1),
});

export type PreviewRequest = z.infer<typeof PreviewRequestSchema>;
export type ExportRequest = z.infer<typeof ExportRequestSchema>;

export interface PublicationDiagnostic {
  severity: 'info' | 'warning' | 'error';
  code: string;
  message: string;
  sourcePath?: string;
  line?: number;
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
  };
}
