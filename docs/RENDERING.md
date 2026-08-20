# Rendering pipeline

The publication pipeline produces one static HTML document for preview, HTML
export, and PDF printing.

```text
Markdown
  -> markdown-it tokenization
  -> Shiki code highlighting
  -> KaTeX formula rendering
  -> safe static HTML filtering
  -> project-relative asset embedding
  -> Mermaid placeholder extraction
  -> isolated Chromium Mermaid SVG rendering
  -> static publication HTML
  -> preview / HTML export / printToPDF
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

## Readiness and printing

The print backend waits for fonts and images, verifies that no Mermaid
placeholder remains, sets the explicit `publication-render-ready` marker, and
then calls Electron Chromium with `printBackground: true` and
`preferCSSPageSize: true`. Fixed delays are not used for synchronization.

## Rendering diagnostics

Development sessions emit structured `[math-render]` and `[mermaid-render]`
records to `debug.log`. The KaTeX record reports the stylesheet font URL form,
the browser's font checks for the KaTeX text, math, and delimiter families, and
the computed font family used by rendered glyphs. The Mermaid record reports the
raw and sanitized SVG structure, the raw SVG bounds, and the final preview or
print bounds.

Use the canonical fixture at `examples/sample-book/rendering-diagnostics.md`,
then inspect only rendering records after reproducing the issue:

```bash
pnpm dev
rg '\[(math-render|mermaid-render)\]' debug.log > rendering-debug.log
```

The debug report is intentionally enabled only for development sessions or when
`MARKDOWN_PUBLICATION_RENDER_DEBUG=1` is set.
