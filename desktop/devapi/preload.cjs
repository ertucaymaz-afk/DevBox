const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('devapiDesktop', Object.freeze({
  listSurfaces: () => ipcRenderer.invoke('devapi:list-surfaces'),
  getSurface: (key) => ipcRenderer.invoke('devapi:get-surface', key),
  getManifest: () => ipcRenderer.invoke('devapi:get-manifest'),
  getHealth: () => ipcRenderer.invoke('devapi:get-health'),
  getBuildInfo: () => ipcRenderer.invoke('devapi:get-build-info'),
  openExternal: (url) => ipcRenderer.invoke('devapi:open-external', url)
}));
