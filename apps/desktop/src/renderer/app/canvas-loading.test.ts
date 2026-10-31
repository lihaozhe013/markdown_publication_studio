import { describe, expect, it } from 'vitest';
import { getLoadingHint } from './canvas-loading.js';

describe('canvas loading hints', () => {
  it('provides descriptive hints for PDF export', () => {
    expect(getLoadingHint('Printing PDF with Chromium…')).toContain(
      'Chromium is generating vector publication pages',
    );
  });

  it('provides descriptive hints for HTML export', () => {
    expect(getLoadingHint('Writing self-contained HTML…')).toContain(
      'Packaging self-contained document',
    );
  });

  it('provides descriptive hints for preview rendering', () => {
    expect(getLoadingHint('Rendering preview…')).toContain(
      'Compiling typography',
    );
  });

  it('provides descriptive hints for opening files', () => {
    expect(getLoadingHint('Opening Markdown file…')).toContain(
      'Reading Markdown source',
    );
    expect(getLoadingHint('Opening dropped Markdown file…')).toContain(
      'Reading Markdown source',
    );
  });

  it('provides descriptive hints for cover selection', () => {
    expect(getLoadingHint('Choosing front cover…')).toContain(
      'Selecting cover asset',
    );
  });

  it('provides descriptive hints for style modifications', () => {
    expect(getLoadingHint('Saving custom styles…')).toContain(
      'Applying custom styling',
    );
  });

  it('falls back to a polite default when status is unknown or empty', () => {
    expect(getLoadingHint('')).toContain(
      'Please wait while the publication studio finishes processing',
    );
    expect(getLoadingHint(undefined)).toContain(
      'Please wait while the publication studio finishes processing',
    );
  });
});
