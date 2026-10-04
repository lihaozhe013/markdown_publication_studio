import type { ReactElement } from 'react';
import type { PublicationDiagnostic } from '@markdown-publication/shared';
import type { ZoomMode } from './workspace-model.js';
interface Props {
  status: string;
  busy: boolean;
  diagnostics: PublicationDiagnostic[];
  diagnosticsOpen: boolean;
  zoom: number;
  zoomMode: ZoomMode;
  onDiagnostics(): void;
  onZoom(mode: ZoomMode): void;
}
export function StatusBar(props: Props): ReactElement {
  const errors = props.diagnostics.filter(
    (item) => item.severity === 'error',
  ).length;
  const warnings = props.diagnostics.filter(
    (item) => item.severity === 'warning',
  ).length;
  return (
    <footer className="status-bar">
      <span
        className={`status-indicator${props.busy ? ' is-busy' : ''}`}
        aria-hidden="true"
      />
      <span className="status-message" role="status" title={props.status}>
        {props.status}
      </span>
      <button
        className={`diagnostics-toggle${errors ? ' has-errors' : ''}`}
        aria-controls="publication-diagnostics"
        aria-expanded={props.diagnosticsOpen}
        onClick={props.onDiagnostics}
        title="Show publication diagnostics"
      >
        {errors} errors · {warnings} warnings
      </button>
      <div className="zoom-controls" aria-label="Preview zoom">
        <button
          aria-pressed={props.zoomMode === 'fit'}
          onClick={() => props.onZoom('fit')}
        >
          Fit width
        </button>
        <button
          aria-label="Zoom out preview"
          disabled={props.zoom <= 0.25}
          onClick={() =>
            props.onZoom(
              Math.max(0.25, Math.round((props.zoom - 0.1) * 100) / 100),
            )
          }
        >
          −
        </button>
        <button
          className="zoom-value"
          title="Actual size"
          aria-label={`Preview zoom ${Math.round(props.zoom * 100)} percent. Reset to 100 percent`}
          onClick={() => props.onZoom(1)}
        >
          {Math.round(props.zoom * 100)}%
        </button>
        <button
          aria-label="Zoom in preview"
          disabled={props.zoom >= 2}
          onClick={() =>
            props.onZoom(
              Math.min(2, Math.round((props.zoom + 0.1) * 100) / 100),
            )
          }
        >
          +
        </button>
      </div>
    </footer>
  );
}
