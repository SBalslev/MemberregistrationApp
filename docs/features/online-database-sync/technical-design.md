# Online MySQL Database Integration - Technical Design

**Document Status:** Draft
**Created:** 2026-01-27
**Last Updated:** 2026-01-27
**Author:** sbalslev

---

## 1. Executive Summary

This document describes the technical architecture for integrating an online MySQL database into the Medlemscheckin laptop application. The design preserves the existing offline-first architecture while adding cloud synchronization capabilities.

**Key Design Principles:**
1. **Offline-first**: Local sql.js remains primary; MySQL is eventual-consistency backup
2. **Minimal disruption**: Existing repository patterns and sync logic unchanged
3. **Secure credentials**: Password never in source code; OS keychain for storage
4. **Schema versioning**: Backwards-compatible evolution with semantic versioning

---

## 2. Current Architecture Analysis

### 2.1 Database Layer (sql.js)

**Location:** `laptop/src/database/db.ts`

```
┌─────────────────────────────────────────────────────────────┐
│                    Renderer Process                         │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │ memberRepo  │  │ activityRepo│  │ syncService │        │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘        │
│         │                │                │                │
│         └────────────────┼────────────────┘                │
│                          ▼                                 │
│              ┌───────────────────┐                         │
│              │      db.ts        │                         │
│              │  query/execute    │                         │
│              └─────────┬─────────┘                         │
│                        ▼                                   │
│              ┌───────────────────┐                         │
│              │     sql.js        │                         │
│              │  (SQLite WASM)    │                         │
│              └─────────┬─────────┘                         │
│                        ▼                                   │
│              ┌───────────────────┐                         │
│              │    IndexedDB      │                         │
│              │  (Persistence)    │                         │
│              └───────────────────┘                         │
└─────────────────────────────────────────────────────────────┘
```

**Key Functions:**
```typescript
// Core database interface (db.ts)
query<T>(sql: string, params: SqlValue[]): T[]
execute(sql: string, params: SqlValue[]): void
transaction(fn: () => void): void
```

### 2.2 Electron Main Process

**Location:** `laptop/electron/main.cjs`

```
┌─────────────────────────────────────────────────────────────┐
│                    Main Process                             │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐    ┌─────────────────┐                │
│  │  HTTP Server    │    │  IPC Handlers   │                │
│  │  (Express:8085) │    │                 │                │
│  └────────┬────────┘    └────────┬────────┘                │
│           │                      │                          │
│           ▼                      ▼                          │
│  ┌─────────────────┐    ┌─────────────────┐                │
│  │ Tablet Sync API │    │ photo:process   │                │
│  │ /api/sync/*     │    │ device:*        │                │
│  └─────────────────┘    │ pairing:*       │                │
│                         └─────────────────┘                │
│                                                             │
│  ┌─────────────────────────────────────────┐               │
│  │            Device Storage               │               │
│  │  userData/device-id.txt                 │               │
│  │  userData/photos/members/*.jpg          │               │
│  └─────────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 Current Sync Flow (Local Network)

```
Tablet                    Laptop Main              Laptop Renderer
  │                           │                           │
  │  POST /api/sync/push      │                           │
  │ ─────────────────────────►│                           │
  │                           │  IPC: sync:process-push   │
  │                           │ ─────────────────────────►│
  │                           │                           │ processSyncPayload()
  │                           │  IPC: sync:data-response  │
  │                           │ ◄─────────────────────────│
  │  200 OK                   │                           │
  │ ◄─────────────────────────│                           │
```

---

## 3. Proposed Architecture

### 3.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Laptop Application                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         Renderer Process                             │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────────┐ │   │
│  │  │ Repositories│  │  SyncService│  │    OnlineSyncService        │ │   │
│  │  │ (existing)  │  │  (existing) │  │    (NEW)                    │ │   │
│  │  └──────┬──────┘  └──────┬──────┘  └──────────────┬──────────────┘ │   │
│  │         │                │                        │                 │   │
│  │         ▼                ▼                        ▼                 │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │                    DatabaseAdapter (NEW)                     │   │   │
│  │  │         Unified interface for local + online operations      │   │   │
│  │  └─────────────────────────┬───────────────────────────────────┘   │   │
│  │                            │                                       │   │
│  │              ┌─────────────┴─────────────┐                        │   │
│  │              ▼                           ▼                        │   │
│  │     ┌───────────────┐          ┌───────────────┐                 │   │
│  │     │    sql.js     │          │  IPC Bridge   │                 │   │
│  │     │ (Local DB)    │          │  (to Main)    │                 │   │
│  │     └───────┬───────┘          └───────┬───────┘                 │   │
│  │             ▼                          │                          │   │
│  │     ┌───────────────┐                  │                          │   │
│  │     │  IndexedDB    │                  │                          │   │
│  │     └───────────────┘                  │                          │   │
│  └─────────────────────────────────────────┼─────────────────────────┘   │
│                                            │                             │
│  ┌─────────────────────────────────────────┼─────────────────────────┐   │
│  │                         Main Process    │                         │   │
│  │                                         ▼                         │   │
│  │  ┌─────────────────┐  ┌─────────────────────────────────────┐    │   │
│  │  │ Tablet Sync     │  │      MySQLService (NEW)             │    │   │
│  │  │ (existing)      │  │  ┌─────────────────────────────┐    │    │   │
│  │  └─────────────────┘  │  │  Connection Pool            │    │    │   │
│  │                       │  │  mysql2/promise             │    │    │   │
│  │  ┌─────────────────┐  │  └─────────────────────────────┘    │    │   │
│  │  │ safeStorage     │  │  ┌─────────────────────────────┐    │    │   │
│  │  │ (Credentials)   │──┼──│  Credential Manager         │    │    │   │
│  │  └─────────────────┘  │  └─────────────────────────────┘    │    │   │
│  │                       └─────────────────┬───────────────────┘    │   │
│  └─────────────────────────────────────────┼─────────────────────────┘   │
│                                            │                             │
└────────────────────────────────────────────┼─────────────────────────────┘
                                             │
                                             ▼
                              ┌───────────────────────────┐
                              │      MySQL Server         │
                              │  iss-skydning.dk:3306     │
                              └───────────────────────────┘
```

### 3.2 Component Overview

| Component | Location | Responsibility |
|-----------|----------|----------------|
| `MySQLService` | `electron/mysqlService.cjs` | Connection management, query execution |
| `CredentialManager` | `electron/credentialManager.cjs` | Secure password storage via safeStorage |
| `OnlineSyncService` | `src/database/onlineSync/onlineSyncService.ts` | Sync orchestration, conflict resolution |
| `DatabaseAdapter` | `src/database/databaseAdapter.ts` | Unified local/online interface |
| `OnlineConnectionStore` | `src/stores/onlineConnectionStore.ts` | Connection state management |

---

## 4. Credential Management

### 4.1 Electron safeStorage API

The `safeStorage` API uses OS-level encryption:
- **Windows:** DPAPI (Data Protection API)
- **macOS:** Keychain Services
- **Linux:** Secret Service API (libsecret)

### 4.2 Credential Manager Implementation

**File:** `laptop/electron/credentialManager.cjs`

```javascript
const { safeStorage } = require('electron');
const Store = require('electron-store');

const store = new Store({
  name: 'online-db-credentials',
  encryptionKey: 'medlemscheckin-config'  // For non-sensitive metadata
});

const CREDENTIAL_KEY = 'mysql-password';

class CredentialManager {
  /**
   * Check if safeStorage is available (requires app.isReady())
   */
  isAvailable() {
    return safeStorage.isEncryptionAvailable();
  }

  /**
   * Store password securely in OS keychain
   */
  savePassword(password) {
    if (!this.isAvailable()) {
      throw new Error('Secure storage not available');
    }
    const encrypted = safeStorage.encryptString(password);
    store.set(CREDENTIAL_KEY, encrypted.toString('base64'));
    return true;
  }

  /**
   * Retrieve password from OS keychain
   */
  getPassword() {
    if (!this.isAvailable()) {
      return null;
    }
    const encrypted = store.get(CREDENTIAL_KEY);
    if (!encrypted) {
      return null;
    }
    try {
      const buffer = Buffer.from(encrypted, 'base64');
      return safeStorage.decryptString(buffer);
    } catch (err) {
      console.error('Failed to decrypt password:', err);
      return null;
    }
  }

  /**
   * Check if password is stored
   */
  hasStoredPassword() {
    return store.has(CREDENTIAL_KEY);
  }

  /**
   * Remove stored password
   */
  clearPassword() {
    store.delete(CREDENTIAL_KEY);
  }

  /**
   * Get connection metadata (non-sensitive)
   */
  getConnectionConfig() {
    return {
      host: store.get('mysql-host', 'iss-skydning.dk.mysql'),
      port: store.get('mysql-port', 3306),
      database: store.get('mysql-database', 'iss_skydning_dkisssportsskytter'),
      user: store.get('mysql-user', 'iss_skydning_dkisssportsskytter'),
    };
  }
}

module.exports = { CredentialManager };
```

### 4.3 IPC Handlers for Credentials

**File:** `laptop/electron/main.cjs` (additions)

```javascript
const { CredentialManager } = require('./credentialManager.cjs');
const credentialManager = new CredentialManager();

// Check if password is stored
ipcMain.handle('credentials:has-stored', () => {
  return credentialManager.hasStoredPassword();
});

// Save password to keychain
ipcMain.handle('credentials:save', (event, password) => {
  return credentialManager.savePassword(password);
});

// Get stored password (for connection)
ipcMain.handle('credentials:get', () => {
  return credentialManager.getPassword();
});

// Clear stored password
ipcMain.handle('credentials:clear', () => {
  credentialManager.clearPassword();
  return true;
});

// Get connection config (without password)
ipcMain.handle('credentials:get-config', () => {
  return credentialManager.getConnectionConfig();
});
```

### 4.4 Preload API

**File:** `laptop/electron/preload.cjs` (additions)

```javascript
contextBridge.exposeInMainWorld('electronAPI', {
  // ... existing methods ...

  // Credential management
  hasStoredPassword: () => ipcRenderer.invoke('credentials:has-stored'),
  savePassword: (password) => ipcRenderer.invoke('credentials:save', password),
  getStoredPassword: () => ipcRenderer.invoke('credentials:get'),
  clearStoredPassword: () => ipcRenderer.invoke('credentials:clear'),
  getConnectionConfig: () => ipcRenderer.invoke('credentials:get-config'),

  // MySQL operations
  mysqlConnect: (password) => ipcRenderer.invoke('mysql:connect', password),
  mysqlDisconnect: () => ipcRenderer.invoke('mysql:disconnect'),
  mysqlQuery: (sql, params) => ipcRenderer.invoke('mysql:query', sql, params),
  mysqlGetStatus: () => ipcRenderer.invoke('mysql:status'),
  mysqlTestConnection: (password) => ipcRenderer.invoke('mysql:test', password),
});
```

---

## 5. MySQL Service Implementation

### 5.1 Connection Pool Manager

**File:** `laptop/electron/mysqlService.cjs`

```javascript
const mysql = require('mysql2/promise');

class MySQLService {
  constructor() {
    this.pool = null;
    this.config = null;
    this.isConnected = false;
    this.lastError = null;
    this.connectionAttempts = 0;
  }

  /**
   * Initialize connection pool
   */
  async connect(config, password) {
    if (this.pool) {
      await this.disconnect();
    }

    this.config = { ...config, password };
    this.connectionAttempts++;

    try {
      this.pool = mysql.createPool({
        host: config.host,
        port: config.port,
        user: config.user,
        password: password,
        database: config.database,
        waitForConnections: true,
        connectionLimit: 5,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 30000,
        connectTimeout: 10000,
        ssl: {
          rejectUnauthorized: false  // Allow self-signed certs for now
        }
      });

      // Test connection
      const connection = await this.pool.getConnection();
      await connection.ping();
      connection.release();

      this.isConnected = true;
      this.lastError = null;
      console.log('MySQL connected successfully');
      return { success: true };

    } catch (err) {
      this.lastError = err.message;
      this.isConnected = false;
      console.error('MySQL connection failed:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Close connection pool
   */
  async disconnect() {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
    this.isConnected = false;
    this.config = null;
  }

  /**
   * Execute a query with parameters
   */
  async query(sql, params = []) {
    if (!this.pool || !this.isConnected) {
      throw new Error('Not connected to MySQL');
    }

    try {
      const [rows] = await this.pool.execute(sql, params);
      return rows;
    } catch (err) {
      console.error('MySQL query error:', err.message);
      throw err;
    }
  }

  /**
   * Execute multiple queries in a transaction
   */
  async transaction(queries) {
    if (!this.pool || !this.isConnected) {
      throw new Error('Not connected to MySQL');
    }

    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();

      const results = [];
      for (const { sql, params } of queries) {
        const [rows] = await connection.execute(sql, params || []);
        results.push(rows);
      }

      await connection.commit();
      return results;

    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * Get connection status
   */
  getStatus() {
    return {
      isConnected: this.isConnected,
      lastError: this.lastError,
      connectionAttempts: this.connectionAttempts,
      host: this.config?.host || null,
      database: this.config?.database || null,
    };
  }

  /**
   * Test connection without storing
   */
  async testConnection(config, password) {
    let testPool = null;
    try {
      testPool = mysql.createPool({
        host: config.host,
        port: config.port,
        user: config.user,
        password: password,
        database: config.database,
        connectionLimit: 1,
        connectTimeout: 5000,
        ssl: { rejectUnauthorized: false }
      });

      const connection = await testPool.getConnection();
      await connection.ping();
      connection.release();
      await testPool.end();

      return { success: true };

    } catch (err) {
      if (testPool) await testPool.end();
      return { success: false, error: err.message };
    }
  }
}

module.exports = { MySQLService };
```

### 5.2 IPC Handlers for MySQL

**File:** `laptop/electron/main.cjs` (additions)

```javascript
const { MySQLService } = require('./mysqlService.cjs');
const mysqlService = new MySQLService();

ipcMain.handle('mysql:connect', async (event, password) => {
  const config = credentialManager.getConnectionConfig();
  return await mysqlService.connect(config, password);
});

ipcMain.handle('mysql:disconnect', async () => {
  await mysqlService.disconnect();
  return { success: true };
});

ipcMain.handle('mysql:query', async (event, sql, params) => {
  return await mysqlService.query(sql, params);
});

ipcMain.handle('mysql:transaction', async (event, queries) => {
  return await mysqlService.transaction(queries);
});

ipcMain.handle('mysql:status', () => {
  return mysqlService.getStatus();
});

ipcMain.handle('mysql:test', async (event, password) => {
  const config = credentialManager.getConnectionConfig();
  return await mysqlService.testConnection(config, password);
});
```

---

## 6. Schema Versioning

### 6.1 Version Check on Connection

**File:** `laptop/src/database/onlineSync/schemaVersionService.ts`

```typescript
export interface SchemaVersion {
  major: number;
  minor: number;
  patch: number;
}

export interface VersionCheckResult {
  compatible: boolean;
  localVersion: SchemaVersion;
  remoteVersion: SchemaVersion;
  message: string;
  action: 'proceed' | 'warn' | 'block';
}

// Current app's expected schema version
export const APP_SCHEMA_VERSION: SchemaVersion = {
  major: 1,
  minor: 0,
  patch: 0,
};

export async function checkSchemaVersion(): Promise<VersionCheckResult> {
  try {
    const rows = await window.electronAPI.mysqlQuery(
      'SELECT major_version, minor_version, patch_version FROM _schema_metadata WHERE id = 1'
    );

    if (rows.length === 0) {
      return {
        compatible: false,
        localVersion: APP_SCHEMA_VERSION,
        remoteVersion: { major: 0, minor: 0, patch: 0 },
        message: 'Remote database has no schema version. Database may need initialization.',
        action: 'block',
      };
    }

    const remote: SchemaVersion = {
      major: rows[0].major_version,
      minor: rows[0].minor_version,
      patch: rows[0].patch_version,
    };

    // Major version mismatch = incompatible
    if (remote.major !== APP_SCHEMA_VERSION.major) {
      return {
        compatible: false,
        localVersion: APP_SCHEMA_VERSION,
        remoteVersion: remote,
        message: `Major version mismatch: App expects v${formatVersion(APP_SCHEMA_VERSION)}, database is v${formatVersion(remote)}. Please update the application.`,
        action: 'block',
      };
    }

    // Minor version mismatch = warn but allow
    if (remote.minor > APP_SCHEMA_VERSION.minor) {
      return {
        compatible: true,
        localVersion: APP_SCHEMA_VERSION,
        remoteVersion: remote,
        message: `Database has newer features (v${formatVersion(remote)}). Some features may not sync. Consider updating the app.`,
        action: 'warn',
      };
    }

    // Fully compatible
    return {
      compatible: true,
      localVersion: APP_SCHEMA_VERSION,
      remoteVersion: remote,
      message: `Schema version compatible: v${formatVersion(remote)}`,
      action: 'proceed',
    };

  } catch (err) {
    return {
      compatible: false,
      localVersion: APP_SCHEMA_VERSION,
      remoteVersion: { major: 0, minor: 0, patch: 0 },
      message: `Failed to check schema version: ${err.message}`,
      action: 'block',
    };
  }
}

function formatVersion(v: SchemaVersion): string {
  return `${v.major}.${v.minor}.${v.patch}`;
}
```

### 6.2 Migration Runner

**File:** `laptop/src/database/onlineSync/migrationRunner.ts`

```typescript
interface Migration {
  version: string;
  name: string;
  up: string;    // SQL to apply
  down: string;  // SQL to rollback (best effort)
}

const migrations: Migration[] = [
  {
    version: '1.0.0',
    name: 'initial_schema',
    up: `-- See full schema in prd.md section 7`,
    down: `-- Not supported for initial schema`,
  },
  // Future migrations added here
];

export async function runPendingMigrations(): Promise<{
  applied: string[];
  errors: string[];
}> {
  const applied: string[] = [];
  const errors: string[] = [];

  // Get already applied migrations
  const rows = await window.electronAPI.mysqlQuery(
    'SELECT version FROM _migrations ORDER BY id'
  );
  const appliedVersions = new Set(rows.map(r => r.version));

  for (const migration of migrations) {
    if (appliedVersions.has(migration.version)) {
      continue;  // Already applied
    }

    try {
      const startTime = Date.now();

      // Run migration in transaction
      await window.electronAPI.mysqlQuery(migration.up);

      // Record migration
      await window.electronAPI.mysqlQuery(
        `INSERT INTO _migrations (version, name, execution_time_ms) VALUES (?, ?, ?)`,
        [migration.version, migration.name, Date.now() - startTime]
      );

      applied.push(migration.version);

    } catch (err) {
      errors.push(`Migration ${migration.version} failed: ${err.message}`);
      break;  // Stop on first error
    }
  }

  return { applied, errors };
}
```

---

## 7. Online Sync Service

### 7.1 Sync Orchestration

**File:** `laptop/src/database/onlineSync/onlineSyncService.ts`

```typescript
import { checkSchemaVersion, VersionCheckResult } from './schemaVersionService';
import { getMemberDataForOnlineSync, processMembersFromOnline } from './memberOnlineSync';
import { getPhotosForSync, processPhotosFromOnline } from './photoOnlineSync';

export interface OnlineSyncResult {
  success: boolean;
  message: string;
  stats: {
    membersPushed: number;
    membersPulled: number;
    photosPushed: number;
    photosPulled: number;
    conflicts: number;
  };
  errors: string[];
  duration: number;
}

export interface OnlineSyncProgress {
  phase: 'connecting' | 'checking_version' | 'pushing_members' | 'pulling_members' |
         'pushing_photos' | 'pulling_photos' | 'finalizing';
  current: number;
  total: number;
  message: string;
}

type ProgressCallback = (progress: OnlineSyncProgress) => void;

export async function performOnlineSync(
  onProgress?: ProgressCallback
): Promise<OnlineSyncResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  const stats = {
    membersPushed: 0,
    membersPulled: 0,
    photosPushed: 0,
    photosPulled: 0,
    conflicts: 0,
  };

  try {
    // Phase 1: Check connection
    onProgress?.({ phase: 'connecting', current: 0, total: 6, message: 'Checking connection...' });
    const status = await window.electronAPI.mysqlGetStatus();
    if (!status.isConnected) {
      return {
        success: false,
        message: 'Not connected to online database',
        stats,
        errors: ['Not connected'],
        duration: Date.now() - startTime,
      };
    }

    // Phase 2: Check schema version
    onProgress?.({ phase: 'checking_version', current: 1, total: 6, message: 'Checking schema version...' });
    const versionCheck = await checkSchemaVersion();
    if (versionCheck.action === 'block') {
      return {
        success: false,
        message: versionCheck.message,
        stats,
        errors: [versionCheck.message],
        duration: Date.now() - startTime,
      };
    }
    if (versionCheck.action === 'warn') {
      errors.push(versionCheck.message);
    }

    // Phase 3: Push members to online
    onProgress?.({ phase: 'pushing_members', current: 2, total: 6, message: 'Uploading members...' });
    const pushResult = await pushMembersToOnline();
    stats.membersPushed = pushResult.count;
    if (pushResult.errors.length > 0) {
      errors.push(...pushResult.errors);
    }

    // Phase 4: Pull members from online
    onProgress?.({ phase: 'pulling_members', current: 3, total: 6, message: 'Downloading members...' });
    const pullResult = await pullMembersFromOnline();
    stats.membersPulled = pullResult.count;
    stats.conflicts = pullResult.conflicts;
    if (pullResult.errors.length > 0) {
      errors.push(...pullResult.errors);
    }

    // Phase 5: Push photos
    onProgress?.({ phase: 'pushing_photos', current: 4, total: 6, message: 'Uploading photos...' });
    const photoPushResult = await pushPhotosToOnline();
    stats.photosPushed = photoPushResult.count;

    // Phase 6: Pull photos
    onProgress?.({ phase: 'pulling_photos', current: 5, total: 6, message: 'Downloading photos...' });
    const photoPullResult = await pullPhotosFromOnline();
    stats.photosPulled = photoPullResult.count;

    // Phase 7: Finalize
    onProgress?.({ phase: 'finalizing', current: 6, total: 6, message: 'Finalizing...' });
    await recordSyncLog(stats, errors.length === 0 ? 'SUCCESS' : 'PARTIAL');

    return {
      success: errors.length === 0,
      message: errors.length === 0
        ? `Sync completed: ${stats.membersPushed} pushed, ${stats.membersPulled} pulled`
        : `Sync completed with ${errors.length} warnings`,
      stats,
      errors,
      duration: Date.now() - startTime,
    };

  } catch (err) {
    await recordSyncLog(stats, 'FAILED', err.message);
    return {
      success: false,
      message: `Sync failed: ${err.message}`,
      stats,
      errors: [...errors, err.message],
      duration: Date.now() - startTime,
    };
  }
}

async function recordSyncLog(
  stats: OnlineSyncResult['stats'],
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED',
  errorMessage?: string
): Promise<void> {
  const deviceId = await window.electronAPI.getDeviceId();
  await window.electronAPI.mysqlQuery(
    `INSERT INTO _sync_log
     (device_id, sync_direction, started_at, completed_at, status,
      entities_pushed, entities_pulled, error_message, app_version)
     VALUES (?, 'PUSH', NOW(), NOW(), ?, ?, ?, ?, ?)`,
    [
      deviceId,
      status,
      stats.membersPushed + stats.photosPushed,
      stats.membersPulled + stats.photosPulled,
      errorMessage || null,
      '1.0.0',  // TODO: Get from package.json
    ]
  );
}
```

### 7.2 Member Sync Logic

**File:** `laptop/src/database/onlineSync/memberOnlineSync.ts`

```typescript
import { query } from '../db';
import { Member } from '../../types/entities';

const BATCH_SIZE = 50;

interface PushResult {
  count: number;
  errors: string[];
}

interface PullResult {
  count: number;
  conflicts: number;
  errors: string[];
}

export async function pushMembersToOnline(): Promise<PushResult> {
  const errors: string[] = [];
  let count = 0;

  // Get local members with changes since last sync
  const members = query<Member>(
    `SELECT * FROM Member
     WHERE syncedAtUtc IS NULL
        OR updatedAtUtc > syncedAtUtc
     ORDER BY updatedAtUtc ASC`
  );

  // Process in batches
  for (let i = 0; i < members.length; i += BATCH_SIZE) {
    const batch = members.slice(i, i + BATCH_SIZE);

    for (const member of batch) {
      try {
        // Check if exists in online DB
        const existing = await window.electronAPI.mysqlQuery(
          'SELECT internal_id, sync_version FROM members WHERE internal_id = ?',
          [member.internalId]
        );

        if (existing.length === 0) {
          // Insert new member
          await insertMemberOnline(member);
        } else if (member.syncVersion > existing[0].sync_version) {
          // Update if local is newer
          await updateMemberOnline(member);
        }
        // else: online is same or newer, skip push

        count++;

      } catch (err) {
        errors.push(`Failed to push member ${member.internalId}: ${err.message}`);
      }
    }
  }

  return { count, errors };
}

export async function pullMembersFromOnline(): Promise<PullResult> {
  const errors: string[] = [];
  let count = 0;
  let conflicts = 0;

  // Get last sync timestamp
  const lastSync = getLastOnlineSyncTime();

  // Pull members modified since last sync
  const onlineMembers = await window.electronAPI.mysqlQuery(
    `SELECT * FROM members
     WHERE modified_at_utc > ? OR synced_at_utc IS NULL
     ORDER BY modified_at_utc ASC
     LIMIT 1000`,
    [lastSync || '1970-01-01']
  );

  for (const online of onlineMembers) {
    try {
      const local = query<Member>(
        'SELECT * FROM Member WHERE internalId = ?',
        [online.internal_id]
      )[0];

      if (!local) {
        // New member from online - insert locally
        insertMemberLocal(mapOnlineToLocal(online));
        count++;
      } else if (online.sync_version > local.syncVersion) {
        // Online is newer - update local
        updateMemberLocal(mapOnlineToLocal(online));
        count++;
      } else if (online.sync_version < local.syncVersion) {
        // Local is newer - already pushed or will be
        // No action needed
      } else {
        // Same version but different timestamps = conflict
        if (online.modified_at_utc !== local.updatedAtUtc) {
          // Resolve by taking online (arbitrary but deterministic)
          updateMemberLocal(mapOnlineToLocal(online));
          conflicts++;
          count++;
        }
      }

    } catch (err) {
      errors.push(`Failed to process member ${online.internal_id}: ${err.message}`);
    }
  }

  return { count, conflicts, errors };
}

function mapOnlineToLocal(online: any): Partial<Member> {
  return {
    internalId: online.internal_id,
    membershipId: online.membership_id,
    memberLifecycleStage: online.member_type,
    status: online.status,
    firstName: online.first_name,
    lastName: online.last_name,
    birthDate: online.birth_date,
    gender: online.gender,
    email: online.email,
    phone: online.phone,
    address: online.address,
    zipCode: online.zip_code,
    city: online.city,
    guardianName: online.guardian_name,
    guardianPhone: online.guardian_phone,
    guardianEmail: online.guardian_email,
    expiresOn: online.expires_on,
    syncVersion: online.sync_version,
    createdAtUtc: online.created_at_utc,
    updatedAtUtc: online.modified_at_utc,
    syncedAtUtc: new Date().toISOString(),
  };
}

async function insertMemberOnline(member: Member): Promise<void> {
  await window.electronAPI.mysqlQuery(
    `INSERT INTO members (
      internal_id, membership_id, member_type, status,
      first_name, last_name, birth_date, gender,
      email, phone, address, zip_code, city,
      guardian_name, guardian_phone, guardian_email,
      expires_on, merged_into_id,
      device_id, sync_version, created_at_utc, modified_at_utc, synced_at_utc
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      member.internalId,
      member.membershipId,
      member.memberLifecycleStage,
      member.status,
      member.firstName,
      member.lastName,
      member.birthDate,
      member.gender,
      member.email,
      member.phone,
      member.address,
      member.zipCode,
      member.city,
      member.guardianName,
      member.guardianPhone,
      member.guardianEmail,
      member.expiresOn,
      member.mergedIntoId,
      await window.electronAPI.getDeviceId(),
      member.syncVersion,
      member.createdAtUtc,
      member.updatedAtUtc,
    ]
  );
}

// ... updateMemberOnline, insertMemberLocal, updateMemberLocal implementations ...
```

### 7.3 Photo Binary Sync

**File:** `laptop/src/database/onlineSync/photoOnlineSync.ts`

```typescript
import * as crypto from 'crypto';

const PHOTO_BATCH_SIZE = 10;  // Smaller batches for binary data
const MAX_PHOTO_SIZE = 16 * 1024 * 1024;  // 16MB limit

interface PhotoSyncResult {
  count: number;
  errors: string[];
}

export async function pushPhotosToOnline(): Promise<PhotoSyncResult> {
  const errors: string[] = [];
  let count = 0;

  // Get members with photos that haven't been synced
  const membersWithPhotos = await getMembersNeedingPhotoSync();

  for (const member of membersWithPhotos) {
    try {
      // Read photo from disk
      const photoData = await window.electronAPI.readPhotoFile(member.internalId);
      if (!photoData) continue;

      // Calculate hash for deduplication
      const contentHash = crypto.createHash('sha256').update(photoData).digest('hex');

      // Check if photo already exists online with same hash
      const existing = await window.electronAPI.mysqlQuery(
        'SELECT id FROM member_photos WHERE internal_member_id = ? AND content_hash = ?',
        [member.internalId, contentHash]
      );

      if (existing.length > 0) {
        // Photo unchanged, skip
        continue;
      }

      // Compress photo if needed
      const compressedData = await compressPhoto(photoData);

      if (compressedData.length > MAX_PHOTO_SIZE) {
        errors.push(`Photo for ${member.internalId} exceeds 16MB limit`);
        continue;
      }

      // Upload to MySQL
      await window.electronAPI.mysqlQuery(
        `INSERT INTO member_photos (
          id, internal_member_id, photo_type, content_hash,
          mime_type, file_size, photo_data,
          device_id, sync_version, created_at_utc, synced_at_utc
        ) VALUES (?, ?, 'registration', ?, 'image/jpeg', ?, ?, ?, 1, NOW(), NOW())
        ON DUPLICATE KEY UPDATE
          photo_data = VALUES(photo_data),
          content_hash = VALUES(content_hash),
          file_size = VALUES(file_size),
          synced_at_utc = NOW()`,
        [
          crypto.randomUUID(),
          member.internalId,
          contentHash,
          compressedData.length,
          compressedData,
          await window.electronAPI.getDeviceId(),
        ]
      );

      count++;

    } catch (err) {
      errors.push(`Failed to push photo for ${member.internalId}: ${err.message}`);
    }
  }

  return { count, errors };
}

export async function pullPhotosFromOnline(): Promise<PhotoSyncResult> {
  const errors: string[] = [];
  let count = 0;

  // Get photos from online that we don't have locally
  const onlinePhotos = await window.electronAPI.mysqlQuery(
    `SELECT p.id, p.internal_member_id, p.content_hash, p.photo_data
     FROM member_photos p
     LEFT JOIN (
       SELECT internal_member_id, content_hash
       FROM local_photo_hashes
     ) l ON p.internal_member_id = l.internal_member_id
        AND p.content_hash = l.content_hash
     WHERE l.internal_member_id IS NULL
     LIMIT ?`,
    [PHOTO_BATCH_SIZE]
  );

  for (const photo of onlinePhotos) {
    try {
      // Write photo to local disk
      await window.electronAPI.writePhotoFile(
        photo.internal_member_id,
        photo.photo_data
      );

      // Generate thumbnail
      await window.electronAPI.processPhoto({
        internalId: photo.internal_member_id,
        base64Data: photo.photo_data.toString('base64'),
      });

      count++;

    } catch (err) {
      errors.push(`Failed to pull photo for ${photo.internal_member_id}: ${err.message}`);
    }
  }

  return { count, errors };
}

async function compressPhoto(data: Buffer): Promise<Buffer> {
  // Use sharp in main process for compression
  return await window.electronAPI.compressPhoto(data, {
    quality: 80,
    maxWidth: 1920,
    maxHeight: 1920,
  });
}
```

---

## 8. State Management

### 8.1 Online Connection Store

**File:** `laptop/src/stores/onlineConnectionStore.ts`

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface OnlineConnectionState {
  // Connection status
  isConnected: boolean;
  isConnecting: boolean;
  lastError: string | null;

  // Sync status
  isSyncing: boolean;
  lastSyncTime: string | null;
  lastSyncResult: 'success' | 'partial' | 'failed' | null;
  pendingChangesCount: number;

  // Schema version
  schemaVersion: string | null;
  versionWarning: string | null;

  // Actions
  connect: (password: string, remember: boolean) => Promise<boolean>;
  disconnect: () => Promise<void>;
  testConnection: (password: string) => Promise<{ success: boolean; error?: string }>;
  sync: () => Promise<void>;
  checkPendingChanges: () => Promise<void>;
}

export const useOnlineConnectionStore = create<OnlineConnectionState>()(
  persist(
    (set, get) => ({
      // Initial state
      isConnected: false,
      isConnecting: false,
      lastError: null,
      isSyncing: false,
      lastSyncTime: null,
      lastSyncResult: null,
      pendingChangesCount: 0,
      schemaVersion: null,
      versionWarning: null,

      connect: async (password, remember) => {
        set({ isConnecting: true, lastError: null });

        try {
          // Save password if requested
          if (remember) {
            await window.electronAPI.savePassword(password);
          }

          // Connect to MySQL
          const result = await window.electronAPI.mysqlConnect(password);

          if (!result.success) {
            set({ isConnecting: false, lastError: result.error });
            return false;
          }

          // Check schema version
          const versionCheck = await checkSchemaVersion();

          set({
            isConnected: true,
            isConnecting: false,
            schemaVersion: `${versionCheck.remoteVersion.major}.${versionCheck.remoteVersion.minor}.${versionCheck.remoteVersion.patch}`,
            versionWarning: versionCheck.action === 'warn' ? versionCheck.message : null,
          });

          return true;

        } catch (err) {
          set({ isConnecting: false, lastError: err.message });
          return false;
        }
      },

      disconnect: async () => {
        await window.electronAPI.mysqlDisconnect();
        set({
          isConnected: false,
          schemaVersion: null,
          versionWarning: null,
        });
      },

      testConnection: async (password) => {
        return await window.electronAPI.mysqlTestConnection(password);
      },

      sync: async () => {
        const { isConnected, isSyncing } = get();
        if (!isConnected || isSyncing) return;

        set({ isSyncing: true });

        try {
          const result = await performOnlineSync((progress) => {
            // Could emit progress events here
            console.log('Sync progress:', progress);
          });

          set({
            isSyncing: false,
            lastSyncTime: new Date().toISOString(),
            lastSyncResult: result.success ? 'success' :
                           result.errors.length > 0 ? 'partial' : 'failed',
          });

        } catch (err) {
          set({
            isSyncing: false,
            lastSyncResult: 'failed',
            lastError: err.message,
          });
        }
      },

      checkPendingChanges: async () => {
        const count = await countPendingOnlineChanges();
        set({ pendingChangesCount: count });
      },
    }),
    {
      name: 'online-connection-store',
      partialize: (state) => ({
        lastSyncTime: state.lastSyncTime,
        lastSyncResult: state.lastSyncResult,
      }),
    }
  )
);
```

---

## 9. UI Components

### 9.1 Connection Dialog

**File:** `laptop/src/components/onlineSync/ConnectionDialog.tsx`

```tsx
import { useState, useEffect } from 'react';
import { useOnlineConnectionStore } from '../../stores/onlineConnectionStore';
import { Cloud, CloudOff, Key, Eye, EyeOff, Loader2 } from 'lucide-react';

interface ConnectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ConnectionDialog({ isOpen, onClose }: ConnectionDialogProps) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberPassword, setRememberPassword] = useState(false);
  const [hasStoredPassword, setHasStoredPassword] = useState(false);
  const [testResult, setTestResult] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');

  const { connect, testConnection, isConnecting, lastError } = useOnlineConnectionStore();

  useEffect(() => {
    if (isOpen) {
      checkStoredPassword();
    }
  }, [isOpen]);

  async function checkStoredPassword() {
    const hasStored = await window.electronAPI.hasStoredPassword();
    setHasStoredPassword(hasStored);
    if (hasStored) {
      setRememberPassword(true);
    }
  }

  async function handleConnect() {
    let pwd = password;

    // Use stored password if available and no new password entered
    if (hasStoredPassword && !password) {
      pwd = await window.electronAPI.getStoredPassword();
    }

    const success = await connect(pwd, rememberPassword);
    if (success) {
      onClose();
    }
  }

  async function handleTest() {
    setTestResult('testing');
    let pwd = password;

    if (hasStoredPassword && !password) {
      pwd = await window.electronAPI.getStoredPassword();
    }

    const result = await testConnection(pwd);
    setTestResult(result.success ? 'success' : 'failed');
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <div className="flex items-center gap-3 mb-6">
          <Cloud className="w-6 h-6 text-blue-600" />
          <h2 className="text-xl font-semibold">Connect to Online Database</h2>
        </div>

        <div className="space-y-4">
          {/* Server info (read-only) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Server
            </label>
            <input
              type="text"
              value="iss-skydning.dk.mysql:3306"
              disabled
              className="w-full px-3 py-2 border rounded-md bg-gray-50 text-gray-500"
            />
          </div>

          {/* Password input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={hasStoredPassword ? '(using saved password)' : 'Enter password'}
                className="w-full px-3 py-2 pr-10 border rounded-md focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Remember password checkbox */}
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={rememberPassword}
              onChange={(e) => setRememberPassword(e.target.checked)}
              className="rounded border-gray-300"
            />
            <span className="text-sm text-gray-600">
              Remember password (stored securely in OS keychain)
            </span>
          </label>

          {/* Error message */}
          {lastError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
              {lastError}
            </div>
          )}

          {/* Test result */}
          {testResult === 'success' && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-md text-green-700 text-sm">
              Connection successful!
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={handleTest}
            disabled={isConnecting || testResult === 'testing'}
            className="px-4 py-2 text-gray-700 border rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            {testResult === 'testing' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              'Test Connection'
            )}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 border rounded-md hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConnect}
            disabled={isConnecting}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            {isConnecting && <Loader2 className="w-4 h-4 animate-spin" />}
            Connect
          </button>
        </div>
      </div>
    </div>
  );
}
```

### 9.2 Sync Status Component

**File:** `laptop/src/components/onlineSync/SyncStatus.tsx`

```tsx
import { useOnlineConnectionStore } from '../../stores/onlineConnectionStore';
import { Cloud, CloudOff, RefreshCw, AlertTriangle, Check } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { da } from 'date-fns/locale';

export function SyncStatus() {
  const {
    isConnected,
    isSyncing,
    lastSyncTime,
    lastSyncResult,
    pendingChangesCount,
    versionWarning,
    sync,
  } = useOnlineConnectionStore();

  return (
    <div className="flex items-center gap-4 px-4 py-2 bg-gray-50 border-b">
      {/* Connection status */}
      <div className="flex items-center gap-2">
        {isConnected ? (
          <>
            <Cloud className="w-4 h-4 text-green-600" />
            <span className="text-sm text-green-700">Online</span>
          </>
        ) : (
          <>
            <CloudOff className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-500">Offline</span>
          </>
        )}
      </div>

      {/* Last sync time */}
      {lastSyncTime && (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          {lastSyncResult === 'success' && <Check className="w-4 h-4 text-green-500" />}
          {lastSyncResult === 'partial' && <AlertTriangle className="w-4 h-4 text-yellow-500" />}
          {lastSyncResult === 'failed' && <AlertTriangle className="w-4 h-4 text-red-500" />}
          <span>
            Synced {formatDistanceToNow(new Date(lastSyncTime), { addSuffix: true, locale: da })}
          </span>
        </div>
      )}

      {/* Pending changes */}
      {pendingChangesCount > 0 && (
        <div className="text-sm text-orange-600">
          {pendingChangesCount} pending changes
        </div>
      )}

      {/* Version warning */}
      {versionWarning && (
        <div className="flex items-center gap-1 text-sm text-yellow-600">
          <AlertTriangle className="w-4 h-4" />
          <span>Schema update available</span>
        </div>
      )}

      {/* Sync button */}
      {isConnected && (
        <button
          onClick={() => sync()}
          disabled={isSyncing}
          className="ml-auto flex items-center gap-2 px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
          {isSyncing ? 'Syncing...' : 'Sync Now'}
        </button>
      )}
    </div>
  );
}
```

---

## 10. Error Handling & Resilience

### 10.1 Retry Strategy

```typescript
const RETRY_CONFIG = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};

async function withRetry<T>(
  operation: () => Promise<T>,
  config = RETRY_CONFIG
): Promise<T> {
  let lastError: Error;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;

      if (attempt < config.maxAttempts) {
        const delay = Math.min(
          config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt - 1),
          config.maxDelayMs
        );
        await sleep(delay);
      }
    }
  }

  throw lastError;
}
```

### 10.2 Connection Loss Handling

```typescript
// In MySQLService
async query(sql, params) {
  try {
    return await this.pool.execute(sql, params);
  } catch (err) {
    if (isConnectionError(err)) {
      // Attempt reconnect
      await this.reconnect();
      // Retry once
      return await this.pool.execute(sql, params);
    }
    throw err;
  }
}

function isConnectionError(err: any): boolean {
  const connectionErrors = [
    'PROTOCOL_CONNECTION_LOST',
    'ECONNREFUSED',
    'ENOTFOUND',
    'ETIMEDOUT',
    'ECONNRESET',
  ];
  return connectionErrors.some(code =>
    err.code === code || err.message?.includes(code)
  );
}
```

### 10.3 Graceful Degradation

```typescript
// All online operations wrapped in try-catch with local fallback
async function getMemberCount(): Promise<number> {
  // Try online first if connected
  if (useOnlineConnectionStore.getState().isConnected) {
    try {
      const rows = await window.electronAPI.mysqlQuery(
        'SELECT COUNT(*) as count FROM members'
      );
      return rows[0].count;
    } catch (err) {
      console.warn('Online query failed, using local:', err);
    }
  }

  // Fallback to local
  return query<{ count: number }>(
    'SELECT COUNT(*) as count FROM Member'
  )[0].count;
}
```

---

## 11. Testing Strategy

### 11.1 Unit Tests

```typescript
// Test credential manager
describe('CredentialManager', () => {
  it('should encrypt and decrypt password', async () => {
    const manager = new CredentialManager();
    const password = 'test-password-123';

    manager.savePassword(password);
    const retrieved = manager.getPassword();

    expect(retrieved).toBe(password);
  });

  it('should clear stored password', () => {
    const manager = new CredentialManager();
    manager.savePassword('test');
    manager.clearPassword();

    expect(manager.hasStoredPassword()).toBe(false);
  });
});

// Test schema version checking
describe('SchemaVersionService', () => {
  it('should block on major version mismatch', async () => {
    mockMySQLQuery([{ major_version: 2, minor_version: 0, patch_version: 0 }]);

    const result = await checkSchemaVersion();

    expect(result.action).toBe('block');
    expect(result.compatible).toBe(false);
  });
});
```

### 11.2 Integration Tests

```typescript
// Test full sync cycle
describe('OnlineSyncService', () => {
  it('should push and pull members', async () => {
    // Setup: Create local member
    const member = createTestMember();
    insertMemberLocal(member);

    // Act: Perform sync
    const result = await performOnlineSync();

    // Assert: Member exists in online DB
    const onlineMember = await queryOnline(
      'SELECT * FROM members WHERE internal_id = ?',
      [member.internalId]
    );
    expect(onlineMember).toBeDefined();
    expect(result.stats.membersPushed).toBe(1);
  });
});
```

### 11.3 Network Failure Tests

```typescript
describe('NetworkResilience', () => {
  it('should retry on transient failure', async () => {
    let attempts = 0;
    const operation = async () => {
      attempts++;
      if (attempts < 3) throw new Error('ECONNRESET');
      return 'success';
    };

    const result = await withRetry(operation);

    expect(result).toBe('success');
    expect(attempts).toBe(3);
  });

  it('should fallback to local on connection loss', async () => {
    disconnectMySQL();

    const count = await getMemberCount();

    expect(count).toBeGreaterThanOrEqual(0);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('using local')
    );
  });
});
```

---

## 12. Deployment & Configuration

### 12.1 Environment Variables

```env
# Not stored in code - for documentation only
MYSQL_HOST=iss-skydning.dk.mysql
MYSQL_PORT=3306
MYSQL_DATABASE=iss_skydning_dkisssportsskytter
MYSQL_USER=iss_skydning_dkisssportsskytter
# MYSQL_PASSWORD - entered by user, stored in OS keychain
```

### 12.2 Build Configuration

**File:** `laptop/package.json` (additions)

```json
{
  "dependencies": {
    "mysql2": "^3.9.0",
    "electron-store": "^8.1.0"
  }
}
```

### 12.3 Initial Schema Deployment

```bash
# Run from MySQL client or admin tool
mysql -h iss-skydning.dk.mysql -u iss_skydning_dkisssportsskytter -p < schema/V1_0_0__initial_schema.sql
```

---

## 13. File Structure Summary

```
laptop/
├── electron/
│   ├── main.cjs                    # + MySQL IPC handlers
│   ├── preload.cjs                 # + MySQL API exposure
│   ├── credentialManager.cjs       # NEW: OS keychain integration
│   └── mysqlService.cjs            # NEW: Connection pool manager
├── src/
│   ├── database/
│   │   ├── db.ts                   # Existing local database
│   │   ├── databaseAdapter.ts      # NEW: Unified interface
│   │   └── onlineSync/
│   │       ├── onlineSyncService.ts    # NEW: Sync orchestration
│   │       ├── memberOnlineSync.ts     # NEW: Member sync logic
│   │       ├── photoOnlineSync.ts      # NEW: Photo binary sync
│   │       ├── schemaVersionService.ts # NEW: Version checking
│   │       └── migrationRunner.ts      # NEW: Migration execution
│   ├── stores/
│   │   └── onlineConnectionStore.ts    # NEW: Connection state
│   └── components/
│       └── onlineSync/
│           ├── ConnectionDialog.tsx    # NEW: Password entry UI
│           ├── SyncStatus.tsx          # NEW: Status bar
│           └── SyncHistoryLog.tsx      # NEW: History view
└── schema/
    └── V1_0_0__initial_schema.sql      # NEW: MySQL schema
```

---

---

## 14. Architecture Update: PHP API Layer

**Status:** Direct MySQL access blocked (port 3306 closed). PHP API required.

See `php-api-design.md` for complete PHP API specification.

### Key Changes from Original Design

| Aspect | Original (MySQL Direct) | Updated (PHP API) |
|--------|------------------------|-------------------|
| Connection | mysql2 driver, TCP 3306 | fetch/axios, HTTPS 443 |
| Authentication | MySQL user/password | JWT token (24h expiry) |
| Queries | SQL strings | REST endpoints |
| Binary photos | BLOB insert | multipart/form-data |
| Main process | mysqlService.cjs | Removed (renderer only) |

### Updated Component Structure

```
laptop/src/
├── services/
│   └── onlineApiService.ts      # CHANGED: HTTP client instead of MySQL
├── database/
│   └── onlineSync/
│       ├── onlineSyncService.ts # Uses API service
│       └── ...
└── stores/
    └── onlineConnectionStore.ts # Token management instead of connection pool

api/  # NEW: PHP files for web hosting
├── index.php
├── config.php
├── auth.php
├── handlers/
│   ├── sync_push.php
│   └── sync_pull.php
└── .htaccess
```

---

## 15. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-01-27 | sbalslev | Initial technical design |
| 0.2 | 2026-01-27 | sbalslev | PHP API approach (MySQL blocked), multi-laptop support, all entities, last-edit-wins, delete confirmation, resumable sync |
