import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

const themeAssetMimeTypes: Record<string, string> = {
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.otf': 'font/otf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function isWithinRoot(candidate: string, root: string): boolean {
  const relativePath = relative(root, candidate);
  return (
    relativePath === '' ||
    (!relativePath.startsWith('..') && !isAbsolute(relativePath))
  );
}

function isExternalUrl(value: string): boolean {
  return /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value);
}

export async function inlineLocalAssets(
  css: string,
  cssPath: string,
  root: string,
): Promise<string> {
  const assetPattern = /url\(\s*(?:"([^"]+)"|'([^']+)'|([^\s)]+))\s*\)/g;
  const matches = [...css.matchAll(assetPattern)];
  const replacements = await Promise.all(
    matches.map(async (match) => {
      const reference = match[1] ?? match[2] ?? match[3];
      if (
        !reference ||
        reference.startsWith('data:') ||
        reference.startsWith('#')
      ) {
        return { match, replacement: undefined };
      }
      if (isExternalUrl(reference)) {
        throw new Error(`Remote theme assets are not allowed: ${reference}`);
      }

      const assetPath = resolve(cssPath, '..', reference);
      if (!isWithinRoot(assetPath, root)) {
        throw new Error(
          `Theme asset escapes the built-in theme directory: ${reference}`,
        );
      }

      const extension = assetPath
        .slice(assetPath.lastIndexOf('.'))
        .toLowerCase();
      const mimeType = themeAssetMimeTypes[extension];
      if (!mimeType) {
        return { match, replacement: undefined };
      }

      const data = await readFile(assetPath);
      return {
        match,
        replacement: `data:${mimeType};base64,${data.toString('base64')}`,
      };
    }),
  );

  let result = css;
  for (const { match, replacement } of replacements) {
    if (!replacement || match.index === undefined || !match[0]) {
      continue;
    }
    result = result.replace(match[0], `url("${replacement}")`);
  }
  return result;
}
