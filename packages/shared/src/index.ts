import { z } from 'zod';

export const ThemeIdSchema = z.enum(['rose', 'github-markdown', 'claude']);

export const PageNumberFontIdSchema = z.enum([
  'inter',
  'open-sans',
  'source-han-sans',
  'jetbrains-mono',
  'source-serif-4',
  'source-han-serif',
]);

export const PageNumberStyleSchema = z.enum(['normal', 'bold', 'italic']);

export const PageNumberFirstPageModeSchema = z.enum([
  'all-pages',
  'hide-first-start-at-1',
  'hide-first-start-at-2',
]);

const pageNumberFormatTokenPattern = /\{([^{}]*)\}/gu;
const pageNumberFormatTokens = new Set(['page', 'pages']);

export function isValidPageNumberFormat(value: string): boolean {
  if (value.length === 0 || value.length > 160 || /[\r\n]/u.test(value)) {
    return false;
  }

  const matches = [...value.matchAll(pageNumberFormatTokenPattern)];
  if (matches.length === 0) return false;
  if (matches.some((match) => !pageNumberFormatTokens.has(match[1] ?? ''))) {
    return false;
  }

  const withoutTokens = value.replace(pageNumberFormatTokenPattern, '');
  return !/[{}]/u.test(withoutTokens);
}

export const PageNumberFormatSchema = z
  .string()
  .trim()
  .refine(isValidPageNumberFormat, {
    message:
      'Use at least one supported placeholder: {page} or {pages}. Unknown placeholders are not allowed.',
  });

export const PageNumberSettingsSchema = z.object({
  enabled: z.boolean(),
  fontFamily: PageNumberFontIdSchema,
  fontSizePt: z.number().finite().min(6).max(24),
  style: PageNumberStyleSchema,
  format: PageNumberFormatSchema,
  firstPageMode: PageNumberFirstPageModeSchema,
});

export const DEFAULT_PAGE_NUMBER_SETTINGS = {
  enabled: false,
  fontFamily: 'source-han-sans',
  fontSizePt: 10,
  style: 'normal',
  format: '{page} / {pages}',
  firstPageMode: 'all-pages',
} as const satisfies z.infer<typeof PageNumberSettingsSchema>;

export function formatPageNumber(
  format: string,
  page: number | string,
  pages: number | string,
): string {
  return format
    .replaceAll('{page}', String(page))
    .replaceAll('{pages}', String(pages));
}

export interface NumberedPage {
  page: number;
  pages: number;
}

export function resolveNumberedPage(
  pageIndex: number,
  pageCount: number,
  mode: PageNumberFirstPageMode,
): NumberedPage | undefined {
  if (mode === 'all-pages') {
    return { page: pageIndex + 1, pages: pageCount };
  }
  if (pageIndex === 0) return undefined;
  if (mode === 'hide-first-start-at-1') {
    return { page: pageIndex, pages: Math.max(0, pageCount - 1) };
  }
  return { page: pageIndex + 1, pages: pageCount };
}

export const PreviewRequestSchema = z.object({
  sourcePath: z.string().min(1),
  themeId: ThemeIdSchema.default('rose'),
});

export const PdfExportRequestSchema = z.object({
  sourcePath: z.string().min(1),
  themeId: ThemeIdSchema.default('rose'),
  pageNumber: PageNumberSettingsSchema.default(DEFAULT_PAGE_NUMBER_SETTINGS),
});

export const HtmlExportRequestSchema = z.object({
  sourcePath: z.string().min(1),
  themeId: ThemeIdSchema.default('rose'),
});

export const OpenDroppedMarkdownRequestSchema = z.object({
  sourcePath: z.string().min(1),
});

export type PreviewRequest = z.infer<typeof PreviewRequestSchema>;
export type PdfExportRequest = z.infer<typeof PdfExportRequestSchema>;
export type HtmlExportRequest = z.infer<typeof HtmlExportRequestSchema>;
export type ThemeId = PreviewRequest['themeId'];
export type PageNumberSettings = z.infer<typeof PageNumberSettingsSchema>;
export type PageNumberFontId = PageNumberSettings['fontFamily'];
export type PageNumberStyle = PageNumberSettings['style'];
export type PageNumberFirstPageMode = PageNumberSettings['firstPageMode'];

export interface PublicationTheme {
  id: ThemeId;
  name: string;
  description: string;
}

export const BUILT_IN_THEMES: readonly PublicationTheme[] = [
  {
    id: 'rose',
    name: 'Rose',
    description: 'Soft rose palette with Github structure.',
  },
  {
    id: 'github-markdown',
    name: 'Github',
    description: 'Clean GitHub-inspired technical documentation styling.',
  },
  {
    id: 'claude',
    name: 'Modern Serif',
    description: 'Serif-led reading layout with elegant typography.',
  },
];

export interface PublicationDiagnostic {
  severity: 'info' | 'warning' | 'error';
  code: string;
  message: string;
  sourcePath?: string;
  line?: number;
  chapterId?: string;
  feature?:
    'asset' | 'code' | 'html' | 'math' | 'mermaid' | 'page-number' | 'render';
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
  settings: {
    getPageNumber(): Promise<PageNumberSettings>;
    savePageNumber(settings: PageNumberSettings): Promise<PageNumberSettings>;
  };
  project: {
    openMarkdown(): Promise<MarkdownFileReference | null>;
    openDroppedMarkdown(file: File): Promise<MarkdownFileReference>;
  };
  preview: {
    build(request: PreviewRequest): Promise<PreviewResult>;
  };
  export: {
    start(request: PdfExportRequest): Promise<ExportResult | null>;
    html(request: HtmlExportRequest): Promise<ExportResult | null>;
  };
}

export interface MermaidSvgMetrics {
  viewBox: string;
  clientWidth: number;
  clientHeight: number;
  boundingBoxX: number;
  boundingBoxY: number;
  boundingBoxWidth: number;
  boundingBoxHeight: number;
}

export interface MermaidGeometrySignature {
  elementCount: number;
  geometryAttributeCount: number;
  entries: readonly string[];
}

export interface MermaidGeometryReport {
  preserved: boolean;
  beforeElementCount: number;
  afterElementCount: number;
  beforeGeometryAttributeCount: number;
  afterGeometryAttributeCount: number;
  maxBoundingBoxDelta: number;
  firstDifference?: string;
}

export interface MermaidMetricsReport {
  preserved: boolean;
  maxBoundingBoxDelta: number;
}

const MERMAID_GEOMETRY_TOLERANCE_PX = 2;
const MERMAID_GEOMETRY_TOLERANCE_RATIO = 0.01;

function metricDelta(
  before: MermaidSvgMetrics,
  after: MermaidSvgMetrics,
): number {
  return Math.max(
    Math.abs(before.boundingBoxX - after.boundingBoxX),
    Math.abs(before.boundingBoxY - after.boundingBoxY),
    Math.abs(before.boundingBoxWidth - after.boundingBoxWidth),
    Math.abs(before.boundingBoxHeight - after.boundingBoxHeight),
  );
}

function metricTolerance(
  before: MermaidSvgMetrics,
  after: MermaidSvgMetrics,
): number {
  return Math.max(
    MERMAID_GEOMETRY_TOLERANCE_PX,
    Math.max(
      Math.abs(before.boundingBoxX),
      Math.abs(before.boundingBoxY),
      Math.abs(before.boundingBoxWidth),
      Math.abs(before.boundingBoxHeight),
      Math.abs(after.boundingBoxX),
      Math.abs(after.boundingBoxY),
      Math.abs(after.boundingBoxWidth),
      Math.abs(after.boundingBoxHeight),
    ) * MERMAID_GEOMETRY_TOLERANCE_RATIO,
  );
}

export function compareMermaidMetrics(
  before: MermaidSvgMetrics | undefined,
  after: MermaidSvgMetrics | undefined,
): MermaidMetricsReport {
  const maxBoundingBoxDelta =
    before === undefined || after === undefined
      ? Number.POSITIVE_INFINITY
      : metricDelta(before, after);
  const preserved =
    before !== undefined &&
    after !== undefined &&
    maxBoundingBoxDelta <= metricTolerance(before, after);

  return { preserved, maxBoundingBoxDelta };
}

export function compareMermaidGeometry(
  before: MermaidGeometrySignature,
  after: MermaidGeometrySignature,
  beforeMetrics: MermaidSvgMetrics | undefined,
  afterMetrics: MermaidSvgMetrics | undefined,
): MermaidGeometryReport {
  let firstDifference: string | undefined;
  const maxEntries = Math.max(before.entries.length, after.entries.length);
  for (let index = 0; index < maxEntries; index += 1) {
    if (before.entries[index] !== after.entries[index]) {
      firstDifference = `geometry entry ${index} changed`;
      break;
    }
  }

  const metricsReport = compareMermaidMetrics(beforeMetrics, afterMetrics);

  return {
    preserved:
      firstDifference === undefined &&
      before.elementCount === after.elementCount &&
      before.geometryAttributeCount === after.geometryAttributeCount &&
      metricsReport.preserved,
    beforeElementCount: before.elementCount,
    afterElementCount: after.elementCount,
    beforeGeometryAttributeCount: before.geometryAttributeCount,
    afterGeometryAttributeCount: after.geometryAttributeCount,
    maxBoundingBoxDelta: metricsReport.maxBoundingBoxDelta,
    ...(firstDifference === undefined ? {} : { firstDifference }),
  };
}
