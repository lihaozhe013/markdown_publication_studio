import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { DesktopApi } from '@markdown-publication/shared';

const api: DesktopApi = {
  project: {
    openMarkdown: () => ipcRenderer.invoke('project:open-markdown'),
    openDroppedMarkdown: (file) => {
      const sourcePath = webUtils.getPathForFile(file);
      if (!sourcePath) {
        throw new Error('The dropped item is not a file on disk.');
      }
      return ipcRenderer.invoke('project:open-dropped-markdown', {
        sourcePath,
      });
    },
  },
  preview: {
    build: (request) => ipcRenderer.invoke('preview:build', request),
  },
  export: {
    start: (request) => ipcRenderer.invoke('export:start', request),
    html: (request) => ipcRenderer.invoke('export:html', request),
  },
};

contextBridge.exposeInMainWorld('desktopApi', api);
