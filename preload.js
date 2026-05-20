const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getVersion:          ()         => ipcRenderer.invoke('get-version'),
  checkForUpdates:     ()         => ipcRenderer.invoke('check-for-updates'),
  downloadAndInstall:  ()         => ipcRenderer.invoke('download-and-install'),
  onUpdateProgress:    (callback) => ipcRenderer.on('update-progress', (_, v) => callback(v)),
  offUpdateProgress:   ()         => ipcRenderer.removeAllListeners('update-progress'),
});
