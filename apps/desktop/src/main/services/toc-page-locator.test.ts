import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import type { TocEntry } from '@markdown-publication/publication-core';
import { PdfTocPageLocator } from './toc-page-locator.js';

function entry(id: string, title: string, order: number): TocEntry {
  return {
    id,
    level: 1,
    title,
    searchText: title.toLowerCase(),
    order,
    chapterId: 'book',
    sourcePath: '/manuscripts/book.md',
  };
}

async function createPdfWithContents(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const tocPage = document.addPage([612, 792]);
  tocPage.drawText('Contents', { x: 50, y: 740, size: 24, font });
  tocPage.drawText('Introduction 2', { x: 50, y: 680, size: 12, font });
  tocPage.drawText('Repeated heading 3', { x: 50, y: 650, size: 12, font });
  tocPage.drawText('Repeated heading 4', { x: 50, y: 620, size: 12, font });

  const introductionPage = document.addPage([612, 792]);
  introductionPage.drawText('Introduction', {
    x: 50,
    y: 740,
    size: 24,
    font,
    color: rgb(0, 0, 0),
  });
  introductionPage.drawText('Body text', { x: 50, y: 700, size: 12, font });

  const firstRepeatedPage = document.addPage([612, 792]);
  firstRepeatedPage.drawText('Repeated heading', {
    x: 50,
    y: 740,
    size: 24,
    font,
  });

  const secondRepeatedPage = document.addPage([612, 792]);
  secondRepeatedPage.drawText('Repeated heading', {
    x: 50,
    y: 740,
    size: 24,
    font,
  });

  return document.save();
}

describe('PdfTocPageLocator', () => {
  it('skips the contents occurrences and maps repeated headings in order', async () => {
    const entries = [
      entry('intro', 'Introduction', 0),
      entry('repeat-one', 'Repeated heading', 1),
      entry('repeat-two', 'Repeated heading', 2),
    ];
    const domMatrixDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      'DOMMatrix',
    );
    Object.defineProperty(globalThis, 'DOMMatrix', {
      configurable: true,
      value: undefined,
      writable: true,
    });
    let result;
    try {
      result = await new PdfTocPageLocator().locate(
        await createPdfWithContents(),
        entries,
      );
    } finally {
      if (domMatrixDescriptor) {
        Object.defineProperty(globalThis, 'DOMMatrix', domMatrixDescriptor);
      } else {
        Reflect.deleteProperty(globalThis, 'DOMMatrix');
      }
    }

    expect(result.pageCount).toBe(4);
    expect([...result.pages.entries()]).toEqual([
      ['intro', 2],
      ['repeat-one', 3],
      ['repeat-two', 4],
    ]);
  });

  it('reports malformed PDFs and missing body headings with toc errors', async () => {
    await expect(
      new PdfTocPageLocator().locate(new Uint8Array([1, 2, 3]), [
        entry('intro', 'Introduction', 0),
      ]),
    ).rejects.toThrow('[toc] Could not inspect the rendered PDF');

    const document = await PDFDocument.create();
    const font = await document.embedFont(StandardFonts.Helvetica);
    const page = document.addPage([595, 842]);
    page.drawText('Contents', { x: 40, y: 800, size: 20, font });
    page.drawText('Missing 1', { x: 40, y: 760, size: 12, font });

    await expect(
      new PdfTocPageLocator().locate(await document.save(), [
        entry('missing', 'Missing', 0),
      ]),
    ).rejects.toThrow('heading "Missing"');
  });
});
