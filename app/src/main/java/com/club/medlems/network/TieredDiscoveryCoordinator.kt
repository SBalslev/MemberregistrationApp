package com.club.medlems.network

import android.util.Log
import com.club.medlems.data.sync.DiscoveryPhase
import com.club.medlems.data.sync.DiscoveryProgress
import com.club.medlems.data.sync.SyncLogManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Coordinates the three-phase tiered discovery process:
 *
 * Phase 1: Quick Reconnect (0-2 seconds)
 * - Try known IP addresses from DeviceConnectionProfile
 * - Parallel health checks with 2-second timeout
 * - If all trusted devices found, skip remaining phases
 *
 * Phase 2: Targeted Discovery (2-10 seconds)
 * - mDNS discovery for missing devices
 * - Adjacent IP scan around last known addresses
 * - Only run if Phase 1 didn't find all devices
 *
 * Phase 3: Full Discovery (10+ seconds)
 * - Full subnet scan
 * - User notification shown
 * - Only run as last resort
 *
 * Usage:
 * ```
 * val result = coordinator.startTieredDiscovery()
 * // result contains all discovered devices
 * ```
 */
@Singleton
class TieredDiscoveryCoordinator @Inject constructor(
    private val quickReconnectManager: QuickReconnectManager,
    private val discoveryService: DeviceDiscoveryService,
    private val trustManager: TrustManager,
    private val syncLogManager: SyncLogManager
) {
    companion object {
        private const val TAG = "TieredDiscovery"
        private const val PHASE_1_TIMEOUT_MS = 2000L
        private const val PHASE_2_TIMEOUT_MS = 10000L
        private const val ADJACENT_SCAN_DELAY_MS = 500L
    }

    private val _currentPhase = MutableStateFlow<DiscoveryPhase>(DiscoveryPhase.Idle)
    val currentPhase: StateFlow<DiscoveryPhase> = _currentPhase.asStateFlow()

    private val _discoveryProgress = MutableStateFlow(DiscoveryProgress())
    val discoveryProgress: StateFlow<DiscoveryProgress> = _discoveryProgress.asStateFlow()

    private val _isDiscovering = MutableStateFlow(false)
    val isDiscovering: StateFlow<Boolean> = _isDiscovering.asStateFlow()

    /**
     * Result of a tiered discovery operation.
     */
    data class TieredDiscoveryResult(
        val foundDevices: Map<String, DiscoveredDevice>,
        val missingDeviceIds: Set<String>,
        val totalDurationMs: Long,
        val phasesExecuted: List<DiscoveryPhase>
    ) {
        val allDevicesFound: Boolean
            get() = missingDeviceIds.isEmpty()

        val successRate: Float
            get() = if (foundDevices.isEmpty() && missingDeviceIds.isEmpty()) 1f
            else foundDevices.size.toFloat() / (foundDevices.size + missingDeviceIds.size)
    }

    /**
     * Starts the tiered discovery process.
     * Executes phases in order until all trusted devices are found or all phases complete.
     *
     * @return TieredDiscoveryResult with all found devices and statistics
     */
    suspend fun startTieredDiscovery(): TieredDiscoveryResult = withContext(Dispatchers.IO) {
        if (_isDiscovering.value) {
            Log.w(TAG, "Discovery already in progress")
            return@withContext TieredDiscoveryResult(
                foundDevices = emptyMap(),
                missingDeviceIds = emptySet(),
                totalDurationMs = 0,
                phasesExecuted = emptyList()
            )
        }

        _isDiscovering.value = true
        val startTime = System.currentTimeMillis()
        val phasesExecuted = mutableListOf<DiscoveryPhase>()

        val trustedDevices = trustManager.getTrustedDeviceList()
        val trustedIds = trustedDevices.map { it.id }.toSet()
        val foundDevices = mutableMapOf<String, DiscoveredDevice>()

        Log.i(TAG, "Starting tiered discovery for ${trustedIds.size} trusted devices")
        syncLogManager.info(TAG, "Starting tiered discovery for ${trustedIds.size} devices")

        try {
            // Phase 1: Quick Reconnect
            _currentPhase.value = DiscoveryPhase.QuickReconnect
            phasesExecuted.add(DiscoveryPhase.QuickReconnect)
            updateProgress(DiscoveryPhase.QuickReconnect, trustedIds.size, 0, "Trying known addresses...")

            val phase1Results = withTimeoutOrNull(PHASE_1_TIMEOUT_MS) {
                quickReconnectManager.attemptQuickReconnect()
            } ?: emptyMap()

            foundDevices.putAll(phase1Results)
            updateProgress(DiscoveryPhase.QuickReconnect, trustedIds.size, foundDevices.size,
                "Quick reconnect: ${foundDevices.size}/${trustedIds.size}")

            Log.i(TAG, "Phase 1 (Quick Reconnect): ${foundDevices.size}/${trustedIds.size} devices")

            // Check if all devices found
            val missingAfterPhase1 = trustedIds - foundDevices.keys
            if (missingAfterPhase1.isEmpty()) {
                Log.i(TAG, "All devices found in Phase 1")
                completeDiscovery(foundDevices, trustedIds, startTime, phasesExecuted)
                return@withContext createResult(foundDevices, trustedIds, startTime, phasesExecuted)
            }

            // Phase 2: Targeted Discovery
            _currentPhase.value = DiscoveryPhase.TargetedDiscovery
            phasesExecuted.add(DiscoveryPhase.TargetedDiscovery)
            updateProgress(DiscoveryPhase.TargetedDiscovery, trustedIds.size, foundDevices.size,
                "Searching network...")

            val phase2Results = withTimeoutOrNull(PHASE_2_TIMEOUT_MS) {
                runTargetedDiscovery(missingAfterPhase1)
            } ?: emptyMap()

            foundDevices.putAll(phase2Results)
            updateProgress(DiscoveryPhase.TargetedDiscovery, trustedIds.size, foundDevices.size,
                "Targeted discovery: ${foundDevices.size}/${trustedIds.size}")

            Log.i(TAG, "Phase 2 (Targeted): ${phase2Results.size} new devices, total ${foundDevices.size}")

            // Check if all devices found
            val missingAfterPhase2 = trustedIds - foundDevices.keys
            if (missingAfterPhase2.isEmpty()) {
                Log.i(TAG, "All devices found in Phase 2")
                completeDiscovery(foundDevices, trustedIds, startTime, phasesExecuted)
                return@withContext createResult(foundDevices, trustedIds, startTime, phasesExecuted)
            }

            // Phase 3: Full Discovery (subnet scan)
            _currentPhase.value = DiscoveryPhase.FullDiscovery
            phasesExecuted.add(DiscoveryPhase.FullDiscovery)
            updateProgress(DiscoveryPhase.FullDiscovery, trustedIds.size, foundDevices.size,
                "Full network scan...")

            Log.i(TAG, "Phase 3 (Full Discovery): Scanning subnet for ${missingAfterPhase2.size} missing devices")
            syncLogManager.info(TAG, "Starting full subnet scan for ${missingAfterPhase2.size} missing devices")

            val subnetResult = discoveryService.scanSubnet()
            if (subnetResult.isSuccess) {
                // Get any newly discovered devices from the discovery service
                val discoveredDevices = discoveryService.discoveredDevices.value
                for (device in discoveredDevices) {
                    if (device.deviceId in trustedIds && device.deviceId !in foundDevices) {
                        foundDevices[device.deviceId] = device
                    }
                }
            }

            Log.i(TAG, "Phase 3 complete: total ${foundDevices.size}/${trustedIds.size} devices")

            completeDiscovery(foundDevices, trustedIds, startTime, phasesExecuted)
            return@withContext createResult(foundDevices, trustedIds, startTime, phasesExecuted)

        } catch (e: Exception) {
            Log.e(TAG, "Tiered discovery failed", e)
            syncLogManager.error(TAG, "Discovery failed", e)
            _currentPhase.value = DiscoveryPhase.Error(e.message ?: "Unknown error")
            _isDiscovering.value = false
            return@withContext TieredDiscoveryResult(
                foundDevices = foundDevices,
                missingDeviceIds = trustedIds - foundDevices.keys,
                totalDurationMs = System.currentTimeMillis() - startTime,
                phasesExecuted = phasesExecuted
            )
        }
    }

    /**
     * Phase 2: Targeted discovery for specific missing devices.
     * Uses mDNS + adjacent IP scanning.
     */
    private suspend fun runTargetedDiscovery(
        missingDeviceIds: Set<String>
    ): Map<String, DiscoveredDevice> = withContext(Dispatchers.IO) {
        val results = mutableMapOf<String, DiscoveredDevice>()

        // Start mDNS discovery if not already running
        discoveryService.startDiscovery()

        // Wait a bit for mDNS to find devices
        delay(ADJACENT_SCAN_DELAY_MS)

        // Check what mDNS found
        val discoveredDevices = discoveryService.discoveredDevices.value
        for (device in discoveredDevices) {
            if (device.deviceId in missingDeviceIds) {
                results[device.deviceId] = device
            }
        }

        // For still-missing devices, try adjacent IP scan
        val stillMissing = missingDeviceIds - results.keys
        if (stillMissing.isNotEmpty()) {
            Log.d(TAG, "Adjacent IP scan for ${stillMissing.size} devices")

            for (deviceId in stillMissing) {
                val profile = trustManager.getConnectionProfile(deviceId)
                val lastAddress = profile?.getMostRecentAddress()

                if (lastAddress != null) {
                    val adjacentResults = discoveryService.scanAdjacentIps(lastAddress.ip)
                    for (device in adjacentResults) {
                        if (device.deviceId == deviceId) {
                            results[deviceId] = device
                            break
                        }
                    }
                }
            }
        }

        results
    }

    /**
     * Cancels the current discovery operation.
     */
    fun cancelDiscovery() {
        _isDiscovering.value = false
        _currentPhase.value = DiscoveryPhase.Idle
        Log.i(TAG, "Discovery cancelled")
    }

    private fun updateProgress(phase: DiscoveryPhase, expected: Int, found: Int, message: String) {
        _discoveryProgress.value = DiscoveryProgress(
            phase = phase,
            expectedDeviceCount = expected,
            foundDeviceCount = found,
            message = message
        )
    }

    private fun completeDiscovery(
        foundDevices: Map<String, DiscoveredDevice>,
        trustedIds: Set<String>,
        startTime: Long,
        phasesExecuted: List<DiscoveryPhase>
    ) {
        val duration = System.currentTimeMillis() - startTime
        val missing = trustedIds - foundDevices.keys

        _currentPhase.value = DiscoveryPhase.Complete
        _discoveryProgress.value = DiscoveryProgress(
            phase = DiscoveryPhase.Complete,
            expectedDeviceCount = trustedIds.size,
            foundDeviceCount = foundDevices.size,
            message = if (missing.isEmpty()) "All devices connected"
            else "Found ${foundDevices.size}/${trustedIds.size} devices"
        )
        _isDiscovering.value = false

        Log.i(TAG, "Tiered discovery complete: ${foundDevices.size}/${trustedIds.size} in ${duration}ms")
        syncLogManager.info(TAG, "Discovery complete: ${foundDevices.size}/${trustedIds.size} devices in ${duration}ms (phases: ${phasesExecuted.size})")
    }

    private fun createResult(
        foundDevices: Map<String, DiscoveredDevice>,
        trustedIds: Set<String>,
        startTime: Long,
        phasesExecuted: List<DiscoveryPhase>
    ): TieredDiscoveryResult {
        return TieredDiscoveryResult(
            foundDevices = foundDevices,
            missingDeviceIds = trustedIds - foundDevices.keys,
            totalDurationMs = System.currentTimeMillis() - startTime,
            phasesExecuted = phasesExecuted
        )
    }
}
