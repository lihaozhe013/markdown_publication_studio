import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopApi } from '@markdown-publication/shared';

const api: DesktopApi = {
  project: {
    openMarkdown: () => ipcRenderer.invoke('project:open-markdown'),
  },
  preview: {
    build: (request) => ipcRenderer.invoke('preview:build', request),
  },
  export: {
    start: (request) => ipcRenderer.invoke('export:start', request),
  },
};

contextBridge.exposeInMainWorld('desktopApi', api);
