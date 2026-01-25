package com.club.medlems.data.db

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.TypeConverters
import com.club.medlems.data.dao.CheckInDao
import com.club.medlems.data.dao.EquipmentCheckoutDao
import com.club.medlems.data.dao.EquipmentItemDao
import com.club.medlems.data.dao.MemberDao
import com.club.medlems.data.dao.MemberPreferenceDao
import com.club.medlems.data.dao.NewMemberRegistrationDao
import com.club.medlems.data.dao.PracticeSessionDao
import com.club.medlems.data.dao.ScanEventDao
import com.club.medlems.data.dao.TrainerDisciplineDao
import com.club.medlems.data.dao.TrainerInfoDao
import com.club.medlems.data.entity.CheckIn
import com.club.medlems.data.entity.EquipmentCheckout
import com.club.medlems.data.entity.EquipmentItem
import com.club.medlems.data.entity.Member
import com.club.medlems.data.entity.MemberPreference
import com.club.medlems.data.entity.NewMemberRegistration
import com.club.medlems.data.entity.PracticeSession
import com.club.medlems.data.entity.ScanEvent
import com.club.medlems.data.entity.TrainerDiscipline
import com.club.medlems.data.entity.TrainerInfo
import com.club.medlems.data.sync.SyncConflictDao
import com.club.medlems.data.sync.SyncConflictEntity
import com.club.medlems.data.sync.SyncOutboxDao
import com.club.medlems.data.sync.SyncOutboxDelivery
import com.club.medlems.data.sync.SyncOutboxEntry
import com.club.medlems.data.sync.SyncProcessedMessage

@Database(
    entities = [
        Member::class,
        CheckIn::class,
        PracticeSession::class,
        ScanEvent::class,
        NewMemberRegistration::class,
        SyncConflictEntity::class,
        EquipmentItem::class,
        EquipmentCheckout::class,
        MemberPreference::class,
        TrainerInfo::class,
        TrainerDiscipline::class,
        SyncOutboxEntry::class,
        SyncOutboxDelivery::class,
        SyncProcessedMessage::class
    ],
    version = 15,
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
    abstract fun memberPreferenceDao(): MemberPreferenceDao
    abstract fun trainerInfoDao(): TrainerInfoDao
    abstract fun trainerDisciplineDao(): TrainerDisciplineDao
    abstract fun syncOutboxDao(): SyncOutboxDao
}
