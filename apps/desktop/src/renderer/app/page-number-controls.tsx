import {
  PageNumberFirstPageModeSchema,
  PageNumberFontIdSchema,
  PageNumberStyleSchema,
  type PageNumberSettings,
  type PageNumberFontId,
} from '@markdown-publication/shared';

const pageNumberFonts: readonly { id: PageNumberFontId; name: string }[] = [
  { id: 'inter', name: 'Inter' },
  { id: 'open-sans', name: 'Open Sans' },
  { id: 'source-han-sans', name: 'Source Han Sans SC' },
  { id: 'jetbrains-mono', name: 'JetBrains Mono' },
  { id: 'source-sans-3', name: 'Source Sans 3' },
  { id: 'source-serif-4', name: 'Source Serif 4' },
  { id: 'source-han-serif', name: 'Source Han Serif SC' },
];

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
  return (
    <div className="panel-block page-number-panel">
      <p className="eyebrow">PAGE NUMBERS</p>
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
          onChange={(event) => onFormatChange(event.target.value)}
          onBlur={() => onCommitFormat(settings)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
        <p className="muted page-number-help">
          Use {'{page}'} and {'{pages}'}. Applied to PDF export only.
        </p>

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
