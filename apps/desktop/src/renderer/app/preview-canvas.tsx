import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import {
  PAGE_SIZE_DEFINITIONS,
  type PageSizeId,
  type PublicationDiagnostic,
} from '@markdown-publication/shared';
import { paperWidth, resolveZoom, type ZoomMode } from './workspace-model.js';
import { previewViewportStyles } from './preview-viewport.js';
import { probePreviewRendering } from './preview-probe.js';
import { StudioIcon } from './studio-icon.js';
interface Props {
  html: string;
  sourceLoaded: boolean;
  pageSize: PageSizeId;
  zoomMode: ZoomMode;
  busy: boolean;
  ready: boolean;
  onZoomResolved(zoom: number): void;
  onProbe(diagnostics: PublicationDiagnostic[]): void;
  onOpen(): void;
  onDrop(file: File): void;
  onDropError(message: string): void;
}
export function PreviewCanvas(props: Props): ReactElement {
  const canvas = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const cleanup = useRef<(() => void) | null>(null);
  const latestHtml = useRef(props.html);
  latestHtml.current = props.html;
  const probeCallback = useRef(props.onProbe);
  probeCallback.current = props.onProbe;
  const [availableWidth, setAvailableWidth] = useState(0);
  const [height, setHeight] = useState(
    (PAGE_SIZE_DEFINITIONS[props.pageSize].heightPt * 96) / 72,
  );
  const [dropActive, setDropActive] = useState(false);
  const dragDepth = useRef(0);
  const width = paperWidth(props.pageSize);
  const zoom = resolveZoom(props.zoomMode, availableWidth, width);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    let scheduled = 0;
    const measure = (): void => {
      if (scheduled) return;
      scheduled = window.requestAnimationFrame(() => {
        scheduled = 0;
        setAvailableWidth(element.clientWidth);
      });
    };
    const observer = new ResizeObserver(measure);
    measure();
    observer.observe(element);
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(scheduled);
    };
  }, []);
  useEffect(() => props.onZoomResolved(zoom), [zoom, props.onZoomResolved]);
  useLayoutEffect(
    () => () => {
      cleanup.current?.();
      cleanup.current = null;
    },
    [props.html],
  );

  function installViewport(): void {
    cleanup.current?.();
    const iframe = frame.current;
    const document = iframe?.contentDocument;
    const previewWindow = iframe?.contentWindow as
      (Window & typeof globalThis) | null;
    if (!iframe || !document || !previewWindow) return;
    const loadedHtml = latestHtml.current;
    let disposed = false;
    const style = document.createElement('style');
    style.dataset.previewViewport = 'true';
    style.textContent = previewViewportStyles(props.pageSize);
    document.head.append(style);
    let scheduled = 0;
    // Resize callbacks only schedule work; changing iframe geometry during observer
    // delivery would create a resize loop when canvas scrollbars change size.
    const measure = (): void => {
      if (scheduled || disposed) return;
      scheduled = window.requestAnimationFrame(() => {
        scheduled = 0;
        if (
          disposed ||
          loadedHtml !== latestHtml.current ||
          iframe.contentDocument !== document
        )
          return;
        setHeight(
          Math.ceil(
            Math.max(
              document.body.getBoundingClientRect().height,
              document.body.scrollHeight,
            ),
          ),
        );
      });
    };
    const observer = new previewWindow.ResizeObserver(measure);
    observer.observe(document.body);
    const onResourceLoad = (): void => measure();
    document.addEventListener('load', onResourceLoad, true);
    // Prevent iframe-local anchor scrolling from clipping the fixed-height viewport.
    const onAnchor = (event: MouseEvent): void => {
      const anchor = (event.target as Element).closest?.('a[href^="#"]');
      const href = anchor?.getAttribute('href');
      if (!href) return;
      try {
        const target = document.getElementById(
          decodeURIComponent(href.slice(1)),
        );
        if (target && canvas.current) {
          event.preventDefault();
          canvas.current.scrollTop +=
            target.getBoundingClientRect().top * zoomRef.current;
        }
      } catch {
        /* A malformed source anchor does not affect preview rendering. */
      }
    };
    document.addEventListener('click', onAnchor);
    measure();
    void document.fonts.ready.then(measure);
    void probePreviewRendering(iframe)
      .then((diagnostics) => {
        if (
          !disposed &&
          loadedHtml === latestHtml.current &&
          iframe.contentDocument === document
        )
          probeCallback.current(diagnostics);
      })
      .catch(() => {
        /* Preview compilation diagnostics remain available if probing fails. */
      });
    cleanup.current = () => {
      disposed = true;
      window.cancelAnimationFrame(scheduled);
      observer.disconnect();
      document.removeEventListener('load', onResourceLoad, true);
      document.removeEventListener('click', onAnchor);
    };
  }
  return (
    <section className="preview-shell" aria-label="Publication preview canvas">
      <div className="canvas-caption">
        <span>
          {props.sourceLoaded
            ? `${props.pageSize} · Continuous preview`
            : 'Preview'}
        </span>
        <span>PDF determines final pagination</span>
      </div>
      <div
        ref={canvas}
        className={`preview-canvas${dropActive ? ' is-dragging' : ''}`}
        onDragEnter={(event) => {
          event.preventDefault();
          if (
            props.sourceLoaded ||
            props.busy ||
            !props.ready ||
            !event.dataTransfer.types.includes('Files')
          )
            return;
          dragDepth.current += 1;
          setDropActive(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect =
            props.sourceLoaded || props.busy || !props.ready ? 'none' : 'copy';
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (!dragDepth.current) setDropActive(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          dragDepth.current = 0;
          setDropActive(false);
          if (props.sourceLoaded || props.busy || !props.ready) return;
          const files = [...event.dataTransfer.files];
          if (files.length !== 1)
            props.onDropError('Drop exactly one Markdown file at a time.');
          else if (files[0]) props.onDrop(files[0]);
        }}
      >
        {props.html ? (
          <div
            className="paper-stage"
            style={{ width: width * zoom, height: height * zoom }}
          >
            <iframe
              title="Publication preview"
              ref={frame}
              className="preview"
              sandbox="allow-same-origin"
              srcDoc={props.html}
              onLoad={installViewport}
              style={{ width, height, transform: `scale(${zoom})` }}
            />
          </div>
        ) : (
          <div className="empty-state">
            <StudioIcon name="document" size={48} />
            <h2>
              {props.sourceLoaded
                ? 'Preparing preview'
                : dropActive
                  ? 'Drop your Markdown file'
                  : 'Open a manuscript'}
            </h2>
            <p>
              {props.sourceLoaded
                ? 'Your publication will appear here.'
                : 'Choose a Markdown file or drag it into this workspace.'}
            </p>
            {!props.sourceLoaded ? (
              <button
                onClick={props.onOpen}
                disabled={props.busy || !props.ready}
              >
                <StudioIcon name="open" />
                Open Markdown<span className="shortcut">Ctrl/Cmd O</span>
              </button>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
