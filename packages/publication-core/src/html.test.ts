import { describe, expect, it } from 'vitest';
import { renderPublicationHtml } from './html.js';

describe('publication HTML layout', () => {
  const chapter = {
    id: 'chapter-1',
    sourcePath: '/manuscripts/book.md',
    title: 'Book',
    html: '<h1>Book</h1>',
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
});
