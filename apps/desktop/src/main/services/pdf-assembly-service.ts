import { PDFDocument, type PDFPage } from 'pdf-lib';
import {
  getPageSizeDefinition,
  type PageSizeId,
} from '@markdown-publication/shared';
import {
  loadCoverAsset,
  type CoverAssetFile,
  type LoadedCoverAsset,
} from './cover-asset-service.js';

const PAGE_SIZE_TOLERANCE_PT = 0.5;

export interface PdfAssemblyCovers {
  front?: CoverAssetFile;
  back?: CoverAssetFile;
}

export interface PdfAssemblyInput {
  bodyPdf: Uint8Array;
  pageSize: PageSizeId;
  covers: PdfAssemblyCovers;
}

export interface PdfAssembler {
  assemble(input: PdfAssemblyInput): Promise<Uint8Array>;
}

type CoverAssetLoader = (
  filePath: string,
  id: string,
) => Promise<LoadedCoverAsset>;

function assemblyError(message: string): Error {
  return new Error(`[cover] ${message}`);
}

function assertPageMatchesSize(
  page: PDFPage,
  pageSize: PageSizeId,
  fileName: string,
): void {
  const expected = getPageSizeDefinition(pageSize);
  const { width, height } = page.getSize();
  if (
    Math.abs(width - expected.widthPt) > PAGE_SIZE_TOLERANCE_PT ||
    Math.abs(height - expected.heightPt) > PAGE_SIZE_TOLERANCE_PT
  ) {
    throw assemblyError(
      `Cover PDF "${fileName}" is ${width.toFixed(2)} × ${height.toFixed(2)} pt, but ${pageSize} requires ${expected.widthPt.toFixed(2)} × ${expected.heightPt.toFixed(2)} pt.`,
    );
  }
}

function assertBodyPageSizes(body: PDFDocument, pageSize: PageSizeId): void {
  const pages = body.getPages();
  for (const [index, page] of pages.entries()) {
    const expected = getPageSizeDefinition(pageSize);
    const { width, height } = page.getSize();
    if (
      Math.abs(width - expected.widthPt) > PAGE_SIZE_TOLERANCE_PT ||
      Math.abs(height - expected.heightPt) > PAGE_SIZE_TOLERANCE_PT
    ) {
      throw assemblyError(
        `Body PDF page ${index + 1} is ${width.toFixed(2)} × ${height.toFixed(2)} pt, but ${pageSize} requires ${expected.widthPt.toFixed(2)} × ${expected.heightPt.toFixed(2)} pt.`,
      );
    }
  }
}

async function appendImageCover(
  output: PDFDocument,
  asset: LoadedCoverAsset,
  pageSize: PageSizeId,
): Promise<void> {
  const dimensions = getPageSizeDefinition(pageSize);
  const page = output.addPage([dimensions.widthPt, dimensions.heightPt]);
  const image =
    asset.imageFormat === 'png'
      ? await output.embedPng(asset.bytes)
      : await output.embedJpg(asset.bytes);
  page.drawImage(image, {
    x: 0,
    y: 0,
    width: dimensions.widthPt,
    height: dimensions.heightPt,
  });
}

async function appendPdfCover(
  output: PDFDocument,
  asset: LoadedCoverAsset,
  pageSize: PageSizeId,
): Promise<void> {
  const source = asset.pdfDocument;
  if (!source) {
    throw assemblyError(
      `Cover PDF "${asset.reference.name}" could not be loaded.`,
    );
  }
  assertPageMatchesSize(source.getPage(0), pageSize, asset.reference.name);
  const [page] = await output.copyPages(source, [0]);
  if (!page) {
    throw assemblyError(`Cover PDF "${asset.reference.name}" has no page.`);
  }
  output.addPage(page);
}

async function appendCover(
  output: PDFDocument,
  cover: CoverAssetFile,
  pageSize: PageSizeId,
  assetLoader: CoverAssetLoader,
): Promise<void> {
  const asset = await assetLoader(cover.path, cover.id);
  if (asset.reference.kind !== cover.kind) {
    throw assemblyError(
      `Cover asset "${cover.name}" changed type after it was selected. Choose it again.`,
    );
  }
  if (asset.reference.kind === 'image') {
    await appendImageCover(output, asset, pageSize);
  } else {
    await appendPdfCover(output, asset, pageSize);
  }
}

export class PdfAssemblyService implements PdfAssembler {
  constructor(
    private readonly assetLoader: CoverAssetLoader = loadCoverAsset,
  ) {}

  async assemble(input: PdfAssemblyInput): Promise<Uint8Array> {
    const { front, back } = input.covers;
    if (!front && !back) return input.bodyPdf;

    let body: PDFDocument;
    try {
      body = await PDFDocument.load(input.bodyPdf);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      throw assemblyError(`Could not read the rendered body PDF: ${message}`);
    }

    if (body.getPageCount() === 0) {
      throw assemblyError('The rendered body PDF does not contain any pages.');
    }
    assertBodyPageSizes(body, input.pageSize);

    const output = await PDFDocument.create();
    if (front) {
      await appendCover(output, front, input.pageSize, this.assetLoader);
    }

    const bodyPages = await output.copyPages(body, body.getPageIndices());
    bodyPages.forEach((page) => output.addPage(page));

    if (back) {
      await appendCover(output, back, input.pageSize, this.assetLoader);
    }

    return output.save();
  }
}
