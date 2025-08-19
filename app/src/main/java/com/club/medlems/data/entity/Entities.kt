package com.club.medlems.data.entity

import androidx.room.Entity
import androidx.room.PrimaryKey
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate

enum class MemberStatus { ACTIVE, INACTIVE }
enum class PracticeType { Riffel, Pistol, LuftRiffel, LuftPistol, Andet }
enum class ScanEventType { FIRST_SCAN, REPEAT_SCAN }
enum class SessionSource { kiosk, attendant }

@Entity
data class Member(
    @PrimaryKey val membershipId: String,
    val firstName: String,
    val lastName: String,
    val email: String? = null,
    val phone: String? = null,
    val status: MemberStatus = MemberStatus.ACTIVE,
    val expiresOn: String? = null, // ISO local date string for simplicity
    val birthDate: LocalDate? = null,
    val updatedAtUtc: Instant = Instant.DISTANT_PAST
)

@Entity
data class CheckIn(
    @PrimaryKey val id: String,
    val membershipId: String,
    val createdAtUtc: Instant,
    val localDate: LocalDate,
    val firstOfDayFlag: Boolean = true
)

@Entity
data class PracticeSession(
    @PrimaryKey val id: String,
    val membershipId: String,
    val createdAtUtc: Instant,
    val localDate: LocalDate,
    val practiceType: PracticeType,
    val points: Int,
    val krydser: Int?,
    val classification: String? = null,
    val source: SessionSource
)

@Entity
data class ScanEvent(
    @PrimaryKey val id: String,
    val membershipId: String,
    val createdAtUtc: Instant,
    val type: ScanEventType,
    val linkedCheckInId: String? = null,
    val linkedSessionId: String? = null,
    val canceledFlag: Boolean = false
)
