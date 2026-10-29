# Markdown Publication Studio

A cross-platform desktop application that compiles Markdown documents into
publication-grade PDF and HTML output. This is not a Markdown editor -- it is a
publishing compiler with a visual control panel. Bring your existing Markdown,
choose a theme and layout options, and export a finished publication.

## Features

**Markdown Compilation**

Parses Markdown via markdown-it and compiles it into a fully styled,
self-contained HTML document. The compiler integrates Shiki for syntax
highlighting, KaTeX for math rendering, and Mermaid for diagram rendering, all
resolved at compile time so the output has no runtime dependencies.

**PDF and HTML Export**

PDF export uses a hidden Chromium renderer with Electron's `printToPDF()` -- no
external browser or Puppeteer required. HTML export produces a single
self-contained file with all styles, fonts, and images inlined. Both outputs are
portable and require nothing beyond a viewer.

**Built-in Themes**

Ten themes are included:

- _Rose_ -- a soft palette inspired by Material 3
- _Github_ -- a clean, technical layout
- _Modern Serif_ -- a serif-led reading layout
- _Claude_ -- a warm paper palette with spacious serif typography
- _Academic Paper_ -- compact serif typography for research and course notes
- _Classic Book_ -- traditional typography for long-form reading
- _Minimal Print_ -- a restrained monochrome layout
- _Notebook_ -- a spacious, neutral note-taking layout
- _Solarized Light_ -- a warm reading palette with Solarized code highlighting
- _Nordic Light_ -- a cool, restrained technical layout

Local theme fonts (Inter, JetBrains Mono, Source Sans 3, Source Serif 4, EB
Garamond, IBM Plex Sans, Source Han Sans SC, etc.) are embedded as base64 data
URIs so that exported documents render identically on any machine.

**Page Numbering**

A configurable page number system with five Latin font choices, adjustable size
and style, a customizable format template (e.g. `{page} / {pages}`), and
policies for the first page (show all, hide and start numbering at 1, or hide
and start at 2). In the default page-first path, folios are rendered once into
the shared page artifact, so preview and PDF show identical footer text; the
legacy pdf-lib stamping path applies only when page layout is disabled. CJK
fonts and CJK format text are not available for page numbers because embedding a
CJK font would add tens of megabytes to every export.

**Table of Contents**

PDF export can add a real, potentially multipage `Contents` section with
automatically extracted H1-H3 headings. Choose between the Classic Book and
Modern Technical presets; both present a clickable hierarchy whose page
references resolve to the final layout. HTML export remains body-only and
flow-based, so it omits page references.

**Page Layout**

The default publication path paginates real A4/Letter sheets. Standalone
`\clearpage` lines end the current page, and `\pagetemplate{section}` starts a
new page with the section template; literal occurrences inside code, math, and
raw HTML stay untouched. The preview shows the finalized pages with whole-sheet
backgrounds, folios, and page navigation. Disabling page layout in the inspector
restores the legacy flowing preview and PDF folio stamping.

**Advanced Styles**

The docked Style inspector provides structured overrides for body text,
headings, links, code, blockquotes, tables, images, and dividers. Changes
preview immediately, while one global style configuration is saved only when the
user chooses Apply & Save. The generated override layer is shared by preview,
PDF, and HTML output; arbitrary CSS is not accepted.

**Mermaid Diagrams**

Mermaid diagrams are rendered in an isolated sandboxed BrowserWindow. The SVG
output goes through multi-stage sanitization -- unsafe tags are removed,
computed styles are baked in, and inline styles are filtered against a safe
allowlist -- before being inserted into the publication.

**Math Rendering**

KaTeX renders all LaTeX math expressions with fonts fully inlined as data URIs,
so exported PDFs contain no external network references.

**Diagnostics**

A built-in diagnostics panel reports warnings and errors from the last render,
covering missing images, unsupported code languages, invalid math expressions,
Mermaid render failures, unsafe HTML removal, and font readiness.

**Publication Workspace**

A compact document toolbar, adjustable right-hand Layout/Style/Covers inspector,
paginated paper-width preview with page navigation, and a collapsible
diagnostics pane keep the publication in focus. Preview zoom supports fit width,
25–200%, and actual size without recompilation. Native View menu zoom commands
target the preview. Application appearance supports system, light, and dark
modes independently of publication styling. Unsaved style drafts survive panel
navigation and can be exported without being saved.

**Application Settings**

Application appearance, inspector width, page number preferences, and the last
saved advanced style configuration are persisted to the user data directory via
atomic writes and restored on next launch.

## CLI and Agent Skill

The `mps` command exports or validates a single Markdown file through the same
desktop Chromium, themes, and PDF pipeline. It needs Node.js 22.21.1 or newer
and a compatible installed desktop application; run the desktop app once after
installation so the CLI can discover its location.

```bash
npm install --global @markdown-publication/cli
mps doctor --json
mps build ./report.md --format pdf --output ./report.pdf --json
mps build ./report.md --format html --output ./report.html --json
mps validate --config publish.yaml --json
mps describe --json
```

`publish.yaml` uses `version: 1` with optional source, output format, output
path, theme, page size, PDF table of contents, page numbers, covers, and
structured style overrides. Configuration paths are relative to the YAML file.
The command can override config values; an existing output is preserved unless
`--force` is given. Use `--strict` to fail on warnings. `--json` writes one
result to stdout and sends diagnostics to stderr.

Install the bundled Agent Skill for Codex, Claude Code, or another Agent Skills
compatible agent:

```bash
mps skill install --agent codex
mps skill install --agent claude
mps skill install --dir /path/to/agent/skills
```

The npm package also includes a standalone
[agent prompt for installing `mps` from a local tarball](apps/cli/prompts/install-mps-cli.md).
It is distributed separately from the Agent Skill.

## Desktop MCP server

The desktop application also provides a bundled stdio MCP server, so AI agents
can publish files or work with the currently open GUI session without requiring
Node.js or the CLI. Open **Connect AI** from the toolbar or **Help → Connect
AI** to copy either a persistent setup prompt or a one-time task prompt. The
dialog shows the exact executable, arguments, launch status, connection details,
and GUI task diagnostics.

File validation and PDF/HTML exports run in isolated workers without opening the
GUI. Session tools can open a document, inspect or change the current
publication settings, export the current draft, adjust preview view, and capture
the page-first preview. Agent style changes stay in the current session until
explicitly saved as global defaults. MCP never exposes arbitrary shell or
JavaScript execution. See [Desktop MCP and AI Connection](docs/mcp.md) for tool
schemas, path rules, revision handling, and security boundaries.

## Architecture

The project is a pnpm workspace monorepo:

```
markdown-publication-studio/
  apps/cli/                    -- `mps` command and Agent Skill
  apps/desktop/                -- Electron desktop application
  packages/publication-core/   -- Markdown compilation pipeline
  packages/shared/             -- Shared types, Zod schemas, IPC contracts
  packages/publishing-runtime/ -- Shared CLI, GUI worker, and MCP request construction
  themes/                      -- CSS themes and bundled fonts
```

The Electron app follows a strict security model: the main process owns all
filesystem access and IPC handlers, the preload script exposes a minimal typed
API surface via `contextBridge`, and the renderer is a React sandbox with no
Node.js access. All BrowserWindows run with `nodeIntegration: false`,
`contextIsolation: true`, and `sandbox: true`. All IPC payloads are validated
with Zod schemas. The MCP stdio process is a separate Electron startup mode; its
local GUI bridge uses loopback HTTP with a random owner-only token.

### Publishing Pipeline

```
Markdown file
  -> markdown-it + Shiki + KaTeX + Mermaid placeholders
  -> HTML sanitization (sanitize-html)
  -> Local image embedding (base64 data URIs)
  -> Full HTML assembly with inline CSS, KaTeX, and theme stylesheets
  -> Mermaid rendering (isolated BrowserWindow) and SVG injection
  -> Optional Contents page (preview/PDF; H1-H3)
  -> Preview (sandboxed iframe) or PDF (hidden BrowserWindow + printToPDF)
  -> Page number overlay via pdf-lib
  -> Atomic file write
```

## Tech Stack

Electron 43, React 19, TypeScript 7, Vite 8, markdown-it, Shiki, KaTeX, Mermaid,
pdf-lib, Zod, Vitest.

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
