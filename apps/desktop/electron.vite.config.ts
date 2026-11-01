import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { build as viteBuild, type Plugin } from 'vite';
import { katexAssetsPlugin } from '../../scripts/katex-assets-plugin.js';
import { CLI_WORKER_PROTOCOL_VERSION } from '../../packages/shared/src/cli-protocol.js';

const desktopRoot = fileURLToPath(new URL('./', import.meta.url));
const desktopPackage = JSON.parse(
  readFileSync(resolve(desktopRoot, 'package.json'), 'utf8'),
) as { version: string };
const commitHash = execSync('git rev-parse --short HEAD', {
  cwd: desktopRoot,
})
  .toString()
  .trim();

/**
 * Emit the isolated pagination program next to the main bundle. `out/main` is
 * emptied on every main build, so bundling the program here keeps it present in
 * development and production alike; watching the entry also rebuilds it when the
 * program changes during `electron-vite dev`.
 */
function paginatedProgramPlugin(): Plugin {
  const entry = resolve(desktopRoot, 'src/renderer/paginated-program.ts');
  return {
    name: 'mps-paginated-program',
    buildStart() {
      this.addWatchFile(entry);
    },
    async generateBundle() {
      const result = await viteBuild({
        configFile: false,
        logLevel: 'warn',
        build: {
          write: false,
          target: 'chrome120',
          minify: false,
          lib: {
            entry,
            formats: ['iife'],
            name: 'PublicationPaginationProgram',
            fileName: () => 'paginated-program.js',
          },
        },
      });
      for (const output of Array.isArray(result) ? result : [result]) {
        if (!('output' in output)) continue;
        for (const item of output.output) {
          if (item.type !== 'chunk' || !item.isEntry) continue;
          this.emitFile({
            type: 'asset',
            fileName: 'paginated-program.js',
            source: item.code,
          });
        }
      }
    },
  };
}

export default defineConfig({
  main: {
    define: {
      __COMMIT_HASH__: JSON.stringify(commitHash),
    },
    plugins: [
      katexAssetsPlugin(
        resolve(desktopRoot, '../../packages/publication-core'),
      ),
      paginatedProgramPlugin(),
      {
        name: 'mps-paged-engine',
        generateBundle() {
          // The pinned pagination engine runs as trusted application code inside
          // the sandboxed layout window; it is emitted next to the main bundle.
          const enginePackage = resolve(
            dirname(createRequire(import.meta.url).resolve('pagedjs')),
            '..',
          );
          const metadata = JSON.parse(
            readFileSync(resolve(enginePackage, 'package.json'), 'utf8'),
          ) as { version: string };
          this.emitFile({
            type: 'asset',
            fileName: 'paged.js',
            source: readFileSync(resolve(enginePackage, 'dist/paged.js')),
          });
          this.emitFile({
            type: 'asset',
            fileName: 'paged-engine.json',
            source: JSON.stringify({
              engine: 'pagedjs',
              version: metadata.version,
            }),
          });
        },
      },
      {
        name: 'mps-cli-runtime-metadata',
        generateBundle() {
          this.emitFile({
            type: 'asset',
            fileName: 'mps-runtime.json',
            source: JSON.stringify({
              productId: 'com.markdownpublication.studio',
              version: desktopPackage.version,
              workerProtocol: CLI_WORKER_PROTOCOL_VERSION,
            }),
          });
        },
      },
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
