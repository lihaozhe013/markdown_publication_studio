import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PDFDocument } from 'pdf-lib';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  DEFAULT_PAGE_NUMBER_SETTINGS,
  DEFAULT_PUBLICATION_STYLE_OVERRIDES,
  type PageNumberSettings,
} from '@markdown-publication/shared';
import type { TocEntry } from '@markdown-publication/publication-core';
import type { PrintBackend } from './electron-print-backend.js';
import type { MermaidRenderer } from './mermaid-renderer.js';
import type { PageNumberPdfService } from './page-number-pdf-service.js';
import { PublicationService } from './publication-service.js';
import type { PdfAssembler } from './pdf-assembly-service.js';
import type { TocPageLocation, TocPageLocator } from './toc-page-locator.js';

vi.mock('electron', () => ({
  app: {
    getAppPath: vi.fn(() => process.cwd()),
    getPath: vi.fn(() => process.cwd()),
  },
}));

let fixtureDirectory: string;
let sourcePath: string;
let noHeadingSourcePath: string;
let bodyPdf: Uint8Array;
let service: PublicationService;
let renderedHtml: string[];
let locateCalls: Uint8Array[];
let pageLocator: TocPageLocator;
let pageNumberApply: ReturnType<typeof vi.fn>;

beforeAll(async () => {
  fixtureDirectory = await mkdtemp(
    join(tmpdir(), 'markdown-publication-service-'),
  );
  sourcePath = join(fixtureDirectory, 'book.md');
  noHeadingSourcePath = join(fixtureDirectory, 'notes.md');
  await writeFile(
    sourcePath,
    '# Introduction\n\nSome content.\n\n## Details\n\nMore content.',
  );
  await writeFile(noHeadingSourcePath, 'Plain text without a heading.');
  const document = await PDFDocument.create();
  document.addPage([595.28, 841.89]);
  bodyPdf = await document.save();

  renderedHtml = [];
  locateCalls = [];
  const printBackend: PrintBackend = {
    render: vi.fn(async (html: string) => {
      renderedHtml.push(html);
      return bodyPdf;
    }),
  };
  const mermaidRenderer: MermaidRenderer = {
    render: vi.fn(async (html: string) => ({ html, diagnostics: [] })),
  };
  pageNumberApply = vi.fn(async (bytes: Uint8Array) => bytes);
  const pageNumberPdfService = {
    apply: pageNumberApply,
  } as unknown as PageNumberPdfService;
  const pdfAssembler: PdfAssembler = {
    assemble: vi.fn(async ({ bodyPdf: assembledBody }) => assembledBody),
  };
  pageLocator = {
    locate: vi.fn(
      async (
        _bytes: Uint8Array,
        entries: readonly TocEntry[],
      ): Promise<TocPageLocation> => {
        locateCalls.push(_bytes);
        return {
          pageCount: 3,
          pages: new Map(entries.map((entry, index) => [entry.id, index + 2])),
        };
      },
    ),
  };
  service = new PublicationService(
    printBackend,
    mermaidRenderer,
    pageNumberPdfService,
    pdfAssembler,
    pageLocator,
  );
});

afterAll(async () => {
  await rm(fixtureDirectory, { recursive: true, force: true });
});

beforeEach(() => {
  renderedHtml.length = 0;
  locateCalls.length = 0;
  vi.mocked(pageLocator.locate).mockImplementation(
    async (
      _bytes: Uint8Array,
      entries: readonly TocEntry[],
    ): Promise<TocPageLocation> => {
      locateCalls.push(_bytes);
      return {
        pageCount: 3,
        pages: new Map(entries.map((entry, index) => [entry.id, index + 2])),
      };
    },
  );
  pageNumberApply.mockClear();
});

const enabledPageNumbers = (overrides?: Partial<PageNumberSettings>) => ({
  ...DEFAULT_PAGE_NUMBER_SETTINGS,
  enabled: true,
  firstPageMode: 'all-pages' as const,
  ...overrides,
});

describe('PublicationService table-of-contents export', () => {
  it('resolves placeholder page references in a second Chromium render', async () => {
    const outputPath = join(fixtureDirectory, 'contents.pdf');
    await service.exportPdf(
      sourcePath,
      outputPath,
      'rose',
      'A4',
      enabledPageNumbers(),
      {},
      DEFAULT_PUBLICATION_STYLE_OVERRIDES,
      { enabled: true, preset: 'classic-book' },
    );

    expect(renderedHtml).toHaveLength(2);
    expect(renderedHtml[0]).toContain('>0000</span>');
    expect(renderedHtml[1]).toContain('data-toc-page-for=');
    expect(renderedHtml[1]).toContain('>2</span>');
    expect(renderedHtml[1]).toContain('>3</span>');
    expect(locateCalls).toHaveLength(2);
    expect(pageNumberApply).toHaveBeenCalledTimes(1);
    await expect(readFile(outputPath)).resolves.toEqual(Buffer.from(bodyPdf));
  });

  it('keeps the contents structure without page references when numbering is disabled', async () => {
    const outputPath = join(fixtureDirectory, 'contents-without-numbers.pdf');
    await service.exportPdf(
      sourcePath,
      outputPath,
      'rose',
      'Letter',
      { ...DEFAULT_PAGE_NUMBER_SETTINGS, enabled: false },
      {},
      DEFAULT_PUBLICATION_STYLE_OVERRIDES,
      { enabled: true, preset: 'modern-technical' },
    );

    expect(renderedHtml).toHaveLength(1);
    expect(renderedHtml[0]).toContain('publication-toc--modern-technical');
    expect(renderedHtml[0]).toContain('data-toc-show-pages="false"');
    expect(renderedHtml[0]).not.toContain('data-toc-page-for=');
    expect(locateCalls).toHaveLength(0);
    expect(pageNumberApply).toHaveBeenCalledTimes(1);
  });

  it('keeps HTML export body-only even when PDF TOC settings are available', async () => {
    const outputPath = join(fixtureDirectory, 'book.html');
    await service.exportHtml(
      sourcePath,
      outputPath,
      'rose',
      'A4',
      DEFAULT_PUBLICATION_STYLE_OVERRIDES,
    );

    const html = await readFile(outputPath, 'utf8');
    expect(html).not.toContain('data-toc="true"');
    expect(html).toContain('data-toc-id="heading-book-introduction"');
  });

  it('warns and omits the contents page when no H1-H3 headings exist', async () => {
    const preview = await service.buildPreview(
      noHeadingSourcePath,
      'rose',
      'A4',
      DEFAULT_PUBLICATION_STYLE_OVERRIDES,
      { enabled: true, preset: 'classic-book' },
      true,
    );

    expect(preview.html).not.toContain('data-toc="true"');
    expect(preview.diagnostics).toEqual([
      expect.objectContaining({
        code: 'toc-empty',
        severity: 'warning',
        feature: 'toc',
      }),
    ]);
  });

  it('blocks export when the second pagination pass changes heading pages', async () => {
    let locateCount = 0;
    vi.mocked(pageLocator.locate).mockImplementation(
      async (
        _bytes: Uint8Array,
        entries: readonly TocEntry[],
      ): Promise<TocPageLocation> => {
        locateCount += 1;
        return {
          pageCount: 3,
          pages: new Map(
            entries.map((entry, index) => [
              entry.id,
              index + 2 + (locateCount > 1 ? 1 : 0),
            ]),
          ),
        };
      },
    );

    await expect(
      service.exportPdf(
        sourcePath,
        join(fixtureDirectory, 'unstable.pdf'),
        'rose',
        'A4',
        enabledPageNumbers(),
        {},
        DEFAULT_PUBLICATION_STYLE_OVERRIDES,
        { enabled: true, preset: 'classic-book' },
      ),
    ).rejects.toThrow('pagination changed');
    expect(locateCount).toBe(2);
  });
});
