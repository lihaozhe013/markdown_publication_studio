import { describe, expect, it } from 'vitest';
import {
  PublicationStyleOverridesSchema,
  type PublicationStyleOverrides,
} from '@markdown-publication/shared';
import {
  collectStyleOverrideFontIds,
  renderStyleOverrides,
} from './style-overrides.js';

describe('publication style overrides', () => {
  it('accepts sparse, structured overrides', () => {
    const style = PublicationStyleOverridesSchema.parse({
      version: 1,
      body: { fontFamily: 'source-serif-4', fontSizePt: 13, color: '#403630' },
      headings: {
        levels: { h1: { fontSizePt: 30, marginBottomPt: 12 } },
      },
    });

    expect(style.body?.fontFamily).toBe('source-serif-4');
    expect(style.headings?.levels?.h1?.fontSizePt).toBe(30);
  });

  it('rejects unsafe or out-of-range values', () => {
    expect(() =>
      PublicationStyleOverridesSchema.parse({
        version: 1,
        body: { color: 'red' },
      }),
    ).toThrow();
    expect(() =>
      PublicationStyleOverridesSchema.parse({
        version: 1,
        body: { fontSizePt: 100 },
      }),
    ).toThrow();
    expect(() =>
      PublicationStyleOverridesSchema.parse({
        version: 1,
        body: { fontFamily: 'Comic Sans MS' },
      }),
    ).toThrow();
    expect(() =>
      PublicationStyleOverridesSchema.parse({
        version: 1,
        body: { color: '#112233', unexpected: 'value' },
      }),
    ).toThrow();
  });

  it('renders only fixed selectors and preserves empty sections', () => {
    const style: PublicationStyleOverrides = {
      version: 1,
      body: {
        fontFamily: 'source-serif-4',
        fontSizePt: 13,
        color: '#403630',
        backgroundColor: '#F7F5F2',
        lineHeight: 1.7,
        letterSpacingPt: 0.2,
      },
      headings: {
        fontWeight: 700,
        levels: { h1: { fontSizePt: 30 } },
      },
      paragraphAndLists: { listIndentPt: 28 },
      links: { color: '#B85D43', underline: false },
      inlineCode: {
        fontFamily: 'jetbrains-mono',
        backgroundColor: '#EEE9E3',
        borderRadiusPt: 4,
        paddingHorizontalPt: 3,
        paddingVerticalPt: 1,
      },
      codeBlock: {
        fontSizePt: 10,
        color: '#403630',
        backgroundColor: '#EEE9E3',
        paddingPt: 12,
      },
      blockquote: {
        borderColor: '#D97757',
        borderWidthPt: 3,
        paddingPt: 10,
      },
      table: {
        headerBackgroundColor: '#F1DFD6',
        stripeBackgroundColor: '#F7F5F2',
        cellPaddingPt: 6,
      },
      media: { imageBorderRadiusPt: 8 },
      divider: { color: '#D97757', thicknessPt: 2 },
    };

    const css = renderStyleOverrides(style);

    expect(css).toContain("font-family: 'Source Serif 4'");
    expect(css).toContain('font-size: 13pt !important;');
    expect(css).toContain('.markdown-body h1');
    expect(css).toContain('text-decoration-line: none !important;');
    expect(css).toContain('.markdown-body table thead th');
    expect(css).toContain('.markdown-body img');
    expect(css).not.toContain('url(');
    expect(css).not.toContain('unexpected');
    expect(collectStyleOverrideFontIds(style)).toEqual([
      'source-serif-4',
      'jetbrains-mono',
    ]);
  });
});
