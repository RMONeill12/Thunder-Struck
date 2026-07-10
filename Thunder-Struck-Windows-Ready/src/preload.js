const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('thunderStruck', {
  platform: process.platform,
  version: '1.2.0',
  searchLocations: query => ipcRenderer.invoke('search-locations', query),
  getForecast: (lat, lon) => ipcRenderer.invoke('get-forecast', { lat, lon }),
  getFishingLakes: (lat, lon) => ipcRenderer.invoke('get-fishing-lakes', { lat, lon }),
  getPermissions: () => ipcRenderer.invoke('get-permissions'),
  setPermissions: value => ipcRenderer.invoke('set-permissions', value),
  setAlertLocation: value => ipcRenderer.invoke('set-alert-location', value),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: url => ipcRenderer.invoke('download-update', url)
});
