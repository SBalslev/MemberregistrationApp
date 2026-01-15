package com.club.medlems.data.sync

import com.club.medlems.data.entity.MemberStatus
import com.club.medlems.data.entity.PracticeType
import com.club.medlems.data.entity.ScanEventType
import com.club.medlems.data.entity.SessionSource
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate
import kotlinx.serialization.Serializable

/**
 * Syncable entity wrappers that include sync metadata for distributed synchronization.
 * These are used in sync payloads and can be converted to/from Room entities.
 *
 * @see [design.md FR-8] - Data Entities with sync metadata
 */

/**
 * Syncable wrapper for Member entity.
 * Master data - only editable on laptop.
 */
@Serializable
data class SyncableMember(
    val membershipId: String,
    val firstName: String,
    val lastName: String,
    val email: String? = null,
    val phone: String? = null,
    val status: MemberStatus = MemberStatus.ACTIVE,
    val expiresOn: String? = null,
    val birthDate: LocalDate? = null,
    val registrationId: String? = null,
    
    // Sync metadata
    override val deviceId: String,
    override val syncVersion: Long,
    override val createdAtUtc: Instant,
    override val modifiedAtUtc: Instant,
    override val syncedAtUtc: Instant? = null
) : SyncMetadata

/**
 * Syncable wrapper for CheckIn entity.
 * Conflict resolution: keep both duplicates.
 */
@Serializable
data class SyncableCheckIn(
    val id: String,
    val membershipId: String,
    val localDate: LocalDate,
    val firstOfDayFlag: Boolean = true,
    
    // Sync metadata
    override val deviceId: String,
    override val syncVersion: Long,
    override val createdAtUtc: Instant,
    override val modifiedAtUtc: Instant,
    override val syncedAtUtc: Instant? = null
) : SyncMetadata

/**
 * Syncable wrapper for PracticeSession entity.
 * Conflict resolution: keep both duplicates.
 */
@Serializable
data class SyncablePracticeSession(
    val id: String,
    val membershipId: String,
    val localDate: LocalDate,
    val practiceType: PracticeType,
    val points: Int,
    val krydser: Int?,
    val classification: String? = null,
    val source: SessionSource,
    
    // Sync metadata
    override val deviceId: String,
    override val syncVersion: Long,
    override val createdAtUtc: Instant,
    override val modifiedAtUtc: Instant,
    override val syncedAtUtc: Instant? = null
) : SyncMetadata

/**
 * Syncable wrapper for ScanEvent entity.
 */
@Serializable
data class SyncableScanEvent(
    val id: String,
    val membershipId: String,
    val type: ScanEventType,
    val linkedCheckInId: String? = null,
    val linkedSessionId: String? = null,
    val canceledFlag: Boolean = false,
    
    // Sync metadata
    override val deviceId: String,
    override val syncVersion: Long,
    override val createdAtUtc: Instant,
    override val modifiedAtUtc: Instant,
    override val syncedAtUtc: Instant? = null
) : SyncMetadata

/**
 * Approval status for new member registrations.
 *
 * @see [design.md FR-21] - NewMemberRegistration Approval Workflow
 */
@Serializable
enum class ApprovalStatus {
    /** Awaiting review by admin */
    PENDING,
    
    /** Approved and converted to Member */
    APPROVED,
    
    /** Rejected (soft deleted) */
    REJECTED
}

/**
 * Syncable wrapper for NewMemberRegistration entity.
 * Includes approval workflow fields and photo data for sync.
 */
@Serializable
data class SyncableNewMemberRegistration(
    val id: String,
    val temporaryId: String,
    val photoPath: String,
    /** Base64 encoded photo data for sync transfer */
    val photoBase64: String? = null,
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
    
    // Sync metadata
    override val deviceId: String,
    override val syncVersion: Long,
    override val createdAtUtc: Instant,
    override val modifiedAtUtc: Instant,
    override val syncedAtUtc: Instant? = null
) : SyncMetadata

/**
 * Equipment type categorization.
 * Initially only TRAINING_MATERIAL, extensible for future types.
 *
 * @see [design.md FR-8.2] - EquipmentItem schema
 */
@Serializable
enum class EquipmentType {
    TRAINING_MATERIAL
    // Future: PROTECTIVE_GEAR, RANGE_EQUIPMENT, etc.
}

/**
 * Equipment availability status.
 *
 * @see [design.md FR-8.2] - EquipmentItem status field
 */
@Serializable
enum class EquipmentStatus {
    /** Available for checkout */
    AVAILABLE,
    
    /** Currently checked out to a member */
    CHECKED_OUT,
    
    /** Under maintenance, not available */
    MAINTENANCE,
    
    /** Retired from service */
    RETIRED
}

/**
 * Conflict status for equipment checkouts.
 *
 * @see [design.md FR-8.3] - EquipmentCheckout conflictStatus
 */
@Serializable
enum class ConflictStatus {
    /** Conflict detected, awaiting resolution */
    PENDING,
    
    /** Conflict resolved, this checkout is valid */
    RESOLVED,
    
    /** Conflict resolved, this checkout was cancelled */
    CANCELLED
}

/**
 * Syncable equipment item entity.
 *
 * @see [design.md FR-8.2] - EquipmentItem schema
 */
@Serializable
data class SyncableEquipmentItem(
    val id: String,
    val serialNumber: String,
    val type: EquipmentType,
    val description: String? = null, // max 200 chars
    val status: EquipmentStatus,
    
    // Sync metadata
    override val deviceId: String,
    override val syncVersion: Long,
    override val createdAtUtc: Instant,
    override val modifiedAtUtc: Instant,
    override val syncedAtUtc: Instant? = null
) : SyncMetadata

/**
 * Syncable equipment checkout record.
 *
 * @see [design.md FR-8.3] - EquipmentCheckout schema
 */
@Serializable
data class SyncableEquipmentCheckout(
    val id: String,
    val equipmentId: String,
    val membershipId: String,
    val checkedOutAtUtc: Instant,
    val checkedInAtUtc: Instant? = null,
    val checkedOutByDeviceId: String,
    val checkedInByDeviceId: String? = null,
    val checkoutNotes: String? = null, // max 500 chars
    val checkinNotes: String? = null, // max 500 chars
    val conflictStatus: ConflictStatus? = null,
    
    // Sync metadata
    override val deviceId: String,
    override val syncVersion: Long,
    override val createdAtUtc: Instant,
    override val modifiedAtUtc: Instant,
    override val syncedAtUtc: Instant? = null
) : SyncMetadata
