import { useEffect } from 'react';
import type { ReactElement } from 'react';
import type { PublicationStyleOverrides } from '@markdown-publication/shared';
import { AdvancedStylePanelSections } from './advanced-style-panel-sections.js';

interface AdvancedStylePanelProps {
  styleOverrides: PublicationStyleOverrides;
  dirty: boolean;
  saving: boolean;
  exporting: boolean;
  canExport: boolean;
  error: string;
  onChange(styleOverrides: PublicationStyleOverrides): void;
  onApply(): void;
  onCancel(): void;
  onReset(): void;
  onExportPdf(): void;
  onExportHtml(): void;
}

export function AdvancedStylePanel({
  styleOverrides,
  dirty,
  saving,
  exporting,
  canExport,
  error,
  onChange,
  onApply,
  onCancel,
  onReset,
  onExportPdf,
  onExportHtml,
}: AdvancedStylePanelProps): ReactElement {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div className="style-panel-backdrop" onMouseDown={onCancel}>
      <aside
        className="advanced-style-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="advanced-style-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="style-panel-header">
          <div>
            <p className="eyebrow">ADVANCED STYLE</p>
            <h2 id="advanced-style-title">Publication styles</h2>
          </div>
          <button
            className="style-panel-close"
            type="button"
            onClick={onCancel}
            aria-label="Close advanced styles"
          >
            ×
          </button>
        </header>

        <p className="style-panel-note">
          Changes update the preview immediately. They are not stored until you
          click Apply &amp; Save.
        </p>
        {error ? (
          <p className="diagnostic error style-panel-error">{error}</p>
        ) : null}

        <AdvancedStylePanelSections
          styleOverrides={styleOverrides}
          onChange={onChange}
        />

        <footer className="style-panel-footer">
          <div className="style-panel-footer-status">
            {dirty ? 'Unsaved changes' : 'Saved style loaded'}
          </div>
          {canExport ? (
            <>
              <button
                className="secondary"
                type="button"
                onClick={onExportPdf}
                disabled={saving || exporting}
              >
                Export PDF
              </button>
              <button
                className="secondary"
                type="button"
                onClick={onExportHtml}
                disabled={saving || exporting}
              >
                Export HTML
              </button>
            </>
          ) : null}
          <button
            className="secondary"
            type="button"
            onClick={onReset}
            disabled={saving}
          >
            Restore theme defaults
          </button>
          <button
            className="secondary"
            type="button"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            className="primary"
            type="button"
            onClick={onApply}
            disabled={!dirty || saving}
          >
            {saving ? 'Saving…' : 'Apply & Save'}
          </button>
        </footer>
      </aside>
    </div>
  );
}
