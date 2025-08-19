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

    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext appContext: Context): AppDatabase = Room.databaseBuilder(
        appContext,
        AppDatabase::class.java,
        "medlems-db"
    ).addMigrations(MIGRATION_1_2, MIGRATION_2_3).fallbackToDestructiveMigration().build()

    @Provides
    fun memberDao(db: AppDatabase) = db.memberDao()
    @Provides
    fun checkInDao(db: AppDatabase) = db.checkInDao()
    @Provides
    fun practiceSessionDao(db: AppDatabase) = db.practiceSessionDao()
    @Provides
    fun scanEventDao(db: AppDatabase) = db.scanEventDao()

    @Provides
    @Singleton
    fun appScope(): CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    @Provides
    @Singleton
    fun attendantManager(scope: CoroutineScope) = AttendantModeManager(scope)
}
