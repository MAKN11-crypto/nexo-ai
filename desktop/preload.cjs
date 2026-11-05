const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nexoUpdate', {
  getConfig: () => ipcRenderer.invoke('updates:get-config'),
  configure: (repository) => ipcRenderer.invoke('updates:configure', repository),
  check: () => ipcRenderer.invoke('updates:check'),
  install: () => ipcRenderer.invoke('updates:install'),
  onStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('updates:status', listener);
    return () => ipcRenderer.removeListener('updates:status', listener);
  },
});

contextBridge.exposeInMainWorld('nexoRuntime', {
  startOllama: () => ipcRenderer.invoke('ollama:start'),
  installOllama: () => ipcRenderer.invoke('ollama:install'),
  onInstallStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('ollama:install-status', listener);
    return () => ipcRenderer.removeListener('ollama:install-status', listener);
  },
});

contextBridge.exposeInMainWorld('nexoProviders', {
  list: () => ipcRenderer.invoke('providers:list'),
  models: (provider) => ipcRenderer.invoke('providers:models', provider),
  connect: (provider, key) => ipcRenderer.invoke('providers:connect', { provider, key }),
  disconnect: (provider) => ipcRenderer.invoke('providers:disconnect', provider),
  generate: (input) => ipcRenderer.invoke('providers:generate', input),
  cancel: (requestId) => ipcRenderer.send('providers:cancel', requestId),
});
