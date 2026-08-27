import {
  DEFAULT_PUBLICATION_STYLE_OVERRIDES,
  type PublicationFontId,
  type PublicationStyleOverrides,
} from '@markdown-publication/shared';

const publicationFontFamilies: Record<PublicationFontId, string> = {
  inter: "'Inter', 'Source Han Sans SC', Arial, sans-serif",
  'open-sans': "'Open Sans', 'Source Han Sans SC', Arial, sans-serif",
  'source-han-sans': "'Source Han Sans SC', Arial, sans-serif",
  'jetbrains-mono': "'JetBrains Mono', ui-monospace, monospace",
  'source-sans-3': "'Source Sans 3', 'Source Han Sans SC', Arial, sans-serif",
  'source-serif-4': "'Source Serif 4', 'Source Han Serif SC', Georgia, serif",
  'source-han-serif': "'Source Han Serif SC', Georgia, serif",
};

const headingTags = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;

type BodyStyleOverrides = NonNullable<PublicationStyleOverrides['body']>;
type HeadingStyleOverrides = NonNullable<PublicationStyleOverrides['headings']>;
type HeadingLevelOverride = NonNullable<
  NonNullable<HeadingStyleOverrides['levels']>['h1']
>;
type ParagraphAndListStyleOverrides = NonNullable<
  PublicationStyleOverrides['paragraphAndLists']
>;
type LinkStyleOverrides = NonNullable<PublicationStyleOverrides['links']>;
type InlineCodeStyleOverrides = NonNullable<
  PublicationStyleOverrides['inlineCode']
>;
type CodeBlockStyleOverrides = NonNullable<
  PublicationStyleOverrides['codeBlock']
>;
type BlockquoteStyleOverrides = NonNullable<
  PublicationStyleOverrides['blockquote']
>;
type TableStyleOverrides = NonNullable<PublicationStyleOverrides['table']>;
type MediaStyleOverrides = NonNullable<PublicationStyleOverrides['media']>;
type DividerStyleOverrides = NonNullable<PublicationStyleOverrides['divider']>;

function declaration(property: string, value: string): string {
  return `  ${property}: ${value} !important;`;
}

function point(value: number): string {
  return `${value}pt`;
}

function fontFamily(fontId: PublicationFontId): string {
  return publicationFontFamilies[fontId];
}

function rule(selector: string, declarations: readonly string[]): string {
  if (declarations.length === 0) return '';
  return `${selector} {\n${declarations.join('\n')}\n}`;
}

function pushFontFamily(
  declarations: string[],
  value: PublicationFontId | undefined,
): void {
  if (value !== undefined) {
    declarations.push(declaration('font-family', fontFamily(value)));
  }
}

function pushPoint(
  declarations: string[],
  property: string,
  value: number | undefined,
): void {
  if (value !== undefined) {
    declarations.push(declaration(property, point(value)));
  }
}

function pushColor(
  declarations: string[],
  property: string,
  value: string | undefined,
): void {
  if (value !== undefined) {
    declarations.push(declaration(property, value));
  }
}

function pushLineHeight(
  declarations: string[],
  value: number | undefined,
): void {
  if (value !== undefined) {
    declarations.push(declaration('line-height', String(value)));
  }
}

function pushFontWeight(
  declarations: string[],
  value: BodyStyleOverrides['fontWeight'] | undefined,
): void {
  if (value !== undefined) {
    declarations.push(declaration('font-weight', String(value)));
  }
}

function renderBody(style: BodyStyleOverrides): string[] {
  const declarations: string[] = [];
  pushFontFamily(declarations, style.fontFamily);
  pushPoint(declarations, 'font-size', style.fontSizePt);
  pushFontWeight(declarations, style.fontWeight);
  pushColor(declarations, 'color', style.color);
  pushColor(declarations, 'background-color', style.backgroundColor);
  pushLineHeight(declarations, style.lineHeight);
  pushPoint(declarations, 'letter-spacing', style.letterSpacingPt);
  return [rule('.markdown-body', declarations)];
}

function renderHeadings(style: HeadingStyleOverrides): string[] {
  const commonDeclarations: string[] = [];
  pushFontFamily(commonDeclarations, style.fontFamily);
  pushColor(commonDeclarations, 'color', style.color);
  pushFontWeight(commonDeclarations, style.fontWeight);
  pushLineHeight(commonDeclarations, style.lineHeight);

  const rules = [
    rule(
      '.markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4, .markdown-body h5, .markdown-body h6',
      commonDeclarations,
    ),
  ];

  const levels = style.levels;
  if (levels === undefined) return rules;

  for (const tag of headingTags) {
    const level = levels[tag] as HeadingLevelOverride | undefined;
    if (level === undefined) continue;
    const declarations: string[] = [];
    pushPoint(declarations, 'font-size', level.fontSizePt);
    pushPoint(declarations, 'margin-top', level.marginTopPt);
    pushPoint(declarations, 'margin-bottom', level.marginBottomPt);
    rules.push(rule(`.markdown-body ${tag}`, declarations));
  }

  return rules;
}

function renderParagraphAndLists(
  style: ParagraphAndListStyleOverrides,
): string[] {
  const rules: string[] = [];
  if (style.paragraphSpacingPt !== undefined) {
    rules.push(
      rule('.markdown-body p, .markdown-body ul, .markdown-body ol', [
        declaration('margin-bottom', point(style.paragraphSpacingPt)),
      ]),
    );
  }
  if (style.listIndentPt !== undefined) {
    rules.push(
      rule('.markdown-body ul, .markdown-body ol', [
        declaration('padding-left', point(style.listIndentPt)),
      ]),
    );
  }
  if (style.listItemSpacingPt !== undefined) {
    rules.push(
      rule('.markdown-body li + li', [
        declaration('margin-top', point(style.listItemSpacingPt)),
      ]),
    );
  }
  return rules;
}

function renderLinks(style: LinkStyleOverrides): string[] {
  const declarations: string[] = [];
  pushColor(declarations, 'color', style.color);
  if (style.underline !== undefined) {
    declarations.push(
      declaration(
        'text-decoration-line',
        style.underline ? 'underline' : 'none',
      ),
    );
  }
  return [rule('.markdown-body a', declarations)];
}

function renderInlineCode(style: InlineCodeStyleOverrides): string[] {
  const declarations: string[] = [];
  pushFontFamily(declarations, style.fontFamily);
  pushPoint(declarations, 'font-size', style.fontSizePt);
  pushColor(declarations, 'color', style.color);
  pushColor(declarations, 'background-color', style.backgroundColor);
  pushPoint(declarations, 'border-radius', style.borderRadiusPt);
  pushPoint(declarations, 'padding-left', style.paddingHorizontalPt);
  pushPoint(declarations, 'padding-right', style.paddingHorizontalPt);
  pushPoint(declarations, 'padding-top', style.paddingVerticalPt);
  pushPoint(declarations, 'padding-bottom', style.paddingVerticalPt);
  return [
    rule(
      '.markdown-body code:not(pre code), .markdown-body tt, .markdown-body kbd, .markdown-body samp',
      declarations,
    ),
  ];
}

function renderCodeBlock(style: CodeBlockStyleOverrides): string[] {
  const containerDeclarations: string[] = [];
  pushFontFamily(containerDeclarations, style.fontFamily);
  pushPoint(containerDeclarations, 'font-size', style.fontSizePt);
  pushColor(containerDeclarations, 'color', style.color);
  pushColor(containerDeclarations, 'background-color', style.backgroundColor);
  pushLineHeight(containerDeclarations, style.lineHeight);
  pushPoint(containerDeclarations, 'border-radius', style.borderRadiusPt);
  pushPoint(containerDeclarations, 'padding', style.paddingPt);

  const codeDeclarations: string[] = [];
  pushFontFamily(codeDeclarations, style.fontFamily);
  pushPoint(codeDeclarations, 'font-size', style.fontSizePt);
  pushColor(codeDeclarations, 'color', style.color);

  return [
    rule(
      '.markdown-body pre, .markdown-body .code-block.shiki',
      containerDeclarations,
    ),
    rule(
      '.markdown-body pre code, .markdown-body .code-block.shiki code',
      codeDeclarations,
    ),
  ];
}

function renderBlockquote(style: BlockquoteStyleOverrides): string[] {
  const declarations: string[] = [];
  pushColor(declarations, 'color', style.color);
  pushColor(declarations, 'background-color', style.backgroundColor);
  pushColor(declarations, 'border-left-color', style.borderColor);
  pushPoint(declarations, 'border-left-width', style.borderWidthPt);
  pushPoint(declarations, 'border-radius', style.borderRadiusPt);
  pushPoint(declarations, 'padding', style.paddingPt);
  return [rule('.markdown-body blockquote', declarations)];
}

function renderTable(style: TableStyleOverrides): string[] {
  const rules: string[] = [];
  if (style.color !== undefined) {
    rules.push(
      rule(
        '.markdown-body table, .markdown-body table th, .markdown-body table td',
        [declaration('color', style.color)],
      ),
    );
  }
  if (style.borderColor !== undefined) {
    rules.push(
      rule(
        '.markdown-body table, .markdown-body table th, .markdown-body table td',
        [declaration('border-color', style.borderColor)],
      ),
    );
  }
  if (
    style.headerColor !== undefined ||
    style.headerBackgroundColor !== undefined
  ) {
    const declarations: string[] = [];
    pushColor(declarations, 'color', style.headerColor);
    pushColor(declarations, 'background-color', style.headerBackgroundColor);
    rules.push(rule('.markdown-body table thead th', declarations));
  }
  if (style.stripeBackgroundColor !== undefined) {
    rules.push(
      rule('.markdown-body table tbody tr:nth-child(2n)', [
        declaration('background-color', style.stripeBackgroundColor),
      ]),
    );
  }
  if (style.cellPaddingPt !== undefined) {
    rules.push(
      rule('.markdown-body table th, .markdown-body table td', [
        declaration('padding', point(style.cellPaddingPt)),
      ]),
    );
  }
  if (style.borderRadiusPt !== undefined) {
    rules.push(
      rule('.markdown-body table', [
        declaration('border-radius', point(style.borderRadiusPt)),
      ]),
    );
  }
  return rules;
}

function renderMedia(style: MediaStyleOverrides): string[] {
  return [
    rule('.markdown-body img', [
      ...(style.imageBorderRadiusPt === undefined
        ? []
        : [declaration('border-radius', point(style.imageBorderRadiusPt))]),
    ]),
  ];
}

function renderDivider(style: DividerStyleOverrides): string[] {
  const declarations: string[] = [];
  pushColor(declarations, 'background-color', style.color);
  pushColor(declarations, 'border-color', style.color);
  pushPoint(declarations, 'height', style.thicknessPt);
  return [rule('.markdown-body hr', declarations)];
}

function compactRules(rules: readonly string[]): string {
  return rules.filter((value) => value.length > 0).join('\n\n');
}

export function renderStyleOverrides(
  styleOverrides: PublicationStyleOverrides = DEFAULT_PUBLICATION_STYLE_OVERRIDES,
): string {
  const rules: string[] = [];
  if (styleOverrides.body !== undefined) {
    rules.push(...renderBody(styleOverrides.body));
  }
  if (styleOverrides.headings !== undefined) {
    rules.push(...renderHeadings(styleOverrides.headings));
  }
  if (styleOverrides.paragraphAndLists !== undefined) {
    rules.push(...renderParagraphAndLists(styleOverrides.paragraphAndLists));
  }
  if (styleOverrides.links !== undefined) {
    rules.push(...renderLinks(styleOverrides.links));
  }
  if (styleOverrides.inlineCode !== undefined) {
    rules.push(...renderInlineCode(styleOverrides.inlineCode));
  }
  if (styleOverrides.codeBlock !== undefined) {
    rules.push(...renderCodeBlock(styleOverrides.codeBlock));
  }
  if (styleOverrides.blockquote !== undefined) {
    rules.push(...renderBlockquote(styleOverrides.blockquote));
  }
  if (styleOverrides.table !== undefined) {
    rules.push(...renderTable(styleOverrides.table));
  }
  if (styleOverrides.media !== undefined) {
    rules.push(...renderMedia(styleOverrides.media));
  }
  if (styleOverrides.divider !== undefined) {
    rules.push(...renderDivider(styleOverrides.divider));
  }
  return compactRules(rules);
}

function addFontId(
  fontIds: Set<PublicationFontId>,
  fontId: PublicationFontId | undefined,
): void {
  if (fontId !== undefined) fontIds.add(fontId);
}

export function collectStyleOverrideFontIds(
  styleOverrides: PublicationStyleOverrides = DEFAULT_PUBLICATION_STYLE_OVERRIDES,
): readonly PublicationFontId[] {
  const fontIds = new Set<PublicationFontId>();
  addFontId(fontIds, styleOverrides.body?.fontFamily);
  addFontId(fontIds, styleOverrides.headings?.fontFamily);
  addFontId(fontIds, styleOverrides.inlineCode?.fontFamily);
  addFontId(fontIds, styleOverrides.codeBlock?.fontFamily);
  return [...fontIds];
}
