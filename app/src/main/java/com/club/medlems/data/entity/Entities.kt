package com.club.medlems.data.entity

import androidx.room.Entity
import androidx.room.PrimaryKey
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate

enum class MemberStatus { ACTIVE, INACTIVE }
enum class PracticeType { Riffel, Pistol, LuftRiffel, LuftPistol, Andet }
enum class ScanEventType { FIRST_SCAN, REPEAT_SCAN }
enum class SessionSource { kiosk, attendant }

/** Registration approval status for new member registrations */
enum class ApprovalStatus { PENDING, APPROVED, REJECTED }

@Entity(indices = [androidx.room.Index(value = ["status"]), androidx.room.Index(value = ["membershipId"])])
data class Member(
    @PrimaryKey val membershipId: String,
    val firstName: String,
    val lastName: String,
    val email: String? = null,
    val phone: String? = null,
    val status: MemberStatus = MemberStatus.ACTIVE,
    val expiresOn: String? = null, // ISO local date string for simplicity
    val birthDate: LocalDate? = null,
    val updatedAtUtc: Instant = Instant.DISTANT_PAST,
    
    // Sync metadata fields
    val deviceId: String? = null,
    val syncVersion: Long = 0,
    val syncedAtUtc: Instant? = null
)

@Entity(indices = [androidx.room.Index(value = ["membershipId", "localDate"])])
data class CheckIn(
    @PrimaryKey val id: String,
    val membershipId: String,
    val createdAtUtc: Instant,
    val localDate: LocalDate,
    val firstOfDayFlag: Boolean = true,
    
    // Sync metadata fields
    val deviceId: String? = null,
    val syncVersion: Long = 0,
    val syncedAtUtc: Instant? = null
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
    val source: SessionSource,
    
    // Sync metadata fields
    val deviceId: String? = null,
    val syncVersion: Long = 0,
    val syncedAtUtc: Instant? = null
)

@Entity
data class ScanEvent(
    @PrimaryKey val id: String,
    val membershipId: String,
    val createdAtUtc: Instant,
    val type: ScanEventType,
    val linkedCheckInId: String? = null,
    val linkedSessionId: String? = null,
    val canceledFlag: Boolean = false,
    
    // Sync metadata fields
    val deviceId: String? = null,
    val syncVersion: Long = 0,
    val syncedAtUtc: Instant? = null
)

@Entity
data class NewMemberRegistration(
    @PrimaryKey val id: String,
    val temporaryId: String,
    val createdAtUtc: Instant,
    val photoPath: String,
    val firstName: String,
    val lastName: String,
    val email: String? = null,
    val phone: String? = null,
    val birthDate: String? = null,
    val gender: String? = null,
    val address: String? = null,
    val zipCode: String? = null,
    val city: String? = null,
    val guardianName: String? = null,
    val guardianPhone: String? = null,
    val guardianEmail: String? = null,
    
    // Approval workflow fields
    val approvalStatus: ApprovalStatus = ApprovalStatus.PENDING,
    val approvedAtUtc: Instant? = null,
    val rejectedAtUtc: Instant? = null,
    val rejectionReason: String? = null,
    val createdMemberId: String? = null,
    
    // Sync metadata fields
    val deviceId: String? = null,
    val syncVersion: Long = 0,
    val syncedAtUtc: Instant? = null
)

// ===== Equipment Management Entities (Phase 3 - Admin Tablet) =====

/** Equipment item status */
enum class EquipmentStatus { 
    /** Available for checkout */
    Available, 
    /** Currently checked out to a member */
    CheckedOut, 
    /** Under maintenance, not available */
    Maintenance, 
    /** No longer in use */
    Retired 
}

/** Equipment type category */
enum class EquipmentType { 
    /** Training materials (targets, stands, etc.) */
    TrainingMaterial 
}

/** Conflict resolution status for equipment checkouts */
enum class ConflictStatus { 
    /** Conflict detected, awaiting resolution */
    Pending, 
    /** Conflict has been resolved */
    Resolved, 
    /** Conflicting checkout was cancelled */
    Cancelled 
}

/**
 * Equipment item entity for tracking club equipment.
 * 
 * @see [design.md FR-8.2] - EquipmentItem schema
 */
@Entity(indices = [
    androidx.room.Index(value = ["serialNumber"], unique = true),
    androidx.room.Index(value = ["status"])
])
data class EquipmentItem(
    @PrimaryKey val id: String,
    /** Human-readable identifier, manually entered */
    val serialNumber: String,
    /** Equipment category */
    val type: EquipmentType = EquipmentType.TrainingMaterial,
    /** Optional description, max 200 characters */
    val description: String? = null,
    /** Current status */
    val status: EquipmentStatus = EquipmentStatus.Available,
    /** Device that created this equipment item */
    val createdByDeviceId: String,
    val createdAtUtc: Instant,
    val modifiedAtUtc: Instant,
    
    // Sync metadata fields
    val deviceId: String? = null,
    val syncVersion: Long = 0,
    val syncedAtUtc: Instant? = null
)

/**
 * Equipment checkout record for tracking equipment loans to members.
 * 
 * @see [design.md FR-8.3] - EquipmentCheckout schema
 */
@Entity(indices = [
    androidx.room.Index(value = ["equipmentId"]),
    androidx.room.Index(value = ["membershipId"]),
    androidx.room.Index(value = ["checkedInAtUtc"]),
    androidx.room.Index(value = ["conflictStatus"])
])
data class EquipmentCheckout(
    @PrimaryKey val id: String,
    /** Foreign key to EquipmentItem */
    val equipmentId: String,
    /** Foreign key to Member */
    val membershipId: String,
    /** Checkout timestamp */
    val checkedOutAtUtc: Instant,
    /** Return timestamp (null if still checked out) */
    val checkedInAtUtc: Instant? = null,
    /** Device that performed checkout */
    val checkedOutByDeviceId: String,
    /** Device that performed check-in (null if still out) */
    val checkedInByDeviceId: String? = null,
    /** Optional notes at checkout, max 500 characters */
    val checkoutNotes: String? = null,
    /** Optional notes at return, max 500 characters */
    val checkinNotes: String? = null,
    /** Conflict status for offline checkout conflicts */
    val conflictStatus: ConflictStatus? = null,
    /** Resolution notes if conflict was resolved */
    val conflictResolutionNotes: String? = null,
    val createdAtUtc: Instant,
    val modifiedAtUtc: Instant,
    
    // Sync metadata fields
    val deviceId: String? = null,
    val syncVersion: Long = 0,
    val syncedAtUtc: Instant? = null
)
