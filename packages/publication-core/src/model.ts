import type {
  PublicationDiagnostic,
  PublicationStyleOverrides,
  PageSizeId,
  ThemeId,
  ThemePageCanvasMode,
} from '@markdown-publication/shared';

export interface MarkdownSource {
  path: string;
  content: string;
}

export interface PublicationFeatureOptions {
  codeTheme?: 'github-dark' | 'github-light';
  math?: {
    enabled: boolean;
  };
  mermaid?: {
    enabled: boolean;
  };
  html?: {
    policy: 'safe-static';
  };
}

export interface CompileContext {
  projectRoot: string;
  features?: PublicationFeatureOptions;
}

export interface CompiledChapter {
  id: string;
  sourcePath: string;
  title: string;
  html: string;
  diagnostics: PublicationDiagnostic[];
  mermaidDiagramCount: number;
}

export interface PublicationHtmlOptions {
  title: string;
  themeId?: ThemeId;
  pageCanvasMode?: ThemePageCanvasMode;
  stylesheet?: string;
  styleOverrides?: PublicationStyleOverrides;
  features?: PublicationFeatureOptions;
  pageSize?: PageSizeId;
  margins?: {
    top: string;
    right: string;
    bottom: string;
    left: string;
  };
}
