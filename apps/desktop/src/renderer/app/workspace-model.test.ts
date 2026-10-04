import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PUBLICATION_STYLE_OVERRIDES,
  type PublicationStyleOverrides,
} from '@markdown-publication/shared';
import {
  clampInspectorWidth,
  effectiveStyle,
  paperWidth,
  resolveZoom,
  styleSessionReducer,
  type StyleSession,
} from './workspace-model.js';
import { previewViewportStyles } from './preview-viewport.js';
const saved: PublicationStyleOverrides = {
  version: 1,
  body: { fontSizePt: 12 },
};
const draft: PublicationStyleOverrides = {
  version: 1,
  body: { fontSizePt: 15 },
};
const initial: StyleSession = { saved, draft: saved, editing: false };
describe('publication workspace geometry', () => {
  it('fits actual A4 and Letter widths with canvas padding and bounds', () => {
    expect(paperWidth('A4')).toBeCloseTo(793.7008);
    expect(paperWidth('Letter')).toBe(816);
    expect(
      resolveZoom('fit', 640, paperWidth('A4')) * paperWidth('A4'),
    ).toBeCloseTo(576);
    expect(resolveZoom('fit', 0, 816)).toBe(0.25);
    expect(resolveZoom('fit', 4000, 816)).toBe(2);
    expect(resolveZoom(1, 640, 816)).toBe(1);
    expect(resolveZoom(3, 640, 816)).toBe(2);
    expect(resolveZoom(0.1, 640, 816)).toBe(0.25);
    expect(clampInspectorWidth(100)).toBe(280);
    expect(clampInspectorWidth(900)).toBe(440);
  });
  it('restricts viewport rules to screen without overriding publication typography or color scheme', () => {
    const rules = previewViewportStyles('Letter');
    expect(rules).toContain('@media screen');
    expect(rules).toContain('width: 816px');
    expect(rules).not.toMatch(
      /@page|@media print|font-size|color-scheme|prefers-color-scheme/,
    );
  });
});
describe('style draft lifecycle', () => {
  it('uses unsaved drafts for preview and export independently of panel navigation', () => {
    let session = styleSessionReducer(initial, { type: 'begin' });
    session = styleSessionReducer(session, { type: 'edit', style: draft });
    expect(effectiveStyle(session)).toEqual(draft);
    expect(session.saved).toEqual(saved);
    expect(styleSessionReducer(session, { type: 'begin' })).toBe(session);
  });
  it('discards and closes documents back to saved settings', () => {
    const session = styleSessionReducer(initial, {
      type: 'edit',
      style: draft,
    });
    for (const type of ['discard', 'close-document'] as const) {
      const next = styleSessionReducer(session, { type });
      expect(next.editing).toBe(false);
      expect(effectiveStyle(next)).toEqual(saved);
      expect(next.draft).toEqual(saved);
    }
  });
  it('restores theme defaults as a draft until explicitly saved', () => {
    const session = styleSessionReducer(initial, {
      type: 'edit',
      style: DEFAULT_PUBLICATION_STYLE_OVERRIDES,
    });
    expect(session.saved).toEqual(saved);
    expect(effectiveStyle(session)).toEqual(
      DEFAULT_PUBLICATION_STYLE_OVERRIDES,
    );
    const applied = styleSessionReducer(session, {
      type: 'saved',
      style: session.draft,
    });
    expect(applied.editing).toBe(false);
    expect(applied.saved).toEqual(DEFAULT_PUBLICATION_STYLE_OVERRIDES);
  });
});
