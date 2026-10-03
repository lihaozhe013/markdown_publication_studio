import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const cliRoot = fileURLToPath(new URL('./', import.meta.url));

export default defineConfig({
  build: {
    target: 'node22',
    outDir: resolve(cliRoot, 'dist'),
    emptyOutDir: true,
    lib: {
      entry: resolve(cliRoot, 'src/index.ts'),
      formats: ['es'],
      fileName: 'index',
    },
    rollupOptions: {
      external: [/^node:/u, 'js-yaml', 'zod'],
    },
  },
});
