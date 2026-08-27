import { describe, expect, it } from 'vitest';
import {
  getTableOfContentsStylesheet,
  normalizeTocText,
  renderTableOfContents,
} from './toc.js';
import type { PublicationTocOptions, TocEntry } from './model.js';

const entries: TocEntry[] = [
  {
    id: 'heading-guide-intro',
    level: 1,
    title: 'Introduction & scope',
    searchText: 'introduction&scope',
    order: 0,
    chapterId: 'guide',
    sourcePath: '/manuscripts/guide.md',
  },
  {
    id: 'heading-guide-setup',
    level: 2,
    title: 'Setup',
    searchText: 'setup',
    order: 1,
    chapterId: 'guide',
    sourcePath: '/manuscripts/guide.md',
  },
];

describe('table of contents rendering', () => {
  it('normalizes whitespace, compatibility characters, and case for matching', () => {
    expect(normalizeTocText('  Ａ  Guide\u200B  ')).toBe('aguide');
    expect(normalizeTocText('中文 标题')).toBe('中文标题');
  });

  it('renders escaped links, hierarchy, placeholders, and resolved page labels', () => {
    const options: PublicationTocOptions = {
      preset: 'classic-book',
      entries,
      showPageNumbers: true,
    };
    const placeholder = renderTableOfContents(options);
    const resolved = renderTableOfContents({
      ...options,
      pageNumbers: {
        'heading-guide-intro': '2',
        'heading-guide-setup': '3',
      },
    });

    expect(placeholder).toContain('data-toc="true"');
    expect(placeholder).toContain('>0000</span>');
    expect(placeholder).toContain('publication-toc-entry--level-2');
    expect(placeholder).toContain('href="#heading-guide-intro"');
    expect(placeholder).toContain('Introduction &amp; scope');
    expect(resolved).toContain('data-toc-page-for="heading-guide-intro">2');
    expect(resolved).toContain('data-toc-page-for="heading-guide-setup">3');
  });

  it('keeps the hierarchy when page references are disabled', () => {
    const html = renderTableOfContents({
      preset: 'modern-technical',
      entries,
      showPageNumbers: false,
    });

    expect(html).toContain('publication-toc--modern-technical');
    expect(html).toContain('data-toc-show-pages="false"');
    expect(html).not.toContain('publication-toc-page');
    expect(html).not.toContain('publication-toc-leader');
  });

  it('provides both preset layout hooks and print pagination rules', () => {
    const stylesheet = getTableOfContentsStylesheet();

    expect(stylesheet).toContain('.publication-toc--modern-technical');
    expect(stylesheet).toContain('.publication-toc-entry--level-3');
    expect(stylesheet).toContain('break-after: page');
  });

  it('does not create an empty contents section', () => {
    expect(
      renderTableOfContents({
        preset: 'classic-book',
        entries: [],
        showPageNumbers: true,
      }),
    ).toBe('');
  });
});
