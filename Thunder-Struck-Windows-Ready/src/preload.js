const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('thunderStruck', {
  platform: process.platform,
  version: '1.0.0'
});
