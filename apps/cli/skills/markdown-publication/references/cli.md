# CLI Configuration and Automation

`publish.yaml` uses this versioned shape:

```yaml
version: 1
source: ./chapters/introduction.md
format: pdf
output: ./dist/introduction.pdf
themeId: rose
pageSize: A4
toc:
  enabled: true
  preset: classic-book
pageNumber:
  enabled: true
  fontFamily: source-sans-3
  fontSizePt: 10
  style: normal
  format: '{page} / {pages}'
  firstPageMode: all-pages
pageLayout:
  enabled: true
  restartBodyAfterToc: false
covers:
  front: ./cover.png
styleOverrides:
  version: 1
```

The configuration can omit optional fields. `mps describe --json` lists the
supported theme IDs; page sizes are `A4` and `Letter`. It is also authoritative
for the full style and page-number schemas. Page-number fonts are limited to the
bundled Latin faces, and page-number formats accept only basic Latin letters,
digits, punctuation, `{page}`, and `{pages}`; CJK page-number text is rejected
because embedding a CJK font would inflate every PDF by tens of megabytes.
`pageLayout.enabled` selects the page-first pipeline, which is the default. Its
folios, page templates, and contents page references are part of the same page
artifact that the desktop preview shows. Set `restartBodyAfterToc: true` to
start main-body page numbers at 1 after the contents section. `\clearpage` on
its own line ends a page, and `\pagetemplate{section}` starts a new page with
the section template; both are ignored inside code and math.

`mps validate --json` reports the finalized page plan under `data.pagination`,
including physical and logical page positions, templates, and folio labels.
Relative source, output, and cover paths use the configuration file's directory.
Paths passed directly on the command line use the current directory.

Useful commands:

```bash
mps doctor --json
mps describe --json
mps validate --config publish.yaml --json
mps build --config publish.yaml --json
mps build ./report.md --format html --output ./dist/report.html --json
mps build ./report.md --format pdf --toc --page-numbers --strict --json
```

The JSON result is the only content written to stdout with `--json`; progress
and human-readable diagnostics use stderr. Exit status `0` means success, `1`
means publication failed, `2` means command or configuration is invalid, `3`
means no compatible desktop runtime is available, `4` means a file operation
failed, `124` means the timeout elapsed, and `130` means the job was cancelled.
HTML does not include PDF-only TOC, page-number, or cover features; it reports a
warning when those features are enabled.

Install for Codex with `mps skill install --agent codex`, for Claude Code with
`mps skill install --agent claude`, or to any compatible skill root with
`mps skill install --dir /path/to/skills`. The project scope option installs
under the current directory. Do not overwrite an edited skill unless `--force`
is supplied.
