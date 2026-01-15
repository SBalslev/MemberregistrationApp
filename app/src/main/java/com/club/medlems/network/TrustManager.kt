package com.club.medlems.network

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
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
        private const val KEY_NETWORK_ID = "network_id"
        private const val KEY_THIS_DEVICE_ID = "this_device_id"
        private const val KEY_THIS_DEVICE_INFO = "this_device_info"
        private const val KEY_PERSISTENT_TOKEN = "persistent_token"
        private const val TOKEN_BYTES = 48 // 384-bit tokens
    }
    
    private val secureRandom = SecureRandom()
    private val prefs: SharedPreferences by lazy { createEncryptedPrefs() }
    
    private val _trustedDevices = MutableStateFlow<List<DeviceInfo>>(emptyList())
    val trustedDevices: StateFlow<List<DeviceInfo>> = _trustedDevices.asStateFlow()
    
    init {
        loadTrustedDevices()
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
    }
    
    /**
     * Removes a device from the trusted devices list (revokes trust).
     */
    fun revokeTrust(deviceId: String) {
        val currentList = _trustedDevices.value.toMutableList()
        val device = currentList.find { it.id == deviceId }
        
        if (device != null) {
            val revokedDevice = device.copy(isTrusted = false)
            val index = currentList.indexOf(device)
            currentList[index] = revokedDevice
            _trustedDevices.value = currentList
            saveTrustedDevices()
            Log.i(TAG, "Revoked trust for device: ${device.name}")
        }
    }
    
    /**
     * Gets all trusted devices.
     */
    fun getTrustedDevices(): List<DeviceInfo> {
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
                _trustedDevices.value = devices
                Log.i(TAG, "Loaded ${devices.size} trusted devices")
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
