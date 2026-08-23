# Markdown Publication Studio — Agent Project Specification

> Status: bootstrap specification / source of truth for the initial implementation
> Baseline date: 2026-08-15
> Project type: cross-platform desktop application
> Primary goal: turn one or many Markdown documents into polished, reproducible publication-grade PDF/HTML deliverables through a simple GUI and a scriptable publishing pipeline.

---

## 0. Instructions to the coding agent

This document is the implementation contract for the initial project. Start from an empty repository. Do not fork `md-to-pdf`; use it only as a reference for Markdown-to-HTML conversion, stylesheet handling, local asset resolution, browser lifecycle, print CSS, and PDF export behavior.

Before creating `package.json`, resolve the latest **stable** versions from the package registry for every direct dependency. Do not use alpha, beta, RC, canary, nightly, next, or other prerelease channels unless this document explicitly requests one.

The versions listed below are the minimum verified baseline as of 2026-08-15. If a newer stable patch/minor/major exists at bootstrap time and is compatible with this architecture, use the newer stable version and record the resolved versions in `docs/DEPENDENCY_BASELINE.md`.

Mandatory baseline:

- Electron: `43.4.0` or newer stable. Baseline Electron 43.4.0 embeds Chromium 150.0.7871.224 and Node.js 24.18.1.
- TypeScript: `7.0.x` or newer stable TypeScript 7 release. TypeScript 7 is mandatory; do not downgrade to TypeScript 6.x.
- React: `19.2.x` or newer stable.
- Vite: `8.2.1` or newer stable.
- pnpm: `11.21.0` or newer stable.
- Vitest: `4.1.10` or newer stable.
- Zod: `4.4.3` or newer stable.
- electron-builder: `26.15.3` or newer stable, unless a newer stable packaging solution is demonstrably more appropriate.

After resolving dependencies, pin the resolved versions in the lockfile. Do not use floating dependency ranges as a substitute for reproducibility.

Use strict TypeScript everywhere. Avoid JavaScript source files except unavoidable configuration shims.

---

# 1. Product definition

The product is **not a Markdown editor**.

The product is a desktop publishing and batch-processing application for users who already have Markdown content and want to turn it into finished publications with minimal manual layout work.

The product should feel closer to a “Markdown publishing compiler with a visual control panel” than to Typora, Obsidian, VS Code, or a note-taking application.

The central user promise is:

> Give the application Markdown files, choose or configure a publication style, and receive a polished publication without manually handling HTML, CSS, browser printing, page assembly, cover composition, or repetitive batch conversion.

Primary use cases:

1. Technical books and handbooks.
2. Course notes and training materials.
3. Whitepapers and reports.
4. Documentation collections.
5. PDF ebooks and downloadable publications.
6. Batch export of many Markdown files using one consistent publication profile.
7. Combining multiple Markdown files into one ordered publication.
8. AI-assisted cover artwork generation followed by deterministic title/author typography and automatic PDF assembly.

---

# 2. Explicit non-goals

Do not build these into the MVP:

- A Markdown text editor.
- WYSIWYG editing.
- Knowledge-base features.
- Backlinks.
- Note management.
- Cloud synchronization.
- Collaboration.
- Generic AI chat.
- A plugin marketplace.
- A full design application comparable to InDesign.
- Fine-grained freeform page-canvas editing.

The application may display source file names, metadata, parsing warnings, structure, and rendered previews, but editing Markdown content itself is out of scope.

---

# 3. Core architectural principle

Treat publishing as a deterministic pipeline:

```text
Markdown source(s)
      │
      ▼
Source discovery + metadata
      │
      ▼
Markdown parsing / normalization
      │
      ▼
Publication model
      │
      ▼
HTML document generation
      │
      ├──────────────► interactive preview
      │
      ▼
hidden Electron WebContents
      │
      ▼
Chromium print engine
      │
      ▼
PDF page stream
      │
      ▼
post-processing / assembly
      │
      ├── cover
      ├── front matter
      ├── body
      ├── appendices
      ├── metadata
      └── future attachments
      │
      ▼
final publication
```

The GUI must orchestrate this pipeline. The GUI must not contain publishing logic that cannot also be invoked programmatically.

---

# 4. Why Electron is the required desktop runtime

Use Electron as the desktop runtime.

The decisive reason is that Chromium is part of the product's rendering architecture, not merely its GUI technology.

Electron provides:

- a bundled and version-controlled Chromium engine;
- stable HTML/CSS rendering;
- CSS print media support;
- `webContents.printToPDF()`;
- isolated hidden rendering windows;
- cross-platform behavior across Windows, macOS, and Linux;
- the same engine for preview and production PDF rendering.

Do not bundle a second Chromium via Puppeteer for the normal export path.

Do not implement the architecture as:

```text
Electron -> spawn md-to-pdf -> Puppeteer -> second Chromium
```

Instead use:

```text
Electron -> internal publishing core -> hidden Electron WebContents -> printToPDF()
```

Puppeteer may later be added only for test automation or an explicitly justified headless/server backend.

---

# 5. Technology stack

## 5.1 Required foundation

- Electron — desktop shell and Chromium print runtime.
- TypeScript 7 — language for all application/core code.
- React — renderer-process GUI.
- Vite — renderer development/build system.
- pnpm — package manager and workspace manager.

Use native ESM wherever practical.

## 5.2 Recommended core libraries

Resolve latest stable versions at bootstrap:

- `markdown-it` — Markdown parsing, selected for its explicit token/plugin pipeline.
- `gray-matter` only if its active version and configuration are safe for untrusted input; otherwise use a data-only YAML front-matter parser. Never execute JavaScript front matter.
- `yaml` — YAML parsing/serialization for publication manifests.
- `zod` — runtime validation of project configuration, IPC payloads, manifests, and persisted data.
- `shiki` — publication-quality syntax highlighting.
- `katex` — math rendering.
- `mermaid` — diagrams.
- `pdf-lib` — PDF merging, page insertion, metadata, and simple post-processing.
- `chokidar` or an equally mature latest-stable file watcher — watch source documents and assets.

Do not add a database in the MVP unless actual persistence requirements exceed project-file + application-settings storage.

## 5.3 UI libraries

React is required, but avoid committing the core architecture to a large UI framework.

For the MVP:

- React.
- CSS Modules, vanilla CSS, or another lightweight style system.
- A mature headless component library may be used if it reduces accessibility/interaction work without imposing a strong product aesthetic.
- Use native OS dialogs through Electron for file/folder selection where appropriate.

Do not install a routing framework unless multiple independent application routes genuinely appear. A desktop workspace can initially be a state-driven single-window application.

## 5.4 Testing and quality

Use latest stable versions of:

- Vitest — unit and integration tests.
- React Testing Library — UI behavior tests where useful.
- Playwright — optional but recommended for Electron E2E testing if current stable Electron integration is reliable.
- ESLint — latest stable version compatible with TypeScript 7.
- Prettier — latest stable, unless the repository adopts another deterministic formatter.

Use `tsc`/TypeScript 7 for type checking even if Vite performs transpilation.

---

# 6. Repository structure

Start as a pnpm workspace even if the first implementation lives in one repository.

Recommended layout:

```text
markdown-publication-studio/
├── apps/
│   └── desktop/
│       ├── src/
│       │   ├── main/
│       │   │   ├── app.ts
│       │   │   ├── windows/
│       │   │   ├── ipc/
│       │   │   ├── services/
│       │   │   └── security/
│       │   ├── preload/
│       │   │   ├── index.ts
│       │   │   └── api.ts
│       │   └── renderer/
│       │       ├── main.tsx
│       │       ├── app/
│       │       ├── components/
│       │       ├── features/
│       │       └── styles/
│       ├── vite.config.ts
│       └── package.json
│
├── packages/
│   ├── publication-model/
│   ├── markdown-pipeline/
│   ├── html-renderer/
│   ├── print-backend/
│   ├── pdf-assembly/
│   ├── project-schema/
│   ├── job-engine/
│   └── shared/
│
├── themes/
│   ├── technical-book/
│   ├── report/
│   └── minimal/
│
├── examples/
│   └── sample-book/
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DEPENDENCY_BASELINE.md
│   ├── SECURITY.md
│   └── RENDERING.md
│
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── pnpm-lock.yaml
```

Do not create packages only as empty architectural theater. It is acceptable to begin with fewer physical packages, but preserve these logical boundaries.

---

# 7. Process boundaries

## Electron main process

Owns:

- window lifecycle;
- filesystem access;
- project loading/saving;
- source discovery;
- export job scheduling;
- hidden render windows;
- PDF output;
- native dialogs;
- safe IPC implementation;
- AI provider communication unless there is a strong reason to isolate it further.

## Preload

Expose a deliberately small typed API.

Example shape:

```ts
export interface DesktopApi {
  project: {
    open(): Promise<ProjectOpenResult | null>;
    load(path: string): Promise<ProjectSnapshot>;
    save(config: PublicationProject): Promise<void>;
  };

  export: {
    start(request: ExportRequest): Promise<JobId>;
    cancel(jobId: JobId): Promise<void>;
    subscribe(listener: (event: ExportJobEvent) => void): () => void;
  };

  preview: {
    build(request: PreviewRequest): Promise<PreviewResult>;
  };
}
```

Renderer code must not receive unrestricted Node.js APIs.

## Renderer process

Owns only user interface concerns:

- project configuration;
- source/chapter ordering;
- template selection;
- cover configuration;
- preview presentation;
- export queue/status;
- warnings and errors.

Do not put direct filesystem calls, PDF manipulation, AI API keys, or privileged operations in React components.

---

# 8. Electron security requirements

Every untrusted publication must be treated as potentially malicious input.

Mandatory BrowserWindow defaults for UI and publication rendering where applicable:

```ts
webPreferences: {
  nodeIntegration: false,
  contextIsolation: true,
  sandbox: true,
}
```

Additional rules:

1. Never execute JavaScript supplied through Markdown/front matter.
2. Do not expose `require`, `process`, raw `ipcRenderer`, filesystem handles, or arbitrary command execution to publication HTML.
3. Validate all IPC payloads with Zod.
4. Restrict navigation and new-window behavior.
5. Explicitly define policy for remote HTTP/HTTPS assets.
6. Resolve local file references only within allowed project roots unless the user explicitly authorizes external assets.
7. Render publication content in an isolated WebContents/BrowserWindow, separate from the application UI.
8. Keep AI credentials in the main process / OS-backed secret storage, never in renderer state or generated HTML.

Create `docs/SECURITY.md` before the AI integration milestone.

---

# 9. Publication domain model

Do not treat the publication as one giant HTML string internally.

Create a typed domain model roughly equivalent to:

```ts
export interface Publication {
  metadata: PublicationMetadata;
  cover?: CoverDefinition;
  frontMatter: PublicationPart[];
  chapters: Chapter[];
  backMatter: PublicationPart[];
  theme: ThemeDefinition;
  outputProfiles: OutputProfile[];
}

export interface Chapter {
  id: string;
  sourcePath: string;
  title: string;
  order: number;
  metadata: Record<string, unknown>;
  blocks: PublicationBlock[];
}
```

The exact AST does not need to duplicate a full Markdown AST. It must, however, be rich enough to support:

- ordered multi-file publications;
- generated front matter;
- generated table of contents;
- forced chapter page breaks;
- conditional output;
- warnings tied to source locations;
- future EPUB or alternate backend support.

---

# 10. Project file / manifest

Every publication project must be reproducible from a machine-readable file stored with the content.

Prefer `publish.yaml` as the default manifest name.

Initial schema example:

```yaml
version: 1

publication:
  title: "Distributed Systems Notes"
  subtitle: "A Practical Handbook"
  author: "Author Name"
  language: "en"

source:
  mode: directory
  root: ./manuscript
  include:
    - "**/*.md"
  order:
    - 01-introduction.md
    - 02-architecture.md
    - 03-deployment.md

structure:
  cover: true
  titlePage: true
  tableOfContents: true
  chapterStartsOnNewPage: true

layout:
  pageSize: A4
  margins:
    top: 18mm
    right: 16mm
    bottom: 20mm
    left: 16mm
  pageNumbers: true

header:
  left: "{publication.title}"
  right: "{chapter.title}"

footer:
  center: "{page}"

theme:
  preset: technical-book

cover:
  mode: generated
  artwork: ./assets/cover.png
  layout: minimal-title

output:
  directory: ./dist
  profiles:
    - name: screen
      format: pdf
      file: book-screen.pdf
    - name: print
      format: pdf
      file: book-print.pdf
    - name: html
      format: html
      file: book.html
```

Load and validate this configuration with Zod.

The GUI must edit this model rather than maintaining an incompatible hidden settings format.

---

# 11. Markdown pipeline

Implement Markdown conversion as a package/service with explicit phases:

```text
read source
  -> parse front matter
  -> parse Markdown
  -> normalize tokens/AST
  -> apply publication transforms
  -> syntax highlighting
  -> math/diagram placeholders
  -> HTML generation
  -> asset resolution
```

Requirements:

- GitHub-flavored Markdown features expected by technical users.
- fenced code blocks;
- tables;
- task lists;
- links;
- local images;
- heading anchors;
- optional KaTeX;
- optional Mermaid;
- Shiki code highlighting.

Create an extension API internally even if no user plugins exist in V1.

Example:

```ts
export interface MarkdownTransform {
  name: string;
  transform(document: MarkdownDocument, context: TransformContext): Promise<void>;
}
```

Do not couple Markdown parsing directly to Electron APIs.

---

# 12. HTML rendering

HTML is an intermediate publication format and a supported final export format.

Generate complete self-contained or controlled-asset HTML documents from the publication model.

The renderer should have explicit layers:

```text
semantic publication HTML
+ theme CSS
+ print CSS
+ generated structure CSS
+ optional safe custom CSS
```

The same base document must be used for preview and PDF rendering to minimize divergence.

Support both:

```css
@media screen { ... }
@media print { ... }
```

and:

```css
@page {
  size: A4;
  margin: 18mm 16mm 20mm;
}
```

Initial pagination rules should cover at least:

- chapter starts;
- heading orphan avoidance where feasible;
- `break-inside: avoid` for appropriate figures and short code blocks;
- images constrained to printable area;
- basic table overflow detection;
- explicit user page breaks.

Page numbers are a separate layout concern. The initial implementation must
support a centered footer with a bundled font family, a 6–24pt size, regular,
bold, or italic styling, and a validated format containing `{page}` and/or
`{pages}`. The first-page policy must support numbering every page, hiding the
first page and starting at 1 on the second page, or hiding the first page while
retaining the physical page number 2 on the second page.

---

# 13. Preview architecture

The product requires a publication preview, not a source editor.

Initial window concept:

```text
┌─────────────────────────────────────────────────────────────┐
│ Project title                                  Export       │
├───────────────────┬─────────────────────────────────────────┤
│ Sources           │                                         │
│ Structure         │             Preview                     │
│ Theme             │                                         │
│ Cover             │        rendered publication             │
│ Page setup        │                                         │
│ Output            │                                         │
├───────────────────┴─────────────────────────────────────────┤
│ warnings / job status                                       │
└─────────────────────────────────────────────────────────────┘
```

Preview requirements:

- reload when source files change;
- reload when project settings/theme change;
- show page-size-aware rendering;
- support zoom;
- expose parsing/rendering warnings;
- never become a Markdown editor.

Do not promise pixel-perfect pagination parity until validated. Build regression fixtures to measure preview/PDF divergence.

---

# 14. Production PDF renderer

Never export from the same interactive WebContents the user is manipulating.

Implement a dedicated hidden rendering window or controlled WebContents.

Conceptual interface:

```ts
export interface PrintBackend {
  readonly id: string;
  render(input: PrintRenderInput): Promise<Uint8Array>;
}

export class ChromiumPrintBackend implements PrintBackend {
  readonly id = "chromium-electron";
}
```

Typical export sequence:

1. Construct publication HTML.
2. Load it into the isolated renderer.
3. Wait for DOM readiness.
4. Wait for `document.fonts.ready`.
5. Wait for all local/remote images according to asset policy.
6. Wait for KaTeX/Mermaid/Shiki generated content.
7. Wait for an explicit application-level `publication-render-ready` signal.
8. Collect warnings/overflow diagnostics.
9. Call `webContents.printToPDF()`.
10. Post-process the returned PDF bytes, including deterministic page-number
    drawing when enabled.
11. Write atomically to output path.

Use:

```ts
webContents.printToPDF({
  printBackground: true,
  preferCSSPageSize: true,
});
```

where supported and appropriate.

Never use arbitrary sleeps as the primary readiness mechanism.

---

# 15. PDF assembly

Use `pdf-lib` or a similarly suitable latest-stable library for deterministic post-processing.

MVP operations:

- prepend cover PDF pages;
- combine front matter and body PDFs if rendered separately;
- append back matter;
- draw centered page numbers with embedded bundled fonts after the final page
  count is known;
- write PDF metadata;
- preserve page dimensions correctly;
- fail loudly on malformed intermediate PDFs.

Keep this step independent from Markdown parsing.

---

# 16. AI-generated cover architecture

AI is a publishing pipeline feature, not a chat feature.

The first AI feature is cover artwork generation.

Important design rule:

**Do not rely on image-generation models to render the final title, subtitle, author name, or other precise typography inside the artwork.**

Preferred pipeline:

```text
publication metadata
       │
       ├── title
       ├── subtitle
       ├── author
       └── style prompt
       │
       ▼
AI generates artwork/background only
       │
       ▼
cover template HTML/CSS
       ├── artwork background
       ├── deterministic title text
       ├── deterministic subtitle
       ├── deterministic author text
       └── optional logo/brand
       │
       ▼
Chromium render
       │
       ▼
cover.pdf
       │
       ▼
PDF assembly + body.pdf
       │
       ▼
final.pdf
```

Define an abstraction:

```ts
export interface CoverArtworkProvider {
  readonly id: string;
  generate(request: CoverArtworkRequest): Promise<CoverArtworkResult>;
}
```

Do not hard-code the domain model around one AI vendor.

MVP AI cover UI should allow:

- prompt/style description;
- visual preset;
- aspect/layout awareness;
- regenerate;
- choose from generated candidates if provider supports multiple outputs;
- use existing local artwork instead of AI;
- disable AI entirely.

Do not block the core publication pipeline on AI availability.

---

# 17. Batch processing and job engine

Batch processing is a core product feature, not an afterthought.

Model every export as a job.

```ts
export type ExportJobState =
  | "queued"
  | "preparing"
  | "rendering"
  | "assembling"
  | "writing"
  | "completed"
  | "failed"
  | "cancelled";

export interface ExportJob {
  id: string;
  projectId: string;
  profileId: string;
  state: ExportJobState;
  progress?: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  outputPath?: string;
  error?: SerializedError;
}
```

Requirements:

- queue multiple jobs;
- bounded concurrency;
- cancel queued jobs;
- attempt cancellation of active jobs safely;
- isolate job errors;
- report progress/events to renderer;
- preserve logs useful for debugging;
- avoid one failed document terminating the entire batch.

Initial concurrency should be conservative because Chromium PDF rendering can consume substantial memory.

Make concurrency configurable internally, even if the first GUI does not expose it.

---

# 18. Batch modes required by MVP

Support these two distinct modes:

## A. Combine mode

```text
01.md + 02.md + 03.md -> one publication.pdf
```

## B. Batch mode

```text
01.md -> 01.pdf
02.md -> 02.pdf
03.md -> 03.pdf
```

All batch outputs may share:

- theme;
- page setup;
- branding;
- cover template;
- output profile.

The architecture must later permit variable substitution per file/project.

---

# 19. Theme system

Do not model themes as one arbitrary CSS blob only.

A theme should support:

```text
theme/
├── theme.json
├── screen.css
├── print.css
├── cover/
│   ├── minimal.html
│   └── minimal.css
└── assets/
```

Theme metadata should define:

- id;
- name;
- version;
- supported page profiles;
- typography tokens;
- spacing tokens;
- code theme;
- default cover layout;
- optional CSS files.

Advanced users may provide custom CSS, but the basic GUI should expose structured publication controls rather than requiring CSS knowledge.

Ship at least three initial themes:

1. `technical-book`
2. `report`
3. `minimal`

---

# 20. Output profiles

A project can define multiple output profiles.

Example profiles:

- Screen PDF — optimized for digital reading.
- Print PDF — higher quality images and print-friendly backgrounds.
- HTML — distributable or inspectable HTML.

The same source structure and publication metadata should feed all profiles.

Future backends may include EPUB, but EPUB is not required for the MVP.

---

# 21. CLI requirement

The GUI is primary, but the publishing engine must be callable from a CLI.

The CLI may be implemented after the first GUI vertical slice, but the core APIs must not make it difficult.

Target future commands:

```bash
pubmd build ./book
pubmd build ./book --profile print
pubmd build ./book --profile screen
pubmd batch ./docs --profile report
pubmd validate ./book
```

The intended invariant is:

> The same project manifest and publishing core should produce equivalent output whether started from the GUI or CLI.

Do not create two separate rendering implementations.

---

# 22. Error and warning model

Separate fatal errors from publication warnings.

Examples of warnings:

- missing image;
- remote image unavailable;
- code block wider than printable area;
- table overflow;
- heading hierarchy skips a level;
- Mermaid failed to render;
- font unavailable;
- unsupported CSS;
- unresolved internal link.

Define a structured diagnostic model:

```ts
export interface PublicationDiagnostic {
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
  sourcePath?: string;
  line?: number;
  chapterId?: string;
  details?: Record<string, unknown>;
}
```

The GUI must show diagnostics before/after export.

---

# 23. Rendering reproducibility

Reproducibility is a product feature.

For a given:

- application version;
- Electron/Chromium version;
- project manifest;
- theme;
- source files;
- assets;

output should be as deterministic as reasonably possible.

Record build metadata internally, including the Electron/Chromium version used for PDF generation.

Avoid network dependencies during export unless explicitly requested by the user. Prefer downloading/caching or bundling assets when feasible.

---

# 24. MVP user workflow

The first complete workflow should be:

1. Launch app.
2. Create/open publication project.
3. Choose one Markdown file, multiple Markdown files, or a source directory.
4. Application discovers files and displays their order.
5. User reorders chapters if needed.
6. User chooses a publication theme.
7. User configures page size and margins.
8. User enables/disables title page, TOC, headers, footer, page numbers.
9. User selects a local cover image OR requests AI cover artwork.
10. Application renders publication preview.
11. Application shows warnings.
12. User selects output profile.
13. User clicks Export.
14. Export job runs through queue.
15. Final PDF/HTML is written to the selected output directory.
16. User can reveal the output file in the native file manager.

No Markdown editing is required anywhere in this flow.

---

# 25. MVP feature checklist

## Required

- [ ] Electron desktop application on macOS, Windows, Linux.
- [ ] React + Vite GUI.
- [ ] TypeScript 7 across application and core packages.
- [ ] Open single Markdown file.
- [ ] Open multiple Markdown files.
- [ ] Open source directory.
- [ ] Source ordering.
- [ ] `publish.yaml` project manifest.
- [ ] Markdown -> HTML conversion.
- [ ] Local image support.
- [ ] Code highlighting using Shiki.
- [ ] KaTeX rendering.
- [ ] Mermaid rendering.
- [ ] HTML export.
- [ ] PDF export using Electron Chromium.
- [ ] Dedicated hidden export WebContents.
- [ ] Page-size and margin configuration.
- [ ] Page numbers.
- [ ] Basic header/footer.
- [ ] Generated table of contents.
- [ ] Chapter page breaks.
- [ ] At least 3 built-in themes.
- [ ] Local cover artwork.
- [ ] AI cover artwork provider abstraction.
- [ ] At least one functional AI cover provider integration, behind explicit user configuration.
- [ ] Deterministic HTML/CSS cover typography.
- [ ] PDF cover/body merge.
- [ ] Batch queue.
- [ ] Combine mode.
- [ ] Batch-per-file mode.
- [ ] File watcher for preview invalidation.
- [ ] Structured diagnostics.
- [ ] Unit tests for core model/config/transforms.
- [ ] Integration test for Markdown -> HTML.
- [ ] Integration test for HTML -> PDF.
- [ ] End-to-end fixture that produces a known sample publication.

## Explicitly deferred

- [ ] EPUB.
- [ ] PDF/X.
- [ ] CMYK workflow.
- [ ] commercial printer preflight.
- [ ] bleed/crop marks.
- [ ] footnotes beyond what Chromium handles acceptably.
- [ ] advanced running headers.
- [ ] professional float placement.
- [ ] collaboration/cloud.
- [ ] template marketplace.

---

# 26. Known technical risks

## Chromium is not a full professional typesetting engine

For the MVP, “publication-grade” means high-quality technical books, reports, course materials, digital publications, and ordinary print-ready PDFs suitable for common printers.

It does **not** initially mean a complete prepress replacement for InDesign or a dedicated paged-media/typesetting engine.

Potential limits include:

- widows/orphans;
- complex footnotes;
- advanced running elements;
- complex floats;
- large multi-page tables;
- exact commercial printing standards;
- CMYK/PDF-X.

Therefore keep the print backend abstract so a future backend can be added without replacing the publication model.

Possible future engines may be evaluated separately; do not introduce one into the MVP unless Chromium proves inadequate for a required acceptance test.

---

# 27. Initial API boundaries

The project should converge toward these logical interfaces.

```ts
export interface PublicationProjectLoader {
  load(path: string): Promise<PublicationProject>;
  save(project: PublicationProject): Promise<void>;
}

export interface MarkdownCompiler {
  compile(input: MarkdownSource, context: CompileContext): Promise<CompiledChapter>;
}

export interface PublicationBuilder {
  build(project: PublicationProject): Promise<BuiltPublication>;
}

export interface HtmlPublicationRenderer {
  render(publication: BuiltPublication, profile: OutputProfile): Promise<RenderedHtml>;
}

export interface PrintBackend {
  render(input: PrintRenderInput): Promise<Uint8Array>;
}

export interface PdfAssembler {
  assemble(input: PdfAssemblyInput): Promise<Uint8Array>;
}

export interface CoverArtworkProvider {
  generate(input: CoverArtworkRequest): Promise<CoverArtworkResult>;
}

export interface ExportJobEngine {
  enqueue(request: ExportRequest): Promise<JobId>;
  cancel(jobId: JobId): Promise<void>;
  subscribe(listener: ExportJobListener): Unsubscribe;
}
```

Avoid god classes such as `PublicationManager` that own every stage.

---

# 28. Implementation milestones

## Milestone 0 — Bootstrap

Deliverables:

- pnpm workspace;
- Electron latest stable;
- TypeScript 7;
- React latest stable;
- Vite latest stable;
- strict TS config;
- lint/format/test scripts;
- electron-builder packaging skeleton;
- secure BrowserWindow + preload bridge;
- `docs/DEPENDENCY_BASELINE.md` recording exact resolved versions.

Acceptance:

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm dev
```

all succeed from a clean clone.

## Milestone 1 — Minimal vertical slice

Input one `.md` file and produce one PDF.

Implement:

```text
.md -> markdown-it -> HTML -> hidden WebContents -> printToPDF -> .pdf
```

Also show the generated HTML in a preview panel.

Do not implement themes or AI yet.

Acceptance:

- Markdown headings, paragraphs, code, table, image render correctly.
- PDF uses print backgrounds.
- local image paths work.
- output is generated without Puppeteer.

## Milestone 2 — Publication project

Add:

- `publish.yaml`;
- Zod validation;
- multi-file source list;
- ordering;
- publication model;
- combine mode;
- title page;
- TOC;
- chapter page breaks.

Acceptance:

A sample 5-chapter book builds reproducibly from one manifest.

## Milestone 3 — Theme and page system

Add:

- theme package format;
- three default themes;
- page size;
- margins;
- header/footer;
- page numbers;
- preview controls;
- overflow diagnostics.

Acceptance:

One source project can produce visibly distinct `technical-book`, `report`, and `minimal` PDFs.

## Milestone 4 — Batch job engine

Add:

- queue;
- progress events;
- cancel;
- failure isolation;
- combine mode;
- per-file batch mode;
- export history for current session.

Acceptance:

Export at least 25 fixture Markdown documents in one batch without UI lockup or process crash.

## Milestone 5 — Cover pipeline

Add:

- local artwork;
- cover layouts;
- deterministic typography;
- cover PDF rendering;
- PDF assembly.

Acceptance:

A cover is prepended correctly without rasterizing the body PDF.

## Milestone 6 — AI cover generation

Add:

- provider abstraction;
- secure credential storage;
- one image-generation provider;
- regenerate/select candidate;
- generated image caching;
- graceful offline/no-provider path.

Acceptance:

A user can generate artwork, apply a cover layout, preview it, and export a combined final PDF without the AI model generating the title typography.

## Milestone 7 — Hardening

Add:

- file watching;
- render timeout handling;
- missing asset diagnostics;
- malformed Markdown fixtures;
- large image fixtures;
- wide table/code fixtures;
- Mermaid failure fixtures;
- security tests;
- packaging for target operating systems.

---

# 29. Test fixture publication

Create `examples/sample-book/` immediately and use it as the canonical regression project.

It must contain:

- Chinese and English text;
- multiple heading levels;
- inline code;
- fenced code blocks;
- a very long code line;
- Markdown table;
- a wide table;
- ordered/unordered/task lists;
- blockquotes;
- local PNG/JPEG/SVG if supported;
- one large image;
- KaTeX formula;
- Mermaid diagram;
- internal links;
- external links;
- explicit page break;
- at least five chapters;
- front matter metadata.

Use this fixture for every rendering regression test.

---

# 30. Performance expectations

MVP targets, subject to benchmark refinement:

- opening a normal project should not block the UI thread;
- preview rebuild should be debounced;
- export work must not freeze React interaction;
- batch rendering must use bounded concurrency;
- hidden render windows should be reused when safe to reduce startup overhead;
- render state must be reset between documents to avoid cross-job contamination;
- avoid retaining entire large PDFs in application state longer than necessary.

Profile before optimizing. Do not prematurely introduce worker threads unless measurable CPU-bound work requires them.

---

# 31. Packaging and release

Use the latest stable electron-builder unless implementation evidence favors another stable tool.

Initial packaging targets:

- macOS arm64 and x64/universal as appropriate;
- Windows x64;
- Linux x64.

Signing/notarization infrastructure may be stubbed locally but the architecture must not prevent it.

Do not implement automatic updates in the first vertical slice. Add it only after signed release artifacts exist.

---

# 32. Dependency policy

At every major implementation milestone:

1. Check whether direct dependencies have newer stable releases.
2. Review breaking changes before upgrading.
3. Keep prerelease versions out of production dependencies.
4. Commit the lockfile.
5. Run typecheck, unit tests, integration tests, rendering fixture tests, and packaging smoke tests after upgrades.

Do not blindly use `latest` in production manifests. Resolve latest stable intentionally, then lock it.

---

# 33. Agent implementation rules

The coding agent should follow these rules while implementing:

1. Prefer small vertical slices over generating a large amount of untested architecture.
2. Every milestone must end in executable software.
3. Do not create placeholder packages with no consumers.
4. Do not add libraries without explaining the problem they solve.
5. Do not introduce a backend server for local-only functionality.
6. Do not duplicate Chromium by bundling Puppeteer unless a new requirement justifies it.
7. Keep publication core independent of React.
8. Keep Markdown pipeline independent of Electron.
9. Keep PDF assembly independent of Markdown parsing.
10. Keep AI providers behind an interface.
11. Keep privileged filesystem and secret access outside the renderer process.
12. Validate untrusted external data at boundaries.
13. Add a regression fixture whenever fixing a rendering bug.
14. Do not silently ignore publication errors.
15. Preserve deterministic and scriptable project configuration.
16. Do not implement a Markdown editor.

---

# 34. Definition of MVP complete

The MVP is complete when a non-technical user can:

1. choose a directory containing Markdown chapters;
2. reorder them visually;
3. select a polished built-in publication theme;
4. set common page options without editing CSS;
5. configure title/author metadata;
6. provide or AI-generate cover artwork;
7. preview the assembled publication;
8. see actionable warnings;
9. export a single combined PDF;
10. export every Markdown file individually in a batch;
11. export HTML;
12. close and reopen the project with the same settings;
13. reproduce the same publication later using the project manifest.

The MVP is **not** complete if the user must manually invoke HTML/CSS/PDF tools outside the application to obtain the intended result.

---

# 35. First task for the coding agent

Do not start with AI, themes, or complex GUI work.

Implement Milestone 0 and Milestone 1 first.

The first meaningful end-to-end test must prove this architecture:

```text
sample.md
   ↓
MarkdownCompiler
   ↓
Publication/HTML renderer
   ↓
HTML preview
   ↓
isolated hidden Electron WebContents
   ↓
webContents.printToPDF()
   ↓
sample.pdf
```

The resulting PDF must contain:

- heading;
- paragraph;
- local image;
- syntax-highlighted code block;
- table;
- print background;
- A4 page configuration.

Once that vertical slice passes automated and manual verification, proceed to the publication project model.

---

# 36. Product principle

When architectural trade-offs are unclear, prefer the option that preserves this principle:

> Markdown remains plain source material. The publication manifest remains portable and human-readable. The GUI makes the publishing pipeline easy to operate. Chromium is the default rendering backend, not the product's domain model. The same publishing core must eventually serve GUI, batch, and CLI workflows.
