import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { katexAssetsPlugin } from '../../scripts/katex-assets-plugin.js';

const desktopRoot = fileURLToPath(new URL('./', import.meta.url));

export default defineConfig({
  main: {
    plugins: [
      katexAssetsPlugin(
        resolve(desktopRoot, '../../packages/publication-core'),
      ),
    ],
    build: {
      externalizeDeps: {
        exclude: [
          '@markdown-publication/publication-core',
          '@markdown-publication/shared',
        ],
      },
      lib: {
        entry: resolve(desktopRoot, 'src/main/index.ts'),
      },
    },
  },
  preload: {
    build: {
      externalizeDeps: {
        exclude: ['@markdown-publication/shared'],
      },
      rollupOptions: {
        external: ['electron'],
        output: {
          entryFileNames: 'index.cjs',
          format: 'cjs',
        },
      },
      lib: {
        entry: resolve(desktopRoot, 'src/preload/index.ts'),
      },
    },
  },
  renderer: {
    root: resolve(desktopRoot, 'src/renderer'),
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(desktopRoot, 'src/renderer/index.html'),
          mermaid: resolve(desktopRoot, 'src/renderer/mermaid.html'),
        },
      },
    },
  },
});
