import { describe, expect, it } from 'vitest';
import { filterPageNumberFormatInput } from './page-number-controls.js';

describe('page number format input filtering', () => {
  it('keeps supported Latin format text untouched', () => {
    expect(filterPageNumberFormatInput('Page {page} of {pages}')).toEqual({
      value: 'Page {page} of {pages}',
      removed: [],
    });
  });

  it('removes CJK characters and reports each distinct one', () => {
    expect(filterPageNumberFormatInput('第 {page} 页 / 共 {pages} 页')).toEqual(
      {
        value: ' {page}  /  {pages} ',
        removed: ['第', '页', '共'],
      },
    );
  });

  it('removes line breaks and other non-printing characters', () => {
    expect(filterPageNumberFormatInput('{page}\n{pages}\t')).toEqual({
      value: '{page}{pages}',
      removed: ['\n', '\t'],
    });
  });
});
