import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
import { katexAssetsPlugin } from './scripts/katex-assets-plugin.js';

export default defineConfig({
  plugins: [
    katexAssetsPlugin(resolve(process.cwd(), 'packages/publication-core')),
  ],
  test: {
    include: ['packages/**/*.test.ts'],
    environment: 'node',
  },
});
