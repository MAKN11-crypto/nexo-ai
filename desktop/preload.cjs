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
