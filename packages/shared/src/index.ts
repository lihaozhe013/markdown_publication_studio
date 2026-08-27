import { z } from 'zod';

export const ThemeIdSchema = z.enum([
  'rose',
  'github-markdown',
  'modern-serif',
  'claude',
]);

export const ThemePageCanvasModeSchema = z.enum(['inset', 'full-bleed']);

export const PageSizeIdSchema = z.enum(['A4', 'Letter']);

export type PageSizeId = z.infer<typeof PageSizeIdSchema>;

export const TocPresetIdSchema = z.enum(['classic-book', 'modern-technical']);

export type TocPresetId = z.infer<typeof TocPresetIdSchema>;

export interface TocPresetDefinition {
  id: TocPresetId;
  label: string;
  description: string;
}

export const TOC_PRESET_DEFINITIONS: readonly TocPresetDefinition[] = [
  {
    id: 'classic-book',
    label: 'Classic Book',
    description: 'Serif-led hierarchy with dotted leaders and page references.',
  },
  {
    id: 'modern-technical',
    label: 'Modern Technical',
    description: 'Compact sans-serif entries with a theme-colored accent rail.',
  },
];

export const TocSettingsSchema = z
  .object({
    enabled: z.boolean(),
    preset: TocPresetIdSchema,
  })
  .strict();

export type TocSettings = z.infer<typeof TocSettingsSchema>;

export const DEFAULT_TOC_SETTINGS = {
  enabled: false,
  preset: 'classic-book',
} as const satisfies TocSettings;

export interface PageSizeDefinition {
  id: PageSizeId;
  label: string;
  widthPt: number;
  heightPt: number;
}

export const PAGE_SIZE_DEFINITIONS: Readonly<
  Record<PageSizeId, PageSizeDefinition>
> = {
  A4: {
    id: 'A4',
    label: 'A4',
    widthPt: (210 * 72) / 25.4,
    heightPt: (297 * 72) / 25.4,
  },
  Letter: {
    id: 'Letter',
    label: 'Letter',
    widthPt: 612,
    heightPt: 792,
  },
};

export function getPageSizeDefinition(
  pageSize: PageSizeId,
): PageSizeDefinition {
  const definition = PAGE_SIZE_DEFINITIONS[pageSize];
  if (!definition) {
    throw new Error(`Unknown page size: ${pageSize}`);
  }
  return definition;
}

export const DEFAULT_PAGE_SIZE: PageSizeId = 'A4';

export const CoverAssetKindSchema = z.enum(['image', 'pdf']);

export const CoverAssetReferenceSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    kind: CoverAssetKindSchema,
    pageCount: z.number().int().positive().optional(),
    widthPt: z.number().finite().positive().optional(),
    heightPt: z.number().finite().positive().optional(),
  })
  .strict();

export const CoverSelectionSchema = z
  .object({
    front: CoverAssetReferenceSchema.optional(),
    back: CoverAssetReferenceSchema.optional(),
  })
  .strict();

export const PageNumberFontIdSchema = z.enum([
  'inter',
  'open-sans',
  'source-han-sans',
  'jetbrains-mono',
  'source-sans-3',
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

export const PublicationFontIdSchema = PageNumberFontIdSchema;

export const PublicationFontWeightSchema = z.union([
  z.literal(300),
  z.literal(400),
  z.literal(500),
  z.literal(600),
  z.literal(700),
  z.literal(800),
]);

export const PublicationHexColorSchema = z
  .string()
  .regex(/^#[0-9a-f]{6}$/iu, 'Use a six-digit hexadecimal color.');

const styleFontSizePtSchema = z.number().finite().min(6).max(72);
const styleLineHeightSchema = z.number().finite().min(0.8).max(3);
const styleSpacingPtSchema = z.number().finite().min(0).max(96);
const styleBorderMetricPtSchema = z.number().finite().min(0).max(16);
const styleLetterSpacingPtSchema = z.number().finite().min(-4).max(12);

export const PublicationHeadingLevelOverrideSchema = z
  .object({
    fontSizePt: styleFontSizePtSchema.optional(),
    marginTopPt: styleSpacingPtSchema.optional(),
    marginBottomPt: styleSpacingPtSchema.optional(),
  })
  .strict();

export const PublicationHeadingLevelsSchema = z
  .object({
    h1: PublicationHeadingLevelOverrideSchema.optional(),
    h2: PublicationHeadingLevelOverrideSchema.optional(),
    h3: PublicationHeadingLevelOverrideSchema.optional(),
    h4: PublicationHeadingLevelOverrideSchema.optional(),
    h5: PublicationHeadingLevelOverrideSchema.optional(),
    h6: PublicationHeadingLevelOverrideSchema.optional(),
  })
  .strict();

export const PublicationBodyStyleOverridesSchema = z
  .object({
    fontFamily: PublicationFontIdSchema.optional(),
    fontSizePt: styleFontSizePtSchema.optional(),
    fontWeight: PublicationFontWeightSchema.optional(),
    color: PublicationHexColorSchema.optional(),
    backgroundColor: PublicationHexColorSchema.optional(),
    lineHeight: styleLineHeightSchema.optional(),
    letterSpacingPt: styleLetterSpacingPtSchema.optional(),
  })
  .strict();

export const PublicationHeadingStyleOverridesSchema = z
  .object({
    fontFamily: PublicationFontIdSchema.optional(),
    color: PublicationHexColorSchema.optional(),
    fontWeight: PublicationFontWeightSchema.optional(),
    lineHeight: styleLineHeightSchema.optional(),
    levels: PublicationHeadingLevelsSchema.optional(),
  })
  .strict();

export const PublicationParagraphAndListStyleOverridesSchema = z
  .object({
    paragraphSpacingPt: styleSpacingPtSchema.optional(),
    listIndentPt: styleSpacingPtSchema.optional(),
    listItemSpacingPt: styleSpacingPtSchema.optional(),
  })
  .strict();

export const PublicationLinkStyleOverridesSchema = z
  .object({
    color: PublicationHexColorSchema.optional(),
    underline: z.boolean().optional(),
  })
  .strict();

export const PublicationInlineCodeStyleOverridesSchema = z
  .object({
    fontFamily: PublicationFontIdSchema.optional(),
    fontSizePt: styleFontSizePtSchema.optional(),
    color: PublicationHexColorSchema.optional(),
    backgroundColor: PublicationHexColorSchema.optional(),
    borderRadiusPt: styleBorderMetricPtSchema.optional(),
    paddingHorizontalPt: styleSpacingPtSchema.optional(),
    paddingVerticalPt: styleSpacingPtSchema.optional(),
  })
  .strict();

export const PublicationCodeBlockStyleOverridesSchema = z
  .object({
    fontFamily: PublicationFontIdSchema.optional(),
    fontSizePt: styleFontSizePtSchema.optional(),
    color: PublicationHexColorSchema.optional(),
    backgroundColor: PublicationHexColorSchema.optional(),
    lineHeight: styleLineHeightSchema.optional(),
    borderRadiusPt: styleBorderMetricPtSchema.optional(),
    paddingPt: styleSpacingPtSchema.optional(),
  })
  .strict();

export const PublicationBlockquoteStyleOverridesSchema = z
  .object({
    color: PublicationHexColorSchema.optional(),
    backgroundColor: PublicationHexColorSchema.optional(),
    borderColor: PublicationHexColorSchema.optional(),
    borderWidthPt: styleBorderMetricPtSchema.optional(),
    borderRadiusPt: styleBorderMetricPtSchema.optional(),
    paddingPt: styleSpacingPtSchema.optional(),
  })
  .strict();

export const PublicationTableStyleOverridesSchema = z
  .object({
    color: PublicationHexColorSchema.optional(),
    borderColor: PublicationHexColorSchema.optional(),
    headerColor: PublicationHexColorSchema.optional(),
    headerBackgroundColor: PublicationHexColorSchema.optional(),
    stripeBackgroundColor: PublicationHexColorSchema.optional(),
    cellPaddingPt: styleSpacingPtSchema.optional(),
    borderRadiusPt: styleBorderMetricPtSchema.optional(),
  })
  .strict();

export const PublicationMediaStyleOverridesSchema = z
  .object({
    imageBorderRadiusPt: styleBorderMetricPtSchema.optional(),
  })
  .strict();

export const PublicationDividerStyleOverridesSchema = z
  .object({
    color: PublicationHexColorSchema.optional(),
    thicknessPt: styleBorderMetricPtSchema.optional(),
  })
  .strict();

export const PublicationStyleOverridesSchema = z
  .object({
    version: z.literal(1),
    body: PublicationBodyStyleOverridesSchema.optional(),
    headings: PublicationHeadingStyleOverridesSchema.optional(),
    paragraphAndLists:
      PublicationParagraphAndListStyleOverridesSchema.optional(),
    links: PublicationLinkStyleOverridesSchema.optional(),
    inlineCode: PublicationInlineCodeStyleOverridesSchema.optional(),
    codeBlock: PublicationCodeBlockStyleOverridesSchema.optional(),
    blockquote: PublicationBlockquoteStyleOverridesSchema.optional(),
    table: PublicationTableStyleOverridesSchema.optional(),
    media: PublicationMediaStyleOverridesSchema.optional(),
    divider: PublicationDividerStyleOverridesSchema.optional(),
  })
  .strict();

export const DEFAULT_PUBLICATION_STYLE_OVERRIDES = {
  version: 1,
} as const satisfies z.infer<typeof PublicationStyleOverridesSchema>;

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
  pageSize: PageSizeIdSchema.default(DEFAULT_PAGE_SIZE),
  toc: TocSettingsSchema.default(DEFAULT_TOC_SETTINGS),
  pageNumbersEnabled: z.boolean().default(false),
  styleOverrides: PublicationStyleOverridesSchema.default(
    DEFAULT_PUBLICATION_STYLE_OVERRIDES,
  ),
});

export const PdfExportRequestSchema = z.object({
  sourcePath: z.string().min(1),
  themeId: ThemeIdSchema.default('rose'),
  pageSize: PageSizeIdSchema.default(DEFAULT_PAGE_SIZE),
  toc: TocSettingsSchema.default(DEFAULT_TOC_SETTINGS),
  styleOverrides: PublicationStyleOverridesSchema.default(
    DEFAULT_PUBLICATION_STYLE_OVERRIDES,
  ),
  pageNumber: PageNumberSettingsSchema.default(DEFAULT_PAGE_NUMBER_SETTINGS),
  covers: CoverSelectionSchema.default({}),
});

export const HtmlExportRequestSchema = z.object({
  sourcePath: z.string().min(1),
  themeId: ThemeIdSchema.default('rose'),
  pageSize: PageSizeIdSchema.default(DEFAULT_PAGE_SIZE),
  styleOverrides: PublicationStyleOverridesSchema.default(
    DEFAULT_PUBLICATION_STYLE_OVERRIDES,
  ),
});

export const OpenDroppedMarkdownRequestSchema = z.object({
  sourcePath: z.string().min(1),
});

export type PreviewRequest = z.infer<typeof PreviewRequestSchema>;
export type PdfExportRequest = z.infer<typeof PdfExportRequestSchema>;
export type HtmlExportRequest = z.infer<typeof HtmlExportRequestSchema>;
export type ThemeId = PreviewRequest['themeId'];
export type ThemePageCanvasMode = z.infer<typeof ThemePageCanvasModeSchema>;
export type CoverAssetKind = z.infer<typeof CoverAssetKindSchema>;
export type CoverAssetReference = z.infer<typeof CoverAssetReferenceSchema>;
export type CoverSelection = z.infer<typeof CoverSelectionSchema>;
export type PageNumberSettings = z.infer<typeof PageNumberSettingsSchema>;
export type PageNumberFontId = PageNumberSettings['fontFamily'];
export type PageNumberStyle = PageNumberSettings['style'];
export type PageNumberFirstPageMode = PageNumberSettings['firstPageMode'];
export type PublicationFontId = z.infer<typeof PublicationFontIdSchema>;
export type PublicationFontWeight = z.infer<typeof PublicationFontWeightSchema>;
export type PublicationStyleOverrides = z.infer<
  typeof PublicationStyleOverridesSchema
>;

export interface PublicationTheme {
  id: ThemeId;
  name: string;
  description: string;
  pageCanvasMode: ThemePageCanvasMode;
}

export const BUILT_IN_THEMES: readonly PublicationTheme[] = [
  {
    id: 'rose',
    name: 'Rose',
    description: 'Soft rose palette with Github structure.',
    pageCanvasMode: 'inset',
  },
  {
    id: 'github-markdown',
    name: 'Github',
    description: 'Clean GitHub-inspired technical documentation styling.',
    pageCanvasMode: 'inset',
  },
  {
    id: 'modern-serif',
    name: 'Modern Serif',
    description: 'Serif-led reading layout with elegant typography.',
    pageCanvasMode: 'inset',
  },
  {
    id: 'claude',
    name: 'Claude',
    description: 'Warm paper, orange accents, and spacious serif typography.',
    pageCanvasMode: 'full-bleed',
  },
];

export function getBuiltInTheme(themeId: ThemeId): PublicationTheme {
  const theme = BUILT_IN_THEMES.find((candidate) => candidate.id === themeId);
  if (!theme) {
    throw new Error(`Unknown built-in theme: ${themeId}`);
  }
  return theme;
}

export interface PublicationDiagnostic {
  severity: 'info' | 'warning' | 'error';
  code: string;
  message: string;
  sourcePath?: string;
  line?: number;
  chapterId?: string;
  feature?:
    | 'asset'
    | 'code'
    | 'cover'
    | 'html'
    | 'math'
    | 'mermaid'
    | 'page-number'
    | 'toc'
    | 'render';
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
    getCustomStyle(): Promise<PublicationStyleOverrides>;
    saveCustomStyle(
      styleOverrides: PublicationStyleOverrides,
    ): Promise<PublicationStyleOverrides>;
  };
  project: {
    openMarkdown(): Promise<MarkdownFileReference | null>;
    openDroppedMarkdown(file: File): Promise<MarkdownFileReference>;
    chooseCoverAsset(): Promise<CoverAssetReference | null>;
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
