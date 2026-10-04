import { useRef, type ReactElement, type ReactNode } from 'react';
import { clampInspectorWidth } from './workspace-model.js';
export type InspectorTab = 'layout' | 'style' | 'covers';
const tabs = [
  { id: 'layout', label: 'Layout' },
  { id: 'style', label: 'Style' },
  { id: 'covers', label: 'Covers' },
] as const;
interface Props {
  width: number;
  visible: boolean;
  tab: InspectorTab;
  onTab(tab: InspectorTab): void;
  onResize(width: number, commit: boolean): void;
  children: ReactNode;
}
export function PropertiesPanel({
  width,
  visible,
  tab,
  onTab,
  onResize,
  children,
}: Props): ReactElement {
  const origin = useRef<{ x: number; width: number } | null>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <aside
      className="properties-panel"
      style={{ width }}
      hidden={!visible}
      aria-label="Publication properties"
    >
      <div
        className="inspector-resizer"
        role="separator"
        aria-label="Resize properties panel"
        aria-orientation="vertical"
        aria-valuemin={280}
        aria-valuemax={440}
        aria-valuenow={width}
        tabIndex={0}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.focus();
          origin.current = { x: event.clientX, width };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (origin.current)
            onResize(
              clampInspectorWidth(
                origin.current.width + origin.current.x - event.clientX,
              ),
              false,
            );
        }}
        onPointerUp={(event) => {
          if (!origin.current) return;
          const next = clampInspectorWidth(
            origin.current.width + origin.current.x - event.clientX,
          );
          origin.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
          onResize(next, true);
        }}
        onPointerCancel={() => {
          if (origin.current) {
            onResize(origin.current.width, true);
            origin.current = null;
          }
        }}
        onKeyDown={(event) => {
          const next =
            event.key === 'ArrowLeft'
              ? width + 10
              : event.key === 'ArrowRight'
                ? width - 10
                : event.key === 'Home'
                  ? 280
                  : event.key === 'End'
                    ? 440
                    : null;
          if (next !== null) {
            event.preventDefault();
            onResize(clampInspectorWidth(next), true);
          }
        }}
      />
      <div
        className="inspector-tabs"
        role="tablist"
        aria-label="Property categories"
      >
        {tabs.map((item, index) => (
          <button
            key={item.id}
            id={`tab-${item.id}`}
            ref={(element) => {
              tabRefs.current[index] = element;
            }}
            role="tab"
            aria-selected={tab === item.id}
            aria-controls={`properties-${item.id}`}
            tabIndex={tab === item.id ? 0 : -1}
            onClick={() => onTab(item.id)}
            onKeyDown={(event) => {
              const next =
                event.key === 'ArrowRight'
                  ? (index + 1) % 3
                  : event.key === 'ArrowLeft'
                    ? (index + 2) % 3
                    : event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? 2
                        : null;
              if (next !== null) {
                event.preventDefault();
                onTab(tabs[next]!.id);
                tabRefs.current[next]?.focus();
              }
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      {children}
    </aside>
  );
}
