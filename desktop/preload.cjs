const { contextBridge, ipcRenderer } = require('electron');
async function questionCall(channel, input) {
  const result = await ipcRenderer.invoke(channel, input);
  if (!result.ok) throw new Error(result.message);
  return result.value;
}
contextBridge.exposeInMainWorld('kubeDesktop', {
  questionState: () => questionCall('questions:state'),
  saveQuestionKey: input => questionCall('questions:save', input),
  forgetQuestionKey: () => questionCall('questions:forget'),
  askQuestion: input => questionCall('questions:ask', input),
  cancelQuestion: () => ipcRenderer.invoke('questions:cancel'),
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
