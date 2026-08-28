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

  it('renders escaped links and a hierarchy without page references', () => {
    const options: PublicationTocOptions = {
      preset: 'classic-book',
      entries,
    };
    const html = renderTableOfContents(options);

    expect(html).toContain('data-toc="true"');
    expect(html).toContain('publication-toc-entry--level-2');
    expect(html).toContain('href="#heading-guide-intro"');
    expect(html).toContain('Introduction &amp; scope');
    expect(html).not.toContain('data-toc-page-for=');
    expect(html).not.toContain('publication-toc-leader');
    expect(html).not.toContain('0000');
  });

  it('provides hierarchy-focused preset hooks and print pagination rules', () => {
    const stylesheet = getTableOfContentsStylesheet();

    expect(stylesheet).toContain('.publication-toc--modern-technical');
    expect(stylesheet).toContain('.publication-toc-entry--level-3');
    expect(stylesheet).toContain('display: flex');
    expect(stylesheet).not.toContain('publication-toc-leader');
    expect(stylesheet).toContain('break-after: page');
  });

  it('does not create an empty contents section', () => {
    expect(
      renderTableOfContents({
        preset: 'classic-book',
        entries: [],
      }),
    ).toBe('');
  });
});
