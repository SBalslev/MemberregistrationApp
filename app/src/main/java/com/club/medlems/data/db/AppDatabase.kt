package com.club.medlems.data.db

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.TypeConverters
import com.club.medlems.data.dao.*
import com.club.medlems.data.entity.*
import com.club.medlems.data.sync.SyncConflictDao
import com.club.medlems.data.sync.SyncConflictEntity

@Database(
    entities = [
        Member::class,
        CheckIn::class,
        PracticeSession::class,
        ScanEvent::class,
        NewMemberRegistration::class,
        SyncConflictEntity::class,
        EquipmentItem::class,
        EquipmentCheckout::class
    ],
    version = 10,
    exportSchema = true
)
@TypeConverters(AppConverters::class)
abstract class AppDatabase : RoomDatabase() {
    abstract fun memberDao(): MemberDao
    abstract fun checkInDao(): CheckInDao
    abstract fun practiceSessionDao(): PracticeSessionDao
    abstract fun scanEventDao(): ScanEventDao
    abstract fun newMemberRegistrationDao(): NewMemberRegistrationDao
    abstract fun syncConflictDao(): SyncConflictDao
    abstract fun equipmentItemDao(): EquipmentItemDao
    abstract fun equipmentCheckoutDao(): EquipmentCheckoutDao
}
