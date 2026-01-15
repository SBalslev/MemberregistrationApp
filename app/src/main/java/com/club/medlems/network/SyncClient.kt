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
        return try {
            val response = client.get("$baseUrl/api/sync/status")
            if (response.status.isSuccess()) {
                response.body<SyncStatusResponse>()
            } else {
                Log.w(TAG, "Status check failed: ${response.status}")
                null
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error checking status at $baseUrl", e)
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
        val authToken = trustManager.getPersistentToken()
        if (authToken == null) {
            return SyncResponse(
                status = SyncResponseStatus.UNAUTHORIZED,
                timestamp = Clock.System.now(),
                errorMessage = "Not authenticated - no persistent token"
            )
        }
        
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
        entities: SyncEntities
    ): SyncResponse {
        val authToken = trustManager.getPersistentToken()
        if (authToken == null) {
            return SyncResponse(
                status = SyncResponseStatus.UNAUTHORIZED,
                timestamp = Clock.System.now(),
                errorMessage = "Not authenticated - no persistent token"
            )
        }
        
        return withRetry(MAX_RETRIES) {
            val payload = SyncPayload(
                schemaVersion = SyncSchemaVersion.version,
                deviceId = trustManager.getThisDeviceId(),
                timestamp = Clock.System.now(),
                entities = entities
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
