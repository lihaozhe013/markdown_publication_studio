import {
  contextBridge,
  ipcRenderer,
  webUtils,
  type IpcRendererEvent,
} from 'electron';
import type { DesktopApi } from '@markdown-publication/shared';
import type {
  McpRendererCommand,
  McpRendererSnapshot,
} from '@markdown-publication/shared/mcp';

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
    getUiPreferences: () => ipcRenderer.invoke('settings:get-ui-preferences'),
    saveUiPreferences: (preferences) =>
      ipcRenderer.invoke('settings:save-ui-preferences', preferences),
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
    onExportPdfRequest: (listener) =>
      subscribeToMenuCommand('menu:export-pdf', listener),
    onExportHtmlRequest: (listener) =>
      subscribeToMenuCommand('menu:export-html', listener),
    onPreviewZoomRequest: (listener) => {
      const unsubscribe = (['in', 'out', 'reset'] as const).map((action) =>
        subscribeToMenuCommand(`menu:preview-zoom-${action}`, () =>
          listener(action),
        ),
      );
      return () => unsubscribe.forEach((stop) => stop());
    },
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
  mcp: {
    getSetup: () => ipcRenderer.invoke('mcp:get-setup'),
    copyPrompt: (mode) => ipcRenderer.invoke('mcp:copy-prompt', mode),
    getDiagnostics: () => ipcRenderer.invoke('mcp:get-diagnostics'),
    cancelActiveJob: () => ipcRenderer.invoke('mcp:cancel-active-job'),
    reportSnapshot: (snapshot: McpRendererSnapshot) =>
      ipcRenderer.send('mcp:report-snapshot', snapshot),
    onOpenRequest: (listener) =>
      subscribeToMenuCommand('menu:connect-ai', listener),
    onCommand: (listener) => {
      const handler = (
        _event: IpcRendererEvent,
        command: McpRendererCommand,
      ): void => listener(command);
      ipcRenderer.on('mcp:session-command', handler);
      return () => ipcRenderer.removeListener('mcp:session-command', handler);
    },
    completeCommand: (reply) => ipcRenderer.send('mcp:complete-command', reply),
  },
};

contextBridge.exposeInMainWorld('desktopApi', api);
