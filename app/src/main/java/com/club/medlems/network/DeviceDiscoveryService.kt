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
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.callbackFlow
import java.net.Inet4Address
import java.net.InetAddress
import java.net.NetworkInterface
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
 * - deviceType: MEMBER_TABLET, ADMIN_TABLET, MASTER_LAPTOP, DISPLAY_EQUIPMENT, DISPLAY_PRACTICE
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
    }

    private var jmDNS: JmDNS? = null
    private var nsdManager: NsdManager? = null
    private var multicastLock: WifiManager.MulticastLock? = null
    
    private var registeredServiceInfo: ServiceInfo? = null
    private var isAdvertising = false
    private var isDiscovering = false

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

            // Create JmDNS if not already created
            if (jmDNS == null) {
                jmDNS = JmDNS.create(localAddress, localAddress.hostAddress)
            }

            jmDNS?.addServiceListener(SERVICE_TYPE, serviceListener)
            isDiscovering = true
            _discoveryState.value = DiscoveryState.DISCOVERING

            Log.i(TAG, "Started service discovery")
            syncLogManager.info("mDNS", "Started discovery for service type: $SERVICE_TYPE")
            Result.success(Unit)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start discovery", e)
            syncLogManager.error("mDNS", "Failed to start discovery", e)
            _discoveryState.value = DiscoveryState.ERROR
            Result.failure(e)
        }
    }

    /**
     * Stops discovering other devices.
     */
    fun stopDiscovery() {
        try {
            jmDNS?.removeServiceListener(SERVICE_TYPE, serviceListener)
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
            releaseMulticastLock()
            _discoveredDevices.value = emptyList()
            Log.i(TAG, "Discovery service shut down")
        } catch (e: Exception) {
            Log.e(TAG, "Error during shutdown", e)
        }
    }

    /**
     * Manually triggers a refresh of discovered devices.
     */
    fun refreshDiscovery() {
        if (!isDiscovering) return
        
        try {
            // Request service information for all known services
            jmDNS?.list(SERVICE_TYPE)?.forEach { serviceInfo ->
                addOrUpdateDevice(serviceInfo)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error refreshing discovery", e)
        }
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
