import type { ReactElement } from 'react';
import {
  PublicationFontWeightSchema,
  type PublicationStyleOverrides,
} from '@markdown-publication/shared';
import {
  fontOptions,
  fontWeightOptions,
  NumberField,
  OptionalSelect,
  Section,
  ColorField,
  toFontWeightOptionValue,
  updateHeadingLevel,
  updateStyleSection,
  type BlockquoteStyleOverrides,
  type BodyStyleOverrides,
  type CodeBlockStyleOverrides,
  type DividerStyleOverrides,
  type HeadingStyleOverrides,
  type InlineCodeStyleOverrides,
  type LinkStyleOverrides,
  type MediaStyleOverrides,
  type ParagraphAndListStyleOverrides,
  type TableStyleOverrides,
} from './advanced-style-controls.js';

interface AdvancedStylePanelSectionsProps {
  styleOverrides: PublicationStyleOverrides;
  onChange(styleOverrides: PublicationStyleOverrides): void;
}

export function AdvancedStylePanelSections({
  styleOverrides,
  onChange,
}: AdvancedStylePanelSectionsProps): ReactElement {
  const body = styleOverrides.body;
  const headings = styleOverrides.headings;
  const paragraphAndLists = styleOverrides.paragraphAndLists;
  const links = styleOverrides.links;
  const inlineCode = styleOverrides.inlineCode;
  const codeBlock = styleOverrides.codeBlock;
  const blockquote = styleOverrides.blockquote;
  const table = styleOverrides.table;
  const media = styleOverrides.media;
  const divider = styleOverrides.divider;

  function setBody<Field extends keyof BodyStyleOverrides>(
    field: Field,
    value: BodyStyleOverrides[Field] | undefined,
  ): void {
    onChange(updateStyleSection(styleOverrides, 'body', field, value));
  }

  function setHeadings<Field extends keyof HeadingStyleOverrides>(
    field: Field,
    value: HeadingStyleOverrides[Field] | undefined,
  ): void {
    onChange(updateStyleSection(styleOverrides, 'headings', field, value));
  }

  function setParagraphAndLists<
    Field extends keyof ParagraphAndListStyleOverrides,
  >(
    field: Field,
    value: ParagraphAndListStyleOverrides[Field] | undefined,
  ): void {
    onChange(
      updateStyleSection(styleOverrides, 'paragraphAndLists', field, value),
    );
  }

  function setLinks<Field extends keyof LinkStyleOverrides>(
    field: Field,
    value: LinkStyleOverrides[Field] | undefined,
  ): void {
    onChange(updateStyleSection(styleOverrides, 'links', field, value));
  }

  function setInlineCode<Field extends keyof InlineCodeStyleOverrides>(
    field: Field,
    value: InlineCodeStyleOverrides[Field] | undefined,
  ): void {
    onChange(updateStyleSection(styleOverrides, 'inlineCode', field, value));
  }

  function setCodeBlock<Field extends keyof CodeBlockStyleOverrides>(
    field: Field,
    value: CodeBlockStyleOverrides[Field] | undefined,
  ): void {
    onChange(updateStyleSection(styleOverrides, 'codeBlock', field, value));
  }

  function setBlockquote<Field extends keyof BlockquoteStyleOverrides>(
    field: Field,
    value: BlockquoteStyleOverrides[Field] | undefined,
  ): void {
    onChange(updateStyleSection(styleOverrides, 'blockquote', field, value));
  }

  function setTable<Field extends keyof TableStyleOverrides>(
    field: Field,
    value: TableStyleOverrides[Field] | undefined,
  ): void {
    onChange(updateStyleSection(styleOverrides, 'table', field, value));
  }

  function setMedia<Field extends keyof MediaStyleOverrides>(
    field: Field,
    value: MediaStyleOverrides[Field] | undefined,
  ): void {
    onChange(updateStyleSection(styleOverrides, 'media', field, value));
  }

  function setDivider<Field extends keyof DividerStyleOverrides>(
    field: Field,
    value: DividerStyleOverrides[Field] | undefined,
  ): void {
    onChange(updateStyleSection(styleOverrides, 'divider', field, value));
  }

  return (
    <div className="style-panel-scroll">
      <Section title="Body">
        <OptionalSelect
          id="style-body-font"
          label="Font family"
          value={body?.fontFamily}
          options={fontOptions}
          onChange={(value) => setBody('fontFamily', value)}
        />
        <NumberField
          id="style-body-size"
          label="Font size"
          value={body?.fontSizePt}
          min={6}
          max={72}
          step={0.5}
          unit="pt"
          onChange={(value) => setBody('fontSizePt', value)}
        />
        <OptionalSelect
          id="style-body-weight"
          label="Font weight"
          value={toFontWeightOptionValue(body?.fontWeight)}
          options={fontWeightOptions}
          onChange={(value) => {
            const parsed = PublicationFontWeightSchema.safeParse(
              value === undefined ? undefined : Number(value),
            );
            setBody('fontWeight', parsed.success ? parsed.data : undefined);
          }}
        />
        <ColorField
          id="style-body-color"
          label="Text color"
          value={body?.color}
          onChange={(value) => setBody('color', value)}
        />
        <ColorField
          id="style-body-background"
          label="Content background"
          value={body?.backgroundColor}
          onChange={(value) => setBody('backgroundColor', value)}
        />
        <NumberField
          id="style-body-line-height"
          label="Line height"
          value={body?.lineHeight}
          min={0.8}
          max={3}
          step={0.05}
          unit="×"
          onChange={(value) => setBody('lineHeight', value)}
        />
        <NumberField
          id="style-body-letter-spacing"
          label="Letter spacing"
          value={body?.letterSpacingPt}
          min={-4}
          max={12}
          step={0.1}
          unit="pt"
          onChange={(value) => setBody('letterSpacingPt', value)}
        />
      </Section>

      <Section title="Headings">
        <OptionalSelect
          id="style-heading-font"
          label="Font family"
          value={headings?.fontFamily}
          options={fontOptions}
          onChange={(value) => setHeadings('fontFamily', value)}
        />
        <OptionalSelect
          id="style-heading-weight"
          label="Font weight"
          value={toFontWeightOptionValue(headings?.fontWeight)}
          options={fontWeightOptions}
          onChange={(value) => {
            const parsed = PublicationFontWeightSchema.safeParse(
              value === undefined ? undefined : Number(value),
            );
            setHeadings('fontWeight', parsed.success ? parsed.data : undefined);
          }}
        />
        <ColorField
          id="style-heading-color"
          label="Text color"
          value={headings?.color}
          onChange={(value) => setHeadings('color', value)}
        />
        <NumberField
          id="style-heading-line-height"
          label="Line height"
          value={headings?.lineHeight}
          min={0.8}
          max={3}
          step={0.05}
          unit="×"
          onChange={(value) => setHeadings('lineHeight', value)}
        />
        <div className="heading-level-grid">
          <div className="style-subheading">
            <span>Individual levels</span>
            <small>Leave blank to inherit the theme.</small>
          </div>
          {(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const).map((tag) => {
            const level = headings?.levels?.[tag];
            return (
              <div className="heading-level" key={tag}>
                <h3>{tag.toUpperCase()}</h3>
                <NumberField
                  id={`style-${tag}-size`}
                  label="Size"
                  value={level?.fontSizePt}
                  min={6}
                  max={72}
                  step={0.5}
                  unit="pt"
                  onChange={(value) =>
                    onChange(
                      updateHeadingLevel(
                        styleOverrides,
                        tag,
                        'fontSizePt',
                        value,
                      ),
                    )
                  }
                />
                <NumberField
                  id={`style-${tag}-margin-top`}
                  label="Top spacing"
                  value={level?.marginTopPt}
                  min={0}
                  max={96}
                  step={1}
                  unit="pt"
                  onChange={(value) =>
                    onChange(
                      updateHeadingLevel(
                        styleOverrides,
                        tag,
                        'marginTopPt',
                        value,
                      ),
                    )
                  }
                />
                <NumberField
                  id={`style-${tag}-margin-bottom`}
                  label="Bottom spacing"
                  value={level?.marginBottomPt}
                  min={0}
                  max={96}
                  step={1}
                  unit="pt"
                  onChange={(value) =>
                    onChange(
                      updateHeadingLevel(
                        styleOverrides,
                        tag,
                        'marginBottomPt',
                        value,
                      ),
                    )
                  }
                />
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Paragraphs & lists">
        <NumberField
          id="style-paragraph-spacing"
          label="Paragraph/list spacing"
          value={paragraphAndLists?.paragraphSpacingPt}
          min={0}
          max={96}
          step={1}
          unit="pt"
          onChange={(value) =>
            setParagraphAndLists('paragraphSpacingPt', value)
          }
        />
        <NumberField
          id="style-list-indent"
          label="List indent"
          value={paragraphAndLists?.listIndentPt}
          min={0}
          max={96}
          step={1}
          unit="pt"
          onChange={(value) => setParagraphAndLists('listIndentPt', value)}
        />
        <NumberField
          id="style-list-item-spacing"
          label="List item spacing"
          value={paragraphAndLists?.listItemSpacingPt}
          min={0}
          max={96}
          step={1}
          unit="pt"
          onChange={(value) => setParagraphAndLists('listItemSpacingPt', value)}
        />
      </Section>

      <Section title="Links">
        <ColorField
          id="style-link-color"
          label="Link color"
          value={links?.color}
          onChange={(value) => setLinks('color', value)}
        />
        <OptionalSelect
          id="style-link-underline"
          label="Underline"
          value={
            links?.underline === undefined
              ? undefined
              : links.underline
                ? 'yes'
                : 'no'
          }
          options={[
            { value: 'yes', label: 'Always show' },
            { value: 'no', label: 'Never show' },
          ]}
          onChange={(value) =>
            setLinks(
              'underline',
              value === undefined ? undefined : value === 'yes',
            )
          }
        />
      </Section>

      <Section title="Inline code">
        <OptionalSelect
          id="style-inline-code-font"
          label="Font family"
          value={inlineCode?.fontFamily}
          options={fontOptions}
          onChange={(value) => setInlineCode('fontFamily', value)}
        />
        <NumberField
          id="style-inline-code-size"
          label="Font size"
          value={inlineCode?.fontSizePt}
          min={6}
          max={72}
          step={0.5}
          unit="pt"
          onChange={(value) => setInlineCode('fontSizePt', value)}
        />
        <ColorField
          id="style-inline-code-color"
          label="Text color"
          value={inlineCode?.color}
          onChange={(value) => setInlineCode('color', value)}
        />
        <ColorField
          id="style-inline-code-background"
          label="Background"
          value={inlineCode?.backgroundColor}
          onChange={(value) => setInlineCode('backgroundColor', value)}
        />
        <NumberField
          id="style-inline-code-radius"
          label="Corner radius"
          value={inlineCode?.borderRadiusPt}
          min={0}
          max={16}
          step={1}
          unit="pt"
          onChange={(value) => setInlineCode('borderRadiusPt', value)}
        />
        <NumberField
          id="style-inline-code-padding-horizontal"
          label="Horizontal padding"
          value={inlineCode?.paddingHorizontalPt}
          min={0}
          max={96}
          step={1}
          unit="pt"
          onChange={(value) => setInlineCode('paddingHorizontalPt', value)}
        />
        <NumberField
          id="style-inline-code-padding-vertical"
          label="Vertical padding"
          value={inlineCode?.paddingVerticalPt}
          min={0}
          max={96}
          step={1}
          unit="pt"
          onChange={(value) => setInlineCode('paddingVerticalPt', value)}
        />
      </Section>

      <Section title="Code blocks">
        <OptionalSelect
          id="style-code-block-font"
          label="Font family"
          value={codeBlock?.fontFamily}
          options={fontOptions}
          onChange={(value) => setCodeBlock('fontFamily', value)}
        />
        <NumberField
          id="style-code-block-size"
          label="Font size"
          value={codeBlock?.fontSizePt}
          min={6}
          max={72}
          step={0.5}
          unit="pt"
          onChange={(value) => setCodeBlock('fontSizePt', value)}
        />
        <ColorField
          id="style-code-block-color"
          label="Text color"
          value={codeBlock?.color}
          onChange={(value) => setCodeBlock('color', value)}
        />
        <ColorField
          id="style-code-block-background"
          label="Background"
          value={codeBlock?.backgroundColor}
          onChange={(value) => setCodeBlock('backgroundColor', value)}
        />
        <NumberField
          id="style-code-block-line-height"
          label="Line height"
          value={codeBlock?.lineHeight}
          min={0.8}
          max={3}
          step={0.05}
          unit="×"
          onChange={(value) => setCodeBlock('lineHeight', value)}
        />
        <NumberField
          id="style-code-block-radius"
          label="Corner radius"
          value={codeBlock?.borderRadiusPt}
          min={0}
          max={16}
          step={1}
          unit="pt"
          onChange={(value) => setCodeBlock('borderRadiusPt', value)}
        />
        <NumberField
          id="style-code-block-padding"
          label="Padding"
          value={codeBlock?.paddingPt}
          min={0}
          max={96}
          step={1}
          unit="pt"
          onChange={(value) => setCodeBlock('paddingPt', value)}
        />
      </Section>

      <Section title="Blockquotes">
        <ColorField
          id="style-blockquote-color"
          label="Text color"
          value={blockquote?.color}
          onChange={(value) => setBlockquote('color', value)}
        />
        <ColorField
          id="style-blockquote-background"
          label="Background"
          value={blockquote?.backgroundColor}
          onChange={(value) => setBlockquote('backgroundColor', value)}
        />
        <ColorField
          id="style-blockquote-border"
          label="Border color"
          value={blockquote?.borderColor}
          onChange={(value) => setBlockquote('borderColor', value)}
        />
        <NumberField
          id="style-blockquote-border-width"
          label="Border width"
          value={blockquote?.borderWidthPt}
          min={0}
          max={16}
          step={1}
          unit="pt"
          onChange={(value) => setBlockquote('borderWidthPt', value)}
        />
        <NumberField
          id="style-blockquote-radius"
          label="Corner radius"
          value={blockquote?.borderRadiusPt}
          min={0}
          max={16}
          step={1}
          unit="pt"
          onChange={(value) => setBlockquote('borderRadiusPt', value)}
        />
        <NumberField
          id="style-blockquote-padding"
          label="Padding"
          value={blockquote?.paddingPt}
          min={0}
          max={96}
          step={1}
          unit="pt"
          onChange={(value) => setBlockquote('paddingPt', value)}
        />
      </Section>

      <Section title="Tables">
        <ColorField
          id="style-table-color"
          label="Text color"
          value={table?.color}
          onChange={(value) => setTable('color', value)}
        />
        <ColorField
          id="style-table-border"
          label="Border color"
          value={table?.borderColor}
          onChange={(value) => setTable('borderColor', value)}
        />
        <ColorField
          id="style-table-header-color"
          label="Header text"
          value={table?.headerColor}
          onChange={(value) => setTable('headerColor', value)}
        />
        <ColorField
          id="style-table-header-background"
          label="Header background"
          value={table?.headerBackgroundColor}
          onChange={(value) => setTable('headerBackgroundColor', value)}
        />
        <ColorField
          id="style-table-stripe-background"
          label="Stripe background"
          value={table?.stripeBackgroundColor}
          onChange={(value) => setTable('stripeBackgroundColor', value)}
        />
        <NumberField
          id="style-table-cell-padding"
          label="Cell padding"
          value={table?.cellPaddingPt}
          min={0}
          max={96}
          step={1}
          unit="pt"
          onChange={(value) => setTable('cellPaddingPt', value)}
        />
        <NumberField
          id="style-table-radius"
          label="Corner radius"
          value={table?.borderRadiusPt}
          min={0}
          max={16}
          step={1}
          unit="pt"
          onChange={(value) => setTable('borderRadiusPt', value)}
        />
      </Section>

      <Section title="Images & dividers">
        <NumberField
          id="style-image-radius"
          label="Image corner radius"
          value={media?.imageBorderRadiusPt}
          min={0}
          max={16}
          step={1}
          unit="pt"
          onChange={(value) => setMedia('imageBorderRadiusPt', value)}
        />
        <ColorField
          id="style-divider-color"
          label="Divider color"
          value={divider?.color}
          onChange={(value) => setDivider('color', value)}
        />
        <NumberField
          id="style-divider-thickness"
          label="Divider thickness"
          value={divider?.thicknessPt}
          min={0}
          max={16}
          step={1}
          unit="pt"
          onChange={(value) => setDivider('thicknessPt', value)}
        />
      </Section>
    </div>
  );
}
