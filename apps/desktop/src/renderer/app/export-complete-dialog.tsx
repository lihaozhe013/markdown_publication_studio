import { useEffect, useRef, useState, type ReactElement } from 'react';
import {
  describeExportOutput,
  exportKindLabel,
  type ExportKind,
} from './export-output.js';
import { StudioIcon } from './studio-icon.js';

interface Props {
  kind: ExportKind;
  outputPath: string;
  onClose(): void;
}

export function ExportCompleteDialog({
  kind,
  outputPath,
  onClose,
}: Props): ReactElement {
  const label = exportKindLabel(kind);
  const { fileName, directory } = describeExportOutput(outputPath);
  const [actionError, setActionError] = useState('');
  const [pending, setPending] = useState<'open' | 'reveal' | null>(null);
  const closeRef = useRef(onClose);
  const dialogRef = useRef<HTMLElement>(null);
  const openRef = useRef<HTMLButtonElement>(null);
  closeRef.current = onClose;

  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    openRef.current?.focus();
    const handleKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [
        ...dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled)',
        ),
      ];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) {
        event.preventDefault();
        dialogRef.current.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, []);

  async function openOutput(): Promise<void> {
    setActionError('');
    setPending('open');
    try {
      await window.desktopApi.export.openOutput(outputPath);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : `Could not open the ${label} file.`,
      );
    } finally {
      setPending(null);
    }
  }

  async function revealOutput(): Promise<void> {
    setActionError('');
    setPending('reveal');
    try {
      await window.desktopApi.export.revealOutput(outputPath);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : 'Could not show the folder that holds the file.',
      );
    } finally {
      setPending(null);
    }
  }

  return (
    <div
      className="export-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="export-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-dialog-title"
        aria-describedby="export-dialog-description"
        tabIndex={-1}
      >
        <div className="export-dialog-heading">
          <span className="export-dialog-badge" aria-hidden="true">
            <StudioIcon name="check" size={18} />
          </span>
          <div>
            <h2 id="export-dialog-title">{label} exported</h2>
            <p id="export-dialog-description" className="export-dialog-file">
              <span className="export-dialog-file-name" title={outputPath}>
                {fileName}
              </span>
              {directory && (
                <span className="export-dialog-file-directory">
                  {directory}
                </span>
              )}
            </p>
          </div>
        </div>
        {actionError && (
          <p className="export-dialog-error" role="alert">
            {actionError}
          </p>
        )}
        <div className="export-dialog-actions">
          <button
            className="export-dialog-reveal"
            type="button"
            onClick={() => void revealOutput()}
            disabled={pending !== null}
          >
            {pending === 'reveal' ? 'Showing…' : 'Show in folder'}
          </button>
          <button
            className="export-dialog-done"
            type="button"
            onClick={onClose}
            disabled={pending !== null}
          >
            Done
          </button>
          <button
            ref={openRef}
            className="primary export-dialog-open"
            type="button"
            onClick={() => void openOutput()}
            disabled={pending !== null}
          >
            {pending === 'open' ? 'Opening…' : `Open ${label}`}
          </button>
        </div>
      </section>
    </div>
  );
}
