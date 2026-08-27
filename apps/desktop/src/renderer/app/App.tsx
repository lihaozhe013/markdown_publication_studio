import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BUILT_IN_THEMES,
  DEFAULT_PAGE_SIZE,
  DEFAULT_PAGE_NUMBER_SETTINGS,
  DEFAULT_PUBLICATION_STYLE_OVERRIDES,
  DEFAULT_TOC_SETTINGS,
  PageNumberSettingsSchema,
  PublicationStyleOverridesSchema,
  TocSettingsSchema,
  ThemeIdSchema,
  type CoverSelection,
  type PublicationDiagnostic,
  type PublicationStyleOverrides,
  type PageNumberSettings,
  type PageSizeId,
  type TocSettings,
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
import { PageNumberControls } from './page-number-controls.js';

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
  const [toc, setToc] = useState<TocSettings>({
    ...DEFAULT_TOC_SETTINGS,
  });
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
    selectedToc: TocSettings,
    selectedPageNumbersEnabled: boolean,
  ): Promise<void> {
    const sequence = ++previewSequenceRef.current;
    setBusy(true);
    setStatus('Rendering preview…');
    try {
      const result = await window.desktopApi.preview.build({
        sourcePath: path,
        themeId: selectedTheme,
        pageSize: selectedPageSize,
        toc: selectedToc,
        pageNumbersEnabled: selectedPageNumbersEnabled,
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

  function refreshCurrentPreview(
    path: string,
    selectedTheme: ThemeId,
    selectedPageSize: PageSizeId,
    selectedStyle: PublicationStyleOverrides,
  ): void {
    void refreshPreview(
      path,
      selectedTheme,
      selectedPageSize,
      selectedStyle,
      toc,
      pageNumber.enabled,
    );
  }

  useEffect(() => {
    if (!stylePanelOpen || !styleDirty || !source) return undefined;
    const timer = window.setTimeout(() => {
      void refreshPreview(
        source.path,
        themeId,
        pageSize,
        styleDraft,
        toc,
        pageNumber.enabled,
      );
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
    toc,
    pageNumber.enabled,
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
    if (source && (key === 'enabled' || key === 'firstPageMode')) {
      void refreshPreview(
        source.path,
        themeId,
        pageSize,
        effectiveStyle,
        toc,
        nextSettings.enabled,
      );
    }
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
        refreshCurrentPreview(source.path, themeId, pageSize, saved);
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
      refreshCurrentPreview(source.path, themeId, pageSize, customStyle);
    }
  }

  function resetStyleDraft(): void {
    setStyleError('');
    setStyleDraft({ ...DEFAULT_PUBLICATION_STYLE_OVERRIDES });
  }

  function updatePageSize(nextPageSize: PageSizeId): void {
    setPageSize(nextPageSize);
    if (source) {
      refreshCurrentPreview(source.path, themeId, nextPageSize, effectiveStyle);
    }
  }

  function updateToc(nextToc: TocSettings): void {
    const parsed = TocSettingsSchema.safeParse(nextToc);
    if (!parsed.success) {
      setStatus('Invalid table of contents settings.');
      return;
    }
    setToc(parsed.data);
    if (source) {
      void refreshPreview(
        source.path,
        themeId,
        pageSize,
        effectiveStyle,
        parsed.data,
        pageNumber.enabled,
      );
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
      setToc({ ...DEFAULT_TOC_SETTINGS });
      setStyleDraft(customStyle);
      setStylePanelOpen(false);
      await refreshPreview(
        selected.path,
        themeId,
        pageSize,
        customStyle,
        DEFAULT_TOC_SETTINGS,
        pageNumber.enabled,
      );
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
      setToc({ ...DEFAULT_TOC_SETTINGS });
      setStyleDraft(customStyle);
      setStylePanelOpen(false);
      await refreshPreview(
        selected.path,
        themeId,
        pageSize,
        customStyle,
        DEFAULT_TOC_SETTINGS,
        pageNumber.enabled,
      );
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
        toc,
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
                  refreshCurrentPreview(
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
            toc={toc}
            onChooseCover={(slot) => void chooseCoverAsset(slot)}
            onClearCover={clearCoverAsset}
            onPageSizeChange={updatePageSize}
            onTocChange={updateToc}
          />
          <PageNumberControls
            disabled={busy}
            error={pageNumberError}
            settings={pageNumber}
            onCommitFormat={(settings) => {
              void commitPageNumberSettings(settings);
            }}
            onFieldChange={updatePageNumberField}
            onFormatChange={(format) =>
              setPageNumber((current) => ({ ...current, format }))
            }
          />
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
                  void probePreviewRendering(
                    previewFrameRef.current,
                    pageSize,
                    pageNumber.firstPageMode,
                  ).then((probeDiagnostics) => {
                    setDiagnostics((current) => [
                      ...current.filter(
                        (diagnostic) =>
                          diagnostic.code !== 'math-font-unavailable',
                      ),
                      ...probeDiagnostics,
                    ]);
                  });
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
