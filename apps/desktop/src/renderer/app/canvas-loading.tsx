import type { ReactElement } from 'react';
import {
  PAGE_SIZE_DEFINITIONS,
  type PageSizeId,
} from '@markdown-publication/shared';
import { paperWidth } from './workspace-model.js';
import { StudioIcon } from './studio-icon.js';

export function getLoadingHint(status?: string): string {
  const normalized = (status ?? '').toLowerCase();
  if (normalized.includes('pdf')) {
    return 'Chromium is generating vector publication pages and print layout…';
  }
  if (normalized.includes('html')) {
    return 'Packaging self-contained document with styles and embedded media…';
  }
  if (normalized.includes('rendering') || normalized.includes('preview')) {
    return 'Compiling typography, mathematical notation, and diagrams…';
  }
  if (normalized.includes('opening') || normalized.includes('open')) {
    return 'Reading Markdown source and resolving linked assets…';
  }
  if (normalized.includes('cover')) {
    return 'Selecting cover asset for publication assembly…';
  }
  if (normalized.includes('style')) {
    return 'Applying custom styling and updating publication layout…';
  }
  return 'Please wait while the publication studio finishes processing…';
}

export function CanvasSpinner({ size = 44 }: { size?: number }): ReactElement {
  return (
    <div
      className="canvas-spinner-ring"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg className="spinner-svg" viewBox="0 0 40 40">
        <circle className="spinner-track" cx="20" cy="20" r="16" />
        <circle className="spinner-arc" cx="20" cy="20" r="16" />
      </svg>
      <div className="spinner-icon">
        <StudioIcon name="document" size={Math.round(size * 0.44)} />
      </div>
    </div>
  );
}

export function CanvasProgressBar(): ReactElement {
  return (
    <div className="canvas-busy-progress" aria-hidden="true">
      <div className="canvas-busy-progress-bar" />
    </div>
  );
}

interface BusyOverlayProps {
  status?: string | undefined;
}

export function CanvasBusyOverlay({ status }: BusyOverlayProps): ReactElement {
  const title = status || 'Rendering preview…';
  const hint = getLoadingHint(status);

  return (
    <div
      className="canvas-busy-overlay"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="canvas-busy-card">
        <CanvasSpinner size={46} />
        <div className="canvas-busy-content">
          <div className="canvas-busy-title">{title}</div>
          <div className="canvas-busy-hint">{hint}</div>
        </div>
        <CanvasProgressBar />
      </div>
    </div>
  );
}

interface LoadingSheetProps {
  pageSize: PageSizeId;
  status?: string | undefined;
  zoom: number;
  availableWidth: number;
}

export function DocumentLoadingSheet({
  pageSize,
  status,
  zoom,
  availableWidth,
}: LoadingSheetProps): ReactElement {
  const width = paperWidth(pageSize);
  const def = PAGE_SIZE_DEFINITIONS[pageSize];
  const sheetWidth = Math.max(
    280,
    Math.min(
      width * zoom,
      availableWidth > 64 ? availableWidth - 64 : 580,
      580,
    ),
  );
  const aspectRatio = `${def.widthPt} / ${def.heightPt}`;
  const title = status || 'Preparing publication…';
  const hint = getLoadingHint(status);

  return (
    <div
      className="document-skeleton-stage"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div
        className="document-skeleton-sheet"
        style={{
          width: sheetWidth,
          aspectRatio,
        }}
      >
        <div className="skeleton-content" aria-hidden="true">
          <div className="skeleton-header">
            <div className="skeleton-line skeleton-title" />
            <div className="skeleton-line skeleton-subtitle" />
          </div>
          <div className="skeleton-divider" />
          <div className="skeleton-paragraph">
            <div className="skeleton-line skeleton-p1" />
            <div className="skeleton-line skeleton-p2" />
            <div className="skeleton-line skeleton-p3" />
            <div className="skeleton-line skeleton-p4" />
          </div>
          <div className="skeleton-block" />
          <div className="skeleton-paragraph">
            <div className="skeleton-line skeleton-p1" />
            <div className="skeleton-line skeleton-p2" />
            <div className="skeleton-line skeleton-p5" />
          </div>
        </div>
        <div className="document-loading-badge">
          <CanvasSpinner size={46} />
          <div className="document-loading-text">
            <h3 className="document-loading-title">{title}</h3>
            <p className="document-loading-desc">{hint}</p>
          </div>
          <CanvasProgressBar />
        </div>
      </div>
    </div>
  );
}
