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
  
  // Listen for incoming sync pushes (legacy)
  onIncomingPush: (callback) => {
    ipcRenderer.on('sync:incoming-push', (event, payload) => callback(payload));
  },
  
  // Listen for pull requests (legacy)
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
  
  // Send pull response data (legacy)
  sendPullResponse: (data) => {
    ipcRenderer.send('sync:pull-response', data);
  },
  
  // Send devices list (legacy)
  sendDevicesList: (devices) => {
    ipcRenderer.send('sync:devices-response', devices);
  },

  // FR-23: Initial sync support
  // Listen for initial sync requests from tablets
  onInitialSyncRequest: (callback) => {
    ipcRenderer.on('sync:initial-request', (event, payload) => callback(payload));
  },

  // Listen for member data requests (full sync)
  onMembersRequest: (callback) => {
    ipcRenderer.on('sync:members-request', (event) => callback());
  },

  // Send initial sync result back to main process
  sendInitialSyncResult: (result) => {
    ipcRenderer.send('sync:initial-result', result);
  },

  // Send member data for initial sync (legacy)
  sendMemberData: (data) => {
    ipcRenderer.send('sync:members-response', data);
  },
  
  // Scan subnet for devices (mDNS fallback)
  scanSubnet: () => ipcRenderer.invoke('sync:scan-subnet'),

  // ===== New promise-based IPC for sync data =====
  
  // Listen for member data requests (returns data via callback)
  onGetMembersRequest: (handler) => {
    ipcRenderer.on('sync:get-members', (event, { requestId, data }) => {
      // Call handler and send response
      Promise.resolve(handler(data))
        .then(result => {
          ipcRenderer.send('sync:data-response', { requestId, data: result });
        })
        .catch(error => {
          ipcRenderer.send('sync:data-response', { requestId, error: error.message });
        });
    });
  },

  // Listen for push data processing requests
  onProcessPushRequest: (handler) => {
    ipcRenderer.on('sync:process-push', (event, { requestId, data }) => {
      Promise.resolve(handler(data))
        .then(result => {
          ipcRenderer.send('sync:data-response', { requestId, data: result });
        })
        .catch(error => {
          ipcRenderer.send('sync:data-response', { requestId, error: error.message });
        });
    });
  },

  // ===== SEC-1, SEC-2: Pairing Session Management =====
  
  // Start a new pairing session (returns 6-digit code)
  startPairingSession: (deviceType, deviceName) => 
    ipcRenderer.invoke('pairing:start-session', { deviceType, deviceName }),
  
  // Cancel the current pairing session
  cancelPairingSession: () => ipcRenderer.invoke('pairing:cancel-session'),
  
  // Get current pairing session status
  getPairingSession: () => ipcRenderer.invoke('pairing:get-session'),
  
  // Sync trusted devices from database to main process cache
  syncTrustedDevices: (devices) => ipcRenderer.invoke('pairing:sync-trusted-devices', devices),
  
  // Revoke a device
  revokeDevice: (deviceId) => ipcRenderer.invoke('pairing:revoke-device', { deviceId }),
  
  // Listen for successful pairing completion (to save to database)
  onPairingComplete: (callback) => {
    ipcRenderer.on('sync:pairing-complete', (event, deviceData) => callback(deviceData));
  }
});

// Expose platform info
contextBridge.exposeInMainWorld('platform', {
  isElectron: true,
  platform: process.platform
});
