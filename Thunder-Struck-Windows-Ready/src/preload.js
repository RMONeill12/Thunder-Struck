const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('thunderStruck', {
  platform: process.platform,
  version: '1.4.3',
  searchLocations: query => ipcRenderer.invoke('search-locations', query),
  getForecast: (lat, lon) => ipcRenderer.invoke('get-forecast', { lat, lon }),
  getFishingLakes: bounds => ipcRenderer.invoke('get-fishing-lakes', bounds),
  getLakeFish: (lat, lon) => ipcRenderer.invoke('get-lake-fish', { lat, lon }),
  getPermissions: () => ipcRenderer.invoke('get-permissions'),
  setPermissions: value => ipcRenderer.invoke('set-permissions', value),
  setAlertLocation: value => ipcRenderer.invoke('set-alert-location', value),
  getApproxLocation: () => ipcRenderer.invoke('get-approx-location'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: url => ipcRenderer.invoke('download-update', url)
});
