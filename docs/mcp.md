# Desktop MCP and AI Connection

Markdown Publication Studio includes a local MCP server in the desktop
application. It uses the application's bundled Electron runtime, so MCP clients
do not need Node.js or a separate CLI installation. The server communicates over
stdio; all protocol messages use stdout and application logs use the normal log
service.

## Connect an agent

Open **Connect AI** from the toolbar or **Help → Connect AI**. Choose
**Configure agent** to copy a prompt for persistent client configuration, or
**One-time use** to copy a prompt for a temporary task connection. The dialog
refreshes the executable path and shows the command, arguments, version, launch
availability, connection JSON, and GUI diagnostics.

The generic launch object is:

```json
{
  "command": "/absolute/path/to/Markdown Publication Studio",
  "args": ["--mps-mcp"]
}
```

Development builds use the Electron executable with the application directory
before `--mps-mcp`. Linux AppImage launches use the outer `.AppImage` path.
Clients with persistent MCP configuration usually map this to a server entry
such as:

```json
{
  "mcpServers": {
    "markdown-publication-studio": {
      "command": "/absolute/path/to/Markdown Publication Studio",
      "args": ["--mps-mcp"]
    }
  }
}
```

Client configuration formats vary. The setup prompt asks the agent to preserve
existing configuration, skip an identical entry, and ask before replacing a
conflicting entry. Setup verification calls only `publication_describe` and
`session_list`; it does not open a document or write an export. The dialog
reports local executable availability, not whether the client successfully
connected.

For one-time use, the prompt asks the agent to use the client's temporary-server
capability when available, or an MCP SDK already installed in the environment. A
temporary Python standard-library stdio client is the fallback. The same process
should remain connected for the whole task, including job polling, and then
close. The prompt forbids persistent configuration changes and package
installation.

## Tools

### File publication

These tools run isolated desktop workers and do not open the GUI or use
GUI-global settings.

- `publication_describe` returns the application version, supported themes and
  page sizes, configuration schema, and tool descriptions. It does not read a
  document.
- `publication_validate` accepts an absolute `sourcePath` or `configPath` plus
  optional publication settings. It returns a `jobId`.
- `publication_export` accepts the same inputs plus an absolute `outputPath`,
  `format` (`pdf` or `html`), and optional `overwrite` flag. The default is
  `false`.
- `job_get` and `job_cancel` query or cooperatively cancel a file task by
  `jobId`.

Poll `job_get` until it returns a final status. Results contain diagnostics, any
error, and the completed output path. The worker timeout is 120 seconds. A
cancelled or disconnected write is never replayed automatically.

### GUI publication session

`session_list` discovers compatible running windows without starting or focusing
the GUI. `session_open` reuses a single compatible session, asks the caller to
select when multiple sessions exist, or launches the installed GUI when none is
running. Other session tools never start the GUI.

Session tools include `session_get_state`, `session_document`, `session_update`,
`session_save_settings`, `session_export`, `session_view`, and
`session_capture`. Every state-changing operation includes `sessionId` and the
`revision` returned by `session_get_state`. A stale revision returns
`state_conflict`; the agent must read current state and decide what to do next.
An update only changes the current session. `session_save_settings` is the
explicit operation for saving page-number or style defaults globally.

Document replacement or close requires `discardChanges: true` when a style draft
is dirty. Cover paths must be absolute and are validated by the desktop
application. GUI exports freeze the selected session revision and its effective,
possibly unsaved, style and cover settings. Use `job_get` or `job_cancel` with
both `sessionId` and `jobId` for a GUI export.

`session_view` adjusts preview zoom, vertical scroll, or a matching heading.
`session_capture` returns a PNG for the preview viewport or application content
window after the requested revision's preview, fonts, images, and layout are
ready. This is a continuous-preview image; PDF output remains authoritative for
final pagination. Preview capture times out after 15 seconds if resources do not
become ready.

## Paths and output safety

MCP file paths supplied directly to tools must be absolute. Paths inside YAML
configuration remain relative to that configuration file, and Markdown image
paths remain relative to the Markdown source. Explicit MCP options take
precedence over YAML; omitted fields use the existing publication defaults. HTML
output stays body-only; PDF-only TOC, cover, and page-number settings produce
diagnostics when ignored.

Outputs do not replace the source, configuration, or cover assets, including
when `overwrite: true`. Existing output files are preserved by default, and
writes use the desktop worker's atomic output path. File workers use isolated
temporary user-data directories. The MCP service does not provide arbitrary
shell, JavaScript, DOM, or generic mouse/keyboard tools.

The GUI bridge binds only to `127.0.0.1` on a random port. A random bearer token
is stored in an owner-only session manifest under the application data
directory; it is never included in prompts or logs. The bridge checks its
protocol version and limits request bodies. Closing the GUI removes its manifest
and cancels its GUI-owned jobs. MCP-owned file jobs are cleaned up when the
stdio connection closes.

Linux rendering and screenshots require an available graphical session. The
desktop application does not promise screenshot or rendering support in a
headless environment without a virtual display.

## Linux package verification

After `pnpm build:linux`, exercise the actual AppImage GUI with:

```sh
node scripts/check-packaged-gui.mjs release/Markdown-Publication-Studio-linux-0.1.0.AppImage
```

The check uses isolated application settings, verifies the initial GUI session
snapshot, opens Connect AI, and opens a Markdown document through the bridge
until its preview is ready. It requires an available graphical session and
closes its application processes afterward. This complements the stdio check,
which does not initialize the GUI or publish renderer snapshots.
