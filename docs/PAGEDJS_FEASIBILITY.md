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
  client width. The cause and resulting visual impact are not yet established;
  this fails the plan's no-unexplained-overflow gate.
- The observed layout time alone exceeds the current MCP capture's 15-second
  preview deadline. End-to-end responsiveness, cancellation, and memory were not
  measured.

The input carries the publication CSP and the experiment uses sandboxed Electron
windows. The layout script is injected as trusted application code for this
experiment; the static result is loaded without document scripts. This does not
prove safe integration with every publication asset or the real renderer iframe.

## Remaining P0 work

The mandatory end-to-end acceptance scenario has not been exercised. In
particular, this probe does not include the actual Markdown compiler, Shiki,
KaTeX, Mermaid, local images, imported cover assembly, page templates, folios,
numbered TOC convergence, literal-safe `\\clearpage` parsing, or source mapping.
It also does not compare per-page geometry or extract and compare ordered PDF
text, examine TOC links, measure memory/cancellation, or test Windows/macOS.

Investigate the horizontal overflow and determine whether the engine can
preserve long blocks without clipping. Measure representative small, medium, and
long real publications and implement the seven-point feasibility scenario before
selecting a backend or replacing the existing publication pipeline. A timeout
change alone is not evidence that layout is responsive or cancellable.
