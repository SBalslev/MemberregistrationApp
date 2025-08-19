package com.club.medlems.data.db

import androidx.room.TypeConverter
import com.club.medlems.data.entity.PracticeType
import com.club.medlems.data.entity.MemberStatus
import com.club.medlems.data.entity.ScanEventType
import com.club.medlems.data.entity.SessionSource
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
}
