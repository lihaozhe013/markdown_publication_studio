# Markdown Publication Studio

Product and architecture contract for development agents. This describes the
intended product, not a claim that every feature is implemented. Source code,
package manifests, and tests describe the current implementation.

The next planned architecture milestone is page-first publication: shared page
backgrounds/templates, previewed folios, numbered contents, and explicit page
controls. See [the implementation plan](docs/PAGE_FIRST_PUBLICATION_PLAN.md) for
phases and verification gates. These decisions do not imply that paginated
preview or the new layout pipeline is already implemented.

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
- `packages/publishing-runtime`: shared publication request construction and
  path/output safety used by CLI, desktop workers, and MCP.
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
  -> typed, source-linked publication model + transforms
  -> semantic HTML + theme + resolved assets
  -> page templates + isolated layout
  -> complete page plan + logical numbering + TOC convergence
  -> finalized shared page artifact
  -> paginated preview / isolated Chromium printing
  -> imported-page PDF assembly + metadata
  -> atomic output write
```

The publication model contains metadata, ordered chapters, cover, front/back
matter, theme, output profiles, and source-linked diagnostics. It supports title
pages, generated TOC, chapter page breaks, and explicit page breaks.

Keep project loading, Markdown compilation, publication building, HTML
rendering, printing, PDF assembly, artwork generation, and job orchestration
behind focused interfaces. GUI, batch, and future CLI entry points share the
same core.

### Page-first layout model

Markdown and versioned publication configuration remain the editable source of
truth. Pages are derived, revision-bound artifacts, not independently editable
manuscript files. Preserve automatic content flow while allowing explicit page
controls and dedicated publication pages; this is not a freeform page editor.

Keep application-owned contracts independent of a particular pagination engine:

- The publication document orders source-linked content, generated parts,
  imported-page slots, and typed layout controls.
- Page templates define physical dimensions, content bounds, background layers,
  and reserved header/footer regions. Whole-page backgrounds include margins
  without affecting content flow. Template switches start new pages by default;
  local content backgrounds remain separate from page backgrounds.
- A complete page plan orders generated and imported pages and distinguishes
  physical positions, logical labels, folio visibility, and numbering totals.
  Include known cover slots before numbering even when PDFs are assembled later.
- A page map relates headings and source fragments to pages within one layout
  revision. Blocks may span pages; physical indices are not stable source IDs.
- A finalized artifact binds page HTML/CSS, the page plan, resource identity,
  source mappings, and diagnostics to one build revision.

Resolve TOC references from final logical page labels, not fixed cover offsets.
Lay out the TOC itself, refill labels, and reflow until page assignments and
references stabilize. Bound iterations and detect cycles; unresolved or
nonconverging page references block export. Supported content must not
disappear, change order, or be hidden by clipping during fragmentation.

Run application-owned layout code in a main-controlled sandboxed window behind a
replaceable layout backend. Keep source scripts prohibited and preview output
static and script-disabled. Paged.js is the first evaluation candidate, not a
selected dependency; verify fixtures, CSP compatibility, serialization,
licensing, and performance before choosing an engine. Use bundled Chromium for
PDF output.

Preview and PDF must consume the same finalized artifact revision and content
geometry. Capture source/configuration/assets for that revision; reject or
explicitly rebuild stale requests rather than silently printing a different
publication. The legacy and page-first paths may coexist during migration, but a
migration switch must select a complete preview/export path, not mix them.

Keep the existing flowing HTML export as a separate body-only profile branching
from semantic HTML. Fixed-page HTML requires an explicit future profile rather
than silently changing existing output.

### Project configuration

Use a versioned `publish.yaml` beside the content. Validate it with Zod. It
stores:

- publication title, subtitle, author, and language;
- source selection, root, include patterns, and explicit order;
- cover, title page, numbered TOC, and explicit page-control options;
- page size, margins, page templates/scopes, headers, footers, and numbering
  policies;
- theme preset/tokens and optional custom CSS;
- cover artwork path and layout;
- output directory and named PDF/HTML profiles.

GUI configuration updates this model. Paths and asset resolution must not depend
on the process working directory. Preserve portable, scriptable project files.

CLI and desktop MCP file tools accept a strict single-source subset of
`publish.yaml` with `version: 1`, `source`, `format`, `output`, `themeId`,
`pageSize`, `toc`, `pageNumber`, `covers`, and `styleOverrides`. It uses the
same Zod definitions and publishing services as the desktop app. CLI paths
resolve from the configuration file or the command working directory; Markdown
images remain relative to their source file. CLI configuration never reads
desktop settings. Preserve that strict v1 contract and its defaults until new
layout/template/numbering options have explicit versioned schemas and capability
support; do not treat planned fields as already accepted input. Existing cover
and first-page numbering behavior remains the compatibility default. Restarting
main-body numbering after the TOC is an explicit opt-in policy.

### Desktop MCP and AI connection

The desktop executable exposes an opt-in `--mps-mcp` stdio startup mode using
the bundled Electron runtime and MCP TypeScript SDK v2. It does not create a
window or read GUI settings. A separate GUI startup registers a versioned,
owner-only session manifest and a random-token HTTP bridge bound to loopback.
Only `session_open` may start the GUI; session discovery and file tools never
do. The launcher resolves installed executables, development Electron entry
arguments, and the outer Linux AppImage path.

The Connect AI window provides persistent configuration and one-time task
prompts, executable availability, generic stdio connection details, and GUI task
diagnostics. Setup verification calls only `publication_describe` and
`session_list`. Prompts do not contain bridge credentials, and the UI reports
local executable availability rather than client connection success.

File tools expose capability discovery, validation, export, job query, and
cancellation. GUI tools expose session discovery/open, document lifecycle,
revision-checked settings updates, explicit global settings save, export, view
adjustment, and preview capture. Session changes remain in-memory until the
explicit save operation. Revision conflicts fail without automatic retries. Task
state is independent of SDK request instances: file jobs belong to the MCP
process, and GUI jobs belong to their window. Workers use isolated temporary
user-data directories and the common PublicationService, Chromium, theme, and
PDF assembly pipeline.

MCP input paths are absolute; YAML and Markdown asset paths retain their
configuration/source-relative behavior. Outputs cannot replace sources,
configuration, or cover assets even when overwrite is enabled. The server does
not expose arbitrary shell, JavaScript, DOM, or generic input-control tools.
Page-first preview captures and page navigation must identify the finalized
layout revision and reject stale results. Extend validated capabilities while
preserving existing heading/scroll operations where applicable. Until migrated,
continuous-preview captures remain explicitly labeled as non-final pagination;
do not claim page-first behavior for them. See `docs/mcp.md` for current tool
details and operating constraints.

### Markdown and HTML

Support headings/anchors, fenced code, tables, task lists, links, local images,
front matter, Shiki highlighting, KaTeX math, and Mermaid diagrams. Front matter
is data only. Keep transforms extensible without requiring a public plugin
system.

Generate complete HTML with semantic structure, theme CSS, screen/print CSS,
structure CSS, and optional controlled custom CSS. Page-first preview and PDF
share the finalized page artifact; print-only rules may remove viewer decoration
but must not change content geometry or introduce new body breakpoints. HTML
export includes or packages the assets needed for distribution.

Parse standalone `\clearpage` outside code, math, raw HTML blocks, and other
literal contexts into a source-linked page-ending control. It ends the current
page and starts subsequent content on a new one without accidental leading,
trailing, or consecutive blank pages. Do not use global string replacement or
claim LaTeX float-flushing compatibility without a float queue. Reserve distinct
semantic controls for future recto starts and deliberate blank pages. Flowing
HTML must treat supported controls safely without displaying raw directives or
acquiring fixed-page semantics.

Constrain images to printable space and preserve aspect ratios. Keep short
figures/code together where practical; split long prose, lists, code, and tables
without losing content, numbering, syntax colors, or semantic order. Repeat
table headers and diagnose overheight rows, oversized atomic items, wide
content, and unresolved links/assets rather than concealing failures with
clipping.

### Preview and themes

Page-first preview displays real A4/Letter sheets with whole-page backgrounds,
publication folios, current/total physical page position, and page navigation.
Support zoom, source-linked diagnostics, and debounced rebuilds after source,
asset, theme, or configuration changes. Numbered TOC entries target final
logical page labels and remain clickable after PDF assembly. Verify shared
pagination, labels, backgrounds, and content with fixtures; do not imply
unmeasured pixel-identical rasterization.

Ship the Rose, GitHub, Modern Serif, Claude, Academic Paper, Classic Book,
Minimal Print, Notebook, Solarized Light, and Nordic Light themes. Theme
definitions contain identity/version, supported page profiles,
typography/spacing tokens, code style, cover layouts, CSS, and assets. Common
layout controls are available in the GUI. Interactive controls are keyboard
accessible and use semantic HTML/ARIA. Keep page-template geometry and furniture
separate from theme typography and local content styles. Normalize legacy
screen/print selectors so preview and printing use one margin model and the same
measured content bounds. Preserve approved theme-background assets. New template
image controls, watermarks, odd/even decoration, and advanced running headers
are extension points, not first-milestone requirements.

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

The target interactive preview presents fixed-size A4/Letter pages (points
converted at 96/72 CSS pixels) from the finalized shared artifact. Fit width is
the default; manual zoom supports 25–200% and actual size. Zoom changes
presentation without compilation or text reflow. Viewer-only spacing, shadows,
and controls never enter PDF/HTML output. Reflow restores reading position by
source anchor where possible and distinguishes pending, ready, stale, and failed
results. Imported PDF covers may use controlled preview images while retaining
original vectors in export. Page virtualization is deferred until justified by
measured workloads and must not break anchors, selection, or accessibility.

The current implementation delivers this page-first preview for the default
path. Markdown compiles once, an isolated Paged.js layout pass produces a
revision-bound static page artifact, and the desktop preview and Chromium
printing consume that same artifact. The preview shows fixed A4/Letter sheets
with page navigation, whole-sheet template backgrounds, shared folios, and
contents page references. HTML export intentionally remains the flowing,
body-only profile. The legacy continuously flowing preview and PDF folio
stamping remain available only when page-first layout is disabled.

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

Wait for DOM, used fonts, images, math/diagrams, completed layout, converged
page references, and an explicit publication-ready signal, with actionable
timeout/failure diagnostics. Fixed sleeps are not the readiness mechanism. Print
backgrounds and honor CSS page sizes without independently repaginating content.

Assembly preserves page dimensions and vector body content, inserts planned
cover/front/back matter exactly once, writes metadata, and fails on malformed
intermediate PDFs. Check generated-page counts against the generated portion of
the page plan and final counts/order against the complete plan. Preserve and
verify clickable destinations through assembly.

The page-first path prints the finalized artifact with zero page margins and no
independent repagination. Planned cover pages shift physical positions but not
logical labels; `restartBodyAfterToc` is an explicit opt-in numbering policy.
Page templates target publication sections rather than physical page numbers, so
reflow cannot silently apply a template to the wrong content.

After final numbering is known, render folios through the shared page HTML for
both preview and PDF, with header/footer space reserved before body layout.
Preserve existing numbering defaults and validation:

- centered footer, bundled Latin font, 6–24pt, regular/bold/italic;
- validated format containing `{page}` and/or `{pages}`, printable ASCII only;
- number all body-stream pages, hide first and start at 1 on second, or hide
  first and retain body-stream numbering (2 on second).

Page-first folios appear in preview and PDF, not in the existing flowing HTML
profile. The legacy PDF-stamping service may remain during migration but must
not duplicate shared HTML folios. Retain font-coverage checks and regressions
for glyph rendering, embedding, and output size when changing that path.
Physical order, logical labels, display visibility, and total scopes remain
separate. By default, covers are unnumbered and excluded from `{pages}`; the TOC
belongs to the body total. Preserve all existing first-page-mode semantics and
provide an explicit policy for restarting the main body after the TOC.

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
Mermaid rendering without writing a publication. Flowing HTML remains body-only;
page templates, TOC page references, folios, and cover sequencing belong to the
shared page-first preview/PDF path. CLI, desktop, and MCP must use the same
layout service and versioned contracts rather than entry-point-specific
pagination.

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
- All built-in themes, layout controls, cover composition, and numbering work.
- Combine export and a batch of at least 25 fixture documents complete without
  UI lockup or failure propagation; cancellation behaves predictably.
- AI integration works when configured; local export works without it.
- Packaging targets Windows, macOS, and Linux. Signing/notarization are release
  concerns; automatic updates follow signed release artifacts.

Page-first milestone acceptance additionally requires one reproducible fixture
that combines an unnumbered cover, multipage TOC with a distinct whole-sheet
background and correct page labels, an explicit main-body numbering restart,
previewed folios, a section template switch, and `\clearpage`. Typography
changes must update pagination, references, and totals together. Final PDF
pages, backgrounds, labels, and TOC destinations must agree with the finalized
preview artifact after assembly. Run content-preservation, fragmentation,
security, revision/cancellation, theme/size, entry-point, and packaged-runtime
checks before switching the default path. See the implementation plan for
phase-specific gates.

Chromium is adequate for ordinary technical/digital publications, not full
commercial prepress. Evaluate another print backend only against a concrete
requirement. Future CLI work may add batch and multi-chapter publication through
the shared publishing pipeline.
