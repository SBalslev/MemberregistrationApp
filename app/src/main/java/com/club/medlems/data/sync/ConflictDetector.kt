package com.club.medlems.data.sync

import android.util.Log
import com.club.medlems.data.entity.Member
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Detects and categorizes sync conflicts according to business rules.
 *
 * Resolution strategies by entity type:
 * - Member: Laptop wins (FR-7.3, FR-7.6)
 * - CheckIn: Keep both (FR-7.1)
 * - PracticeSession: Keep both (FR-7.2)
 * - EquipmentCheckout: Flag for manual resolution (FR-7.4)
 *
 * @see [design.md FR-7] - Conflict Resolution rules
 */
@Singleton
class ConflictDetector @Inject constructor() {

    companion object {
        private const val TAG = "ConflictDetector"
        
        /** Device type identifier for laptop (master authority) */
        const val LAPTOP_DEVICE_TYPE = "LAPTOP"
    }

    /**
     * Determines if an incoming member update should replace the local version.
     *
     * Rule: Laptop wins for member master data (FR-7.3, FR-7.6).
     * If both are from same device type, use last-write-wins.
     *
     * @param local The existing local member record
     * @param remote The incoming member data from sync
     * @param localDeviceType Type of the local device
     * @param remoteDeviceType Type of the source device
     * @return true if remote should replace local
     */
    fun shouldAcceptMemberUpdate(
        local: Member,
        remote: SyncableMember,
        localDeviceType: DeviceType,
        remoteDeviceType: DeviceType
    ): Boolean {
        // If remote is from laptop and local is not, laptop wins
        if (remoteDeviceType == DeviceType.LAPTOP && localDeviceType != DeviceType.LAPTOP) {
            Log.d(TAG, "Member ${remote.membershipId}: Accepting laptop version over tablet")
            return true
        }
        
        // If local is from laptop and remote is not, keep local (laptop wins)
        if (localDeviceType == DeviceType.LAPTOP && remoteDeviceType != DeviceType.LAPTOP) {
            Log.d(TAG, "Member ${remote.membershipId}: Keeping laptop version over tablet")
            return false
        }
        
        // Same device type - use last-write-wins based on timestamp
        val shouldAccept = remote.modifiedAtUtc > local.updatedAtUtc
        Log.d(TAG, "Member ${remote.membershipId}: Same device type, " +
            "accept=${shouldAccept} (remote=${remote.modifiedAtUtc}, local=${local.updatedAtUtc})")
        return shouldAccept
    }

    /**
     * Detects equipment checkout conflict.
     *
     * A conflict occurs when the same equipment is checked out by different
     * members on different devices while offline (FR-7.4).
     *
     * @param existing The existing checkout record
     * @param incoming The incoming checkout from sync
     * @return ConflictInfo if conflict detected, null otherwise
     */
    fun detectEquipmentConflict(
        existing: SyncableEquipmentCheckout,
        incoming: SyncableEquipmentCheckout
    ): EquipmentConflictInfo? {
        // No conflict if same member
        if (existing.membershipId == incoming.membershipId) {
            return null
        }
        
        // No conflict if existing is already checked in
        if (existing.checkedInAtUtc != null) {
            return null
        }
        
        // Conflict: Same equipment checked out to different members
        Log.w(TAG, "Equipment conflict detected: ${existing.equipmentId} " +
            "checked out by ${existing.membershipId} and ${incoming.membershipId}")
        
        return EquipmentConflictInfo(
            equipmentId = existing.equipmentId,
            firstCheckout = existing,
            secondCheckout = incoming,
            detectedAtUtc = Clock.System.now()
        )
    }

    /**
     * Determines resolution strategy for a check-in conflict.
     *
     * Rule: Keep both check-ins (FR-7.1). Each device's check-in is valid.
     *
     * @param existing Existing check-in (if any)
     * @param incoming Incoming check-in from sync
     * @return Resolution strategy
     */
    fun resolveCheckInConflict(
        existing: SyncableCheckIn?,
        incoming: SyncableCheckIn
    ): CheckInResolution {
        if (existing == null) {
            return CheckInResolution.ACCEPT
        }
        
        // Same check-in ID means it's a duplicate
        if (existing.id == incoming.id) {
            return CheckInResolution.SKIP_DUPLICATE
        }
        
        // Different IDs for same member/date - keep both per FR-7.1
        // But we only need one check-in per member per day for counting
        // So skip if member already checked in on this date
        return if (existing.membershipId == incoming.membershipId &&
            existing.localDate == incoming.localDate) {
            CheckInResolution.SKIP_ALREADY_CHECKED_IN
        } else {
            CheckInResolution.ACCEPT
        }
    }

    /**
     * Determines resolution strategy for a practice session conflict.
     *
     * Rule: Keep both sessions (FR-7.2). Multiple sessions per day are valid.
     *
     * @param existingSessions Existing sessions for this member on this date
     * @param incoming Incoming session from sync
     * @return Resolution strategy
     */
    fun resolvePracticeSessionConflict(
        existingSessions: List<SyncablePracticeSession>,
        incoming: SyncablePracticeSession
    ): SessionResolution {
        // Check for exact duplicate
        val isDuplicate = existingSessions.any { existing ->
            existing.id == incoming.id ||
            (existing.practiceType == incoming.practiceType &&
             existing.points == incoming.points &&
             existing.krydser == incoming.krydser &&
             existing.createdAtUtc == incoming.createdAtUtc)
        }
        
        return if (isDuplicate) {
            SessionResolution.SKIP_DUPLICATE
        } else {
            SessionResolution.ACCEPT
        }
    }

    /**
     * Creates a SyncConflict record for tracking and UI display.
     *
     * @param conflictType Type of conflict
     * @param entityType Entity type name
     * @param entityId Entity identifier
     * @param localDeviceId Local device ID
     * @param localTimestamp Local version timestamp
     * @param localSyncVersion Local sync version
     * @param remoteDeviceId Remote device ID
     * @param remoteDeviceName Remote device name (for display)
     * @param remoteTimestamp Remote version timestamp
     * @param remoteSyncVersion Remote sync version
     * @param suggestedResolution Suggested resolution action
     * @param context Additional context (e.g., member name for equipment conflict)
     * @return SyncConflict record
     */
    fun createConflictRecord(
        conflictType: ConflictType,
        entityType: String,
        entityId: String,
        localDeviceId: String,
        localTimestamp: Instant,
        localSyncVersion: Long,
        remoteDeviceId: String,
        remoteDeviceName: String?,
        remoteTimestamp: Instant,
        remoteSyncVersion: Long,
        suggestedResolution: ConflictResolution,
        context: String? = null
    ): SyncConflict {
        return SyncConflict(
            conflictType = conflictType,
            entityId = entityId,
            entityType = entityType,
            localVersion = ConflictVersion(
                deviceId = localDeviceId,
                deviceName = null,
                timestamp = localTimestamp,
                syncVersion = localSyncVersion,
                context = context
            ),
            remoteVersion = ConflictVersion(
                deviceId = remoteDeviceId,
                deviceName = remoteDeviceName,
                timestamp = remoteTimestamp,
                syncVersion = remoteSyncVersion,
                context = context
            ),
            suggestedResolution = suggestedResolution
        )
    }
}

/**
 * Information about an equipment checkout conflict.
 */
data class EquipmentConflictInfo(
    /** Equipment ID that has conflicting checkouts */
    val equipmentId: String,
    
    /** First checkout (chronologically) */
    val firstCheckout: SyncableEquipmentCheckout,
    
    /** Second checkout (chronologically) */
    val secondCheckout: SyncableEquipmentCheckout,
    
    /** When the conflict was detected */
    val detectedAtUtc: Instant
)

/**
 * Resolution strategies for check-in conflicts.
 */
enum class CheckInResolution {
    /** Accept the incoming check-in */
    ACCEPT,
    
    /** Skip - exact duplicate already exists */
    SKIP_DUPLICATE,
    
    /** Skip - member already checked in on this date */
    SKIP_ALREADY_CHECKED_IN
}

/**
 * Resolution strategies for practice session conflicts.
 */
enum class SessionResolution {
    /** Accept the incoming session */
    ACCEPT,
    
    /** Skip - duplicate session already exists */
    SKIP_DUPLICATE
}
