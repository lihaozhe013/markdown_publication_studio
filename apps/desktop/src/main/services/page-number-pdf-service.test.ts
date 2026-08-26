import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import fontkit from '@pdf-lib/fontkit';
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
  fontFamily: 'source-han-sans',
  fontSizePt: 10,
  style: 'bold',
  format: '第 {page} 页 / 共 {pages} 页',
  firstPageMode: 'hide-first-start-at-1',
};

interface FontDefinition {
  id: PageNumberFontId;
  familyName: string;
  relativePath: string;
  allowSubsetting: boolean;
}

const fontDefinitions: readonly FontDefinition[] = [
  {
    id: 'inter',
    familyName: 'Inter',
    relativePath: 'themes/fonts/Inter/static/Inter_18pt-Regular.ttf',
    allowSubsetting: false,
  },
  {
    id: 'open-sans',
    familyName: 'Open Sans',
    relativePath: 'themes/fonts/Open_Sans/static/OpenSans-Regular.ttf',
    allowSubsetting: true,
  },
  {
    id: 'source-han-sans',
    familyName: 'Source Han Sans SC VF',
    relativePath: 'themes/fonts/SourceHanSansSC-VF.ttf',
    allowSubsetting: false,
  },
  {
    id: 'jetbrains-mono',
    familyName: 'JetBrains Mono',
    relativePath:
      'themes/fonts/JetBrains_Mono/static/JetBrainsMono-Regular.ttf',
    allowSubsetting: true,
  },
  {
    id: 'source-sans-3',
    familyName: 'Source Sans 3',
    relativePath: 'themes/fonts/SourceSans3-VariableFont_wght.ttf',
    allowSubsetting: false,
  },
  {
    id: 'source-serif-4',
    familyName: 'Source Serif 4',
    relativePath: 'themes/fonts/SourceSerif4-VariableFont_opsz,wght.ttf',
    allowSubsetting: false,
  },
  {
    id: 'source-han-serif',
    familyName: 'Source Han Serif SC VF',
    relativePath: 'themes/fonts/SourceHanSerifSC-VF.ttf',
    allowSubsetting: false,
  },
];

let fontAssetsPromise:
  Promise<Map<PageNumberFontId, PageNumberFontAsset>> | undefined;

async function loadFontAssets(): Promise<
  Map<PageNumberFontId, PageNumberFontAsset>
> {
  const assets = new Map<PageNumberFontId, PageNumberFontAsset>();
  for (const definition of fontDefinitions) {
    const bytes = await readFile(
      resolve(process.cwd(), definition.relativePath),
    );
    const parsedFont = fontkit.create(bytes);
    assets.set(definition.id, {
      familyName: definition.familyName,
      bytes,
      allowSubsetting: definition.allowSubsetting,
      hasGlyph: (codePoint) => parsedFont.glyphForCodePoint(codePoint).id !== 0,
    });
  }
  return assets;
}

async function createFontLoader(): Promise<
  (fontId: PageNumberFontId) => Promise<PageNumberFontAsset>
> {
  fontAssetsPromise ??= loadFontAssets();
  const assets = await fontAssetsPromise;
  return async (fontId) => {
    const asset = assets.get(fontId);
    if (!asset) throw new Error(`Missing test font asset: ${fontId}`);
    return asset;
  };
}

async function createFixturePdf(pageCount = 3): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  for (let index = 0; index < pageCount; index += 1) {
    pdf.addPage([595, 842]);
  }
  return pdf.save();
}

interface EmbeddedFont {
  name: string;
  streamSize: number;
}

function getEmbeddedFonts(document: PDFDocument): EmbeddedFont[] {
  return document.context.enumerateIndirectObjects().flatMap(([, object]) => {
    if (!(object instanceof PDFDict)) return [];
    const type = object.lookup(PDFName.of('Type'));
    if (!(type instanceof PDFName) || type.decodeText() !== 'FontDescriptor') {
      return [];
    }
    const stream = object.lookup(PDFName.of('FontFile2'));
    const fontName = object.lookup(PDFName.of('FontName'));
    return stream instanceof PDFRawStream && fontName instanceof PDFName
      ? [{ name: fontName.decodeText(), streamSize: stream.getContentsSize() }]
      : [];
  });
}

function getEmbeddedFontStreamSizes(document: PDFDocument): number[] {
  return getEmbeddedFonts(document).map((font) => font.streamSize);
}

const latinFontIds = [
  'inter',
  'open-sans',
  'jetbrains-mono',
  'source-sans-3',
  'source-serif-4',
] as const;

const styles = ['normal', 'bold', 'italic'] as const;

describe('PageNumberPdfService', () => {
  it('preserves page count and adds embedded page-number content', async () => {
    const source = await createFixturePdf();
    const result = await new PageNumberPdfService(
      await createFontLoader(),
    ).apply(source, settings);
    const document = await PDFDocument.load(result);

    expect(document.getPageCount()).toBe(3);
    expect(result.byteLength).toBeGreaterThan(source.byteLength);
  }, 30_000);

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
  }, 30_000);

  it('uses actual glyph coverage instead of PDF encoding success', async () => {
    const loader = await createFontLoader();
    const inter = await loader('inter');
    const sourceHanSans = await loader('source-han-sans');
    const sourceHanSerif = await loader('source-han-serif');

    expect(inter.hasGlyph('第'.codePointAt(0) ?? 0)).toBe(false);
    expect(sourceHanSans.hasGlyph('第'.codePointAt(0) ?? 0)).toBe(true);
    expect(sourceHanSans.hasGlyph('2'.codePointAt(0) ?? 0)).toBe(true);
    expect(sourceHanSans.hasGlyph('/'.codePointAt(0) ?? 0)).toBe(true);
    expect(sourceHanSerif.hasGlyph('第'.codePointAt(0) ?? 0)).toBe(true);
    expect(sourceHanSerif.hasGlyph('2'.codePointAt(0) ?? 0)).toBe(true);
    expect(sourceHanSerif.hasGlyph('/'.codePointAt(0) ?? 0)).toBe(true);
    expect(inter.hasGlyph('2'.codePointAt(0) ?? 0)).toBe(true);
  });

  it.each(latinFontIds)(
    'embeds a full primary font when %s requires CJK fallback',
    async (fontFamily) => {
      const source = await createFixturePdf(1);
      const loader = await createFontLoader();
      const result = await new PageNumberPdfService(loader).apply(source, {
        ...settings,
        fontFamily,
        style: 'normal',
        format: '第 {page} 页 / 共 {pages} 页',
        firstPageMode: 'all-pages',
      });
      const document = await PDFDocument.load(result);
      const embeddedFonts = getEmbeddedFonts(document);

      expect(
        embeddedFonts.some((font) => /SourceHanSansSC/u.test(font.name)),
      ).toBe(true);
      expect(embeddedFonts.some((font) => font.streamSize > 50_000)).toBe(true);
    },
    30_000,
  );

  it.each(latinFontIds)(
    'does not embed the CJK fallback for numeric-only %s page numbers',
    async (fontFamily) => {
      const source = await createFixturePdf(1);
      const loader = await createFontLoader();
      const result = await new PageNumberPdfService(loader).apply(source, {
        ...settings,
        fontFamily,
        style: 'normal',
        format: '{page} / {pages}',
        firstPageMode: 'all-pages',
      });
      const document = await PDFDocument.load(result);
      const embeddedFonts = getEmbeddedFonts(document);

      expect(
        embeddedFonts.some((font) => /SourceHanSansSC/u.test(font.name)),
      ).toBe(false);
    },
    30_000,
  );

  it('embeds Inter in full for numeric-only page numbers', async () => {
    const source = await createFixturePdf(1);
    const loader = await createFontLoader();
    const interAsset = await loader('inter');
    const result = await new PageNumberPdfService(loader).apply(source, {
      ...settings,
      fontFamily: 'inter',
      style: 'normal',
      format: '{page} / {pages}',
      firstPageMode: 'all-pages',
    });
    const document = await PDFDocument.load(result);
    const interFont = getEmbeddedFonts(document).find((font) =>
      /Inter18pt-Regular/u.test(font.name),
    );

    expect(interFont).toBeDefined();
    expect(interFont?.streamSize).toBeGreaterThan(
      interAsset.bytes.byteLength * 0.4,
    );
  });

  it.each(['source-han-sans', 'source-han-serif'] as const)(
    'renders numeric and CJK text with %s as the primary font',
    async (fontFamily) => {
      const source = await createFixturePdf(1);
      const loader = await createFontLoader();
      const result = await new PageNumberPdfService(loader).apply(source, {
        ...settings,
        fontFamily,
        style: 'normal',
        format: '第 {page} 页 / 共 {pages} 页',
        firstPageMode: 'all-pages',
      });
      const document = await PDFDocument.load(result);
      const embeddedFonts = getEmbeddedFonts(document);

      expect(embeddedFonts.some((font) => font.streamSize > 1_000_000)).toBe(
        true,
      );
    },
  );

  it.each(styles)(
    'preserves mixed-font page numbers in %s style',
    async (style) => {
      const source = await createFixturePdf(1);
      const loader = await createFontLoader();
      const result = await new PageNumberPdfService(loader).apply(source, {
        ...settings,
        fontFamily: 'inter',
        style,
        format: '第 {page} 页 / 共 {pages} 页',
        firstPageMode: 'all-pages',
      });

      expect(result.byteLength).toBeGreaterThan(source.byteLength);
    },
  );

  it('fails instead of emitting an unrenderable page-number character', async () => {
    const bytes = await readFile(
      resolve(
        process.cwd(),
        'themes/fonts/Inter/static/Inter_18pt-Regular.ttf',
      ),
    );
    const unsupportedAsset: PageNumberFontAsset = {
      familyName: 'Unsupported test font',
      bytes,
      allowSubsetting: true,
      hasGlyph: () => false,
    };
    const loader = async (): Promise<PageNumberFontAsset> => unsupportedAsset;

    await expect(
      new PageNumberPdfService(loader).apply(await createFixturePdf(1), {
        ...settings,
        format: '第 {page} 页',
        firstPageMode: 'all-pages',
      }),
    ).rejects.toThrow('character "第" (U+7B2C)');
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
