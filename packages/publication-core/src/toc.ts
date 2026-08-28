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

function renderTocEntry(entry: TocEntry): string {
  return `<li class="publication-toc-entry publication-toc-entry--level-${entry.level}"><a class="publication-toc-link" href="#${escapeHtml(entry.id)}"><span class="publication-toc-title-text">${escapeHtml(entry.title)}</span></a></li>`;
}

export function renderTableOfContents(options: PublicationTocOptions): string {
  if (options.entries.length === 0) return '';
  const entries = options.entries.map(renderTocEntry);
  return `<nav class="publication-toc ${presetClass(options.preset)}" data-toc="true" aria-labelledby="publication-toc-heading"><h1 id="publication-toc-heading" class="publication-toc-heading">Contents</h1><ol class="publication-toc-list">${entries.join('')}</ol></nav>`;
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
        align-items: flex-start;
        color: var(--fgColor-default, #102a43);
        display: flex;
        flex-direction: column;
        font-family: var(--publication-toc-heading-font, var(--fontStack-sansSerif, Georgia, serif));
        font-size: 26pt;
        font-weight: 700;
        line-height: 1.15;
        margin: 0 0 28pt;
        padding: 0;
      }
      .publication-toc .publication-toc-heading::after {
        border-bottom: 3pt solid var(--publication-toc-accent);
        content: '';
        display: block;
        margin-top: 12pt;
        width: 48pt;
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
        border-radius: 3pt;
        color: inherit;
        display: flex;
        gap: 10pt;
        min-width: 0;
        padding: 6pt 10pt;
        text-decoration: none;
      }
      .publication-toc .publication-toc-link:hover,
      .publication-toc .publication-toc-link:focus-visible {
        background: rgb(47 128 237 / 9%);
        color: var(--publication-toc-accent);
        outline: none;
      }
      .publication-toc .publication-toc-title-text {
        min-width: 0;
        overflow-wrap: anywhere;
      }
      .publication-toc .publication-toc-entry--level-1 {
        font-family: var(--publication-toc-heading-font, var(--fontStack-sansSerif, Georgia, serif));
        font-size: 13pt;
        font-weight: 700;
        margin-top: 16pt;
      }
      .publication-toc .publication-toc-entry--level-1:first-child {
        margin-top: 0;
      }
      .publication-toc .publication-toc-entry--level-1 > .publication-toc-link {
        border-left: 3pt solid var(--publication-toc-accent);
        padding-left: 12pt;
      }
      .publication-toc .publication-toc-entry--level-2 {
        font-size: 11pt;
        margin-left: 24pt;
        margin-top: 7pt;
      }
      .publication-toc .publication-toc-entry--level-2 > .publication-toc-link {
        border-left: 1pt solid rgb(82 96 109 / 35%);
        padding-left: 12pt;
      }
      .publication-toc .publication-toc-entry--level-3 {
        color: var(--fgColor-muted, #52606d);
        font-size: 10pt;
        margin-left: 48pt;
        margin-top: 5pt;
      }
      .publication-toc .publication-toc-entry--level-3 > .publication-toc-link {
        padding-left: 12pt;
      }
      .publication-toc--modern-technical {
        border-top: 5pt solid var(--publication-toc-accent);
        padding-top: 18pt;
      }
      .publication-toc--modern-technical .publication-toc-heading {
        font-family: var(--fontStack-sansSerif, Arial, sans-serif);
        font-size: 23pt;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .publication-toc--modern-technical .publication-toc-heading::after {
        border-bottom-width: 1pt;
        margin-top: 10pt;
        width: 100%;
      }
      .publication-toc--modern-technical .publication-toc-entry {
        border-bottom: 1pt solid rgb(16 35 58 / 15%);
      }
      .publication-toc--modern-technical .publication-toc-link {
        border-radius: 0;
        padding-bottom: 8pt;
        padding-top: 8pt;
      }
      .publication-toc--modern-technical .publication-toc-entry--level-1 {
        color: var(--publication-toc-accent);
        font-size: 11pt;
        margin-top: 0;
      }
      .publication-toc--modern-technical .publication-toc-entry--level-1 > .publication-toc-link {
        border-left: 2pt solid var(--publication-toc-accent);
        padding-left: 10pt;
      }
      .publication-toc--modern-technical .publication-toc-entry--level-2 {
        margin-left: 16pt;
      }
      .publication-toc--modern-technical .publication-toc-entry--level-3 {
        margin-left: 32pt;
      }
      @media screen {
        .publication-toc {
          background: var(--publication-surface-background, white);
          box-shadow: 0 12px 40px rgb(16 35 58 / 12%);
          margin: 0 0 32px;
          padding: 52px 64px;
        }
        .publication-toc--modern-technical {
          padding-top: 52px;
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
