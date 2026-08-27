import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { degrees, PDFDocument } from 'pdf-lib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getPageSizeDefinition,
  type PageSizeId,
} from '@markdown-publication/shared';
import type { CoverAssetKind } from '@markdown-publication/shared';
import type { CoverAssetFile } from './cover-asset-service.js';
import { PdfAssemblyService } from './pdf-assembly-service.js';

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const onePixelJpeg = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/AT//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/AT//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Aqf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z',
  'base64',
);

let fixtureDirectory: string;

beforeEach(async () => {
  fixtureDirectory = await mkdtemp(join(tmpdir(), 'markdown-cover-'));
});

afterEach(async () => {
  await rm(fixtureDirectory, { recursive: true, force: true });
});

async function createBodyPdf(
  pageSize: PageSizeId = 'A4',
  pageCount = 2,
): Promise<Uint8Array> {
  const dimensions = getPageSizeDefinition(pageSize);
  const document = await PDFDocument.create();
  for (let index = 0; index < pageCount; index += 1) {
    document.addPage([dimensions.widthPt, dimensions.heightPt]);
  }
  return document.save();
}

async function createCoverPdf(
  pageSize: PageSizeId = 'A4',
  pageCount = 1,
): Promise<string> {
  const dimensions = getPageSizeDefinition(pageSize);
  const document = await PDFDocument.create();
  for (let index = 0; index < pageCount; index += 1) {
    document.addPage([dimensions.widthPt, dimensions.heightPt]);
  }
  const path = join(fixtureDirectory, `cover-${pageCount}-${pageSize}.pdf`);
  await writeFile(path, await document.save());
  return path;
}

async function createImage(extension: 'png' | 'jpg' | 'jpeg'): Promise<string> {
  const path = join(fixtureDirectory, `cover.${extension}`);
  await writeFile(path, extension === 'png' ? onePixelPng : onePixelJpeg);
  return path;
}

function asset(path: string, kind: CoverAssetKind, id: string): CoverAssetFile {
  return { id, path, name: path.split(/[\\/]/u).at(-1) ?? path, kind };
}

function expectPageSize(
  page: ReturnType<PDFDocument['getPages']>[number],
  pageSize: PageSizeId,
): void {
  const dimensions = getPageSizeDefinition(pageSize);
  expect(page.getWidth()).toBeCloseTo(dimensions.widthPt, 3);
  expect(page.getHeight()).toBeCloseTo(dimensions.heightPt, 3);
}

describe('PdfAssemblyService', () => {
  it('prepends and appends image covers at the selected page size', async () => {
    const frontPath = await createImage('png');
    const backPath = await createImage('jpg');
    const result = await new PdfAssemblyService().assemble({
      bodyPdf: await createBodyPdf('Letter'),
      pageSize: 'Letter',
      covers: {
        front: asset(frontPath, 'image', 'front'),
        back: asset(backPath, 'image', 'back'),
      },
    });
    const document = await PDFDocument.load(result);

    expect(document.getPageCount()).toBe(4);
    document.getPages().forEach((page) => expectPageSize(page, 'Letter'));
  });

  it('copies a matching single-page PDF cover without changing its page size', async () => {
    const coverPath = await createCoverPdf('A4');
    const result = await new PdfAssemblyService().assemble({
      bodyPdf: await createBodyPdf('A4'),
      pageSize: 'A4',
      covers: { front: asset(coverPath, 'pdf', 'front') },
    });
    const document = await PDFDocument.load(result);

    expect(document.getPageCount()).toBe(3);
    document.getPages().forEach((page) => expectPageSize(page, 'A4'));
  });

  it('rejects multi-page PDF covers', async () => {
    const coverPath = await createCoverPdf('A4', 2);

    await expect(
      new PdfAssemblyService().assemble({
        bodyPdf: await createBodyPdf('A4'),
        pageSize: 'A4',
        covers: { front: asset(coverPath, 'pdf', 'front') },
      }),
    ).rejects.toThrow('must contain exactly one page');
  });

  it('rejects PDF covers whose dimensions do not match the export size', async () => {
    const coverPath = await createCoverPdf('Letter');

    await expect(
      new PdfAssemblyService().assemble({
        bodyPdf: await createBodyPdf('A4'),
        pageSize: 'A4',
        covers: { back: asset(coverPath, 'pdf', 'back') },
      }),
    ).rejects.toThrow('A4 requires');
  });

  it('rejects rotated PDF covers', async () => {
    const coverPath = await createCoverPdf('A4');
    const document = await PDFDocument.load(await readFile(coverPath));
    document.getPage(0).setRotation(degrees(90));
    await writeFile(coverPath, await document.save());

    await expect(
      new PdfAssemblyService().assemble({
        bodyPdf: await createBodyPdf('A4'),
        pageSize: 'A4',
        covers: { front: asset(coverPath, 'pdf', 'front') },
      }),
    ).rejects.toThrow('must not use page rotation');
  });

  it('rejects unsupported cover formats', async () => {
    const directory = join(fixtureDirectory, 'unsupported');
    await mkdir(directory);
    const path = join(directory, 'cover.webp');
    await writeFile(path, onePixelPng);

    await expect(
      new PdfAssemblyService().assemble({
        bodyPdf: await createBodyPdf('A4'),
        pageSize: 'A4',
        covers: { front: asset(path, 'image', 'front') },
      }),
    ).rejects.toThrow('Choose a PNG, JPEG, or single-page PDF');
  });

  it('rejects malformed raster cover files', async () => {
    const path = join(fixtureDirectory, 'broken.png');
    await writeFile(path, Buffer.from('not a PNG'));

    await expect(
      new PdfAssemblyService().assemble({
        bodyPdf: await createBodyPdf('A4'),
        pageSize: 'A4',
        covers: { back: asset(path, 'image', 'back') },
      }),
    ).rejects.toThrow('Could not decode cover image');
  });

  it('returns the body bytes unchanged when no covers are selected', async () => {
    const bodyPdf = await createBodyPdf('A4');
    const result = await new PdfAssemblyService().assemble({
      bodyPdf,
      pageSize: 'A4',
      covers: {},
    });

    expect(result).toBe(bodyPdf);
  });
});
