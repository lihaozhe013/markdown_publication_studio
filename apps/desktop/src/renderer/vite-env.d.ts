import type { DesktopApi } from '@markdown-publication/shared';

declare global {
  interface Window {
    desktopApi: DesktopApi;
  }
}

export {};
