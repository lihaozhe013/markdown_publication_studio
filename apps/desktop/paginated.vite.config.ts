import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const desktopRoot = fileURLToPath(new URL('./', import.meta.url));

/**
 * Bundle the isolated pagination program as trusted application code. The main
 * process injects this artifact into the sandboxed layout window next to the
 * pinned engine bundle.
 */
export default defineConfig({
  build: {
    outDir: resolve(desktopRoot, '../../out/main'),
    emptyOutDir: false,
    target: 'chrome120',
    minify: false,
    lib: {
      entry: resolve(desktopRoot, 'src/renderer/paginated-program.ts'),
      formats: ['iife'],
      name: 'PublicationPaginationProgram',
      fileName: () => 'paginated-program.js',
    },
  },
});
