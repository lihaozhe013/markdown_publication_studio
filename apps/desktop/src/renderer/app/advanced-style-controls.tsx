import { useEffect, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import {
  PublicationFontWeightSchema,
  PublicationHexColorSchema,
  type PublicationStyleOverrides,
} from '@markdown-publication/shared';

export const fontOptions = [
  { value: 'inter', label: 'Inter' },
  { value: 'open-sans', label: 'Open Sans' },
  { value: 'source-han-sans', label: 'Source Han Sans SC' },
  { value: 'source-sans-3', label: 'Source Sans 3' },
  { value: 'source-serif-4', label: 'Source Serif 4' },
  { value: 'source-han-serif', label: 'Source Han Serif SC' },
  { value: 'jetbrains-mono', label: 'JetBrains Mono' },
] as const;

export const fontWeightOptions = [
  { value: '300', label: '300 — Light' },
  { value: '400', label: '400 — Regular' },
  { value: '500', label: '500 — Medium' },
  { value: '600', label: '600 — Semibold' },
  { value: '700', label: '700 — Bold' },
  { value: '800', label: '800 — Extra bold' },
] as const;

type FontWeightOptionValue = (typeof fontWeightOptions)[number]['value'];

export type BodyStyleOverrides = NonNullable<PublicationStyleOverrides['body']>;
export type HeadingStyleOverrides = NonNullable<
  PublicationStyleOverrides['headings']
>;
export type HeadingLevels = NonNullable<HeadingStyleOverrides['levels']>;
export type HeadingLevelOverride = NonNullable<HeadingLevels['h1']>;
export type ParagraphAndListStyleOverrides = NonNullable<
  PublicationStyleOverrides['paragraphAndLists']
>;
export type LinkStyleOverrides = NonNullable<
  PublicationStyleOverrides['links']
>;
export type InlineCodeStyleOverrides = NonNullable<
  PublicationStyleOverrides['inlineCode']
>;
export type CodeBlockStyleOverrides = NonNullable<
  PublicationStyleOverrides['codeBlock']
>;
export type BlockquoteStyleOverrides = NonNullable<
  PublicationStyleOverrides['blockquote']
>;
export type TableStyleOverrides = NonNullable<
  PublicationStyleOverrides['table']
>;
export type MediaStyleOverrides = NonNullable<
  PublicationStyleOverrides['media']
>;
export type DividerStyleOverrides = NonNullable<
  PublicationStyleOverrides['divider']
>;

export function toFontWeightOptionValue(
  value: number | undefined,
): FontWeightOptionValue | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = PublicationFontWeightSchema.safeParse(value);
  return parsed.success
    ? (String(parsed.data) as FontWeightOptionValue)
    : undefined;
}

type StyleSectionKey = Exclude<keyof PublicationStyleOverrides, 'version'>;

export function updateStyleSection<
  Key extends StyleSectionKey,
  Section extends NonNullable<PublicationStyleOverrides[Key]>,
  Field extends keyof Section,
>(
  current: PublicationStyleOverrides,
  sectionKey: Key,
  field: Field,
  value: Section[Field] | undefined,
): PublicationStyleOverrides {
  const nextSection = {
    ...((current[sectionKey] as Section | undefined) ?? {}),
  } as Section;
  if (value === undefined) {
    delete nextSection[field];
  } else {
    nextSection[field] = value;
  }

  const next = { ...current } as Partial<PublicationStyleOverrides>;
  if (Object.keys(nextSection).length === 0) {
    delete next[sectionKey];
  } else {
    next[sectionKey] = nextSection;
  }
  return next as PublicationStyleOverrides;
}

export function updateHeadingLevel(
  current: PublicationStyleOverrides,
  tag: keyof HeadingLevels,
  field: keyof HeadingLevelOverride,
  value: HeadingLevelOverride[typeof field] | undefined,
): PublicationStyleOverrides {
  const headings = current.headings ?? {};
  const levels = { ...(headings.levels ?? {}) } as HeadingLevels;
  const nextLevel = { ...((levels[tag] ?? {}) as HeadingLevelOverride) };
  if (value === undefined) {
    delete nextLevel[field];
  } else {
    nextLevel[field] = value;
  }

  if (Object.keys(nextLevel).length === 0) {
    delete levels[tag];
  } else {
    levels[tag] = nextLevel;
  }
  return updateStyleSection(
    current,
    'headings',
    'levels',
    Object.keys(levels).length === 0 ? undefined : levels,
  );
}

interface FieldProps {
  id: string;
  label: string;
  hint?: string | undefined;
}

interface OptionalSelectProps<T extends string> extends FieldProps {
  value: T | undefined;
  options: readonly { value: T; label: string }[];
  onChange(value: T | undefined): void;
}

interface NumberFieldProps extends FieldProps {
  value: number | undefined;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange(value: number | undefined): void;
}

interface ColorFieldProps extends FieldProps {
  value: string | undefined;
  onChange(value: string | undefined): void;
}

function FieldLabel({ id, label, hint }: FieldProps): ReactElement {
  return (
    <label className="style-field-label" htmlFor={id}>
      <span>{label}</span>
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

export function OptionalSelect<T extends string>({
  id,
  label,
  hint,
  value,
  options,
  onChange,
}: OptionalSelectProps<T>): ReactElement {
  return (
    <div className="style-field">
      <FieldLabel id={id} label={label} hint={hint} />
      <select
        id={id}
        value={value ?? ''}
        onChange={(event) => {
          const nextValue = event.target.value;
          onChange(nextValue === '' ? undefined : (nextValue as T));
        }}
      >
        <option value="">Theme default</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function NumberField({
  id,
  label,
  hint,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: NumberFieldProps): ReactElement {
  return (
    <div className="style-field">
      <FieldLabel id={id} label={label} hint={hint} />
      <div className="style-number-input">
        <input
          id={id}
          type="number"
          value={value ?? ''}
          min={min}
          max={max}
          step={step}
          placeholder="Theme default"
          onChange={(event) => {
            const rawValue = event.target.value.trim();
            if (rawValue === '') {
              onChange(undefined);
              return;
            }
            const nextValue = Number(rawValue);
            if (
              Number.isFinite(nextValue) &&
              nextValue >= min &&
              nextValue <= max
            ) {
              onChange(nextValue);
            }
          }}
        />
        <span>{unit}</span>
      </div>
    </div>
  );
}

export function ColorField({
  id,
  label,
  hint,
  value,
  onChange,
}: ColorFieldProps): ReactElement {
  const [textValue, setTextValue] = useState(value ?? '');

  useEffect(() => {
    setTextValue(value ?? '');
  }, [value]);

  return (
    <div className="style-field">
      <FieldLabel id={id} label={label} hint={hint} />
      <div className="style-color-input">
        <input
          aria-label={`${label} color picker`}
          type="color"
          value={value ?? '#000000'}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
        />
        <input
          id={id}
          type="text"
          value={textValue}
          placeholder="Theme default"
          maxLength={7}
          onChange={(event) => {
            const nextValue = event.target.value.trim();
            setTextValue(nextValue);
            if (nextValue === '') {
              onChange(undefined);
            } else if (PublicationHexColorSchema.safeParse(nextValue).success) {
              onChange(nextValue.toUpperCase());
            }
          }}
          onBlur={() => {
            if (
              textValue !== '' &&
              !PublicationHexColorSchema.safeParse(textValue).success
            ) {
              setTextValue(value ?? '');
            }
          }}
        />
        {value ? (
          <button
            className="style-clear-button"
            type="button"
            onClick={() => onChange(undefined)}
            aria-label={`Use theme default for ${label}`}
          >
            ×
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}): ReactElement {
  return (
    <details className="style-section" open>
      <summary>{title}</summary>
      <div className="style-section-content">{children}</div>
    </details>
  );
}
