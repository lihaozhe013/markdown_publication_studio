import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import type { TocEntry } from '@markdown-publication/publication-core';
import { normalizeTocText } from '@markdown-publication/publication-core';

interface TextContentItem {
  str: string;
}

interface TextContentResult {
  items: Array<unknown>;
}

interface TextOccurrence {
  globalOffset: number;
  page: number;
  endOffset: number;
}

type PdfJsModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
type PdfJsLoadingTask = ReturnType<PdfJsModule['getDocument']>;
type PdfJsDocument = Awaited<PdfJsLoadingTask['promise']>;

class PdfJsDomMatrixPolyfill {
  a = 1;
  b = 0;
  c = 0;
  d = 1;
  e = 0;
  f = 0;

  constructor(values?: readonly number[]) {
    if (!values || values.length < 6) return;
    this.a = values[0] ?? this.a;
    this.b = values[1] ?? this.b;
    this.c = values[2] ?? this.c;
    this.d = values[3] ?? this.d;
    this.e = values[4] ?? this.e;
    this.f = values[5] ?? this.f;
  }
}

const require = createRequire(import.meta.url);

function resolveStandardFontDataUrl(): string | undefined {
  try {
    const standardFontDataDirectory = dirname(
      require.resolve('pdfjs-dist/standard_fonts/FoxitFixed.pfb'),
    );
    return `${standardFontDataDirectory.replaceAll('\\', '/')}/`;
  } catch {
    return undefined;
  }
}

function ensurePdfJsDomMatrix(): void {
  if (typeof globalThis.DOMMatrix === 'function') return;
  Object.defineProperty(globalThis, 'DOMMatrix', {
    configurable: true,
    value: PdfJsDomMatrixPolyfill,
    writable: true,
  });
}

async function loadPdfJs(): Promise<PdfJsModule> {
  ensurePdfJsDomMatrix();
  const [pdfJs] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    // PDF.js disables native workers in Node.js and falls back to this module.
    // Loading it explicitly keeps the Vite-built main process from resolving a
    // package-relative worker path that does not exist in the output folder.
    import('pdfjs-dist/legacy/build/pdf.worker.mjs'),
  ]);
  return pdfJs;
}

export type TocPageMap = ReadonlyMap<string, number>;

export interface TocPageLocation {
  pageCount: number;
  pages: TocPageMap;
}

function locatorError(message: string): Error {
  return new Error(`[toc] ${message}`);
}

function isTextContentItem(value: unknown): value is TextContentItem {
  return (
    typeof value === 'object' &&
    value !== null &&
    'str' in value &&
    typeof value.str === 'string'
  );
}

function pageText(content: TextContentResult): string {
  return normalizeTocText(
    content.items
      .filter(isTextContentItem)
      .map((item) => item.str)
      .join(''),
  );
}

function findOccurrences(
  pages: readonly string[],
  searchText: string,
): TextOccurrence[] {
  if (!searchText) return [];
  const occurrences: TextOccurrence[] = [];
  let pageStart = 0;
  for (const [pageIndex, text] of pages.entries()) {
    let offset = text.indexOf(searchText);
    while (offset >= 0) {
      occurrences.push({
        globalOffset: pageStart + offset,
        page: pageIndex + 1,
        endOffset: pageStart + offset + searchText.length,
      });
      offset = text.indexOf(searchText, offset + 1);
    }
    pageStart += text.length + 1;
  }
  return occurrences;
}

function firstOccurrenceAfter(
  occurrences: readonly TextOccurrence[],
  minimumOffset: number,
): TextOccurrence | undefined {
  return occurrences.find(({ globalOffset }) => globalOffset >= minimumOffset);
}

function findOrderedSequence(
  pages: readonly string[],
  entries: readonly TocEntry[],
  minimumOffset: number,
): TextOccurrence[] | undefined {
  const sequence: TextOccurrence[] = [];
  let cursor = minimumOffset;
  for (const entry of entries) {
    const searchText = normalizeTocText(entry.searchText || entry.title);
    const occurrence = firstOccurrenceAfter(
      findOccurrences(pages, searchText),
      cursor,
    );
    if (!occurrence) return undefined;
    sequence.push(occurrence);
    cursor = occurrence.endOffset;
  }
  return sequence;
}

export interface TocPageLocator {
  locate(
    pdfBytes: Uint8Array,
    entries: readonly TocEntry[],
  ): Promise<TocPageLocation>;
}

export class PdfTocPageLocator implements TocPageLocator {
  async locate(
    pdfBytes: Uint8Array,
    entries: readonly TocEntry[],
  ): Promise<TocPageLocation> {
    if (entries.length === 0) return { pageCount: 0, pages: new Map() };

    let document: PdfJsDocument | undefined;
    let loadingTask: PdfJsLoadingTask | undefined;
    try {
      const { getDocument } = await loadPdfJs();
      const standardFontDataUrl = resolveStandardFontDataUrl();
      loadingTask = getDocument({
        data: new Uint8Array(pdfBytes),
        useSystemFonts: false,
        useWorkerFetch: false,
        ...(standardFontDataUrl ? { standardFontDataUrl } : {}),
      });
      document = await loadingTask.promise;
      const pages: string[] = [];
      for (
        let pageNumber = 1;
        pageNumber <= document.numPages;
        pageNumber += 1
      ) {
        const page = await document.getPage(pageNumber);
        const content = (await page.getTextContent({
          includeMarkedContent: false,
        })) as unknown as TextContentResult;
        pages.push(pageText(content));
        page.cleanup();
      }

      const orderedEntries = [...entries].sort(
        (left, right) => left.order - right.order,
      );
      const contentsOccurrence = firstOccurrenceAfter(
        findOccurrences(pages, normalizeTocText('Contents')),
        0,
      );
      const tocSequence = findOrderedSequence(
        pages,
        orderedEntries,
        contentsOccurrence?.endOffset ?? 0,
      );
      if (!tocSequence) {
        const firstEntry = orderedEntries[0];
        throw locatorError(
          `Could not locate the heading "${firstEntry?.title ?? 'unknown'}" in the rendered PDF.`,
        );
      }
      const bodySequence = findOrderedSequence(
        pages,
        orderedEntries,
        tocSequence.at(-1)?.endOffset ?? 0,
      );
      if (!bodySequence) {
        const firstEntry = orderedEntries[0];
        throw locatorError(
          `Could not locate the heading "${firstEntry?.title ?? 'unknown'}" in the rendered PDF body.`,
        );
      }

      const pageMap = new Map<string, number>();
      orderedEntries.forEach((entry, index) => {
        const occurrence = bodySequence[index];
        if (occurrence) pageMap.set(entry.id, occurrence.page);
      });
      return { pageCount: document.numPages, pages: pageMap };
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('[toc]')) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw locatorError(`Could not inspect the rendered PDF: ${message}`);
    } finally {
      await loadingTask?.destroy();
    }
  }
}
