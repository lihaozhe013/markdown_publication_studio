import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PDFDocument, PDFDict, PDFName, PDFRawStream } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import type {
  PageNumberFontId,
  PageNumberSettings,
} from '@markdown-publication/shared';
import { PageNumberPdfService } from './page-number-pdf-service.js';
import type { PageNumberFontAsset } from './page-number-font-service.js';

const settings: PageNumberSettings = {
  enabled: true,
  fontFamily: 'noto-sans-sc',
  fontSizePt: 10,
  style: 'bold',
  format: '第 {page} 页 / 共 {pages} 页',
  firstPageMode: 'hide-first-start-at-1',
};

async function createFixturePdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.addPage([595, 842]);
  pdf.addPage([595, 842]);
  pdf.addPage([595, 842]);
  return pdf.save();
}

async function createFontLoader(): Promise<
  (fontId: PageNumberFontId) => Promise<PageNumberFontAsset>
> {
  const bytes = await readFile(
    resolve(
      process.cwd(),
      'themes/md2p-gui/fonts/Noto_Sans_SC/static/NotoSansSC-Regular.ttf',
    ),
  );
  const asset: PageNumberFontAsset = {
    familyName: 'Noto Sans SC',
    bytes,
    fontFaceCss: '',
    allowSubsetting: false,
  };
  return async () => asset;
}

function getEmbeddedFontStreamSizes(document: PDFDocument): number[] {
  return document.context.enumerateIndirectObjects().flatMap(([, object]) => {
    if (!(object instanceof PDFDict)) return [];
    const type = object.lookup(PDFName.of('Type'));
    if (!(type instanceof PDFName) || type.decodeText() !== 'FontDescriptor') {
      return [];
    }
    const stream = object.lookup(PDFName.of('FontFile2'));
    return stream instanceof PDFRawStream ? [stream.getContentsSize()] : [];
  });
}

describe('PageNumberPdfService', () => {
  it('preserves page count and adds embedded page-number content', async () => {
    const source = await createFixturePdf();
    const result = await new PageNumberPdfService(
      await createFontLoader(),
    ).apply(source, settings);
    const document = await PDFDocument.load(result);

    expect(document.getPageCount()).toBe(3);
    expect(result.byteLength).toBeGreaterThan(source.byteLength);
  });

  it('embeds large CJK fonts without subsetting', async () => {
    const source = await createFixturePdf();
    const result = await new PageNumberPdfService(
      await createFontLoader(),
    ).apply(source, {
      ...settings,
      format: '{page} / {pages}',
    });
    const document = await PDFDocument.load(result);
    const fontStreamSizes = getEmbeddedFontStreamSizes(document);

    expect(fontStreamSizes.some((size) => size > 1_000_000)).toBe(true);
  });

  it('does not modify disabled page-number output', async () => {
    const source = await createFixturePdf();
    const result = await new PageNumberPdfService().apply(source, {
      ...settings,
      enabled: false,
    });

    expect(result).toBe(source);
  });
});
