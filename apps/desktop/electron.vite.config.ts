import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

const desktopRoot = fileURLToPath(new URL('./', import.meta.url));

export default defineConfig({
  main: {
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
        input: resolve(desktopRoot, 'src/renderer/index.html'),
      },
    },
  },
});
