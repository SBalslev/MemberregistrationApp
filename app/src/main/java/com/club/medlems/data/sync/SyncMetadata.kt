package com.club.medlems.data.sync

import kotlinx.datetime.Instant
import kotlinx.serialization.Serializable

/**
 * Sync metadata interface that all syncable entities must implement.
 * These fields enable distributed sync with conflict detection.
 *
 * @see [design.md FR-8.4] - All entities SHALL include synchronization metadata
 */
interface SyncMetadata {
    /** Unique identifier for the device that created this record */
    val deviceId: String
    
    /** Monotonically increasing version for conflict detection */
    val syncVersion: Long
    
    /** Timestamp when the record was created (UTC) */
    val createdAtUtc: Instant
    
    /** Timestamp when the record was last modified (UTC) */
    val modifiedAtUtc: Instant
    
    /** Timestamp when the record was last successfully synced (null if never synced) */
    val syncedAtUtc: Instant?
}

/**
 * Device types in the distributed membership system.
 *
 * @see [design.md FR-1] - Device Roles
 */
@Serializable
enum class DeviceType {
    /** Member self-service tablet for check-in and practice sessions */
    MEMBER_TABLET,
    
    /** Admin tablet with equipment management and assisted check-in */
    ADMIN_TABLET,
    
    /** Read-only display showing equipment status */
    DISPLAY_EQUIPMENT,
    
    /** Read-only display showing practice session results */
    DISPLAY_PRACTICE,
    
    /** Master laptop with full membership management */
    LAPTOP
}

/**
 * Information about a device in the sync network.
 *
 * @see [design.md FR-22] - Device Pairing Ceremony Flow
 */
@Serializable
data class DeviceInfo(
    /** Unique device identifier (UUID generated at first launch) */
    val id: String,
    
    /** Human-friendly name assigned during pairing (e.g., "Admin Tablet 1") */
    val name: String,
    
    /** Type of device determining its capabilities */
    val type: DeviceType,
    
    /** Timestamp when device was last seen on the network */
    val lastSeenUtc: Instant? = null,
    
    /** Timestamp when device was paired with the network */
    val pairedAtUtc: Instant,
    
    /** Whether this device is currently trusted (false if revoked) */
    val isTrusted: Boolean = true
)

/**
 * Current schema version for sync protocol.
 * Format: MAJOR.MINOR.PATCH following semantic versioning.
 *
 * - MAJOR: Breaking changes requiring all devices to update
 * - MINOR: Backward-compatible additions
 * - PATCH: Bug fixes
 *
 * @see [design.md FR-13] - Schema Versioning and Compatibility
 */
object SyncSchemaVersion {
    const val MAJOR = 1
    const val MINOR = 0
    const val PATCH = 0
    
    val version: String get() = "$MAJOR.$MINOR.$PATCH"
    
    /**
     * Check if another version is compatible with this version.
     * Same major version = compatible (backward compatible within major).
     */
    fun isCompatible(otherVersion: String): Boolean {
        val parts = otherVersion.split(".")
        if (parts.size < 1) return false
        val otherMajor = parts[0].toIntOrNull() ?: return false
        return otherMajor == MAJOR
    }
}
