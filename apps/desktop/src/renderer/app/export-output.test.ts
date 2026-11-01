import { describe, expect, it } from 'vitest';
import { describeExportOutput, exportKindLabel } from './export-output.js';

describe('export output summary', () => {
  it('labels the exported file format', () => {
    expect(exportKindLabel('pdf')).toBe('PDF');
    expect(exportKindLabel('html')).toBe('HTML');
  });

  it('splits a POSIX output path into a file name and folder', () => {
    expect(describeExportOutput('/Users/me/Publications/book.pdf')).toEqual({
      fileName: 'book.pdf',
      directory: '/Users/me/Publications',
    });
  });

  it('splits a Windows output path into a file name and folder', () => {
    expect(
      describeExportOutput('C:\\Users\\me\\Publications\\book.pdf'),
    ).toEqual({
      fileName: 'book.pdf',
      directory: 'C:\\Users\\me\\Publications',
    });
  });

  it('keeps a bare file name when the path has no folder', () => {
    expect(describeExportOutput('book.pdf')).toEqual({
      fileName: 'book.pdf',
      directory: '',
    });
  });
});
