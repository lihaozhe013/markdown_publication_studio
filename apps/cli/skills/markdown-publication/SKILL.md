---
name: markdown-publication
description:
  Publish Markdown files to styled PDF or HTML with Markdown Publication Studio.
  Use when an agent needs a reproducible local export, publication
  configuration, diagnostics, or an installed studio runtime.
---

# Markdown Publication Studio

Use the `mps` command to validate and publish Markdown with the project's shared
themes, typography, math, Mermaid rendering, and PDF assembly.

Run `mps doctor --json` when the studio runtime may be missing or outdated. Run
`mps describe --json` to inspect the supported configuration and option values.
Use `mps validate --config publish.yaml --json` when the source or configuration
should be checked before export. Publish with
`mps build --config publish.yaml --json`, or pass a Markdown file directly with
`mps build file.md --format pdf --json`.

Check the exit code, top-level `ok` field, `diagnostics`, and `data.outputPath`
in JSON results. Resolve configuration paths relative to `publish.yaml`. A build
refuses to replace an existing file unless `--force` is supplied. Use `--strict`
when any warning should fail the command.

Read [the configuration and automation reference](references/cli.md) when
creating a `publish.yaml`, selecting PDF settings, installing this skill for
another agent, or handling a CLI failure.
