import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { app } from 'electron';
import fontkit from '@pdf-lib/fontkit';
import type { PageNumberFontId } from '@markdown-publication/shared';

interface PageNumberFontDefinition {
  familyName: string;
  relativePath: string;
  allowSubsetting: boolean;
}

export interface PageNumberFontAsset {
  familyName: string;
  bytes: Uint8Array;
  allowSubsetting: boolean;
  hasGlyph(codePoint: number): boolean;
}

const pageNumberFonts: Record<PageNumberFontId, PageNumberFontDefinition> = {
  inter: {
    familyName: 'Inter',
    relativePath: 'fonts/Inter/static/Inter_18pt-Regular.ttf',
    allowSubsetting: false,
  },
  'open-sans': {
    familyName: 'Open Sans',
    relativePath: 'fonts/Open_Sans/static/OpenSans-Regular.ttf',
    allowSubsetting: true,
  },
  'source-han-sans': {
    familyName: 'Source Han Sans SC VF',
    relativePath: 'fonts/SourceHanSansSC-VF.ttf',
    allowSubsetting: false,
  },
  'jetbrains-mono': {
    familyName: 'JetBrains Mono',
    relativePath: 'fonts/JetBrains_Mono/static/JetBrainsMono-Regular.ttf',
    allowSubsetting: true,
  },
  'source-sans-3': {
    familyName: 'Source Sans 3',
    relativePath: 'fonts/SourceSans3-VariableFont_wght.ttf',
    allowSubsetting: false,
  },
  'source-serif-4': {
    familyName: 'Source Serif 4',
    relativePath: 'fonts/SourceSerif4-VariableFont_opsz,wght.ttf',
    allowSubsetting: false,
  },
  'source-han-serif': {
    familyName: 'Source Han Serif SC VF',
    relativePath: 'fonts/SourceHanSerifSC-VF.ttf',
    allowSubsetting: false,
  },
};

const assetCache = new Map<PageNumberFontId, Promise<PageNumberFontAsset>>();

function fontRoot(): string {
  return resolve(app.getAppPath(), 'themes');
}

async function loadPageNumberFontUncached(
  fontId: PageNumberFontId,
): Promise<PageNumberFontAsset> {
  const definition = pageNumberFonts[fontId];
  const bytes = await readFile(resolve(fontRoot(), definition.relativePath));
  const parsedFont = fontkit.create(bytes);
  return {
    familyName: definition.familyName,
    bytes,
    allowSubsetting: definition.allowSubsetting,
    hasGlyph: (codePoint) => parsedFont.glyphForCodePoint(codePoint).id !== 0,
  };
}

export function loadPageNumberFont(
  fontId: PageNumberFontId,
): Promise<PageNumberFontAsset> {
  const cached = assetCache.get(fontId);
  if (cached) return cached;

  const loading = loadPageNumberFontUncached(fontId);
  assetCache.set(fontId, loading);
  loading.catch(() => {
    assetCache.delete(fontId);
  });
  return loading;
}
