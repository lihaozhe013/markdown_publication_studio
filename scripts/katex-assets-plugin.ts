import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import type { Plugin } from 'vite';

const katexAssetImport =
  /import\s+(\w+)\s+from\s+['"](katex\/dist\/(?:katex\.min\.css|fonts\/[\w-]+\.woff2))\?(raw|inline)['"];?/gu;

export function katexAssetsPlugin(packageRoot: string): Plugin {
  const require = createRequire(import.meta.url);
  const katexEntry = require.resolve('katex', { paths: [packageRoot] });
  const katexDist = dirname(katexEntry);

  function readAsset(specifier: string, query: string): string {
    const filePath = resolve(katexDist, specifier.replace('katex/dist/', ''));
    if (query === 'raw') return readFileSync(filePath, 'utf8');
    return `data:font/woff2;base64,${readFileSync(filePath).toString('base64')}`;
  }

  return {
    name: 'publication-katex-assets',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/packages/publication-core/src/math.ts')) {
        return undefined;
      }
      const transformed = code.replace(
        katexAssetImport,
        (_match, binding: string, specifier: string, query: string) =>
          `const ${binding} = ${JSON.stringify(readAsset(specifier, query))};`,
      );
      return transformed === code
        ? undefined
        : { code: transformed, map: null, moduleType: 'js' };
    },
  };
}
