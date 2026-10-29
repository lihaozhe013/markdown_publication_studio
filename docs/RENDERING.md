# Rendering pipeline

The publication pipeline produces one static HTML document per purpose:

- The flowing document serves HTML export and stays flow-based.
- The paginated artifact serves the desktop preview and PDF printing. It
  contains finalized page boxes, page templates, contents references, and
  folios, so preview and PDF never paginate differently.

```text
Markdown
  -> markdown-it tokenization (including layout directives)
  -> Shiki code highlighting
  -> KaTeX formula rendering
  -> safe static HTML filtering
  -> local asset resolution and data-URL embedding
  -> Mermaid placeholder extraction
  -> isolated Chromium Mermaid SVG rendering
  -> static publication HTML
       -> HTML export (flowing profile)
       -> optional contents section with reserved page labels
       -> isolated Paged.js layout in a sandboxed window
       -> PagePlan: kinds, templates, physical/logical pages, folios
       -> bounded contents-reference convergence
       -> paginated artifact (static HTML, no scripts)
            -> desktop preview (same artifact revision)
            -> isolated printToPDF with zero page margins
            -> optional cover/back-cover PDF assembly
```

## Engine choice

Paged.js `0.5.0-beta.2` was selected after probing Vivliostyle Core and a
complete-block custom paginator against repository fixtures. Browser pagination
and extension hooks fit the existing Chromium pipeline, and the MIT license fits
the distribution model; Vivliostyle's AGPL-3.0 obligations and a custom
paginator's fragmentation work ruled those options out. The version is pinned in
the desktop manifest and lockfile, its license and transitive dependencies are
reviewed with dependency updates, and the engine version participates in the
artifact revision so a stale preview cannot be printed behind a newer engine.

The engine bundle and the isolated layout program are emitted next to the
main-process bundle at build time, so packaged builds load them from the
application archive.

## Page-first pagination

Paged.js `0.5.0-beta.2` is pinned as the layout engine and bundled as
application-owned code. The main process emits the engine bundle and the
isolated layout program next to the main-process bundle at build time, injects
both into a sandboxed `BrowserWindow`, and evaluates them only in that window.
Publication source never receives scripting permission.

A layout pass:

1. Loads the compiled publication HTML from a temporary file and waits for fonts
   and images with bounded readiness checks.
2. Injects the engine and layout program.
3. Installs animation-frame fallbacks so hidden windows still render.
4. Lays out the document with explicit page size and margins.
5. Restores deterministic heading anchors and repeats table headers on
   continuation pages.
6. Resolves each contents entry to its generated page, then applies folios,
   whole-sheet template backgrounds, and page kinds.
7. Serializes the finalized document and removes the engine's inert copy of the
   source content so the artifact keeps one copy of every anchor.

Contents labels occupy a reserved fixed-width column. If refilling them changes
the measured contents geometry, the service reloads the artifact with the
previous labels pre-filled and repeats, up to three passes, with cycle
detection. A non-converging document fails with an actionable error instead of
shipping stale references.

The service reports `layout-overflow` warnings when content visibly escapes the
printable content box, `page-template-unknown` warnings for invalid template
names, and `toc-reference-unresolved` errors when a contents entry has no
destination page. Layout diagnostics are attached to the publication result.

Set `MPS_LAYOUT_DUMP_DIR` to a directory to retain the layout report and the
serialized artifact for diagnostics. The files contain publication content and
must stay out of source control.

Cancellation destroys the layout window; long layouts are bounded by an explicit
deadline of 180 seconds per step. `pnpm test:page-first` exercises the complete
acceptance scenario, the ten-theme and two-paper-size matrix, hostile source
content, and cancellation. `pnpm verify:packaged` runs the same pipeline from an
unpacked application build and requires the engine assets to be present in the
application archive. On the reference Linux machine, a two-page sample
publication paginates in about 4-5 seconds and an 80 MiB request fixture with 44
headings, 85 table rows, and 110 code lines paginates in about 23 seconds. These
numbers are measurements, not guarantees.

## Fragmentation and content integrity

The engine fragments flowing content rather than clipping it. Long code blocks
split by lines with Shiki token colors and source order preserved, tables split
by rows and repeat their header on continuation pages, and headings stay with
following content where practical. Figures, display math, and diagrams remain
atomic where they fit a page. Content must not disappear, reorder, or be hidden
by clipping; visible escapes produce `layout-overflow` warnings instead of
silent loss. The acceptance check asserts ordered code lines, ordered table
rows, repeated headers, and no visible overflow across every built-in theme and
both paper sizes.

## Layout directives

A standalone `\clearpage` line ends the current page. It is parsed as a typed
layout node with a source line number, so occurrences in fenced or indented
code, inline code, math, and raw HTML stay literal. Leading, trailing, and
consecutive directives do not produce accidental empty pages.

A standalone `\pagetemplate{name}` line starts a new page and applies the named
template to the following content. `section` is the supported named template in
this release; `default` returns to the base template. Names outside
`[a-z][a-z0-9-]{0,31}` are rejected during layout with a warning and fall back
to the default template. Template backgrounds cover the whole physical sheet,
including the margins.

## Code blocks

Shiki is configured with its complete bundled language registry and recognizes
both canonical language names and aliases. An unknown language remains readable
as a plain code block and produces an `unsupported-language` diagnostic. Theme
CSS controls the code-block container only; Shiki token colors remain inline and
are not replaced by publication theme selectors.

## Formulas

The compiler supports `$...$`, `\\(...\\)`, `$$...$$`, and `\\[...\\]`. KaTeX
generates HTML and MathML. The rendering diagnostics verify that its stylesheet
and font assets are available to the final document before offline output is
accepted.

## Mermaid

Mermaid fenced blocks are first represented as deterministic placeholders. The
main process renders those placeholders in an isolated Chromium window using
application-owned Mermaid code, then inserts sanitized inline SVG. The original
viewBox and Mermaid geometry are preserved; Mermaid filters, gradients, markers,
symbols, and restricted static `foreignObject` labels survive sanitization.
Failed diagrams remain visible as source code and produce a warning; invalid
sanitized geometry and renderer startup failures are errors and block export.

## Safe HTML

Raw Markdown HTML is limited to static semantic elements, tables, details,
restricted SVG, and safe attributes. Scripts, event attributes, iframe/embed
content, dangerous URL schemes, external media, and unsafe CSS are rejected.

## Local images

Relative image references are resolved from the Markdown file and must remain
inside its project root. Absolute filesystem image references are allowed after
the user selects the Markdown file through the native file dialog; they are read
by the main process and embedded as data URLs before preview, HTML export, or
PDF printing. Missing or unsupported absolute assets produce the same
diagnostics as relative assets.

## Readiness and printing

The print backend waits for fonts and images, verifies that no Mermaid
placeholder remains, sets the explicit `publication-render-ready` marker, and
then calls the embedded Chromium with `printBackground: true` and
`preferCSSPageSize: true`. Fixed delays are not used for synchronization.

When page-first pagination is enabled, the print backend prints the finalized
artifact with zero page margins. Each generated page box is exactly one sheet,
so Chromium does not choose new breakpoints. Generated pages carry their own
folios and template backgrounds; the PDF page-number post-processing stage is
skipped for that path to avoid duplicate furniture.

## Page canvas backgrounds

Themes declare either an `inset` or `full-bleed` page canvas mode. Inset themes
keep the default page margin area, while full-bleed themes keep the same content
margins and add a CSS `@page` background that covers the complete printed page.
Theme page backgrounds may use local image assets; the theme asset pipeline
inlines supported fonts and images as data URLs and rejects remote or
out-of-root references.

## Page numbers

In the page-first path, folios are part of the shared page artifact: the preview
and the PDF render the same footer text, font size, style, and labels. Numbering
resolves from the complete page sequence, including planned cover pages. Covers
are unnumbered and outside the numbering scope. By default the contents section
belongs to the body total, exactly like the legacy PDF numbering; the
`restartBodyAfterToc` page-layout option starts main-body labels again at 1
after the contents.

The legacy PDF post-processing stage remains available when page-first layout is
disabled. It uses `pdf-lib` and an application bundled font to draw the
configured centered footer after Chromium has produced the page stream. It is
never applied on top of shared page folios.

Page-number fonts are limited to bundled Latin faces because CJK fonts cannot be
subsetted reliably and would add tens of megabytes to every PDF. The page-number
format is restricted to basic Latin letters, digits, punctuation, `{page}`, and
`{pages}`. In the legacy path, `fontkit` checks the real glyph coverage of every
character in the formatted page number; a missing glyph fails the export with an
actionable error instead of emitting a `.notdef` glyph or embedding a large
fallback font. Inter is embedded in full because subsetting the bundled Inter
font can leave a complete ToUnicode map while raster output loses some glyphs.
Open Sans and JetBrains Mono remain subsetted. The Source Serif 4 and Source
Sans 3 variable fonts are always embedded in full.

## Table of contents

PDF export can insert a `Contents` page between the optional front cover and the
Markdown body. The compiler assigns deterministic `id` and `data-toc-id` anchors
to every heading; H1-H3 are collected into the table of contents while H4-H6
retain anchors without becoming entries. Duplicate heading text receives unique
IDs, and inline links, code, and CJK text are reduced to plain visible heading
text for the entries.

The two built-in presets are `Classic Book`, which uses an editorial hierarchy,
serif-led section titles, and open spacing, and `Modern Technical`, which uses a
compact sans-serif hierarchy with a theme-colored rail. Both presets are
generated by the publication core and inherit the active theme and page size;
they do not accept arbitrary CSS. Entries remain clickable through their heading
anchors.

In the page-first path, every entry also carries the logical page label of its
destination, resolved after layout and refilled until the contents geometry is
stable. Repeated table headers and continuation fragments never become false
destinations because labels resolve from deterministic heading anchors.

HTML export intentionally remains body-only and flow-based: it omits page
references and fixed pages. A document with no H1-H3 headings does not receive
an empty contents page; it only reports a warning.

## Rendering diagnostics

Development sessions emit structured `[math-render]`, `[mermaid-render]`, and
`[toc]` records to `debug.log`. The KaTeX record reports the stylesheet font URL
form, the browser's font checks for the KaTeX text, math, and delimiter
families, and the computed font family used by rendered glyphs. The Mermaid
record reports the raw and sanitized SVG structure, the raw SVG bounds, and the
final preview or print bounds. TOC records report structure-only preview layout
details without logging publication content.

Use the canonical fixture at `examples/sample-book/rendering-diagnostics.md`,
then inspect only rendering records after reproducing the issue:

```bash
pnpm dev
rg '\[(math-render|mermaid-render|toc)\]' debug.log > rendering-debug.log
```

The debug report is intentionally enabled only for development sessions or when
`MARKDOWN_PUBLICATION_RENDER_DEBUG=1` is set.

## Structured style overrides

The application can append a validated, structured style override layer after
the built-in theme, KaTeX stylesheet, and Shiki helper rules. The same generated
CSS is included in the interactive preview, self-contained HTML export, and PDF
print document. Empty fields inherit the selected theme; the override layer does
not change `@page`, page numbers, or the page canvas mode.

Font choices are limited to bundled application fonts. When a selected font is
not already part of the active theme, its approved font-face declarations and
assets are inlined into the document before rendering. Syntax-token colors
generated by Shiki remain inline and are intentionally outside the structured
override surface.

## Cover and back-cover assembly

PDF export can prepend an optional front cover and append an optional back
cover. The main process reads assets selected through the native file dialog;
the renderer receives only an opaque asset handle and display metadata.

PNG and JPEG images are embedded directly into a page with the selected portrait
A4 or Letter dimensions. The image is intentionally stretched to the full page
because cover artwork is expected to be prepared for the target publication.

Cover PDFs must contain exactly one unrotated page whose dimensions match the
selected output page size within a small PDF floating-point tolerance. The
source PDF page is copied without rasterization so vector artwork, fonts, and
designer-provided layout remain intact. Invalid, multi-page, rotated, or
dimension-mismatched assets block export with an actionable `[cover]` error.

Cover pages are unnumbered and `{pages}` counts body pages only; front cover
pages are planned before generated pages so physical positions and PDF
destinations stay correct after assembly. HTML export remains body-only in this
milestone.
