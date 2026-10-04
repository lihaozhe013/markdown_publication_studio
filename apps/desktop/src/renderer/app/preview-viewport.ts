import {
  PAGE_SIZE_DEFINITIONS,
  type PageSizeId,
} from '@markdown-publication/shared';
import { paperWidth } from './workspace-model.js';

/** Presentation-only rules installed in the sandboxed preview, never in export HTML. */
export function previewViewportStyles(pageSize: PageSizeId): string {
  const height = (PAGE_SIZE_DEFINITIONS[pageSize].heightPt * 96) / 72;
  return `@media screen {
    html { overflow: hidden !important; background: transparent !important; }
    body.markdown-body {
      box-sizing: border-box !important;
      width: ${paperWidth(pageSize)}px !important;
      max-width: none !important;
      min-height: ${height}px;
      margin: 0 !important;
      padding: 18mm 16mm 20mm !important;
      background: var(--publication-surface-background, white) !important;
      overflow: visible !important;
    }
    .markdown-body .chapter, .markdown-body .publication-toc {
      box-sizing: border-box;
      width: auto !important;
      max-width: none !important;
      padding: 0 !important;
      box-shadow: none !important;
    }
    .markdown-body .chapter { margin: 0 !important; }
    .markdown-body .publication-toc { margin: 0 0 32px !important; }
  }`;
}
