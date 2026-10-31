import type {
  PageNumberSettings,
  PageTemplateId,
  PaginatedPage,
  PaginatedPageKind,
  PaginationPlan,
} from '@markdown-publication/shared';
import { planPageNumbers } from './page-numbering.js';

export interface GeneratedPageDescriptor {
  kind: PaginatedPageKind;
  template: PageTemplateId;
}

export interface PaginationPlanOptions {
  pageNumber: PageNumberSettings;
  restartBodyAfterToc: boolean;
  frontCoverPages?: number;
  backCoverPages?: number;
}

/**
 * Resolve the complete page sequence, including cover slots, into physical
 * positions and logical folio labels. Generated pages keep their artifact
 * order; cover slots only affect physical positions and numbering scope.
 */
export function planPagination(
  descriptors: readonly GeneratedPageDescriptor[],
  options: PaginationPlanOptions,
): PaginationPlan {
  const frontCoverPages = Math.max(0, options.frontCoverPages ?? 0);
  const backCoverPages = Math.max(0, options.backCoverPages ?? 0);
  const numbering = planPageNumbers(
    [
      ...Array.from({ length: frontCoverPages }, () => 'front-cover' as const),
      ...descriptors.map((descriptor) => descriptor.kind),
      ...Array.from({ length: backCoverPages }, () => 'back-cover' as const),
    ],
    {
      enabled: options.pageNumber.enabled,
      format: options.pageNumber.format,
      firstPageMode: options.pageNumber.firstPageMode,
      restartBodyAfterToc: options.restartBodyAfterToc,
    },
  );

  const pages: PaginatedPage[] = descriptors.map((descriptor, index) => {
    const numberingEntry = numbering[index + frontCoverPages];
    if (!numberingEntry) {
      throw new Error('Page numbering plan is missing a generated page.');
    }
    return {
      physicalPage: numberingEntry.physicalPage,
      generatedPage: index + 1,
      kind: descriptor.kind,
      template: descriptor.template,
      logicalPage: numberingEntry.logicalPage,
      logicalTotal: numberingEntry.logicalTotal,
      label:
        numberingEntry.folio === null || numberingEntry.logicalPage === null
          ? null
          : String(numberingEntry.logicalPage),
      folio: numberingEntry.folio,
    };
  });

  return {
    pages,
    tocPages: pages
      .filter((page) => page.kind === 'toc')
      .map((page) => page.generatedPage),
    bodyStartPage:
      pages.find((page) => page.kind === 'body')?.generatedPage ?? null,
    restartBodyAfterToc: options.restartBodyAfterToc,
    coverPages: frontCoverPages + backCoverPages,
  };
}

/** Verify that a plan matches the generated page count it claims to describe. */
export function assertPaginationPlanMatches(
  plan: PaginationPlan,
  generatedPageCount: number,
): void {
  if (plan.pages.length !== generatedPageCount) {
    throw new Error(
      `Pagination plan has ${plan.pages.length} pages but the layout produced ${generatedPageCount}.`,
    );
  }
  plan.pages.forEach((page, index) => {
    if (page.generatedPage !== index + 1) {
      throw new Error('Pagination plan pages are not in generated order.');
    }
  });
}
