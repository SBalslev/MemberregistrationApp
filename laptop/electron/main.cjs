/**
 * Electron main process.
 * Runs the sync HTTP server and mDNS advertisement.
 * 
 * @see [design.md FR-18] - Sync Protocol Specification
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const express = require('express');
const cors = require('cors');
const { Bonjour } = require('bonjour-service');

// Configuration
const SYNC_PORT = 8085;  // Changed from 8080 to avoid VS Code Copilot proxy conflict
const SERVICE_TYPE = '_medlemssync._tcp';
const SCHEMA_VERSION = '9.0.0';

let mainWindow = null;
let syncServer = null;
let bonjour = null;
let publishedService = null;

// Device info for this laptop
const deviceInfo = {
  deviceId: `laptop-${Date.now()}`,
  deviceType: 'MASTER_LAPTOP',
  deviceName: 'Master Admin Laptop',
  schemaVersion: SCHEMA_VERSION
};

// In-memory sync state (bridged to renderer via IPC)
let pendingPushData = null;
let lastSyncTimestamp = null;

/**
 * Create the main browser window.
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs')
    },
    icon: path.join(__dirname, '../public/icon.png'),
    title: 'Medlems Admin'
  });

  // Load the Vite dev server in development, otherwise the built app
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    const indexPath = path.join(__dirname, '../dist/index.html');
    console.log('[Electron] Loading:', indexPath);
    mainWindow.loadFile(indexPath);
    // Open dev tools for debugging (remove in production)
    mainWindow.webContents.openDevTools();
  }

  // Log any load errors
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('[Electron] Failed to load:', errorCode, errorDescription);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Start the sync HTTP server.
 * Implements FR-18.2 endpoints.
 */
function startSyncServer() {
  const server = express();
  server.use(cors());
  server.use(express.json({ limit: '50mb' }));

  // FR-18.2: GET /api/sync/status - Health check and schema version
  server.get('/api/sync/status', (req, res) => {
    res.json({
      status: 'online',
      deviceId: deviceInfo.deviceId,
      deviceType: deviceInfo.deviceType,
      deviceName: deviceInfo.deviceName,
      schemaVersion: SCHEMA_VERSION,
      timestamp: new Date().toISOString()
    });
  });

  // FR-18.2: POST /api/sync/push - Receive entity changes from tablets
  server.post('/api/sync/push', (req, res) => {
    try {
      const payload = req.body;
      console.log(`[Sync] Received push from ${payload.deviceId}: ${payload.entities?.members?.length || 0} members, ${payload.entities?.checkIns?.length || 0} check-ins`);

      // Validate schema version
      if (payload.schemaVersion && !isSchemaCompatible(payload.schemaVersion)) {
        return res.status(426).json({
          status: 'UPGRADE_REQUIRED',
          requiredSchemaVersion: SCHEMA_VERSION,
          timestamp: new Date().toISOString()
        });
      }

      // Forward to renderer for database processing
      if (mainWindow) {
        mainWindow.webContents.send('sync:incoming-push', payload);
      }

      // Store for async processing
      pendingPushData = payload;

      res.json({
        status: 'OK',
        acceptedCount: countEntities(payload.entities),
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('[Sync] Push error:', error);
      res.status(500).json({
        status: 'ERROR',
        errorMessage: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // FR-18.2: GET /api/sync/pull - Send changes to tablets
  server.get('/api/sync/pull', async (req, res) => {
    try {
      const since = req.query.since ? new Date(req.query.since) : new Date(0);
      console.log(`[Sync] Pull request from tablet, since: ${since.toISOString()}`);

      // Request data from renderer
      if (mainWindow) {
        mainWindow.webContents.send('sync:pull-request', { since: since.toISOString() });
      }

      // For now, return empty payload (renderer will populate via IPC)
      res.json({
        schemaVersion: SCHEMA_VERSION,
        deviceId: deviceInfo.deviceId,
        deviceType: deviceInfo.deviceType,
        timestamp: new Date().toISOString(),
        entities: {
          members: [],
          checkIns: [],
          practiceSessions: [],
          equipmentItems: [],
          equipmentCheckouts: [],
          newMemberRegistrations: []
        }
      });
    } catch (error) {
      console.error('[Sync] Pull error:', error);
      res.status(500).json({
        status: 'ERROR',
        errorMessage: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // FR-18.2: POST /api/pair - Initial pairing handshake
  server.post('/api/pair', (req, res) => {
    try {
      const { deviceId, deviceType, deviceName, pairingCode } = req.body;
      console.log(`[Pair] Request from ${deviceName} (${deviceType})`);

      // Notify renderer of pairing request
      if (mainWindow) {
        mainWindow.webContents.send('sync:pairing-request', {
          deviceId,
          deviceType,
          deviceName,
          pairingCode
        });
      }

      // Generate a simple token (in production, use proper JWT)
      const token = Buffer.from(`${deviceId}:${Date.now()}`).toString('base64');

      res.json({
        status: 'paired',
        token,
        masterDeviceId: deviceInfo.deviceId,
        masterDeviceName: deviceInfo.deviceName,
        schemaVersion: SCHEMA_VERSION,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('[Pair] Error:', error);
      res.status(500).json({
        status: 'ERROR',
        errorMessage: error.message
      });
    }
  });

  // GET /api/devices - List known devices
  server.get('/api/devices', (req, res) => {
    // Request device list from renderer
    if (mainWindow) {
      mainWindow.webContents.send('sync:devices-request');
    }

    res.json({
      masterDevice: deviceInfo,
      pairedDevices: [], // Will be populated by renderer
      timestamp: new Date().toISOString()
    });
  });

  syncServer = server.listen(SYNC_PORT, '0.0.0.0', () => {
    console.log(`[Sync] Server running on port ${SYNC_PORT}`);
  });
}

/**
 * Start mDNS service advertisement.
 * Advertises _medlemssync._tcp for tablet discovery.
 */
function startMdnsAdvertisement() {
  bonjour = new Bonjour();

  // Generate a network ID for pairing (persistent across sessions ideally)
  const networkId = `network-${deviceInfo.deviceId}`;

  publishedService = bonjour.publish({
    name: deviceInfo.deviceName,
    type: SERVICE_TYPE,
    port: SYNC_PORT,
    txt: {
      deviceId: deviceInfo.deviceId,
      deviceType: deviceInfo.deviceType,
      deviceName: deviceInfo.deviceName,
      schemaVersion: SCHEMA_VERSION,
      networkId: networkId
    }
  });

  console.log(`[mDNS] Advertising ${SERVICE_TYPE} on port ${SYNC_PORT}`);
  console.log(`[mDNS] TXT records: deviceId=${deviceInfo.deviceId}, deviceType=${deviceInfo.deviceType}, deviceName=${deviceInfo.deviceName}`);

  // Also browse for other devices (tablets)
  bonjour.find({ type: SERVICE_TYPE }, (service) => {
    if (service.name !== deviceInfo.deviceName) {
      console.log(`[mDNS] Found device: ${service.name} at ${service.host}:${service.port}`);
      if (mainWindow) {
        mainWindow.webContents.send('sync:device-discovered', {
          name: service.name,
          host: service.host,
          port: service.port,
          txt: service.txt
        });
      }
    }
  });
}

/**
 * Check if a schema version is compatible.
 */
function isSchemaCompatible(version) {
  const [major] = version.split('.').map(Number);
  const [ourMajor] = SCHEMA_VERSION.split('.').map(Number);
  return major === ourMajor;
}

/**
 * Count total entities in a payload.
 */
function countEntities(entities) {
  if (!entities) return 0;
  return (entities.members?.length || 0) +
    (entities.checkIns?.length || 0) +
    (entities.practiceSessions?.length || 0) +
    (entities.scanEvents?.length || 0) +
    (entities.newMemberRegistrations?.length || 0) +
    (entities.equipmentItems?.length || 0) +
    (entities.equipmentCheckouts?.length || 0) +
    (entities.devices?.length || 0);
}

// IPC handlers for renderer communication
ipcMain.handle('sync:get-device-info', () => deviceInfo);
ipcMain.handle('sync:get-server-status', () => ({
  running: syncServer !== null,
  port: SYNC_PORT,
  mdnsAdvertising: publishedService !== null
}));

// App lifecycle
app.whenReady().then(() => {
  createWindow();
  startSyncServer();
  startMdnsAdvertisement();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  // Cleanup
  if (syncServer) {
    syncServer.close();
  }
  if (publishedService) {
    publishedService.stop();
  }
  if (bonjour) {
    bonjour.destroy();
  }
});
