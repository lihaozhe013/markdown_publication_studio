import { readFile } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import { PDFDocument, type PDFDocument as PdfDocument } from 'pdf-lib';
import type {
  CoverAssetKind,
  CoverAssetReference,
} from '@markdown-publication/shared';

const COVER_IMAGE_EXTENSIONS = new Map<string, CoverImageFormat>([
  ['.png', 'png'],
  ['.jpg', 'jpeg'],
  ['.jpeg', 'jpeg'],
]);

export type CoverImageFormat = 'png' | 'jpeg';

export interface CoverAssetFile {
  id: string;
  path: string;
  name: string;
  kind: CoverAssetKind;
}

export interface LoadedCoverAsset {
  path: string;
  bytes: Uint8Array;
  reference: CoverAssetReference;
  imageFormat?: CoverImageFormat;
  pdfDocument?: PdfDocument;
}

function coverError(message: string): Error {
  return new Error(`[cover] ${message}`);
}

function imageFormatForPath(filePath: string): CoverImageFormat | undefined {
  return COVER_IMAGE_EXTENSIONS.get(extname(filePath).toLowerCase());
}

export function getCoverAssetKind(filePath: string): CoverAssetKind {
  const extension = extname(filePath).toLowerCase();
  if (extension === '.pdf') return 'pdf';
  if (COVER_IMAGE_EXTENSIONS.has(extension)) return 'image';
  throw coverError(
    `Unsupported cover file "${basename(filePath)}". Choose a PNG, JPEG, or single-page PDF.`,
  );
}

async function readCoverBytes(filePath: string): Promise<Uint8Array> {
  const normalizedPath = resolve(filePath);
  try {
    return await readFile(normalizedPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    throw coverError(
      `Could not read cover file "${basename(normalizedPath)}": ${message}`,
    );
  }
}

async function validateImage(
  bytes: Uint8Array,
  imageFormat: CoverImageFormat,
  fileName: string,
): Promise<void> {
  try {
    const document = await PDFDocument.create();
    if (imageFormat === 'png') {
      await document.embedPng(bytes);
    } else {
      await document.embedJpg(bytes);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    throw coverError(`Could not decode cover image "${fileName}": ${message}`);
  }
}

async function loadCoverPdf(
  bytes: Uint8Array,
  fileName: string,
): Promise<PdfDocument> {
  let document: PdfDocument;
  try {
    document = await PDFDocument.load(bytes);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    throw coverError(`Could not read cover PDF "${fileName}": ${message}`);
  }

  const pageCount = document.getPageCount();
  if (pageCount !== 1) {
    throw coverError(
      `Cover PDF "${fileName}" must contain exactly one page; found ${pageCount}.`,
    );
  }

  const page = document.getPage(0);
  if (page.getRotation().angle !== 0) {
    throw coverError(
      `Cover PDF "${fileName}" must not use page rotation. Rotate the page content and save it again.`,
    );
  }

  const { width, height } = page.getSize();
  if (width <= 0 || height <= 0) {
    throw coverError(`Cover PDF "${fileName}" has invalid page dimensions.`);
  }

  return document;
}

export async function loadCoverAsset(
  filePath: string,
  id: string,
): Promise<LoadedCoverAsset> {
  const normalizedPath = resolve(filePath);
  const fileName = basename(normalizedPath);
  const kind = getCoverAssetKind(normalizedPath);
  const bytes = await readCoverBytes(normalizedPath);

  if (kind === 'image') {
    const imageFormat = imageFormatForPath(normalizedPath);
    if (!imageFormat) {
      throw coverError(`Unsupported cover image "${fileName}".`);
    }
    await validateImage(bytes, imageFormat, fileName);
    return {
      path: normalizedPath,
      bytes,
      reference: { id, name: fileName, kind },
      imageFormat,
    };
  }

  const pdfDocument = await loadCoverPdf(bytes, fileName);
  const page = pdfDocument.getPage(0);
  const { width, height } = page.getSize();
  return {
    path: normalizedPath,
    bytes,
    reference: {
      id,
      name: fileName,
      kind,
      pageCount: 1,
      widthPt: width,
      heightPt: height,
    },
    pdfDocument,
  };
}

export async function inspectCoverAsset(
  filePath: string,
  id: string,
): Promise<CoverAssetReference> {
  const asset = await loadCoverAsset(filePath, id);
  return asset.reference;
}
