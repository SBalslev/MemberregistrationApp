package com.club.medlems.data.sync

import kotlinx.datetime.Instant

/**
 * Sync status states for UI display.
 *
 * Provides a single state that summarizes the current sync situation
 * for display in the status indicator.
 *
 * @see [sync-reliability/prd.md] FR-4 - Sync Status UI
 */
sealed class SyncStatusState {
    /**
     * All data is synced, no pending changes.
     */
    data class Synced(
        val lastSyncTime: Instant,
        val connectedPeerCount: Int
    ) : SyncStatusState()

    /**
     * Sync is currently in progress.
     */
    data class Syncing(
        val peerName: String? = null
    ) : SyncStatusState()

    /**
     * There are pending changes waiting to sync.
     */
    data class Pending(
        val count: Int,
        val lastSyncTime: Instant? = null
    ) : SyncStatusState()

    /**
     * Sync failed, needs attention.
     */
    data class Error(
        val message: String,
        val failedCount: Int = 0,
        val canRetry: Boolean = true
    ) : SyncStatusState()

    /**
     * Device is offline, no network connectivity.
     */
    object Offline : SyncStatusState()

    /**
     * No peers discovered yet.
     */
    object NoPeers : SyncStatusState()

    /**
     * Initial state before sync system starts.
     */
    object Idle : SyncStatusState()
}

/**
 * Detailed sync status for the status detail sheet.
 */
data class SyncStatusDetail(
    /** Current high-level state */
    val state: SyncStatusState,

    /** Number of pending outbox entries */
    val pendingCount: Int,

    /** Number of failed outbox entries */
    val failedCount: Int,

    /** Last successful sync timestamp */
    val lastSyncTime: Instant?,

    /** Connected peer devices */
    val connectedPeers: List<PeerSyncStatus>,

    /** Whether network is available */
    val isNetworkAvailable: Boolean
)

/**
 * Per-peer sync status.
 */
data class PeerSyncStatus(
    val deviceId: String,
    val deviceName: String,
    val deviceType: DeviceType,
    val lastSyncTime: Instant?,
    val pendingForPeer: Int
)
