import { useState } from 'react';
import {
  BUILT_IN_THEMES,
  ThemeIdSchema,
  type PublicationDiagnostic,
  type ThemeId,
} from '@markdown-publication/shared';

export function App(): React.JSX.Element {
  const [source, setSource] = useState<{ path: string; name: string } | null>(
    null,
  );
  const [title, setTitle] = useState('No publication loaded');
  const [html, setHtml] = useState('');
  const [diagnostics, setDiagnostics] = useState<PublicationDiagnostic[]>([]);
  const [themeId, setThemeId] = useState<ThemeId>('rose');
  const [status, setStatus] = useState('Choose a Markdown file to begin.');
  const [busy, setBusy] = useState(false);

  async function refreshPreview(
    path: string,
    selectedTheme: ThemeId = themeId,
  ): Promise<void> {
    setBusy(true);
    setStatus('Rendering preview…');
    try {
      const result = await window.desktopApi.preview.build({
        sourcePath: path,
        themeId: selectedTheme,
      });
      setTitle(result.title);
      setHtml(result.html);
      setDiagnostics(result.diagnostics);
      setStatus('Preview ready.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Preview failed.');
    } finally {
      setBusy(false);
    }
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
      await refreshPreview(selected.path);
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

  async function exportPdf(): Promise<void> {
    if (!source) return;
    setBusy(true);
    setStatus('Printing PDF with Electron Chromium…');
    try {
      const result = await window.desktopApi.export.start({
        sourcePath: source.path,
        themeId,
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
            disabled={busy}
          >
            Open Markdown
          </button>
          <button
            className="primary"
            onClick={() => void exportPdf()}
            disabled={!source || busy}
          >
            Export PDF
          </button>
        </div>
      </header>
      <section className="content-grid">
        <aside className="sidebar">
          <div className="panel-block">
            <p className="eyebrow">SOURCE</p>
            <p className="source-name">{source?.name ?? 'No file selected'}</p>
            <p className="muted">
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
                  void refreshPreview(source.path, parsed.data);
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
          </div>
          <div className="panel-block">
            <p className="eyebrow">PIPELINE</p>
            <ol className="pipeline">
              <li className="active">Markdown compiler</li>
              <li className="active">Publication HTML</li>
              <li>Hidden Chromium print</li>
              <li>PDF output</li>
            </ol>
          </div>
          <div className="panel-block diagnostics">
            <p className="eyebrow">DIAGNOSTICS</p>
            {diagnostics.length === 0 ? (
              <p className="muted">No warnings.</p>
            ) : (
              diagnostics.map((diagnostic) => (
                <p
                  className={`diagnostic ${diagnostic.severity}`}
                  key={`${diagnostic.code}-${diagnostic.message}`}
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
            />
          ) : (
            <div className="empty-state">
              <div className="empty-mark">✦</div>
              <h2>Bring your manuscript to life.</h2>
              <p>
                Open a Markdown file to render a page-size-aware publication
                preview.
              </p>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
