import type {
  PublicationDiagnostic,
  ThemeId,
} from '@markdown-publication/shared';

export interface MarkdownSource {
  path: string;
  content: string;
}

export interface CompileContext {
  projectRoot: string;
}

export interface CompiledChapter {
  id: string;
  sourcePath: string;
  title: string;
  html: string;
  diagnostics: PublicationDiagnostic[];
}

export interface PublicationHtmlOptions {
  title: string;
  themeId?: ThemeId;
  stylesheet?: string;
  pageSize?: 'A4' | 'Letter';
  margins?: {
    top: string;
    right: string;
    bottom: string;
    left: string;
  };
}
