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

    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext appContext: Context): AppDatabase = Room.databaseBuilder(
        appContext,
        AppDatabase::class.java,
        "medlems-db"
    ).addMigrations(MIGRATION_1_2, MIGRATION_2_3, MIGRATION_3_4, MIGRATION_4_5).fallbackToDestructiveMigration().build()

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
    @Singleton
    fun appScope(): CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    @Provides
    @Singleton
    fun attendantManager(scope: CoroutineScope, @ApplicationContext context: Context) = AttendantModeManager(scope, context)
}
