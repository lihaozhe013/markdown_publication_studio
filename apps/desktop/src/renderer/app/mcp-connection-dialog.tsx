import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import type {
  McpConnectionSetup,
  McpPromptMode,
} from '@markdown-publication/shared/mcp';

interface Props {
  onClose(): void;
}

function formatDiagnostic(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? '{}';
}

export function McpConnectionDialog({ onClose }: Props): ReactElement {
  const [mode, setMode] = useState<McpPromptMode>('configure');
  const [setup, setSetup] = useState<McpConnectionSetup | null>(null);
  const [diagnostics, setDiagnostics] = useState<Record<string, unknown>>({
    status: 'starting',
  });
  const [loading, setLoading] = useState(true);
  const [copyStatus, setCopyStatus] = useState('');
  const [refreshError, setRefreshError] = useState('');
  const closeRef = useRef(onClose);
  const dialogRef = useRef<HTMLElement>(null);
  closeRef.current = onClose;
  const prompt = useMemo(
    () =>
      mode === 'configure' ? setup?.prompts.configure : setup?.prompts.oneTime,
    [mode, setup],
  );

  async function refresh(): Promise<void> {
    setLoading(true);
    setRefreshError('');
    try {
      const next = await window.desktopApi.mcp.getSetup();
      setSetup(next);
      setDiagnostics(next.diagnostics);
    } catch (error) {
      setRefreshError(
        error instanceof Error
          ? error.message
          : 'Could not read MCP connection details.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const firstControl = dialogRef.current?.querySelector<HTMLElement>(
      'button:not(:disabled), textarea, summary, [tabindex="0"]',
    );
    (firstControl ?? dialogRef.current)?.focus();
    const escape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        closeRef.current();
        return;
      }
      if (event.key === 'Tab' && dialogRef.current) {
        const focusable = [
          ...dialogRef.current.querySelectorAll<HTMLElement>(
            'button:not(:disabled), textarea, summary, [tabindex="0"]',
          ),
        ];
        const first = focusable[0];
        const last = focusable.at(-1);
        if (!first || !last) {
          event.preventDefault();
          dialogRef.current.focus();
        } else if (
          event.shiftKey &&
          (document.activeElement === first ||
            !dialogRef.current.contains(document.activeElement))
        ) {
          event.preventDefault();
          last.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last ||
            !dialogRef.current.contains(document.activeElement))
        ) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('keydown', escape);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, []);

  async function copyPrompt(): Promise<void> {
    setCopyStatus('');
    try {
      const result = await window.desktopApi.mcp.copyPrompt(mode);
      if (!result.copied) throw new Error('Clipboard copy was not confirmed.');
      setCopyStatus('Copied');
    } catch (error) {
      setCopyStatus(
        error instanceof Error
          ? `${error.message} Select the prompt below and copy it manually.`
          : 'Copy failed. Select the prompt below and copy it manually.',
      );
    }
  }

  async function refreshDiagnostics(): Promise<void> {
    try {
      setDiagnostics(await window.desktopApi.mcp.getDiagnostics());
    } catch (error) {
      setDiagnostics({
        status: 'unavailable',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function cancelActiveJob(): Promise<void> {
    try {
      const result = await window.desktopApi.mcp.cancelActiveJob();
      setDiagnostics((current) => ({ ...current, activeJob: result ?? null }));
    } catch (error) {
      setDiagnostics((current) => ({
        ...current,
        cancelError: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  const activeJob = diagnostics.activeJob as
    { jobId?: string; status?: string } | undefined;
  const connectionJson = setup
    ? JSON.stringify(
        { command: setup.launch.command, args: setup.launch.args },
        null,
        2,
      )
    : '{}';

  return (
    <div
      className="mcp-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="mcp-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mcp-dialog-title"
        tabIndex={-1}
      >
        <header className="mcp-dialog-header">
          <div>
            <p className="eyebrow">Agent connection</p>
            <h2 id="mcp-dialog-title">Connect AI</h2>
          </div>
          <button
            className="mcp-dialog-close"
            onClick={onClose}
            aria-label="Close Connect AI"
          >
            ×
          </button>
        </header>
        <div className="mcp-dialog-content">
          <p className="mcp-dialog-intro">
            Copy a task prompt and let your agent configure a persistent
            connection or use MCP for one task.
          </p>
          <div
            className="mcp-mode-switch"
            role="tablist"
            aria-label="Connection mode"
          >
            <button
              role="tab"
              aria-selected={mode === 'configure'}
              className={mode === 'configure' ? 'selected' : ''}
              onClick={() => {
                setMode('configure');
                setCopyStatus('');
              }}
            >
              Configure agent
            </button>
            <button
              role="tab"
              aria-selected={mode === 'one-time'}
              className={mode === 'one-time' ? 'selected' : ''}
              onClick={() => {
                setMode('one-time');
                setCopyStatus('');
              }}
            >
              One-time use
            </button>
          </div>
          <div
            className="mcp-launch-status"
            data-available={setup?.launch.available ?? false}
          >
            <span className="mcp-status-dot" aria-hidden="true" />
            <div>
              <strong>
                {loading
                  ? 'Checking application…'
                  : setup?.launch.available
                    ? 'Application is ready to launch locally'
                    : 'Application executable is unavailable'}
              </strong>
              {setup?.launch.error && <p>{setup.launch.error}</p>}
              {refreshError && <p>{refreshError}</p>}
            </div>
            <button
              className="secondary"
              onClick={() => void refresh()}
              disabled={loading}
            >
              Refresh
            </button>
          </div>
          <div className="mcp-command-summary">
            <div>
              <span>Command</span>
              <code>{setup?.launch.command ?? '—'}</code>
            </div>
            <div>
              <span>Arguments</span>
              <code>{setup?.launch.args.join(' ') ?? '—'}</code>
            </div>
            <div>
              <span>Version</span>
              <code>{setup?.launch.version ?? '—'}</code>
            </div>
          </div>
          <div className="mcp-prompt-actions">
            <button
              className="primary"
              onClick={() => void copyPrompt()}
              disabled={loading || !setup?.launch.available || !prompt}
            >
              Copy prompt
            </button>
            {copyStatus && (
              <span
                role="status"
                className={
                  copyStatus === 'Copied'
                    ? 'mcp-copy-success'
                    : 'mcp-copy-error'
                }
              >
                {copyStatus}
              </span>
            )}
          </div>
          <label className="mcp-prompt-label" htmlFor="mcp-prompt-preview">
            Prompt preview
          </label>
          <textarea
            id="mcp-prompt-preview"
            className="mcp-prompt-preview"
            value={prompt ?? ''}
            readOnly
            spellCheck={false}
            onFocus={(event) => event.currentTarget.select()}
          />
          <details className="mcp-details">
            <summary>Connection details</summary>
            <p>
              Generic stdio launch configuration. Your agent translates this to
              its own client format.
            </p>
            <pre>{connectionJson}</pre>
          </details>
          <details
            className="mcp-details"
            onToggle={(event) => {
              if (event.currentTarget.open) void refreshDiagnostics();
            }}
          >
            <summary>MCP diagnostics</summary>
            <div className="mcp-diagnostics-toolbar">
              <span>GUI bridge: {String(diagnostics.status ?? 'unknown')}</span>
              <button
                className="secondary"
                onClick={() => void refreshDiagnostics()}
              >
                Refresh
              </button>
            </div>
            {activeJob &&
              !['succeeded', 'failed', 'cancelled'].includes(
                String(activeJob.status),
              ) && (
                <div className="mcp-active-job">
                  <span>
                    Current GUI task · {activeJob.status ?? 'running'} ·{' '}
                    {activeJob.jobId}
                  </span>
                  <button
                    className="secondary"
                    onClick={() => void cancelActiveJob()}
                  >
                    Cancel task
                  </button>
                </div>
              )}
            <pre>{formatDiagnostic(diagnostics)}</pre>
          </details>
          <p className="mcp-client-note">
            This window checks local launch availability. Your agent reports
            whether its client connected successfully.
          </p>
        </div>
      </section>
    </div>
  );
}
