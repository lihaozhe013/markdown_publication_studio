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
  return `<li class="publication-toc-entry publication-toc-entry--level-${entry.level}"><a class="publication-toc-link" href="#${escapeHtml(entry.id)}"><span class="publication-toc-title-text">${escapeHtml(entry.title)}</span>${label}</a></li>`;
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
  // dotted leaders that run to a right-aligned page column. No accent rails,
  // cards, or hover fills, so the page reads like a book or Word contents page.
  return `
      .publication-toc {
        break-after: page;
        color: var(--fgColor-default, #182230);
        margin: 0;
        padding: 0;
      }
      .publication-toc .publication-toc-heading {
        background: transparent;
        border: 0;
        color: var(--fgColor-default, #102a43);
        font-family: inherit;
        font-size: 18pt;
        font-weight: 600;
        letter-spacing: normal;
        line-height: 1.3;
        margin: 0 0 18pt;
        padding: 0;
        text-align: left;
        text-transform: none;
      }
      .publication-toc .publication-toc-list {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .publication-toc .publication-toc-entry {
        break-inside: avoid;
        margin: 0;
        padding: 0;
      }
      .publication-toc .publication-toc-link {
        align-items: baseline;
        color: inherit;
        display: flex;
        min-width: 0;
        padding: 2.5pt 0;
        text-decoration: none;
      }
      .publication-toc .publication-toc-link:hover {
        text-decoration: underline;
      }
      .publication-toc .publication-toc-link:focus-visible {
        outline: 1pt solid currentColor;
        outline-offset: 2pt;
      }
      .publication-toc .publication-toc-title-text {
        flex: 0 1 auto;
        min-width: 0;
        overflow-wrap: anywhere;
      }
      .publication-toc .publication-toc-dots {
        border-bottom: 1pt dotted currentColor;
        flex: 1 1 auto;
        margin: 0 0.5em;
        min-width: 1.5em;
        opacity: 0.45;
      }
      .publication-toc .publication-toc-page {
        flex: 0 0 auto;
        font-variant-numeric: tabular-nums;
        text-align: right;
        white-space: nowrap;
      }
      .publication-toc .publication-toc-entry--level-1 {
        font-family: inherit;
        font-size: 12pt;
        font-weight: 600;
        margin-top: 10pt;
      }
      .publication-toc .publication-toc-entry--level-1:first-child {
        margin-top: 0;
      }
      .publication-toc .publication-toc-entry--level-2 {
        font-size: 10.5pt;
        margin-left: 1.5em;
      }
      .publication-toc .publication-toc-entry--level-3 {
        color: var(--fgColor-muted, #52606d);
        font-size: 10pt;
        margin-left: 3em;
      }
      .publication-toc--modern-technical {
        font-family: var(--fontStack-sansSerif, Arial, sans-serif);
      }
      .publication-toc--modern-technical .publication-toc-entry--level-1 {
        font-family: inherit;
        font-size: 11pt;
        margin-top: 8pt;
      }
      .publication-toc--modern-technical .publication-toc-dots {
        display: none;
      }
      .publication-toc--modern-technical .publication-toc-title-text {
        flex: 1 1 auto;
      }
      .publication-toc--modern-technical .publication-toc-page {
        margin-left: 0.75em;
      }
      @media screen {
        .publication-toc {
          background: var(--publication-surface-background, white);
          box-shadow: 0 12px 40px rgb(16 35 58 / 12%);
          margin: 0 0 32px;
          padding: 52px 64px;
        }
      }
      @media print {
        .publication-toc,
        .publication-toc .publication-toc-entry {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
      }
    `;
}
