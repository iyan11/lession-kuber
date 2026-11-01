const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('kubeDesktop', {
  run: command => ipcRenderer.invoke('cli:run', command),
  stop: () => ipcRenderer.invoke('cli:stop'),
  environment: () => ipcRenderer.invoke('environment'),
  chooseFolder: () => ipcRenderer.invoke('workspace:choose'),
  openSetup: () => ipcRenderer.invoke('setup:open'),
  onOutput: callback => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('cli:output', listener);
    return () => ipcRenderer.removeListener('cli:output', listener);
  }
});
