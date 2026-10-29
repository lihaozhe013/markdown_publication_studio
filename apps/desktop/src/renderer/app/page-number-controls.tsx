import { useState } from 'react';
import {
  PageNumberFirstPageModeSchema,
  PageNumberFontIdSchema,
  PageNumberStyleSchema,
  isSupportedPageNumberFormatCharacter,
  type PageNumberSettings,
  type PageNumberFontId,
} from '@markdown-publication/shared';

const pageNumberFonts: readonly { id: PageNumberFontId; name: string }[] = [
  { id: 'inter', name: 'Inter' },
  { id: 'open-sans', name: 'Open Sans' },
  { id: 'jetbrains-mono', name: 'JetBrains Mono' },
  { id: 'source-sans-3', name: 'Source Sans 3' },
  { id: 'source-serif-4', name: 'Source Serif 4' },
];

interface PageNumberFormatInput {
  value: string;
  removed: string[];
}

export function filterPageNumberFormatInput(
  value: string,
): PageNumberFormatInput {
  const kept: string[] = [];
  const removed = new Set<string>();
  for (const character of Array.from(value)) {
    if (isSupportedPageNumberFormatCharacter(character)) {
      kept.push(character);
    } else {
      removed.add(character);
    }
  }
  return { value: kept.join(''), removed: [...removed] };
}

interface PageNumberControlsProps {
  disabled: boolean;
  error: string;
  settings: PageNumberSettings;
  onCommitFormat: (settings: PageNumberSettings) => void;
  onFieldChange: <K extends keyof PageNumberSettings>(
    key: K,
    value: PageNumberSettings[K],
  ) => void;
  onFormatChange: (format: string) => void;
}

export function PageNumberControls({
  disabled,
  error,
  settings,
  onCommitFormat,
  onFieldChange,
  onFormatChange,
}: PageNumberControlsProps): React.JSX.Element {
  const [removedCharacters, setRemovedCharacters] = useState<readonly string[]>(
    [],
  );

  function handleFormatInput(value: string): void {
    const filtered = filterPageNumberFormatInput(value);
    setRemovedCharacters(filtered.removed);
    onFormatChange(filtered.value);
  }

  return (
    <div className="panel-block page-number-panel">
      <p className="eyebrow">
        PAGE NUMBERS <span className="pdf-badge">PDF</span>
      </p>
      <label className="toggle-row" htmlFor="page-number-enabled">
        <input
          id="page-number-enabled"
          type="checkbox"
          checked={settings.enabled}
          disabled={disabled}
          onChange={(event) => onFieldChange('enabled', event.target.checked)}
        />
        <span>Enable page numbers</span>
      </label>
      <fieldset
        className="page-number-controls"
        disabled={disabled || !settings.enabled}
      >
        <label htmlFor="page-number-font">Font</label>
        <select
          id="page-number-font"
          value={settings.fontFamily}
          aria-describedby="page-number-font-help"
          onChange={(event) => {
            const parsed = PageNumberFontIdSchema.safeParse(event.target.value);
            if (parsed.success) onFieldChange('fontFamily', parsed.data);
          }}
        >
          {pageNumberFonts.map((font) => (
            <option key={font.id} value={font.id}>
              {font.name}
            </option>
          ))}
        </select>
        <p className="muted page-number-help" id="page-number-font-help">
          CJK fonts are not offered for page numbers because embedding one adds
          tens of megabytes to every PDF.
        </p>

        <label htmlFor="page-number-size">Size (pt)</label>
        <input
          id="page-number-size"
          type="number"
          min="6"
          max="24"
          step="0.5"
          value={settings.fontSizePt}
          onChange={(event) =>
            onFieldChange('fontSizePt', Number(event.target.value))
          }
        />

        <label htmlFor="page-number-style">Style</label>
        <select
          id="page-number-style"
          value={settings.style}
          onChange={(event) => {
            const parsed = PageNumberStyleSchema.safeParse(event.target.value);
            if (parsed.success) onFieldChange('style', parsed.data);
          }}
        >
          <option value="normal">Regular</option>
          <option value="bold">Bold</option>
          <option value="italic">Italic</option>
        </select>

        <label htmlFor="page-number-format">Format</label>
        <input
          id="page-number-format"
          type="text"
          value={settings.format}
          maxLength={160}
          spellCheck={false}
          aria-describedby="page-number-format-help"
          onChange={(event) => handleFormatInput(event.target.value)}
          onBlur={() => onCommitFormat(settings)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
        <p className="muted page-number-help" id="page-number-format-help">
          Use {'{page}'} and {'{pages}'} with basic Latin letters, digits, and
          punctuation. Applied to PDF export only.
        </p>
        {removedCharacters.length > 0 ? (
          <p
            className="diagnostic error page-number-help"
            role="status"
            aria-live="polite"
          >
            Removed unsupported{' '}
            {removedCharacters.length === 1 ? 'character' : 'characters'}:{' '}
            {removedCharacters.join(' ')}. Page numbers support basic Latin text
            only.
          </p>
        ) : null}

        <label htmlFor="page-number-first-page">First page</label>
        <select
          id="page-number-first-page"
          value={settings.firstPageMode}
          onChange={(event) => {
            const parsed = PageNumberFirstPageModeSchema.safeParse(
              event.target.value,
            );
            if (parsed.success) onFieldChange('firstPageMode', parsed.data);
          }}
        >
          <option value="all-pages">Show every page from 1</option>
          <option value="hide-first-start-at-1">
            Hide first page, then start at 1
          </option>
          <option value="hide-first-start-at-2">
            Hide first page, then start at 2
          </option>
        </select>
      </fieldset>
      {error ? <p className="diagnostic error">{error}</p> : null}
    </div>
  );
}
