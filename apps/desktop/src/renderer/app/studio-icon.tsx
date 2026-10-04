import type { ReactElement } from 'react';
const paths = {
  document: 'M7 3h7l5 5v13H5V3h2Zm7 0v6h5M8 13h8M8 17h6',
  open: 'M3 7h7l2 2h9v11H3V7Zm0 0V4h7l2 3M3 20l3-8h15',
  panel: 'M3 4h18v16H3V4Zm12 0v16M18 8h0M18 12h0',
  export: 'M12 3v12m-4-4 4 4 4-4M5 15v6h14v-6',
  chevron: 'm7 10 5 5 5-5',
  close: 'm6 6 12 12M6 18 18 6',
  warning: 'm12 3 10 18H2L12 3Zm0 6v5m0 3v1',
  check: 'm5 12 4 4L19 6',
};
export function StudioIcon({
  name,
  size = 16,
}: {
  name: keyof typeof paths;
  size?: number;
}): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
