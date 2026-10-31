import {
  formatPageNumber,
  type PageNumberFirstPageMode,
} from '@markdown-publication/shared';

export type PublicationPageKind = 'front-cover' | 'toc' | 'body' | 'back-cover';

export interface PlannedPageNumber {
  physicalPage: number;
  kind: PublicationPageKind;
  logicalPage: number | null;
  logicalTotal: number | null;
  showFolio: boolean;
  folio: string | null;
}

export interface PageNumberingOptions {
  enabled: boolean;
  format: string;
  firstPageMode: PageNumberFirstPageMode;
  restartBodyAfterToc: boolean;
}

/** Resolve physical page positions independently from logical page labels. */
export function planPageNumbers(
  kinds: readonly PublicationPageKind[],
  options: PageNumberingOptions,
): PlannedPageNumber[] {
  const eligible = kinds.filter((kind) => kind === 'toc' || kind === 'body');
  const bodyCount = eligible.filter((kind) => kind === 'body').length;
  const tocCount = eligible.length - bodyCount;
  let eligibleIndex = 0;
  let tocIndex = 0;
  let bodyIndex = 0;

  return kinds.map((kind, index) => {
    const physicalPage = index + 1;
    if (kind === 'front-cover' || kind === 'back-cover') {
      return {
        physicalPage,
        kind,
        logicalPage: null,
        logicalTotal: null,
        showFolio: false,
        folio: null,
      };
    }

    const streamIndex = eligibleIndex++;
    const sectionIndex = kind === 'toc' ? tocIndex++ : bodyIndex++;
    const sectionCount = kind === 'toc' ? tocCount : bodyCount;
    const groupIndex = options.restartBodyAfterToc ? sectionIndex : streamIndex;
    const groupCount = options.restartBodyAfterToc
      ? sectionCount
      : eligible.length;
    const hideFirst = options.firstPageMode !== 'all-pages';
    const offset = options.firstPageMode === 'hide-first-start-at-1' ? 0 : 1;
    const logicalPage = groupIndex + offset;
    const logicalTotal =
      offset === 0 ? Math.max(0, groupCount - 1) : groupCount;
    const showFolio = options.enabled && !(hideFirst && groupIndex === 0);

    return {
      physicalPage,
      kind,
      logicalPage,
      logicalTotal,
      showFolio,
      folio: showFolio
        ? formatPageNumber(options.format, logicalPage, logicalTotal)
        : null,
    };
  });
}
