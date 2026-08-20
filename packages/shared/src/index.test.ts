import { describe, expect, it } from 'vitest';
import {
  compareMermaidGeometry,
  compareMermaidMetrics,
  type MermaidGeometrySignature,
  type MermaidSvgMetrics,
} from './index.js';

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
