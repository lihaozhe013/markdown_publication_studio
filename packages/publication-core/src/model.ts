import type {
  PublicationDiagnostic,
  PublicationStyleOverrides,
  PageSizeId,
  TocPresetId,
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
  tocEntries: TocEntry[];
  diagnostics: PublicationDiagnostic[];
  mermaidDiagramCount: number;
}

export type TocHeadingLevel = 1 | 2 | 3;

export interface TocEntry {
  id: string;
  level: TocHeadingLevel;
  title: string;
  searchText: string;
  order: number;
  chapterId: string;
  sourcePath: string;
}

export interface PublicationTocOptions {
  preset: TocPresetId;
  entries: readonly TocEntry[];
}

export interface PublicationHtmlOptions {
  title: string;
  themeId?: ThemeId;
  pageCanvasMode?: ThemePageCanvasMode;
  stylesheet?: string;
  styleOverrides?: PublicationStyleOverrides;
  features?: PublicationFeatureOptions;
  pageSize?: PageSizeId;
  toc?: PublicationTocOptions;
  margins?: {
    top: string;
    right: string;
    bottom: string;
    left: string;
  };
}
