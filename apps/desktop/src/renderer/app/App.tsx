import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BUILT_IN_THEMES,
  DEFAULT_PAGE_SIZE,
  DEFAULT_PAGE_NUMBER_SETTINGS,
  DEFAULT_PUBLICATION_STYLE_OVERRIDES,
  PageNumberFirstPageModeSchema,
  PageNumberFontIdSchema,
  PageNumberSettingsSchema,
  PageNumberStyleSchema,
  PublicationStyleOverridesSchema,
  ThemeIdSchema,
  type CoverSelection,
  type PublicationDiagnostic,
  type PublicationStyleOverrides,
  type PageNumberFontId,
  type PageNumberSettings,
  type PageSizeId,
  type ThemeId,
} from '@markdown-publication/shared';
import { AdvancedStylePanel } from './advanced-style-panel.js';
import {
  PublicationFormatControls,
  coverSlotLabels,
  getCoverSizeError,
  type CoverSlot,
} from './publication-format-controls.js';
import { probePreviewRendering } from './preview-probe.js';

const pageNumberFonts: readonly { id: PageNumberFontId; name: string }[] = [
  { id: 'inter', name: 'Inter' },
  { id: 'open-sans', name: 'Open Sans' },
  { id: 'source-han-sans', name: 'Source Han Sans SC' },
  { id: 'jetbrains-mono', name: 'JetBrains Mono' },
  { id: 'source-sans-3', name: 'Source Sans 3' },
  { id: 'source-serif-4', name: 'Source Serif 4' },
  { id: 'source-han-serif', name: 'Source Han Serif SC' },
];

function hasStyleValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value !== 'object') return true;
  return Object.values(value).some(hasStyleValue);
}

function hasStyleOverrides(style: PublicationStyleOverrides): boolean {
  return Object.entries(style).some(
    ([key, value]) => key !== 'version' && hasStyleValue(value),
  );
}

export function App(): React.JSX.Element {
  const [source, setSource] = useState<{ path: string; name: string } | null>(
    null,
  );
  const [title, setTitle] = useState('No publication loaded');
  const [html, setHtml] = useState('');
  const [diagnostics, setDiagnostics] = useState<PublicationDiagnostic[]>([]);
  const [themeId, setThemeId] = useState<ThemeId>('rose');
  const [pageSize, setPageSize] = useState<PageSizeId>(DEFAULT_PAGE_SIZE);
  const [covers, setCovers] = useState<CoverSelection>({});
  const [pageNumber, setPageNumber] = useState<PageNumberSettings>({
    ...DEFAULT_PAGE_NUMBER_SETTINGS,
  });
  const [customStyle, setCustomStyle] = useState<PublicationStyleOverrides>({
    ...DEFAULT_PUBLICATION_STYLE_OVERRIDES,
  });
  const [styleDraft, setStyleDraft] = useState<PublicationStyleOverrides>({
    ...DEFAULT_PUBLICATION_STYLE_OVERRIDES,
  });
  const [pageNumberError, setPageNumberError] = useState('');
  const [styleError, setStyleError] = useState('');
  const [stylePanelOpen, setStylePanelOpen] = useState(false);
  const [styleSaving, setStyleSaving] = useState(false);
  const [settingsReady, setSettingsReady] = useState(false);
  const [status, setStatus] = useState('Choose a Markdown file to begin.');
  const [busy, setBusy] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const dragDepthRef = useRef(0);
  const previewFrameRef = useRef<HTMLIFrameElement | null>(null);
  const previewSequenceRef = useRef(0);

  const styleDirty = JSON.stringify(styleDraft) !== JSON.stringify(customStyle);
  const effectiveStyle = stylePanelOpen ? styleDraft : customStyle;
  const customStyleActive = hasStyleOverrides(customStyle);
  const coverSizeError = getCoverSizeError(covers, pageSize);

  useEffect(() => {
    let mounted = true;
    const settingsApi = window.desktopApi?.settings;
    if (!settingsApi) {
      setSettingsReady(true);
      return undefined;
    }

    void Promise.all([
      settingsApi.getPageNumber(),
      settingsApi.getCustomStyle(),
    ])
      .then(([loadedPageNumber, loadedStyle]) => {
        if (!mounted) return;
        setPageNumber(loadedPageNumber);
        setCustomStyle(loadedStyle);
        setStyleDraft(loadedStyle);
        setSettingsReady(true);
      })
      .catch((error: unknown) => {
        if (!mounted) return;
        setSettingsReady(true);
        setStatus(
          error instanceof Error
            ? `Could not load application settings: ${error.message}`
            : 'Could not load application settings.',
        );
      });
    return () => {
      mounted = false;
    };
  }, []);

  const refreshPreview = useCallback(async function refreshPreview(
    path: string,
    selectedTheme: ThemeId,
    selectedPageSize: PageSizeId,
    selectedStyle: PublicationStyleOverrides,
  ): Promise<void> {
    const sequence = ++previewSequenceRef.current;
    setBusy(true);
    setStatus('Rendering preview…');
    try {
      const result = await window.desktopApi.preview.build({
        sourcePath: path,
        themeId: selectedTheme,
        pageSize: selectedPageSize,
        styleOverrides: selectedStyle,
      });
      if (sequence !== previewSequenceRef.current) return;
      setTitle(result.title);
      setHtml(result.html);
      setDiagnostics(result.diagnostics);
      setStatus('Preview ready.');
    } catch (error) {
      if (sequence !== previewSequenceRef.current) return;
      setStatus(error instanceof Error ? error.message : 'Preview failed.');
    } finally {
      if (sequence === previewSequenceRef.current) setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!stylePanelOpen || !styleDirty || !source) return undefined;
    const timer = window.setTimeout(() => {
      void refreshPreview(source.path, themeId, pageSize, styleDraft);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [
    pageSize,
    refreshPreview,
    source,
    styleDirty,
    styleDraft,
    stylePanelOpen,
    themeId,
  ]);

  async function commitPageNumberSettings(
    nextSettings: PageNumberSettings,
  ): Promise<void> {
    const parsed = PageNumberSettingsSchema.safeParse(nextSettings);
    if (!parsed.success) {
      setPageNumberError(
        parsed.error.issues[0]?.message ?? 'Invalid page number settings.',
      );
      return;
    }

    setPageNumberError('');
    try {
      const saved = await window.desktopApi.settings.savePageNumber(
        parsed.data,
      );
      setPageNumber(saved);
    } catch (error) {
      setStatus(
        error instanceof Error
          ? `Could not save page number settings: ${error.message}`
          : 'Could not save page number settings.',
      );
    }
  }

  function updatePageNumberField<K extends keyof PageNumberSettings>(
    key: K,
    value: PageNumberSettings[K],
  ): void {
    const nextSettings = { ...pageNumber, [key]: value };
    setPageNumber(nextSettings);
    void commitPageNumberSettings(nextSettings);
  }

  function openStylePanel(): void {
    setStyleDraft(customStyle);
    setStyleError('');
    setStylePanelOpen(true);
  }

  function updateStyleDraft(nextStyle: PublicationStyleOverrides): void {
    const parsed = PublicationStyleOverridesSchema.safeParse(nextStyle);
    if (!parsed.success) {
      setStyleError(
        parsed.error.issues[0]?.message ?? 'Invalid style settings.',
      );
      return;
    }
    setStyleError('');
    setStyleDraft(parsed.data);
  }

  async function applyStyleDraft(): Promise<void> {
    const parsed = PublicationStyleOverridesSchema.safeParse(styleDraft);
    if (!parsed.success) {
      setStyleError(
        parsed.error.issues[0]?.message ?? 'Invalid style settings.',
      );
      return;
    }
    setStyleSaving(true);
    setStyleError('');
    try {
      const saved = await window.desktopApi.settings.saveCustomStyle(
        parsed.data,
      );
      setCustomStyle(saved);
      setStyleDraft(saved);
      setStylePanelOpen(false);
      setStatus('Advanced styles saved.');
      if (source) {
        void refreshPreview(source.path, themeId, pageSize, saved);
      }
    } catch (error) {
      setStyleError(
        error instanceof Error
          ? `Could not save advanced styles: ${error.message}`
          : 'Could not save advanced styles.',
      );
    } finally {
      setStyleSaving(false);
    }
  }

  function cancelStyleDraft(): void {
    setStyleDraft(customStyle);
    setStyleError('');
    setStylePanelOpen(false);
    if (source) {
      void refreshPreview(source.path, themeId, pageSize, customStyle);
    }
  }

  function resetStyleDraft(): void {
    setStyleError('');
    setStyleDraft({ ...DEFAULT_PUBLICATION_STYLE_OVERRIDES });
  }

  function updatePageSize(nextPageSize: PageSizeId): void {
    setPageSize(nextPageSize);
    if (source) {
      void refreshPreview(source.path, themeId, nextPageSize, effectiveStyle);
    }
  }

  async function chooseCoverAsset(slot: CoverSlot): Promise<void> {
    setBusy(true);
    setStatus(`Choosing ${coverSlotLabels[slot].toLowerCase()}…`);
    console.info('[cover] Cover asset selection requested.', { slot });
    try {
      if (!window.desktopApi?.project?.chooseCoverAsset) {
        throw new Error(
          'The desktop bridge is unavailable. Restart the application after building it.',
        );
      }
      const selected = await window.desktopApi.project.chooseCoverAsset();
      if (!selected) {
        setStatus('Cover selection cancelled.');
        return;
      }
      setCovers((current) => ({ ...current, [slot]: selected }));
      setStatus(`${coverSlotLabels[slot]} selected.`);
      console.info('[cover] Cover asset selected.', {
        slot,
        fileName: selected.name,
        kind: selected.kind,
      });
    } catch (error) {
      console.error('[cover] Cover asset selection failed.', error);
      setStatus(
        error instanceof Error
          ? error.message
          : 'Could not choose the cover asset.',
      );
    } finally {
      setBusy(false);
    }
  }

  function clearCoverAsset(slot: CoverSlot): void {
    setCovers((current) => {
      const next = { ...current };
      delete next[slot];
      return next;
    });
    setStatus(`${coverSlotLabels[slot]} cleared.`);
  }

  async function openMarkdown(): Promise<void> {
    setBusy(true);
    setStatus('Opening Markdown file…');
    console.info('[open-file] Open Markdown requested.');
    try {
      if (!window.desktopApi?.project?.openMarkdown) {
        throw new Error(
          'The desktop bridge is unavailable. Restart the application after building it.',
        );
      }
      const selected = await window.desktopApi.project.openMarkdown();
      if (!selected) {
        console.info('[open-file] Native dialog cancelled.');
        setStatus('Open cancelled.');
        return;
      }
      console.info('[open-file] Markdown file selected.', {
        fileName: selected.name,
      });
      setSource(selected);
      setCovers({});
      setStyleDraft(customStyle);
      setStylePanelOpen(false);
      await refreshPreview(selected.path, themeId, pageSize, customStyle);
    } catch (error) {
      console.error('[open-file] Open Markdown failed.', error);
      setStatus(
        error instanceof Error
          ? error.message
          : 'Could not open the Markdown file.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function openDroppedMarkdown(file: File): Promise<void> {
    setBusy(true);
    setStatus('Opening dropped Markdown file…');
    console.info('[open-file] Dropped Markdown requested.', {
      fileName: file.name,
    });
    try {
      if (!window.desktopApi?.project?.openDroppedMarkdown) {
        throw new Error(
          'The desktop bridge is unavailable. Restart the application after building it.',
        );
      }
      const selected =
        await window.desktopApi.project.openDroppedMarkdown(file);
      console.info('[open-file] Dropped Markdown file selected.', {
        fileName: selected.name,
      });
      setSource(selected);
      setCovers({});
      setStyleDraft(customStyle);
      setStylePanelOpen(false);
      await refreshPreview(selected.path, themeId, pageSize, customStyle);
    } catch (error) {
      console.error('[open-file] Open dropped Markdown failed.', error);
      setStatus(
        error instanceof Error
          ? error.message
          : 'Could not open the dropped Markdown file.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function exportPdf(): Promise<void> {
    if (!source) return;
    if (coverSizeError) {
      setStatus(coverSizeError);
      return;
    }
    setBusy(true);
    setStatus('Printing PDF with Chromium…');
    try {
      const result = await window.desktopApi.export.start({
        sourcePath: source.path,
        themeId,
        pageSize,
        styleOverrides: effectiveStyle,
        pageNumber,
        covers,
      });
      if (!result) {
        setStatus('Export cancelled.');
        return;
      }
      setDiagnostics(result.diagnostics);
      setStatus(`PDF written to ${result.outputPath}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Export failed.');
    } finally {
      setBusy(false);
    }
  }

  async function exportHtml(): Promise<void> {
    if (!source) return;
    setBusy(true);
    setStatus('Writing self-contained HTML…');
    try {
      const result = await window.desktopApi.export.html({
        sourcePath: source.path,
        themeId,
        pageSize,
        styleOverrides: effectiveStyle,
      });
      if (!result) {
        setStatus('Export cancelled.');
        return;
      }
      setDiagnostics(result.diagnostics);
      setStatus(`HTML written to ${result.outputPath}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Export failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="workspace">
      <header className="topbar">
        <div>
          <p className="eyebrow">PUBLICATION COMPILER</p>
          <h1>{title}</h1>
        </div>
        <div className="actions">
          <button
            className="secondary"
            onClick={() => void openMarkdown()}
            disabled={busy || !settingsReady}
          >
            Open Markdown
          </button>
          <button
            className="primary"
            onClick={() => void exportPdf()}
            disabled={!source || busy || Boolean(coverSizeError)}
            title={coverSizeError}
          >
            Export PDF
          </button>
          <button
            className="secondary"
            onClick={() => void exportHtml()}
            disabled={!source || busy}
          >
            Export HTML
          </button>
        </div>
      </header>
      <section className="content-grid">
        <aside className="sidebar">
          <div className="panel-block">
            <p className="eyebrow">SOURCE</p>
            <p className="source-name">{source?.name ?? 'No file selected'}</p>
            <p className="muted source-path" title={source?.path}>
              {source?.path ?? 'The renderer never receives filesystem access.'}
            </p>
          </div>
          <div className="panel-block">
            <label className="eyebrow theme-label" htmlFor="theme-select">
              STYLE
            </label>
            <select
              id="theme-select"
              className="theme-select"
              value={themeId}
              disabled={busy}
              onChange={(event) => {
                const parsed = ThemeIdSchema.safeParse(event.target.value);
                if (!parsed.success) return;
                setThemeId(parsed.data);
                if (source) {
                  void refreshPreview(
                    source.path,
                    parsed.data,
                    pageSize,
                    effectiveStyle,
                  );
                }
              }}
            >
              {BUILT_IN_THEMES.map((theme) => (
                <option key={theme.id} value={theme.id}>
                  {theme.name}
                </option>
              ))}
            </select>
            <p className="muted theme-description">
              {
                BUILT_IN_THEMES.find((theme) => theme.id === themeId)
                  ?.description
              }
            </p>
            <button
              className="style-advanced-button"
              type="button"
              onClick={openStylePanel}
              disabled={!settingsReady || styleSaving}
            >
              Advanced styles
              <span>
                {customStyleActive
                  ? 'Custom overrides active'
                  : 'Theme defaults'}
              </span>
            </button>
          </div>
          <PublicationFormatControls
            covers={covers}
            disabled={!source || busy}
            pageSize={pageSize}
            onChooseCover={(slot) => void chooseCoverAsset(slot)}
            onClearCover={clearCoverAsset}
            onPageSizeChange={updatePageSize}
          />
          <div className="panel-block page-number-panel">
            <p className="eyebrow">PAGE NUMBERS</p>
            <label className="toggle-row" htmlFor="page-number-enabled">
              <input
                id="page-number-enabled"
                type="checkbox"
                checked={pageNumber.enabled}
                disabled={busy}
                onChange={(event) =>
                  updatePageNumberField('enabled', event.target.checked)
                }
              />
              <span>Enable page numbers</span>
            </label>
            <fieldset
              className="page-number-controls"
              disabled={busy || !pageNumber.enabled}
            >
              <label htmlFor="page-number-font">Font</label>
              <select
                id="page-number-font"
                value={pageNumber.fontFamily}
                onChange={(event) => {
                  const parsed = PageNumberFontIdSchema.safeParse(
                    event.target.value,
                  );
                  if (parsed.success) {
                    updatePageNumberField('fontFamily', parsed.data);
                  }
                }}
              >
                {pageNumberFonts.map((font) => (
                  <option key={font.id} value={font.id}>
                    {font.name}
                  </option>
                ))}
              </select>

              <label htmlFor="page-number-size">Size (pt)</label>
              <input
                id="page-number-size"
                type="number"
                min="6"
                max="24"
                step="0.5"
                value={pageNumber.fontSizePt}
                onChange={(event) =>
                  updatePageNumberField(
                    'fontSizePt',
                    Number(event.target.value),
                  )
                }
              />

              <label htmlFor="page-number-style">Style</label>
              <select
                id="page-number-style"
                value={pageNumber.style}
                onChange={(event) => {
                  const parsed = PageNumberStyleSchema.safeParse(
                    event.target.value,
                  );
                  if (parsed.success) {
                    updatePageNumberField('style', parsed.data);
                  }
                }}
              >
                <option value="normal">Regular</option>
                <option value="bold">Bold</option>
                <option value="italic">Italic</option>
              </select>

              <label htmlFor="page-number-format">Format</label>
              <input
                id="page-number-format"
                type="text"
                value={pageNumber.format}
                maxLength={160}
                onChange={(event) =>
                  setPageNumber((current) => ({
                    ...current,
                    format: event.target.value,
                  }))
                }
                onBlur={() => void commitPageNumberSettings(pageNumber)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.currentTarget.blur();
                  }
                }}
              />
              <p className="muted page-number-help">
                Use {'{page}'} and {'{pages}'}. Applied to PDF export only.
              </p>

              <label htmlFor="page-number-first-page">First page</label>
              <select
                id="page-number-first-page"
                value={pageNumber.firstPageMode}
                onChange={(event) => {
                  const parsed = PageNumberFirstPageModeSchema.safeParse(
                    event.target.value,
                  );
                  if (parsed.success) {
                    updatePageNumberField('firstPageMode', parsed.data);
                  }
                }}
              >
                <option value="all-pages">Show every page from 1</option>
                <option value="hide-first-start-at-1">
                  Hide first page, then start at 1
                </option>
                <option value="hide-first-start-at-2">
                  Hide first page, then start at 2
                </option>
              </select>
            </fieldset>
            {pageNumberError ? (
              <p className="diagnostic error">{pageNumberError}</p>
            ) : null}
          </div>
          <div className="panel-block diagnostics">
            <p className="eyebrow">DIAGNOSTICS</p>
            {diagnostics.length === 0 ? (
              <p className="muted">No warnings.</p>
            ) : (
              diagnostics.map((diagnostic, index) => (
                <p
                  className={`diagnostic ${diagnostic.severity}`}
                  key={`${diagnostic.code}-${diagnostic.message}-${index}`}
                >
                  {diagnostic.message}
                </p>
              ))
            )}
          </div>
        </aside>
        <section className="preview-shell">
          <div className="preview-toolbar">
            <span>Preview</span>
            <span className="status">{status}</span>
          </div>
          {html ? (
            <iframe
              title="Publication preview"
              className="preview"
              sandbox="allow-same-origin"
              srcDoc={html}
              ref={previewFrameRef}
              onLoad={() => {
                if (previewFrameRef.current) {
                  void probePreviewRendering(previewFrameRef.current).then(
                    (probeDiagnostics) => {
                      setDiagnostics((current) => [
                        ...current.filter(
                          (diagnostic) =>
                            diagnostic.code !== 'math-font-unavailable',
                        ),
                        ...probeDiagnostics,
                      ]);
                    },
                  );
                }
              }}
            />
          ) : (
            <div
              className={`empty-state${dropActive ? ' is-dragging' : ''}`}
              role="region"
              aria-label="Markdown file drop zone"
              onDragEnter={(event) => {
                event.preventDefault();
                if (
                  source ||
                  busy ||
                  !event.dataTransfer.types.includes('Files')
                )
                  return;
                dragDepthRef.current += 1;
                setDropActive(true);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect =
                  source || busy ? 'none' : 'copy';
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
                if (dragDepthRef.current === 0) setDropActive(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                dragDepthRef.current = 0;
                setDropActive(false);
                if (source || busy) return;
                const files = [...event.dataTransfer.files];
                if (files.length !== 1) {
                  setStatus('Drop exactly one Markdown file at a time.');
                  return;
                }
                const file = files[0];
                if (file) void openDroppedMarkdown(file);
              }}
            >
              <div className="empty-mark">✦</div>
              <h2>
                {dropActive
                  ? 'Drop to open your manuscript.'
                  : 'Bring your manuscript to life.'}
              </h2>
              <p>Drag a .md or .markdown file here, or use Open Markdown.</p>
            </div>
          )}
        </section>
      </section>
      {stylePanelOpen ? (
        <AdvancedStylePanel
          styleOverrides={styleDraft}
          dirty={styleDirty}
          saving={styleSaving}
          exporting={busy}
          canExport={source !== null}
          error={styleError}
          onChange={updateStyleDraft}
          onApply={() => void applyStyleDraft()}
          onCancel={cancelStyleDraft}
          onReset={resetStyleDraft}
          onExportPdf={() => void exportPdf()}
          onExportHtml={() => void exportHtml()}
        />
      ) : null}
    </main>
  );
}
