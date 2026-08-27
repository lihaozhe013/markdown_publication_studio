# Security notes

The first vertical slice keeps the renderer browser-sandboxed and exposes only
narrow, typed preload operations for settings, opening one Markdown file,
building a preview, and starting an export.

- Renderer code has no filesystem or Node.js access.
- IPC payloads are validated with Zod before privileged work begins.
- Theme selection accepts only the three bundled theme IDs. Theme CSS and its
  bundled fonts are loaded by the main process and inlined before reaching the
  preview or print window; arbitrary renderer-supplied stylesheet paths are not
  supported.
- Advanced styles are structured values validated by Zod. The renderer cannot
  submit arbitrary CSS selectors, declarations, URLs, imports, scripts, or font
  paths. The main process generates the fixed-selector override stylesheet from
  the validated values and only approved bundled fonts can be selected.
- Page-number fonts are selected from an application-owned allow-list of bundled
  font assets. The page-number format accepts only `{page}` and `{pages}`
  placeholders and is validated before entering the main-process PDF
  post-processing stage. Page-number fonts never enter the interactive preview
  or HTML export.
- Markdown HTML uses a safe-static allow-list. Scripts, event handlers,
  `javascript:` URLs, iframes, embeds, `foreignObject`, and unsafe CSS are
  removed before publication HTML is returned.
- Mermaid diagrams are rendered by application-owned code in a separate hidden
  Chromium window with strict Mermaid security settings. DOMPurify uses its SVG
  and SVG-filter profiles, then a second policy pass restricts `foreignObject`
  labels to static text containers and rejects external references. The
  resulting SVG is sanitized and the final publication contains no Mermaid
  runtime script.
- KaTeX output is generated statically in the publication core and its CSS and
  fonts are embedded into the generated document.
- Relative local images are resolved relative to the selected Markdown file and
  embedded as data URLs only when they stay inside that project root.
- Absolute filesystem image references are read and embedded as data URLs after
  the user selects the Markdown file through the native file dialog. This is an
  explicit product authorization for external local assets, but it means users
  should not open untrusted Markdown files because their image references may
  read arbitrary local files.
- PDF output is rendered in a separate hidden `BrowserWindow` with
  `nodeIntegration: false`, `contextIsolation: true`, and `sandbox: true`.
- Page-number PDF post-processing runs in the main process after Chromium
  printing and never exposes PDF or font filesystem access to the renderer.
- Cover and back-cover assets are selected through a native file dialog and are
  represented in the renderer by opaque in-memory handles. The main process
  re-reads and validates each asset immediately before assembly. Only PNG, JPEG,
  and single-page PDF assets are accepted; cover PDFs are checked for rotation
  and exact A4/Letter page dimensions before their pages are copied.
- The print window denies new windows and unrestricted navigation.
- AI credentials and AI provider code are not part of this milestone.

Local publication images are embedded as data URLs. Relative references remain
project-relative, while authorized absolute filesystem references may point
outside the project root. External media is not permitted by the generated
document CSP; ordinary HTTP(S)/mailto links remain supported.
