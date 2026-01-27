package com.club.medlems.network

import android.util.Log
import com.club.medlems.data.sync.SyncEntities
import com.club.medlems.data.sync.SyncJson
import com.club.medlems.data.sync.SyncPayload
import com.club.medlems.data.sync.SyncPullRequest
import com.club.medlems.data.sync.SyncResponse
import com.club.medlems.data.sync.SyncResponseStatus
import com.club.medlems.data.sync.SyncSchemaVersion
import com.club.medlems.data.sync.SyncStatusResponse
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.engine.cio.CIO
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.delay
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.math.pow
import kotlin.time.Duration.Companion.seconds

/**
 * HTTP client for making sync requests to peer devices.
 * 
 * Features:
 * - Automatic retry with exponential backoff
 * - JWT authentication
 * - Schema version validation
 * 
 * @see [design.md FR-18] - Sync API Protocol Specification
 */
@Singleton
class SyncClient @Inject constructor(
    private val trustManager: TrustManager
) {
    companion object {
        private const val TAG = "SyncClient"
        private const val DEFAULT_TIMEOUT_MS = 30_000L
        private const val MAX_RETRIES = 3
        private const val BASE_DELAY_MS = 1000L
    }
    
    private val client = HttpClient(CIO) {
        install(ContentNegotiation) {
            json(SyncJson.json)
        }
        install(HttpTimeout) {
            requestTimeoutMillis = DEFAULT_TIMEOUT_MS
            connectTimeoutMillis = DEFAULT_TIMEOUT_MS
            socketTimeoutMillis = DEFAULT_TIMEOUT_MS
        }
    }
    
    /**
     * Checks the health and schema version of a peer device.
     * 
     * @param baseUrl The base URL of the peer device
     * @return SyncStatusResponse or null if request fails
     */
    suspend fun checkStatus(baseUrl: String): SyncStatusResponse? {
        val fullUrl = "$baseUrl/api/sync/status"
        Log.d(TAG, "checkStatus: Requesting $fullUrl")
        return try {
            val response = client.get(fullUrl)
            Log.d(TAG, "checkStatus: Response status = ${response.status}")
            if (response.status.isSuccess()) {
                val bodyText = response.bodyAsText()
                Log.d(TAG, "checkStatus: Response body = $bodyText")
                try {
                    SyncJson.json.decodeFromString<SyncStatusResponse>(bodyText)
                } catch (parseEx: Exception) {
                    Log.e(TAG, "checkStatus: Failed to parse response: ${parseEx.message}", parseEx)
                    null
                }
            } else {
                Log.w(TAG, "Status check failed: ${response.status}")
                null
            }
        } catch (e: Exception) {
            Log.e(TAG, "checkStatus: Error at $fullUrl - ${e::class.simpleName}: ${e.message}", e)
            null
        }
    }
    
    /**
     * Pulls changes from a peer device since the given timestamp.
     * Includes automatic retry with exponential backoff.
     * 
     * @param baseUrl The base URL of the peer device
     * @param since The timestamp to pull changes from
     * @return SyncResponse with entities, or error response
     */
    suspend fun pullChanges(
        baseUrl: String,
        since: Instant
    ): SyncResponse {
        // Use persistent token if available, otherwise generate a device token for local network sync
        val authToken = trustManager.getPersistentToken() 
            ?: trustManager.generateDeviceToken(trustManager.getThisDeviceInfo() 
                ?: return SyncResponse(
                    status = SyncResponseStatus.UNAUTHORIZED,
                    timestamp = Clock.System.now(),
                    errorMessage = "Device not configured"
                ))
        
        return withRetry(MAX_RETRIES) {
            val request = SyncPullRequest(
                since = since,
                deviceId = trustManager.getThisDeviceId(),
                schemaVersion = SyncSchemaVersion.version
            )
            
            val response = client.post("$baseUrl/api/sync/pull") {
                header("Authorization", "Bearer $authToken")
                contentType(ContentType.Application.Json)
                setBody(request)
            }
            
            if (response.status.isSuccess()) {
                response.body<SyncResponse>()
            } else {
                Log.w(TAG, "Pull failed: ${response.status}")
                SyncResponse(
                    status = when (response.status.value) {
                        401 -> SyncResponseStatus.UNAUTHORIZED
                        409 -> SyncResponseStatus.UPGRADE_REQUIRED
                        else -> SyncResponseStatus.ERROR
                    },
                    timestamp = Clock.System.now(),
                    errorMessage = "HTTP ${response.status.value}"
                )
            }
        }
    }
    
    /**
     * Pushes local changes to a peer device.
     * Includes automatic retry with exponential backoff.
     * 
     * @param baseUrl The base URL of the peer device
     * @param entities The entities to push
     * @return SyncResponse with result
     */
    suspend fun pushChanges(
        baseUrl: String,
        entities: SyncEntities,
        outboxIds: List<String> = emptyList()
    ): SyncResponse {
        // Use persistent token if available, otherwise generate a device token for local network sync
        val authToken = trustManager.getPersistentToken()
            ?: trustManager.generateDeviceToken(trustManager.getThisDeviceInfo()
                ?: return SyncResponse(
                    status = SyncResponseStatus.UNAUTHORIZED,
                    timestamp = Clock.System.now(),
                    errorMessage = "Device not configured"
                ))

        return withRetry(MAX_RETRIES) {
            val payload = SyncPayload(
                schemaVersion = SyncSchemaVersion.version,
                deviceId = trustManager.getThisDeviceId(),
                timestamp = Clock.System.now(),
                entities = entities,
                outboxIds = outboxIds
            )
            
            val response = client.post("$baseUrl/api/sync/push") {
                header("Authorization", "Bearer $authToken")
                contentType(ContentType.Application.Json)
                setBody(payload)
            }
            
            if (response.status.isSuccess()) {
                response.body<SyncResponse>()
            } else {
                Log.w(TAG, "Push failed: ${response.status}")
                SyncResponse(
                    status = when (response.status.value) {
                        401 -> SyncResponseStatus.UNAUTHORIZED
                        409 -> SyncResponseStatus.UPGRADE_REQUIRED
                        else -> SyncResponseStatus.ERROR
                    },
                    timestamp = Clock.System.now(),
                    errorMessage = "HTTP ${response.status.value}"
                )
            }
        }
    }
    
    /**
     * Performs a full bidirectional sync with a peer device.
     * 
     * @param baseUrl The base URL of the peer device
     * @param localEntities Local changes to push
     * @param since Timestamp to pull remote changes from
     * @return Pair of (push result, pull result)
     */
    suspend fun bidirectionalSync(
        baseUrl: String,
        localEntities: SyncEntities,
        since: Instant
    ): Pair<SyncResponse, SyncResponse> {
        // First push our changes
        val pushResult = pushChanges(baseUrl, localEntities)
        
        // Then pull their changes
        val pullResult = pullChanges(baseUrl, since)
        
        return Pair(pushResult, pullResult)
    }

    /**
     * Pairs with a laptop device using a 6-digit pairing code.
     * On success, stores the persistent auth token for future requests.
     * 
     * @param baseUrl The base URL of the laptop device
     * @param pairingCode The 6-digit pairing code shown on the laptop
     * @return PairingResult with success or error details
     */
    suspend fun pairWithDevice(
        baseUrl: String,
        pairingCode: String
    ): PairingResult {
        Log.d(TAG, "pairWithDevice: Attempting to pair with $baseUrl using code $pairingCode")
        
        val deviceInfo = trustManager.getThisDeviceInfo()
            ?: return PairingResult(
                success = false,
                errorMessage = "Device not configured - please set device name first"
            )
        
        return try {
            // Use the proper PairingRequest format expected by the server
            val request = com.club.medlems.data.sync.PairingRequest(
                trustToken = pairingCode,
                device = deviceInfo
            )

            val response = client.post("$baseUrl/api/pair") {
                contentType(ContentType.Application.Json)
                setBody(SyncJson.json.encodeToString(com.club.medlems.data.sync.PairingRequest.serializer(), request))
            }
            
            val responseText = response.bodyAsText()
            Log.d(TAG, "pairWithDevice: Response status=${response.status}, body=$responseText")
            
            when (response.status.value) {
                200 -> {
                    val pairingResponse = SyncJson.json.decodeFromString<com.club.medlems.data.sync.PairingResponse>(responseText)
                    // Store the persistent token
                    if (pairingResponse.authToken != null) {
                        trustManager.savePersistentToken(pairingResponse.authToken)
                    }
                    // Add all trusted devices from the response
                    var pairedDeviceName = "Enhed"
                    for (device in pairingResponse.trustedDevices) {
                        // Skip ourselves
                        if (device.id == trustManager.getThisDeviceId()) continue
                        // Add to trusted devices
                        trustManager.addTrustedDevice(device.copy(
                            lastSeenUtc = Clock.System.now(),
                            pairedAtUtc = device.pairedAtUtc ?: Clock.System.now(),
                            isTrusted = true
                        ))
                        // First non-self device is likely the one we just paired with
                        if (pairedDeviceName == "Enhed") {
                            pairedDeviceName = device.name
                        }
                    }
                    Log.i(TAG, "Successfully paired with $pairedDeviceName")
                    PairingResult(success = true, deviceName = pairedDeviceName)
                }
                401 -> {
                    val errorResponse = try {
                        SyncJson.json.decodeFromString<ErrorResponse>(responseText)
                    } catch (_: Exception) {
                        ErrorResponse("Invalid pairing code")
                    }
                    Log.w(TAG, "Pairing failed: ${errorResponse.error}")
                    PairingResult(
                        success = false,
                        errorMessage = errorResponse.error,
                        isRateLimited = errorResponse.error.contains("for mange forsøg", ignoreCase = true)
                    )
                }
                429 -> {
                    Log.w(TAG, "Pairing rate limited")
                    PairingResult(
                        success = false,
                        errorMessage = "For mange forsøg - vent venligst",
                        isRateLimited = true
                    )
                }
                else -> {
                    Log.w(TAG, "Pairing failed with status ${response.status}")
                    PairingResult(
                        success = false,
                        errorMessage = "Fejl: HTTP ${response.status.value}"
                    )
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "pairWithDevice: Error", e)
            PairingResult(
                success = false,
                errorMessage = "Netværksfejl: ${e.message}"
            )
        }
    }
    
    /**
     * Executes a block with exponential backoff retry.
     */
    private suspend fun <T> withRetry(
        maxRetries: Int,
        block: suspend () -> T
    ): T {
        var lastException: Exception? = null
        
        repeat(maxRetries) { attempt ->
            try {
                return block()
            } catch (e: Exception) {
                lastException = e
                if (attempt < maxRetries - 1) {
                    val delayMs = BASE_DELAY_MS * 2.0.pow(attempt).toLong()
                    Log.w(TAG, "Retry attempt ${attempt + 1}/$maxRetries after ${delayMs}ms", e)
                    delay(delayMs)
                }
            }
        }
        
        throw lastException ?: IllegalStateException("Retry failed without exception")
    }
    
    /**
     * Closes the HTTP client.
     */
    fun close() {
        client.close()
    }
}

/**
 * Request body for pairing with a laptop.
 */
/**
 * Error response from failed requests.
 */
@kotlinx.serialization.Serializable
data class ErrorResponse(
    val error: String
)

/**
 * Result of a pairing attempt.
 */
data class PairingResult(
    val success: Boolean,
    val errorMessage: String? = null,
    val isRateLimited: Boolean = false,
    val deviceName: String? = null
)
