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
