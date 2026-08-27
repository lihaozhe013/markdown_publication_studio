import type { TocPresetId } from '@markdown-publication/shared';
import type { PublicationTocOptions, TocEntry } from './model.js';

const tocPagePlaceholder = '0000';

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

function renderTocEntry(
  entry: TocEntry,
  options: PublicationTocOptions,
): string {
  const pageNumber = options.showPageNumbers
    ? (options.pageNumbers?.[entry.id] ?? tocPagePlaceholder)
    : undefined;
  const pageColumn =
    pageNumber === undefined
      ? ''
      : `<span class="publication-toc-leader" aria-hidden="true"></span><span class="publication-toc-page" data-toc-page-for="${escapeHtml(entry.id)}">${escapeHtml(pageNumber)}</span>`;

  return `<li class="publication-toc-entry publication-toc-entry--level-${entry.level}"><a class="publication-toc-link" href="#${escapeHtml(entry.id)}"><span class="publication-toc-title-text">${escapeHtml(entry.title)}</span>${pageColumn}</a></li>`;
}

export function renderTableOfContents(options: PublicationTocOptions): string {
  if (options.entries.length === 0) return '';
  const entries = options.entries.map((entry) =>
    renderTocEntry(entry, options),
  );
  return `<section class="publication-toc ${presetClass(options.preset)}" data-toc="true" data-toc-show-pages="${options.showPageNumbers ? 'true' : 'false'}"><h1 class="publication-toc-heading">Contents</h1><ol class="publication-toc-list">${entries.join('')}</ol></section>`;
}

export function getTableOfContentsStylesheet(): string {
  return `
      .publication-toc {
        --publication-toc-accent: var(--fgColor-accent, #2f80ed);
        break-after: page;
        color: var(--fgColor-default, #182230);
        margin: 0;
        padding: 0;
      }
      .publication-toc .publication-toc-heading {
        border: 0;
        border-bottom: 2px solid var(--publication-toc-accent);
        color: var(--fgColor-default, #102a43);
        font-family: var(--fontStack-sansSerif, Georgia, serif);
        font-size: 25pt;
        line-height: 1.15;
        margin: 0 0 28pt;
        padding: 0 0 10pt;
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
        display: grid;
        gap: 0 8pt;
        grid-template-columns: minmax(0, auto) minmax(20pt, 1fr) max-content;
        text-decoration: none;
      }
      .publication-toc .publication-toc-link:hover {
        color: var(--publication-toc-accent);
      }
      .publication-toc .publication-toc-title-text {
        min-width: 0;
        overflow-wrap: anywhere;
      }
      .publication-toc .publication-toc-leader {
        border-bottom: 1px dotted currentColor;
        min-width: 20pt;
        opacity: 0.55;
        position: relative;
        top: -2pt;
      }
      .publication-toc .publication-toc-page {
        font-variant-numeric: tabular-nums;
        min-width: 4ch;
        text-align: right;
      }
      .publication-toc .publication-toc-entry--level-1 {
        font-family: var(--publication-toc-heading-font, var(--fontStack-sansSerif, Georgia, serif));
        font-size: 12pt;
        font-weight: 700;
        margin-top: 12pt;
      }
      .publication-toc .publication-toc-entry--level-2 {
        font-size: 10.5pt;
        margin-left: 16pt;
        margin-top: 7pt;
      }
      .publication-toc .publication-toc-entry--level-3 {
        color: var(--fgColor-muted, #52606d);
        font-size: 9.5pt;
        margin-left: 32pt;
        margin-top: 5pt;
      }
      .publication-toc[data-toc-show-pages='false'] .publication-toc-link {
        display: block;
      }
      .publication-toc--modern-technical {
        border-left: 5pt solid var(--publication-toc-accent);
        padding-left: 18pt;
      }
      .publication-toc--modern-technical .publication-toc-heading {
        border-bottom-width: 1pt;
        font-family: var(--fontStack-sansSerif, Arial, sans-serif);
        font-size: 23pt;
        letter-spacing: 0.02em;
        text-transform: uppercase;
      }
      .publication-toc--modern-technical .publication-toc-entry {
        border-bottom: 1pt solid color-mix(in srgb, currentColor 15%, transparent);
        padding-bottom: 6pt;
        padding-top: 6pt;
      }
      .publication-toc--modern-technical .publication-toc-entry--level-1 {
        color: var(--publication-toc-accent);
        font-size: 11pt;
        margin-top: 4pt;
      }
      .publication-toc--modern-technical .publication-toc-entry--level-2 {
        margin-left: 13pt;
      }
      .publication-toc--modern-technical .publication-toc-entry--level-3 {
        margin-left: 26pt;
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
        .publication-toc {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
         .publication-toc .publication-toc-entry {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
      }
    `;
}
