package com.club.medlems.data.sync

/**
 * Events that trigger a sync operation.
 *
 * Used by [SyncManager] to reactively sync when data changes
 * instead of waiting for the 5-minute polling interval.
 *
 * @see [sync-reliability/prd.md] FR-2 - Reactive Sync Triggers
 */
sealed class SyncTrigger {
    /**
     * An entity was created/updated/deleted locally.
     * Triggers sync after debounce period (2 seconds).
     */
    data class EntityChanged(
        val entityType: String,
        val entityId: String,
        val operation: String = "INSERT"
    ) : SyncTrigger()

    /**
     * A new peer device was discovered on the network.
     * Triggers immediate sync to share data with the new peer.
     */
    data class DeviceDiscovered(
        val deviceId: String,
        val deviceName: String
    ) : SyncTrigger()

    /**
     * User manually requested a sync.
     * Bypasses debounce and syncs immediately.
     */
    object Manual : SyncTrigger()

    /**
     * App started or came to foreground.
     * Triggers sync to catch up with any changes from other devices.
     */
    object AppStart : SyncTrigger()

    /**
     * A previously offline peer came back online.
     * Triggers sync to push pending changes to that peer.
     */
    data class PeerReconnected(
        val deviceId: String
    ) : SyncTrigger()
}
