package com.club.medlems.data.sync

import kotlinx.datetime.Instant
import kotlinx.serialization.Serializable

/**
 * Extended device profile with connection history and statistics.
 * Enables fast reconnection to known devices by caching their IP addresses.
 *
 * This profile tracks:
 * - Multiple known IP addresses with reliability scoring
 * - Connection success/failure statistics
 * - Last successful sync time
 *
 * Used by QuickReconnectManager to try known IPs before falling back to mDNS discovery.
 */
@Serializable
data class DeviceConnectionProfile(
    val deviceId: String,
    val deviceInfo: DeviceInfo,

    // Connection history - stores last MAX_ADDRESSES known addresses
    val knownAddresses: List<AddressRecord> = emptyList(),
    val preferredPort: Int = 8085,

    // Statistics for smart discovery decisions
    val connectionStats: ConnectionStats = ConnectionStats()
) {
    companion object {
        const val MAX_ADDRESSES = 5
    }

    /**
     * Returns addresses sorted by reliability (highest first).
     * Most reliable addresses are tried first during quick reconnect.
     */
    fun getAddressesByReliability(): List<AddressRecord> =
        knownAddresses.sortedByDescending { it.reliability }

    /**
     * Returns the most recently seen address.
     * Often the current address if DHCP lease hasn't changed.
     */
    fun getMostRecentAddress(): AddressRecord? =
        knownAddresses.maxByOrNull { it.lastSeen }

    /**
     * Returns the address with highest success rate.
     */
    fun getMostReliableAddress(): AddressRecord? =
        knownAddresses.maxByOrNull { it.reliability }

    /**
     * Creates an updated profile with a new successful connection recorded.
     */
    fun withSuccessfulConnection(ip: String, port: Int, now: Instant): DeviceConnectionProfile {
        val existingIndex = knownAddresses.indexOfFirst { it.ip == ip }
        val updatedAddresses = if (existingIndex >= 0) {
            // Update existing address record
            knownAddresses.toMutableList().apply {
                this[existingIndex] = this[existingIndex].withSuccess(now)
            }
        } else {
            // Add new address, keeping only MAX_ADDRESSES most recent
            (knownAddresses + AddressRecord(
                ip = ip,
                firstSeen = now,
                lastSeen = now,
                successCount = 1,
                failCount = 0
            )).sortedByDescending { it.lastSeen }.take(MAX_ADDRESSES)
        }

        return copy(
            knownAddresses = updatedAddresses,
            preferredPort = port,
            connectionStats = connectionStats.withSuccess(now)
        )
    }

    /**
     * Creates an updated profile with a failed connection attempt recorded.
     */
    fun withFailedConnection(ip: String, now: Instant): DeviceConnectionProfile {
        val existingIndex = knownAddresses.indexOfFirst { it.ip == ip }
        val updatedAddresses = if (existingIndex >= 0) {
            knownAddresses.toMutableList().apply {
                this[existingIndex] = this[existingIndex].withFailure(now)
            }
        } else {
            knownAddresses // Don't add unknown IPs on failure
        }

        return copy(
            knownAddresses = updatedAddresses,
            connectionStats = connectionStats.withFailure()
        )
    }
}

/**
 * Record of a known IP address for a device.
 * Tracks when the address was first/last seen and success/failure counts.
 */
@Serializable
data class AddressRecord(
    val ip: String,
    val firstSeen: Instant,
    val lastSeen: Instant,
    val successCount: Int = 0,
    val failCount: Int = 0
) {
    /**
     * Reliability score from 0.0 to 1.0.
     * Higher scores indicate more successful connections at this address.
     */
    val reliability: Float
        get() = if (successCount + failCount == 0) 0f
        else successCount.toFloat() / (successCount + failCount)

    /**
     * Returns true if this address has been used successfully at least once.
     */
    val hasBeenSuccessful: Boolean
        get() = successCount > 0

    /**
     * Creates an updated record with a successful connection.
     */
    fun withSuccess(now: Instant): AddressRecord = copy(
        lastSeen = now,
        successCount = successCount + 1
    )

    /**
     * Creates an updated record with a failed connection.
     */
    fun withFailure(now: Instant): AddressRecord = copy(
        lastSeen = now,
        failCount = failCount + 1
    )
}

/**
 * Connection statistics for a device.
 * Used to track overall connection reliability and performance.
 */
@Serializable
data class ConnectionStats(
    val totalAttempts: Int = 0,
    val totalSuccesses: Int = 0,
    val averageReconnectMs: Long = 0,
    val lastSuccessfulSync: Instant? = null
) {
    /**
     * Overall success rate from 0.0 to 1.0.
     */
    val successRate: Float
        get() = if (totalAttempts == 0) 0f
        else totalSuccesses.toFloat() / totalAttempts

    /**
     * Creates updated stats after a successful connection.
     */
    fun withSuccess(now: Instant): ConnectionStats = copy(
        totalAttempts = totalAttempts + 1,
        totalSuccesses = totalSuccesses + 1,
        lastSuccessfulSync = now
    )

    /**
     * Creates updated stats after a failed connection.
     */
    fun withFailure(): ConnectionStats = copy(
        totalAttempts = totalAttempts + 1
    )

    /**
     * Creates updated stats with a new reconnect time measurement.
     * Uses exponential moving average for smooth tracking.
     */
    fun withReconnectTime(durationMs: Long): ConnectionStats {
        val newAverage = if (averageReconnectMs == 0L) {
            durationMs
        } else {
            // Exponential moving average with alpha = 0.3
            ((averageReconnectMs * 0.7) + (durationMs * 0.3)).toLong()
        }
        return copy(averageReconnectMs = newAverage)
    }
}

/**
 * Result of a quick reconnect attempt to a single device.
 */
data class ReconnectAttemptResult(
    val deviceId: String,
    val success: Boolean,
    val address: String? = null,
    val port: Int? = null,
    val durationMs: Long = 0,
    val errorMessage: String? = null
)

/**
 * Progress information during tiered discovery.
 */
data class DiscoveryProgress(
    val phase: DiscoveryPhase = DiscoveryPhase.Idle,
    val expectedDeviceCount: Int = 0,
    val foundDeviceCount: Int = 0,
    val message: String = ""
) {
    val isComplete: Boolean
        get() = phase == DiscoveryPhase.Complete

    val progressPercent: Float
        get() = if (expectedDeviceCount == 0) 0f
        else (foundDeviceCount.toFloat() / expectedDeviceCount).coerceIn(0f, 1f)
}

/**
 * Phases of the tiered discovery process.
 */
sealed class DiscoveryPhase {
    /** Discovery not started or idle */
    object Idle : DiscoveryPhase()

    /** Phase 1: Trying known IP addresses (0-2 seconds) */
    object QuickReconnect : DiscoveryPhase()

    /** Phase 2: Targeted mDNS + adjacent IP scan (2-10 seconds) */
    object TargetedDiscovery : DiscoveryPhase()

    /** Phase 3: Full subnet scan (10+ seconds) */
    object FullDiscovery : DiscoveryPhase()

    /** Discovery complete */
    object Complete : DiscoveryPhase()

    /** Discovery encountered an error */
    data class Error(val message: String) : DiscoveryPhase()
}
