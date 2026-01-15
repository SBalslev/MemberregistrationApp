package com.club.medlems.network

import android.content.Context
import android.util.Log
import com.club.medlems.data.sync.DeviceInfo
import com.club.medlems.data.sync.DeviceType
import com.club.medlems.data.sync.PairingRequest
import com.club.medlems.data.sync.PairingResponse
import com.club.medlems.data.sync.SyncEntities
import com.club.medlems.data.sync.SyncJson
import com.club.medlems.data.sync.SyncPayload
import com.club.medlems.data.sync.SyncPullRequest
import com.club.medlems.data.sync.SyncRepository
import com.club.medlems.data.sync.SyncResponse
import com.club.medlems.data.sync.SyncResponseStatus
import com.club.medlems.data.sync.SyncSchemaVersion
import com.club.medlems.data.sync.SyncStatusResponse
import dagger.hilt.android.qualifiers.ApplicationContext
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.Application
import io.ktor.server.application.call
import io.ktor.server.application.install
import io.ktor.server.cio.CIO
import io.ktor.server.cio.CIOApplicationEngine
import io.ktor.server.engine.embeddedServer
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.response.respondText
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.routing
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Embedded HTTP server for the sync API.
 * Provides endpoints for device pairing and data synchronization.
 * 
 * Endpoints:
 * - GET /api/sync/status - Health check and schema version
 * - POST /api/pair - Device pairing handshake
 * - POST /api/sync/push - Receive entity changes from peers
 * - GET /api/sync/pull - Send changes since timestamp
 * 
 * @see [design.md FR-18] - Sync API Protocol Specification
 */
@Singleton
class SyncApiServer @Inject constructor(
    @ApplicationContext private val context: Context,
    private val trustManager: TrustManager,
    private val syncRepository: SyncRepository
) {
    companion object {
        private const val TAG = "SyncApiServer"
        const val DEFAULT_PORT = 8085  // Changed from 8080 to avoid conflicts
        private const val CONNECTION_TIMEOUT_SECONDS = 30
    }
    
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var server: CIOApplicationEngine? = null
    
    private val _serverState = MutableStateFlow(ServerState.STOPPED)
    val serverState: StateFlow<ServerState> = _serverState.asStateFlow()
    
    private var currentDeviceInfo: DeviceInfo? = null
    private var currentNetworkId: String? = null
    
    // Callback for when a new device pairs successfully
    var onDevicePaired: ((DeviceInfo) -> Unit)? = null
    
    // Pending pairing tokens (token -> PairingQrCode data)
    private val pendingPairingTokens = mutableMapOf<String, PendingPairing>()
    
    /**
     * Starts the sync API server.
     * 
     * @param deviceInfo Information about this device
     * @param networkId The network identifier for pairing verification
     * @param port Port to listen on (default 8080)
     */
    fun start(
        deviceInfo: DeviceInfo,
        networkId: String,
        port: Int = DEFAULT_PORT
    ): Result<Unit> {
        if (server != null) {
            Log.w(TAG, "Server already running, stopping first")
            stop()
        }
        
        return try {
            _serverState.value = ServerState.STARTING
            currentDeviceInfo = deviceInfo
            currentNetworkId = networkId
            
            server = embeddedServer(CIO, port = port) {
                configureServer()
            }
            
            scope.launch {
                try {
                    server?.start(wait = false)
                    _serverState.value = ServerState.RUNNING
                    Log.i(TAG, "Sync API server started on port $port")
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to start server", e)
                    _serverState.value = ServerState.ERROR
                }
            }
            
            Result.success(Unit)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to create server", e)
            _serverState.value = ServerState.ERROR
            Result.failure(e)
        }
    }
    
    /**
     * Stops the sync API server.
     */
    fun stop() {
        try {
            server?.stop(1000, 2000)
            server = null
            _serverState.value = ServerState.STOPPED
            pendingPairingTokens.clear()
            Log.i(TAG, "Sync API server stopped")
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping server", e)
        }
    }
    
    /**
     * Registers a pending pairing token (generated from QR code).
     * The token is valid until it expires or is used.
     * 
     * @param token The trust token from the QR code
     * @param expectedDeviceType The device type expected to use this token
     * @param deviceName The name to assign to the device
     * @param expiresAtMillis When this token expires
     */
    fun registerPendingPairing(
        token: String,
        expectedDeviceType: DeviceType,
        deviceName: String,
        expiresAtMillis: Long
    ) {
        pendingPairingTokens[token] = PendingPairing(
            token = token,
            expectedDeviceType = expectedDeviceType,
            deviceName = deviceName,
            expiresAtMillis = expiresAtMillis
        )
        Log.d(TAG, "Registered pending pairing for $deviceName")
    }
    
    /**
     * Cleans up expired pending pairing tokens.
     */
    private fun cleanupExpiredTokens() {
        val now = System.currentTimeMillis()
        val expired = pendingPairingTokens.filterValues { it.expiresAtMillis < now }
        expired.keys.forEach { pendingPairingTokens.remove(it) }
        if (expired.isNotEmpty()) {
            Log.d(TAG, "Cleaned up ${expired.size} expired pairing tokens")
        }
    }
    
    private fun Application.configureServer() {
        install(ContentNegotiation) {
            json(SyncJson.json)
        }
        
        routing {
            // Health check and status endpoint
            get("/api/sync/status") {
                val deviceInfo = currentDeviceInfo
                if (deviceInfo == null) {
                    call.respond(HttpStatusCode.ServiceUnavailable, "Server not configured")
                    return@get
                }
                
                val response = SyncStatusResponse(
                    isHealthy = true,
                    schemaVersion = SyncSchemaVersion.version,
                    device = deviceInfo,
                    pendingChangesCount = 0,
                    lastSyncTimestamp = null
                )
                call.respond(response)
            }
            
            // Device pairing handshake endpoint
            post("/api/pair") {
                cleanupExpiredTokens()
                val now = Clock.System.now()
                
                val request = try {
                    call.receive<PairingRequest>()
                } catch (e: Exception) {
                    Log.w(TAG, "Invalid pairing request", e)
                    call.respond(
                        HttpStatusCode.BadRequest,
                        PairingResponse.failure(
                            errorMessage = "Invalid request format",
                            timestamp = now
                        )
                    )
                    return@post
                }
                
                // Validate trust token
                val pendingPairing = pendingPairingTokens[request.trustToken]
                if (pendingPairing == null) {
                    Log.w(TAG, "Unknown or expired trust token")
                    call.respond(
                        HttpStatusCode.Unauthorized,
                        PairingResponse.failure(
                            errorMessage = "Invalid or expired trust token",
                            timestamp = now
                        )
                    )
                    return@post
                }
                
                // Check token expiration
                if (pendingPairing.expiresAtMillis < System.currentTimeMillis()) {
                    pendingPairingTokens.remove(request.trustToken)
                    Log.w(TAG, "Trust token expired")
                    call.respond(
                        HttpStatusCode.Unauthorized,
                        PairingResponse.failure(
                            errorMessage = "Trust token has expired",
                            timestamp = now
                        )
                    )
                    return@post
                }
                
                // Verify device type matches expected
                if (request.device.type != pendingPairing.expectedDeviceType) {
                    Log.w(TAG, "Device type mismatch: expected ${pendingPairing.expectedDeviceType}, got ${request.device.type}")
                    call.respond(
                        HttpStatusCode.Forbidden,
                        PairingResponse.failure(
                            errorMessage = "Device type does not match expected type",
                            timestamp = now
                        )
                    )
                    return@post
                }
                
                // Check schema compatibility
                if (!SyncSchemaVersion.isCompatible(request.schemaVersion)) {
                    Log.w(TAG, "Schema version incompatible: ${request.schemaVersion}")
                    call.respond(
                        HttpStatusCode.Conflict,
                        PairingResponse.failure(
                            errorMessage = "Schema version ${request.schemaVersion} is not compatible with ${SyncSchemaVersion.version}",
                            timestamp = now
                        )
                    )
                    return@post
                }
                
                // Generate persistent JWT for this device
                val persistentJwt = trustManager.generateDeviceToken(request.device)
                
                // Add device to trusted list
                val pairedDevice = request.device.copy(
                    name = pendingPairing.deviceName, // Use name from QR code
                    pairedAtUtc = Clock.System.now(),
                    isTrusted = true
                )
                trustManager.addTrustedDevice(pairedDevice)
                
                // Remove used token
                pendingPairingTokens.remove(request.trustToken)
                
                // Get list of other trusted devices for trust propagation
                val trustedDevices = trustManager.getTrustedDevices()
                
                Log.i(TAG, "Device paired successfully: ${pairedDevice.name} (${pairedDevice.id})")
                
                // Notify callback
                onDevicePaired?.invoke(pairedDevice)
                
                call.respond(
                    PairingResponse.success(
                        authToken = persistentJwt,
                        networkId = currentNetworkId ?: "",
                        trustedDevices = trustedDevices,
                        timestamp = now
                    )
                )
            }
            
            // Pull endpoint - peer requests changes since timestamp
            post("/api/sync/pull") {
                val authHeader = call.request.headers["Authorization"]
                val deviceId = validateAuthHeader(authHeader)
                if (deviceId == null) {
                    call.respond(
                        HttpStatusCode.Unauthorized,
                        SyncResponse(
                            status = SyncResponseStatus.UNAUTHORIZED,
                            timestamp = Clock.System.now(),
                            errorMessage = "Invalid or missing authorization"
                        )
                    )
                    return@post
                }
                
                val request = try {
                    call.receive<SyncPullRequest>()
                } catch (e: Exception) {
                    call.respond(
                        HttpStatusCode.BadRequest,
                        SyncResponse(
                            status = SyncResponseStatus.ERROR,
                            timestamp = Clock.System.now(),
                            errorMessage = "Invalid request format"
                        )
                    )
                    return@post
                }
                
                // Collect changes since the requested timestamp
                val thisDeviceId = currentDeviceInfo?.id ?: ""
                val entities = syncRepository.collectChangesSince(request.since, thisDeviceId)
                
                // Return a SyncPayload with the entities
                call.respond(
                    SyncPayload(
                        deviceId = thisDeviceId,
                        entities = entities,
                        timestamp = Clock.System.now(),
                        schemaVersion = SyncSchemaVersion.version
                    )
                )
            }
            
            // Push endpoint - peer sends changes to us
            post("/api/sync/push") {
                val authHeader = call.request.headers["Authorization"]
                val deviceId = validateAuthHeader(authHeader)
                if (deviceId == null) {
                    call.respond(
                        HttpStatusCode.Unauthorized,
                        SyncResponse(
                            status = SyncResponseStatus.UNAUTHORIZED,
                            timestamp = Clock.System.now(),
                            errorMessage = "Invalid or missing authorization"
                        )
                    )
                    return@post
                }
                
                val payload = try {
                    call.receive<SyncPayload>()
                } catch (e: Exception) {
                    call.respond(
                        HttpStatusCode.BadRequest,
                        SyncResponse(
                            status = SyncResponseStatus.ERROR,
                            timestamp = Clock.System.now(),
                            errorMessage = "Invalid payload format"
                        )
                    )
                    return@post
                }
                
                // Verify schema compatibility
                if (!SyncSchemaVersion.isCompatible(payload.schemaVersion)) {
                    call.respond(
                        HttpStatusCode.Conflict,
                        SyncResponse(
                            status = SyncResponseStatus.UPGRADE_REQUIRED,
                            timestamp = Clock.System.now(),
                            errorMessage = "Schema version incompatible"
                        )
                    )
                    return@post
                }
                
                // Apply the sync payload
                val result = syncRepository.applySyncPayload(payload, deviceId)
                
                val status = if (result.hasConflicts) {
                    SyncResponseStatus.CONFLICT
                } else {
                    SyncResponseStatus.OK
                }
                
                call.respond(
                    SyncResponse(
                        status = status,
                        timestamp = Clock.System.now(),
                        acceptedCount = result.totalProcessed,
                        conflicts = result.conflicts
                    )
                )
            }
        }
    }
    
    /**
     * Validates the Authorization header and returns the device ID if valid.
     */
    private fun validateAuthHeader(authHeader: String?): String? {
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            return null
        }
        val token = authHeader.removePrefix("Bearer ")
        return trustManager.validateDeviceToken(token)
    }
}

/**
 * Represents a pending pairing request.
 */
data class PendingPairing(
    val token: String,
    val expectedDeviceType: DeviceType,
    val deviceName: String,
    val expiresAtMillis: Long
)

/**
 * State of the sync API server.
 */
enum class ServerState {
    STOPPED,
    STARTING,
    RUNNING,
    ERROR
}
