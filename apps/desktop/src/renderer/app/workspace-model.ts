import {
  PAGE_SIZE_DEFINITIONS,
  type PageSizeId,
  type PublicationStyleOverrides,
} from '@markdown-publication/shared';

export type ZoomMode = 'fit' | number;
export const clampZoom = (zoom: number): number =>
  Math.min(2, Math.max(0.25, zoom));
export const clampInspectorWidth = (width: number): number =>
  Math.min(440, Math.max(280, width));
export function paperWidth(pageSize: PageSizeId): number {
  return (PAGE_SIZE_DEFINITIONS[pageSize].widthPt * 96) / 72;
}
export function resolveZoom(
  mode: ZoomMode,
  availableWidth: number,
  width: number,
): number {
  return clampZoom(
    mode === 'fit' ? Math.max(0, availableWidth - 64) / width : mode,
  );
}

export interface StyleSession {
  saved: PublicationStyleOverrides;
  draft: PublicationStyleOverrides;
  editing: boolean;
}
export type StyleAction =
  | { type: 'load' | 'saved'; style: PublicationStyleOverrides }
  | { type: 'edit'; style: PublicationStyleOverrides }
  | { type: 'begin' | 'discard' | 'close-document' };
export function styleSessionReducer(
  state: StyleSession,
  action: StyleAction,
): StyleSession {
  switch (action.type) {
    case 'load':
    case 'saved':
      return { saved: action.style, draft: action.style, editing: false };
    case 'begin':
      return state.editing
        ? state
        : { ...state, draft: state.saved, editing: true };
    case 'edit':
      return { ...state, draft: action.style, editing: true };
    case 'discard':
    case 'close-document':
      return { ...state, draft: state.saved, editing: false };
  }
}
export function effectiveStyle(
  session: StyleSession,
): PublicationStyleOverrides {
  return session.editing ? session.draft : session.saved;
}
