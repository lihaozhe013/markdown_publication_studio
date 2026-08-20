import { useRef, useState } from 'react';
import {
  BUILT_IN_THEMES,
  ThemeIdSchema,
  type PublicationDiagnostic,
  type ThemeId,
} from '@markdown-publication/shared';

const katexFontFamilies = [
  'KaTeX_Main',
  'KaTeX_Math',
  'KaTeX_Size1',
  'KaTeX_Size2',
  'KaTeX_Size3',
  'KaTeX_Size4',
];

async function probePreviewRendering(
  frame: HTMLIFrameElement,
): Promise<PublicationDiagnostic[]> {
  if (window.location.hostname !== 'localhost') return [];
  const document = frame.contentDocument;
  const previewWindow = frame.contentWindow;
  if (!document || !previewWindow) return [];

  await document.fonts.ready;
  const stylesheet = [...document.querySelectorAll('style')]
    .map((style) => style.textContent ?? '')
    .join('\n');
  const mathElement = document.querySelector<HTMLElement>('.katex .mord');
  const delimiterElement = document.querySelector<HTMLElement>(
    '.katex .delimsizing',
  );
  const fonts = Object.fromEntries(
    katexFontFamilies.map((family) => [
      family,
      document.fonts.check(`16px "${family}"`, '∫[]'),
    ]),
  );
  console.info(
    `[math-render] Preview font probe ${JSON.stringify({
      mathElementCount: document.querySelectorAll('.katex').length,
      relativeFontUrlCount: (stylesheet.match(/url\((?!data:)/gu) ?? []).length,
      dataFontUrlCount: (stylesheet.match(/url\(data:/gu) ?? []).length,
      fonts,
      mathFontFamily: mathElement
        ? previewWindow.getComputedStyle(mathElement).fontFamily
        : undefined,
      delimiterFontFamily: delimiterElement
        ? previewWindow.getComputedStyle(delimiterElement).fontFamily
        : undefined,
    })}`,
  );

  const diagrams = [
    ...document.querySelectorAll<SVGSVGElement>('svg.mermaid-diagram'),
  ].map((svg) => {
    const rectangle = svg.getBoundingClientRect();
    const viewBox = svg.viewBox.baseVal;
    let bounds: DOMRect | undefined;
    try {
      bounds = svg.getBBox();
    } catch {
      bounds = undefined;
    }
    const expectedHeight =
      viewBox.width > 0
        ? (rectangle.width * viewBox.height) / viewBox.width
        : 0;
    const next = svg.closest('.mermaid-container')?.nextElementSibling;
    const nextTop = next?.getBoundingClientRect().top;
    return {
      id: svg.closest<HTMLElement>('.mermaid-container')?.dataset.mermaidId,
      viewBox: `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`,
      clientRect: { width: rectangle.width, height: rectangle.height },
      expectedHeight,
      heightError: Math.abs(rectangle.height - expectedHeight),
      overlapsNextBlock: nextTop !== undefined && rectangle.bottom > nextTop,
      bounds: bounds
        ? {
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
          }
        : undefined,
    };
  });
  console.info(
    `[mermaid-render] Preview layout probe ${JSON.stringify({ diagrams })}`,
  );

  const missingMathFonts =
    mathElement === null
      ? []
      : katexFontFamilies.filter((family) => !fonts[family]);
  return missingMathFonts.length === 0
    ? []
    : [
        {
          severity: 'warning',
          code: 'math-font-unavailable',
          message: `KaTeX fonts are not ready in the preview: ${missingMathFonts.join(', ')}.`,
          feature: 'math',
          details: { missingFonts: missingMathFonts },
        },
      ];
}

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
  const previewFrameRef = useRef<HTMLIFrameElement | null>(null);

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

  async function exportHtml(): Promise<void> {
    if (!source) return;
    setBusy(true);
    setStatus('Writing self-contained HTML…');
    try {
      const result = await window.desktopApi.export.html({
        sourcePath: source.path,
        themeId,
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
