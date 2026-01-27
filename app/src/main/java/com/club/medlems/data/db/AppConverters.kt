package com.club.medlems.data.db

import androidx.room.TypeConverter
import com.club.medlems.data.entity.ApprovalStatus
import com.club.medlems.data.entity.ConflictStatus
import com.club.medlems.data.entity.EquipmentStatus
import com.club.medlems.data.entity.EquipmentType
import com.club.medlems.data.entity.PracticeType
import com.club.medlems.data.entity.MemberStatus
import com.club.medlems.data.entity.ScanEventType
import com.club.medlems.data.entity.SessionSource
import com.club.medlems.data.sync.ConflictEntityStatus
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate

class AppConverters {
    @TypeConverter fun fromInstant(i: Instant?): String? = i?.toString()
    @TypeConverter fun toInstant(s: String?): Instant? = s?.let { Instant.parse(it) }

    @TypeConverter fun fromLocalDate(d: LocalDate?): String? = d?.toString()
    @TypeConverter fun toLocalDate(s: String?): LocalDate? = s?.let { LocalDate.parse(it) }

    @TypeConverter fun fromPracticeType(t: PracticeType?): String? = t?.name
    @TypeConverter fun toPracticeType(s: String?): PracticeType? = s?.let { PracticeType.valueOf(it) }

    @TypeConverter fun fromMemberStatus(t: MemberStatus?): String? = t?.name
    @TypeConverter fun toMemberStatus(s: String?): MemberStatus? = s?.let { MemberStatus.valueOf(it) }

    @TypeConverter fun fromScanEventType(t: ScanEventType?): String? = t?.name
    @TypeConverter fun toScanEventType(s: String?): ScanEventType? = s?.let { ScanEventType.valueOf(it) }

    @TypeConverter fun fromSessionSource(t: SessionSource?): String? = t?.name
    @TypeConverter fun toSessionSource(s: String?): SessionSource? = s?.let { SessionSource.valueOf(it) }

    @TypeConverter fun fromConflictEntityStatus(t: ConflictEntityStatus?): String? = t?.name
    @TypeConverter fun toConflictEntityStatus(s: String?): ConflictEntityStatus? = s?.let { ConflictEntityStatus.valueOf(it) }

    @TypeConverter fun fromApprovalStatus(t: ApprovalStatus?): String? = t?.name
    @TypeConverter fun toApprovalStatus(s: String?): ApprovalStatus? = s?.let { ApprovalStatus.valueOf(it) }
    
    // Equipment management converters
    @TypeConverter fun fromEquipmentStatus(t: EquipmentStatus?): String? = t?.name
    @TypeConverter fun toEquipmentStatus(s: String?): EquipmentStatus? = s?.let { EquipmentStatus.valueOf(it) }
    
    @TypeConverter fun fromEquipmentType(t: EquipmentType?): String? = t?.name
    @TypeConverter fun toEquipmentType(s: String?): EquipmentType? = s?.let { EquipmentType.valueOf(it) }
    
    @TypeConverter fun fromConflictStatus(t: ConflictStatus?): String? = t?.name
    @TypeConverter fun toConflictStatus(s: String?): ConflictStatus? = s?.let { ConflictStatus.valueOf(it) }
}
