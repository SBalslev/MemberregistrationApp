package com.club.medlems.data.sync

import kotlinx.datetime.Instant
import kotlinx.serialization.Serializable

/**
 * Payload sent during sync push/pull operations.
 * Contains all entity changes grouped by type.
 *
 * @see [design.md FR-18.4] - Sync payload structure
 */
@Serializable
data class SyncPayload(
    /** Schema version for compatibility checking */
    val schemaVersion: String = SyncSchemaVersion.version,
    
    /** Device sending this payload */
    val deviceId: String,
    
    /** Type of device sending this payload (for conflict resolution) */
    val deviceType: DeviceType = DeviceType.MEMBER_TABLET,
    
    /** Timestamp when this payload was created */
    val timestamp: Instant,
    
    /** Entity changes grouped by type */
    val entities: SyncEntities = SyncEntities()
)

/**
 * Container for all syncable entity types.
 * Each list contains records to be synced.
 */
@Serializable
data class SyncEntities(
    val members: List<SyncableMember> = emptyList(),
    val checkIns: List<SyncableCheckIn> = emptyList(),
    val practiceSessions: List<SyncablePracticeSession> = emptyList(),
    val scanEvents: List<SyncableScanEvent> = emptyList(),
    val newMemberRegistrations: List<SyncableNewMemberRegistration> = emptyList(),
    val equipmentItems: List<SyncableEquipmentItem> = emptyList(),
    val equipmentCheckouts: List<SyncableEquipmentCheckout> = emptyList(),
    val devices: List<DeviceInfo> = emptyList()
) {
    /** Total number of entities in this payload */
    val totalCount: Int get() = members.size + checkIns.size + practiceSessions.size +
            scanEvents.size + newMemberRegistrations.size + equipmentItems.size +
            equipmentCheckouts.size + devices.size
    
    /** Check if payload is empty */
    val isEmpty: Boolean get() = totalCount == 0
}

/**
 * HTTP response status codes for sync operations.
 *
 * @see [design.md FR-18.7] - Sync response codes
 */
enum class SyncResponseStatus {
    /** Sync completed successfully */
    OK,
    
    /** Conflicts detected during sync */
    CONFLICT,
    
    /** Schema versions incompatible - app update required */
    UPGRADE_REQUIRED,
    
    /** Authentication failed - invalid or expired token */
    UNAUTHORIZED,
    
    /** Server error during sync */
    ERROR
}

/**
 * Response returned from sync operations.
 *
 * @see [design.md FR-18.7] - Sync response structure
 */
@Serializable
data class SyncResponse(
    /** Overall status of the sync operation */
    val status: SyncResponseStatus,
    
    /** Number of entities successfully accepted */
    val acceptedCount: Int = 0,
    
    /** List of conflicts detected (for equipment checkouts) */
    val conflicts: List<SyncConflict> = emptyList(),
    
    /** Error message if status is ERROR */
    val errorMessage: String? = null,
    
    /** Required schema version if UPGRADE_REQUIRED */
    val requiredSchemaVersion: String? = null,
    
    /** Timestamp of this response */
    val timestamp: Instant
)

/**
 * Represents a sync conflict that needs resolution.
 *
 * @see [design.md FR-19] - Equipment Conflict Resolution
 */
@Serializable
data class SyncConflict(
    /** Type of conflict */
    val conflictType: ConflictType,
    
    /** ID of the conflicting entity */
    val entityId: String,
    
    /** Entity type (e.g., "EquipmentCheckout") */
    val entityType: String,
    
    /** Details about the local version */
    val localVersion: ConflictVersion,
    
    /** Details about the remote version */
    val remoteVersion: ConflictVersion,
    
    /** Suggested resolution action */
    val suggestedResolution: ConflictResolution? = null
)

/**
 * Types of conflicts that can occur during sync.
 */
@Serializable
enum class ConflictType {
    /** Same equipment checked out to different members */
    EQUIPMENT_CHECKOUT,
    
    /** Member data modified on multiple devices */
    MEMBER_DATA,
    
    /** Generic version conflict */
    VERSION_MISMATCH
}

/**
 * Details about one side of a conflict.
 */
@Serializable
data class ConflictVersion(
    /** Device that created this version */
    val deviceId: String,
    
    /** Device name for display */
    val deviceName: String? = null,
    
    /** Timestamp of this version */
    val timestamp: Instant,
    
    /** Sync version number */
    val syncVersion: Long,
    
    /** Additional context (e.g., member name for equipment checkout) */
    val context: String? = null
)

/**
 * How a conflict should be resolved.
 */
@Serializable
enum class ConflictResolution {
    /** Keep the local version */
    KEEP_LOCAL,
    
    /** Accept the remote version */
    ACCEPT_REMOTE,
    
    /** Keep both versions (for CheckIn, PracticeSession) */
    KEEP_BOTH,
    
    /** Flag for manual resolution (equipment conflicts) */
    MANUAL_RESOLUTION
}

/**
 * Pull request to get changes from another device.
 *
 * @see [design.md FR-18.2] - GET /api/sync/pull endpoint
 */
@Serializable
data class SyncPullRequest(
    /** Only return changes after this timestamp */
    val since: Instant,
    
    /** Requesting device ID */
    val deviceId: String,
    
    /** Schema version of requesting device */
    val schemaVersion: String = SyncSchemaVersion.version
)

/**
 * Status check response for health and version negotiation.
 *
 * @see [design.md FR-18.2] - GET /api/sync/status endpoint
 */
@Serializable
data class SyncStatusResponse(
    /** Device is healthy and ready for sync */
    val isHealthy: Boolean,
    
    /** Schema version of this device */
    val schemaVersion: String,
    
    /** Device information */
    val device: DeviceInfo,
    
    /** Number of pending changes to sync */
    val pendingChangesCount: Int = 0,
    
    /** Timestamp of last successful sync */
    val lastSyncTimestamp: Instant? = null
)
