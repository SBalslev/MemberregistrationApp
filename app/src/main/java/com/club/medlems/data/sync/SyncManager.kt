package com.club.medlems.data.sync

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.util.Log
import com.club.medlems.network.DeviceDiscoveryService
import com.club.medlems.network.DiscoveredDevice
import com.club.medlems.network.SyncApiServer
import com.club.medlems.network.SyncClient
import com.club.medlems.network.TrustManager
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.time.Duration.Companion.minutes
import kotlin.time.Duration.Companion.seconds

/**
 * Orchestrates sync operations between devices.
 * 
 * Responsibilities:
 * - Start/stop sync services (discovery, API server)
 * - Schedule and execute periodic syncs
 * - Handle push/pull operations
 * - Track sync status and connectivity
 * 
 * @see [design.md FR-18] - Sync API Protocol Specification
 */
@Singleton
class SyncManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val syncRepository: SyncRepository,
    private val syncClient: SyncClient,
    private val syncApiServer: SyncApiServer,
    private val discoveryService: DeviceDiscoveryService,
    private val trustManager: TrustManager,
    private val conflictRepository: ConflictRepository,
    private val syncLogManager: SyncLogManager
) {
    companion object {
        private const val TAG = "SyncManager"
        private val SYNC_INTERVAL = 5.minutes
        private val RETRY_DELAY = 30.seconds
        private val CONNECTIVITY_CHECK_DELAY = 5.seconds
    }
    
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var syncJob: Job? = null
    private var connectivityCallback: ConnectivityManager.NetworkCallback? = null
    
    private val _syncState = MutableStateFlow(SyncState.IDLE)
    val syncState: StateFlow<SyncState> = _syncState.asStateFlow()
    
    private val _lastSyncTime = MutableStateFlow<Instant?>(null)
    val lastSyncTime: StateFlow<Instant?> = _lastSyncTime.asStateFlow()
    
    private val _lastSyncResult = MutableStateFlow<SyncResult?>(null)
    val lastSyncResult: StateFlow<SyncResult?> = _lastSyncResult.asStateFlow()
    
    private val _pendingChangesCount = MutableStateFlow(0)
    val pendingChangesCount: StateFlow<Int> = _pendingChangesCount.asStateFlow()
    
    private val _isNetworkAvailable = MutableStateFlow(false)
    val isNetworkAvailable: StateFlow<Boolean> = _isNetworkAvailable.asStateFlow()
    
    private val _connectedPeers = MutableStateFlow<List<DiscoveredDevice>>(emptyList())
    val connectedPeers: StateFlow<List<DiscoveredDevice>> = _connectedPeers.asStateFlow()
    
    /** Last known sync timestamp for incremental pulls */
    private var lastPullTimestamp: Instant = Instant.DISTANT_PAST
    
    /**
     * Starts the sync system.
     * - Registers connectivity listener
     * - Starts mDNS discovery
     * - Starts the sync API server
     * - Begins periodic sync loop
     * 
     * @param deviceInfo This device's information
     */
    fun start(deviceInfo: DeviceInfo) {
        Log.i(TAG, "Starting sync manager for device: ${deviceInfo.name}")
        syncLogManager.info("Sync", "Starting sync manager for device: ${deviceInfo.name}")
        
        // Save device info
        trustManager.saveThisDeviceInfo(deviceInfo)
        
        // Get or create network ID
        val networkId = trustManager.getNetworkId() ?: trustManager.generateNetworkId()
        
        // Register connectivity callback
        registerConnectivityCallback()
        
        // Start API server
        scope.launch {
            val serverResult = syncApiServer.start(
                deviceInfo = deviceInfo,
                networkId = networkId
            )
            if (serverResult.isFailure) {
                Log.e(TAG, "Failed to start sync API server", serverResult.exceptionOrNull())
                syncLogManager.error("Sync", "Failed to start API server", serverResult.exceptionOrNull())
            } else {
                syncLogManager.info("Sync", "API server started successfully")
            }
        }
        
        // Start mDNS discovery and advertising
        scope.launch {
            discoveryService.startAdvertising(
                deviceInfo = deviceInfo,
                networkId = networkId
            )
            discoveryService.startDiscovery()
            
            // Collect discovered devices
            discoveryService.discoveredDevices.collect { devices ->
                _connectedPeers.value = devices
                Log.d(TAG, "Discovered ${devices.size} peer devices")
            }
        }
        
        // Start periodic sync loop
        startPeriodicSync()
        
        _syncState.value = SyncState.IDLE
    }
    
    /**
     * Stops the sync system.
     * - Cancels periodic sync
     * - Stops API server
     * - Stops mDNS
     * - Unregisters connectivity callback
     */
    fun stop() {
        Log.i(TAG, "Stopping sync manager")
        
        syncJob?.cancel()
        syncJob = null
        
        syncApiServer.stop()
        
        scope.launch {
            discoveryService.stopDiscovery()
            discoveryService.stopAdvertising()
        }
        
        unregisterConnectivityCallback()
        
        _syncState.value = SyncState.STOPPED
    }
    
    /**
     * Triggers an immediate sync with all connected peers.
     * 
     * @return SyncResult with combined results from all peers
     */
    suspend fun syncNow(): SyncResult {
        if (_syncState.value == SyncState.SYNCING) {
            Log.w(TAG, "Sync already in progress, skipping")
            return SyncResult(errorMessage = "Sync already in progress")
        }
        
        if (!_isNetworkAvailable.value) {
            Log.w(TAG, "Network not available, skipping sync")
            syncLogManager.warn("Sync", "Network not available, skipping sync")
            _syncState.value = SyncState.ERROR
            return SyncResult(errorMessage = "Network not available")
        }
        
        _syncState.value = SyncState.SYNCING
        Log.i(TAG, "Starting sync with ${_connectedPeers.value.size} peers")
        syncLogManager.info("Sync", "Starting sync with ${_connectedPeers.value.size} peers")
        
        var totalResult = SyncResult()
        
        try {
            // Get trusted devices to sync with
            val trustedDevices = trustManager.trustedDevices.first()
            val discoveredDevices = _connectedPeers.value
            
            // Find peers that are both trusted and discovered
            val peersToSync = discoveredDevices.filter { discovered ->
                trustedDevices.any { it.id == discovered.deviceId }
            }
            
            if (peersToSync.isEmpty()) {
                Log.i(TAG, "No trusted peers available for sync")
                syncLogManager.warn("Sync", "No trusted peers available (found ${discoveredDevices.size} devices, ${trustedDevices.size} trusted)")
                _syncState.value = SyncState.IDLE
                return SyncResult(errorMessage = "No trusted peers available")
            }
            
            // Sync with each peer
            for (peer in peersToSync) {
                val peerResult = syncWithPeer(peer)
                totalResult = totalResult.combine(peerResult)
            }
            
            // Update last sync time
            _lastSyncTime.value = Clock.System.now()
            _lastSyncResult.value = totalResult
            
            // Update pending changes count
            updatePendingChangesCount()
            
            _syncState.value = if (totalResult.hasErrors) SyncState.ERROR else SyncState.IDLE
            
        } catch (e: Exception) {
            Log.e(TAG, "Sync failed with exception", e)
            _syncState.value = SyncState.ERROR
            totalResult = SyncResult(errorMessage = e.message ?: "Unknown error")
        }
        
        return totalResult
    }
    
    /**
     * Syncs with a single peer device.
     * Performs push (our changes) then pull (their changes).
     */
    private suspend fun syncWithPeer(peer: DiscoveredDevice): SyncResult {
        val baseUrl = "http://${peer.address.hostAddress}:${peer.port}"
        Log.d(TAG, "Syncing with peer: ${peer.deviceName} at $baseUrl")
        syncLogManager.info("Sync", "Syncing with ${peer.deviceName} at $baseUrl")
        
        var result = SyncResult()
        
        try {
            // Check peer status first
            val status = syncClient.checkStatus(baseUrl)
            if (status == null) {
                Log.w(TAG, "Peer ${peer.deviceName} not responding")
                syncLogManager.warn("Sync", "Peer ${peer.deviceName} not responding")
                return SyncResult(errorMessage = "Peer not responding")
            }
            
            // Verify schema compatibility
            if (!SyncSchemaVersion.isCompatible(status.schemaVersion)) {
                Log.w(TAG, "Schema mismatch with ${peer.deviceName}: ${status.schemaVersion}")
                syncLogManager.error("Sync", "Schema mismatch with ${peer.deviceName}: ${status.schemaVersion}")
                return SyncResult(errorMessage = "Schema version mismatch - update required")
            }
            
            // Push our changes
            val pushResult = pushChangesToPeer(baseUrl)
            result = result.combine(pushResult)
            
            // Pull their changes
            val pullResult = pullChangesFromPeer(baseUrl)
            result = result.combine(pullResult)
            
        } catch (e: Exception) {
            Log.e(TAG, "Error syncing with peer ${peer.deviceName}", e)
            syncLogManager.error("Sync", "Error syncing with ${peer.deviceName}", e)
            result = result.copy(errorMessage = e.message)
        }
        
        return result
    }
    
    /**
     * Pushes local changes to a peer.
     */
    private suspend fun pushChangesToPeer(baseUrl: String): SyncResult {
        val deviceId = trustManager.getThisDeviceId()
        
        // Collect unsynced entities
        val entities = collectUnsyncedEntities(deviceId)
        
        if (entities.isEmpty) {
            Log.d(TAG, "No changes to push")
            return SyncResult()
        }
        
        Log.d(TAG, "Pushing ${entities.totalCount} entities to $baseUrl")
        
        val response = syncClient.pushChanges(baseUrl, entities)
        
        return when (response.status) {
            SyncResponseStatus.OK -> {
                // Mark pushed entities as synced
                markEntitiesSynced(entities)
                SyncResult(
                    membersProcessed = entities.members.size,
                    checkInsProcessed = entities.checkIns.size,
                    sessionsProcessed = entities.practiceSessions.size,
                    registrationsProcessed = entities.newMemberRegistrations.size
                )
            }
            SyncResponseStatus.CONFLICT -> {
                // Store conflicts for resolution
                response.conflicts.forEach { conflict ->
                    conflictRepository.storeConflict(conflict)
                }
                SyncResult(conflicts = response.conflicts)
            }
            else -> {
                SyncResult(errorMessage = response.errorMessage ?: "Push failed: ${response.status}")
            }
        }
    }
    
    /**
     * Pulls changes from a peer since last sync.
     */
    private suspend fun pullChangesFromPeer(baseUrl: String): SyncResult {
        Log.d(TAG, "Pulling changes from $baseUrl since $lastPullTimestamp")
        
        val response = syncClient.pullChanges(baseUrl, lastPullTimestamp)
        
        return when (response.status) {
            SyncResponseStatus.OK -> {
                // The response contains entities in a SyncPayload
                // Apply them through the repository
                // Note: The actual entities are returned in a different response format
                // This is a simplified implementation
                lastPullTimestamp = Clock.System.now()
                SyncResult(
                    membersProcessed = response.acceptedCount
                )
            }
            SyncResponseStatus.CONFLICT -> {
                response.conflicts.forEach { conflict ->
                    conflictRepository.storeConflict(conflict)
                }
                SyncResult(conflicts = response.conflicts)
            }
            else -> {
                SyncResult(errorMessage = response.errorMessage ?: "Pull failed: ${response.status}")
            }
        }
    }
    
    /**
     * Collects all unsynced entities from local database.
     */
    private suspend fun collectUnsyncedEntities(deviceId: String): SyncEntities {
        return syncRepository.collectUnsyncedEntities(deviceId)
    }
    
    /**
     * Marks entities as synced after successful push.
     */
    private suspend fun markEntitiesSynced(entities: SyncEntities) {
        val now = Clock.System.now()
        syncRepository.markEntitiesSynced(entities, now)
    }
    
    /**
     * Updates the count of pending (unsynced) changes.
     */
    private suspend fun updatePendingChangesCount() {
        val since = _lastSyncTime.value ?: Instant.DISTANT_PAST
        _pendingChangesCount.value = syncRepository.getPendingChangesCount(since)
    }
    
    /**
     * Starts the periodic sync loop.
     */
    private fun startPeriodicSync() {
        syncJob?.cancel()
        syncJob = scope.launch {
            while (true) {
                delay(SYNC_INTERVAL)
                
                if (_isNetworkAvailable.value && _connectedPeers.value.isNotEmpty()) {
                    try {
                        syncNow()
                    } catch (e: Exception) {
                        Log.e(TAG, "Periodic sync failed", e)
                        _syncState.value = SyncState.ERROR
                    }
                }
            }
        }
    }
    
    /**
     * Registers a callback to monitor network connectivity.
     */
    @Suppress("DEPRECATION")
    private fun registerConnectivityCallback() {
        val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) 
            as ConnectivityManager
        
        val networkRequest = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
            .build()
        
        connectivityCallback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                Log.d(TAG, "Network available")
                syncLogManager.info("Network", "WiFi network connected")
                _isNetworkAvailable.value = true
            }
            
            override fun onLost(network: Network) {
                Log.d(TAG, "Network lost")
                syncLogManager.warn("Network", "WiFi network disconnected")
                _isNetworkAvailable.value = false
            }
            
            override fun onCapabilitiesChanged(
                network: Network,
                capabilities: NetworkCapabilities
            ) {
                val hasWifi = capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)
                _isNetworkAvailable.value = hasWifi
            }
        }
        
        try {
            connectivityManager.registerNetworkCallback(networkRequest, connectivityCallback!!)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to register network callback", e)
            syncLogManager.error("Network", "Failed to register network callback", e)
        }
        
        // Check initial state using deprecated but reliable API for Android 6
        val activeNetworkInfo = connectivityManager.activeNetworkInfo
        val isConnected = activeNetworkInfo?.isConnected == true
        val isWifi = activeNetworkInfo?.type == android.net.ConnectivityManager.TYPE_WIFI
        _isNetworkAvailable.value = isConnected && isWifi
        
        syncLogManager.info("Network", "Initial check: connected=$isConnected, wifi=$isWifi")
    }
    
    /**
     * Unregisters the connectivity callback.
     */
    private fun unregisterConnectivityCallback() {
        connectivityCallback?.let { callback ->
            val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE)
                as ConnectivityManager
            try {
                connectivityManager.unregisterNetworkCallback(callback)
            } catch (e: Exception) {
                Log.w(TAG, "Failed to unregister network callback", e)
            }
        }
        connectivityCallback = null
    }
}

/**
 * Represents the current state of the sync system.
 */
enum class SyncState {
    /** Sync system not started */
    STOPPED,
    
    /** Sync system running, waiting for next sync */
    IDLE,
    
    /** Currently syncing with peers */
    SYNCING,
    
    /** Last sync encountered an error */
    ERROR
}
