import MarkdownIt from 'markdown-it';
import { describe, expect, it } from 'vitest';
import { registerLayoutControls } from './layout-controls.js';
import { createMarkdownCompiler } from './markdown.js';
import { prepareMath } from './math.js';

function parser(): InstanceType<typeof MarkdownIt> {
  const markdown = new MarkdownIt({ html: true });
  registerLayoutControls(markdown);
  return markdown;
}

describe('page-ending layout controls', () => {
  it('creates a source-linked block even without surrounding blank lines', () => {
    const markdown = parser();
    const tokens = markdown.parse('First\n\\clearpage\nSecond', {});
    const control = tokens.find(
      (token) => token.type === 'publication_clearpage',
    );
    expect(control?.map).toEqual([1, 2]);
    expect(markdown.render('First\n\\clearpage\nSecond')).toContain(
      'class="publication-page-break" data-layout-line="2"',
    );
  });

  it('suppresses leading, trailing, and consecutive empty pages', () => {
    const markdown = parser();
    const source = [
      '\\clearpage',
      '\\clearpage',
      '',
      'First',
      '',
      '\\clearpage',
      '\\clearpage',
      '',
      'Second',
      '',
      '\\clearpage',
    ].join('\n');
    const controls = markdown
      .parse(source, {})
      .filter((token) => token.type === 'publication_clearpage');
    expect(controls).toHaveLength(1);
    expect(controls[0]?.map).toEqual([5, 6]);
  });

  it('parses a standalone page-template switch as a page boundary', () => {
    const markdown = parser();
    const source = ['First', '\\pagetemplate{section}', 'Second'].join('\n');
    const token = markdown
      .parse(source, {})
      .find((item) => item.type === 'publication_pagetemplate');
    expect(token?.map).toEqual([1, 2]);
    expect(token?.meta).toEqual({ template: 'section' });
    expect(markdown.render(source)).toContain(
      'class="publication-page-break publication-page-template publication-page-template--section" data-page-template="section" data-layout-line="2"',
    );
  });

  it('rejects unsafe or malformed template names and literal contexts', () => {
    const markdown = parser();
    const source = [
      '\\pagetemplate{Section One}',
      '',
      '```text',
      '\\pagetemplate{section}',
      '```',
      '',
      'Inline \\pagetemplate{section} text.',
      '',
      '    \\pagetemplate{section}',
    ].join('\n');
    const templates = markdown
      .parse(source, {})
      .filter((token) => token.type === 'publication_pagetemplate');
    expect(templates).toHaveLength(1);
    expect(templates[0]?.meta).toEqual({ template: 'invalid' });
    expect(markdown.render(source)).toContain('data-page-template="invalid"');
  });

  it('does not interpret directives inside literal Markdown blocks', () => {
    const source = [
      '```text',
      '\\clearpage',
      '```',
      '',
      '    \\clearpage',
      '',
      '<pre>',
      '\\clearpage',
      '</pre>',
      '',
      '`\\clearpage`',
      '',
      'A \\clearpage on an ordinary line.',
      '',
      '\\\\clearpage',
    ].join('\n');
    expect(
      parser()
        .parse(source, {})
        .filter((token) => token.type === 'publication_clearpage'),
    ).toHaveLength(0);
  });

  it('preserves source line positions across multiline display formulas', () => {
    for (const source of [
      '$$\nx + y\n$$\n\\clearpage',
      '\\[\nx + y\n\\]\n\\clearpage',
    ]) {
      const prepared = prepareMath(source, true);
      expect(prepared.source.split('\n')).toHaveLength(
        source.split('\n').length,
      );
      expect(prepared.source.split('\n')[3]).toBe('\\clearpage');
    }
  });

  it('preserves math and sanitized source line data in compiled chapters', async () => {
    const compiler = await createMarkdownCompiler();
    const chapter = await compiler.compile(
      {
        path: '/tmp/layout-controls.md',
        content: [
          '# Example',
          '',
          '$$',
          '\\text{\\clearpage}',
          '$$',
          '',
          'Before.',
          '',
          '\\clearpage',
          '',
          'After.',
        ].join('\n'),
      },
      { projectRoot: '/tmp' },
    );
    expect(chapter.html.match(/class="publication-page-break"/gu)).toHaveLength(
      1,
    );
    expect(chapter.html).toContain('data-layout-line="9"');
    expect(chapter.html).toContain('After.');
    expect(chapter.html).toContain('Before.');
  }, 60000);
});
