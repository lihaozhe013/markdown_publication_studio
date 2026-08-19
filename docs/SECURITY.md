# Security notes

The first vertical slice keeps the renderer browser-sandboxed and exposes only
three narrow preload operations: open one Markdown file, build a preview, and
start a PDF export.

- Renderer code has no filesystem or Node.js access.
- IPC payloads are validated with Zod before privileged work begins.
- Theme selection accepts only the three bundled theme IDs. Theme CSS and its
  bundled fonts are loaded by the main process and inlined before reaching the
  preview or print window; arbitrary renderer-supplied stylesheet paths are not
  supported.
- Markdown HTML is disabled in `markdown-it`; generated publication HTML
  contains no publication-supplied scripts.
- Local images are resolved relative to the selected Markdown file and embedded
  as data URLs only when they stay inside that project root.
- PDF output is rendered in a separate hidden `BrowserWindow` with
  `nodeIntegration: false`, `contextIsolation: true`, and `sandbox: true`.
- The print window denies new windows and unrestricted navigation.
- AI credentials and AI provider code are not part of this milestone.

The asset policy and project-root model will be expanded with the publication
manifest milestone.
