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
  fontFamily: source-han-sans
  fontSizePt: 10
  style: normal
  format: '{page} / {pages}'
  firstPageMode: all-pages
covers:
  front: ./cover.png
styleOverrides:
  version: 1
```

The configuration can omit optional fields. Supported theme IDs are `rose`,
`github-markdown`, `modern-serif`, and `claude`; page sizes are `A4` and
`Letter`. `mps describe --json` is authoritative for the full style and
page-number schemas. Relative source, output, and cover paths use the
configuration file's directory. Paths passed directly on the command line use
the current directory.

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
