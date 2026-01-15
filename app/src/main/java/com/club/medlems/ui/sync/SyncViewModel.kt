package com.club.medlems.ui.sync

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.club.medlems.data.sync.DeviceInfo
import com.club.medlems.data.sync.DeviceType
import com.club.medlems.data.sync.SyncLogEntry
import com.club.medlems.data.sync.SyncLogManager
import com.club.medlems.data.sync.SyncManager
import com.club.medlems.data.sync.SyncResult
import com.club.medlems.data.sync.SyncState
import com.club.medlems.domain.prefs.DeviceConfigPreferences
import com.club.medlems.network.DeviceDiscoveryService
import com.club.medlems.network.DiscoveredDevice
import com.club.medlems.network.TrustManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import java.util.UUID
import javax.inject.Inject

/**
 * ViewModel for sync-related UI components.
 * Exposes sync state, device discovery, and pairing functionality.
 * 
 * @see [design.md FR-9] - Device Pairing and Trust
 */
@HiltViewModel
class SyncViewModel @Inject constructor(
    private val syncManager: SyncManager,
    private val discoveryService: DeviceDiscoveryService,
    private val trustManager: TrustManager,
    private val syncLogManager: SyncLogManager,
    private val deviceConfigPreferences: DeviceConfigPreferences
) : ViewModel() {
    
    private var syncManagerStarted = false
    
    /** Current sync state */
    val syncState: StateFlow<SyncState> = syncManager.syncState
    
    /** Sync log entries for debugging */
    val logEntries: StateFlow<List<SyncLogEntry>> = syncLogManager.logEntries
    
    /** Last sync timestamp */
    val lastSyncTime: StateFlow<Instant?> = syncManager.lastSyncTime
    
    /** Last sync result */
    val lastSyncResult: StateFlow<SyncResult?> = syncManager.lastSyncResult
    
    /** Number of pending changes to sync */
    val pendingChangesCount: StateFlow<Int> = syncManager.pendingChangesCount
    
    /** Whether network is available */
    val isNetworkAvailable: StateFlow<Boolean> = syncManager.isNetworkAvailable
    
    /** Discovered peer devices */
    val discoveredDevices: StateFlow<List<DiscoveredDevice>> = discoveryService.discoveredDevices
    
    /** Trusted/paired devices */
    val trustedDevices: StateFlow<List<DeviceInfo>> = trustManager.trustedDevices
    
    /** This device's info */
    val thisDeviceInfo: DeviceInfo?
        get() = trustManager.getThisDeviceInfo()
    
    /** Combined UI state for sync status */
    val syncUiState: StateFlow<SyncUiState> = combine(
        syncState,
        lastSyncTime,
        pendingChangesCount,
        isNetworkAvailable,
        discoveredDevices
    ) { state, lastSync, pending, networkAvailable, peers ->
        SyncUiState(
            state = state,
            lastSyncTime = lastSync,
            pendingChangesCount = pending,
            isNetworkAvailable = networkAvailable,
            connectedPeerCount = peers.size
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5000),
        initialValue = SyncUiState()
    )
    
    private val _pairingState = MutableStateFlow<PairingState>(PairingState.Idle)
    val pairingState: StateFlow<PairingState> = _pairingState.asStateFlow()
    
    private val _isScanning = MutableStateFlow(false)
    val isScanning: StateFlow<Boolean> = _isScanning.asStateFlow()
    
    /**
     * Triggers an immediate sync with all connected peers.
     */
    fun syncNow() {
        viewModelScope.launch {
            val result = syncManager.syncNow()
            if (result.hasErrors) {
                // Could emit an error event here for UI to show
            }
        }
    }
    
    /**
     * Starts device discovery scanning.
     * Also starts SyncManager if not already started to enable network connectivity.
     */
    fun startDiscovery() {
        viewModelScope.launch {
            // Start SyncManager if not already started
            if (!syncManagerStarted) {
                val deviceType = deviceConfigPreferences.getDeviceType()
                val deviceInfo = DeviceInfo(
                    id = UUID.randomUUID().toString(),
                    name = android.os.Build.MODEL,
                    type = deviceType,
                    pairedAtUtc = Clock.System.now()
                )
                syncManager.start(deviceInfo)
                syncManagerStarted = true
            }
            
            _isScanning.value = true
            discoveryService.startDiscovery()
        }
    }
    
    /**
     * Stops device discovery scanning.
     */
    fun stopDiscovery() {
        viewModelScope.launch {
            _isScanning.value = false
            discoveryService.stopDiscovery()
        }
    }
    
    /**
     * Initiates pairing with a discovered device.
     */
    fun pairWithDevice(device: DiscoveredDevice) {
        viewModelScope.launch {
            _pairingState.value = PairingState.Pairing(device.deviceName)
            
            try {
                // Add to trusted devices
                trustManager.addTrustedDevice(device.toDeviceInfo())
                _pairingState.value = PairingState.Success(device.deviceName)
            } catch (e: Exception) {
                _pairingState.value = PairingState.Error(e.message ?: "Pairing failed")
            }
        }
    }
    
    /**
     * Removes a device from the trusted list.
     */
    fun unpairDevice(deviceId: String) {
        viewModelScope.launch {
            trustManager.revokeTrust(deviceId)
        }
    }
    
    /**
     * Resets the pairing state to idle.
     */
    fun resetPairingState() {
        _pairingState.value = PairingState.Idle
    }
    
    /**
     * Clears all log entries.
     */
    fun clearLogs() {
        syncLogManager.clear()
    }
}

/**
 * UI state for sync status display.
 */
data class SyncUiState(
    val state: SyncState = SyncState.STOPPED,
    val lastSyncTime: Instant? = null,
    val pendingChangesCount: Int = 0,
    val isNetworkAvailable: Boolean = false,
    val connectedPeerCount: Int = 0
) {
    /** Whether sync is currently in progress */
    val isSyncing: Boolean get() = state == SyncState.SYNCING
    
    /** Whether sync has encountered an error */
    val hasError: Boolean get() = state == SyncState.ERROR
    
    /** Whether sync is ready (network available, has peers) */
    val isReady: Boolean get() = isNetworkAvailable && connectedPeerCount > 0
}

/**
 * State for the pairing process.
 */
sealed class PairingState {
    object Idle : PairingState()
    data class Pairing(val deviceName: String) : PairingState()
    data class Success(val deviceName: String) : PairingState()
    data class Error(val message: String) : PairingState()
}
