# Rendering pipeline

The publication pipeline produces one static HTML document for preview, HTML
export, and PDF printing.

```text
Markdown
  -> markdown-it tokenization
  -> Shiki code highlighting
  -> KaTeX formula rendering
  -> safe static HTML filtering
  -> local asset resolution and data-URL embedding
  -> Mermaid placeholder extraction
  -> isolated Chromium Mermaid SVG rendering
  -> static publication HTML
  -> preview / HTML export
  -> optional table-of-contents HTML section (preview/PDF only)
  -> isolated printToPDF (body PDF)
  -> optional two-pass PDF page-reference resolution
  -> PDF page-number post-processing
  -> optional cover/back-cover PDF assembly
```

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

## Page canvas backgrounds

Themes declare either an `inset` or `full-bleed` page canvas mode. Inset themes
keep the default page margin area, while full-bleed themes keep the same content
margins and add a CSS `@page` background that covers the complete printed page.
Theme page backgrounds may use local image assets; the theme asset pipeline
inlines supported fonts and images as data URLs and rejects remote or
out-of-root references.

## Page numbers

Page numbers are intentionally absent from the interactive preview and
self-contained HTML export. PDF export adds them only after Chromium has
produced the final page stream. The main process uses `pdf-lib` and an
application bundled font to draw the configured centered footer. This keeps page
numbering out of the body layout and allows the first page to be omitted or
renumbered after the exact page count is known. Large CJK fonts are embedded in
full because `pdf-lib` font subsetting can produce invalid mappings for Latin
digits and punctuation. Before embedding, `fontkit` checks the real glyph
coverage of every character in the formatted page number. Characters missing
from the selected font use the bundled Source Han Sans fallback; if a character
is missing from both fonts, export fails with an actionable error instead of
emitting a `.notdef` glyph. Inter is also embedded in full because subsetting
the bundled Inter font can leave a complete ToUnicode map while raster output
loses some glyphs. Open Sans and JetBrains Mono remain subsetted for
numeric-only page numbers, but both primary and fallback fonts are embedded in
full whenever a mixed-font page number is required. The Source Serif 4 and
Source Sans 3 variable fonts are always embedded in full.

## Table of contents

PDF export can insert a `Contents` page between the optional front cover and the
Markdown body. The compiler assigns deterministic `id` and `data-toc-id` anchors
to every heading; H1-H3 are collected into the table of contents while H4-H6
retain anchors without becoming entries. Duplicate heading text receives unique
IDs, and inline links, code, and CJK text are reduced to plain visible heading
text for the entries.

The two built-in presets are `Classic Book`, which uses hierarchy, serif-led
headings, and dotted leaders, and `Modern Technical`, which uses a compact
sans-serif layout with a theme-colored rail. Both presets are generated by the
publication core and inherit the active theme and page size; they do not accept
arbitrary CSS.

When PDF page numbers are enabled, the first print uses fixed-width placeholder
references. The main process then uses `pdfjs-dist` to inspect the printed PDF,
skips the first ordered title sequence belonging to the Contents page, maps the
second ordered sequence to the body, and prints the resolved HTML again. The
second pass is checked against the first pass; missing headings or changed
pagination fail with a `[toc]` error rather than producing misleading page
references. The page-number first-page policy is used for the numeric labels,
while the contents page itself remains part of the PDF page count.

The PDFJS module is loaded lazily because Electron's main process does not
expose browser geometry globals at startup. The locator supplies the minimal 2D
`DOMMatrix` compatibility needed for text extraction and does not enable PDF
canvas rendering.

Interactive preview references are estimates marked with `~`. HTML export
intentionally remains body-only, and a document with no H1-H3 headings does not
receive an empty contents page; it only reports a warning.

## Rendering diagnostics

Development sessions emit structured `[math-render]`, `[mermaid-render]`, and
`[toc]` records to `debug.log`. The KaTeX record reports the stylesheet font URL
form, the browser's font checks for the KaTeX text, math, and delimiter
families, and the computed font family used by rendered glyphs. The Mermaid
record reports the raw and sanitized SVG structure, the raw SVG bounds, and the
final preview or print bounds. TOC records report entry counts, locator passes,
page counts, and pagination failures without logging publication content.

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

Page numbers are applied to the body PDF before cover assembly. Cover pages are
therefore unnumbered, and `{pages}` counts body pages only. HTML export remains
body-only in this milestone.
