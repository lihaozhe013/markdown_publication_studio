# Markdown Publication Studio

A cross-platform desktop application that compiles Markdown documents into publication-grade PDF and HTML output. This is not a Markdown editor -- it is a publishing compiler with a visual control panel. Bring your existing Markdown, choose a theme and layout options, and export a finished publication.

## Features

**Markdown Compilation**

Parses Markdown via markdown-it and compiles it into a fully styled, self-contained HTML document. The compiler integrates Shiki for syntax highlighting, KaTeX for math rendering, and Mermaid for diagram rendering, all resolved at compile time so the output has no runtime dependencies.

**PDF and HTML Export**

PDF export uses a hidden Chromium renderer with Electron's `printToPDF()` -- no external browser or Puppeteer required. HTML export produces a single self-contained file with all styles, fonts, and images inlined. Both outputs are portable and require nothing beyond a viewer.

**Built-in Themes**

Three themes are included:

- *Rose* -- a soft palette inspired by Material 3
- *Github* -- a clean, technical layout
- *Modern Serif* -- a serif-led reading layout

Local theme fonts (Inter, JetBrains Mono, Source Sans Pro, Source Serif Pro, Noto Sans SC, etc.) are embedded as base64 data URIs so that exported documents render identically on any machine.

**Page Numbering**

A configurable page number system with six font choices (including CJK fonts), adjustable size and style, a customizable format template (e.g. `{page} / {pages}`), and policies for the first page (show all, hide and start numbering at 1, or hide and start at 2). Page numbers are embedded into the final PDF via pdf-lib with automatic font fallback for CJK characters.

**Mermaid Diagrams**

Mermaid diagrams are rendered in an isolated sandboxed BrowserWindow. The SVG output goes through multi-stage sanitization -- unsafe tags are removed, computed styles are baked in, and inline styles are filtered against a safe allowlist -- before being inserted into the publication.

**Math Rendering**

KaTeX renders all LaTeX math expressions with fonts fully inlined as data URIs, so exported PDFs contain no external network references.

**Diagnostics**

A built-in diagnostics panel reports warnings and errors from the last render, covering missing images, unsupported code languages, invalid math expressions, Mermaid render failures, unsafe HTML removal, and font readiness.

**Application Settings**

Page number preferences and other settings are persisted to the user data directory via atomic writes and restored on next launch.

## Architecture

The project is a pnpm workspace monorepo:

```
markdown-publication-studio/
  apps/desktop/                -- Electron desktop application
  packages/publication-core/   -- Markdown compilation pipeline
  packages/shared/             -- Shared types, Zod schemas, IPC contracts
  themes/                      -- CSS themes and bundled fonts
```

The Electron app follows a strict security model: the main process owns all filesystem access and IPC handlers, the preload script exposes a minimal typed API surface via `contextBridge`, and the renderer is a React sandbox with no Node.js access. All BrowserWindows run with `nodeIntegration: false`, `contextIsolation: true`, and `sandbox: true`. All IPC payloads are validated with Zod schemas.

### Publishing Pipeline

```
Markdown file
  -> markdown-it + Shiki + KaTeX + Mermaid placeholders
  -> HTML sanitization (sanitize-html)
  -> Local image embedding (base64 data URIs)
  -> Full HTML assembly with inline CSS, KaTeX, and theme stylesheets
  -> Mermaid rendering (isolated BrowserWindow) and SVG injection
  -> Preview (sandboxed iframe) or PDF (hidden BrowserWindow + printToPDF)
  -> Page number overlay via pdf-lib
  -> Atomic file write
```

## Tech Stack

Electron 43, React 19, TypeScript 7, Vite 8, markdown-it, Shiki, KaTeX, Mermaid, pdf-lib, Zod, Vitest.

## Development

```bash
pnpm install
pnpm dev          # Launch in development mode
pnpm build        # Production build
pnpm test         # Run tests
pnpm lint         # Lint and format check
```

## License

Apache-2.0 License
