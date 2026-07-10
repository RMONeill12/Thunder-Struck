const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('thunderStruck', {
  platform: process.platform,
  version: '1.1.0',
  searchLocations: query => ipcRenderer.invoke('search-locations', query),
  getForecast: (lat, lon) => ipcRenderer.invoke('get-forecast', { lat, lon }),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: url => ipcRenderer.invoke('download-update', url)
});
