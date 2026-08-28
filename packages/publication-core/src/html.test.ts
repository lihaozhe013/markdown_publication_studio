import { describe, expect, it } from 'vitest';
import { renderPublicationHtml } from './html.js';
import type { PublicationTocOptions } from './model.js';

describe('publication HTML layout', () => {
  const chapter = {
    id: 'chapter-1',
    sourcePath: '/manuscripts/book.md',
    title: 'Book',
    html: '<h1>Book</h1>',
    tocEntries: [],
    diagnostics: [],
    mermaidDiagramCount: 0,
  };

  it('keeps the default inset page margins without a page background rule', () => {
    const publication = renderPublicationHtml([chapter], {
      title: 'Book',
      themeId: 'rose',
    });

    expect(publication.html).toContain(
      '@page { size: A4; margin: 18mm 16mm 20mm 16mm; }',
    );
    expect(publication.html).not.toContain(
      '@page { size: A4; margin: 18mm 16mm 20mm 16mm; background:',
    );
  });

  it('adds a full-bleed page background while preserving content margins', () => {
    const publication = renderPublicationHtml([chapter], {
      title: 'Book',
      themeId: 'claude',
      pageCanvasMode: 'full-bleed',
    });

    expect(publication.html).toContain(
      '@page { size: A4; margin: 18mm 16mm 20mm 16mm; background: var(--publication-page-background, white); }',
    );
    expect(publication.html).toContain('--publication-page-background: white;');
    expect(publication.html).toContain(
      'background: var(--publication-page-background, white);',
    );
    expect(publication.html).toContain(
      'background: var(--publication-surface-background, white);',
    );
    expect(publication.html).toContain('print-color-adjust: exact;');
  });

  it('uses the selected page size in the print page rule', () => {
    const publication = renderPublicationHtml([chapter], {
      title: 'Book',
      themeId: 'rose',
      pageSize: 'Letter',
    });

    expect(publication.html).toContain(
      '@page { size: Letter; margin: 18mm 16mm 20mm 16mm; }',
    );
  });

  it('places structured style overrides after theme and renderer helper CSS', () => {
    const publication = renderPublicationHtml([chapter], {
      title: 'Book',
      themeId: 'rose',
      stylesheet: '.markdown-body { color: #000000; }',
      styleOverrides: {
        version: 1,
        body: { color: '#403630', fontSizePt: 13 },
      },
    });

    const themeIndex = publication.html.indexOf(
      '.markdown-body { color: #000000; }',
    );
    const helperIndex = publication.html.indexOf(
      '.markdown-body .code-block.shiki code',
    );
    const overrideIndex = publication.html.indexOf(
      'data-publication-style-overrides="true"',
    );

    expect(overrideIndex).toBeGreaterThan(themeIndex);
    expect(overrideIndex).toBeGreaterThan(helperIndex);
    expect(publication.html).toContain('font-size: 13pt !important;');
    expect(publication.html).toContain('color: #403630 !important;');
  });

  it('renders both table-of-contents presets without page references', () => {
    const entries = [
      {
        id: 'heading-book-intro',
        level: 1 as const,
        title: 'Introduction & goals',
        searchText: 'introduction&goals',
        order: 0,
        chapterId: 'book',
        sourcePath: '/manuscripts/book.md',
      },
      {
        id: 'heading-book-details',
        level: 2 as const,
        title: 'Details',
        searchText: 'details',
        order: 1,
        chapterId: 'book',
        sourcePath: '/manuscripts/book.md',
      },
    ];
    const toc: PublicationTocOptions = {
      preset: 'classic-book',
      entries,
    };
    const classic = renderPublicationHtml([chapter], {
      title: 'Book',
      themeId: 'rose',
      toc,
    });
    const modern = renderPublicationHtml([chapter], {
      title: 'Book',
      themeId: 'rose',
      toc: { ...toc, preset: 'modern-technical' },
    });

    expect(classic.html).toContain('data-toc="true"');
    expect(classic.html).toContain('publication-toc--classic-book');
    expect(classic.html).toContain('href="#heading-book-intro"');
    expect(classic.html).not.toContain('data-toc-page-for=');
    expect(classic.html).not.toContain('publication-toc-leader');
    expect(modern.html).toContain('publication-toc--modern-technical');
    expect(modern.html).not.toContain('data-toc-page-for=');
    expect(modern.html.indexOf('data-toc="true"')).toBeLessThan(
      modern.html.indexOf('<article'),
    );
  });
});
