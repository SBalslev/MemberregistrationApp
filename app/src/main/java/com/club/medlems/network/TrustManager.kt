package com.club.medlems.network

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.club.medlems.data.sync.AddressRecord
import com.club.medlems.data.sync.ConnectionStats
import com.club.medlems.data.sync.DeviceConnectionProfile
import com.club.medlems.data.sync.DeviceInfo
import com.club.medlems.data.sync.SyncJson
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import java.security.SecureRandom
import java.util.Base64
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Manages trusted devices and authentication tokens using encrypted storage.
 * 
 * Responsibilities:
 * - Store and retrieve trusted device list
 * - Generate and validate JWT tokens for device authentication
 * - Persist network ID and this device's identity
 * 
 * @see [design.md FR-10] - Device Security and Authentication
 */
@Singleton
class TrustManager @Inject constructor(
    @ApplicationContext private val context: Context
) {
    companion object {
        private const val TAG = "TrustManager"
        private const val PREFS_NAME = "medlems_sync_trust"
        private const val KEY_TRUSTED_DEVICES = "trusted_devices"
        private const val KEY_CONNECTION_PROFILES = "connection_profiles"
        private const val KEY_NETWORK_ID = "network_id"
        private const val KEY_THIS_DEVICE_ID = "this_device_id"
        private const val KEY_THIS_DEVICE_INFO = "this_device_info"
        private const val KEY_PERSISTENT_TOKEN = "persistent_token"
        private const val KEY_DEVICE_TOKENS = "device_tokens"
        private const val TOKEN_BYTES = 48 // 384-bit tokens
    }
    
    private val secureRandom = SecureRandom()
    private val prefs: SharedPreferences by lazy { createEncryptedPrefs() }
    
    private val _trustedDevices = MutableStateFlow<List<DeviceInfo>>(emptyList())
    val trustedDevices: StateFlow<List<DeviceInfo>> = _trustedDevices.asStateFlow()

    // Connection profiles for fast reconnection - stores IP history and stats per device
    private val _connectionProfiles = MutableStateFlow<Map<String, DeviceConnectionProfile>>(emptyMap())
    val connectionProfiles: StateFlow<Map<String, DeviceConnectionProfile>> = _connectionProfiles.asStateFlow()

    init {
        loadTrustedDevices()
        loadConnectionProfiles()
    }
    
    /**
     * Creates encrypted SharedPreferences for secure storage.
     */
    private fun createEncryptedPrefs(): SharedPreferences {
        return try {
            val masterKey = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()
            
            EncryptedSharedPreferences.create(
                context,
                PREFS_NAME,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        } catch (e: Exception) {
            Log.e(TAG, "Failed to create encrypted prefs, falling back to regular prefs", e)
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        }
    }
    
    /**
     * Gets the unique device ID for this device.
     * Generates a new one on first call and persists it.
     */
    fun getThisDeviceId(): String {
        val existing = prefs.getString(KEY_THIS_DEVICE_ID, null)
        if (existing != null) return existing
        
        val newId = java.util.UUID.randomUUID().toString()
        prefs.edit().putString(KEY_THIS_DEVICE_ID, newId).apply()
        Log.i(TAG, "Generated new device ID: $newId")
        return newId
    }
    
    /**
     * Gets the stored device info for this device, or null if not configured.
     */
    fun getThisDeviceInfo(): DeviceInfo? {
        val json = prefs.getString(KEY_THIS_DEVICE_INFO, null) ?: return null
        return try {
            SyncJson.json.decodeFromString(DeviceInfo.serializer(), json)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse stored device info", e)
            null
        }
    }
    
    /**
     * Saves the device info for this device.
     */
    fun saveThisDeviceInfo(deviceInfo: DeviceInfo) {
        val json = SyncJson.json.encodeToString(DeviceInfo.serializer(), deviceInfo)
        prefs.edit().putString(KEY_THIS_DEVICE_INFO, json).apply()
        Log.i(TAG, "Saved device info: ${deviceInfo.name}")
    }
    
    /**
     * Gets the network ID, or null if not yet configured.
     */
    fun getNetworkId(): String? {
        return prefs.getString(KEY_NETWORK_ID, null)
    }
    
    /**
     * Generates and saves a new network ID.
     * Called when this device initiates a new sync network.
     */
    fun generateNetworkId(): String {
        val bytes = ByteArray(16)
        secureRandom.nextBytes(bytes)
        val networkId = "NET-" + Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
        prefs.edit().putString(KEY_NETWORK_ID, networkId).apply()
        Log.i(TAG, "Generated new network ID: $networkId")
        return networkId
    }
    
    /**
     * Sets the network ID (when joining an existing network).
     */
    fun setNetworkId(networkId: String) {
        prefs.edit().putString(KEY_NETWORK_ID, networkId).apply()
        Log.i(TAG, "Set network ID: $networkId")
    }
    
    /**
     * Saves the persistent token received after pairing.
     */
    fun savePersistentToken(token: String) {
        prefs.edit().putString(KEY_PERSISTENT_TOKEN, token).apply()
        Log.i(TAG, "Saved persistent token")
    }
    
    /**
     * Gets the stored persistent token, or null if not paired.
     */
    fun getPersistentToken(): String? {
        return prefs.getString(KEY_PERSISTENT_TOKEN, null)
    }

    /**
     * Saves a token issued by a specific device for authenticating with that device.
     * Each device we communicate with gives us a token signed with their secret.
     *
     * @param deviceId The ID of the device that issued the token
     * @param token The token issued by that device
     */
    fun saveDeviceToken(deviceId: String, token: String) {
        val tokens = getDeviceTokens().toMutableMap()
        tokens[deviceId] = token
        saveDeviceTokens(tokens)
        Log.i(TAG, "Saved token for device: $deviceId")
    }

    /**
     * Gets the token issued by a specific device, or null if we don't have one.
     *
     * @param deviceId The ID of the device we want to authenticate with
     * @return The token that device issued to us, or null
     */
    fun getDeviceToken(deviceId: String): String? {
        return getDeviceTokens()[deviceId]
    }

    /**
     * Removes the token for a specific device (e.g., when trust is revoked).
     */
    fun removeDeviceToken(deviceId: String) {
        val tokens = getDeviceTokens().toMutableMap()
        if (tokens.remove(deviceId) != null) {
            saveDeviceTokens(tokens)
            Log.i(TAG, "Removed token for device: $deviceId")
        }
    }

    private fun getDeviceTokens(): Map<String, String> {
        val json = prefs.getString(KEY_DEVICE_TOKENS, null) ?: return emptyMap()
        return try {
            SyncJson.json.decodeFromString(
                MapSerializer(String.serializer(), String.serializer()),
                json
            )
        } catch (e: Exception) {
            Log.e(TAG, "Failed to load device tokens", e)
            emptyMap()
        }
    }

    private fun saveDeviceTokens(tokens: Map<String, String>) {
        try {
            val json = SyncJson.json.encodeToString(
                MapSerializer(String.serializer(), String.serializer()),
                tokens
            )
            prefs.edit().putString(KEY_DEVICE_TOKENS, json).apply()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to save device tokens", e)
        }
    }

    /**
     * Generates a device token for authentication.
     * This is a simple signed token; for production, use proper JWT with RS256.
     * 
     * @param deviceInfo The device to generate a token for
     * @return A token string for the device
     */
    fun generateDeviceToken(deviceInfo: DeviceInfo): String {
        val tokenData = DeviceToken(
            deviceId = deviceInfo.id,
            deviceType = deviceInfo.type.name,
            issuedAtUtc = Clock.System.now(),
            networkId = getNetworkId() ?: ""
        )
        val json = SyncJson.json.encodeToString(DeviceToken.serializer(), tokenData)
        val signature = generateSignature(json)
        return Base64.getUrlEncoder().withoutPadding().encodeToString(json.toByteArray()) + "." + signature
    }
    
    /**
     * Validates a device token.
     * 
     * @param token The token to validate
     * @return The device ID if valid, null otherwise
     */
    fun validateDeviceToken(token: String): String? {
        return try {
            val parts = token.split(".")
            if (parts.size != 2) return null
            
            val json = String(Base64.getUrlDecoder().decode(parts[0]))
            val signature = parts[1]
            
            // Verify signature
            if (generateSignature(json) != signature) {
                Log.w(TAG, "Token signature verification failed")
                return null
            }
            
            val tokenData = SyncJson.json.decodeFromString(DeviceToken.serializer(), json)
            
            // Check network ID matches
            val networkId = getNetworkId()
            if (networkId != null && tokenData.networkId != networkId) {
                Log.w(TAG, "Token network ID mismatch")
                return null
            }
            
            // Check device is trusted
            val trustedDevice = _trustedDevices.value.find { it.id == tokenData.deviceId }
            if (trustedDevice == null || !trustedDevice.isTrusted) {
                Log.w(TAG, "Device not in trusted list or revoked")
                return null
            }
            
            tokenData.deviceId
        } catch (e: Exception) {
            Log.e(TAG, "Token validation failed", e)
            null
        }
    }
    
    /**
     * Generates a simple HMAC-like signature.
     * Note: For production, use proper JWT with asymmetric keys.
     */
    private fun generateSignature(data: String): String {
        // Simple hash-based signature using device ID as secret
        val secret = getThisDeviceId()
        val combined = data + secret
        val hash = combined.hashCode().toLong() xor (combined.reversed().hashCode().toLong() shl 32)
        return hash.toString(16)
    }
    
    /**
     * Adds a device to the trusted devices list.
     */
    fun addTrustedDevice(deviceInfo: DeviceInfo) {
        val currentList = _trustedDevices.value.toMutableList()
        val existingIndex = currentList.indexOfFirst { it.id == deviceInfo.id }

        if (existingIndex >= 0) {
            currentList[existingIndex] = deviceInfo
            Log.i(TAG, "Updated trusted device: ${deviceInfo.name}")
        } else {
            currentList.add(deviceInfo)
            Log.i(TAG, "Added trusted device: ${deviceInfo.name}")
        }

        _trustedDevices.value = currentList
        saveTrustedDevices()

        // Ensure connection profile exists for fast reconnection
        ensureConnectionProfile(deviceInfo)
    }
    
    /**
     * Removes a device from the trusted devices list (revokes trust).
     */
    fun revokeTrust(deviceId: String) {
        val currentList = _trustedDevices.value.toMutableList()
        val device = currentList.find { it.id == deviceId }

        if (device != null) {
            currentList.remove(device)
            _trustedDevices.value = currentList
            saveTrustedDevices()

            // Also remove the connection profile and any stored token
            removeConnectionProfile(deviceId)
            removeDeviceToken(deviceId)

            Log.i(TAG, "Removed device from trusted list: ${device.name}")
        }
    }
    
    /**
     * Gets all trusted devices.
     */
    fun getTrustedDeviceList(): List<DeviceInfo> {
        return _trustedDevices.value.filter { it.isTrusted }
    }
    
    /**
     * Updates the trusted devices list (e.g., from sync with other devices).
     */
    fun updateTrustedDevices(devices: List<DeviceInfo>) {
        _trustedDevices.value = devices
        saveTrustedDevices()
        Log.i(TAG, "Updated trusted devices list: ${devices.size} devices")
    }
    
    /**
     * Merges trusted devices from another device (for trust propagation).
     */
    fun mergeTrustedDevices(devices: List<DeviceInfo>) {
        val currentList = _trustedDevices.value.toMutableList()
        var added = 0
        var updated = 0
        
        for (device in devices) {
            val existingIndex = currentList.indexOfFirst { it.id == device.id }
            if (existingIndex >= 0) {
                val existing = currentList[existingIndex]
                // Keep the most restrictive trust status (if either revoked, stay revoked)
                val mergedDevice = if (existing.isTrusted && device.isTrusted) {
                    // Both trusted, use the one with later pairedAt
                    if (device.pairedAtUtc > existing.pairedAtUtc) device else existing
                } else {
                    // At least one is not trusted
                    existing.copy(isTrusted = false)
                }
                currentList[existingIndex] = mergedDevice
                updated++
            } else {
                currentList.add(device)
                added++
            }
        }
        
        _trustedDevices.value = currentList
        saveTrustedDevices()
        Log.i(TAG, "Merged trusted devices: $added added, $updated updated")
    }
    
    /**
     * Checks if this device is paired to a network.
     */
    fun isPaired(): Boolean {
        return getNetworkId() != null && getPersistentToken() != null
    }
    
    /**
     * Clears all trust data (factory reset of sync configuration).
     */
    fun clearAllTrustData() {
        prefs.edit().clear().apply()
        _trustedDevices.value = emptyList()
        _connectionProfiles.value = emptyMap()
        Log.i(TAG, "Cleared all trust data")
    }
    
    private fun loadTrustedDevices() {
        val json = prefs.getString(KEY_TRUSTED_DEVICES, null)
        if (json != null) {
            try {
                val devices = SyncJson.json.decodeFromString(
                    ListSerializer(DeviceInfo.serializer()),
                    json
                )
                // Filter out any devices with isTrusted=false (legacy data cleanup)
                val trustedOnly = devices.filter { it.isTrusted }
                _trustedDevices.value = trustedOnly
                Log.i(TAG, "Loaded ${trustedOnly.size} trusted devices (${devices.size - trustedOnly.size} revoked filtered out)")
                
                // If we filtered any out, save the cleaned list
                if (trustedOnly.size < devices.size) {
                    saveTrustedDevices()
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to load trusted devices", e)
            }
        }
    }
    
    private fun saveTrustedDevices() {
        try {
            val json = SyncJson.json.encodeToString(
                ListSerializer(DeviceInfo.serializer()),
                _trustedDevices.value
            )
            prefs.edit().putString(KEY_TRUSTED_DEVICES, json).apply()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to save trusted devices", e)
        }
    }

    // ============ Connection Profile Methods ============

    /**
     * Gets the connection profile for a device, or null if not found.
     */
    fun getConnectionProfile(deviceId: String): DeviceConnectionProfile? {
        return _connectionProfiles.value[deviceId]
    }

    /**
     * Gets all connection profiles for trusted devices.
     */
    fun getAllConnectionProfiles(): Map<String, DeviceConnectionProfile> {
        return _connectionProfiles.value
    }

    /**
     * Gets all known IP addresses across all devices for quick reconnect.
     * Returns pairs of (deviceId, AddressRecord).
     */
    fun getAllKnownAddresses(): List<Pair<String, AddressRecord>> {
        return _connectionProfiles.value.flatMap { (deviceId, profile) ->
            profile.knownAddresses.map { address -> deviceId to address }
        }
    }

    /**
     * Records a successful connection to a device at the given address.
     * Updates the connection profile with the new IP and success statistics.
     */
    fun recordConnectionSuccess(deviceId: String, ip: String, port: Int) {
        val now = Clock.System.now()
        val currentProfiles = _connectionProfiles.value.toMutableMap()

        val existingProfile = currentProfiles[deviceId]
        val updatedProfile = if (existingProfile != null) {
            existingProfile.withSuccessfulConnection(ip, port, now)
        } else {
            // Create new profile for this device
            val deviceInfo = _trustedDevices.value.find { it.id == deviceId }
            if (deviceInfo != null) {
                DeviceConnectionProfile(
                    deviceId = deviceId,
                    deviceInfo = deviceInfo,
                    knownAddresses = listOf(
                        AddressRecord(
                            ip = ip,
                            firstSeen = now,
                            lastSeen = now,
                            successCount = 1,
                            failCount = 0
                        )
                    ),
                    preferredPort = port,
                    connectionStats = ConnectionStats(
                        totalAttempts = 1,
                        totalSuccesses = 1,
                        lastSuccessfulSync = now
                    )
                )
            } else {
                Log.w(TAG, "Cannot create connection profile for unknown device: $deviceId")
                return
            }
        }

        currentProfiles[deviceId] = updatedProfile
        _connectionProfiles.value = currentProfiles
        saveConnectionProfiles()

        Log.d(TAG, "Recorded connection success for $deviceId at $ip:$port")
    }

    /**
     * Records a failed connection attempt to a device at the given address.
     */
    fun recordConnectionFailure(deviceId: String, ip: String) {
        val now = Clock.System.now()
        val currentProfiles = _connectionProfiles.value.toMutableMap()

        val existingProfile = currentProfiles[deviceId]
        if (existingProfile != null) {
            currentProfiles[deviceId] = existingProfile.withFailedConnection(ip, now)
            _connectionProfiles.value = currentProfiles
            saveConnectionProfiles()
            Log.d(TAG, "Recorded connection failure for $deviceId at $ip")
        }
    }

    /**
     * Records a successful sync completion with a device.
     * Updates only the lastSuccessfulSync timestamp without affecting connection statistics.
     * Called after data has been successfully exchanged, not just when connection is established.
     */
    fun recordSyncSuccess(deviceId: String) {
        val now = Clock.System.now()
        val currentProfiles = _connectionProfiles.value.toMutableMap()

        val existingProfile = currentProfiles[deviceId]
        if (existingProfile != null) {
            currentProfiles[deviceId] = existingProfile.copy(
                connectionStats = existingProfile.connectionStats.copy(lastSuccessfulSync = now)
            )
            _connectionProfiles.value = currentProfiles
            saveConnectionProfiles()
            Log.d(TAG, "Recorded sync success for $deviceId at $now")
        }
    }

    /**
     * Updates the reconnect time statistic for a device.
     */
    fun recordReconnectTime(deviceId: String, durationMs: Long) {
        val currentProfiles = _connectionProfiles.value.toMutableMap()
        val existingProfile = currentProfiles[deviceId]

        if (existingProfile != null) {
            currentProfiles[deviceId] = existingProfile.copy(
                connectionStats = existingProfile.connectionStats.withReconnectTime(durationMs)
            )
            _connectionProfiles.value = currentProfiles
            saveConnectionProfiles()
        }
    }

    /**
     * Ensures a connection profile exists for a device.
     * Called when a device is added to the trusted list.
     */
    fun ensureConnectionProfile(deviceInfo: DeviceInfo) {
        if (_connectionProfiles.value.containsKey(deviceInfo.id)) return

        val currentProfiles = _connectionProfiles.value.toMutableMap()
        currentProfiles[deviceInfo.id] = DeviceConnectionProfile(
            deviceId = deviceInfo.id,
            deviceInfo = deviceInfo
        )
        _connectionProfiles.value = currentProfiles
        saveConnectionProfiles()

        Log.d(TAG, "Created connection profile for ${deviceInfo.name}")
    }

    /**
     * Removes the connection profile for a device.
     * Called when a device is removed from the trusted list.
     */
    fun removeConnectionProfile(deviceId: String) {
        val currentProfiles = _connectionProfiles.value.toMutableMap()
        if (currentProfiles.remove(deviceId) != null) {
            _connectionProfiles.value = currentProfiles
            saveConnectionProfiles()
            Log.d(TAG, "Removed connection profile for $deviceId")
        }
    }

    private fun loadConnectionProfiles() {
        val json = prefs.getString(KEY_CONNECTION_PROFILES, null)
        if (json != null) {
            try {
                val profiles = SyncJson.json.decodeFromString(
                    MapSerializer(String.serializer(), DeviceConnectionProfile.serializer()),
                    json
                )
                _connectionProfiles.value = profiles
                Log.i(TAG, "Loaded ${profiles.size} connection profiles")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to load connection profiles", e)
            }
        }

        // Migrate: Create profiles for trusted devices that don't have one
        migrateConnectionProfiles()
    }

    private fun migrateConnectionProfiles() {
        val currentProfiles = _connectionProfiles.value.toMutableMap()
        var migrated = 0

        for (device in _trustedDevices.value) {
            if (!currentProfiles.containsKey(device.id)) {
                currentProfiles[device.id] = DeviceConnectionProfile(
                    deviceId = device.id,
                    deviceInfo = device
                )
                migrated++
            }
        }

        if (migrated > 0) {
            _connectionProfiles.value = currentProfiles
            saveConnectionProfiles()
            Log.i(TAG, "Migrated $migrated trusted devices to connection profiles")
        }
    }

    private fun saveConnectionProfiles() {
        try {
            val json = SyncJson.json.encodeToString(
                MapSerializer(String.serializer(), DeviceConnectionProfile.serializer()),
                _connectionProfiles.value
            )
            prefs.edit().putString(KEY_CONNECTION_PROFILES, json).apply()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to save connection profiles", e)
        }
    }
}

/**
 * Internal data structure for device tokens.
 */
@Serializable
private data class DeviceToken(
    val deviceId: String,
    val deviceType: String,
    val issuedAtUtc: Instant,
    val networkId: String
)
