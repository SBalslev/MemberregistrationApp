package com.club.medlems.data.db

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.TypeConverters
import com.club.medlems.data.dao.*
import com.club.medlems.data.entity.*

@Database(
    entities = [Member::class, CheckIn::class, PracticeSession::class, ScanEvent::class],
    version = 3,
    exportSchema = true
)
@TypeConverters(AppConverters::class)
abstract class AppDatabase : RoomDatabase() {
    abstract fun memberDao(): MemberDao
    abstract fun checkInDao(): CheckInDao
    abstract fun practiceSessionDao(): PracticeSessionDao
    abstract fun scanEventDao(): ScanEventDao
}
