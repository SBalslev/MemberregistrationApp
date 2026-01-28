package com.club.medlems.di

import android.content.Context
import androidx.room.Room
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import com.club.medlems.data.db.AppDatabase
import com.club.medlems.data.sync.SyncJson
import dagger.Module
import kotlinx.serialization.json.Json
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Singleton
import com.club.medlems.domain.security.AttendantModeManager
import com.club.medlems.domain.trainer.TrainerSessionManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.Dispatchers

@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {
    private val MIGRATION_1_2 = object : Migration(1, 2) {
        override fun migrate(db: SupportSQLiteDatabase) {
            // Add nullable birthDate column as TEXT (ISO yyyy-MM-dd)
            db.execSQL("ALTER TABLE Member ADD COLUMN birthDate TEXT")
        }
    }

    private val MIGRATION_2_3 = object : Migration(2, 3) {
        override fun migrate(db: SupportSQLiteDatabase) {
            // Add nullable classification column to PracticeSession
            db.execSQL("ALTER TABLE PracticeSession ADD COLUMN classification TEXT")
        }
    }

    private val MIGRATION_3_4 = object : Migration(3, 4) {
        override fun migrate(db: SupportSQLiteDatabase) {
            // Add performance indices for frequently queried columns
            db.execSQL("CREATE INDEX IF NOT EXISTS index_Member_status ON Member(status)")
            db.execSQL("CREATE INDEX IF NOT EXISTS index_Member_membershipId ON Member(membershipId)")
            db.execSQL("CREATE INDEX IF NOT EXISTS index_CheckIn_membershipId_localDate ON CheckIn(membershipId, localDate)")
            db.execSQL("CREATE INDEX IF NOT EXISTS index_PracticeSession_membershipId ON PracticeSession(membershipId)")
            db.execSQL("CREATE INDEX IF NOT EXISTS index_PracticeSession_localDate ON PracticeSession(localDate)")
            db.execSQL("CREATE INDEX IF NOT EXISTS index_PracticeSession_practiceType_localDate ON PracticeSession(practiceType, localDate)")
            db.execSQL("CREATE INDEX IF NOT EXISTS index_PracticeSession_membershipId_practiceType_classification ON PracticeSession(membershipId, practiceType, classification)")
            db.execSQL("CREATE INDEX IF NOT EXISTS index_ScanEvent_membershipId_createdAtUtc ON ScanEvent(membershipId, createdAtUtc)")
        }
    }

    private val MIGRATION_4_5 = object : Migration(4, 5) {
        override fun migrate(db: SupportSQLiteDatabase) {
            // Add NewMemberRegistration table
            db.execSQL("""
                CREATE TABLE IF NOT EXISTS NewMemberRegistration (
                    id TEXT PRIMARY KEY NOT NULL,
                    temporaryId TEXT NOT NULL,
                    createdAtUtc INTEGER NOT NULL,
                    photoPath TEXT NOT NULL,
                    guardianName TEXT,
                    guardianPhone TEXT,
                    guardianEmail TEXT
                )
            """.trimIndent())
        }
    }

    private val MIGRATION_5_6 = object : Migration(5, 6) {
        override fun migrate(db: SupportSQLiteDatabase) {
            // Add firstName, lastName, email, phone, and birthDate to NewMemberRegistration
            db.execSQL("ALTER TABLE NewMemberRegistration ADD COLUMN firstName TEXT NOT NULL DEFAULT ''")
            db.execSQL("ALTER TABLE NewMemberRegistration ADD COLUMN lastName TEXT NOT NULL DEFAULT ''")
            db.execSQL("ALTER TABLE NewMemberRegistration ADD COLUMN email TEXT")
            db.execSQL("ALTER TABLE NewMemberRegistration ADD COLUMN phone TEXT")
            db.execSQL("ALTER TABLE NewMemberRegistration ADD COLUMN birthDate TEXT")
        }
    }

    private val MIGRATION_6_7 = object : Migration(6, 7) {
        override fun migrate(db: SupportSQLiteDatabase) {
            // Add sync_conflicts table for tracking equipment checkout conflicts
            db.execSQL("""
                CREATE TABLE IF NOT EXISTS sync_conflicts (
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
                    context TEXT,
                    status TEXT NOT NULL DEFAULT 'PENDING',
                    resolution TEXT,
                    resolvedByDeviceId TEXT,
                    detectedAtUtc TEXT NOT NULL,
                    resolvedAtUtc TEXT
                )
            """.trimIndent())
        }
    }

    private val MIGRATION_7_8 = object : Migration(7, 8) {
        override fun migrate(db: SupportSQLiteDatabase) {
            // Add sync metadata fields to Member
            db.execSQL("ALTER TABLE Member ADD COLUMN deviceId TEXT")
            db.execSQL("ALTER TABLE Member ADD COLUMN syncVersion INTEGER NOT NULL DEFAULT 0")
            db.execSQL("ALTER TABLE Member ADD COLUMN syncedAtUtc TEXT")
            
            // Add sync metadata fields to CheckIn
            db.execSQL("ALTER TABLE CheckIn ADD COLUMN deviceId TEXT")
            db.execSQL("ALTER TABLE CheckIn ADD COLUMN syncVersion INTEGER NOT NULL DEFAULT 0")
            db.execSQL("ALTER TABLE CheckIn ADD COLUMN syncedAtUtc TEXT")
            
            // Add sync metadata fields to PracticeSession
            db.execSQL("ALTER TABLE PracticeSession ADD COLUMN deviceId TEXT")
            db.execSQL("ALTER TABLE PracticeSession ADD COLUMN syncVersion INTEGER NOT NULL DEFAULT 0")
            db.execSQL("ALTER TABLE PracticeSession ADD COLUMN syncedAtUtc TEXT")
            
            // Add sync metadata fields to ScanEvent
            db.execSQL("ALTER TABLE ScanEvent ADD COLUMN deviceId TEXT")
            db.execSQL("ALTER TABLE ScanEvent ADD COLUMN syncVersion INTEGER NOT NULL DEFAULT 0")
            db.execSQL("ALTER TABLE ScanEvent ADD COLUMN syncedAtUtc TEXT")
            
            // Add approval workflow and sync metadata to NewMemberRegistration
            db.execSQL("ALTER TABLE NewMemberRegistration ADD COLUMN approvalStatus TEXT NOT NULL DEFAULT 'PENDING'")
            db.execSQL("ALTER TABLE NewMemberRegistration ADD COLUMN approvedAtUtc TEXT")
            db.execSQL("ALTER TABLE NewMemberRegistration ADD COLUMN rejectedAtUtc TEXT")
            db.execSQL("ALTER TABLE NewMemberRegistration ADD COLUMN rejectionReason TEXT")
            db.execSQL("ALTER TABLE NewMemberRegistration ADD COLUMN createdMemberId TEXT")
            db.execSQL("ALTER TABLE NewMemberRegistration ADD COLUMN deviceId TEXT")
            db.execSQL("ALTER TABLE NewMemberRegistration ADD COLUMN syncVersion INTEGER NOT NULL DEFAULT 0")
            db.execSQL("ALTER TABLE NewMemberRegistration ADD COLUMN syncedAtUtc TEXT")
        }
    }

    private val MIGRATION_8_9 = object : Migration(8, 9) {
        override fun migrate(db: SupportSQLiteDatabase) {
            // Create EquipmentItem table
            db.execSQL("""
                CREATE TABLE IF NOT EXISTS EquipmentItem (
                    id TEXT PRIMARY KEY NOT NULL,
                    serialNumber TEXT NOT NULL,
                    type TEXT NOT NULL DEFAULT 'TrainingMaterial',
                    description TEXT,
                    status TEXT NOT NULL DEFAULT 'Available',
                    createdByDeviceId TEXT NOT NULL,
                    createdAtUtc TEXT NOT NULL,
                    modifiedAtUtc TEXT NOT NULL,
                    deviceId TEXT,
                    syncVersion INTEGER NOT NULL DEFAULT 0,
                    syncedAtUtc TEXT
                )
            """.trimIndent())
            
            // Create indices for EquipmentItem
            db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS index_EquipmentItem_serialNumber ON EquipmentItem(serialNumber)")
            db.execSQL("CREATE INDEX IF NOT EXISTS index_EquipmentItem_status ON EquipmentItem(status)")
            
            // Create EquipmentCheckout table
            db.execSQL("""
                CREATE TABLE IF NOT EXISTS EquipmentCheckout (
                    id TEXT PRIMARY KEY NOT NULL,
                    equipmentId TEXT NOT NULL,
                    membershipId TEXT NOT NULL,
                    checkedOutAtUtc TEXT NOT NULL,
                    checkedInAtUtc TEXT,
                    checkedOutByDeviceId TEXT NOT NULL,
                    checkedInByDeviceId TEXT,
                    checkoutNotes TEXT,
                    checkinNotes TEXT,
                    conflictStatus TEXT,
                    conflictResolutionNotes TEXT,
                    createdAtUtc TEXT NOT NULL,
                    modifiedAtUtc TEXT NOT NULL,
                    deviceId TEXT,
                    syncVersion INTEGER NOT NULL DEFAULT 0,
                    syncedAtUtc TEXT
                )
            """.trimIndent())
            
            // Create indices for EquipmentCheckout
            db.execSQL("CREATE INDEX IF NOT EXISTS index_EquipmentCheckout_equipmentId ON EquipmentCheckout(equipmentId)")
            db.execSQL("CREATE INDEX IF NOT EXISTS index_EquipmentCheckout_membershipId ON EquipmentCheckout(membershipId)")
            db.execSQL("CREATE INDEX IF NOT EXISTS index_EquipmentCheckout_checkedInAtUtc ON EquipmentCheckout(checkedInAtUtc)")
            db.execSQL("CREATE INDEX IF NOT EXISTS index_EquipmentCheckout_conflictStatus ON EquipmentCheckout(conflictStatus)")
        }
    }

    private val MIGRATION_9_10 = object : Migration(9, 10) {
        override fun migrate(db: SupportSQLiteDatabase) {
            // Add enhanced member registration fields for Phase 3
            db.execSQL("ALTER TABLE NewMemberRegistration ADD COLUMN gender TEXT")
            db.execSQL("ALTER TABLE NewMemberRegistration ADD COLUMN address TEXT")
            db.execSQL("ALTER TABLE NewMemberRegistration ADD COLUMN zipCode TEXT")
            db.execSQL("ALTER TABLE NewMemberRegistration ADD COLUMN city TEXT")
        }
    }

    /**
     * MIGRATION_10_11: Trial Member Registration - Data Model Foundation
     * 
     * This migration transforms the Member table to support trial members:
     * - Changes primary key from membershipId to internalId (UUID)
     * - Makes membershipId nullable (trial members don't have one yet)
     * - Adds memberType (TRIAL/FULL) to track lifecycle stage
     * - Adds guardian fields and other registration data
     * - Adds merge tracking (mergedIntoId) per DD-10
     * - Adds createdAtUtc timestamp
     * 
     * Existing members get:
     * - internalId generated as deterministic UUID from membershipId
     * - memberType = FULL (they already have membershipId)
     * - createdAtUtc = updatedAtUtc (best approximation)
     */
    private val MIGRATION_10_11 = object : Migration(10, 11) {
        override fun migrate(db: SupportSQLiteDatabase) {
            // Step 1: Rename existing Member table
            db.execSQL("ALTER TABLE Member RENAME TO Member_old")
            
            // Step 2: Create new Member table with new schema
            db.execSQL("""
                CREATE TABLE IF NOT EXISTS Member (
                    internalId TEXT NOT NULL PRIMARY KEY,
                    membershipId TEXT,
                    memberType TEXT NOT NULL DEFAULT 'FULL',
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
                    mergedIntoId TEXT,
                    createdAtUtc TEXT NOT NULL,
                    updatedAtUtc TEXT NOT NULL,
                    deviceId TEXT,
                    syncVersion INTEGER NOT NULL DEFAULT 0,
                    syncedAtUtc TEXT
                )
            """.trimIndent())
            
            // Step 3: Migrate data from old table
            // Generate deterministic UUID from membershipId using a simple hash approach
            // SQLite doesn't have UUID functions, so we create a pseudo-UUID from membershipId
            // Format: xxxxxxxx-xxxx-3xxx-yxxx-xxxxxxxxxxxx where digits come from hex(md5(membershipId))
            // For simplicity, we'll use substr of hex representation of membershipId padded
            db.execSQL("""
                INSERT INTO Member (
                    internalId,
                    membershipId,
                    memberType,
                    status,
                    firstName,
                    lastName,
                    birthDate,
                    gender,
                    email,
                    phone,
                    address,
                    zipCode,
                    city,
                    guardianName,
                    guardianPhone,
                    guardianEmail,
                    expiresOn,
                    registrationPhotoPath,
                    mergedIntoId,
                    createdAtUtc,
                    updatedAtUtc,
                    deviceId,
                    syncVersion,
                    syncedAtUtc
                )
                SELECT 
                    -- Generate UUID v3-style from membershipId: deterministic mapping
                    lower(hex(substr(membershipId || '00000000', 1, 4))) || '-' ||
                    lower(hex(substr(membershipId || '0000', 1, 2))) || '-3' ||
                    lower(hex(substr(membershipId || '000', 1, 1))) ||
                    substr('0123456789abcdef', (abs(unicode(membershipId)) % 16) + 1, 1) || '-' ||
                    substr('89ab', (abs(unicode(substr(membershipId, 2, 1) || '0')) % 4) + 1, 1) ||
                    lower(hex(substr(membershipId || '000', 1, 1))) ||
                    substr('0123456789abcdef', (abs(unicode(substr(membershipId, 3, 1) || '0')) % 16) + 1, 1) ||
                    substr('0123456789abcdef', (abs(unicode(substr(membershipId, 4, 1) || '0')) % 16) + 1, 1) || '-' ||
                    lower(hex(substr(membershipId || '000000', 1, 6))) as internalId,
                    membershipId,
                    'FULL' as memberType,
                    status,
                    firstName,
                    lastName,
                    birthDate,
                    NULL as gender,
                    email,
                    phone,
                    NULL as address,
                    NULL as zipCode,
                    NULL as city,
                    NULL as guardianName,
                    NULL as guardianPhone,
                    NULL as guardianEmail,
                    expiresOn,
                    NULL as registrationPhotoPath,
                    NULL as mergedIntoId,
                    COALESCE(updatedAtUtc, datetime('now')) as createdAtUtc,
                    COALESCE(updatedAtUtc, datetime('now')) as updatedAtUtc,
                    deviceId,
                    syncVersion,
                    syncedAtUtc
                FROM Member_old
            """.trimIndent())
            
            // Step 4: Drop old table
            db.execSQL("DROP TABLE Member_old")
            
            // Step 5: Create indices for new table
            db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS index_Member_membershipId ON Member(membershipId)")
            db.execSQL("CREATE INDEX IF NOT EXISTS index_Member_memberType ON Member(memberType)")
            db.execSQL("CREATE INDEX IF NOT EXISTS index_Member_status ON Member(status)")
            db.execSQL("CREATE INDEX IF NOT EXISTS index_Member_lastName_firstName ON Member(lastName, firstName)")
            
            // ===== Phase 2: Foreign Key Migration for related tables =====
            // Add internalMemberId column to CheckIn, PracticeSession, ScanEvent, EquipmentCheckout
            // and populate it by joining with Member table
            
            // --- CheckIn table migration ---
            db.execSQL("ALTER TABLE CheckIn ADD COLUMN internalMemberId TEXT NOT NULL DEFAULT ''")
            // Populate internalMemberId from Member table using membershipId lookup
            db.execSQL("""
                UPDATE CheckIn SET internalMemberId = (
                    SELECT m.internalId FROM Member m WHERE m.membershipId = CheckIn.membershipId
                ) WHERE membershipId IS NOT NULL
            """.trimIndent())
            // For any records that couldn't be matched, use membershipId as fallback
            db.execSQL("UPDATE CheckIn SET internalMemberId = membershipId WHERE internalMemberId = '' AND membershipId IS NOT NULL")
            // Create new indices
            db.execSQL("CREATE INDEX IF NOT EXISTS index_CheckIn_internalMemberId_localDate ON CheckIn(internalMemberId, localDate)")
            
            // --- PracticeSession table migration ---
            db.execSQL("ALTER TABLE PracticeSession ADD COLUMN internalMemberId TEXT NOT NULL DEFAULT ''")
            db.execSQL("""
                UPDATE PracticeSession SET internalMemberId = (
                    SELECT m.internalId FROM Member m WHERE m.membershipId = PracticeSession.membershipId
                ) WHERE membershipId IS NOT NULL
            """.trimIndent())
            db.execSQL("UPDATE PracticeSession SET internalMemberId = membershipId WHERE internalMemberId = '' AND membershipId IS NOT NULL")
            db.execSQL("CREATE INDEX IF NOT EXISTS index_PracticeSession_internalMemberId ON PracticeSession(internalMemberId)")
            db.execSQL("CREATE INDEX IF NOT EXISTS index_PracticeSession_internalMemberId_practiceType_classification ON PracticeSession(internalMemberId, practiceType, classification)")
            
            // --- ScanEvent table migration ---
            db.execSQL("ALTER TABLE ScanEvent ADD COLUMN internalMemberId TEXT NOT NULL DEFAULT ''")
            db.execSQL("""
                UPDATE ScanEvent SET internalMemberId = (
                    SELECT m.internalId FROM Member m WHERE m.membershipId = ScanEvent.membershipId
                ) WHERE membershipId IS NOT NULL
            """.trimIndent())
            db.execSQL("UPDATE ScanEvent SET internalMemberId = membershipId WHERE internalMemberId = '' AND membershipId IS NOT NULL")
            db.execSQL("CREATE INDEX IF NOT EXISTS index_ScanEvent_internalMemberId ON ScanEvent(internalMemberId)")
            
            // --- EquipmentCheckout table migration ---
            db.execSQL("ALTER TABLE EquipmentCheckout ADD COLUMN internalMemberId TEXT NOT NULL DEFAULT ''")
            db.execSQL("""
                UPDATE EquipmentCheckout SET internalMemberId = (
                    SELECT m.internalId FROM Member m WHERE m.membershipId = EquipmentCheckout.membershipId
                ) WHERE membershipId IS NOT NULL
            """.trimIndent())
            db.execSQL("UPDATE EquipmentCheckout SET internalMemberId = membershipId WHERE internalMemberId = '' AND membershipId IS NOT NULL")
            db.execSQL("CREATE INDEX IF NOT EXISTS index_EquipmentCheckout_internalMemberId ON EquipmentCheckout(internalMemberId)")
        }
    }

    /**
     * MIGRATION_11_12: Member Preference Sync
     *
     * Adds member_preference table to store practice preferences for sync between tablets.
     * This allows preferences (last discipline/classification) to transfer when replacing tablets.
     */
    private val MIGRATION_11_12 = object : Migration(11, 12) {
        override fun migrate(db: SupportSQLiteDatabase) {
            db.execSQL("""
                CREATE TABLE IF NOT EXISTS member_preference (
                    memberId TEXT NOT NULL PRIMARY KEY,
                    lastPracticeType TEXT,
                    lastClassification TEXT,
                    updatedAtUtc TEXT NOT NULL
                )
            """.trimIndent())
        }
    }

    /**
     * MIGRATION_12_13: Trainer Experience
     *
     * Adds trainer_info and trainer_discipline tables for the Trainer Experience feature.
     * Also adds discipline column to EquipmentItem for equipment categorization.
     *
     * @see [trainer-experience/prd.md] - Trainer Experience Feature
     */
    private val MIGRATION_12_13 = object : Migration(12, 13) {
        override fun migrate(db: SupportSQLiteDatabase) {
            // Create trainer_info table
            db.execSQL("""
                CREATE TABLE IF NOT EXISTS trainer_info (
                    memberId TEXT NOT NULL PRIMARY KEY,
                    isTrainer INTEGER NOT NULL DEFAULT 0,
                    hasSkydelederCertificate INTEGER NOT NULL DEFAULT 0,
                    certifiedDate TEXT,
                    createdAtUtc TEXT NOT NULL,
                    modifiedAtUtc TEXT NOT NULL,
                    deviceId TEXT,
                    syncVersion INTEGER NOT NULL DEFAULT 0,
                    syncedAtUtc TEXT,
                    FOREIGN KEY (memberId) REFERENCES Member(internalId) ON DELETE CASCADE
                )
            """.trimIndent())

            // Create trainer_discipline table
            db.execSQL("""
                CREATE TABLE IF NOT EXISTS trainer_discipline (
                    id TEXT NOT NULL PRIMARY KEY,
                    memberId TEXT NOT NULL,
                    discipline TEXT NOT NULL,
                    level TEXT NOT NULL,
                    certifiedDate TEXT,
                    createdAtUtc TEXT NOT NULL,
                    modifiedAtUtc TEXT NOT NULL,
                    deviceId TEXT,
                    syncVersion INTEGER NOT NULL DEFAULT 0,
                    syncedAtUtc TEXT,
                    FOREIGN KEY (memberId) REFERENCES Member(internalId) ON DELETE CASCADE
                )
            """.trimIndent())

            // Create index on trainer_discipline.memberId
            db.execSQL("CREATE INDEX IF NOT EXISTS index_trainer_discipline_memberId ON trainer_discipline(memberId)")

            // Add discipline column to EquipmentItem
            db.execSQL("ALTER TABLE EquipmentItem ADD COLUMN discipline TEXT")
        }
    }

    /**
     * MIGRATION_13_14: Sync Reliability - Outbox Queue
     *
     * Adds persistent outbox queue for guaranteed sync delivery.
     * - sync_outbox: Pending changes waiting to be synced
     * - sync_outbox_delivery: Per-device delivery tracking
     * - sync_processed_messages: Idempotency tracking to prevent duplicate processing
     *
     * @see [sync-reliability/prd.md] - Sync Reliability Hardening
     */
    @Suppress("ClassName")
    private val MIGRATION_13_14 = object : Migration(13, 14) {
        override fun migrate(db: SupportSQLiteDatabase) {
            // Create sync_outbox table
            db.execSQL("""
                CREATE TABLE IF NOT EXISTS sync_outbox (
                    id TEXT NOT NULL PRIMARY KEY,
                    entityType TEXT NOT NULL,
                    entityId TEXT NOT NULL,
                    operation TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    createdAtUtc TEXT NOT NULL,
                    attempts INTEGER NOT NULL DEFAULT 0,
                    lastAttemptUtc TEXT,
                    lastError TEXT,
                    nextRetryUtc TEXT,
                    status TEXT NOT NULL DEFAULT 'PENDING'
                )
            """.trimIndent())

            // Create indices for sync_outbox
            db.execSQL("CREATE INDEX IF NOT EXISTS index_sync_outbox_status_createdAtUtc ON sync_outbox(status, createdAtUtc)")
            db.execSQL("CREATE INDEX IF NOT EXISTS index_sync_outbox_entityType_entityId ON sync_outbox(entityType, entityId)")

            // Create sync_outbox_delivery table
            db.execSQL("""
                CREATE TABLE IF NOT EXISTS sync_outbox_delivery (
                    outboxId TEXT NOT NULL,
                    deviceId TEXT NOT NULL,
                    deliveredAtUtc TEXT,
                    attempts INTEGER NOT NULL DEFAULT 0,
                    lastAttemptUtc TEXT,
                    lastError TEXT,
                    PRIMARY KEY (outboxId, deviceId),
                    FOREIGN KEY (outboxId) REFERENCES sync_outbox(id) ON DELETE CASCADE
                )
            """.trimIndent())

            // Create indices for sync_outbox_delivery
            db.execSQL("CREATE INDEX IF NOT EXISTS index_sync_outbox_delivery_outboxId ON sync_outbox_delivery(outboxId)")
            db.execSQL("CREATE INDEX IF NOT EXISTS index_sync_outbox_delivery_deviceId ON sync_outbox_delivery(deviceId)")

            // Create sync_processed_messages table for idempotency
            db.execSQL("""
                CREATE TABLE IF NOT EXISTS sync_processed_messages (
                    messageId TEXT NOT NULL PRIMARY KEY,
                    sourceDeviceId TEXT NOT NULL,
                    processedAtUtc TEXT NOT NULL
                )
            """.trimIndent())

            // Create index for cleanup queries
            db.execSQL("CREATE INDEX IF NOT EXISTS index_sync_processed_messages_processedAtUtc ON sync_processed_messages(processedAtUtc)")
        }
    }

    /**
     * MIGRATION_14_15: Make membershipId nullable in CheckIn table
     *
     * The membershipId column was changed to nullable in the entity definition
     * (to support trial members who don't have a membershipId yet), but the
     * database schema wasn't updated. SQLite doesn't support ALTER COLUMN,
     * so we recreate the table.
     */
    private val MIGRATION_14_15 = object : Migration(14, 15) {
        override fun migrate(db: SupportSQLiteDatabase) {
            // Recreate CheckIn table with membershipId as nullable
            db.execSQL("ALTER TABLE CheckIn RENAME TO CheckIn_old")

            db.execSQL("""
                CREATE TABLE IF NOT EXISTS CheckIn (
                    id TEXT NOT NULL PRIMARY KEY,
                    internalMemberId TEXT NOT NULL,
                    membershipId TEXT,
                    createdAtUtc TEXT NOT NULL,
                    localDate TEXT NOT NULL,
                    firstOfDayFlag INTEGER NOT NULL DEFAULT 1,
                    deviceId TEXT,
                    syncVersion INTEGER NOT NULL DEFAULT 0,
                    syncedAtUtc TEXT
                )
            """.trimIndent())

            db.execSQL("""
                INSERT INTO CheckIn (id, internalMemberId, membershipId, createdAtUtc, localDate, firstOfDayFlag, deviceId, syncVersion, syncedAtUtc)
                SELECT id, internalMemberId, membershipId, createdAtUtc, localDate, firstOfDayFlag, deviceId, syncVersion, syncedAtUtc
                FROM CheckIn_old
            """.trimIndent())

            db.execSQL("DROP TABLE CheckIn_old")

            // Recreate indices
            db.execSQL("CREATE INDEX IF NOT EXISTS index_CheckIn_membershipId_localDate ON CheckIn(membershipId, localDate)")
            db.execSQL("CREATE INDEX IF NOT EXISTS index_CheckIn_internalMemberId_localDate ON CheckIn(internalMemberId, localDate)")
        }
    }

    /**
     * MIGRATION_15_16: ID Photo for Adult Verification (Enhanced Trial Registration)
     *
     * Adds idPhotoPath column to Member table for storing ID verification photos
     * for adult trial members. This supports the Enhanced Trial Registration feature.
     *
     * @see [enhanced-trial-registration/prd.md] - Enhanced Trial Registration Feature
     */
    private val MIGRATION_15_16 = object : Migration(15, 16) {
        override fun migrate(db: SupportSQLiteDatabase) {
            // Add ID photo path column to Member table
            db.execSQL("ALTER TABLE Member ADD COLUMN idPhotoPath TEXT")
        }
    }

    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext appContext: Context): AppDatabase = Room.databaseBuilder(
        appContext,
        AppDatabase::class.java,
        "medlems-db"
    ).addMigrations(MIGRATION_1_2, MIGRATION_2_3, MIGRATION_3_4, MIGRATION_4_5, MIGRATION_5_6, MIGRATION_6_7, MIGRATION_7_8, MIGRATION_8_9, MIGRATION_9_10, MIGRATION_10_11, MIGRATION_11_12, MIGRATION_12_13, MIGRATION_13_14, MIGRATION_14_15, MIGRATION_15_16).fallbackToDestructiveMigration().build()

    @Provides
    fun memberDao(db: AppDatabase) = db.memberDao()
    @Provides
    fun checkInDao(db: AppDatabase) = db.checkInDao()
    @Provides
    fun practiceSessionDao(db: AppDatabase) = db.practiceSessionDao()
    @Provides
    fun scanEventDao(db: AppDatabase) = db.scanEventDao()
    @Provides
    fun newMemberRegistrationDao(db: AppDatabase) = db.newMemberRegistrationDao()
    @Provides
    fun syncConflictDao(db: AppDatabase) = db.syncConflictDao()
    @Provides
    fun equipmentItemDao(db: AppDatabase) = db.equipmentItemDao()
    @Provides
    fun equipmentCheckoutDao(db: AppDatabase) = db.equipmentCheckoutDao()
    @Provides
    fun memberPreferenceDao(db: AppDatabase) = db.memberPreferenceDao()
    @Provides
    fun trainerInfoDao(db: AppDatabase) = db.trainerInfoDao()
    @Provides
    fun trainerDisciplineDao(db: AppDatabase) = db.trainerDisciplineDao()
    @Provides
    fun syncOutboxDao(db: AppDatabase) = db.syncOutboxDao()

    @Provides
    @Singleton
    fun provideSyncJson(): Json = SyncJson.json

    @Provides
    @Singleton
    fun appScope(): CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    @Provides
    @Singleton
    fun attendantManager(scope: CoroutineScope, @ApplicationContext context: Context) = AttendantModeManager(scope, context)

    @Provides
    @Singleton
    fun trainerSessionManager(scope: CoroutineScope) = TrainerSessionManager(scope)
}
