const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('kubeDesktop', {
  run: command => ipcRenderer.invoke('cli:run', command),
  stop: () => ipcRenderer.invoke('cli:stop'),
  environment: () => ipcRenderer.invoke('environment'),
  chooseFolder: () => ipcRenderer.invoke('workspace:choose'),
  openSetup: () => ipcRenderer.invoke('setup:open'),
  updateState: () => ipcRenderer.invoke('updates:state'),
  checkUpdates: () => ipcRenderer.invoke('updates:check'),
  downloadUpdate: () => ipcRenderer.invoke('updates:download'),
  installUpdate: () => ipcRenderer.invoke('updates:install'),
  onUpdate: callback => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('updates:state', listener);
    return () => ipcRenderer.removeListener('updates:state', listener);
  },
  onOutput: callback => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('cli:output', listener);
    return () => ipcRenderer.removeListener('cli:output', listener);
  }
});
