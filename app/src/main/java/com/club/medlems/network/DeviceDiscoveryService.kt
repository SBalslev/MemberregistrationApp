package com.club.medlems.network

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiManager
import android.util.Log
import com.club.medlems.data.sync.DeviceInfo
import com.club.medlems.data.sync.DeviceType
import com.club.medlems.data.sync.SyncLogManager
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.net.HttpURLConnection
import java.net.Inet4Address
import java.net.InetAddress
import java.net.NetworkInterface
import java.net.URL
import javax.inject.Inject
import javax.inject.Singleton
import javax.jmdns.JmDNS
import javax.jmdns.ServiceEvent
import javax.jmdns.ServiceInfo
import javax.jmdns.ServiceListener

/**
 * Handles mDNS service advertisement and discovery for the distributed sync system.
 * 
 * Service Type: "_medlems-sync._tcp.local."
 * 
 * TXT Records:
 * - deviceId: Unique device identifier
 * - deviceType: MEMBER_TABLET, TRAINER_TABLET, LAPTOP, DISPLAY_EQUIPMENT, DISPLAY_PRACTICE
 * - deviceName: Human-readable device name
 * - schemaVersion: Sync schema version for compatibility
 * - networkId: Network identifier for pairing verification
 */
@Singleton
class DeviceDiscoveryService @Inject constructor(
    @ApplicationContext private val context: Context,
    private val syncLogManager: SyncLogManager
) {
    companion object {
        private const val TAG = "DeviceDiscoveryService"
        private const val SERVICE_TYPE = "_medlemssync._tcp.local."
        private const val SERVICE_TYPE_NSD = "_medlemssync._tcp."
        private const val DEFAULT_PORT = 8085  // Changed from 8080 to avoid conflicts
        private const val STALE_DEVICE_TIMEOUT_MS = 5 * 60 * 1000L // 5 minutes
    }

    private var jmDNS: JmDNS? = null
    private var nsdManager: NsdManager? = null
    private var multicastLock: WifiManager.MulticastLock? = null
    
    private var registeredServiceInfo: ServiceInfo? = null
    private var isAdvertising = false
    private var isDiscovering = false
    private var isNsdDiscovering = false

    private val _discoveredDevices = MutableStateFlow<List<DiscoveredDevice>>(emptyList())
    val discoveredDevices: StateFlow<List<DiscoveredDevice>> = _discoveredDevices.asStateFlow()

    private val _advertisingState = MutableStateFlow(AdvertisingState.STOPPED)
    val advertisingState: StateFlow<AdvertisingState> = _advertisingState.asStateFlow()

    private val _discoveryState = MutableStateFlow(DiscoveryState.STOPPED)
    val discoveryState: StateFlow<DiscoveryState> = _discoveryState.asStateFlow()

    /**
     * Starts advertising this device on the local network via mDNS.
     * 
     * @param deviceInfo Information about this device to advertise
     * @param port The port on which the sync API is listening
     * @param networkId The network ID for pairing verification
     */
    suspend fun startAdvertising(
        deviceInfo: DeviceInfo,
        port: Int = DEFAULT_PORT,
        networkId: String
    ): Result<Unit> {
        if (isAdvertising) {
            Log.w(TAG, "Already advertising, stopping first")
            stopAdvertising()
        }

        return try {
            _advertisingState.value = AdvertisingState.STARTING

            // Acquire multicast lock for mDNS
            acquireMulticastLock()

            val localAddress = getLocalIpAddress()
            if (localAddress == null) {
                _advertisingState.value = AdvertisingState.ERROR
                return Result.failure(IllegalStateException("No local IP address found"))
            }

            Log.d(TAG, "Starting mDNS on address: ${localAddress.hostAddress}")

            jmDNS = JmDNS.create(localAddress, localAddress.hostAddress)

            val txtRecords = mapOf(
                "deviceId" to deviceInfo.id,
                "deviceType" to deviceInfo.type.name,
                "deviceName" to deviceInfo.name,
                "schemaVersion" to com.club.medlems.data.sync.SyncSchemaVersion.version,
                "networkId" to networkId
            )

            val serviceInfo = ServiceInfo.create(
                SERVICE_TYPE,
                deviceInfo.name,
                port,
                0, // weight
                0, // priority
                txtRecords
            )

            jmDNS?.registerService(serviceInfo)
            registeredServiceInfo = serviceInfo
            isAdvertising = true
            _advertisingState.value = AdvertisingState.ADVERTISING

            Log.i(TAG, "Successfully advertising as ${deviceInfo.name} on port $port")
            syncLogManager.info("mDNS", "Advertising as '${deviceInfo.name}' on port $port")
            Result.success(Unit)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start advertising", e)
            syncLogManager.error("mDNS", "Failed to start advertising", e)
            _advertisingState.value = AdvertisingState.ERROR
            releaseMulticastLock()
            Result.failure(e)
        }
    }

    /**
     * Stops advertising this device.
     */
    fun stopAdvertising() {
        try {
            registeredServiceInfo?.let { serviceInfo ->
                jmDNS?.unregisterService(serviceInfo)
            }
            registeredServiceInfo = null
            isAdvertising = false
            _advertisingState.value = AdvertisingState.STOPPED
            Log.i(TAG, "Stopped advertising")
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping advertisement", e)
        }
    }

    /**
     * Starts discovering other devices on the local network.
     * Discovered devices are emitted to the [discoveredDevices] flow.
     * Uses both jmDNS and Android NSD for maximum compatibility.
     */
    fun startDiscovery(): Result<Unit> {
        if (isDiscovering) {
            Log.w(TAG, "Already discovering")
            return Result.success(Unit)
        }

        return try {
            _discoveryState.value = DiscoveryState.STARTING
            _discoveredDevices.value = emptyList()

            // Acquire multicast lock if not already held
            acquireMulticastLock()

            val localAddress = getLocalIpAddress()
            if (localAddress == null) {
                _discoveryState.value = DiscoveryState.ERROR
                return Result.failure(IllegalStateException("No local IP address found"))
            }

            // Start jmDNS discovery
            try {
                if (jmDNS == null) {
                    jmDNS = JmDNS.create(localAddress, localAddress.hostAddress)
                }
                jmDNS?.addServiceListener(SERVICE_TYPE, serviceListener)
                Log.i(TAG, "Started jmDNS discovery for: $SERVICE_TYPE")
                syncLogManager.info("jmDNS", "Started discovery for: $SERVICE_TYPE")
            } catch (e: Exception) {
                Log.e(TAG, "jmDNS discovery failed, continuing with NSD", e)
                syncLogManager.warn("jmDNS", "jmDNS failed: ${e.message}")
            }

            // Also start NSD discovery (Android native mDNS - better cross-platform compatibility)
            try {
                startNsdDiscovery()
            } catch (e: Exception) {
                Log.e(TAG, "NSD discovery failed", e)
                syncLogManager.warn("NSD", "NSD failed: ${e.message}")
            }

            isDiscovering = true
            _discoveryState.value = DiscoveryState.DISCOVERING

            Log.i(TAG, "Started service discovery (jmDNS + NSD)")
            Result.success(Unit)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start discovery", e)
            syncLogManager.error("mDNS", "Failed to start discovery", e)
            _discoveryState.value = DiscoveryState.ERROR
            Result.failure(e)
        }
    }

    /**
     * Starts NSD (Android native mDNS) discovery.
     */
    private fun startNsdDiscovery() {
        if (isNsdDiscovering) return

        nsdManager = context.getSystemService(Context.NSD_SERVICE) as NsdManager
        
        nsdManager?.discoverServices(
            SERVICE_TYPE_NSD,
            NsdManager.PROTOCOL_DNS_SD,
            nsdDiscoveryListener
        )
        isNsdDiscovering = true
        syncLogManager.info("NSD", "Started NSD discovery for: $SERVICE_TYPE_NSD")
    }

    private val nsdDiscoveryListener = object : NsdManager.DiscoveryListener {
        override fun onDiscoveryStarted(serviceType: String) {
            Log.i(TAG, "NSD discovery started for $serviceType")
        }

        override fun onServiceFound(serviceInfo: NsdServiceInfo) {
            Log.d(TAG, "NSD found service: ${serviceInfo.serviceName}")
            syncLogManager.debug("NSD", "Found: ${serviceInfo.serviceName}")
            // Resolve the service to get IP and port
            nsdManager?.resolveService(serviceInfo, createNsdResolveListener())
        }

        override fun onServiceLost(serviceInfo: NsdServiceInfo) {
            Log.d(TAG, "NSD service lost: ${serviceInfo.serviceName}")
            syncLogManager.info("NSD", "Lost: ${serviceInfo.serviceName}")
            removeDevice(serviceInfo.serviceName)
        }

        override fun onDiscoveryStopped(serviceType: String) {
            Log.i(TAG, "NSD discovery stopped")
        }

        override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
            Log.e(TAG, "NSD discovery start failed: $errorCode")
            syncLogManager.error("NSD", "Start failed with code: $errorCode")
        }

        override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {
            Log.e(TAG, "NSD discovery stop failed: $errorCode")
        }
    }

    private fun createNsdResolveListener() = object : NsdManager.ResolveListener {
        override fun onResolveFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
            Log.e(TAG, "NSD resolve failed for ${serviceInfo.serviceName}: $errorCode")
        }

        override fun onServiceResolved(serviceInfo: NsdServiceInfo) {
            Log.i(TAG, "NSD resolved: ${serviceInfo.serviceName} at ${serviceInfo.host}:${serviceInfo.port}")
            syncLogManager.info("NSD", "Resolved: ${serviceInfo.serviceName} at ${serviceInfo.host?.hostAddress}:${serviceInfo.port}")
            addOrUpdateDeviceFromNsd(serviceInfo)
        }
    }

    private fun addOrUpdateDeviceFromNsd(nsdInfo: NsdServiceInfo) {
        val host = nsdInfo.host ?: return
        val port = nsdInfo.port
        val serviceName = nsdInfo.serviceName

        // Skip self-discovery by checking if this is our own IP
        val localAddress = getLocalIpAddress()
        if (localAddress != null && host.hostAddress == localAddress.hostAddress) {
            Log.d(TAG, "NSD: Skipping self-discovery at ${host.hostAddress}")
            syncLogManager.debug("NSD", "Skipping self: ${host.hostAddress}")
            return
        }

        // Extract TXT records (available on Android 5.0+)
        val txtRecords = mutableMapOf<String, String>()
        val attrsCount = nsdInfo.attributes?.size ?: 0
        syncLogManager.debug("NSD", "TXT records count: $attrsCount for $serviceName")
        
        nsdInfo.attributes?.forEach { (key, value) ->
            val strValue = value?.let { String(it) } ?: ""
            txtRecords[key] = strValue
            syncLogManager.debug("NSD", "  TXT: $key = $strValue")
        }

        val deviceId = txtRecords["deviceId"] ?: "nsd-${serviceName.hashCode()}"
        val deviceTypeStr = txtRecords["deviceType"] ?: "LAPTOP"
        val deviceName = txtRecords["deviceName"] ?: serviceName
        val schemaVersion = txtRecords["schemaVersion"] ?: "1.0.0"
        val networkId = txtRecords["networkId"] ?: ""

        val deviceType = try {
            DeviceType.valueOf(deviceTypeStr)
        } catch (e: IllegalArgumentException) {
            Log.w(TAG, "Unknown device type from NSD: $deviceTypeStr, defaulting to LAPTOP")
            DeviceType.LAPTOP
        }

        val device = DiscoveredDevice(
            deviceId = deviceId,
            deviceType = deviceType,
            deviceName = deviceName,
            address = host,
            port = port,
            schemaVersion = schemaVersion,
            networkId = networkId,
            lastSeen = System.currentTimeMillis()
        )

        Log.i(TAG, "NSD discovered device: $deviceName ($deviceType) at ${host.hostAddress}:$port")
        syncLogManager.info("NSD", "Device: $deviceName ($deviceType) at ${host.hostAddress}:$port")

        // Add or update in the list
        val currentList = _discoveredDevices.value.toMutableList()
        val existingIndex = currentList.indexOfFirst { it.deviceId == deviceId }
        if (existingIndex >= 0) {
            currentList[existingIndex] = device
        } else {
            currentList.add(device)
        }
        _discoveredDevices.value = currentList
    }

    /**
     * Stops discovering other devices.
     */
    fun stopDiscovery() {
        try {
            // Stop jmDNS discovery
            jmDNS?.removeServiceListener(SERVICE_TYPE, serviceListener)
            
            // Stop NSD discovery
            if (isNsdDiscovering) {
                try {
                    nsdManager?.stopServiceDiscovery(nsdDiscoveryListener)
                } catch (e: Exception) {
                    Log.e(TAG, "Error stopping NSD discovery", e)
                }
                isNsdDiscovering = false
            }
            
            isDiscovering = false
            _discoveryState.value = DiscoveryState.STOPPED
            Log.i(TAG, "Stopped service discovery")
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping discovery", e)
        }
    }

    /**
     * Shuts down the discovery service completely, releasing all resources.
     */
    fun shutdown() {
        try {
            stopAdvertising()
            stopDiscovery()
            jmDNS?.close()
            jmDNS = null
            nsdManager = null
            releaseMulticastLock()
            _discoveredDevices.value = emptyList()
            Log.i(TAG, "Discovery service shut down")
        } catch (e: Exception) {
            Log.e(TAG, "Error during shutdown", e)
        }
    }

    /**
     * Manually triggers a refresh of discovered devices.
     * Also cleans up stale devices that haven't been seen recently.
     */
    fun refreshDiscovery() {
        if (!isDiscovering) return
        
        try {
            // Clean up stale devices first
            cleanupStaleDevices()
            
            // Request service information for all known services
            jmDNS?.list(SERVICE_TYPE)?.forEach { serviceInfo ->
                addOrUpdateDevice(serviceInfo)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error refreshing discovery", e)
        }
    }

    /**
     * Removes devices that haven't been seen for more than STALE_DEVICE_TIMEOUT_MS.
     */
    fun cleanupStaleDevices() {
        val now = System.currentTimeMillis()
        val currentList = _discoveredDevices.value
        val freshDevices = currentList.filter { device ->
            val age = now - device.lastSeen
            val isStale = age > STALE_DEVICE_TIMEOUT_MS
            if (isStale) {
                Log.i(TAG, "Removing stale device: ${device.deviceName} (last seen ${age / 1000}s ago)")
                syncLogManager.info("Cleanup", "Removed stale: ${device.deviceName}")
            }
            !isStale
        }
        
        if (freshDevices.size != currentList.size) {
            val removed = currentList.size - freshDevices.size
            Log.i(TAG, "Cleaned up $removed stale device(s)")
            _discoveredDevices.value = freshDevices
        }
    }

    /**
     * Scans the local subnet for sync API endpoints.
     * This is a fallback when mDNS discovery fails.
     * Probes common IPs on the same /24 subnet for /api/sync/status.
     */
    suspend fun scanSubnet(): Result<Int> = withContext(Dispatchers.IO) {
        val localAddress = getLocalIpAddress()
        if (localAddress == null) {
            syncLogManager.error("Scan", "No local IP address found")
            return@withContext Result.failure(IllegalStateException("No local IP address found"))
        }

        val localIp = localAddress.hostAddress ?: return@withContext Result.failure(
            IllegalStateException("Could not get host address")
        )
        
        // Get the subnet prefix (first 3 octets)
        val parts = localIp.split(".")
        if (parts.size != 4) {
            return@withContext Result.failure(IllegalStateException("Invalid IP format: $localIp"))
        }
        val subnetPrefix = "${parts[0]}.${parts[1]}.${parts[2]}"
        val myLastOctet = parts[3].toIntOrNull() ?: 0

        syncLogManager.info("Scan", "Scanning subnet $subnetPrefix.0/24 (my IP: $localIp)")
        Log.i(TAG, "Starting subnet scan on $subnetPrefix.0/24")

        var foundCount = 0

        // Scan IPs in parallel, skip our own IP
        coroutineScope {
            val jobs = (1..254).filter { it != myLastOctet }.map { lastOctet ->
                async {
                    val ip = "$subnetPrefix.$lastOctet"
                    probeDevice(ip)
                }
            }
            
            jobs.awaitAll().forEach { device ->
                if (device != null) {
                    foundCount++
                    addDiscoveredDevice(device)
                }
            }
        }

        // Clean up stale devices after scan
        cleanupStaleDevices()

        syncLogManager.info("Scan", "Subnet scan complete. Found $foundCount devices.")
        Log.i(TAG, "Subnet scan complete. Found $foundCount devices.")
        Result.success(foundCount)
    }

    /**
     * Probes a single IP for the sync API.
     * Returns DiscoveredDevice if found, null otherwise.
     */
    private suspend fun probeDevice(ip: String): DiscoveredDevice? = withContext(Dispatchers.IO) {
        try {
            val result = withTimeoutOrNull(1500L) {
                val url = URL("http://$ip:$DEFAULT_PORT/api/sync/status")
                val connection = url.openConnection() as HttpURLConnection
                connection.connectTimeout = 1000
                connection.readTimeout = 1000
                connection.requestMethod = "GET"
                
                try {
                    if (connection.responseCode == 200) {
                        val response = connection.inputStream.bufferedReader().readText()
                        parseStatusResponse(ip, response)
                    } else null
                } finally {
                    connection.disconnect()
                }
            }
            result
        } catch (e: Exception) {
            // Expected for most IPs - no logging needed
            null
        }
    }

    /**
     * Parses a /api/sync/status JSON response into a DiscoveredDevice.
     * Handles both new format (device object) and legacy format (flat fields).
     */
    private fun parseStatusResponse(ip: String, json: String): DiscoveredDevice? {
        return try {
            val jsonObj = Json.parseToJsonElement(json).jsonObject
            
            // Try new format first (device is nested object)
            val deviceObj = jsonObj["device"]?.jsonObject
            
            val deviceId: String
            val deviceTypeStr: String
            val deviceName: String
            
            if (deviceObj != null) {
                // New format: { device: { id, name, type } }
                deviceId = deviceObj["id"]?.jsonPrimitive?.content ?: return null
                deviceTypeStr = deviceObj["type"]?.jsonPrimitive?.content ?: "LAPTOP"
                deviceName = deviceObj["name"]?.jsonPrimitive?.content ?: "Unknown"
            } else {
                // Legacy format: { deviceId, deviceType, deviceName }
                deviceId = jsonObj["deviceId"]?.jsonPrimitive?.content ?: return null
                deviceTypeStr = jsonObj["deviceType"]?.jsonPrimitive?.content ?: "LAPTOP"
                deviceName = jsonObj["deviceName"]?.jsonPrimitive?.content ?: "Unknown"
            }
            
            val schemaVersion = jsonObj["schemaVersion"]?.jsonPrimitive?.content ?: "1.0.0"
            
            val deviceType = try {
                DeviceType.valueOf(deviceTypeStr)
            } catch (e: IllegalArgumentException) {
                Log.w(TAG, "Unknown device type: $deviceTypeStr, defaulting to LAPTOP")
                DeviceType.LAPTOP
            }

            val device = DiscoveredDevice(
                deviceId = deviceId,
                deviceType = deviceType,
                deviceName = deviceName,
                address = InetAddress.getByName(ip),
                port = DEFAULT_PORT,
                schemaVersion = schemaVersion,
                networkId = "",
                lastSeen = System.currentTimeMillis()
            )
            
            Log.i(TAG, "Subnet scan found: $deviceName at $ip:$DEFAULT_PORT")
            syncLogManager.info("Scan", "Found: $deviceName ($deviceType) at $ip")
            device
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse status response from $ip", e)
            null
        }
    }

    /**
     * Adds a device to the discovered devices list.
     */
    private fun addDiscoveredDevice(device: DiscoveredDevice) {
        val currentList = _discoveredDevices.value.toMutableList()
        val existingIndex = currentList.indexOfFirst { it.deviceId == device.deviceId }
        if (existingIndex >= 0) {
            currentList[existingIndex] = device
        } else {
            currentList.add(device)
        }
        _discoveredDevices.value = currentList
    }

    private val serviceListener = object : ServiceListener {
        override fun serviceAdded(event: ServiceEvent) {
            Log.d(TAG, "Service added: ${event.name}")
            syncLogManager.debug("mDNS", "Service added: ${event.name} (type: ${event.type})")
            // Request more info about the service
            jmDNS?.requestServiceInfo(event.type, event.name, 3000)
        }

        override fun serviceRemoved(event: ServiceEvent) {
            Log.d(TAG, "Service removed: ${event.name}")
            syncLogManager.info("mDNS", "Device lost: ${event.name}")
            removeDevice(event.name)
        }

        override fun serviceResolved(event: ServiceEvent) {
            Log.d(TAG, "Service resolved: ${event.name} - ${event.info}")
            syncLogManager.info("mDNS", "Device resolved: ${event.name}")
            addOrUpdateDevice(event.info)
        }
    }

    private fun addOrUpdateDevice(serviceInfo: ServiceInfo) {
        val deviceId = serviceInfo.getPropertyString("deviceId") ?: return
        val deviceTypeStr = serviceInfo.getPropertyString("deviceType") ?: return
        val deviceName = serviceInfo.getPropertyString("deviceName") ?: serviceInfo.name
        val schemaVersion = serviceInfo.getPropertyString("schemaVersion") ?: "1.0.0"
        val networkId = serviceInfo.getPropertyString("networkId") ?: ""

        val deviceType = try {
            DeviceType.valueOf(deviceTypeStr)
        } catch (e: IllegalArgumentException) {
            Log.w(TAG, "Unknown device type: $deviceTypeStr")
            return
        }

        val addresses = serviceInfo.inet4Addresses?.takeIf { it.isNotEmpty() }?.toList()
            ?: serviceInfo.inetAddresses?.filterIsInstance<Inet4Address>()
            ?: emptyList()
        
        if (addresses.isEmpty()) {
            Log.w(TAG, "No addresses found for service: ${serviceInfo.name}")
            return
        }

        val discoveredDevice = DiscoveredDevice(
            deviceId = deviceId,
            deviceType = deviceType,
            deviceName = deviceName,
            address = addresses.first(),
            port = serviceInfo.port,
            schemaVersion = schemaVersion,
            networkId = networkId,
            lastSeen = System.currentTimeMillis()
        )

        val currentList = _discoveredDevices.value.toMutableList()
        val existingIndex = currentList.indexOfFirst { it.deviceId == deviceId }
        
        if (existingIndex >= 0) {
            currentList[existingIndex] = discoveredDevice
        } else {
            currentList.add(discoveredDevice)
        }
        
        _discoveredDevices.value = currentList
        Log.i(TAG, "Device discovered/updated: $deviceName at ${addresses.first().hostAddress}:${serviceInfo.port}")
        syncLogManager.info("mDNS", "Device found: $deviceName at ${addresses.first().hostAddress}:${serviceInfo.port}")
    }

    private fun removeDevice(serviceName: String) {
        val currentList = _discoveredDevices.value.toMutableList()
        val removed = currentList.removeAll { it.deviceName == serviceName }
        if (removed) {
            _discoveredDevices.value = currentList
            Log.i(TAG, "Device removed: $serviceName")
        }
    }

    private fun acquireMulticastLock() {
        if (multicastLock?.isHeld == true) return
        
        val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
        multicastLock = wifiManager.createMulticastLock("medlems-sync-mdns").apply {
            setReferenceCounted(true)
            acquire()
        }
        Log.d(TAG, "Multicast lock acquired")
    }

    private fun releaseMulticastLock() {
        multicastLock?.let {
            if (it.isHeld) {
                it.release()
                Log.d(TAG, "Multicast lock released")
            }
        }
        multicastLock = null
    }

    private fun getLocalIpAddress(): InetAddress? {
        try {
            NetworkInterface.getNetworkInterfaces()?.toList()?.forEach { networkInterface ->
                if (networkInterface.isUp && !networkInterface.isLoopback) {
                    networkInterface.inetAddresses?.toList()
                        ?.filterIsInstance<Inet4Address>()
                        ?.firstOrNull { !it.isLoopbackAddress }
                        ?.let { return it }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error getting local IP address", e)
        }
        return null
    }
}

/**
 * Represents a discovered device on the local network.
 */
data class DiscoveredDevice(
    val deviceId: String,
    val deviceType: DeviceType,
    val deviceName: String,
    val address: InetAddress,
    val port: Int,
    val schemaVersion: String,
    val networkId: String,
    val lastSeen: Long
) {
    /**
     * Returns the base URL for the device's sync API.
     */
    val syncApiBaseUrl: String
        get() = "http://${address.hostAddress}:$port"

    /**
     * Checks if this device is compatible with the current schema version.
     */
    fun isCompatible(): Boolean {
        return com.club.medlems.data.sync.SyncSchemaVersion.isCompatible(schemaVersion)
    }

    /**
     * Returns a DeviceInfo representation of this discovered device.
     * Note: pairedAtUtc is set to epoch as discovered devices may not be paired yet.
     */
    fun toDeviceInfo(): DeviceInfo {
        return DeviceInfo(
            id = deviceId,
            name = deviceName,
            type = deviceType,
            lastSeenUtc = kotlinx.datetime.Instant.fromEpochMilliseconds(lastSeen),
            pairedAtUtc = kotlinx.datetime.Instant.fromEpochMilliseconds(0), // Unknown, set to epoch
            isTrusted = false // Not trusted until explicitly paired
        )
    }
}

/**
 * State of the mDNS advertising service.
 */
enum class AdvertisingState {
    STOPPED,
    STARTING,
    ADVERTISING,
    ERROR
}

/**
 * State of the mDNS discovery service.
 */
enum class DiscoveryState {
    STOPPED,
    STARTING,
    DISCOVERING,
    ERROR
}
