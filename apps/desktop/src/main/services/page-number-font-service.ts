import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { app } from 'electron';
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
}

const pageNumberFonts: Record<PageNumberFontId, PageNumberFontDefinition> = {
  inter: {
    familyName: 'Inter',
    relativePath: 'fonts/Inter/static/Inter_18pt-Regular.ttf',
    allowSubsetting: true,
  },
  'open-sans': {
    familyName: 'Open Sans',
    relativePath: 'fonts/Open_Sans/static/OpenSans-Regular.ttf',
    allowSubsetting: true,
  },
  'noto-sans-sc': {
    familyName: 'Noto Sans SC',
    relativePath: 'fonts/Noto_Sans_SC/static/NotoSansSC-Regular.ttf',
    allowSubsetting: false,
  },
  'jetbrains-mono': {
    familyName: 'JetBrainsMono Nerd Font',
    relativePath:
      'fonts/JetBrainsMonoNerdFont/JetBrainsMonoNerdFont-Medium.ttf',
    allowSubsetting: true,
  },
  'anthropic-serif': {
    familyName: 'Anthropic Serif Web Text',
    relativePath: 'fonts/claude_fonts/AnthropicSerifWebText.ttf',
    allowSubsetting: true,
  },
  'noto-serif-sc': {
    familyName: 'Noto Serif SC',
    relativePath: 'fonts/claude_fonts/NotoSerifSC-VariableFont_wght.ttf',
    allowSubsetting: false,
  },
  'zhuque-fangsong': {
    familyName: 'ZhuqueFangsong',
    relativePath: 'fonts/ZhuqueFangsong-Regular.ttf',
    allowSubsetting: true,
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
  return {
    familyName: definition.familyName,
    bytes,
    allowSubsetting: definition.allowSubsetting,
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
