import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAGE_NUMBER_SETTINGS,
  type PageNumberSettings,
} from '@markdown-publication/shared';
import {
  assertPaginationPlanMatches,
  planPagination,
  type GeneratedPageDescriptor,
} from './page-plan.js';

const descriptors: GeneratedPageDescriptor[] = [
  { kind: 'toc', template: 'toc' },
  { kind: 'body', template: 'default' },
  { kind: 'body', template: 'default' },
  { kind: 'body', template: 'section' },
];

const pageNumber = (
  overrides: Partial<PageNumberSettings> = {},
): PageNumberSettings => ({
  ...DEFAULT_PAGE_NUMBER_SETTINGS,
  enabled: true,
  ...overrides,
});

describe('pagination plan', () => {
  it('keeps logical total count in the legacy body scope', () => {
    const plan = planPagination(descriptors, {
      pageNumber: pageNumber(),
      restartBodyAfterToc: false,
      frontCoverPages: 1,
    });

    expect(plan.pages.map((page) => page.physicalPage)).toEqual([2, 3, 4, 5]);
    expect(plan.pages.map((page) => page.logicalPage)).toEqual([1, 2, 3, 4]);
    expect(plan.pages.map((page) => page.folio)).toEqual([
      '1 / 4',
      '2 / 4',
      '3 / 4',
      '4 / 4',
    ]);
    expect(plan.pages.map((page) => page.template)).toEqual([
      'toc',
      'default',
      'default',
      'section',
    ]);
    expect(plan.tocPages).toEqual([1]);
    expect(plan.bodyStartPage).toBe(2);
    expect(plan.coverPages).toBe(1);
  });

  it('restarts body numbering after a multipage contents section', () => {
    const plan = planPagination(
      [
        { kind: 'toc', template: 'toc' },
        { kind: 'toc', template: 'toc' },
        ...descriptors.slice(1),
      ],
      {
        pageNumber: pageNumber(),
        restartBodyAfterToc: true,
        frontCoverPages: 1,
        backCoverPages: 1,
      },
    );

    expect(plan.pages.map((page) => page.logicalPage)).toEqual([1, 2, 1, 2, 3]);
    expect(plan.pages.map((page) => page.logicalTotal)).toEqual([
      2, 2, 3, 3, 3,
    ]);
    expect(plan.pages.map((page) => page.physicalPage)).toEqual([
      2, 3, 4, 5, 6,
    ]);
    expect(plan.tocPages).toEqual([1, 2]);
    expect(plan.bodyStartPage).toBe(3);
    expect(plan.coverPages).toBe(2);
  });

  it('preserves the first-page modes and disabled numbering', () => {
    const hidden = planPagination(descriptors, {
      pageNumber: pageNumber({ firstPageMode: 'hide-first-start-at-2' }),
      restartBodyAfterToc: false,
    });
    expect(hidden.pages[0]?.logicalPage).toBe(1);
    expect(hidden.pages[0]?.folio).toBeNull();
    expect(hidden.pages[1]?.logicalPage).toBe(2);

    const restarted = planPagination(descriptors, {
      pageNumber: pageNumber({ firstPageMode: 'hide-first-start-at-1' }),
      restartBodyAfterToc: false,
    });
    expect(restarted.pages.map((page) => page.logicalPage)).toEqual([
      0, 1, 2, 3,
    ]);
    expect(restarted.pages.map((page) => page.label)).toEqual([
      null,
      '1',
      '2',
      '3',
    ]);
    expect(restarted.pages.map((page) => page.logicalTotal)).toEqual([
      3, 3, 3, 3,
    ]);

    const disabled = planPagination(descriptors, {
      pageNumber: { ...DEFAULT_PAGE_NUMBER_SETTINGS, enabled: false },
      restartBodyAfterToc: false,
    });
    expect(disabled.pages.every((page) => page.folio === null)).toBe(true);
  });

  it('rejects plans that do not match the generated page count', () => {
    const plan = planPagination(descriptors, {
      pageNumber: pageNumber(),
      restartBodyAfterToc: false,
    });
    expect(() => assertPaginationPlanMatches(plan, 4)).not.toThrow();
    expect(() => assertPaginationPlanMatches(plan, 5)).toThrow(
      'Pagination plan has 4 pages but the layout produced 5.',
    );
  });
});
