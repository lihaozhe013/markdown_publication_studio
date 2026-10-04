import type { ReactElement } from 'react';
import type { PublicationStyleOverrides } from '@markdown-publication/shared';
import { AdvancedStylePanelSections } from './advanced-style-panel-sections.js';
interface AdvancedStylePanelProps {
  styleOverrides: PublicationStyleOverrides;
  dirty: boolean;
  saving: boolean;
  disabled: boolean;
  error: string;
  onChange(styleOverrides: PublicationStyleOverrides): void;
  onApply(): void;
  onCancel(): void;
  onReset(): void;
}
export function AdvancedStylePanel(
  props: AdvancedStylePanelProps,
): ReactElement {
  return (
    <section
      className="advanced-style-panel"
      aria-label="Advanced publication styles"
    >
      <div className="style-panel-scroll">
        <p className="muted style-panel-note">
          Changes preview immediately. Apply &amp; Save stores these styles for
          future publications.
        </p>
        {props.error ? (
          <p className="diagnostic error" role="alert">
            {props.error}
          </p>
        ) : null}
        <fieldset
          className="style-editor-fields"
          disabled={props.saving || props.disabled}
        >
          <AdvancedStylePanelSections
            styleOverrides={props.styleOverrides}
            onChange={props.onChange}
          />
        </fieldset>
      </div>
      <footer className="style-panel-footer">
        <span className="style-panel-footer-status">
          {props.dirty ? 'Unsaved style changes' : 'Saved styles'}
        </span>
        <button
          className="restore-style"
          onClick={props.onReset}
          disabled={props.saving || props.disabled}
        >
          Restore theme defaults
        </button>
        <div>
          <button
            onClick={props.onCancel}
            disabled={props.saving || props.disabled}
          >
            Discard
          </button>
          <button
            className="primary"
            onClick={props.onApply}
            disabled={!props.dirty || props.saving || props.disabled}
          >
            {props.saving ? 'Saving…' : 'Apply & Save'}
          </button>
        </div>
      </footer>
    </section>
  );
}
