/**
 * SQLite database service using sql.js.
 * Provides offline-first data storage matching the Android Room schema.
 * 
 * @see [design.md] - Database architecture
 */

import initSqlJs, { type Database, type SqlJsStatic, type SqlValue } from 'sql.js';

// Schema version matching Android app
const SCHEMA_VERSION = 9;

// SQL.js instance (singleton)
let SQL: SqlJsStatic | null = null;
let db: Database | null = null;

/**
 * Initialize the database.
 * Must be called before any other database operations.
 */
export async function initDatabase(): Promise<void> {
  if (db) return; // Already initialized

  // Load sql.js with WASM
  SQL = await initSqlJs({
    locateFile: (file) => `https://sql.js.org/dist/${file}`
  });

  // Try to load existing database from IndexedDB
  const savedData = await loadFromIndexedDB();
  
  if (savedData) {
    db = new SQL.Database(savedData);
    console.log('Database loaded from IndexedDB');
    // Run migrations for existing database
    await runMigrations();
  } else {
    db = new SQL.Database();
    await createSchema();
    console.log('New database created with schema v' + SCHEMA_VERSION);
  }
}

/**
 * Run database migrations for existing databases.
 * Adds any missing columns that were added in newer schema versions.
 */
async function runMigrations(): Promise<void> {
  if (!db) return;

  const migrationsRun: string[] = [];

  // ===== Migration: NewMemberRegistration table =====
  const regColumns = db.exec("PRAGMA table_info(NewMemberRegistration)");
  const existingRegColumns = regColumns[0]?.values.map(row => row[1] as string) || [];
  
  // Add gender column if missing
  if (!existingRegColumns.includes('gender')) {
    db.run('ALTER TABLE NewMemberRegistration ADD COLUMN gender TEXT');
    migrationsRun.push('NewMemberRegistration.gender');
  }
  
  // Add zipCode column if missing
  if (!existingRegColumns.includes('zipCode')) {
    db.run('ALTER TABLE NewMemberRegistration ADD COLUMN zipCode TEXT');
    migrationsRun.push('NewMemberRegistration.zipCode');
  }
  
  // Add city column if missing
  if (!existingRegColumns.includes('city')) {
    db.run('ALTER TABLE NewMemberRegistration ADD COLUMN city TEXT');
    migrationsRun.push('NewMemberRegistration.city');
  }
  
  // Add guardianName column if missing
  if (!existingRegColumns.includes('guardianName')) {
    db.run('ALTER TABLE NewMemberRegistration ADD COLUMN guardianName TEXT');
    migrationsRun.push('NewMemberRegistration.guardianName');
  }
  
  // Add guardianPhone column if missing
  if (!existingRegColumns.includes('guardianPhone')) {
    db.run('ALTER TABLE NewMemberRegistration ADD COLUMN guardianPhone TEXT');
    migrationsRun.push('NewMemberRegistration.guardianPhone');
  }
  
  // Add guardianEmail column if missing
  if (!existingRegColumns.includes('guardianEmail')) {
    db.run('ALTER TABLE NewMemberRegistration ADD COLUMN guardianEmail TEXT');
    migrationsRun.push('NewMemberRegistration.guardianEmail');
  }

  // Rename photoUri to photoPath if needed
  if (existingRegColumns.includes('photoUri') && !existingRegColumns.includes('photoPath')) {
    db.run('ALTER TABLE NewMemberRegistration RENAME COLUMN photoUri TO photoPath');
    migrationsRun.push('NewMemberRegistration.photoUri->photoPath');
  }

  // ===== Migration: Member table =====
  const memberColumns = db.exec("PRAGMA table_info(Member)");
  const existingMemberColumns = memberColumns[0]?.values.map(row => row[1] as string) || [];
  
  // Add gender column if missing
  if (!existingMemberColumns.includes('gender')) {
    db.run('ALTER TABLE Member ADD COLUMN gender TEXT');
    migrationsRun.push('Member.gender');
  }
  
  // Add zipCode column if missing
  if (!existingMemberColumns.includes('zipCode')) {
    db.run('ALTER TABLE Member ADD COLUMN zipCode TEXT');
    migrationsRun.push('Member.zipCode');
  }
  
  // Add city column if missing
  if (!existingMemberColumns.includes('city')) {
    db.run('ALTER TABLE Member ADD COLUMN city TEXT');
    migrationsRun.push('Member.city');
  }
  
  // Add guardianName column if missing
  if (!existingMemberColumns.includes('guardianName')) {
    db.run('ALTER TABLE Member ADD COLUMN guardianName TEXT');
    migrationsRun.push('Member.guardianName');
  }
  
  // Add guardianPhone column if missing
  if (!existingMemberColumns.includes('guardianPhone')) {
    db.run('ALTER TABLE Member ADD COLUMN guardianPhone TEXT');
    migrationsRun.push('Member.guardianPhone');
  }
  
  // Add guardianEmail column if missing
  if (!existingMemberColumns.includes('guardianEmail')) {
    db.run('ALTER TABLE Member ADD COLUMN guardianEmail TEXT');
    migrationsRun.push('Member.guardianEmail');
  }

  if (migrationsRun.length > 0) {
    console.log('Migrations run:', migrationsRun.join(', '));
    await saveToIndexedDB();
  }
}

/**
 * Create the database schema matching Android Room entities.
 */
async function createSchema(): Promise<void> {
  if (!db) throw new Error('Database not initialized');

  db.run(`
    -- Members table
    CREATE TABLE IF NOT EXISTS Member (
      membershipId TEXT PRIMARY KEY NOT NULL,
      firstName TEXT NOT NULL,
      lastName TEXT NOT NULL,
      birthday TEXT,
      gender TEXT,
      email TEXT,
      phone TEXT,
      address TEXT,
      zipCode TEXT,
      city TEXT,
      guardianName TEXT,
      guardianPhone TEXT,
      guardianEmail TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      photoUri TEXT,
      createdAtUtc TEXT NOT NULL,
      updatedAtUtc TEXT NOT NULL,
      syncedAtUtc TEXT,
      syncVersion INTEGER NOT NULL DEFAULT 0
    );

    -- Check-ins table
    CREATE TABLE IF NOT EXISTS CheckIn (
      id TEXT PRIMARY KEY NOT NULL,
      membershipId TEXT NOT NULL,
      localDate TEXT NOT NULL,
      createdAtUtc TEXT NOT NULL,
      syncedAtUtc TEXT,
      syncVersion INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (membershipId) REFERENCES Member(membershipId)
    );

    -- Practice sessions table
    CREATE TABLE IF NOT EXISTS PracticeSession (
      id TEXT PRIMARY KEY NOT NULL,
      membershipId TEXT NOT NULL,
      localDate TEXT NOT NULL,
      practiceType TEXT NOT NULL,
      classification TEXT NOT NULL,
      points INTEGER NOT NULL DEFAULT 0,
      krydser INTEGER,
      notes TEXT,
      createdAtUtc TEXT NOT NULL,
      syncedAtUtc TEXT,
      syncVersion INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (membershipId) REFERENCES Member(membershipId)
    );

    -- Scan events table
    CREATE TABLE IF NOT EXISTS ScanEvent (
      id TEXT PRIMARY KEY NOT NULL,
      membershipId TEXT NOT NULL,
      scanType TEXT NOT NULL,
      linkedCheckInId TEXT,
      linkedSessionId TEXT,
      canceledFlag INTEGER NOT NULL DEFAULT 0,
      createdAtUtc TEXT NOT NULL,
      syncedAtUtc TEXT,
      syncVersion INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (membershipId) REFERENCES Member(membershipId)
    );

    -- New member registrations table
    CREATE TABLE IF NOT EXISTS NewMemberRegistration (
      id TEXT PRIMARY KEY NOT NULL,
      firstName TEXT NOT NULL,
      lastName TEXT NOT NULL,
      birthday TEXT,
      gender TEXT,
      email TEXT,
      phone TEXT,
      address TEXT,
      zipCode TEXT,
      city TEXT,
      notes TEXT,
      photoPath TEXT,
      guardianName TEXT,
      guardianPhone TEXT,
      guardianEmail TEXT,
      sourceDeviceId TEXT NOT NULL,
      sourceDeviceName TEXT,
      approvalStatus TEXT NOT NULL DEFAULT 'PENDING',
      approvedAtUtc TEXT,
      rejectedAtUtc TEXT,
      rejectionReason TEXT,
      createdMemberId TEXT,
      createdAtUtc TEXT NOT NULL,
      syncedAtUtc TEXT,
      syncVersion INTEGER NOT NULL DEFAULT 0
    );

    -- Equipment items table
    CREATE TABLE IF NOT EXISTS EquipmentItem (
      id TEXT PRIMARY KEY NOT NULL,
      serialNumber TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      equipmentType TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'AVAILABLE',
      notes TEXT,
      createdAtUtc TEXT NOT NULL,
      createdByDeviceId TEXT NOT NULL,
      modifiedAtUtc TEXT NOT NULL,
      syncedAtUtc TEXT,
      syncVersion INTEGER NOT NULL DEFAULT 0
    );

    -- Equipment checkouts table
    CREATE TABLE IF NOT EXISTS EquipmentCheckout (
      id TEXT PRIMARY KEY NOT NULL,
      equipmentId TEXT NOT NULL,
      membershipId TEXT NOT NULL,
      checkedOutAtUtc TEXT NOT NULL,
      checkedOutByDeviceId TEXT NOT NULL,
      expectedReturnAtUtc TEXT,
      checkoutNotes TEXT,
      checkedInAtUtc TEXT,
      checkedInByDeviceId TEXT,
      checkinNotes TEXT,
      conflictStatus TEXT NOT NULL DEFAULT 'None',
      conflictingCheckoutId TEXT,
      conflictResolutionNotes TEXT,
      createdAtUtc TEXT NOT NULL,
      modifiedAtUtc TEXT NOT NULL,
      syncedAtUtc TEXT,
      syncVersion INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (equipmentId) REFERENCES EquipmentItem(id),
      FOREIGN KEY (membershipId) REFERENCES Member(membershipId)
    );

    -- Trusted devices table
    CREATE TABLE IF NOT EXISTS TrustedDevice (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      lastSeenUtc TEXT,
      pairingDateUtc TEXT NOT NULL,
      ipAddress TEXT,
      port INTEGER,
      isTrusted INTEGER NOT NULL DEFAULT 1
    );

    -- Sync conflicts table
    CREATE TABLE IF NOT EXISTS SyncConflict (
      id TEXT PRIMARY KEY NOT NULL,
      conflictType TEXT NOT NULL,
      entityType TEXT NOT NULL,
      entityId TEXT NOT NULL,
      conflictingEntityId TEXT,
      localDeviceId TEXT NOT NULL,
      localDeviceName TEXT,
      localTimestamp TEXT NOT NULL,
      localSyncVersion INTEGER NOT NULL,
      remoteDeviceId TEXT NOT NULL,
      remoteDeviceName TEXT,
      remoteTimestamp TEXT NOT NULL,
      remoteSyncVersion INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      resolution TEXT,
      resolvedByDeviceId TEXT,
      resolvedAtUtc TEXT,
      context TEXT,
      detectedAtUtc TEXT NOT NULL
    );

    -- Schema version metadata
    CREATE TABLE IF NOT EXISTS _schema_version (
      version INTEGER PRIMARY KEY
    );
    INSERT OR REPLACE INTO _schema_version (version) VALUES (${SCHEMA_VERSION});

    -- Indexes for common queries
    CREATE INDEX IF NOT EXISTS idx_member_status ON Member(status);
    CREATE INDEX IF NOT EXISTS idx_checkin_date ON CheckIn(localDate);
    CREATE INDEX IF NOT EXISTS idx_checkin_member ON CheckIn(membershipId);
    CREATE INDEX IF NOT EXISTS idx_session_date ON PracticeSession(localDate);
    CREATE INDEX IF NOT EXISTS idx_session_member ON PracticeSession(membershipId);
    CREATE INDEX IF NOT EXISTS idx_session_type ON PracticeSession(practiceType);
    CREATE INDEX IF NOT EXISTS idx_equipment_status ON EquipmentItem(status);
    CREATE INDEX IF NOT EXISTS idx_checkout_equipment ON EquipmentCheckout(equipmentId);
    CREATE INDEX IF NOT EXISTS idx_checkout_member ON EquipmentCheckout(membershipId);
    CREATE INDEX IF NOT EXISTS idx_registration_status ON NewMemberRegistration(approvalStatus);
    CREATE INDEX IF NOT EXISTS idx_conflict_status ON SyncConflict(status);
  `);

  await saveToIndexedDB();
}

/**
 * Get the database instance.
 */
export function getDatabase(): Database {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
  return db;
}

/**
 * Execute a query and return results.
 */
export function query<T>(sql: string, params: SqlValue[] = []): T[] {
  const database = getDatabase();
  const stmt = database.prepare(sql);
  stmt.bind(params);
  
  const results: T[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as T;
    results.push(row);
  }
  stmt.free();
  return results;
}

// Flag to prevent auto-save during transactions
let inTransaction = false;

/**
 * Execute a statement without saving (internal use in transactions).
 */
function executeInternal(sql: string, params: SqlValue[] = []): void {
  const database = getDatabase();
  database.run(sql, params);
}

/**
 * Execute a statement (INSERT, UPDATE, DELETE).
 */
export function execute(sql: string, params: SqlValue[] = []): void {
  executeInternal(sql, params);
  // Auto-save after writes (but not during transactions)
  if (!inTransaction) {
    saveToIndexedDB().catch(console.error);
  }
}

/**
 * Run multiple statements in a transaction.
 */
export function transaction(fn: () => void): void {
  const database = getDatabase();
  inTransaction = true;
  database.run('BEGIN TRANSACTION');
  try {
    fn();
    database.run('COMMIT');
    inTransaction = false;
    saveToIndexedDB().catch(console.error);
  } catch (error) {
    database.run('ROLLBACK');
    inTransaction = false;
    throw error;
  }
}

// ===== IndexedDB Persistence =====

const DB_NAME = 'medlems-admin-db';
const STORE_NAME = 'sqliteDb';

async function loadFromIndexedDB(): Promise<Uint8Array | null> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    
    request.onerror = () => reject(request.error);
    
    request.onupgradeneeded = () => {
      const idb = request.result;
      if (!idb.objectStoreNames.contains(STORE_NAME)) {
        idb.createObjectStore(STORE_NAME);
      }
    };
    
    request.onsuccess = () => {
      const idb = request.result;
      const tx = idb.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const getRequest = store.get('database');
      
      getRequest.onsuccess = () => {
        resolve(getRequest.result || null);
      };
      getRequest.onerror = () => reject(getRequest.error);
    };
  });
}

async function saveToIndexedDB(): Promise<void> {
  if (!db) return;
  
  const data = db.export();
  
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    
    request.onerror = () => reject(request.error);
    
    request.onupgradeneeded = () => {
      const idb = request.result;
      if (!idb.objectStoreNames.contains(STORE_NAME)) {
        idb.createObjectStore(STORE_NAME);
      }
    };
    
    request.onsuccess = () => {
      const idb = request.result;
      const tx = idb.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(data, 'database');
      
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
  });
}

/**
 * Export the database as a downloadable file.
 */
export function exportDatabase(): Uint8Array {
  return getDatabase().export();
}

/**
 * Import a database from file.
 */
export async function importDatabase(data: Uint8Array): Promise<void> {
  if (!SQL) throw new Error('SQL.js not initialized');
  
  db?.close();
  db = new SQL.Database(data);
  await saveToIndexedDB();
}

/**
 * Clear all data (for testing).
 */
export async function clearDatabase(): Promise<void> {
  if (!SQL) throw new Error('SQL.js not initialized');
  
  db?.close();
  db = new SQL.Database();
  await createSchema();
}
