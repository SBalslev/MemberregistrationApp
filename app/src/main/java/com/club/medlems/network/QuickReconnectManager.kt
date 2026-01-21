package com.club.medlems.network

import android.util.Log
import com.club.medlems.data.sync.DeviceType
import com.club.medlems.data.sync.ReconnectAttemptResult
import com.club.medlems.data.sync.SyncLogManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.datetime.Clock
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.URL
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Handles fast reconnection to known devices by trying cached IP addresses.
 *
 * This is Phase 1 of the tiered discovery process:
 * 1. QuickReconnect (0-2 seconds): Try known IPs directly
 * 2. TargetedDiscovery (2-10 seconds): mDNS + adjacent IP scan
 * 3. FullDiscovery (10+ seconds): Full subnet scan
 *
 * Quick reconnect significantly reduces connection time for stable setups
 * where DHCP leases rarely change (e.g., practice nights at a club).
 */
@Singleton
class QuickReconnectManager @Inject constructor(
    private val trustManager: TrustManager,
    private val syncLogManager: SyncLogManager
) {
    companion object {
        private const val TAG = "QuickReconnectManager"
        private const val QUICK_RECONNECT_TIMEOUT_MS = 2000L
        private const val HEALTH_CHECK_TIMEOUT_MS = 1500L
        private const val MAX_PARALLEL_CHECKS = 10
    }

    /**
     * Attempts fast reconnection to all trusted devices using cached IP addresses.
     *
     * @return Map of deviceId to DiscoveredDevice for all successfully connected devices
     */
    suspend fun attemptQuickReconnect(): Map<String, DiscoveredDevice> = withContext(Dispatchers.IO) {
        val startTime = System.currentTimeMillis()
        val profiles = trustManager.getAllConnectionProfiles()

        if (profiles.isEmpty()) {
            syncLogManager.info(TAG, "No connection profiles available, skipping quick reconnect")
            return@withContext emptyMap()
        }

        syncLogManager.info(TAG, "Starting quick reconnect for ${profiles.size} devices")
        Log.i(TAG, "Starting quick reconnect for ${profiles.size} devices")

        val results = mutableMapOf<String, DiscoveredDevice>()

        // Collect all addresses to try, sorted by reliability
        val addressesToTry = profiles.flatMap { (deviceId, profile) ->
            profile.getAddressesByReliability().map { address ->
                Triple(deviceId, address.ip, profile.preferredPort)
            }
        }.take(MAX_PARALLEL_CHECKS) // Limit parallel checks

        if (addressesToTry.isEmpty()) {
            syncLogManager.info(TAG, "No known addresses to try")
            return@withContext emptyMap()
        }

        // Try all addresses in parallel with timeout
        val attemptResults = withTimeoutOrNull(QUICK_RECONNECT_TIMEOUT_MS) {
            coroutineScope {
                addressesToTry.map { (deviceId, ip, port) ->
                    async {
                        tryConnect(deviceId, ip, port)
                    }
                }.awaitAll()
            }
        } ?: emptyList()

        // Process results
        for (result in attemptResults) {
            if (result.success && result.address != null && result.port != null) {
                // Record successful connection
                trustManager.recordConnectionSuccess(result.deviceId, result.address, result.port)
                trustManager.recordReconnectTime(result.deviceId, result.durationMs)

                // Create DiscoveredDevice if not already found
                if (!results.containsKey(result.deviceId)) {
                    val profile = profiles[result.deviceId]
                    if (profile != null) {
                        results[result.deviceId] = DiscoveredDevice(
                            deviceId = result.deviceId,
                            deviceType = profile.deviceInfo.type,
                            deviceName = profile.deviceInfo.name,
                            address = InetAddress.getByName(result.address),
                            port = result.port,
                            schemaVersion = com.club.medlems.data.sync.SyncSchemaVersion.version,
                            networkId = trustManager.getNetworkId() ?: "",
                            lastSeen = System.currentTimeMillis()
                        )
                        syncLogManager.info(TAG, "Quick reconnect found: ${profile.deviceInfo.name} at ${result.address}:${result.port}")
                    }
                }
            } else if (!result.success && result.address != null) {
                // Record failed connection
                trustManager.recordConnectionFailure(result.deviceId, result.address)
            }
        }

        val duration = System.currentTimeMillis() - startTime
        syncLogManager.info(TAG, "Quick reconnect complete: ${results.size}/${profiles.size} devices found in ${duration}ms")
        Log.i(TAG, "Quick reconnect complete: ${results.size}/${profiles.size} devices found in ${duration}ms")

        results
    }

    /**
     * Attempts to connect to a single device at a specific address.
     */
    private suspend fun tryConnect(
        deviceId: String,
        ip: String,
        port: Int
    ): ReconnectAttemptResult = withContext(Dispatchers.IO) {
        val startTime = System.currentTimeMillis()

        try {
            val result = withTimeoutOrNull(HEALTH_CHECK_TIMEOUT_MS) {
                performHealthCheck(ip, port, deviceId)
            }

            val duration = System.currentTimeMillis() - startTime

            if (result != null) {
                ReconnectAttemptResult(
                    deviceId = deviceId,
                    success = true,
                    address = ip,
                    port = port,
                    durationMs = duration
                )
            } else {
                ReconnectAttemptResult(
                    deviceId = deviceId,
                    success = false,
                    address = ip,
                    durationMs = duration,
                    errorMessage = "Health check timeout"
                )
            }
        } catch (e: Exception) {
            val duration = System.currentTimeMillis() - startTime
            ReconnectAttemptResult(
                deviceId = deviceId,
                success = false,
                address = ip,
                durationMs = duration,
                errorMessage = e.message
            )
        }
    }

    /**
     * Performs a health check to verify the device is reachable and responds correctly.
     * Returns the device ID from the response if successful, null otherwise.
     */
    private fun performHealthCheck(ip: String, port: Int, expectedDeviceId: String): String? {
        return try {
            val url = URL("http://$ip:$port/api/sync/status")
            val connection = url.openConnection() as HttpURLConnection
            connection.connectTimeout = 1000
            connection.readTimeout = 1000
            connection.requestMethod = "GET"

            try {
                if (connection.responseCode == 200) {
                    val response = connection.inputStream.bufferedReader().readText()
                    val respondingDeviceId = parseDeviceIdFromResponse(response)

                    // Verify it's the device we expected
                    if (respondingDeviceId == expectedDeviceId) {
                        respondingDeviceId
                    } else {
                        Log.w(TAG, "Device at $ip:$port has different ID: expected $expectedDeviceId, got $respondingDeviceId")
                        null
                    }
                } else {
                    null
                }
            } finally {
                connection.disconnect()
            }
        } catch (e: Exception) {
            // Expected for unreachable addresses - no logging needed
            null
        }
    }

    /**
     * Parses the device ID from a /api/sync/status response.
     * Handles both new format (device object) and legacy format.
     */
    private fun parseDeviceIdFromResponse(json: String): String? {
        return try {
            val jsonObj = Json.parseToJsonElement(json).jsonObject

            // Try new format first (device is nested object)
            val deviceObj = jsonObj["device"]?.jsonObject
            if (deviceObj != null) {
                return deviceObj["id"]?.jsonPrimitive?.content
            }

            // Fall back to legacy format
            jsonObj["deviceId"]?.jsonPrimitive?.content
        } catch (e: Exception) {
            null
        }
    }

    /**
     * Attempts quick reconnect to a specific device.
     * Useful when you know which device you want to connect to.
     */
    suspend fun attemptQuickReconnectToDevice(deviceId: String): DiscoveredDevice? = withContext(Dispatchers.IO) {
        val profile = trustManager.getConnectionProfile(deviceId) ?: return@withContext null

        val addresses = profile.getAddressesByReliability()
        if (addresses.isEmpty()) return@withContext null

        syncLogManager.debug(TAG, "Trying ${addresses.size} known addresses for ${profile.deviceInfo.name}")

        for (address in addresses) {
            val result = tryConnect(deviceId, address.ip, profile.preferredPort)
            if (result.success && result.address != null && result.port != null) {
                trustManager.recordConnectionSuccess(deviceId, result.address, result.port)
                trustManager.recordReconnectTime(deviceId, result.durationMs)

                return@withContext DiscoveredDevice(
                    deviceId = deviceId,
                    deviceType = profile.deviceInfo.type,
                    deviceName = profile.deviceInfo.name,
                    address = InetAddress.getByName(result.address),
                    port = result.port,
                    schemaVersion = com.club.medlems.data.sync.SyncSchemaVersion.version,
                    networkId = trustManager.getNetworkId() ?: "",
                    lastSeen = System.currentTimeMillis()
                )
            } else if (result.address != null) {
                trustManager.recordConnectionFailure(deviceId, result.address)
            }
        }

        null
    }

    /**
     * Checks if we have any known addresses to try for quick reconnect.
     */
    fun hasKnownAddresses(): Boolean {
        return trustManager.getAllKnownAddresses().isNotEmpty()
    }

    /**
     * Gets the number of trusted devices that have known addresses.
     */
    fun getDevicesWithKnownAddresses(): Int {
        return trustManager.getAllConnectionProfiles().count { (_, profile) ->
            profile.knownAddresses.isNotEmpty()
        }
    }
}
