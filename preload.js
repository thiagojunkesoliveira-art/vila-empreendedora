'use strict';
// The only bridge between the game page and the system.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  version: () => ipcRenderer.invoke('app:version'),
  saveBackup: (json, suggestedName) => ipcRenderer.invoke('backup:save', String(json), String(suggestedName || '')),
  openBackup: () => ipcRenderer.invoke('backup:open'),
});
