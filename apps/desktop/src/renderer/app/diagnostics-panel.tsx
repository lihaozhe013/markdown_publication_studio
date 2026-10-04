import type { ReactElement } from 'react';
import type { PublicationDiagnostic } from '@markdown-publication/shared';
import { StudioIcon } from './studio-icon.js';
export function DiagnosticsPanel({
  diagnostics,
  open,
  onClose,
}: {
  diagnostics: PublicationDiagnostic[];
  open: boolean;
  onClose(): void;
}): ReactElement {
  return (
    <section
      className="diagnostics-panel"
      hidden={!open}
      id="publication-diagnostics"
      aria-label="Publication diagnostics"
    >
      <header>
        <h2>
          Diagnostics <span>{diagnostics.length}</span>
        </h2>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close diagnostics"
        >
          <StudioIcon name="close" />
        </button>
      </header>
      <div className="diagnostics-scroll">
        {diagnostics.length === 0 ? (
          <p className="diagnostics-empty">
            <StudioIcon name="check" />
            No diagnostics.
          </p>
        ) : (
          <ul>
            {diagnostics.map((diagnostic, index) => (
              <li
                key={`${diagnostic.code}-${index}`}
                className={`diagnostic-row ${diagnostic.severity}`}
              >
                <span className="diagnostic-severity">
                  {diagnostic.severity}
                </span>
                <div>
                  <p>{diagnostic.message}</p>
                  <span className="diagnostic-location">
                    {diagnostic.code}
                    {diagnostic.sourcePath
                      ? ` · ${diagnostic.sourcePath}${diagnostic.line !== undefined ? `:${diagnostic.line}` : ''}`
                      : ''}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
