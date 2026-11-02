import type { TocPresetId } from '@markdown-publication/shared';
import type { PublicationTocOptions, TocEntry } from './model.js';

export function normalizeTocText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/gu, '')
    .replace(/\s+/gu, '')
    .toLowerCase();
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function presetClass(preset: TocPresetId): string {
  return `publication-toc--${preset}`;
}

function renderTocEntry(entry: TocEntry, pageReferences: boolean): string {
  // Leaders only make sense when a page label closes the row; without one the
  // title simply ends the line.
  const label = pageReferences
    ? `<span class="publication-toc-dots" aria-hidden="true"></span><span class="publication-toc-page" data-toc-page-for="${escapeHtml(entry.id)}"></span>`
    : '';
  const number = entry.number
    ? `<span class="publication-toc-number">${escapeHtml(entry.number)}</span>`
    : '';
  return `<li class="publication-toc-entry publication-toc-entry--level-${entry.level}"><a class="publication-toc-link" href="#${escapeHtml(entry.id)}">${number}<span class="publication-toc-title-text">${escapeHtml(entry.title)}</span>${label}</a></li>`;
}

export function renderTableOfContents(options: PublicationTocOptions): string {
  if (options.entries.length === 0) return '';
  const entries = options.entries.map((entry) =>
    renderTocEntry(entry, options.pageReferences === true),
  );
  return `<nav class="publication-toc ${presetClass(options.preset)}" data-toc="true" aria-labelledby="publication-toc-heading"><h1 id="publication-toc-heading" class="publication-toc-heading">Contents</h1><ol class="publication-toc-list">${entries.join('')}</ol></nav>`;
}

export function getTableOfContentsStylesheet(): string {
  // Plain, print-first typography: a left-aligned heading, indented levels, and
  // dotted leaders that run to a right-aligned page column. Every rule is scoped
  // through `[data-toc]` so theme heading and link rules cannot override the
  // contents layout; user style overrides still win because they use !important.
  return `
      .publication-toc[data-toc] {
        break-after: page;
        color: var(--fgColor-default, #182230);
        margin: 0;
        padding: 0;
      }
      .publication-toc[data-toc] .publication-toc-heading {
        background: transparent;
        border: 0;
        color: var(--fgColor-default, #102a43);
        font-family: inherit;
        font-size: 18pt;
        font-weight: 600;
        letter-spacing: normal;
        line-height: 1.25;
        margin: 0 0 20pt;
        padding: 0;
        text-align: left;
        text-transform: none;
      }
      .publication-toc[data-toc] .publication-toc-list {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .publication-toc[data-toc] .publication-toc-entry {
        break-inside: avoid;
        margin: 0;
        padding: 0;
      }
      .publication-toc[data-toc] .publication-toc-link {
        align-items: baseline;
        color: inherit;
        display: flex;
        min-width: 0;
        padding: 2.5pt 0;
        text-decoration: none;
      }
      .publication-toc[data-toc] .publication-toc-link:hover {
        text-decoration: underline;
      }
      .publication-toc[data-toc] .publication-toc-link:focus-visible {
        outline: 1pt solid currentColor;
        outline-offset: 2pt;
      }
      .publication-toc[data-toc] .publication-toc-title-text {
        flex: 0 1 auto;
        min-width: 0;
        overflow-wrap: anywhere;
      }
      .publication-toc[data-toc] .publication-toc-number {
        flex: 0 0 auto;
        font-variant-numeric: tabular-nums;
        margin-right: 0.5em;
      }
      /* Leaders are drawn as a repeating radial gradient instead of a dotted
         border: border dots scale with the border width (about 1.3px) and read
         as a hairline, while a gradient keeps an exact 1.2pt dot at a 4pt
         rhythm. The empty box collapses to zero height, so its bottom edge sits
         on the text baseline; the padding lifts the dot band to the middle of
         lowercase letters, matching a middle-dot leader. */
      .publication-toc[data-toc] .publication-toc-dots {
        background-image: radial-gradient(
          circle at 50% 50%,
          currentColor 0 0.6pt,
          transparent 0.62pt
        );
        background-position: 0 50%;
        background-repeat: repeat-x;
        background-size: 4pt 1.2pt;
        flex: 1 1 auto;
        height: 0;
        margin: 0 0.4em;
        min-width: 1.5em;
        opacity: 0.55;
        padding-bottom: 0.46em;
      }
      .publication-toc[data-toc] .publication-toc-page {
        flex: 0 0 auto;
        font-size: 10pt;
        font-variant-numeric: tabular-nums;
        text-align: right;
        white-space: nowrap;
      }
      .publication-toc[data-toc] .publication-toc-entry--level-1 {
        font-size: 12pt;
        font-weight: 600;
        margin-top: 12pt;
      }
      .publication-toc[data-toc] .publication-toc-entry--level-1:first-child {
        margin-top: 0;
      }
      .publication-toc[data-toc] .publication-toc-entry--level-2 {
        font-size: 11pt;
        margin-left: 14pt;
      }
      .publication-toc[data-toc] .publication-toc-entry--level-3 {
        color: var(--fgColor-muted, #52606d);
        font-size: 10.5pt;
        margin-left: 28pt;
      }
      .publication-toc--modern-technical[data-toc] {
        font-family: var(--fontStack-sansSerif, Arial, sans-serif);
      }
      .publication-toc--modern-technical[data-toc] .publication-toc-entry--level-1 {
        font-size: 11pt;
        margin-top: 10pt;
      }
      .publication-toc--modern-technical[data-toc] .publication-toc-dots {
        display: none;
      }
      .publication-toc--modern-technical[data-toc] .publication-toc-title-text {
        flex: 1 1 auto;
      }
      .publication-toc--modern-technical[data-toc] .publication-toc-page {
        margin-left: 0.75em;
      }
      @media screen {
        .publication-toc[data-toc] {
          background: var(--publication-surface-background, white);
          box-shadow: 0 12px 40px rgb(16 35 58 / 12%);
          margin: 0 0 32px;
          padding: 52px 64px;
        }
      }
      @media print {
        .publication-toc[data-toc],
        .publication-toc[data-toc] .publication-toc-entry {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
      }
    `;
}
