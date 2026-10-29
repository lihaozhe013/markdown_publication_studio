import { PDFDocument, degrees, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {
  formatPageNumber,
  resolveNumberedPage,
  type PageNumberFontId,
  type PageNumberSettings,
} from '@markdown-publication/shared';
import {
  loadPageNumberFont,
  type PageNumberFontAsset,
} from './page-number-font-service.js';

const DEFAULT_BOTTOM_MARGIN_MM = 20;
const MILLIMETERS_TO_POINTS = 72 / 25.4;
const PAGE_NUMBER_COLOR = rgb(0, 0, 0);
const ITALIC_SKEW_DEGREES = 12;
const BOLD_STROKE_OFFSETS = [0, 0.18, 0.36];

interface TextRun {
  text: string;
  font: PDFFont;
}

interface NumberedPageText {
  page: PDFPage;
  text: string;
}

function createMissingGlyphError(
  character: string,
  fontAsset: PageNumberFontAsset,
): Error {
  const codePoint = character.codePointAt(0);
  const codePointLabel =
    codePoint === undefined
      ? 'unknown code point'
      : `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`;
  const characterLabel = JSON.stringify(character);
  return new Error(
    `[page-number] The selected page-number font (${fontAsset.familyName}) cannot render character ${characterLabel} (${codePointLabel}). Use basic Latin letters, digits, and punctuation with {page} or {pages}.`,
  );
}

function createTextRuns(
  text: string,
  font: PDFFont,
  fontAsset: PageNumberFontAsset,
): TextRun[] {
  const runs: TextRun[] = [];
  for (const character of Array.from(text)) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined || !fontAsset.hasGlyph(codePoint)) {
      throw createMissingGlyphError(character, fontAsset);
    }
    const previous = runs.at(-1);
    if (previous?.font === font) {
      previous.text += character;
    } else {
      runs.push({ text: character, font });
    }
  }
  return runs;
}

function textWidth(runs: readonly TextRun[], fontSize: number): number {
  return runs.reduce(
    (width, run) => width + run.font.widthOfTextAtSize(run.text, fontSize),
    0,
  );
}

function drawStyledRun(
  page: PDFPage,
  run: TextRun,
  x: number,
  y: number,
  fontSize: number,
  style: PageNumberSettings['style'],
): void {
  const common = {
    y,
    size: fontSize,
    font: run.font,
    color: PAGE_NUMBER_COLOR,
    ...(style === 'italic' ? { xSkew: degrees(ITALIC_SKEW_DEGREES) } : {}),
  };
  if (style === 'bold') {
    for (const offset of BOLD_STROKE_OFFSETS) {
      page.drawText(run.text, { ...common, x: x + offset });
    }
    return;
  }
  page.drawText(run.text, { ...common, x });
}

function drawPageNumber(
  page: PDFPage,
  text: string,
  settings: PageNumberSettings,
  fontAsset: PageNumberFontAsset,
  font: PDFFont,
): void {
  const fontSize = settings.fontSizePt;
  const runs = createTextRuns(text, font, fontAsset);
  const width = textWidth(runs, fontSize);
  const pageWidth = page.getWidth();
  const bottomMargin = DEFAULT_BOTTOM_MARGIN_MM * MILLIMETERS_TO_POINTS;
  const fontHeight = font.heightAtSize(fontSize);
  const x = (pageWidth - width) / 2;
  const y = Math.max(4, (bottomMargin - fontHeight) / 2);

  let cursor = x;
  for (const run of runs) {
    drawStyledRun(page, run, cursor, y, fontSize, settings.style);
    cursor += run.font.widthOfTextAtSize(run.text, fontSize);
  }
}

export class PageNumberPdfService {
  constructor(
    private readonly fontLoader: (
      fontId: PageNumberFontId,
    ) => Promise<PageNumberFontAsset> = loadPageNumberFont,
  ) {}

  async apply(
    pdfBytes: Uint8Array,
    settings: PageNumberSettings,
  ): Promise<Uint8Array> {
    if (!settings.enabled) return pdfBytes;

    const pdf = await PDFDocument.load(pdfBytes);
    pdf.registerFontkit(fontkit);
    const fontAsset = await this.fontLoader(settings.fontFamily);
    const pageCount = pdf.getPageCount();
    const numberedPages: NumberedPageText[] = pdf
      .getPages()
      .flatMap((page, pageIndex) => {
        const numbering = resolveNumberedPage(
          pageIndex,
          pageCount,
          settings.firstPageMode,
        );
        if (!numbering) return [];
        return [
          {
            page,
            text: formatPageNumber(
              settings.format,
              numbering.page,
              numbering.pages,
            ),
          },
        ];
      });

    const font = await embedFont(pdf, fontAsset, fontAsset.allowSubsetting);

    numberedPages.forEach(({ page, text }) => {
      drawPageNumber(page, text, settings, fontAsset, font);
    });

    return pdf.save();
  }
}

async function embedFont(
  pdf: PDFDocument,
  asset: PageNumberFontAsset,
  subset: boolean,
): Promise<PDFFont> {
  return pdf.embedFont(asset.bytes, { subset });
}
