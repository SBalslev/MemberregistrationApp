/**
 * Electron main process.
 * Runs the sync HTTP server and mDNS advertisement.
 * 
 * @see [design.md FR-18] - Sync Protocol Specification
 */

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const { Bonjour } = require('bonjour-service');
const sharp = require('sharp');

// Configuration
const SYNC_PORT = 8085;  // Changed from 8080 to avoid VS Code Copilot proxy conflict
const SERVICE_TYPE = '_medlemssync._tcp';
const SCHEMA_VERSION = '1.0.0';  // Must match Android SyncSchemaVersion

let mainWindow = null;
let syncServer = null;
let bonjour = null;
let publishedService = null;

/**
 * Get or create a persistent device ID.
 * Stored in the app's userData directory so it persists across restarts.
 */
function getOrCreateDeviceId() {
  const userDataPath = app.getPath('userData');
  const deviceIdPath = path.join(userDataPath, 'device-id.txt');

  try {
    if (fs.existsSync(deviceIdPath)) {
      const savedId = fs.readFileSync(deviceIdPath, 'utf8').trim();
      if (savedId) {
        console.log('[Device] Using saved device ID:', savedId);
        return savedId;
      }
    }
  } catch (err) {
    console.warn('[Device] Could not read device ID file:', err.message);
  }

  // Generate new ID and save it
  const newId = `laptop-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  try {
    fs.writeFileSync(deviceIdPath, newId, 'utf8');
    console.log('[Device] Created new device ID:', newId);
  } catch (err) {
    console.warn('[Device] Could not save device ID:', err.message);
  }

  return newId;
}

/**
 * Get or set the device name.
 * Stored in the app's userData directory so it persists across restarts.
 * Defaults to hostname + "Master Laptop" if not set.
 */
function getDeviceName() {
  const userDataPath = app.getPath('userData');
  const deviceNamePath = path.join(userDataPath, 'device-name.txt');

  try {
    if (fs.existsSync(deviceNamePath)) {
      const savedName = fs.readFileSync(deviceNamePath, 'utf8').trim();
      if (savedName) {
        console.log('[Device] Using saved device name:', savedName);
        return savedName;
      }
    }
  } catch (err) {
    console.warn('[Device] Could not read device name file:', err.message);
  }

  // Default to hostname-based name
  const os = require('os');
  const hostname = os.hostname() || 'Unknown';
  const defaultName = `${hostname} Master Laptop`;
  console.log('[Device] Using default device name:', defaultName);
  return defaultName;
}

/**
 * Save the device name to persistent storage.
 */
function setDeviceName(name) {
  const userDataPath = app.getPath('userData');
  const deviceNamePath = path.join(userDataPath, 'device-name.txt');

  try {
    fs.writeFileSync(deviceNamePath, name.trim(), 'utf8');
    console.log('[Device] Saved device name:', name);

    // Update in-memory deviceInfo
    deviceInfo.deviceName = name.trim();

    // Re-advertise with new name if mDNS is running
    if (publishedService && bonjour) {
      restartMdnsAdvertisement();
    }

    return true;
  } catch (err) {
    console.error('[Device] Could not save device name:', err.message);
    return false;
  }
}

/**
 * Restart mDNS advertisement with current device info.
 * Called when device name changes.
 */
function restartMdnsAdvertisement() {
  console.log('[mDNS] Restarting advertisement with new device name...');

  if (publishedService) {
    publishedService.stop();
    publishedService = null;
  }

  // Small delay before re-publishing
  setTimeout(() => {
    startMdnsAdvertisement();
  }, 500);
}

// Device info for this laptop (initialized after app ready)
let deviceInfo = {
  deviceId: null, // Will be set in app.whenReady()
  deviceType: 'LAPTOP',  // Must match Android DeviceType enum
  deviceName: null, // Will be set in app.whenReady() from config file
  schemaVersion: SCHEMA_VERSION
};

// In-memory sync state (bridged to renderer via IPC)
let pendingPushData = null;
let lastSyncTimestamp = null;

// ===== Security: Token-based authentication (SEC-3) =====
// In-memory trusted devices cache (synced from renderer database)
const trustedDevicesCache = new Map(); // Map<token, deviceInfo>
let activePairingSession = null; // { code, expiresAt, deviceType, deviceName }
const pairingRateLimits = new Map(); // Map<deviceId, { attempts, blockedUntil }>

/**
 * Generate a 6-digit pairing code.
 */
function generatePairingCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Generate a secure auth token.
 */
function generateAuthToken() {
  const crypto = require('crypto');
  return 'tok_' + crypto.randomBytes(32).toString('hex');
}

/**
 * Check if a device is rate-limited for pairing.
 */
function isRateLimited(deviceId) {
  const entry = pairingRateLimits.get(deviceId);
  if (!entry) return false;
  
  if (entry.blockedUntil && Date.now() < entry.blockedUntil) {
    return true;
  }
  
  // Block expired, reset
  if (entry.blockedUntil) {
    pairingRateLimits.delete(deviceId);
  }
  return false;
}

/**
 * Record a failed pairing attempt.
 */
function recordFailedPairingAttempt(deviceId) {
  let entry = pairingRateLimits.get(deviceId) || { attempts: 0, blockedUntil: null };
  entry.attempts++;
  
  if (entry.attempts >= 3) {
    entry.blockedUntil = Date.now() + (5 * 60 * 1000); // 5 minute block
    console.log(`[Auth] Device ${deviceId} blocked until ${new Date(entry.blockedUntil).toISOString()}`);
  }
  
  pairingRateLimits.set(deviceId, entry);
  return entry;
}

/**
 * Auth middleware for sync endpoints.
 * Validates Bearer token against trusted devices.
 */
function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  
  if (!auth || !auth.startsWith('Bearer ')) {
    console.warn('[Auth] Missing or invalid Authorization header');
    return res.status(401).json({ 
      error: 'Unauthorized', 
      message: 'Missing Bearer token. Device pairing required.' 
    });
  }
  
  const token = auth.split(' ')[1];
  
  // Check in-memory cache first
  const cachedDevice = trustedDevicesCache.get(token);
  if (cachedDevice) {
    // Check if token expired
    if (cachedDevice.tokenExpiresAt && new Date(cachedDevice.tokenExpiresAt) <= new Date()) {
      console.warn(`[Auth] Token expired for device ${cachedDevice.name}`);
      trustedDevicesCache.delete(token);
      return res.status(401).json({ 
        error: 'Token expired', 
        message: 'Auth token has expired. Please re-pair the device.' 
      });
    }
    
    req.trustedDevice = cachedDevice;
    return next();
  }
  
  // Token not in cache - might need to refresh from database via IPC
  // For now, reject unknown tokens
  console.warn('[Auth] Unknown token attempted');
  return res.status(401).json({ 
    error: 'Invalid token', 
    message: 'Device not recognized. Please pair the device first.' 
  });
}

// Pending IPC request resolvers (for sync data requests)
const pendingRequests = new Map();
let requestIdCounter = 0;

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
 * Request data from the renderer process with promise-based IPC.
 * Used for sync endpoints that need database data.
 * 
 * @param {string} channel - The IPC channel name
 * @param {any} data - Optional data to send with the request
 * @param {number} timeout - Timeout in ms (default 10 seconds)
 * @returns {Promise<any>} - The response data from renderer
 */
function requestFromRenderer(channel, data = null, timeout = 10000) {
  return new Promise((resolve, reject) => {
    if (!mainWindow) {
      reject(new Error('No window available'));
      return;
    }

    const requestId = ++requestIdCounter;
    
    // Set up timeout
    const timer = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error('IPC request timeout'));
    }, timeout);

    // Store the resolver
    pendingRequests.set(requestId, { resolve, reject, timer });

    // Send request to renderer
    mainWindow.webContents.send(channel, { requestId, data });
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
      isHealthy: true,
      schemaVersion: SCHEMA_VERSION,
      device: {
        id: deviceInfo.deviceId,
        name: deviceInfo.deviceName,
        type: deviceInfo.deviceType,
        lastSeenUtc: null,
        pairedAtUtc: new Date().toISOString(),
        isTrusted: true
      },
      pendingChangesCount: 0,
      lastSyncTimestamp: null
    });
  });

  // FR-18.2: POST /api/sync/push - Receive entity changes from tablets
  // Protected by auth middleware
  server.post('/api/sync/push', authMiddleware, async (req, res) => {
    try {
      const payload = req.body;
      console.log(`[Sync] Received push from ${req.trustedDevice?.name || payload.deviceId}: ` +
        `${payload.entities?.members?.length || 0} members, ` +
        `${payload.entities?.checkIns?.length || 0} check-ins, ` +
        `${payload.entities?.practiceSessions?.length || 0} sessions, ` +
        `${payload.entities?.newMemberRegistrations?.length || 0} registrations`);

      // Validate schema version
      if (payload.schemaVersion && !isSchemaCompatible(payload.schemaVersion)) {
        return res.status(426).json({
          status: 'UPGRADE_REQUIRED',
          requiredSchemaVersion: SCHEMA_VERSION,
          timestamp: new Date().toISOString()
        });
      }

      // Process the sync payload in the renderer
      let result = { accepted: 0, errors: [] };
      try {
        result = await requestFromRenderer('sync:process-push', payload);
        console.log(`[Sync] Processed: ${result.accepted} items accepted`);
      } catch (ipcError) {
        console.warn('[Sync] Could not process in renderer:', ipcError.message);
        // Still notify renderer for backwards compatibility
        if (mainWindow) {
          mainWindow.webContents.send('sync:incoming-push', payload);
        }
        result.accepted = countEntities(payload.entities);
      }

      // Store for async processing
      pendingPushData = payload;

      res.json({
        status: 'OK',
        acceptedCount: result.accepted,
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

  // FR-18.2: GET /api/sync/pull - Send changes to tablets (laptop sends member data)
  // Protected by auth middleware
  server.get('/api/sync/pull', authMiddleware, async (req, res) => {
    try {
      const since = req.query.since ? new Date(req.query.since) : new Date(0);
      console.log(`[Sync] Pull request from ${req.trustedDevice?.name || 'unknown'}, since: ${since.toISOString()}`);

      // Request member data from renderer (laptop is master for members)
      let entities = {
        members: [],
        checkIns: [],
        practiceSessions: [],
        equipmentItems: [],
        equipmentCheckouts: [],
        newMemberRegistrations: [],
        memberPreferences: [],
        trainerInfos: [],
        trainerDisciplines: []
      };

      try {
        // Pass device type so renderer can include device-specific data (e.g., member preferences for MEMBER_TABLET)
        const requestingDeviceType = req.trustedDevice?.deviceType || 'MEMBER_TABLET';
        const memberData = await requestFromRenderer('sync:get-members', { since: since.toISOString(), deviceType: requestingDeviceType });
        if (memberData && memberData.members) {
          entities.members = memberData.members;
          console.log(`[Sync] Sending ${entities.members.length} members to tablet`);
        }
        // Include approved/rejected registrations so tablets get status updates
        if (memberData && memberData.registrations) {
          entities.newMemberRegistrations = memberData.registrations;
          console.log(`[Sync] Sending ${entities.newMemberRegistrations.length} registrations to tablet`);
        }
        // Include equipment data
        if (memberData && memberData.equipmentItems) {
          entities.equipmentItems = memberData.equipmentItems;
          console.log(`[Sync] Sending ${entities.equipmentItems.length} equipment items to tablet`);
        }
        if (memberData && memberData.equipmentCheckouts) {
          entities.equipmentCheckouts = memberData.equipmentCheckouts;
          console.log(`[Sync] Sending ${entities.equipmentCheckouts.length} equipment checkouts to tablet`);
        }
        // Include member preferences for MEMBER_TABLET devices
        if (memberData && memberData.memberPreferences) {
          entities.memberPreferences = memberData.memberPreferences;
          console.log(`[Sync] Sending ${entities.memberPreferences.length} member preferences to tablet`);
        }
        if (memberData && memberData.trainerInfos) {
          entities.trainerInfos = memberData.trainerInfos;
          console.log(`[Sync] Sending ${entities.trainerInfos.length} trainer infos to tablet`);
        }
        if (memberData && memberData.trainerDisciplines) {
          entities.trainerDisciplines = memberData.trainerDisciplines;
          console.log(`[Sync] Sending ${entities.trainerDisciplines.length} trainer disciplines to tablet`);
        }
      } catch (ipcError) {
        console.warn('[Sync] Could not get members from renderer:', ipcError.message);
        // Continue with empty members
      }

      res.json({
        schemaVersion: SCHEMA_VERSION,
        deviceId: deviceInfo.deviceId,
        deviceType: deviceInfo.deviceType,
        timestamp: new Date().toISOString(),
        entities
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

  // SEC-1, SEC-2: POST /api/pair/initiate - Laptop initiates pairing (internal use via IPC)
  // This is called from the UI to start a pairing session
  
  // SEC-1, SEC-2: POST /api/pair - Tablet confirms pairing with 6-digit code
  server.post('/api/pair', (req, res) => {
    try {
      // Support both Android format (nested device object) and flat format
      // Android sends: { trustToken, device: { id, name, type }, schemaVersion }
      // Flat format: { deviceId, deviceType, deviceName, code/pairingCode }
      const body = req.body;

      let deviceId, deviceType, deviceName, submittedCode;

      if (body.device && typeof body.device === 'object') {
        // Android format with nested device object
        deviceId = body.device.id;
        deviceType = body.device.type;
        deviceName = body.device.name;
        submittedCode = body.trustToken || body.code || body.pairingCode;
        console.log(`[Pair] Android format request from ${deviceName} (${deviceType})`);
      } else {
        // Flat format
        deviceId = body.deviceId;
        deviceType = body.deviceType;
        deviceName = body.deviceName;
        submittedCode = body.code || body.pairingCode || body.trustToken;
      }

      console.log(`[Pair] Request from ${deviceName} (${deviceType}) with code: ${submittedCode ? '******' : 'none'}`);

      // Validate required fields
      if (!deviceId || !deviceName) {
        console.error(`[Pair] Missing required fields: deviceId=${deviceId}, deviceName=${deviceName}`);
        console.error(`[Pair] Full request body:`, JSON.stringify(body, null, 2));
        return res.status(400).json({
          success: false,
          error: 'Manglende enhedsoplysninger',
          errorMessage: 'Manglende enhedsoplysninger'
        });
      }

      if (!submittedCode) {
        console.error(`[Pair] Missing pairing code`);
        return res.status(400).json({
          success: false,
          error: 'Manglende parringskode',
          errorMessage: 'Manglende parringskode'
        });
      }

      // Check rate limit
      if (isRateLimited(deviceId)) {
        const entry = pairingRateLimits.get(deviceId);
        console.warn(`[Pair] Device ${deviceId} is rate-limited`);
        return res.status(429).json({
          success: false,
          error: 'For mange forsøg - vent venligst',
          errorMessage: 'For mange forsøg - vent venligst',
          blockedUntil: entry?.blockedUntil ? new Date(entry.blockedUntil).toISOString() : null
        });
      }

      // Check if there's an active pairing session
      if (!activePairingSession) {
        recordFailedPairingAttempt(deviceId);
        console.warn(`[Pair] No active pairing session`);
        return res.status(400).json({
          success: false,
          error: 'Ingen aktiv parringssession. Start parring fra laptop først.',
          errorMessage: 'Ingen aktiv parringssession. Start parring fra laptop først.'
        });
      }

      // Check if session expired
      if (Date.now() > activePairingSession.expiresAt) {
        activePairingSession = null;
        recordFailedPairingAttempt(deviceId);
        console.warn(`[Pair] Pairing session expired`);
        return res.status(400).json({
          success: false,
          error: 'Parringssession udløbet. Start en ny parring.',
          errorMessage: 'Parringssession udløbet. Start en ny parring.'
        });
      }

      // Validate pairing code
      if (submittedCode !== activePairingSession.code) {
        const result = recordFailedPairingAttempt(deviceId);
        console.warn(`[Pair] Invalid pairing code from ${deviceId}`);

        if (result.attempts >= 3) {
          return res.status(429).json({
            success: false,
            error: 'For mange forsøg - enhed blokeret i 5 minutter',
            errorMessage: 'For mange forsøg - enhed blokeret i 5 minutter'
          });
        }

        return res.status(401).json({
          success: false,
          error: 'Ugyldig parringskode',
          errorMessage: 'Ugyldig parringskode',
          attemptsRemaining: 3 - result.attempts
        });
      }

      // Pairing successful! Generate token
      const token = generateAuthToken();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30); // 30 day expiry

      // Store in cache
      const deviceData = {
        id: deviceId,
        name: deviceName,
        type: deviceType,
        token,
        tokenExpiresAt: expiresAt.toISOString(),
        pairingDateUtc: new Date().toISOString(),
        lastSeenUtc: new Date().toISOString(),
        isTrusted: true
      };
      trustedDevicesCache.set(token, deviceData);

      // Notify renderer to persist to database
      if (mainWindow) {
        mainWindow.webContents.send('sync:pairing-complete', deviceData);
      }

      // Clear pairing session and rate limit
      activePairingSession = null;
      pairingRateLimits.delete(deviceId);

      console.log(`[Pair] SUCCESS - Device ${deviceName} (${deviceId}) paired`);

      // Response matches Android's PairingResponse class
      // Android expects: { success, authToken, networkId, trustedDevices, timestamp }
      const laptopDevice = {
        id: deviceInfo.deviceId,
        name: deviceInfo.deviceName,
        type: deviceInfo.deviceType,
        lastSeenUtc: new Date().toISOString(),
        pairedAtUtc: new Date().toISOString(),
        isTrusted: true
      };

      res.json({
        success: true,
        authToken: token,
        networkId: `network-${deviceInfo.deviceId}`,
        trustedDevices: [laptopDevice],
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('[Pair] Error:', error);
      res.status(500).json({
        error: error.message
      });
    }
  });

  // FR-23.5: POST /api/sync/initial - Initial sync for first-time device pairing
  // Protected by auth middleware
  server.post('/api/sync/initial', authMiddleware, async (req, res) => {
    try {
      const payload = req.body;
      console.log(`[InitialSync] Request from ${req.trustedDevice?.name || payload.deviceId} (${payload.deviceType})`);

      // Notify renderer to process initial sync
      if (mainWindow) {
        mainWindow.webContents.send('sync:initial-request', payload);
      }

      // Wait briefly for renderer processing (IPC response would be better)
      await new Promise(resolve => setTimeout(resolve, 100));

      // Return full member data payload for tablet to import
      res.json({
        status: 'success',
        schemaVersion: SCHEMA_VERSION,
        deviceId: deviceInfo.deviceId,
        deviceType: deviceInfo.deviceType,
        timestamp: new Date().toISOString(),
        isInitialSync: true,
        entities: {
          members: [], // Will be populated by renderer via IPC
          checkIns: [],
          practiceSessions: [],
          equipmentItems: [],
          equipmentCheckouts: [],
          newMemberRegistrations: []
        },
        message: 'Initial sync received. Member data will be pushed separately.'
      });
    } catch (error) {
      console.error('[InitialSync] Error:', error);
      res.status(500).json({
        status: 'ERROR',
        errorMessage: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // GET /api/sync/members - Get all members for initial sync
  // Protected by auth middleware
  server.get('/api/sync/members', authMiddleware, (req, res) => {
    try {
      console.log(`[Sync] Full member list request from ${req.trustedDevice?.name || 'unknown'}`);

      // Notify renderer to get member data
      if (mainWindow) {
        mainWindow.webContents.send('sync:members-request');
      }

      // Return placeholder (actual data via IPC callback)
      res.json({
        schemaVersion: SCHEMA_VERSION,
        deviceId: deviceInfo.deviceId,
        timestamp: new Date().toISOString(),
        members: [], // Populated by renderer
        count: 0
      });
    } catch (error) {
      console.error('[Sync] Members request error:', error);
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
  // Get local IP for explicit interface binding
  const os = require('os');
  const interfaces = os.networkInterfaces();
  let localIp = null;
  
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        localIp = iface.address;
        console.log(`[mDNS] Found network interface: ${name} = ${localIp}`);
      }
    }
  }

  // Create Bonjour with explicit interface if found
  const bonjourOptions = localIp ? { interface: localIp } : {};
  console.log(`[mDNS] Bonjour options:`, bonjourOptions);
  bonjour = new Bonjour(bonjourOptions);

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

  // Log when service is published
  publishedService.on('up', () => {
    console.log('[mDNS] Service is now advertised and UP');
  });

  publishedService.on('error', (err) => {
    console.error('[mDNS] Service advertisement error:', err);
  });

  // Also browse for other devices (tablets)
  console.log('[mDNS] Starting browser for tablets...');
  const browser = bonjour.find({ type: SERVICE_TYPE }, (service) => {
    console.log(`[mDNS] Browser found service: ${service.name}`);
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

  browser.on('down', (service) => {
    console.log(`[mDNS] Device went down: ${service.name}`);
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

/**
 * Scan the local subnet for devices running the sync API.
 * This is a fallback when mDNS discovery fails.
 */
async function scanSubnet() {
  const os = require('os');
  const http = require('http');
  
  const interfaces = os.networkInterfaces();
  let localIp = null;
  
  // Find our local IP - prefer 192.168.x.x (typical home/office Wi-Fi) over virtual interfaces
  const candidates = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        candidates.push({ name, address: iface.address });
      }
    }
  }
  
  // Prefer 192.168.x.x, then 10.x.x.x, then anything else
  const preferred = candidates.find(c => c.address.startsWith('192.168.')) ||
                    candidates.find(c => c.address.startsWith('10.')) ||
                    candidates[0];
  
  if (preferred) {
    localIp = preferred.address;
    console.log(`[SubnetScan] Selected interface: ${preferred.name} = ${preferred.address}`);
  }
  
  if (!localIp) {
    console.log('[SubnetScan] No local IP found');
    return [];
  }
  
  const parts = localIp.split('.');
  if (parts.length !== 4) {
    console.log('[SubnetScan] Invalid IP format:', localIp);
    return [];
  }
  
  const subnetPrefix = `${parts[0]}.${parts[1]}.${parts[2]}`;
  const myLastOctet = parseInt(parts[3], 10);
  
  console.log(`[SubnetScan] Scanning ${subnetPrefix}.0/24 (my IP: ${localIp})`);
  
  const foundDevices = [];
  
  // Probe each IP in parallel
  const probePromises = [];
  for (let i = 1; i <= 254; i++) {
    if (i === myLastOctet) continue; // Skip our own IP
    
    const ip = `${subnetPrefix}.${i}`;
    probePromises.push(probeDevice(ip));
  }
  
  const results = await Promise.all(probePromises);
  
  for (const device of results) {
    if (device) {
      foundDevices.push(device);
      console.log(`[SubnetScan] Found: ${device.name} at ${device.host}:${device.port}`);
      
      if (mainWindow) {
        mainWindow.webContents.send('sync:device-discovered', device);
      }
    }
  }
  
  console.log(`[SubnetScan] Complete. Found ${foundDevices.length} devices.`);
  return foundDevices;
}

/**
 * Probe a single IP for the sync API.
 */
function probeDevice(ip) {
  return new Promise((resolve) => {
    const http = require('http');
    
    const req = http.request({
      hostname: ip,
      port: SYNC_PORT,
      path: '/api/sync/status',
      method: 'GET',
      timeout: 1000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const status = JSON.parse(data);
            // Handle both new format (device object) and legacy format
            const deviceObj = status.device;
            resolve({
              name: deviceObj?.name || status.deviceName || 'Unknown',
              host: ip,
              port: SYNC_PORT,
              txt: {
                deviceId: deviceObj?.id || status.deviceId,
                deviceType: deviceObj?.type || status.deviceType,
                schemaVersion: status.schemaVersion
              }
            });
          } catch (e) {
            resolve(null);
          }
        } else {
          resolve(null);
        }
      });
    });
    
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
    
    req.end();
  });
}

// IPC handlers for renderer communication
ipcMain.handle('sync:get-device-info', () => deviceInfo);
ipcMain.handle('sync:get-server-status', () => ({
  running: syncServer !== null,
  port: SYNC_PORT,
  mdnsAdvertising: publishedService !== null
}));
ipcMain.handle('sync:scan-subnet', async () => {
  console.log('[IPC] Subnet scan requested');
  return await scanSubnet();
});

// Device name management
ipcMain.handle('device:get-name', () => {
  return { name: deviceInfo.deviceName };
});
ipcMain.handle('device:set-name', (event, { name }) => {
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return { success: false, error: 'Invalid device name' };
  }
  const success = setDeviceName(name.trim());
  return { success, name: deviceInfo.deviceName };
});

// ===== SEC-1: Pairing Session Management =====

// Start a new pairing session (called from UI)
ipcMain.handle('pairing:start-session', (event, { deviceType, deviceName }) => {
  const code = generatePairingCode();
  const expiresAt = Date.now() + (2 * 60 * 1000); // 2 minutes
  
  activePairingSession = {
    code,
    expiresAt,
    deviceType: deviceType || null,
    deviceName: deviceName || null
  };
  
  console.log(`[Pairing] Started session with code ${code}, expires at ${new Date(expiresAt).toISOString()}`);
  
  return {
    code,
    expiresAt: new Date(expiresAt).toISOString()
  };
});

// Cancel the current pairing session
ipcMain.handle('pairing:cancel-session', () => {
  activePairingSession = null;
  console.log('[Pairing] Session cancelled');
  return { success: true };
});

// Get current pairing session status
ipcMain.handle('pairing:get-session', () => {
  if (!activePairingSession) {
    return null;
  }
  
  return {
    code: activePairingSession.code,
    expiresAt: new Date(activePairingSession.expiresAt).toISOString(),
    isExpired: Date.now() > activePairingSession.expiresAt
  };
});

// Sync trusted devices from database to cache (called on app startup and after changes)
ipcMain.handle('pairing:sync-trusted-devices', (event, devices) => {
  trustedDevicesCache.clear();
  
  if (Array.isArray(devices)) {
    for (const device of devices) {
      if (device.authToken) {
        trustedDevicesCache.set(device.authToken, device);
      }
    }
    console.log(`[Pairing] Synced ${trustedDevicesCache.size} trusted devices to cache`);
  }
  
  return { success: true, count: trustedDevicesCache.size };
});

// Revoke a device (remove from cache)
ipcMain.handle('pairing:revoke-device', (event, { deviceId }) => {
  // Find and remove from cache
  for (const [token, device] of trustedDevicesCache.entries()) {
    if (device.id === deviceId) {
      trustedDevicesCache.delete(token);
      console.log(`[Pairing] Revoked device ${deviceId} from cache`);
      break;
    }
  }
  return { success: true };
});

// ===== Photo Processing (Phase 2) =====

/**
 * Get the photos directory path.
 */
function getPhotosDir() {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'photos', 'members');
}

/**
 * Ensure the photos directory exists.
 */
function ensurePhotosDir() {
  const photosDir = getPhotosDir();
  if (!fs.existsSync(photosDir)) {
    fs.mkdirSync(photosDir, { recursive: true });
    console.log('[Photo] Created photos directory:', photosDir);
  }
  return photosDir;
}

/**
 * Process a photo: save full resolution and generate thumbnail.
 * @param {string} internalId - Member's internal UUID
 * @param {string} base64Data - Base64 encoded photo data (without data URL prefix)
 * @returns {Promise<{photoPath: string, photoThumbnail: string}>}
 */
async function processPhoto(internalId, base64Data) {
  const photosDir = ensurePhotosDir();
  const photoPath = path.join(photosDir, `${internalId}.jpg`);

  // Decode base64 to buffer
  const imageBuffer = Buffer.from(base64Data, 'base64');

  // Save full resolution photo
  await fs.promises.writeFile(photoPath, imageBuffer);
  console.log(`[Photo] Saved full photo: ${photoPath} (${imageBuffer.length} bytes)`);

  // Generate 150x150 thumbnail
  const thumbnailBuffer = await sharp(imageBuffer)
    .resize(150, 150, {
      fit: 'cover',
      position: 'centre'
    })
    .jpeg({ quality: 75 })
    .toBuffer();

  // Convert thumbnail to data URL
  const thumbnailBase64 = thumbnailBuffer.toString('base64');
  const photoThumbnail = `data:image/jpeg;base64,${thumbnailBase64}`;

  console.log(`[Photo] Generated thumbnail: ${thumbnailBuffer.length} bytes`);

  return { photoPath, photoThumbnail };
}

/**
 * Delete a member's photo file.
 * @param {string} internalId - Member's internal UUID
 * @returns {boolean} True if file was deleted
 */
function deletePhoto(internalId) {
  const photoPath = path.join(getPhotosDir(), `${internalId}.jpg`);
  if (fs.existsSync(photoPath)) {
    fs.unlinkSync(photoPath);
    console.log(`[Photo] Deleted: ${photoPath}`);
    return true;
  }
  return false;
}

// IPC handlers for photo processing
ipcMain.handle('photo:process', async (event, { internalId, base64Data }) => {
  try {
    const result = await processPhoto(internalId, base64Data);
    return { success: true, ...result };
  } catch (error) {
    console.error('[Photo] Processing error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('photo:delete', (event, { internalId }) => {
  try {
    const deleted = deletePhoto(internalId);
    return { success: true, deleted };
  } catch (error) {
    console.error('[Photo] Delete error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('photo:get-path', (event, { internalId }) => {
  const photoPath = path.join(getPhotosDir(), `${internalId}.jpg`);
  const exists = fs.existsSync(photoPath);
  return {
    photoPath: exists ? photoPath : null,
    exists
  };
});

// ===== File Save API =====

ipcMain.handle('file:show-save-dialog', async (event, options = {}) => {
  const defaultFileName = options.defaultPath || 'SKV-export.xlsx';
  const defaultPath = path.join(app.getPath('documents'), defaultFileName);

  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath,
    filters: options.filters || [{ name: 'Excel', extensions: ['xlsx'] }]
  });

  return { canceled: result.canceled, filePath: result.filePath || null };
});

ipcMain.handle('file:save', async (event, { filePath, data }) => {
  try {
    if (!filePath) {
      return { success: false, error: 'No file path provided' };
    }
    fs.writeFileSync(filePath, Buffer.from(data));
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// IPC handler for renderer responding to data requests
ipcMain.on('sync:data-response', (event, { requestId, data, error }) => {
  const pending = pendingRequests.get(requestId);
  if (pending) {
    clearTimeout(pending.timer);
    pendingRequests.delete(requestId);
    if (error) {
      pending.reject(new Error(error));
    } else {
      pending.resolve(data);
    }
  }
});

// App lifecycle
app.whenReady().then(() => {
  // Initialize persistent device ID and name
  deviceInfo.deviceId = getOrCreateDeviceId();
  deviceInfo.deviceName = getDeviceName();
  console.log('[Startup] Device ID:', deviceInfo.deviceId);
  console.log('[Startup] Device Name:', deviceInfo.deviceName);

  createWindow();
  startSyncServer();
  startMdnsAdvertisement();
  
  // Run subnet scan as fallback after a short delay
  setTimeout(() => {
    console.log('[Startup] Running subnet scan as mDNS fallback...');
    scanSubnet();
  }, 3000);
  
  // Periodic rescan every 30 seconds for connection recovery
  setInterval(() => {
    console.log('[Periodic] Running subnet scan for connection recovery...');
    scanSubnet();
  }, 30000);

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
