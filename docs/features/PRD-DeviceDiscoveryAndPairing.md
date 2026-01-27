# PRD: Enhanced Device Discovery and Pairing

**Last Updated:** 2026-01-26
**Updated By:** sbalslev

## Executive Summary

This document explores improvements to the device pairing and discovery system for the Medlemscheckin application. The current system works well but may be over-engineered for the typical usage pattern: practice nights lasting 3-5 hours, occurring only 2 days per week, with devices rarely being added or replaced.

## Current State Analysis

### How Discovery Works Today

1. **Dual mDNS Discovery** (`DeviceDiscoveryService.kt`)
   - jmDNS service advertising `_medlemssync._tcp.local.`
   - Android NSD (Native Service Discovery) as complementary method
   - Subnet scan fallback (probes all /24 IPs)

2. **Pairing Code Ceremony**

    - Laptop generates a 6-digit pairing code with auth token (5-minute validity)
    - Tablet enters the code and exchanges device info
    - Laptop issues persistent auth token
    - Device added to trusted list
    - Manual pairing uses a 6-digit code entry, and discovered devices open the code dialog instead of pairing directly

3. **Polling-Based Sync**
   - 5-minute automatic sync intervals
   - Network connectivity monitoring
   - Stale device cleanup after 5 minutes of no contact

### Current Pain Points

| Issue | Impact |
|-------|--------|
| Subnet scan is slow | Can take 30+ seconds to probe 254 IPs |
| mDNS can be unreliable on some networks | Router/AP may block multicast |
| 5-minute poll interval | Delays sync when devices reconnect |
| No push notifications | Tablets don't know when peers come online |

## Usage Pattern Analysis

```
Typical Usage:
- Duration: 3-5 hours per session
- Frequency: 2 days per week
- Device additions: Rare (only when hardware fails)
- Network: Same WiFi network always
- Devices: 2-4 tablets + 1 laptop typically
```

### Key Insight

Once devices are paired, they remain paired indefinitely. The current discovery system is optimized for a more dynamic environment where devices frequently join and leave. For a stable, rarely-changing device set, we can optimize for:

1. **Fast reconnection** of known devices
2. **Minimal discovery overhead** once configured
3. **Instant sync notification** when peers come online

## Proposed Improvements

### Option A: Persistent Device Registry with Quick Reconnect

**Concept**: Store last-known IP addresses and try direct connection first.

```kotlin
data class PersistedDevice(
    val deviceInfo: DeviceInfo,
    val lastKnownIp: String,
    val lastKnownPort: Int,
    val lastSuccessfulContact: Instant,
    val connectionSuccessRate: Float  // Track reliability
)
```

**Reconnection Strategy**:
1. On startup, immediately try last-known IPs of trusted devices
2. If direct connection works, skip mDNS entirely
3. Only fall back to full discovery if direct connection fails
4. Update stored IP when device found at new address

**Pros**:
- Instant reconnection in 90%+ of cases (DHCP often assigns same IP)
- Reduces network traffic significantly
- Simple to implement

**Cons**:
- Still falls back to slow subnet scan if IP changed
- Doesn't solve push notification problem

### Option B: WebSocket-Based Presence System

**Concept**: Add WebSocket connections for real-time presence and sync triggers.

```kotlin
// New endpoints
WS /api/sync/presence   // Persistent connection for presence
WS /api/sync/stream     // Optional: Real-time sync stream
```

**How It Works**:
1. When device starts, connects to all known peers via WebSocket
2. Peers send presence heartbeats (every 30 seconds)
3. When data changes, peer sends "sync available" message
4. Receiving device can immediately pull changes

**Pros**:
- Instant awareness when peers come online
- Real-time sync triggers (no polling delay)
- Reduces HTTP request overhead

**Cons**:
- More complex implementation
- WebSocket connections consume resources
- May not work well with Android Doze mode

### Option C: Hybrid Smart Discovery (Recommended)

**Concept**: Combine persistent device registry with intelligent discovery phases.

```
Phase 1: Quick Reconnect (0-2 seconds)
├── Try last-known IPs of trusted devices
├── Parallel HTTP health checks to all known addresses
└── If all trusted devices found → DONE

Phase 2: Targeted Discovery (2-10 seconds)
├── Only if Phase 1 found < expected devices
├── mDNS query for missing devices only
├── Check adjacent IPs (±10 from last known)
└── If all trusted devices found → DONE

Phase 3: Full Discovery (10+ seconds, rare)
├── Only if devices still missing after Phase 2
├── Full subnet scan
└── User notification: "Looking for devices..."
```

**Enhanced Device Storage**:

```kotlin
@Serializable
data class DeviceConnectionProfile(
    val deviceId: String,
    val deviceInfo: DeviceInfo,

    // Connection history
    val knownAddresses: List<AddressRecord>,  // Last 5 addresses
    val preferredPort: Int = 8085,

    // Statistics
    val totalConnections: Int,
    val lastConnectionSuccess: Instant,
    val averageReconnectTime: Duration,

    // Smart hints
    val typicalOnlineHours: List<IntRange>?,  // e.g., [18..22] for evening practices
    val lastDhcpLease: String?                // If detectable
)

@Serializable
data class AddressRecord(
    val ip: String,
    val firstSeen: Instant,
    val lastSeen: Instant,
    val successCount: Int,
    val failCount: Int
)
```

**Pros**:
- Fast reconnection for stable setups
- Graceful degradation when IPs change
- Collects data to improve over time
- No infrastructure changes needed

### Option D: Bluetooth LE Beacon for Presence

**Concept**: Use Bluetooth LE to detect device presence before network discovery.

```kotlin
// BLE Advertisement
data class DeviceBeacon(
    val deviceId: String,        // 16 bytes UUID
    val networkIdHash: Byte,     // 1 byte hash for quick filtering
    val ipAddressHint: ByteArray // 4 bytes - current IP
)
```

**How It Works**:
1. All devices broadcast BLE beacon with device ID and current IP
2. When peer's beacon detected, directly connect to advertised IP
3. No network scanning needed at all

**Pros**:
- Works even before WiFi connection established
- Very fast peer detection
- Works through network isolation issues

**Cons**:
- Requires BLE permissions (Android 12+ more restrictive)
- Battery impact from continuous advertising
- Laptop support varies (needs BLE adapter)

### Option E: Simplified "Club Mode"

**Concept**: For stable setups, provide a one-time configuration mode.

```
Setup Mode (One-time):
1. All devices on same network
2. Laptop broadcasts "setup beacon"
3. All tablets auto-discover and pair
4. Configuration saved and locked

Club Mode (Daily use):
1. Laptop starts → broadcasts "I'm online" once
2. Tablets have hardcoded laptop address from setup
3. Tablets connect directly to laptop
4. Laptop coordinates tablet-to-tablet sync if needed
```

**Pros**:
- Simplest possible daily operation
- No discovery needed after setup
- Laptop becomes coordinator (already has the most data)

**Cons**:
- Less resilient (depends on laptop being online first)
- Harder to add new devices later
- Less peer-to-peer flexibility

## Recommendation: Option C with Option E Elements

Implement **Hybrid Smart Discovery** with a **"Quick Setup" mode** for initial configuration:

### Implementation Plan

#### Phase 1: Persistent Device Registry
1. Extend `TrustManager` to store `DeviceConnectionProfile`
2. Track IP address history for each device
3. Store connection statistics

#### Phase 2: Fast Reconnect Logic
1. On startup, immediately try known IPs
2. Parallel health checks with 2-second timeout
3. Update UI to show connection progress

#### Phase 3: Tiered Discovery Fallback
1. Adjacent IP scan for recently-moved devices
2. mDNS only if quick methods fail
3. Subnet scan as last resort with user notification

#### Phase 4: Push Notifications (Optional Future)
1. Add lightweight WebSocket for presence
2. Sync trigger messages
3. Fall back to polling if WS unavailable

### Data Model Changes

```kotlin
// New: Enhanced device storage
@Serializable
data class DeviceConnectionProfile(
    val deviceId: String,
    val deviceInfo: DeviceInfo,
    val knownAddresses: List<AddressRecord> = emptyList(),
    val preferredPort: Int = 8085,
    val connectionStats: ConnectionStats = ConnectionStats()
)

@Serializable
data class AddressRecord(
    val ip: String,
    val lastSeen: Instant,
    val successCount: Int = 0,
    val failCount: Int = 0
) {
    val reliability: Float get() =
        if (successCount + failCount == 0) 0f
        else successCount.toFloat() / (successCount + failCount)
}

@Serializable
data class ConnectionStats(
    val totalAttempts: Int = 0,
    val totalSuccesses: Int = 0,
    val averageReconnectMs: Long = 0,
    val lastSuccessfulSync: Instant? = null
)
```

### New Discovery Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        Device Startup                            │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 1: Quick Reconnect (0-2 sec)                              │
│ ─────────────────────────────────                               │
│ For each trusted device:                                        │
│   • Try primary IP (highest success rate)                       │
│   • Try secondary IP (if different, parallel)                   │
│   • 2-second timeout per attempt                                │
│                                                                 │
│ Result: Found 3/3 devices → DONE                                │
│         Found 2/3 devices → Continue to Phase 2                 │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 2: Targeted Discovery (2-10 sec)                          │
│ ─────────────────────────────────                               │
│ For missing devices only:                                       │
│   • mDNS query with device ID filter                            │
│   • Adjacent IP scan (last known ± 20)                          │
│   • Check common DHCP ranges                                    │
│                                                                 │
│ Result: All devices found → DONE                                │
│         Still missing → Continue to Phase 3                     │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 3: Full Discovery (10+ sec, with UI feedback)             │
│ ─────────────────────────────────                               │
│ • Show "Searching for devices..." in UI                         │
│ • Full subnet scan                                              │
│ • Allow user to manually enter IP                               │
│ • Offer to re-pair if device seems new                          │
└─────────────────────────────────────────────────────────────────┘
```

### API Changes

```kotlin
// Enhanced status endpoint with discovery hints
GET /api/sync/status
Response: {
    ...existing fields...,
    "discoveryHints": {
        "preferredPort": 8085,
        "alternateIps": ["192.168.1.100", "192.168.1.105"],
        "uptimeSeconds": 3600
    }
}

// New: Presence notification (optional WebSocket)
WS /api/sync/presence
Messages:
  → { "type": "hello", "deviceId": "...", "ip": "..." }
  ← { "type": "welcome", "peers": [...] }
  ← { "type": "peer_online", "deviceId": "...", "ip": "..." }
  ← { "type": "sync_available", "deviceId": "...", "changeCount": 5 }
```

### UI/UX Improvements

1. **Connection Status Dashboard**
   ```
   ┌────────────────────────────────────────┐
   │ Devices                                │
   ├────────────────────────────────────────┤
   │ ✓ Laptop (Master)     192.168.1.100   │
   │ ✓ Tablet 1            192.168.1.101   │
   │ ○ Tablet 2            Searching...     │
   │ ✓ Display             192.168.1.103   │
   ├────────────────────────────────────────┤
   │ [Refresh] [Add Device] [Settings]     │
   └────────────────────────────────────────┘
   ```

2. **Quick Setup Wizard** (for initial configuration)
   - Single QR code to pair all devices at once
   - Automatic device type detection
   - Network health check

3. **Manual IP Entry** (for troubleshooting)
   - Enter IP address directly if discovery fails
   - Test connection before saving

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Time to connect to all known devices | 30-60 sec | < 5 sec |
| Sync trigger delay after peer online | Up to 5 min | < 30 sec |
| Discovery success rate | ~95% | > 99% |
| Battery impact from discovery | Medium | Low |

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| IP address caching becomes stale | Store multiple addresses, use reliability scoring |
| WebSocket adds complexity | Make it optional, fall back to polling |
| Bluetooth permissions rejected | BLE is optional enhancement, not required |
| Network isolation blocks mDNS | Adjacent IP scan + manual entry fallback |

## Future Considerations

1. **Cloud-Assisted Discovery** (if club has internet)
   - Devices register with cloud service
   - Cloud provides current IP to peers
   - Works across network changes

2. **Mesh Networking**
   - Devices relay discovery info to each other
   - If Tablet A knows Laptop's IP, shares with Tablet B

3. **NFC Pairing**
   - Tap devices together to pair
   - Even simpler than QR code

## Android 6.0 (API 23) Compatibility Analysis

The app currently targets `minSdk = 23` (Android 6.0 Marshmallow). This section documents known issues and concerns related to mDNS and network discovery on older Android devices.

### Current Implementation Strengths

The existing code in `DeviceDiscoveryService.kt` already implements several best practices:

| Practice | Status | Location |
|----------|--------|----------|
| MulticastLock acquired | ✅ | Line 665-674 |
| setReferenceCounted(true) | ✅ | Line 670 |
| Dual discovery (jmDNS + NSD) | ✅ | Line 191-209 |
| Subnet scan fallback | ✅ | Line 439-486 |
| Required permissions declared | ✅ | AndroidManifest.xml |

### Known Android mDNS/NSD Issues by Version

| Android Version | API Level | Known Issues |
|-----------------|-----------|--------------|
| 6.0 Marshmallow | 23 | NSD generally works (fix from Google). Some device-specific multicast filtering. |
| 7.x Nougat | 24-25 | [jmDNS reported broken](https://github.com/jmdns/jmdns/issues/107) on some devices |
| 8.x Oreo | 26-27 | [jmDNS registration issues](https://github.com/jmdns/jmdns/issues/168) |
| 12 and below | ≤31 | [mDNS discovery issues with Matter/CHIP](https://github.com/project-chip/connectedhomeip/issues/32686) |
| 12+ | 31+ | Native .local mDNS resolution added (Android 12+) |

### NsdManager-Specific Issues

1. **Single Resolver Limitation**
   - NsdManager can only resolve ONE service at a time
   - Concurrent resolve calls return `FAILURE_ALREADY_ACTIVE`
   - No built-in timeout - resolver can hang indefinitely
   - [Google Issue Tracker #37127704](https://issuetracker.google.com/issues/37127704)

2. **ResolveListener Reuse Bug**
   - Each `resolveService()` call requires a NEW `ResolveListener` instance
   - Current implementation correctly creates new listeners: `createNsdResolveListener()` (line 273)

3. **Device-Specific Failures**
   - Some devices (notably Nexus 7 2012 on KitKat) temporarily lock up
   - [Generally works on Android 5.0+](https://coderanch.com/t/676643/Android-NSD-Manager-finds-fails)

### jmDNS-Specific Issues

1. **Samsung Device Problems**
   - Samsung has historically broken jmDNS in certain Android builds
   - Workaround: Use embedded mDNS version instead of bindable version

2. **R8 Desugaring Crash**
   - When R8 desugaring is enabled, `DNSCache.putIfAbsent` may be removed
   - [jmDNS Issue #205](https://github.com/jmdns/jmdns/issues/205)

3. **Blocking Operations**
   - `JmDNS.close()` blocks the calling thread
   - Should be called from background thread

### Router/Network Issues

| Issue | Impact | Mitigation |
|-------|--------|------------|
| Multicast filtering | mDNS packets dropped | Subnet scan fallback |
| AP isolation | Devices can't see each other | User must disable in router |
| IGMP snooping | Multicast groups not joined | Disable "IPTV optimizations" |
| VPN active | Multicast blocked | Warn user to disconnect VPN |

### Recommended Improvements for Android 6.0 Support

#### 1. Add NSD Resolution Queue (High Priority)

Current code may fail when discovering multiple devices simultaneously.

```kotlin
// Recommended: Queue-based resolution with retry
private val pendingResolutions = ConcurrentLinkedQueue<NsdServiceInfo>()
private val isResolving = AtomicBoolean(false)

private fun queueForResolution(serviceInfo: NsdServiceInfo) {
    pendingResolutions.add(serviceInfo)
    processNextResolution()
}

private fun processNextResolution() {
    if (isResolving.compareAndSet(false, true)) {
        val next = pendingResolutions.poll()
        if (next != null) {
            nsdManager?.resolveService(next, createNsdResolveListener())
        } else {
            isResolving.set(false)
        }
    }
}

// In resolve listener callbacks:
override fun onServiceResolved(serviceInfo: NsdServiceInfo) {
    // ... handle resolved service ...
    isResolving.set(false)
    processNextResolution() // Process next in queue
}

override fun onResolveFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
    if (errorCode == NsdManager.FAILURE_ALREADY_ACTIVE) {
        // Re-queue for later
        pendingResolutions.add(serviceInfo)
    }
    isResolving.set(false)
    processNextResolution()
}
```

#### 2. Add Resolution Timeout (High Priority)

NsdManager doesn't timeout - add manual timeout handling.

```kotlin
private fun resolveWithTimeout(serviceInfo: NsdServiceInfo, timeoutMs: Long = 5000) {
    val handler = Handler(Looper.getMainLooper())
    val timeoutRunnable = Runnable {
        Log.w(TAG, "Resolution timeout for ${serviceInfo.serviceName}")
        isResolving.set(false)
        processNextResolution()
    }

    handler.postDelayed(timeoutRunnable, timeoutMs)

    nsdManager?.resolveService(serviceInfo, object : NsdManager.ResolveListener {
        override fun onServiceResolved(info: NsdServiceInfo) {
            handler.removeCallbacks(timeoutRunnable)
            // ... handle success ...
        }

        override fun onResolveFailed(info: NsdServiceInfo, errorCode: Int) {
            handler.removeCallbacks(timeoutRunnable)
            // ... handle failure ...
        }
    })
}
```

#### 3. Enhance Multicast Lock Management (Medium Priority)

```kotlin
private fun acquireMulticastLock() {
    if (multicastLock?.isHeld == true) return

    val wifiManager = context.applicationContext
        .getSystemService(Context.WIFI_SERVICE) as WifiManager

    multicastLock = wifiManager.createMulticastLock("medlems-sync-mdns").apply {
        // Use setReferenceCounted(false) to avoid "under-locked" exceptions
        // when lock is released multiple times
        setReferenceCounted(false)  // Changed from true
        acquire()
    }
    Log.d(TAG, "Multicast lock acquired")
}
```

#### 4. Add Network Diagnostics (Medium Priority)

Help users troubleshoot connectivity issues:

```kotlin
data class NetworkDiagnostics(
    val hasWifi: Boolean,
    val wifiSsid: String?,
    val localIp: String?,
    val canReceiveMulticast: Boolean,
    val vpnActive: Boolean,
    val mobileDataEnabled: Boolean,
    val discoveryMethod: String  // "jmDNS", "NSD", "subnet_scan"
)

suspend fun runNetworkDiagnostics(): NetworkDiagnostics {
    // Check various network conditions
    // Return diagnostics for UI display
}
```

#### 5. Mobile Data Warning (Low Priority)

mDNS can fail when mobile data is enabled alongside WiFi:

```kotlin
private fun checkMobileDataConflict(): Boolean {
    val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    val mobileInfo = cm.getNetworkInfo(ConnectivityManager.TYPE_MOBILE)
    val wifiInfo = cm.getNetworkInfo(ConnectivityManager.TYPE_WIFI)

    return mobileInfo?.isConnected == true && wifiInfo?.isConnected == true
}
```

### Testing Recommendations

1. **Test on actual Android 6.0 device** (not just emulator)
   - Samsung Galaxy S5/S6 running Marshmallow
   - Nexus 5X/6P with original Android 6.0

2. **Test discovery scenarios:**
   - Single device discovery
   - Multiple devices simultaneously (triggers NSD queue issue)
   - Device appearing/disappearing rapidly
   - Network switch (WiFi reconnect)

3. **Test network conditions:**
   - Standard home WiFi
   - Enterprise WiFi with AP isolation
   - WiFi + mobile data both enabled
   - VPN connected

### Alternative Approaches for Problematic Devices

If mDNS continues to be unreliable on certain Android 6.0 devices:

1. **Direct IP Entry** - Allow users to manually enter device IP
2. **Pairing Code with IP hint** - Show current IP alongside the pairing code
3. **Subnet Scan Primary** - Make subnet scan the primary discovery method on known-problematic devices
4. **Bluetooth LE Hints** - Use BLE to advertise IP address (requires BLE support)

### Decision: Should We Drop Android 6.0 Support?

| Factor | Keep API 23 | Raise to API 24+ |
|--------|-------------|------------------|
| Device coverage | ~1.4% of Play Store (May 2024) | Lose minimal users |
| Testing burden | Must test older devices | Simpler testing matrix |
| mDNS reliability | More workarounds needed | Slightly better NSD |
| Security patches | Android 6.0 unsupported by Google | Better security posture |
| React Native trend | RN 0.76+ drops API 23 | Industry moving on |

**Recommendation:** Keep API 23 for now since:
- Tablets may be older/cheaper devices running Android 6.0
- Current fallback mechanisms (subnet scan) work on all versions
- Changes proposed above are relatively simple to implement

## Appendix: Current Code References

- Discovery: `app/src/main/java/com/club/medlems/network/DeviceDiscoveryService.kt`
- Pairing: `app/src/main/java/com/club/medlems/data/sync/PairingModels.kt`
- Trust: `app/src/main/java/com/club/medlems/network/TrustManager.kt`
- Sync: `app/src/main/java/com/club/medlems/data/sync/SyncManager.kt`
- API Server: `app/src/main/java/com/club/medlems/network/SyncApiServer.kt`
- Laptop Sync: `laptop/src/database/syncService.ts`
