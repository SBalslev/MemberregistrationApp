package com.club.medlems.di

import android.content.Context
import androidx.room.Room
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import com.club.medlems.data.db.AppDatabase
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Singleton
import com.club.medlems.domain.security.AttendantModeManager
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

    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext appContext: Context): AppDatabase = Room.databaseBuilder(
        appContext,
        AppDatabase::class.java,
        "medlems-db"
    ).addMigrations(MIGRATION_1_2, MIGRATION_2_3, MIGRATION_3_4, MIGRATION_4_5, MIGRATION_5_6, MIGRATION_6_7, MIGRATION_7_8, MIGRATION_8_9, MIGRATION_9_10).fallbackToDestructiveMigration().build()

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
    @Singleton
    fun appScope(): CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    @Provides
    @Singleton
    fun attendantManager(scope: CoroutineScope, @ApplicationContext context: Context) = AttendantModeManager(scope, context)
}
