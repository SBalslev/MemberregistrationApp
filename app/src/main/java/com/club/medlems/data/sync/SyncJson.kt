package com.club.medlems.data.sync

import kotlinx.serialization.json.Json
import kotlinx.serialization.modules.SerializersModule
import kotlinx.serialization.modules.contextual

/**
 * JSON serialization configuration for sync protocol.
 * Configured for cross-platform compatibility with the laptop PWA.
 *
 * @see [design.md FR-18.4] - Sync payloads SHALL use JSON format
 */
object SyncJson {
    
    /**
     * JSON configuration optimized for sync payloads.
     *
     * - ignoreUnknownKeys: Allows forward compatibility with newer schema versions
     * - encodeDefaults: Ensures consistent payload structure
     * - isLenient: Tolerates minor format differences across platforms
     * - prettyPrint: Disabled for smaller payloads (enable for debugging)
     */
    val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
        isLenient = true
        prettyPrint = false
        coerceInputValues = true
    }
    
    /**
     * JSON configuration with pretty printing for debugging/logging.
     */
    val debugJson = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
        isLenient = true
        prettyPrint = true
        coerceInputValues = true
    }
    
    /**
     * Serialize a SyncPayload to JSON string.
     */
    fun encodePayload(payload: SyncPayload): String {
        return json.encodeToString(SyncPayload.serializer(), payload)
    }
    
    /**
     * Deserialize JSON string to SyncPayload.
     */
    fun decodePayload(jsonString: String): SyncPayload {
        return json.decodeFromString(SyncPayload.serializer(), jsonString)
    }
    
    /**
     * Serialize a SyncResponse to JSON string.
     */
    fun encodeResponse(response: SyncResponse): String {
        return json.encodeToString(SyncResponse.serializer(), response)
    }
    
    /**
     * Deserialize JSON string to SyncResponse.
     */
    fun decodeResponse(jsonString: String): SyncResponse {
        return json.decodeFromString(SyncResponse.serializer(), jsonString)
    }
    
    /**
     * Serialize a SyncPullRequest to JSON string.
     */
    fun encodePullRequest(request: SyncPullRequest): String {
        return json.encodeToString(SyncPullRequest.serializer(), request)
    }
    
    /**
     * Deserialize JSON string to SyncPullRequest.
     */
    fun decodePullRequest(jsonString: String): SyncPullRequest {
        return json.decodeFromString(SyncPullRequest.serializer(), jsonString)
    }
    
    /**
     * Serialize a SyncStatusResponse to JSON string.
     */
    fun encodeStatusResponse(response: SyncStatusResponse): String {
        return json.encodeToString(SyncStatusResponse.serializer(), response)
    }
    
    /**
     * Deserialize JSON string to SyncStatusResponse.
     */
    fun decodeStatusResponse(jsonString: String): SyncStatusResponse {
        return json.decodeFromString(SyncStatusResponse.serializer(), jsonString)
    }
    
    /**
     * Serialize a DeviceInfo to JSON string (for QR code pairing).
     */
    fun encodeDeviceInfo(deviceInfo: DeviceInfo): String {
        return json.encodeToString(DeviceInfo.serializer(), deviceInfo)
    }
    
    /**
     * Deserialize JSON string to DeviceInfo.
     */
    fun decodeDeviceInfo(jsonString: String): DeviceInfo {
        return json.decodeFromString(DeviceInfo.serializer(), jsonString)
    }
}
