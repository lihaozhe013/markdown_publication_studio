import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_THEMES,
  compareMermaidGeometry,
  compareMermaidMetrics,
  DEFAULT_PAGE_NUMBER_SETTINGS,
  getBuiltInTheme,
  HtmlExportRequestSchema,
  PdfExportRequestSchema,
  formatPageNumber,
  isValidPageNumberFormat,
  OpenDroppedMarkdownRequestSchema,
  PageNumberSettingsSchema,
  PreviewRequestSchema,
  resolveNumberedPage,
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
      PdfExportRequestSchema.parse({ sourcePath: '/manuscripts/book.md' })
        .pageNumber,
    ).toEqual(DEFAULT_PAGE_NUMBER_SETTINGS);
    expect(
      PreviewRequestSchema.parse({ sourcePath: '/manuscripts/book.md' }),
    ).not.toHaveProperty('pageNumber');
    expect(
      HtmlExportRequestSchema.parse({ sourcePath: '/manuscripts/book.md' }),
    ).not.toHaveProperty('pageNumber');
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
