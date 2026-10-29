import MarkdownIt from 'markdown-it';
import { describe, expect, it } from 'vitest';
import { registerLayoutControls } from './layout-controls.js';
import { createMarkdownCompiler } from './markdown.js';

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

  it('preserves math and sanitized source line data in compiled chapters', async () => {
    const compiler = await createMarkdownCompiler();
    const chapter = await compiler.compile(
      {
        path: '/tmp/layout-controls.md',
        content: [
          '# Example',
          '',
          '$$\\text{\\clearpage}$$',
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
    expect(chapter.html).toContain('data-layout-line="7"');
    expect(chapter.html).toContain('After.');
    expect(chapter.html).toContain('Before.');
  }, 60000);
});
