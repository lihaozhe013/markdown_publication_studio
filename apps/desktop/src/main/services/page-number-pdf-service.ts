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

function canEncode(font: PDFFont, text: string): boolean {
  try {
    font.encodeText(text);
    return true;
  } catch {
    return false;
  }
}

function createTextRuns(
  text: string,
  primaryFont: PDFFont,
  fallbackFont: PDFFont,
): TextRun[] {
  const runs: TextRun[] = [];
  for (const character of Array.from(text)) {
    const font = canEncode(primaryFont, character) ? primaryFont : fallbackFont;
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
  primaryFont: PDFFont,
  fallbackFont: PDFFont,
): void {
  const fontSize = settings.fontSizePt;
  const runs = createTextRuns(text, primaryFont, fallbackFont);
  const width = textWidth(runs, fontSize);
  const pageWidth = page.getWidth();
  const bottomMargin = DEFAULT_BOTTOM_MARGIN_MM * MILLIMETERS_TO_POINTS;
  const fontHeight = primaryFont.heightAtSize(fontSize);
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
    const primaryAsset = await this.fontLoader(settings.fontFamily);
    const fallbackAsset = await this.fontLoader('noto-sans-sc');
    const primaryFont = await embedFont(pdf, primaryAsset);
    const fallbackFont =
      primaryAsset.familyName === fallbackAsset.familyName
        ? primaryFont
        : await embedFont(pdf, fallbackAsset);
    const pageCount = pdf.getPageCount();

    pdf.getPages().forEach((page, pageIndex) => {
      const numbering = resolveNumberedPage(
        pageIndex,
        pageCount,
        settings.firstPageMode,
      );
      if (!numbering) return;
      drawPageNumber(
        page,
        formatPageNumber(settings.format, numbering.page, numbering.pages),
        settings,
        primaryFont,
        fallbackFont,
      );
    });

    return pdf.save();
  }
}

async function embedFont(
  pdf: PDFDocument,
  asset: PageNumberFontAsset,
): Promise<PDFFont> {
  return pdf.embedFont(asset.bytes, { subset: asset.allowSubsetting });
}
