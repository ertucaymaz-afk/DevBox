const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('devapiDesktop', Object.freeze({
  listSurfaces: () => ipcRenderer.invoke('devapi:list-surfaces'),
  getSurface: (key) => ipcRenderer.invoke('devapi:get-surface', key),
  getManifest: () => ipcRenderer.invoke('devapi:get-manifest'),
  getHealth: () => ipcRenderer.invoke('devapi:get-health'),
  getLocalState: () => ipcRenderer.invoke('devapi:get-local-state'),
  createDraftTask: (text) => ipcRenderer.invoke('devapi:create-draft-task', text),
  pickProject: () => ipcRenderer.invoke('devapi:pick-project'),
  getBuildInfo: () => ipcRenderer.invoke('devapi:get-build-info'),
  openExternal: (url) => ipcRenderer.invoke('devapi:open-external', url)
}));
