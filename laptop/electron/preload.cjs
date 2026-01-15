/**
 * Electron preload script.
 * Exposes safe IPC methods to the renderer process.
 */

const { contextBridge, ipcRenderer } = require('electron');

// Expose sync API to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  // Get device info
  getDeviceInfo: () => ipcRenderer.invoke('sync:get-device-info'),
  
  // Get server status
  getServerStatus: () => ipcRenderer.invoke('sync:get-server-status'),
  
  // Listen for incoming sync pushes
  onIncomingPush: (callback) => {
    ipcRenderer.on('sync:incoming-push', (event, payload) => callback(payload));
  },
  
  // Listen for pull requests
  onPullRequest: (callback) => {
    ipcRenderer.on('sync:pull-request', (event, params) => callback(params));
  },
  
  // Listen for pairing requests
  onPairingRequest: (callback) => {
    ipcRenderer.on('sync:pairing-request', (event, device) => callback(device));
  },
  
  // Listen for device discovery
  onDeviceDiscovered: (callback) => {
    ipcRenderer.on('sync:device-discovered', (event, device) => callback(device));
  },
  
  // Send pull response data
  sendPullResponse: (data) => {
    ipcRenderer.send('sync:pull-response', data);
  },
  
  // Send devices list
  sendDevicesList: (devices) => {
    ipcRenderer.send('sync:devices-response', devices);
  }
});

// Expose platform info
contextBridge.exposeInMainWorld('platform', {
  isElectron: true,
  platform: process.platform
});
