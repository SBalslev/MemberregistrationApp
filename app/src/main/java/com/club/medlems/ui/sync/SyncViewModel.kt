package com.club.medlems.ui.sync

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.club.medlems.data.sync.DeviceInfo
import com.club.medlems.data.sync.DeviceType
import com.club.medlems.data.sync.toDisplayName
import com.club.medlems.data.sync.DiscoveryPhase
import com.club.medlems.data.sync.DiscoveryProgress
import com.club.medlems.data.sync.SyncLogEntry
import com.club.medlems.data.sync.SyncLogManager
import com.club.medlems.data.sync.SyncManager
import com.club.medlems.data.sync.SyncOutboxManager
import com.club.medlems.data.sync.SyncResult
import com.club.medlems.data.sync.SyncState
import com.club.medlems.data.sync.SyncStatusDetail
import com.club.medlems.data.sync.SyncStatusState
import com.club.medlems.domain.prefs.DeviceConfigPreferences
import com.club.medlems.network.DeviceDiscoveryService
import com.club.medlems.network.DiscoveredDevice
import com.club.medlems.network.SyncClient
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
import com.club.medlems.network.SyncApiServer
import kotlin.random.Random

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
    private val deviceConfigPreferences: DeviceConfigPreferences,
    private val syncClient: SyncClient,
    private val syncOutboxManager: SyncOutboxManager,
    private val syncApiServer: SyncApiServer
) : ViewModel() {
    
    private var syncManagerStarted = false
    private var periodicScanJob: kotlinx.coroutines.Job? = null
    
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

    /** Discovery progress for tiered discovery UI feedback */
    val discoveryProgress: StateFlow<DiscoveryProgress> = syncManager.discoveryProgress

    /** Detailed sync status state for reliability UI */
    val syncStatusState: StateFlow<SyncStatusState> = syncManager.syncStatusState

    /** This device's info */
    val thisDeviceInfo: DeviceInfo?
        get() = trustManager.getThisDeviceInfo()
    
    /** This device's ID (always available, even if device not configured) */
    val thisDeviceId: String
        get() = trustManager.getThisDeviceId()
    
    /** Combined UI state for sync status */
    val syncUiState: StateFlow<SyncUiState> = combine(
        syncState,
        lastSyncTime,
        pendingChangesCount,
        isNetworkAvailable,
        discoveredDevices,
        discoveryProgress
    ) { values ->
        val state = values[0] as SyncState
        val lastSync = values[1] as Instant?
        val pending = values[2] as Int
        val networkAvailable = values[3] as Boolean
        @Suppress("UNCHECKED_CAST")
        val peers = values[4] as List<DiscoveredDevice>
        val progress = values[5] as DiscoveryProgress

        SyncUiState(
            state = state,
            lastSyncTime = lastSync,
            pendingChangesCount = pending,
            isNetworkAvailable = networkAvailable,
            connectedPeerCount = peers.size,
            discoveryPhase = progress.phase,
            discoveryMessage = progress.message,
            expectedDeviceCount = progress.expectedDeviceCount,
            foundDeviceCount = progress.foundDeviceCount
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

    // Generated pairing code for other devices to connect to this tablet
    private val _generatedPairingCode = MutableStateFlow<GeneratedPairingCode?>(null)
    val generatedPairingCode: StateFlow<GeneratedPairingCode?> = _generatedPairingCode.asStateFlow()
    
    // Sync result event for showing feedback to user
    private val _syncResultEvent = MutableStateFlow<SyncResultEvent?>(null)
    val syncResultEvent: StateFlow<SyncResultEvent?> = _syncResultEvent.asStateFlow()
    
    /**
     * Clears the sync result event after it's been handled.
     */
    fun clearSyncResultEvent() {
        _syncResultEvent.value = null
    }
    
    /**
     * Triggers an immediate sync with all connected peers.
     */
    fun syncNow() {
        viewModelScope.launch {
            _syncResultEvent.value = SyncResultEvent.Syncing
            val result = syncManager.syncNow()
            _syncResultEvent.value = if (result.hasErrors) {
                SyncResultEvent.Error(result.errorMessage ?: "Synkronisering fejlede")
            } else {
                SyncResultEvent.Success(result.totalProcessed)
            }
        }
    }
    
    /**
     * Starts device discovery scanning.
     * Also starts SyncManager if not already started to enable network connectivity.
     * Uses mDNS discovery + subnet scanning as fallback.
     * Runs periodic rescans every 30 seconds to recover connections.
     */
    fun startDiscovery() {
        viewModelScope.launch {
            // Start SyncManager if not already started
            if (!syncManagerStarted) {
                val deviceType = deviceConfigPreferences.getDeviceType()
                // Use configured name if set, otherwise use role-based name with device model
                val deviceName = deviceConfigPreferences.getDeviceName().takeIf { it.isNotBlank() }
                    ?: "${deviceType.toDisplayName()} (${android.os.Build.MODEL})"
                val deviceInfo = DeviceInfo(
                    id = trustManager.getThisDeviceId(),
                    name = deviceName,
                    type = deviceType,
                    pairedAtUtc = Clock.System.now()
                )
                syncManager.start(deviceInfo)
                syncManagerStarted = true
            }
            
            _isScanning.value = true
            
            // Start mDNS discovery (jmDNS + NSD)
            discoveryService.startDiscovery()
            
            // Also run subnet scan as fallback for unreliable mDNS
            viewModelScope.launch {
                kotlinx.coroutines.delay(2000) // Give mDNS 2 seconds to find devices first
                if (_isScanning.value) {
                    discoveryService.scanSubnet()
                }
            }
            
            // Start periodic rescan for connection recovery
            startPeriodicRescan()
        }
    }
    
    /**
     * Starts periodic rescanning to recover lost connections.
     * Runs every 30 seconds while discovery is active.
     */
    private fun startPeriodicRescan() {
        periodicScanJob?.cancel()
        periodicScanJob = viewModelScope.launch {
            while (_isScanning.value) {
                kotlinx.coroutines.delay(30_000) // Wait 30 seconds
                if (_isScanning.value && isNetworkAvailable.value) {
                    syncLogManager.debug("Rescan", "Running periodic subnet scan...")
                    discoveryService.scanSubnet()
                }
            }
        }
    }
    
    /**
     * Stops device discovery scanning.
     */
    fun stopDiscovery() {
        viewModelScope.launch {
            _isScanning.value = false
            periodicScanJob?.cancel()
            discoveryService.stopDiscovery()
        }
    }
    
    /**
     * Initiates pairing with a discovered device.
     * This starts the auto-pairing process for devices found on the local network.
     * For secure pairing with a code, use pairWithCode().
     */
    fun pairWithDevice(device: DiscoveredDevice) {
        viewModelScope.launch {
            _pairingState.value = PairingState.Error("Parring kræver kode")
        }
    }

    /**
     * Pairs with another device using a 6-digit pairing code.
     * This is the secure pairing method for production use.
     * Works with both laptops and tablets.
     *
     * @param baseUrl The URL of the device (e.g., "http://192.168.1.100:8085")
     * @param pairingCode The 6-digit code shown on the other device
     */
    fun pairWithCode(baseUrl: String, pairingCode: String) {
        viewModelScope.launch {
            _pairingState.value = PairingState.Pairing("enhed")

            try {
                val result = syncClient.pairWithDevice(baseUrl, pairingCode)

                if (result.success) {
                    _pairingState.value = PairingState.Success(result.deviceName ?: "Enhed")
                } else {
                    _pairingState.value = PairingState.Error(
                        result.errorMessage ?: "Parring mislykkedes"
                    )
                }
            } catch (e: Exception) {
                _pairingState.value = PairingState.Error(e.message ?: "Netværksfejl")
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
     * Generates a 6-digit pairing code for other devices to connect to this tablet.
     * The code is valid for 5 minutes.
     *
     * @param expectedDeviceType The type of device expected to pair (default: any tablet)
     */
    fun generatePairingCode(expectedDeviceType: DeviceType = DeviceType.MEMBER_TABLET) {
        viewModelScope.launch {
            // Generate a random 6-digit code
            val code = String.format("%06d", Random.nextInt(1000000))
            val expiresAtMillis = System.currentTimeMillis() + 5 * 60 * 1000 // 5 minutes

            // Get this device's IP address
            val ipAddress = discoveryService.getLocalIpAddress()

            // Register the pairing code with the server
            syncApiServer.registerPendingPairing(
                token = code,
                expectedDeviceType = expectedDeviceType,
                deviceName = "Device", // Will be provided by connecting device
                expiresAtMillis = expiresAtMillis
            )

            _generatedPairingCode.value = GeneratedPairingCode(
                code = code,
                ipAddress = ipAddress ?: "Unknown",
                expiresAtMillis = expiresAtMillis
            )

            syncLogManager.info("Pairing", "Generated pairing code: $code (expires in 5 min)")
        }
    }

    /**
     * Clears the generated pairing code.
     */
    fun clearGeneratedPairingCode() {
        _generatedPairingCode.value = null
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

    /**
     * Retries all failed outbox entries.
     */
    fun retryFailedEntries() {
        viewModelScope.launch {
            syncManager.retryFailedEntries()
        }
    }

    /**
     * Gets detailed sync status information.
     * @return Status detail including pending, failed counts and per-device status
     */
    suspend fun getSyncStatusDetail(): SyncStatusDetail = syncManager.getSyncStatusDetail()

    /**
     * Gets the pending outbox count.
     */
    fun getPendingOutboxCount(): kotlinx.coroutines.flow.Flow<Int> =
        syncOutboxManager.observePendingCount()
}

/**
 * UI state for sync status display.
 */
data class SyncUiState(
    val state: SyncState = SyncState.STOPPED,
    val lastSyncTime: Instant? = null,
    val pendingChangesCount: Int = 0,
    val isNetworkAvailable: Boolean = false,
    val connectedPeerCount: Int = 0,
    // Discovery progress fields
    val discoveryPhase: DiscoveryPhase = DiscoveryPhase.Idle,
    val discoveryMessage: String = "",
    val expectedDeviceCount: Int = 0,
    val foundDeviceCount: Int = 0
) {
    /** Whether sync is currently in progress */
    val isSyncing: Boolean get() = state == SyncState.SYNCING

    /** Whether sync has encountered an error */
    val hasError: Boolean get() = state == SyncState.ERROR

    /** Whether sync is ready (network available, has peers) */
    val isReady: Boolean get() = isNetworkAvailable && connectedPeerCount > 0

    /** Whether discovery is currently in progress */
    val isDiscovering: Boolean get() = discoveryPhase != DiscoveryPhase.Idle &&
            discoveryPhase != DiscoveryPhase.Complete &&
            discoveryPhase !is DiscoveryPhase.Error

    /** Whether all expected devices have been found */
    val allDevicesFound: Boolean get() = expectedDeviceCount > 0 && foundDeviceCount >= expectedDeviceCount

    /** Discovery progress as a percentage (0.0 to 1.0) */
    val discoveryProgressPercent: Float get() =
        if (expectedDeviceCount == 0) 0f
        else (foundDeviceCount.toFloat() / expectedDeviceCount).coerceIn(0f, 1f)
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

/**
 * Event for sync result feedback to the UI.
 */
sealed class SyncResultEvent {
    /** Sync is in progress */
    object Syncing : SyncResultEvent()
    /** Sync completed successfully */
    data class Success(val recordsSynced: Int) : SyncResultEvent()
    /** Sync failed with error */
    data class Error(val message: String) : SyncResultEvent()
}

/**
 * Represents a generated pairing code that other devices can use to connect.
 */
data class GeneratedPairingCode(
    /** The 6-digit pairing code */
    val code: String,
    /** This device's IP address for the other device to connect to */
    val ipAddress: String,
    /** When this code expires (epoch milliseconds) */
    val expiresAtMillis: Long
) {
    /** Whether this code has expired */
    fun isExpired(): Boolean = System.currentTimeMillis() > expiresAtMillis

    /** Remaining time in seconds */
    fun remainingSeconds(): Int = ((expiresAtMillis - System.currentTimeMillis()) / 1000).toInt().coerceAtLeast(0)
}
