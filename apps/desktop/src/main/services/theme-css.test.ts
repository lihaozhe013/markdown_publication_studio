import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Claude theme stylesheet', () => {
  it('keeps the warm paper background printable across the full page', async () => {
    const stylesheet = await readFile(
      resolve(process.cwd(), 'themes/css/claude.css'),
      'utf8',
    );

    expect(stylesheet).toContain('--claude-paper: #f7f5f2;');
    expect(stylesheet).toContain('--claude-orange: #d97757;');
    expect(stylesheet).toContain(
      '--publication-page-background: var(--claude-paper);',
    );
    expect(stylesheet).toContain('font-weight: 400;');
    expect(stylesheet).toContain(
      'html,\n  body.markdown-body,\n  .markdown-body .chapter',
    );
    expect(stylesheet).toContain('-webkit-print-color-adjust: exact;');
    expect(stylesheet).toContain('print-color-adjust: exact;');
  });
});
