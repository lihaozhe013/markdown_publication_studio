import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_THEMES,
  CoverAssetReferenceSchema,
  CoverSelectionSchema,
  DEFAULT_PAGE_SIZE,
  compareMermaidGeometry,
  compareMermaidMetrics,
  DEFAULT_PAGE_NUMBER_SETTINGS,
  DEFAULT_PUBLICATION_STYLE_OVERRIDES,
  DEFAULT_TOC_SETTINGS,
  getBuiltInTheme,
  HtmlExportRequestSchema,
  PageSizeIdSchema,
  PAGE_SIZE_DEFINITIONS,
  PdfExportRequestSchema,
  formatPageNumber,
  isValidPageNumberFormat,
  OpenDroppedMarkdownRequestSchema,
  PageNumberSettingsSchema,
  PreviewRequestSchema,
  PublicationStyleOverridesSchema,
  resolveNumberedPage,
  TocPresetIdSchema,
  TocSettingsSchema,
  ThemeIdSchema,
  ThemePageCanvasModeSchema,
  type MermaidGeometrySignature,
  type MermaidSvgMetrics,
} from './index.js';

describe('Built-in themes', () => {
  it('exposes separate Modern Serif and Claude themes with canvas modes', () => {
    expect(ThemeIdSchema.parse('modern-serif')).toBe('modern-serif');
    expect(ThemeIdSchema.parse('claude')).toBe('claude');
    expect(ThemePageCanvasModeSchema.parse('inset')).toBe('inset');
    expect(ThemePageCanvasModeSchema.parse('full-bleed')).toBe('full-bleed');
    expect(BUILT_IN_THEMES.map((theme) => theme.id)).toEqual([
      'rose',
      'github-markdown',
      'modern-serif',
      'claude',
    ]);
    expect(BUILT_IN_THEMES.map((theme) => theme.pageCanvasMode)).toEqual([
      'inset',
      'inset',
      'inset',
      'full-bleed',
    ]);
    expect(getBuiltInTheme('claude')).toEqual(
      expect.objectContaining({ pageCanvasMode: 'full-bleed' }),
    );
  });
});

describe('Page number settings', () => {
  it('accepts the default settings and request defaults', () => {
    expect(
      PageNumberSettingsSchema.parse(DEFAULT_PAGE_NUMBER_SETTINGS),
    ).toEqual(DEFAULT_PAGE_NUMBER_SETTINGS);
    expect(
      PageNumberSettingsSchema.parse({
        ...DEFAULT_PAGE_NUMBER_SETTINGS,
        fontFamily: 'source-sans-3',
      }).fontFamily,
    ).toBe('source-sans-3');
    expect(
      PdfExportRequestSchema.parse({ sourcePath: '/manuscripts/book.md' })
        .pageNumber,
    ).toEqual(DEFAULT_PAGE_NUMBER_SETTINGS);
    expect(
      PreviewRequestSchema.parse({ sourcePath: '/manuscripts/book.md' }),
    ).not.toHaveProperty('pageNumber');
    expect(
      PreviewRequestSchema.parse({ sourcePath: '/manuscripts/book.md' })
        .pageSize,
    ).toBe('A4');
    expect(
      HtmlExportRequestSchema.parse({ sourcePath: '/manuscripts/book.md' }),
    ).toEqual(expect.objectContaining({ pageSize: 'A4' }));
  });

  it('defaults export page size to A4 and exposes supported dimensions', () => {
    expect(DEFAULT_PAGE_SIZE).toBe('A4');
    expect(PageSizeIdSchema.parse('Letter')).toBe('Letter');
    expect(() => PageSizeIdSchema.parse('A5')).toThrow();
    expect(
      PdfExportRequestSchema.parse({ sourcePath: '/manuscripts/book.md' })
        .pageSize,
    ).toBe('A4');
    expect(PAGE_SIZE_DEFINITIONS.A4.widthPt).toBeCloseTo(595.28, 2);
    expect(PAGE_SIZE_DEFINITIONS.A4.heightPt).toBeCloseTo(841.89, 2);
    expect(PAGE_SIZE_DEFINITIONS.Letter).toEqual(
      expect.objectContaining({ widthPt: 612, heightPt: 792 }),
    );
  });

  it('accepts supported placeholders and rejects unknown tokens', () => {
    expect(isValidPageNumberFormat('第 {page} 页 / 共 {pages} 页')).toBe(true);
    expect(isValidPageNumberFormat('{page}')).toBe(true);
    expect(isValidPageNumberFormat('{chapter}')).toBe(false);
    expect(isValidPageNumberFormat('Page {page')).toBe(false);
    expect(isValidPageNumberFormat('Page number')).toBe(false);
  });

  it('formats page labels for each first-page rule', () => {
    expect(resolveNumberedPage(0, 4, 'all-pages')).toEqual({
      page: 1,
      pages: 4,
    });
    expect(resolveNumberedPage(0, 4, 'hide-first-start-at-1')).toBeUndefined();
    expect(resolveNumberedPage(1, 4, 'hide-first-start-at-1')).toEqual({
      page: 1,
      pages: 3,
    });
    expect(resolveNumberedPage(1, 4, 'hide-first-start-at-2')).toEqual({
      page: 2,
      pages: 4,
    });
    expect(formatPageNumber('第 {page} 页 / 共 {pages} 页', 2, 8)).toBe(
      '第 2 页 / 共 8 页',
    );
  });
});

describe('Table of contents settings', () => {
  it('defaults requests to a disabled classic-book table of contents', () => {
    expect(TocSettingsSchema.parse(DEFAULT_TOC_SETTINGS)).toEqual(
      DEFAULT_TOC_SETTINGS,
    );
    expect(
      PreviewRequestSchema.parse({ sourcePath: '/manuscripts/book.md' }).toc,
    ).toEqual(DEFAULT_TOC_SETTINGS);
    expect(
      PreviewRequestSchema.parse({ sourcePath: '/manuscripts/book.md' }),
    ).not.toHaveProperty('pageNumbersEnabled');
    expect(
      PdfExportRequestSchema.parse({ sourcePath: '/manuscripts/book.md' }).toc,
    ).toEqual(DEFAULT_TOC_SETTINGS);
  });

  it('accepts both presets and rejects invalid or unknown settings', () => {
    expect(TocPresetIdSchema.parse('modern-technical')).toBe(
      'modern-technical',
    );
    expect(
      TocSettingsSchema.parse({
        enabled: true,
        preset: 'modern-technical',
      }),
    ).toEqual({ enabled: true, preset: 'modern-technical' });
    expect(() => TocPresetIdSchema.parse('minimal')).toThrow();
    expect(() =>
      TocSettingsSchema.parse({
        enabled: true,
        preset: 'classic-book',
        arbitrary: true,
      }),
    ).toThrow();
  });
});

describe('Cover asset settings', () => {
  it('accepts independent front and back asset references', () => {
    const front = {
      id: 'front-asset',
      name: 'front.png',
      kind: 'image' as const,
    };
    const back = {
      id: 'back-asset',
      name: 'back.pdf',
      kind: 'pdf' as const,
      pageCount: 1,
      widthPt: 595.28,
      heightPt: 841.89,
    };

    expect(CoverAssetReferenceSchema.parse(front)).toEqual(front);
    expect(CoverSelectionSchema.parse({ front, back })).toEqual({
      front,
      back,
    });
    expect(
      PdfExportRequestSchema.parse({ sourcePath: '/manuscripts/book.md' })
        .covers,
    ).toEqual({});
  });

  it('rejects unknown cover fields and non-positive PDF metadata', () => {
    expect(() =>
      CoverAssetReferenceSchema.parse({
        id: 'front-asset',
        name: 'front.png',
        kind: 'image',
        arbitraryPath: 'C:\\secret.txt',
      }),
    ).toThrow();
    expect(() =>
      CoverAssetReferenceSchema.parse({
        id: 'back-asset',
        name: 'back.pdf',
        kind: 'pdf',
        widthPt: 0,
      }),
    ).toThrow();
  });
});

describe('Publication style overrides', () => {
  it('defaults preview and export requests to an empty override set', () => {
    expect(
      PublicationStyleOverridesSchema.parse(
        DEFAULT_PUBLICATION_STYLE_OVERRIDES,
      ),
    ).toEqual(DEFAULT_PUBLICATION_STYLE_OVERRIDES);
    expect(
      PreviewRequestSchema.parse({ sourcePath: '/manuscripts/book.md' })
        .styleOverrides,
    ).toEqual(DEFAULT_PUBLICATION_STYLE_OVERRIDES);
    expect(
      HtmlExportRequestSchema.parse({ sourcePath: '/manuscripts/book.md' })
        .styleOverrides,
    ).toEqual(DEFAULT_PUBLICATION_STYLE_OVERRIDES);
    expect(
      PdfExportRequestSchema.parse({ sourcePath: '/manuscripts/book.md' })
        .styleOverrides,
    ).toEqual(DEFAULT_PUBLICATION_STYLE_OVERRIDES);
  });

  it('rejects invalid colors, fonts, ranges, and unknown fields', () => {
    expect(() =>
      PublicationStyleOverridesSchema.parse({
        version: 1,
        body: { color: 'rgb(0 0 0)' },
      }),
    ).toThrow();
    expect(() =>
      PublicationStyleOverridesSchema.parse({
        version: 1,
        body: { fontFamily: 'system-ui' },
      }),
    ).toThrow();
    expect(() =>
      PublicationStyleOverridesSchema.parse({
        version: 1,
        body: { lineHeight: 0.2 },
      }),
    ).toThrow();
    expect(() =>
      PublicationStyleOverridesSchema.parse({
        version: 1,
        body: { color: '#112233', arbitraryCss: 'body { color: red; }' },
      }),
    ).toThrow();
  });
});

describe('Dropped Markdown request validation', () => {
  it('accepts a non-empty source path', () => {
    expect(
      OpenDroppedMarkdownRequestSchema.parse({
        sourcePath: '/manuscripts/book.md',
      }),
    ).toEqual({ sourcePath: '/manuscripts/book.md' });
  });

  it('rejects an empty source path', () => {
    expect(() =>
      OpenDroppedMarkdownRequestSchema.parse({ sourcePath: '' }),
    ).toThrow();
  });
});

const signature = (entries: readonly string[]): MermaidGeometrySignature => ({
  elementCount: entries.length,
  geometryAttributeCount: entries.reduce(
    (count, entry) => count + Math.max(0, entry.split('|').length - 1),
    0,
  ),
  entries,
});

const metrics = (
  boundingBoxWidth: number,
  boundingBoxHeight: number,
): MermaidSvgMetrics => ({
  viewBox: '0 0 1000 1000',
  clientWidth: 1000,
  clientHeight: 1000,
  boundingBoxX: 0,
  boundingBoxY: 0,
  boundingBoxWidth,
  boundingBoxHeight,
});

describe('Mermaid geometry validation', () => {
  it('compares metrics without requiring geometry signatures', () => {
    const report = compareMermaidMetrics(
      metrics(980, 960),
      metrics(980.5, 960.5),
    );

    expect(report.preserved).toBe(true);
    expect(report.maxBoundingBoxDelta).toBe(0.5);
  });

  it('accepts unchanged geometry within the rendering tolerance', () => {
    const before = signature(['svg|viewbox=0 0 1000 1000', 'path|d=M0 0']);
    const after = signature(['svg|viewbox=0 0 1000 1000', 'path|d=M0 0']);

    const report = compareMermaidGeometry(
      before,
      after,
      metrics(980, 960),
      metrics(980.5, 960.5),
    );

    expect(report.preserved).toBe(true);
    expect(report.firstDifference).toBeUndefined();
  });

  it('rejects a sanitizer that removes geometry attributes', () => {
    const report = compareMermaidGeometry(
      signature(['svg|viewbox=0 0 1000 1000', 'path|d=M0 0']),
      signature(['svg|viewbox=0 0 1000 1000', 'path']),
      metrics(980, 960),
      metrics(980, 960),
    );

    expect(report.preserved).toBe(false);
    expect(report.firstDifference).toBe('geometry entry 1 changed');
  });

  it('rejects content collapse even when the root aspect ratio remains valid', () => {
    const report = compareMermaidGeometry(
      signature(['svg|viewbox=0 0 1000 1000', 'path|d=M0 0']),
      signature(['svg|viewbox=0 0 1000 1000', 'path|d=M0 0']),
      metrics(980, 960),
      metrics(980, 38.5),
    );

    expect(report.preserved).toBe(false);
    expect(report.maxBoundingBoxDelta).toBe(921.5);
  });

  it('accepts large Gantt-style bounds with a small proportional difference', () => {
    const report = compareMermaidGeometry(
      signature(['svg|viewbox=0 0 784 316', 'rect|x=0|y=0|width=784']),
      signature(['svg|viewbox=0 0 784 316', 'rect|x=0|y=0|width=784']),
      metrics(11163, 283),
      metrics(11164, 283.5),
    );

    expect(report.preserved).toBe(true);
  });
});
