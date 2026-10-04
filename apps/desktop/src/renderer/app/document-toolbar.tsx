import { useEffect, useRef, type ReactElement } from 'react';
import type { UiPreferences } from '@markdown-publication/shared';
import { StudioIcon } from './studio-icon.js';

interface DocumentToolbarProps {
  title: string;
  source: { name: string; path: string } | null;
  busy: boolean;
  ready: boolean;
  pdfError: string | undefined;
  appearance: UiPreferences['appearance'];
  inspectorVisible: boolean;
  onOpen(): void;
  onExportPdf(): void;
  onExportHtml(): void;
  onAppearance(appearance: UiPreferences['appearance']): void;
  onToggleInspector(): void;
}
export function DocumentToolbar(props: DocumentToolbarProps): ReactElement {
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent): void => {
      if (menu.current && !menu.current.contains(event.target as Node))
        menu.current.open = false;
    };
    const escape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && menu.current?.open) {
        menu.current.open = false;
        menu.current.querySelector('summary')?.focus();
      }
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', escape);
    };
  }, []);
  return (
    <header className="document-toolbar">
      <button
        onClick={props.onOpen}
        disabled={props.busy || !props.ready}
        title="Open Markdown (Ctrl/Cmd+O)"
      >
        <StudioIcon name="open" />
        Open
      </button>
      <span className="toolbar-divider" />
      <div className="document-identity" title={props.source?.path}>
        <StudioIcon name="document" />
        <div>
          <h1>{props.source ? props.title : 'Markdown Publication Studio'}</h1>
          <span>{props.source?.name ?? 'Publication workspace'}</span>
        </div>
      </div>
      <div className="toolbar-actions">
        <label className="appearance-control">
          <span className="sr-only">Application appearance</span>
          <select
            value={props.appearance}
            disabled={!props.ready}
            onChange={(event) =>
              props.onAppearance(
                event.target.value as UiPreferences['appearance'],
              )
            }
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        <button
          className="icon-button"
          onClick={props.onToggleInspector}
          aria-label="Show properties"
          aria-pressed={props.inspectorVisible}
          title="Show or hide properties"
        >
          <StudioIcon name="panel" />
        </button>
        <span className="toolbar-divider" />
        <div className="export-control">
          <button
            className="primary"
            onClick={props.onExportPdf}
            disabled={
              !props.source ||
              props.busy ||
              !props.ready ||
              Boolean(props.pdfError)
            }
            title={props.pdfError ?? 'Export PDF (Ctrl/Cmd+Shift+E)'}
          >
            <StudioIcon name="export" />
            Export PDF
          </button>
          <details className="export-options" ref={menu}>
            <summary aria-label="Export options" title="Export options">
              <StudioIcon name="chevron" />
            </summary>
            <div className="export-popover">
              <button
                disabled={
                  !props.source ||
                  props.busy ||
                  !props.ready ||
                  Boolean(props.pdfError)
                }
                title={props.pdfError}
                onClick={() => {
                  if (menu.current) menu.current.open = false;
                  props.onExportPdf();
                }}
              >
                Export PDF<span>⇧ Ctrl/Cmd E</span>
              </button>
              <button
                disabled={!props.source || props.busy || !props.ready}
                onClick={() => {
                  if (menu.current) menu.current.open = false;
                  props.onExportHtml();
                }}
              >
                Export HTML<span>Self-contained</span>
              </button>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
