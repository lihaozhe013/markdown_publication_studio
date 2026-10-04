# Markdown Publication Studio

Product and architecture contract for development agents. This describes the
intended product, not a claim that every feature is implemented. Source code,
package manifests, and tests describe the current implementation.

## Product

Cross-platform desktop application that turns existing Markdown files into
reproducible PDF and HTML publications. Support technical books, course notes,
reports, documentation collections, and batch conversion.

Core workflow:

1. Open a file, multiple files, a directory, or a saved publication project.
2. Order sources; configure metadata, theme, page layout, and publication parts.
3. Select local cover artwork or generate it through a configured AI provider.
4. Preview the publication and inspect diagnostics.
5. Export a combined publication or separate outputs per source.
6. Reopen the project and reproduce its settings and outputs.

MVP excludes Markdown/WYSIWYG editing, note management, collaboration, cloud
sync, generic AI chat, marketplaces, and freeform page design. EPUB, PDF/X,
CMYK, commercial preflight, bleed/crop marks, advanced running headers,
professional float placement, and advanced footnotes are deferred.

## Stack and layout

- Electron: application shell and bundled Chromium print engine.
- Strict TypeScript 7, React, Vite, pnpm workspaces.
- Vitest, ESLint flat config, and Prettier for validation.
- Stable dependencies pinned through manifests and `pnpm-lock.yaml`; use the
  existing baseline rather than automatically upgrading during unrelated work.
- Core libraries: markdown-it, YAML, Zod, Shiki, KaTeX, Mermaid, and pdf-lib.
  File watching may use chokidar or an equivalent implementation.
- Prefer ESM and portable Node/TypeScript automation.

Current boundaries:

- `apps/cli`: portable Node.js CLI, configuration parsing, runtime discovery,
  JSON output, and Agent Skill distribution.
- `apps/desktop`: main, preload, and renderer targets.
- `packages/publication-core`: publication model and publishing stages.
- `packages/shared`: environment-safe contracts and validation.
- `examples/`: regression publications.
- `docs/`: focused engineering notes, dependency baseline, security, and
  rendering.

Keep logical stages separate within these boundaries. Create additional packages
when they have consumers and a useful independent responsibility.

## Process and security boundaries

- Main owns filesystem access, project persistence, native dialogs, window
  lifecycle, export jobs, print windows, AI communication, and credentials.
- Preload exposes a small typed API with purpose-specific commands and events.
- Renderer owns React presentation and interaction. It has no direct Node,
  filesystem, shell, secret, or raw IPC access.
- Publication core is independent of React; Markdown parsing is independent of
  Electron; PDF assembly is independent of Markdown parsing.
- Validate IPC, manifests, persisted settings, and external/provider responses
  at trust boundaries. Keep shared imports safe for browser use.
- UI and publication windows use `nodeIntegration: false`,
  `contextIsolation: true`, and sandboxing. Constrain navigation, new windows,
  external URLs, protocols, and remote asset loading.
- Treat source content, HTML, CSS, metadata, and assets as untrusted. Do not
  execute source/front-matter JavaScript or grant publication content
  privileges.
- Resolve local assets relative to their source/project within allowed roots;
  external assets require explicit authorization. Account for filesystem case
  sensitivity and platform differences.
- Keep credentials in main/OS-backed secret storage and out of logs or exports.
- The local CLI runs with the invoking user's filesystem permissions. It sends a
  validated request to a version-compatible desktop worker without enabling
  Node.js access in publication windows.
- Persist projects through the application storage layer, not localStorage.
- Production builds run independently of the Vite development server.

## Publication pipeline

```text
source discovery + metadata
  -> Markdown parsing + normalization
  -> typed publication model + transforms
  -> HTML + theme + resolved assets
  -> preview / isolated Chromium printing
  -> PDF assembly + metadata + page numbers
  -> atomic output write
```

The publication model contains metadata, ordered chapters, cover, front/back
matter, theme, output profiles, and source-linked diagnostics. It supports title
pages, generated TOC, chapter page breaks, and explicit page breaks.

Keep project loading, Markdown compilation, publication building, HTML
rendering, printing, PDF assembly, artwork generation, and job orchestration
behind focused interfaces. GUI, batch, and future CLI entry points share the
same core.

### Project configuration

Use a versioned `publish.yaml` beside the content. Validate it with Zod. It
stores:

- publication title, subtitle, author, and language;
- source selection, root, include patterns, and explicit order;
- cover, title page, TOC, and chapter-break options;
- page size, margins, headers, footers, and page-number settings;
- theme preset/tokens and optional custom CSS;
- cover artwork path and layout;
- output directory and named PDF/HTML profiles.

GUI configuration updates this model. Paths and asset resolution must not depend
on the process working directory. Preserve portable, scriptable project files.

CLI v1 accepts a strict single-source subset of `publish.yaml` with
`version: 1`, `source`, `format`, `output`, `themeId`, `pageSize`, `toc`,
`pageNumber`, `covers`, and `styleOverrides`. It uses the same Zod definitions
and publishing services as the desktop app. CLI paths resolve from the
configuration file or the command working directory; Markdown images remain
relative to their source file. CLI configuration never reads desktop settings.

### Markdown and HTML

Support headings/anchors, fenced code, tables, task lists, links, local images,
front matter, Shiki highlighting, KaTeX math, and Mermaid diagrams. Front matter
is data only. Keep transforms extensible without requiring a public plugin
system.

Generate complete HTML with semantic structure, theme CSS, screen/print CSS,
structure CSS, and optional controlled custom CSS. Preview and PDF share the
base document; final PDF behavior is authoritative. HTML export includes or
packages the assets needed for distribution.

Constrain images to printable space, avoid splitting short figures/code where
practical, and diagnose wide tables/code and unresolved links/assets.

### Preview and themes

Preview supports page-size-aware rendering, zoom, diagnostics, and debounced
rebuilds after source, asset, theme, or configuration changes. Measure
pagination differences with fixtures before promising exact preview/PDF parity.

Ship the Rose, GitHub, Modern Serif, and Claude themes. Theme definitions
contain identity/version, supported page profiles, typography/spacing tokens,
code style, cover layouts, CSS, and assets. Common layout controls are available
in the GUI. Interactive controls are keyboard accessible and use semantic
HTML/ARIA.

### Desktop publication workspace

The GUI is a single-source publication workspace with native OS window chrome
and menus. A compact 48px document toolbar provides open, application
appearance, properties visibility, and PDF/HTML export. A paper-width preview
occupies the center; a right inspector defaults to 320px, resizes from
280–440px, and groups controls into Layout, Style, and Covers. A collapsible
220px diagnostics pane and 26px status bar show actionable errors, warnings,
operation status, and zoom.

Application appearance defaults to the system and supports explicit light/dark
choices through renderer-only UI tokens. Do not set global
nativeTheme.themeSource or override publication theme color-scheme rules when
changing UI appearance. Appearance and inspector width are persisted through the
main-process settings service, retaining existing page-number and custom-style
settings. Inspector visibility, category, diagnostics visibility, and zoom are
session state.

The interactive preview displays continuous content at the selected A4/Letter
width (points converted at 96/72 CSS pixels). Fit width is the default; manual
zoom supports 25–200% and actual size. Zoom changes presentation without
compilation or text reflow. Preview-only screen rules are installed inside the
sandboxed iframe; they never enter PDF/HTML output or the shared publishing
pipeline. Do not imply exact pagination, page counts, cover preview, or PDF
page-number parity. PDF output remains authoritative.

Advanced styles are edited within the inspector, with Body and Headings expanded
initially and other sections collapsed. Drafts preview immediately, survive
category changes and inspector hiding, and are used for exports without implicit
saving. Apply & Save persists the global style; Discard restores saved values;
Restore theme defaults creates a draft. Opening or closing a document resets the
draft to the saved style. Escape closes transient export options without
discarding a draft. Native View zoom commands control the publication preview,
not the application UI. PDF export also supports CmdOrCtrl+Shift+E.

### PDF printing and assembly

Use a dedicated hidden Electron WebContents behind a replaceable `PrintBackend`.
Use the bundled Chromium; a second bundled browser is unnecessary for the normal
export path.

Wait for DOM, fonts, images, math/diagrams, and an explicit publication-ready
signal, with actionable timeout/failure diagnostics. Fixed sleeps are not the
readiness mechanism. Print backgrounds and honor CSS page sizes.

Assembly preserves page dimensions and vector body content, merges cover/front/
back matter as needed, writes metadata, and fails on malformed intermediate
PDFs. Draw page numbers after the final page count is known:

- centered footer, bundled font, 6–24pt, regular/bold/italic;
- validated format containing `{page}` and/or `{pages}`;
- number all pages, hide first and start at 1 on second, or hide first and
  retain physical numbering (2 on second).

Page numbers appear only in PDF, not interactive preview or HTML export.

### Cover artwork

Support local artwork and an interchangeable AI provider interface. Include one
functional provider integration with explicit user configuration, prompt/style
controls, regeneration, candidate selection where supported, and asset caching.

AI produces artwork; HTML/CSS composes exact title, subtitle, author, and
branding. Render the cover and assemble it with the body. Local/non-AI projects
remain exportable offline subject to their asset requirements.

## Jobs, diagnostics, and reproducibility

The `mps` executable is provided by the `@markdown-publication/cli` npm package.
It locates a compatible installed desktop application and launches one hidden
worker process per request. The worker uses an isolated user-data directory,
exchanges versioned JSON request/result files in a temporary task directory, and
exits after the job. `mps doctor` reports runtime discovery and protocol
compatibility; `mps describe --json` returns the configuration schema and
supported values. The `markdown-publication` Agent Skill is shipped in that
package using the standard `SKILL.md` format and can be copied to Codex, Claude
Code, or another compatible skill directory.

CLI v1 builds or validates one Markdown source. It does not merge chapters,
process directories, or require a running GUI. Build writes an output only after
rendering succeeds; validation checks configuration, assets, Markdown, and
Mermaid rendering without writing a publication. HTML remains body-only; TOC,
page numbering, and cover settings affect PDF only.

Every export is a job:

```text
queued -> preparing -> rendering -> assembling -> writing -> completed
                                              -> failed / cancelled
```

Support bounded concurrency, progress, queued cancellation, safe active
cancellation, and session history. One failure does not corrupt other jobs.
Combine mode creates one publication; batch mode creates one output per source.
Allow shared profiles and future per-source variable substitution.

Diagnostics carry severity, code, message, and optional source path, line,
chapter, and details. Show warnings and errors in the GUI. Missing assets,
failed fonts/diagrams, invalid configuration, and assembly failures must be
visible; classify recoverable problems as warnings and export-blocking failures
as errors.

For identical application/runtime versions, project, source, theme, and assets,
produce deterministic output where practical. Record build/runtime metadata.
Remote asset access is explicit; prefer cached/local assets for reproducibility.
Avoid blocking the UI, reset reused print state between jobs, and release large
PDF buffers when no longer needed.

Application logs persist in an OS-resolved application log directory; logging
failure must not prevent startup. Use searchable subsystem prefixes and exclude
sensitive content. `pnpm dev` regenerates ignored root `debug.log` with desktop,
Vite, and application output. Inspect with `rg '\[export\]' debug.log`.

## Validation and delivery

Use the narrowest meaningful test layer: unit tests for domain logic,
integration for configuration/assets/rendering/jobs, and Electron tests for
Chromium behavior. Use temporary test directories and fake AI providers by
default.

Canonical commands: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`,
`pnpm test`, and `pnpm build`. Run those affected by the change; add build
validation for startup, bundling, preload, packaging, or production behavior.
Format only touched files when unrelated changes exist. Report unverified GUI
behavior with concise manual steps. Do not treat compilation as proof of
publication correctness.

Maintain a sample book with at least five chapters, English/Chinese content,
local PNG/JPEG/SVG assets, headings, lists, code, wide code/tables, math,
diagrams, links, front matter, and explicit page breaks. Use structural
assertions and focused rendering regressions rather than only large snapshots.

MVP acceptance:

- The complete product workflow works through the GUI, including save/reopen.
- The `mps` CLI exports and validates one Markdown source with JSON diagnostics,
  and the packaged Agent Skill installs idempotently for supported skill roots.
- PDF and HTML render the sample publication with resolved assets and
  diagnostics.
- All four themes, layout controls, cover composition, and numbering work.
- Combine export and a batch of at least 25 fixture documents complete without
  UI lockup or failure propagation; cancellation behaves predictably.
- AI integration works when configured; local export works without it.
- Packaging targets Windows, macOS, and Linux. Signing/notarization are release
  concerns; automatic updates follow signed release artifacts.

Chromium is adequate for ordinary technical/digital publications, not full
commercial prepress. Evaluate another print backend only against a concrete
requirement. Future CLI work may add batch and multi-chapter publication through
the shared publishing pipeline.
