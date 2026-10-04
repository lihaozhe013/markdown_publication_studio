import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import {
  BUILT_IN_THEMES,
  DEFAULT_PAGE_SIZE,
  DEFAULT_PAGE_NUMBER_SETTINGS,
  DEFAULT_PUBLICATION_STYLE_OVERRIDES,
  DEFAULT_TOC_SETTINGS,
  DEFAULT_UI_PREFERENCES,
  type UiPreferences,
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
import { PreviewCanvas } from './preview-canvas.js';
import { DocumentToolbar } from './document-toolbar.js';
import { PropertiesPanel, type InspectorTab } from './properties-panel.js';
import { DiagnosticsPanel } from './diagnostics-panel.js';
import { StatusBar } from './status-bar.js';
import {
  clampZoom,
  styleSessionReducer,
  effectiveStyle as getEffectiveStyle,
  type ZoomMode,
} from './workspace-model.js';
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
  const [styleSession, dispatchStyle] = useReducer(styleSessionReducer, {
    saved: { ...DEFAULT_PUBLICATION_STYLE_OVERRIDES },
    draft: { ...DEFAULT_PUBLICATION_STYLE_OVERRIDES },
    editing: false,
  });
  const {
    saved: customStyle,
    draft: styleDraft,
    editing: stylePanelOpen,
  } = styleSession;
  const [uiPreferences, setUiPreferences] = useState<UiPreferences>({
    ...DEFAULT_UI_PREFERENCES,
  });
  const uiPreferencesRef = useRef(uiPreferences);
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  );
  const [inspectorVisible, setInspectorVisible] = useState(true);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('layout');
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const previousErrors = useRef('');
  const [zoomMode, setZoomMode] = useState<ZoomMode>('fit');
  const [zoom, setZoom] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [pageNumberError, setPageNumberError] = useState('');
  const [styleError, setStyleError] = useState('');
  const [styleSaving, setStyleSaving] = useState(false);
  const [settingsReady, setSettingsReady] = useState(false);
  const [status, setStatus] = useState('Choose a Markdown file to begin.');
  const [busy, setBusy] = useState(false);
  const pageNumberSaveSequenceRef = useRef(0);
  const previewSequenceRef = useRef(0);
  const previewRequestRef = useRef('');

  const styleDirty = JSON.stringify(styleDraft) !== JSON.stringify(customStyle);
  const effectiveStyle = getEffectiveStyle(styleSession);
  const customStyleActive = hasStyleOverrides(customStyle);
  const coverSizeError = getCoverSizeError(covers, pageSize);
  const pageNumberValidation = PageNumberSettingsSchema.safeParse(pageNumber);
  const pdfError =
    coverSizeError ??
    (pageNumberValidation.success
      ? undefined
      : pageNumberValidation.error.issues[0]?.message);

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const update = (): void => setSystemDark(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    document.title = source
      ? `${title} — Markdown Publication Studio`
      : 'Markdown Publication Studio';
  }, [source, title]);

  useEffect(() => {
    const errors = diagnostics
      .filter((item) => item.severity === 'error')
      .map((item) => `${item.code}:${item.message}`)
      .join('\n');
    if (errors && errors !== previousErrors.current) setDiagnosticsOpen(true);
    previousErrors.current = errors;
  }, [diagnostics]);

  function updateUiPreferences(
    patch: Partial<UiPreferences>,
    commit = true,
  ): void {
    const next = { ...uiPreferencesRef.current, ...patch };
    uiPreferencesRef.current = next;
    setUiPreferences(next);
    if (!commit || !window.desktopApi?.settings) return;
    void window.desktopApi.settings
      .saveUiPreferences(next)
      .catch((error: unknown) => {
        setStatus(
          error instanceof Error
            ? `Could not save UI preferences: ${error.message}`
            : 'Could not save UI preferences.',
        );
      });
  }

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
      settingsApi.getUiPreferences(),
    ])
      .then(([loadedPageNumber, loadedStyle, loadedUi]) => {
        if (!mounted) return;
        setPageNumber(loadedPageNumber);
        dispatchStyle({ type: 'load', style: loadedStyle });
        setUiPreferences(loadedUi);
        uiPreferencesRef.current = loadedUi;
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
  ): Promise<void> {
    previewRequestRef.current = JSON.stringify([
      path,
      selectedTheme,
      selectedPageSize,
      selectedStyle,
      selectedToc,
    ]);
    const sequence = ++previewSequenceRef.current;
    setBusy(true);
    setStatus('Rendering preview…');
    try {
      const result = await window.desktopApi.preview.build({
        sourcePath: path,
        themeId: selectedTheme,
        pageSize: selectedPageSize,
        toc: selectedToc,
        styleOverrides: selectedStyle,
      });
      if (sequence !== previewSequenceRef.current) return;
      setTitle(result.title);
      setHtml(result.html);
      setDiagnostics(result.diagnostics);
      setStatus('Preview ready.');
    } catch (error) {
      if (sequence !== previewSequenceRef.current) return;
      const message =
        error instanceof Error ? error.message : 'Preview failed.';
      setStatus(message);
      setDiagnostics([
        {
          severity: 'error',
          code: 'preview-failed',
          message,
          sourcePath: path,
        },
      ]);
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
    );
  }

  useEffect(() => {
    if (!stylePanelOpen || !source || exporting || styleSaving)
      return undefined;
    if (
      previewRequestRef.current ===
      JSON.stringify([source.path, themeId, pageSize, styleDraft, toc])
    )
      return undefined;
    const timer = window.setTimeout(() => {
      void refreshPreview(source.path, themeId, pageSize, styleDraft, toc);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [
    pageSize,
    refreshPreview,
    source,
    styleDraft,
    stylePanelOpen,
    exporting,
    styleSaving,
    themeId,
    toc,
  ]);

  async function commitPageNumberSettings(
    nextSettings: PageNumberSettings,
  ): Promise<void> {
    const sequence = ++pageNumberSaveSequenceRef.current;
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
      if (sequence === pageNumberSaveSequenceRef.current) setPageNumber(saved);
    } catch (error) {
      if (sequence !== pageNumberSaveSequenceRef.current) return;
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
    dispatchStyle({ type: 'begin' });
    setStyleError('');
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
    dispatchStyle({ type: 'edit', style: parsed.data });
  }

  async function applyStyleDraft(): Promise<void> {
    if (styleSaving || exporting) return;
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
      dispatchStyle({ type: 'saved', style: saved });
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
    dispatchStyle({ type: 'discard' });
    setStyleError('');
    if (source) {
      refreshCurrentPreview(source.path, themeId, pageSize, customStyle);
    }
  }

  function resetStyleDraft(): void {
    setStyleError('');
    dispatchStyle({
      type: 'edit',
      style: { ...DEFAULT_PUBLICATION_STYLE_OVERRIDES },
    });
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
      );
    }
  }

  async function chooseCoverAsset(slot: CoverSlot): Promise<void> {
    if (!source || busy || styleSaving) return;
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
    if (busy || styleSaving || !settingsReady) return;
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
      setTitle(selected.name);
      setHtml('');
      setDiagnostics([]);
      setZoomMode('fit');
      setCovers({});
      setToc({ ...DEFAULT_TOC_SETTINGS });
      dispatchStyle({ type: 'close-document' });
      await refreshPreview(
        selected.path,
        themeId,
        pageSize,
        customStyle,
        DEFAULT_TOC_SETTINGS,
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
    if (busy || styleSaving || !settingsReady) return;
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
      setTitle(selected.name);
      setHtml('');
      setDiagnostics([]);
      setZoomMode('fit');
      setCovers({});
      setToc({ ...DEFAULT_TOC_SETTINGS });
      dispatchStyle({ type: 'close-document' });
      await refreshPreview(
        selected.path,
        themeId,
        pageSize,
        customStyle,
        DEFAULT_TOC_SETTINGS,
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

  async function closeMarkdown(): Promise<void> {
    if (busy || styleSaving) return;
    if (!source) {
      setStatus('No publication is open.');
      return;
    }
    const closed = source;
    previewSequenceRef.current += 1;
    setBusy(false);
    setSource(null);
    setTitle('No publication loaded');
    setHtml('');
    setDiagnostics([]);
    setCovers({});
    setToc({ ...DEFAULT_TOC_SETTINGS });
    dispatchStyle({ type: 'close-document' });
    setStatus(`Closed ${closed.name}.`);
    console.info('[close-file] Markdown closed.', { fileName: closed.name });
    try {
      if (!window.desktopApi?.project?.closeMarkdown) {
        return;
      }
      await window.desktopApi.project.closeMarkdown({
        sourcePath: closed.path,
      });
    } catch (error) {
      console.error(
        '[close-file] Failed to revoke the closed Markdown approval.',
        error,
      );
    }
  }

  const menuCommandsRef = useRef({
    open: (): Promise<void> => openMarkdown(),
    close: (): Promise<void> => closeMarkdown(),
    pdf: (): Promise<void> => exportPdf(),
    html: (): Promise<void> => exportHtml(),
    zoom: (action: 'in' | 'out' | 'reset'): void =>
      setZoomMode(
        action === 'reset'
          ? 1
          : clampZoom(zoom + (action === 'in' ? 0.1 : -0.1)),
      ),
  });

  useEffect(() => {
    menuCommandsRef.current = {
      open: (): Promise<void> => openMarkdown(),
      close: (): Promise<void> => closeMarkdown(),
      pdf: (): Promise<void> => exportPdf(),
      html: (): Promise<void> => exportHtml(),
      zoom: (action: 'in' | 'out' | 'reset'): void =>
        setZoomMode(
          action === 'reset'
            ? 1
            : clampZoom(zoom + (action === 'in' ? 0.1 : -0.1)),
        ),
    };
  });

  useEffect(() => {
    const menuApi = window.desktopApi?.menu;
    if (!menuApi) return undefined;
    const unsubscribeOpen = menuApi.onOpenMarkdownRequest(() => {
      void menuCommandsRef.current.open();
    });
    const unsubscribeClose = menuApi.onCloseMarkdownRequest(() => {
      void menuCommandsRef.current.close();
    });
    const unsubscribePdf = menuApi.onExportPdfRequest(() => {
      void menuCommandsRef.current.pdf();
    });
    const unsubscribeHtml = menuApi.onExportHtmlRequest(() => {
      void menuCommandsRef.current.html();
    });
    const unsubscribeZoom = menuApi.onPreviewZoomRequest((action) =>
      menuCommandsRef.current.zoom(action),
    );
    return () => {
      unsubscribePdf();
      unsubscribeHtml();
      unsubscribeZoom();
      unsubscribeOpen();
      unsubscribeClose();
    };
  }, []);

  async function exportPdf(): Promise<void> {
    if (!source || busy || styleSaving || !settingsReady) return;
    if (pdfError) {
      setStatus(pdfError);
      return;
    }
    setBusy(true);
    setExporting(true);
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
      const message = error instanceof Error ? error.message : 'Export failed.';
      setStatus(message);
      setDiagnostics((current) => [
        ...current.filter((item) => item.code !== 'export-failed'),
        {
          severity: 'error',
          code: 'export-failed',
          message,
          sourcePath: source.path,
        },
      ]);
    } finally {
      setExporting(false);
      setBusy(false);
    }
  }

  async function exportHtml(): Promise<void> {
    if (!source || busy || styleSaving || !settingsReady) return;
    setBusy(true);
    setExporting(true);
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
      const message = error instanceof Error ? error.message : 'Export failed.';
      setStatus(message);
      setDiagnostics((current) => [
        ...current.filter((item) => item.code !== 'export-failed'),
        {
          severity: 'error',
          code: 'export-failed',
          message,
          sourcePath: source.path,
        },
      ]);
    } finally {
      setExporting(false);
      setBusy(false);
    }
  }

  const appearance =
    uiPreferences.appearance === 'system'
      ? systemDark
        ? 'dark'
        : 'light'
      : uiPreferences.appearance;
  const formatProps = {
    covers,
    disabled: !source || busy || styleSaving,
    pageSize,
    toc,
    onChooseCover: (slot: CoverSlot) => {
      void chooseCoverAsset(slot);
    },
    onClearCover: clearCoverAsset,
    onPageSizeChange: updatePageSize,
    onTocChange: updateToc,
  };

  return (
    <main className="workspace" data-appearance={appearance}>
      <DocumentToolbar
        title={title}
        source={source}
        busy={busy || styleSaving}
        ready={settingsReady}
        pdfError={pdfError}
        appearance={uiPreferences.appearance}
        inspectorVisible={inspectorVisible}
        onOpen={() => void openMarkdown()}
        onExportPdf={() => void exportPdf()}
        onExportHtml={() => void exportHtml()}
        onAppearance={(next) => updateUiPreferences({ appearance: next })}
        onToggleInspector={() => setInspectorVisible((visible) => !visible)}
      />
      <div className="workspace-body">
        <PreviewCanvas
          html={html}
          sourceLoaded={Boolean(source)}
          pageSize={pageSize}
          zoomMode={zoomMode}
          busy={busy}
          ready={settingsReady}
          onZoomResolved={setZoom}
          onProbe={(probeDiagnostics) =>
            setDiagnostics((current) => [
              ...current.filter(
                (item) => item.code !== 'math-font-unavailable',
              ),
              ...probeDiagnostics,
            ])
          }
          onOpen={() => void openMarkdown()}
          onDrop={(file) => void openDroppedMarkdown(file)}
          onDropError={setStatus}
        />
        <PropertiesPanel
          width={uiPreferences.inspectorWidth}
          visible={inspectorVisible}
          tab={inspectorTab}
          onTab={setInspectorTab}
          onResize={(width, commit) =>
            updateUiPreferences({ inspectorWidth: width }, commit)
          }
        >
          <section
            className="inspector-page inspector-scroll"
            id="properties-layout"
            role="tabpanel"
            aria-labelledby="tab-layout"
            hidden={inspectorTab !== 'layout'}
          >
            <PublicationFormatControls section="layout" {...formatProps} />
            <PageNumberControls
              disabled={busy || styleSaving || !settingsReady}
              error={pageNumberError}
              settings={pageNumber}
              onCommitFormat={(settings) =>
                void commitPageNumberSettings(settings)
              }
              onFieldChange={updatePageNumberField}
              onFormatChange={(format) => {
                pageNumberSaveSequenceRef.current += 1;
                setPageNumber((current) => ({ ...current, format }));
              }}
            />
          </section>
          <section
            className="inspector-page style-inspector"
            id="properties-style"
            role="tabpanel"
            aria-labelledby="tab-style"
            hidden={inspectorTab !== 'style'}
          >
            <div className="theme-panel panel-block">
              <p className="eyebrow">Publication theme</p>
              <div
                className="theme-options"
                role="radiogroup"
                aria-label="Publication theme"
              >
                {BUILT_IN_THEMES.map((theme) => (
                  <label
                    key={theme.id}
                    className={`theme-option${themeId === theme.id ? ' selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="publication-theme"
                      value={theme.id}
                      checked={themeId === theme.id}
                      disabled={busy || styleSaving}
                      onChange={() => {
                        const parsed = ThemeIdSchema.safeParse(theme.id);
                        if (!parsed.success) return;
                        setThemeId(parsed.data);
                        if (source)
                          refreshCurrentPreview(
                            source.path,
                            parsed.data,
                            pageSize,
                            effectiveStyle,
                          );
                      }}
                    />
                    <span
                      className={`theme-sample theme-${theme.id}`}
                      aria-hidden="true"
                    >
                      Aa
                    </span>
                    <span>{theme.name}</span>
                  </label>
                ))}
              </div>
              <p className="muted theme-description">
                {
                  BUILT_IN_THEMES.find((theme) => theme.id === themeId)
                    ?.description
                }
              </p>
            </div>
            {stylePanelOpen ? (
              <AdvancedStylePanel
                styleOverrides={styleDraft}
                dirty={styleDirty}
                saving={styleSaving}
                disabled={exporting}
                error={styleError}
                onChange={updateStyleDraft}
                onApply={() => void applyStyleDraft()}
                onCancel={cancelStyleDraft}
                onReset={resetStyleDraft}
              />
            ) : (
              <div className="style-entry">
                <p className="muted">
                  {customStyleActive
                    ? 'Custom styles are applied.'
                    : 'Using the theme’s typography and spacing.'}
                </p>
                <button
                  onClick={openStylePanel}
                  disabled={!settingsReady || styleSaving || exporting}
                >
                  Customize styles
                </button>
              </div>
            )}
          </section>
          <section
            className="inspector-page inspector-scroll"
            id="properties-covers"
            role="tabpanel"
            aria-labelledby="tab-covers"
            hidden={inspectorTab !== 'covers'}
          >
            <PublicationFormatControls section="covers" {...formatProps} />
          </section>
        </PropertiesPanel>
      </div>
      <DiagnosticsPanel
        diagnostics={diagnostics}
        open={diagnosticsOpen}
        onClose={() => setDiagnosticsOpen(false)}
      />
      <StatusBar
        status={status}
        busy={busy || styleSaving}
        diagnostics={diagnostics}
        diagnosticsOpen={diagnosticsOpen}
        zoom={zoom}
        zoomMode={zoomMode}
        onDiagnostics={() => setDiagnosticsOpen((open) => !open)}
        onZoom={setZoomMode}
      />
    </main>
  );
}
