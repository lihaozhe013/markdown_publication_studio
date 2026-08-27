import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Claude theme stylesheet', () => {
  it('keeps the warm paper background printable across the full page', async () => {
    const stylesheet = await readFile(
      resolve(process.cwd(), 'themes/css/claude.css'),
      'utf8',
    );
    const normalizedStylesheet = stylesheet.replaceAll('\r\n', '\n');

    expect(normalizedStylesheet).toContain('--claude-paper: #f7f5f2;');
    expect(normalizedStylesheet).toContain('--claude-orange: #d97757;');
    expect(normalizedStylesheet).toContain(
      '--publication-page-background: var(--claude-paper);',
    );
    expect(normalizedStylesheet).toContain('font-weight: 400;');
    expect(normalizedStylesheet).toContain(
      'html,\n  body.markdown-body,\n  .markdown-body .chapter',
    );
    expect(normalizedStylesheet).toContain(
      '-webkit-print-color-adjust: exact;',
    );
    expect(normalizedStylesheet).toContain('print-color-adjust: exact;');
  });
});
