/** Contracts between the main process and the isolated layout program. */

export interface PaginationProgramOptions {
  pageSize: 'A4' | 'Letter';
  pageMarginTop: string;
  pageMarginRight: string;
  pageMarginBottom: string;
  pageMarginLeft: string;
  screenBackground: string;
  pageBackground: string;
  templateBackgrounds: Record<string, string>;
  folioFontFamily: string;
  folioFontSizePt: number;
  folioFontWeight: number;
  folioFontStyle: 'normal' | 'italic';
  folioColor: string;
  tocPageColumnWidthEm: number;
  prefillLabels: Record<string, string>;
}

export interface LayoutPageReport {
  kind: 'toc' | 'body';
  template: 'default' | 'toc' | 'section';
}

export interface LayoutOverflowReport {
  page: number;
  tag: string;
  text: string;
  width: number;
  height: number;
  offsetLeft: number;
  offsetTop: number;
}

export interface LayoutDiagnostic {
  severity: 'info' | 'warning' | 'error';
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface PaginationPassReport {
  pageCount: number;
  pages: LayoutPageReport[];
  anchorPages: Record<string, number>;
  geometry: string;
  overflow: LayoutOverflowReport[];
  diagnostics: LayoutDiagnostic[];
}

export interface PaginationApplyOptions {
  pageSize: 'A4' | 'Letter';
  folioFontFamily: string;
  folioFontSizePt: number;
  folioFontWeight: number;
  folioFontStyle: 'normal' | 'italic';
  folioColor: string;
  labels: Record<string, string>;
  folios: Array<string | null>;
  templates: string[];
  templateBackgrounds: Record<string, string>;
  screenBackground: string;
  pageBackground: string;
  geometry: string;
}

export interface PaginationApplyReport {
  html: string;
  geometryStable: boolean;
  overflow: LayoutOverflowReport[];
}
