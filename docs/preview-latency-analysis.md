# Preview latency analysis

Date: 2026-11-01

Scope: the desktop preview after a Markdown file opens, and after any change
that rebuilds the paginated artifact (theme, page size, contents, folios,
style).

## Symptom

The loading sheet with the spinner disappears, then the canvas stays blank for
one to two seconds before the document appears. On slower documents the same
blank gap also appears after every theme or contents change.

## Summary

The gap is not the spinner animation ending too early; it is real work that
happens after the build resolves. The preview artifact is a **48-96 MB HTML
document** because every theme font is base64-inlined into it. The renderer
receives that string over IPC and assigns it to a sandboxed `<iframe srcdoc>`,
which must parse and lay out the whole payload before it can paint anything.

Measured on a 3-page sample publication with the default `rose` theme:

| Artifact                                     | Size     | Load in a hidden window | Load via `srcdoc` |
| -------------------------------------------- | -------- | ----------------------- | ----------------- |
| Current artifact                             | 96.2 MiB | 1093-1096 ms            | 3496 ms           |
| Same artifact with font `data:` URLs removed | 181 KiB  | 111 ms                  | 33 ms             |

The `srcdoc` figures include a one-off copy of the string through the test
harness, so treat them as an upper bound; the file comparison isolates the
parse/font cost at roughly 1 s for the artifact alone. In the desktop session
the gap between "layout pass finished" and the first preview probe was **2.1
s**, and the same gap repeated on the next build (2.2 s).

## Measured pipeline

### Desktop session (`debug.log`, AGENTS.md, rose theme, TOC disabled)

| Time   | Event                                      | Delta    |
| ------ | ------------------------------------------ | -------- |
| 41.672 | Markdown selected, preview build starts    |          |
| 42.173 | Layout window starts loading the artifact  | +501 ms  |
| 43.184 | Layout window `did-finish-load`            | +1011 ms |
| 43.230 | Pagination pass finished                   | +46 ms   |
| ~43.3  | IPC resolves, `busy` false, skeleton hides | +70 ms   |
| 45.326 | Preview probe runs after `fonts.ready`     | +2096 ms |

The second build in the same session: `47.456` start -> `48.756` window loaded
(1000 ms) -> `48.815` pass finished -> `51.045` preview probe (+2230 ms).

### Isolated worker render (`examples/sample-book/sample.md`, 3 pages, 1 diagram)

| Time   | Event                                            | Delta    |
| ------ | ------------------------------------------------ | -------- |
| 49.101 | Build starts (compiler warm-up, compile, inline) |          |
| 51.359 | Mermaid SVG rendering finished                   | +2258 ms |
| 51.607 | Layout window starts loading (temp file write)   | +248 ms  |
| 52.642 | Layout window loaded                             | +1035 ms |
| 52.788 | Paged.js engine injected                         | +146 ms  |
| 52.889 | Pagination pass finished                         | +101 ms  |

`examples/sample-book/rendering-diagnostics.md` (4 pages, 4 diagrams) behaves
the same way: 2.28 s before the layout window starts, 1.02 s to load it, 0.09 s
to paginate.

Component measurements on the same machine:

| Operation                                                | Cost            |
| -------------------------------------------------------- | --------------- |
| `createMarkdownCompiler()` (Shiki registry)              | ~2.2 s, once    |
| `compileMarkdownFile()` for `sample.md`                  | ~81 ms          |
| `renderPublicationHtml()` with a 96 MB stylesheet        | ~0 ms (ropes)   |
| First `loadThemeStylesheet()` (read 72 MB fonts, base64) | ~133 ms, cached |
| JSON round trip of a 96 MB string                        | ~106 ms         |

The desktop app warms the compiler at startup, so its pre-layout phase is about
0.5 s; the layout window load and the post-build iframe parse dominate.

## Root causes

### 1. The preview artifact embeds every theme font as base64 (dominant)

`apps/desktop/src/main/services/theme-assets.ts:31` rewrites every `url()` in
theme CSS into a `data:` URL. `theme-service.ts:169` applies it to each theme
stylesheet and `publication-service.ts:197` puts the result into every preview,
layout window, and print document.

The bundled themes reference the two CJK variable fonts directly:

- `themes/fonts/SourceHanSansSC-VF.ttf` - 34 MB
- `themes/fonts/SourceHanSerifSC-VF.ttf` - 57 MB

`rose` is `github.css` + `rose.css`, and **both files declare the same
`Source Han Sans SC` face with the same file**. Base64 of that font is ~45 MB,
so ~90 MB of the 96 MB artifact is the same CJK font embedded twice. Base64 of
all theme fonts yields 48 MB (`github-markdown`) to 81 MB (`classic-book`,
`academic-paper`) per preview.

The dumped artifact confirms the split: 100,841,148 bytes total, of which the
`<style>` content is 100,752,294 bytes (99.9%).

Every stage pays for the payload separately:

1. theme stylesheet string (cached per theme, still concatenated per build),
2. rendered publication HTML (~96 MB string),
3. temp file write and read in `paginated-layout-service.ts:252`,
4. Chromium parse and font decode in the hidden layout window,
5. `document.documentElement.outerHTML` in `paginated-program.ts:319`,
6. `JSON.stringify` wrapping in `paginated-layout-service.ts` `evaluate()`,
7. IPC structured clone of the result (`index.ts:390`),
8. `srcDoc` assignment and a second full parse in the preview iframe.

### 2. The preview swaps to a blank iframe before it can paint

`preview-canvas.tsx:344` renders the iframe as soon as `props.html` is
non-empty, and `App.tsx` clears `busy` in the same commit that sets `html`. The
skeleton and the busy overlay therefore disappear immediately, while the iframe
is still white. `previewReady` (set from `onLoad` + `fonts.ready` in
`preview-canvas.tsx:188`) is only forwarded to MCP; it never gates the UI.

The previous document is also destroyed the moment `srcDoc` changes, so every
theme or contents rebuild shows the same white gap instead of keeping the old
preview until the new one is ready.

### 3. Every build pays for a cold layout window and a temp file

`paginated-layout-service.ts:248` creates a temp directory, writes the full
artifact (`:252`), creates a new hidden `BrowserWindow` (`:253`, `:461`), loads
the file (`:258`), and destroys everything in `finally`. A build with contents
page references may run this up to three times (`:197`).

The 1.0 s load is almost entirely the inlined fonts: the same artifact without
the font payload loads in 111 ms. The 250 ms animation-frame fallback (`:281`)
is a fixed cost when the window does not paint.

### 4. Redundant and uncancelled builds

- `App.tsx:526` compares a five-field request key against the seven-field key
  written at `App.tsx:239`. The guard never matches, so the style panel always
  schedules a full rebuild 250 ms after it opens, and after every style edit.
- `previewSequenceRef` only discards stale responses. Superseded builds keep
  running in the main process and keep creating layout windows;
  `PublicationBuildOptions.signal` is never wired through `preview:build`.
- Rapid theme, page-size, or contents changes start parallel builds instead of
  coalescing into one.
- Every build recompiles Markdown, re-inlines the theme fonts, re-renders, and
  re-paginates. `paginationRevision()` already produces a stable content hash
  but is only used for staleness, never as a cache key.

### 5. No lazy rendering

The artifact contains every page as static HTML. The iframe lays out and paints
all of them, with `box-shadow: 0 12px 40px` on every `.pagedjs_page`
(`paginated-program.ts`). There is no `content-visibility`, no lazy image
decoding, and readiness waits for every image and every font before reporting
the preview ready. Data-URL fonts cannot be deferred, so all theme fonts decode
on first paint.

### 6. Probe and re-render overheads

- `preview-probe.ts:21` joins the text of every `<style>` element (~96 MB) on
  every preview, even in production; only the logging around it is dev-only.
- The probe also walks every KaTeX element with `getComputedStyle`.
- `preview-canvas.tsx` updates React state on every scroll event, and
  `reportViewMetrics` serializes metrics each time, re-rendering the workspace.
- The busy overlay uses `backdrop-filter: blur(4px)` over the preview while a
  rebuild runs.

## Optimization plan

### P0 - stop shipping fonts inside the preview artifact

1. Add an asset profile to the stylesheet loader:
   `loadThemeStylesheet(themeId, overrides, { assets: 'inline' | 'url' })`.
   Preview and layout use `url`; HTML export and PDF keep `inline`.
2. Register a privileged standard scheme (for example `mps-asset:`) before
   `app.whenReady()`, serve `themes/` through `protocol.handle`, enforce
   containment like `isWithinRoot`, set mime types, and add immutable cache
   headers so Chromium reuses decoded fonts across rebuilds.
3. Extend the artifact CSP for the preview profile
   (`font-src mps-asset:; img-src data: mps-asset:`); the export profile keeps
   the current self-contained policy.
4. Deduplicate assets while inlining for export: base64 each file once and emit
   one `@font-face` per family/weight/style. This alone halves the current
   `rose` payload.
5. Serve the KaTeX woff2 files from the same scheme for the preview profile.

Expected: preview artifact 96 MB -> ~0.2 MB for the sample (a few MB for
image-heavy books); layout window load 1.0 s -> ~0.1 s; post-build blank gap 2.1
s -> under 0.2 s.

### P1 - never show a blank sheet

- Keep the skeleton or the previous document until the new iframe has painted:
  swap on `onLoad` + two animation frames (+ `fonts.ready` for the visible
  pages), not on the `html` state change.
- Drive a `painted` flag from the iframe and use it for the skeleton, the busy
  overlay, and `Preview ready`.
- Cross-fade (about 150 ms) and keep the old document until the new one is
  ready. Double-buffering two iframes is enough.

### P1 - make the build path incremental

- Reuse one hidden layout window and the injected engine across passes and
  builds; navigate only when the artifact revision changes.
- Keep the serialized artifact in a bounded on-disk cache keyed by
  `paginationRevision()`; serve it to the preview and to printing and reuse it
  for repeated settings. Return a revision or URL from `preview:build` instead
  of the full HTML string.
- Cache compiled chapters by source path + mtime + feature options, and rendered
  HTML by (chapter, theme, style, contents). Page layout and folio changes only
  need a new pagination pass.
- Send a request id with `preview:build`, abort the previous build, and drop
  queued duplicates by request key.
- Fix the style-panel key mismatch (`App.tsx:526`) and compare the complete
  request key.
- Coalesce quick changes into a single in-flight build with a trailing debounce.

Expected: repeated theme/contents/style changes drop from 3.5-4 s to roughly
0.3-0.6 s once the artifact cache is warm.

### P2 - lazy rendering

- Add `content-visibility: auto` and
  `contain-intrinsic-size: <pageW>px <pageH>px` to `.pagedjs_page`, and reduce
  per-page shadows so offscreen pages are skipped.
- Use `loading="lazy"` and `decoding="async"` on publication images once assets
  are external, and do not wait for below-the-fold images before painting.
- Consider `unicode-range` subsets and woff2 delivery for the CJK faces.
- Run the rendering probes after the first paint (or only in debug builds), skip
  the stylesheet join outside debug, and skip the math walk when no `.katex`
  element exists.
- Throttle scroll-state updates to animation frames; consider moving MCP
  snapshot reporting out of the render path.
- If documents grow further, a `WebContentsView`-based preview or a virtualized
  page list removes the single-document parse entirely.

## Expected effect

| Stage                                   | Now        | After P0   | After P1 (warm) |
| --------------------------------------- | ---------- | ---------- | --------------- |
| Build in main (layout window)           | ~1.2-3.8 s | ~0.3-1.2 s | ~0.2-0.4 s      |
| IPC + iframe parse + first paint        | ~1.5-2.5 s | ~0.1-0.3 s | ~0.1-0.2 s      |
| Visible blank gap after the spinner     | 1-2 s      | <0.2 s     | <0.1 s          |
| Repeated setting change (warm)          | 3.5-4 s    | ~1 s       | ~0.3-0.6 s      |
| Preview memory (HTML strings in flight) | 300-600 MB | <50 MB     | <50 MB          |

The reference timings in `docs/RENDERING.md` (4-5 s for a two-page sample)
should be re-measured and updated after P0.

## Implemented changes and measured results

The P0-P2 plan above is implemented. Measured on the same macOS workstation with
the same sample publication:

| Metric                                   | Before       | After                     |
| ---------------------------------------- | ------------ | ------------------------- |
| Preview artifact (sample)                | 96.2 MiB     | 0.41 MiB                  |
| Preview artifact with one embedded image | 96 MiB       | 2.1 MiB                   |
| Layout window load                       | 1010-1035 ms | 104-228 ms                |
| Layout window: resources/engine/program  | ~30 ms       | ~15 ms                    |
| Layout pass                              | ~100 ms      | ~100 ms                   |
| Layout call (one build)                  | 1.2-3.8 s    | 0.18-0.23 s               |
| `srcdoc` injection to painted frame      | ~3496 ms     | 44 ms (108 ms at 2.1 MiB) |
| File selected to preview artifact ready  | ~3.6 s       | ~0.55 s                   |
| Repeat request with identical settings   | ~3.5 s       | prepared hit, layout hit  |

What changed:

- `theme-assets.ts` serves theme files through `mps-asset://theme/...` for the
  preview profile while keeping data-URL embedding for exports, and
  `dedupeFontFaces` removes repeated declarations (the `rose` theme embedded the
  same 34 MB CJK face twice).
- `theme-asset-protocol.ts` registers a standard, secure, CORS-enabled scheme
  and serves `themes/` with containment checks and immutable cache headers.
- `publication-core` accepts `assetOrigin`, emits it in the artifact CSP, and
  only includes the KaTeX stylesheet when the chapters contain rendered math.
- `PublicationService` caches prepared publications by source revision and
  settings, and aborts stale builds through the IPC signal.
- `PaginatedLayoutService` caches artifacts by `paginationRevision`, writes one
  temporary file per layout call, and reuses one hidden window across
  convergence passes.
- The preview keeps an opaque skeleton until the new iframe has painted,
  throttles scroll metrics to animation frames, and runs rendering probes after
  the first paint.
- The artifact applies screen-only `content-visibility: auto` to page boxes so
  offscreen pages skip layout and paint; print stays unaffected.
- `App.tsx` deduplicates request keys, fixes the style-inspector key mismatch,
  and resets the key when a document opens or closes.

Deferred on purpose: external content images, font subsetting or WOFF2
conversion, `WebContentsView`-based preview, and serving the preview artifact
itself from a custom scheme (the preview still uses `srcdoc` so the renderer can
keep measuring and scrolling the same-origin document).

```bash
# Dump the paginated artifact for a sample publication.
MPS_LAYOUT_DUMP_DIR=/tmp/mpsdump \
  ./node_modules/.bin/electron . --mps-worker /tmp/mpsreq/req.json

ls -l /tmp/mpsdump/artifact-*.html
rg -c 'data:font/' /tmp/mpsdump/artifact-*.html
```

Build a request file with `{"command":"validate", ...}` (see
`scripts/check-page-first-publication.mjs`) to run the real pipeline without
writing a PDF. Stage timings are in `debug.log` (`[layout]` records) when
`MARKDOWN_PUBLICATION_DEV_LOG=1` is set.
