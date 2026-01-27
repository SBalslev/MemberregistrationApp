/**
 * SQLite database service using sql.js.
 * Provides offline-first data storage matching the Android Room schema.
 * 
 * @see [design.md] - Database architecture
 */

import initSqlJs, { type Database, type SqlJsStatic, type SqlValue } from 'sql.js';

// Schema version matching Android app
const SCHEMA_VERSION = 13;

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
  
  // Add memberType column if missing (for fee tracking - now renamed to feeCategory)
  if (!existingMemberColumns.includes('memberType')) {
    db.run("ALTER TABLE Member ADD COLUMN memberType TEXT DEFAULT 'ADULT'");
    migrationsRun.push('Member.memberType');
  }
  
  // ===== Migration: Schema v10 - Trial Member Registration =====
  // Add internalId column for UUID-based primary key support
  if (!existingMemberColumns.includes('internalId')) {
    db.run('ALTER TABLE Member ADD COLUMN internalId TEXT');
    // Generate deterministic UUIDs from membershipId for existing members
    // Using a simple hex-based approach similar to Android migration
    db.run(`
      UPDATE Member 
      SET internalId = lower(hex(substr(membershipId || '00000000', 1, 4))) || '-' ||
                       lower(hex(substr(membershipId || '0000', 1, 2))) || '-3' ||
                       lower(hex(substr(membershipId || '000', 1, 1))) || '0' || '-8' ||
                       lower(hex(substr(membershipId || '00', 1, 1))) || '00-' ||
                       lower(hex(substr(membershipId || '000000', 1, 6)))
      WHERE internalId IS NULL
    `);
    // Create unique index on internalId
    db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_Member_internalId ON Member(internalId)');
    migrationsRun.push('Member.internalId');
  }
  
  // Add memberLifecycleStage column (TRIAL or FULL)
  if (!existingMemberColumns.includes('memberLifecycleStage')) {
    // Existing members with membershipId are FULL members
    db.run("ALTER TABLE Member ADD COLUMN memberLifecycleStage TEXT DEFAULT 'FULL'");
    migrationsRun.push('Member.memberLifecycleStage');
  }
  
  // Add mergedIntoId for merge tracking (DD-10)
  if (!existingMemberColumns.includes('mergedIntoId')) {
    db.run('ALTER TABLE Member ADD COLUMN mergedIntoId TEXT');
    migrationsRun.push('Member.mergedIntoId');
  }
  
  // Add registrationPhotoPath if missing
  if (!existingMemberColumns.includes('registrationPhotoPath')) {
    db.run('ALTER TABLE Member ADD COLUMN registrationPhotoPath TEXT');
    migrationsRun.push('Member.registrationPhotoPath');
  }

  // Add photoPath for full-resolution photo file path
  if (!existingMemberColumns.includes('photoPath')) {
    db.run('ALTER TABLE Member ADD COLUMN photoPath TEXT');
    migrationsRun.push('Member.photoPath');
  }

  // Add photoThumbnail for 150x150 thumbnail data URL
  if (!existingMemberColumns.includes('photoThumbnail')) {
    db.run('ALTER TABLE Member ADD COLUMN photoThumbnail TEXT');
    migrationsRun.push('Member.photoThumbnail');
  }
  
  // Add expiresOn if missing
  if (!existingMemberColumns.includes('expiresOn')) {
    db.run('ALTER TABLE Member ADD COLUMN expiresOn TEXT');
    migrationsRun.push('Member.expiresOn');
  }
  
  // Rename birthday to birthDate if needed (for consistency with Android)
  if (existingMemberColumns.includes('birthday') && !existingMemberColumns.includes('birthDate')) {
    db.run('ALTER TABLE Member RENAME COLUMN birthday TO birthDate');
    migrationsRun.push('Member.birthday->birthDate');
  }

  // ===== Migration: Finance tables =====
  // Check if PostingCategory table exists
  const tableCheck = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='PostingCategory'");
  if (tableCheck.length === 0 || tableCheck[0].values.length === 0) {
    // Create finance tables
    db.run(`
      CREATE TABLE IF NOT EXISTS PostingCategory (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        sortOrder INTEGER NOT NULL DEFAULT 0,
        isActive INTEGER NOT NULL DEFAULT 1,
        createdAtUtc TEXT NOT NULL,
        updatedAtUtc TEXT NOT NULL
      )
    `);
    
    db.run(`
      CREATE TABLE IF NOT EXISTS FiscalYear (
        year INTEGER PRIMARY KEY NOT NULL,
        openingCashBalance REAL NOT NULL DEFAULT 0,
        openingBankBalance REAL NOT NULL DEFAULT 0,
        isClosed INTEGER NOT NULL DEFAULT 0,
        createdAtUtc TEXT NOT NULL,
        updatedAtUtc TEXT NOT NULL
      )
    `);
    
    db.run(`
      CREATE TABLE IF NOT EXISTS FeeRate (
        fiscalYear INTEGER NOT NULL,
        memberType TEXT NOT NULL,
        feeAmount REAL NOT NULL,
        PRIMARY KEY (fiscalYear, memberType),
        FOREIGN KEY (fiscalYear) REFERENCES FiscalYear(year)
      )
    `);
    
    db.run(`
      CREATE TABLE IF NOT EXISTS FinancialTransaction (
        id TEXT PRIMARY KEY NOT NULL,
        fiscalYear INTEGER NOT NULL,
        sequenceNumber INTEGER NOT NULL,
        date TEXT NOT NULL,
        description TEXT NOT NULL,
        cashIn REAL,
        cashOut REAL,
        bankIn REAL,
        bankOut REAL,
        notes TEXT,
        isDeleted INTEGER NOT NULL DEFAULT 0,
        createdAtUtc TEXT NOT NULL,
        updatedAtUtc TEXT NOT NULL,
        FOREIGN KEY (fiscalYear) REFERENCES FiscalYear(year),
        UNIQUE(fiscalYear, sequenceNumber)
      )
    `);
    
    db.run(`
      CREATE TABLE IF NOT EXISTS TransactionLine (
        id TEXT PRIMARY KEY NOT NULL,
        transactionId TEXT NOT NULL,
        categoryId TEXT NOT NULL,
        amount REAL NOT NULL,
        isIncome INTEGER NOT NULL DEFAULT 0,
        source TEXT NOT NULL DEFAULT 'CASH',
        memberId TEXT,
        lineDescription TEXT,
        FOREIGN KEY (transactionId) REFERENCES FinancialTransaction(id),
        FOREIGN KEY (categoryId) REFERENCES PostingCategory(id),
        FOREIGN KEY (memberId) REFERENCES Member(internalId)
      )
    `);
    
    // Create indexes
    db.run('CREATE INDEX IF NOT EXISTS idx_transaction_year ON FinancialTransaction(fiscalYear)');
    db.run('CREATE INDEX IF NOT EXISTS idx_transaction_date ON FinancialTransaction(date)');
    db.run('CREATE INDEX IF NOT EXISTS idx_transaction_line_txn ON TransactionLine(transactionId)');
    db.run('CREATE INDEX IF NOT EXISTS idx_transaction_line_member ON TransactionLine(memberId) WHERE memberId IS NOT NULL');
    db.run('CREATE INDEX IF NOT EXISTS idx_transaction_line_category ON TransactionLine(categoryId)');
    
    // Seed default data
    await seedDefaultCategories();
    
    migrationsRun.push('Finance tables created');
  }

  // ===== Migration: PendingFeePayment table =====
  const pendingFeeCheck = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='PendingFeePayment'");
  if (pendingFeeCheck.length === 0 || pendingFeeCheck[0].values.length === 0) {
    db.run(`
      CREATE TABLE IF NOT EXISTS PendingFeePayment (
        id TEXT PRIMARY KEY NOT NULL,
        fiscalYear INTEGER NOT NULL,
        memberId TEXT NOT NULL,
        amount REAL NOT NULL,
        paymentDate TEXT NOT NULL,
        paymentMethod TEXT NOT NULL CHECK(paymentMethod IN ('CASH', 'BANK')),
        notes TEXT,
        isConsolidated INTEGER NOT NULL DEFAULT 0,
        consolidatedTransactionId TEXT,
        createdAtUtc TEXT NOT NULL,
        updatedAtUtc TEXT NOT NULL,
        FOREIGN KEY (fiscalYear) REFERENCES FiscalYear(year),
        FOREIGN KEY (memberId) REFERENCES Member(internalId),
        FOREIGN KEY (consolidatedTransactionId) REFERENCES FinancialTransaction(id)
      )
    `);
    
    db.run('CREATE INDEX IF NOT EXISTS idx_pending_fee_year ON PendingFeePayment(fiscalYear)');
    db.run('CREATE INDEX IF NOT EXISTS idx_pending_fee_member ON PendingFeePayment(memberId)');
    db.run('CREATE INDEX IF NOT EXISTS idx_pending_fee_consolidated ON PendingFeePayment(isConsolidated)');
    
    migrationsRun.push('PendingFeePayment table created');
  }

  // ===== Migration: Schema v11 - Foreign Key Migration for Trial Members =====
  // Add internalMemberId column to CheckIn table
  const checkInColumns = db.exec("PRAGMA table_info(CheckIn)");
  const existingCheckInColumns = checkInColumns[0]?.values.map(row => row[1] as string) || [];
  
  if (!existingCheckInColumns.includes('internalMemberId')) {
    db.run("ALTER TABLE CheckIn ADD COLUMN internalMemberId TEXT NOT NULL DEFAULT ''");
    // Populate from Member.internalId using membershipId
    db.run(`
      UPDATE CheckIn 
      SET internalMemberId = (
        SELECT m.internalId FROM Member m WHERE m.membershipId = CheckIn.membershipId
      )
      WHERE internalMemberId = '' AND membershipId IS NOT NULL
    `);
    db.run('CREATE INDEX IF NOT EXISTS idx_CheckIn_internalMemberId ON CheckIn(internalMemberId)');
    migrationsRun.push('CheckIn.internalMemberId');
  }

  // Add internalMemberId column to PracticeSession table
  const sessionColumns = db.exec("PRAGMA table_info(PracticeSession)");
  const existingSessionColumns = sessionColumns[0]?.values.map(row => row[1] as string) || [];
  
  if (!existingSessionColumns.includes('internalMemberId')) {
    db.run("ALTER TABLE PracticeSession ADD COLUMN internalMemberId TEXT NOT NULL DEFAULT ''");
    // Populate from Member.internalId using membershipId
    db.run(`
      UPDATE PracticeSession 
      SET internalMemberId = (
        SELECT m.internalId FROM Member m WHERE m.membershipId = PracticeSession.membershipId
      )
      WHERE internalMemberId = '' AND membershipId IS NOT NULL
    `);
    db.run('CREATE INDEX IF NOT EXISTS idx_PracticeSession_internalMemberId ON PracticeSession(internalMemberId)');
    migrationsRun.push('PracticeSession.internalMemberId');
  }

  // Add internalMemberId column to ScanEvent table
  const scanColumns = db.exec("PRAGMA table_info(ScanEvent)");
  const existingScanColumns = scanColumns[0]?.values.map(row => row[1] as string) || [];
  
  if (!existingScanColumns.includes('internalMemberId')) {
    db.run("ALTER TABLE ScanEvent ADD COLUMN internalMemberId TEXT NOT NULL DEFAULT ''");
    // Populate from Member.internalId using membershipId
    db.run(`
      UPDATE ScanEvent 
      SET internalMemberId = (
        SELECT m.internalId FROM Member m WHERE m.membershipId = ScanEvent.membershipId
      )
      WHERE internalMemberId = '' AND membershipId IS NOT NULL
    `);
    db.run('CREATE INDEX IF NOT EXISTS idx_ScanEvent_internalMemberId ON ScanEvent(internalMemberId)');
    migrationsRun.push('ScanEvent.internalMemberId');
  }

  // Add internalMemberId column to EquipmentCheckout table
  const checkoutColumns = db.exec("PRAGMA table_info(EquipmentCheckout)");
  const existingCheckoutColumns = checkoutColumns[0]?.values.map(row => row[1] as string) || [];
  
  if (!existingCheckoutColumns.includes('internalMemberId')) {
    db.run("ALTER TABLE EquipmentCheckout ADD COLUMN internalMemberId TEXT NOT NULL DEFAULT ''");
    // Populate from Member.internalId using membershipId
    db.run(`
      UPDATE EquipmentCheckout 
      SET internalMemberId = (
        SELECT m.internalId FROM Member m WHERE m.membershipId = EquipmentCheckout.membershipId
      )
      WHERE internalMemberId = '' AND membershipId IS NOT NULL
    `);
    db.run('CREATE INDEX IF NOT EXISTS idx_EquipmentCheckout_internalMemberId ON EquipmentCheckout(internalMemberId)');
    migrationsRun.push('EquipmentCheckout.internalMemberId');
  }

  // ===== Migration: Security Hardening - TrustedDevice auth tokens =====
  const trustedDeviceColumns = db.exec("PRAGMA table_info(TrustedDevice)");
  const existingTrustedDeviceColumns = trustedDeviceColumns[0]?.values.map(row => row[1] as string) || [];
  
  // Add authToken column if missing
  if (!existingTrustedDeviceColumns.includes('authToken')) {
    db.run("ALTER TABLE TrustedDevice ADD COLUMN authToken TEXT");
    migrationsRun.push('TrustedDevice.authToken');
  }
  
  // Add tokenExpiresAt column if missing
  if (!existingTrustedDeviceColumns.includes('tokenExpiresAt')) {
    db.run("ALTER TABLE TrustedDevice ADD COLUMN tokenExpiresAt TEXT");
    migrationsRun.push('TrustedDevice.tokenExpiresAt');
  }

  // ===== Migration: MemberPreference table for sync of UI preferences =====
  const memberPrefCheck = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='MemberPreference'");
  if (memberPrefCheck.length === 0 || memberPrefCheck[0].values.length === 0) {
    db.run(`
      CREATE TABLE IF NOT EXISTS MemberPreference (
        memberId TEXT PRIMARY KEY NOT NULL,
        lastPracticeType TEXT,
        lastClassification TEXT,
        updatedAtUtc TEXT NOT NULL
      )
    `);
    migrationsRun.push('MemberPreference table created');
  }

  // ===== Migration: Schema v11 - Trainer Experience =====
  // Add TrainerInfo table
  const trainerInfoCheck = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='TrainerInfo'");
  if (trainerInfoCheck.length === 0 || trainerInfoCheck[0].values.length === 0) {
    db.run(`
      CREATE TABLE IF NOT EXISTS TrainerInfo (
        memberId TEXT PRIMARY KEY NOT NULL,
        isTrainer INTEGER NOT NULL DEFAULT 0,
        hasSkydelederCertificate INTEGER NOT NULL DEFAULT 0,
        certifiedDate TEXT,
        createdAtUtc TEXT NOT NULL,
        modifiedAtUtc TEXT NOT NULL,
        deviceId TEXT,
        syncVersion INTEGER NOT NULL DEFAULT 0,
        syncedAtUtc TEXT,
        FOREIGN KEY (memberId) REFERENCES Member(internalId)
      )
    `);
    migrationsRun.push('TrainerInfo table created');
  }

  // Add TrainerDiscipline table
  const trainerDisciplineCheck = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='TrainerDiscipline'");
  if (trainerDisciplineCheck.length === 0 || trainerDisciplineCheck[0].values.length === 0) {
    db.run(`
      CREATE TABLE IF NOT EXISTS TrainerDiscipline (
        id TEXT PRIMARY KEY NOT NULL,
        memberId TEXT NOT NULL,
        discipline TEXT NOT NULL,
        level TEXT NOT NULL,
        certifiedDate TEXT,
        createdAtUtc TEXT NOT NULL,
        modifiedAtUtc TEXT NOT NULL,
        deviceId TEXT,
        syncVersion INTEGER NOT NULL DEFAULT 0,
        syncedAtUtc TEXT,
        FOREIGN KEY (memberId) REFERENCES Member(internalId)
      )
    `);
    db.run('CREATE INDEX IF NOT EXISTS idx_TrainerDiscipline_memberId ON TrainerDiscipline(memberId)');
    migrationsRun.push('TrainerDiscipline table created');
  }

  // Add discipline column to EquipmentItem if missing
  const equipmentColumns = db.exec("PRAGMA table_info(EquipmentItem)");
  const existingEquipmentColumns = equipmentColumns[0]?.values.map(row => row[1] as string) || [];
  if (!existingEquipmentColumns.includes('discipline')) {
    db.run('ALTER TABLE EquipmentItem ADD COLUMN discipline TEXT');
    migrationsRun.push('EquipmentItem.discipline');
  }

  // ===== Migration: Schema v12 - Sync Outbox for Reliable Sync =====
  const outboxCheck = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='SyncOutbox'");
  if (outboxCheck.length === 0 || outboxCheck[0].values.length === 0) {
    // SyncOutbox: Persistent queue for sync operations
    db.run(`
      CREATE TABLE IF NOT EXISTS SyncOutbox (
        id TEXT PRIMARY KEY NOT NULL,
        entityType TEXT NOT NULL,
        entityId TEXT NOT NULL,
        operation TEXT NOT NULL,
        payload TEXT NOT NULL,
        createdAtUtc TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        lastAttemptUtc TEXT,
        lastError TEXT,
        nextRetryUtc TEXT,
        status TEXT NOT NULL DEFAULT 'pending'
      )
    `);
    db.run('CREATE INDEX IF NOT EXISTS idx_SyncOutbox_status ON SyncOutbox(status)');
    db.run('CREATE INDEX IF NOT EXISTS idx_SyncOutbox_createdAtUtc ON SyncOutbox(createdAtUtc)');
    db.run('CREATE INDEX IF NOT EXISTS idx_SyncOutbox_nextRetryUtc ON SyncOutbox(nextRetryUtc)');
    migrationsRun.push('SyncOutbox table created');

    // SyncOutboxDelivery: Per-device delivery tracking
    db.run(`
      CREATE TABLE IF NOT EXISTS SyncOutboxDelivery (
        outboxId TEXT NOT NULL,
        deviceId TEXT NOT NULL,
        deliveredAtUtc TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        lastAttemptUtc TEXT,
        lastError TEXT,
        PRIMARY KEY (outboxId, deviceId),
        FOREIGN KEY (outboxId) REFERENCES SyncOutbox(id) ON DELETE CASCADE
      )
    `);
    migrationsRun.push('SyncOutboxDelivery table created');

    // ProcessedSyncMessage: Idempotency tracking
    db.run(`
      CREATE TABLE IF NOT EXISTS ProcessedSyncMessage (
        messageId TEXT PRIMARY KEY NOT NULL,
        sourceDeviceId TEXT NOT NULL,
        processedAtUtc TEXT NOT NULL
      )
    `);
    db.run('CREATE INDEX IF NOT EXISTS idx_ProcessedSyncMessage_processedAt ON ProcessedSyncMessage(processedAtUtc)');
    migrationsRun.push('ProcessedSyncMessage table created');
  }

  // ===== Migration: Schema v13 - SKV Registration =====
  const skvRegistrationCheck = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='SKVRegistration'");
  if (skvRegistrationCheck.length === 0 || skvRegistrationCheck[0].values.length === 0) {
    db.run(`
      CREATE TABLE IF NOT EXISTS SKVRegistration (
        id TEXT PRIMARY KEY NOT NULL,
        memberId TEXT NOT NULL,
        skvLevel INTEGER NOT NULL DEFAULT 6,
        status TEXT NOT NULL DEFAULT 'not_started',
        lastApprovedDate TEXT,
        createdAtUtc TEXT NOT NULL,
        updatedAtUtc TEXT NOT NULL,
        FOREIGN KEY (memberId) REFERENCES Member(internalId)
      )
    `);
    db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_SKVRegistration_memberId ON SKVRegistration(memberId)');
    migrationsRun.push('SKVRegistration table created');
  }

  const skvWeaponCheck = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='SKVWeapon'");
  if (skvWeaponCheck.length === 0 || skvWeaponCheck[0].values.length === 0) {
    db.run(`
      CREATE TABLE IF NOT EXISTS SKVWeapon (
        id TEXT PRIMARY KEY NOT NULL,
        skvRegistrationId TEXT NOT NULL,
        model TEXT NOT NULL,
        description TEXT,
        serial TEXT NOT NULL,
        type TEXT NOT NULL,
        caliber TEXT,
        lastReviewedDate TEXT,
        createdAtUtc TEXT NOT NULL,
        updatedAtUtc TEXT NOT NULL,
        FOREIGN KEY (skvRegistrationId) REFERENCES SKVRegistration(id) ON DELETE CASCADE
      )
    `);
    db.run('CREATE INDEX IF NOT EXISTS idx_SKVWeapon_registrationId ON SKVWeapon(skvRegistrationId)');
    migrationsRun.push('SKVWeapon table created');
  }

  // ===== Migration: TransactionLine.source column =====
  const transactionLineColumns = db.exec("PRAGMA table_info(TransactionLine)");
  const existingTransactionLineColumns = transactionLineColumns[0]?.values.map(row => row[1] as string) || [];

  if (existingTransactionLineColumns.length > 0 && !existingTransactionLineColumns.includes('source')) {
    db.run("ALTER TABLE TransactionLine ADD COLUMN source TEXT NOT NULL DEFAULT 'CASH'");
    migrationsRun.push('TransactionLine.source');
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
    -- Members table (Schema v10 - Trial Member Registration)
    CREATE TABLE IF NOT EXISTS Member (
      internalId TEXT PRIMARY KEY NOT NULL,
      membershipId TEXT UNIQUE,
      memberLifecycleStage TEXT NOT NULL DEFAULT 'FULL',
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      firstName TEXT NOT NULL,
      lastName TEXT NOT NULL,
      birthDate TEXT,
      gender TEXT,
      email TEXT,
      phone TEXT,
      address TEXT,
      zipCode TEXT,
      city TEXT,
      guardianName TEXT,
      guardianPhone TEXT,
      guardianEmail TEXT,
      expiresOn TEXT,
      registrationPhotoPath TEXT,
      photoPath TEXT,
      photoThumbnail TEXT,
      mergedIntoId TEXT,
      memberType TEXT DEFAULT 'ADULT',
      createdAtUtc TEXT NOT NULL,
      updatedAtUtc TEXT NOT NULL,
      syncedAtUtc TEXT,
      syncVersion INTEGER NOT NULL DEFAULT 0
    );
    
    -- Index for member lookups
    CREATE UNIQUE INDEX IF NOT EXISTS idx_Member_internalId ON Member(internalId);
    CREATE INDEX IF NOT EXISTS idx_Member_memberLifecycleStage ON Member(memberLifecycleStage);
    CREATE INDEX IF NOT EXISTS idx_Member_status ON Member(status);
    CREATE INDEX IF NOT EXISTS idx_Member_lastName_firstName ON Member(lastName, firstName);

    -- Check-ins table
    CREATE TABLE IF NOT EXISTS CheckIn (
      id TEXT PRIMARY KEY NOT NULL,
      internalMemberId TEXT NOT NULL,
      membershipId TEXT,
      localDate TEXT NOT NULL,
      createdAtUtc TEXT NOT NULL,
      syncedAtUtc TEXT,
      syncVersion INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_CheckIn_internalMemberId ON CheckIn(internalMemberId);

    -- Practice sessions table
    CREATE TABLE IF NOT EXISTS PracticeSession (
      id TEXT PRIMARY KEY NOT NULL,
      internalMemberId TEXT NOT NULL,
      membershipId TEXT,
      localDate TEXT NOT NULL,
      practiceType TEXT NOT NULL,
      classification TEXT NOT NULL,
      points INTEGER NOT NULL DEFAULT 0,
      krydser INTEGER,
      notes TEXT,
      createdAtUtc TEXT NOT NULL,
      syncedAtUtc TEXT,
      syncVersion INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (internalMemberId) REFERENCES Member(internalId)
    );
    CREATE INDEX IF NOT EXISTS idx_PracticeSession_internalMemberId ON PracticeSession(internalMemberId);

    -- Scan events table
    CREATE TABLE IF NOT EXISTS ScanEvent (
      id TEXT PRIMARY KEY NOT NULL,
      internalMemberId TEXT NOT NULL,
      membershipId TEXT,
      scanType TEXT NOT NULL,
      linkedCheckInId TEXT,
      linkedSessionId TEXT,
      canceledFlag INTEGER NOT NULL DEFAULT 0,
      createdAtUtc TEXT NOT NULL,
      syncedAtUtc TEXT,
      syncVersion INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (internalMemberId) REFERENCES Member(internalId)
    );
    CREATE INDEX IF NOT EXISTS idx_ScanEvent_internalMemberId ON ScanEvent(internalMemberId);

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
      discipline TEXT,
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
      internalMemberId TEXT NOT NULL,
      membershipId TEXT,
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
      FOREIGN KEY (internalMemberId) REFERENCES Member(internalId)
    );
    CREATE INDEX IF NOT EXISTS idx_EquipmentCheckout_internalMemberId ON EquipmentCheckout(internalMemberId);

    -- Trusted devices table
    CREATE TABLE IF NOT EXISTS TrustedDevice (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      lastSeenUtc TEXT,
      pairingDateUtc TEXT NOT NULL,
      ipAddress TEXT,
      port INTEGER,
      isTrusted INTEGER NOT NULL DEFAULT 1,
      authToken TEXT,
      tokenExpiresAt TEXT
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

    -- ===== Financial Transaction Tables (Kassebog) =====

    -- Posting categories for financial transactions
    CREATE TABLE IF NOT EXISTS PostingCategory (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      sortOrder INTEGER NOT NULL DEFAULT 0,
      isActive INTEGER NOT NULL DEFAULT 1,
      createdAtUtc TEXT NOT NULL,
      updatedAtUtc TEXT NOT NULL
    );

    -- Fiscal years with opening balances
    CREATE TABLE IF NOT EXISTS FiscalYear (
      year INTEGER PRIMARY KEY NOT NULL,
      openingCashBalance REAL NOT NULL DEFAULT 0,
      openingBankBalance REAL NOT NULL DEFAULT 0,
      isClosed INTEGER NOT NULL DEFAULT 0,
      createdAtUtc TEXT NOT NULL,
      updatedAtUtc TEXT NOT NULL
    );

    -- Fee rates per fiscal year and member type
    CREATE TABLE IF NOT EXISTS FeeRate (
      fiscalYear INTEGER NOT NULL,
      memberType TEXT NOT NULL,
      feeAmount REAL NOT NULL,
      PRIMARY KEY (fiscalYear, memberType),
      FOREIGN KEY (fiscalYear) REFERENCES FiscalYear(year)
    );

    -- Financial transactions (header)
    CREATE TABLE IF NOT EXISTS FinancialTransaction (
      id TEXT PRIMARY KEY NOT NULL,
      fiscalYear INTEGER NOT NULL,
      sequenceNumber INTEGER NOT NULL,
      date TEXT NOT NULL,
      description TEXT NOT NULL,
      cashIn REAL,
      cashOut REAL,
      bankIn REAL,
      bankOut REAL,
      notes TEXT,
      isDeleted INTEGER NOT NULL DEFAULT 0,
      createdAtUtc TEXT NOT NULL,
      updatedAtUtc TEXT NOT NULL,
      FOREIGN KEY (fiscalYear) REFERENCES FiscalYear(year),
      UNIQUE(fiscalYear, sequenceNumber)
    );

    -- Transaction lines (itemized with optional member links)
    CREATE TABLE IF NOT EXISTS TransactionLine (
      id TEXT PRIMARY KEY NOT NULL,
      transactionId TEXT NOT NULL,
      categoryId TEXT NOT NULL,
      amount REAL NOT NULL,
      isIncome INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'CASH',
      memberId TEXT,
      lineDescription TEXT,
      FOREIGN KEY (transactionId) REFERENCES FinancialTransaction(id),
      FOREIGN KEY (categoryId) REFERENCES PostingCategory(id),
      FOREIGN KEY (memberId) REFERENCES Member(internalId)
    );

    -- Member preferences for practice type/classification sync
    CREATE TABLE IF NOT EXISTS MemberPreference (
      memberId TEXT PRIMARY KEY NOT NULL,
      lastPracticeType TEXT,
      lastClassification TEXT,
      updatedAtUtc TEXT NOT NULL
    );

    -- Trainer info table for trainer designations and certifications
    CREATE TABLE IF NOT EXISTS TrainerInfo (
      memberId TEXT PRIMARY KEY NOT NULL,
      isTrainer INTEGER NOT NULL DEFAULT 0,
      hasSkydelederCertificate INTEGER NOT NULL DEFAULT 0,
      certifiedDate TEXT,
      createdAtUtc TEXT NOT NULL,
      modifiedAtUtc TEXT NOT NULL,
      deviceId TEXT,
      syncVersion INTEGER NOT NULL DEFAULT 0,
      syncedAtUtc TEXT,
      FOREIGN KEY (memberId) REFERENCES Member(internalId)
    );

    -- Trainer discipline qualifications
    CREATE TABLE IF NOT EXISTS TrainerDiscipline (
      id TEXT PRIMARY KEY NOT NULL,
      memberId TEXT NOT NULL,
      discipline TEXT NOT NULL,
      level TEXT NOT NULL,
      certifiedDate TEXT,
      createdAtUtc TEXT NOT NULL,
      modifiedAtUtc TEXT NOT NULL,
      deviceId TEXT,
      syncVersion INTEGER NOT NULL DEFAULT 0,
      syncedAtUtc TEXT,
      FOREIGN KEY (memberId) REFERENCES Member(internalId)
    );
    CREATE INDEX IF NOT EXISTS idx_TrainerDiscipline_memberId ON TrainerDiscipline(memberId);

    -- ===== Sync Outbox Tables (Reliable Sync) =====

    -- SyncOutbox: Persistent queue for sync operations
    CREATE TABLE IF NOT EXISTS SyncOutbox (
      id TEXT PRIMARY KEY NOT NULL,
      entityType TEXT NOT NULL,
      entityId TEXT NOT NULL,
      operation TEXT NOT NULL,
      payload TEXT NOT NULL,
      createdAtUtc TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      lastAttemptUtc TEXT,
      lastError TEXT,
      nextRetryUtc TEXT,
      status TEXT NOT NULL DEFAULT 'pending'
    );
    CREATE INDEX IF NOT EXISTS idx_SyncOutbox_status ON SyncOutbox(status);
    CREATE INDEX IF NOT EXISTS idx_SyncOutbox_createdAtUtc ON SyncOutbox(createdAtUtc);
    CREATE INDEX IF NOT EXISTS idx_SyncOutbox_nextRetryUtc ON SyncOutbox(nextRetryUtc);

    -- SyncOutboxDelivery: Per-device delivery tracking
    CREATE TABLE IF NOT EXISTS SyncOutboxDelivery (
      outboxId TEXT NOT NULL,
      deviceId TEXT NOT NULL,
      deliveredAtUtc TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      lastAttemptUtc TEXT,
      lastError TEXT,
      PRIMARY KEY (outboxId, deviceId),
      FOREIGN KEY (outboxId) REFERENCES SyncOutbox(id) ON DELETE CASCADE
    );

    -- ProcessedSyncMessage: Idempotency tracking
    CREATE TABLE IF NOT EXISTS ProcessedSyncMessage (
      messageId TEXT PRIMARY KEY NOT NULL,
      sourceDeviceId TEXT NOT NULL,
      processedAtUtc TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ProcessedSyncMessage_processedAt ON ProcessedSyncMessage(processedAtUtc);

    -- ===== SKV Registration Tables =====

    CREATE TABLE IF NOT EXISTS SKVRegistration (
      id TEXT PRIMARY KEY NOT NULL,
      memberId TEXT NOT NULL,
      skvLevel INTEGER NOT NULL DEFAULT 6,
      status TEXT NOT NULL DEFAULT 'not_started',
      lastApprovedDate TEXT,
      createdAtUtc TEXT NOT NULL,
      updatedAtUtc TEXT NOT NULL,
      FOREIGN KEY (memberId) REFERENCES Member(internalId)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_SKVRegistration_memberId ON SKVRegistration(memberId);

    CREATE TABLE IF NOT EXISTS SKVWeapon (
      id TEXT PRIMARY KEY NOT NULL,
      skvRegistrationId TEXT NOT NULL,
      model TEXT NOT NULL,
      description TEXT,
      serial TEXT NOT NULL,
      type TEXT NOT NULL,
      caliber TEXT,
      lastReviewedDate TEXT,
      createdAtUtc TEXT NOT NULL,
      updatedAtUtc TEXT NOT NULL,
      FOREIGN KEY (skvRegistrationId) REFERENCES SKVRegistration(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_SKVWeapon_registrationId ON SKVWeapon(skvRegistrationId);

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
    
    -- Financial transaction indexes
    CREATE INDEX IF NOT EXISTS idx_transaction_year ON FinancialTransaction(fiscalYear);
    CREATE INDEX IF NOT EXISTS idx_transaction_date ON FinancialTransaction(date);
    CREATE INDEX IF NOT EXISTS idx_transaction_line_txn ON TransactionLine(transactionId);
    CREATE INDEX IF NOT EXISTS idx_transaction_line_member ON TransactionLine(memberId) WHERE memberId IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_transaction_line_category ON TransactionLine(categoryId);
  `);

  // Seed default posting categories
  await seedDefaultCategories();

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
 * Seed default posting categories for financial transactions.
 */
async function seedDefaultCategories(): Promise<void> {
  if (!db) return;
  
  const now = new Date().toISOString();
  const categories = [
    { id: 'AMMO', name: 'Patroner/skiver', description: 'Ammunition and targets', sortOrder: 1 },
    { id: 'COMP', name: 'Kapskydning/præmier', description: 'Competitions and prizes', sortOrder: 2 },
    { id: 'FEES', name: 'Kontingent/Bestyrelse', description: 'Membership fees and board expenses', sortOrder: 3 },
    { id: 'WEAP', name: 'Våben/vedligeholdelse', description: 'Weapons and maintenance', sortOrder: 4 },
    { id: 'OFFC', name: 'Porto/Kontoart', description: 'Postage and office supplies', sortOrder: 5 },
    { id: 'GIFT', name: 'Begr/gaver/støtte', description: 'Flowers, gifts, support', sortOrder: 6 },
    { id: 'MISC', name: 'Diverse/renter/gebyr', description: 'Miscellaneous, interest, fees', sortOrder: 7 },
    { id: 'SUBS', name: 'Tilskud/kontingent hovedafdeling', description: 'Subsidies and main association fees', sortOrder: 8 },
    { id: 'UTIL', name: 'Vand', description: 'Utilities (water)', sortOrder: 9 },
  ];
  
  for (const cat of categories) {
    db.run(
      `INSERT OR IGNORE INTO PostingCategory (id, name, description, sortOrder, isActive, createdAtUtc, updatedAtUtc)
       VALUES (?, ?, ?, ?, 1, ?, ?)`,
      [cat.id, cat.name, cat.description, cat.sortOrder, now, now]
    );
  }
  
  // Seed default fiscal year 2026 if not exists
  db.run(
    `INSERT OR IGNORE INTO FiscalYear (year, openingCashBalance, openingBankBalance, isClosed, createdAtUtc, updatedAtUtc)
     VALUES (2026, 0, 0, 0, ?, ?)`,
    [now, now]
  );
  
  // Seed default fee rates for 2026
  const feeRates = [
    { memberType: 'ADULT', feeAmount: 600 },
    { memberType: 'CHILD', feeAmount: 300 },
    { memberType: 'CHILD_PLUS', feeAmount: 600 },
  ];
  
  for (const rate of feeRates) {
    db.run(
      `INSERT OR IGNORE INTO FeeRate (fiscalYear, memberType, feeAmount) VALUES (2026, ?, ?)`,
      [rate.memberType, rate.feeAmount]
    );
  }
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
