import {
  contextBridge,
  ipcRenderer,
  webUtils,
  type IpcRendererEvent,
} from 'electron';
import type { DesktopApi } from '@markdown-publication/shared';

function subscribeToMenuCommand(
  channel: string,
  listener: () => void,
): () => void {
  const handler = (_event: IpcRendererEvent): void => listener();
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

const api: DesktopApi = {
  settings: {
    getPageNumber: () => ipcRenderer.invoke('settings:get-page-number'),
    savePageNumber: (settings) =>
      ipcRenderer.invoke('settings:save-page-number', settings),
    getCustomStyle: () => ipcRenderer.invoke('settings:get-custom-style'),
    saveCustomStyle: (styleOverrides) =>
      ipcRenderer.invoke('settings:save-custom-style', styleOverrides),
  },
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
    chooseCoverAsset: () => ipcRenderer.invoke('project:choose-cover-asset'),
    closeMarkdown: (request) =>
      ipcRenderer.invoke('project:close-markdown', request),
  },
  menu: {
    onOpenMarkdownRequest: (listener) =>
      subscribeToMenuCommand('menu:open-markdown', listener),
    onCloseMarkdownRequest: (listener) =>
      subscribeToMenuCommand('menu:close-markdown', listener),
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
