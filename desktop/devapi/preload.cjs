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
  openExternal: (url) => ipcRenderer.invoke('devapi:open-external', url),

  getAgentHealth: () => ipcRenderer.invoke('devapi:agent-health'),
  getAgentSettings: () => ipcRenderer.invoke('devapi:agent-settings'),
  saveAgentApiKey: (key) => ipcRenderer.invoke('devapi:agent-save-key', key),
  clearAgentApiKey: () => ipcRenderer.invoke('devapi:agent-clear-key'),
  setAgentSettings: (settings) => ipcRenderer.invoke('devapi:agent-set-settings', settings),
  testAgentProvider: () => ipcRenderer.invoke('devapi:agent-test-provider'),
  createAgentTask: (input) => ipcRenderer.invoke('devapi:agent-create-task', input),
  listAgentTasks: (limit) => ipcRenderer.invoke('devapi:agent-list-tasks', limit),
  getAgentTask: (taskId) => ipcRenderer.invoke('devapi:agent-get-task', taskId),
  planAgentTask: (taskId) => ipcRenderer.invoke('devapi:agent-plan-task', taskId),
  approveAgentCandidate: (taskId) => ipcRenderer.invoke('devapi:agent-approve-candidate', taskId),
  applyAgentTaskToProject: (taskId) => ipcRenderer.invoke('devapi:agent-apply-project', taskId),
  rollbackAgentTask: (taskId) => ipcRenderer.invoke('devapi:agent-rollback', taskId),
  cancelAgentTask: (taskId) => ipcRenderer.invoke('devapi:agent-cancel', taskId),
  exportAgentEvidence: (taskId) => ipcRenderer.invoke('devapi:agent-export-evidence', taskId)
}));
