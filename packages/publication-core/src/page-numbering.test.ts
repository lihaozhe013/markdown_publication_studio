import { describe, expect, it } from 'vitest';
import { resolveNumberedPage } from '@markdown-publication/shared';
import {
  planPageNumbers,
  type PageNumberingOptions,
  type PublicationPageKind,
} from './page-numbering.js';

const kinds: PublicationPageKind[] = [
  'front-cover',
  'toc',
  'toc',
  'body',
  'body',
  'back-cover',
];
const options: PageNumberingOptions = {
  enabled: true,
  format: '{page} / {pages}',
  firstPageMode: 'all-pages',
  restartBodyAfterToc: false,
};

describe('publication page numbering plan', () => {
  it('separates physical position, logical labels and covers', () => {
    const plan = planPageNumbers(kinds, options);
    expect(plan.map((page) => page.physicalPage)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(plan.map((page) => page.logicalPage)).toEqual([
      null,
      1,
      2,
      3,
      4,
      null,
    ]);
    expect(plan.map((page) => page.folio)).toEqual([
      null,
      '1 / 4',
      '2 / 4',
      '3 / 4',
      '4 / 4',
      null,
    ]);
  });

  it.each([
    'all-pages',
    'hide-first-start-at-1',
    'hide-first-start-at-2',
  ] as const)('preserves the existing %s folio policy', (firstPageMode) => {
    const plan = planPageNumbers(kinds, { ...options, firstPageMode }).filter(
      (page) => page.kind === 'toc' || page.kind === 'body',
    );
    plan.forEach((page, index) => {
      const existing = resolveNumberedPage(index, plan.length, firstPageMode);
      expect(page.showFolio).toBe(Boolean(existing));
      if (existing) {
        expect(page.logicalPage).toBe(existing.page);
        expect(page.logicalTotal).toBe(existing.pages);
      }
    });
  });

  it('restarts body labels after a multipage contents section when requested', () => {
    const plan = planPageNumbers(kinds, {
      ...options,
      restartBodyAfterToc: true,
    });
    expect(plan.map((page) => page.logicalPage)).toEqual([
      null,
      1,
      2,
      1,
      2,
      null,
    ]);
    expect(plan[3]?.folio).toBe('1 / 2');
  });

  it('retains logical labels when folios are disabled', () => {
    const plan = planPageNumbers(kinds, { ...options, enabled: false });
    expect(plan[3]?.logicalPage).toBe(3);
    expect(plan.every((page) => page.folio === null)).toBe(true);
  });

  it('handles publications without numbered pages', () => {
    const plan = planPageNumbers(['front-cover', 'back-cover'], options);
    expect(plan.every((page) => page.logicalPage === null)).toBe(true);
  });
});
