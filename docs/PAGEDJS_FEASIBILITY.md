# Paged.js preliminary feasibility probe

This is an incomplete P0 investigation for
[the page-first plan](PAGE_FIRST_PUBLICATION_PLAN.md). It is not an engine
selection, a production implementation, or a passing P0 gate.

## Reproduction

The probe requires the existing Electron runtime, Poppler `pdfinfo` and
`pdftotext`, and a separately downloaded Paged.js browser bundle. It does not
install a dependency or copy third-party code into this repository.

```sh
mkdir -p /tmp/mps-paged-spike
curl -fsSL https://registry.npmjs.org/pagedjs/-/pagedjs-0.4.3.tgz \
  -o /tmp/mps-paged-spike/pagedjs.tgz
printf '%s  %s\n' \
  a79baaa94d15cf952e6327950fa886ba7533bdce92194b677d9d1b4cce6c17c5 \
  /tmp/mps-paged-spike/pagedjs.tgz | sha256sum -c -
tar -xzf /tmp/mps-paged-spike/pagedjs.tgz -C /tmp/mps-paged-spike
MPS_PAGEDJS_BUNDLE=/tmp/mps-paged-spike/package/dist/paged.js \
  pnpm exec electron scripts/check-pagedjs-feasibility.cjs
```

The published Paged.js 0.4.3 package declares the MIT license and dependencies
on `@babel/polyfill`, `@babel/runtime`, `clear-cut`, `css-tree`, and
`event-emitter`. The evaluated unminified browser bundle is 900 KiB; its SHA-256
is `4cae0c875c89084b353ceee87bcc742388de3133f2bbf48830b63f1d2d357e4f`. The
browser bundle is supplied only for the experiment, not installed or integrated
into the application.

## Observations

A run on Linux x86_64, eight logical CPUs, 15 GiB RAM, Electron 43.4.0 and
Chromium 150.0.7871.224 produced these results:

- One manually constructed HTML fixture used the repository's Claude theme CSS,
  an A4 page, 70 mixed CJK/English paragraphs, a forced CSS break, an 85-row
  table, and a 110-line synthetic code block.
- The engine produced 21 pages in 17.4 seconds. Two earlier runs measured 16.4
  and 17.4 seconds. These are observations, not a performance budget.
- A static serialization loaded in a second sandboxed window retained 21 page
  elements and the target heading on page 16. Both initial and serialized PDFs
  reported 21 A4 pages.
- Extracted PDF text included each numbered table row, the last synthetic code
  line, and the end marker. This is a limited presence check, not proof of full
  ordered content preservation, correct colors, complete links, or correct
  visual rendering.
- Page 16's measured content scroll width was 2466 pixels versus a 673-pixel
  client width. The excess belongs to a Paged.js-generated wrapper; its chapter
  and table descendants each measured approximately 673 pixels wide. A visual
  inspection of that table page showed no obvious clipping. The wrapper needs a
  deliberate validation rule rather than an assumption that all scroll-width
  excess indicates visible overflow.
- Table continuation pages 17–20 lacked the original header. The stable release
  also collapsed multiple code lines onto single visual lines after splitting a
  long code block: PDF text extraction found 29 such merged lines. The last code
  token being present is therefore insufficient to establish code preservation.
- The observed layout time alone exceeds the current MCP capture's 15-second
  preview deadline. End-to-end responsiveness, cancellation, and memory were not
  measured.

A second run using the published `0.5.0-beta.2` bundle produced 24 pages in 20.4
seconds. It preserved synthetic code line separation but still omitted
continuation table headers on pages 17–20. Its archive SHA-256 is
`5537947d453920f1171c65fd74911075507ef429090034ba5d9c37bd434f70c2`. The beta
remains unselected and requires the same safety and fixture validation.

An experimental beta-only hook can be enabled with `MPS_REPEAT_TABLE_HEADERS=1`.
It replaces the engine's collapsed continuation headers during overflow
insertion, before layout is checked. In the synthetic fixture, PDF extraction
then found all 85 table rows and 110 code lines in order, with a visible table
header on every table page. The 24 static page texts, page sizes, and extracted
PDF text also matched before and after serialization. This is an encouraging
result for one fixture, not a general correctness or accessibility guarantee:
merged cells, nested tables, oversized rows, inline header styles, links, and
real compiled documents still need tests. The hook is only part of the probe and
is not a production dependency or selected backend.

The input carries the publication CSP and the experiment uses sandboxed Electron
windows. The layout script is injected as trusted application code for this
experiment; the static result is loaded without document scripts. This does not
prove safe integration with every publication asset or the real renderer iframe.

## Real publication experiments

The optional fixture test
`apps/desktop/src/main/services/paged-probe-fixture.test.ts` compiles the
repository's sample Markdown, KaTeX, Shiki, TOC, local SVG, and Mermaid
placeholder with embedded fonts and theme assets. The probe optionally runs the
built application's isolated Mermaid renderer before layout. The
`MPS_PAGED_LONG_TOC=1` fixture adds 40 headings, mixed CJK prose, a source-level
`\clearpage`, an 85-row table, and a 110-line highlighted code block. Its HTML
is approximately 80 MiB because it contains the existing embedded font assets.

Passing the complete embedded CSS to the beta engine exceeded three minutes in
one attempt. With `MPS_PAGED_FAST_STYLES=1`, the probe retains the original
theme and font CSS in the document but passes only explicit pagination rules to
the engine. This finished the long Claude/A4 fixture in approximately 23.4
seconds. Without `MPS_PAGED_NORMALIZE_STYLES=1`, screen and print geometry
differed; normalizing the existing screen-only chapter and TOC padding made the
measured geometry identical for the tested fixture. That normalization is
experimental, not a generic proof for every theme, CSS rule, or size.

With the repeat-header hook, anchored-heading restoration, reserved TOC labels,
experimental folios, and whole-sheet colors enabled, the long Claude/A4 fixture
produced 22 generated pages, including three TOC pages. It retained the Mermaid
SVG and local image, split the table with headers, preserved the numbered table
rows and code lines in extracted order, and placed the heading after
`\clearpage` at the top of page 15. All 44 TOC anchors had one destination. A
front cover inserted into the existing body PDF produced 23 pages and kept all
44 named destinations and link annotations. The static page text and sizes,
extracted PDF text, and selected screen/print element geometry matched.

At an experimental 16pt body size the same fixture produced 26 pages, updated 34
TOC labels, retained all destinations after cover insertion, and matched the
same measured geometry and text checks. A GitHub/Letter run produced 20 pages
and passed the same targeted checks. Page backgrounds and folios were visibly
present in a manually inspected PDF, but are not yet covered by automated color
and font-fidelity assertions. The reserved TOC labels did not change link-box
geometry in these runs; a fixed-width field does not replace general bounded
convergence or a policy for very large labels.

Destroying the sandboxed layout window after one second stopped a long layout in
approximately 1005ms in one run. This verifies that the main process can
interrupt this experimental renderer; it is not a production cancellation,
resource-leak, memory, or responsiveness benchmark. The 15-second MCP preview
limit remains shorter than the observed long-document layout time.

For example, after `pnpm build`, generate and run the long fixture with:

```sh
MPS_PAGED_LONG_TOC=1 MPS_PAGED_FIXTURE_PATH=/tmp/paged-long.html \
  pnpm exec vitest run apps/desktop/src/main/services/paged-probe-fixture.test.ts
MPS_PAGED_RENDER_MERMAID=1 MPS_PAGED_INCLUDE_COVER=1 \
  MPS_PAGED_RESTART_BODY=1 MPS_PAGED_DECORATE=1 MPS_PAGED_RESTORE_ANCHORS=1 \
  MPS_PAGED_NORMALIZE_STYLES=1 MPS_PAGED_FAST_STYLES=1 \
  MPS_PAGED_FIXTURE_PATH=/tmp/paged-long.html MPS_REPEAT_TABLE_HEADERS=1 \
  MPS_PAGEDJS_BUNDLE=/tmp/mps-paged-beta/package/dist/paged.js \
  pnpm exec electron scripts/check-pagedjs-feasibility.cjs
```

## Remaining P0 work

The fixture-specific experiment still requires automated visual/furniture and
full ordered-source checks, more fragmentation cases, general TOC convergence,
real imported cover assets, security validation, and proper memory and
cancellation measurements. Check all themes, both page sizes, and other
platforms before claiming compatibility. The tested bundle is still unselected;
no paginated preview or shared PDF pipeline has been integrated. A timeout
change alone is not evidence that production layout is responsive or
cancellable.
