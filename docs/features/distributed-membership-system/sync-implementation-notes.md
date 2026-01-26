# Sync Implementation Notes

> **Created**: January 18, 2026
> **Last Updated**: January 26, 2026 by sbalslev
> **Status**: Working MVP with pairing and auth in place

---

## Current Implementation Overview

### Architecture

The sync system uses a **peer-to-peer HTTP API** approach with **mDNS service discovery** for device finding.

```
┌─────────────────┐     HTTP/REST      ┌─────────────────┐
│  Master Laptop  │◄──────────────────►│  Android Tablet │
│   (Electron)    │   Port 8085        │   (Ktor CIO)    │
│                 │                    │                 │
│  - sql.js DB    │                    │  - Room DB      │
│  - Express      │                    │  - Ktor Server  │
│  - bonjour-svc  │                    │  - jmDNS        │
└─────────────────┘                    └─────────────────┘
```

### Data Flow

1. **Laptop → Tablet (Members)**: Laptop is master for member data
   - `POST /api/sync/push` with members array
   - Tablet applies via `SyncRepository.applySyncPayload()`

2. **Tablet → Laptop (Check-ins, Sessions, Registrations)**: Tablet owns activity data
   - `GET /api/sync/pull?since=<timestamp>`
   - Laptop stores via `processSyncPayload()`

### Device Discovery

1. **mDNS Advertisement**: Both apps advertise `_medlemssync._tcp` service
2. **Subnet Scanning Fallback**: Scans `/24` subnet if mDNS fails
3. **Periodic Rescan**: Every 30 seconds for connection recovery
4. **Stale Device Cleanup**: Devices not seen for 5 minutes are removed

### Key Files

| Component | Laptop | Android |
|-----------|--------|---------|
| Sync Server | `laptop/electron/main.cjs` | `SyncApiServer.kt` |
| Sync Client | `laptop/src/store/appStore.ts` | `SyncClient.kt` |
| Data Processing | `laptop/src/database/syncService.ts` | `SyncRepository.kt` |
| Device Discovery | `laptop/electron/main.cjs` (bonjour) | `DeviceDiscoveryService.kt` |
| Trust Management | N/A | `TrustManager.kt` |

---

## Current Security Model (MVP)

### What's Implemented

1. **Persistent Device ID**: Laptop saves device ID to file, stays same across restarts
2. **EncryptedSharedPreferences**: Android stores device tokens using AES-256-GCM
3. **Trusted Device List**: Laptop stores trusted devices with auth tokens
4. **Pairing Code Ceremony**: Laptop generates a 6-digit code, tablet submits it to pair
5. **Auth Middleware**: Laptop validates Bearer tokens for sync endpoints
6. **Token Expiration**: Laptop issues tokens with 30-day expiry
7. **Pairing Rate Limits**: Repeated failed attempts are rate-limited

### Security Gaps (Known Issues)

| Issue | Risk Level | Current State |
|-------|------------|---------------|
| HTTP (not HTTPS) | Low | Local network only, but plaintext |
| Token format is not JWT | Low | HMAC-based token used for MVP |
| Tablet token persistence | Medium | Tablet stores token, but rotation not implemented |

### How Tokens Work Currently

**Android Side:**
```kotlin
// SyncClient.kt - generates self-signed token if no persistent token
val authToken = trustManager.getPersistentToken() 
    ?: trustManager.generateDeviceToken(trustManager.getThisDeviceInfo())
```

**Laptop Side:**
```javascript
// main.cjs - validates Authorization header
app.use('/api/sync', authMiddleware);
```

---

## Implemented Fixes (This Session)

1. **Persistent Laptop Device ID** (`main.cjs`)
   - Saves to `%APPDATA%/medlems-admin/device-id.txt`
   - No longer creates new device on each restart

2. **Stale Device Cleanup** (`DeviceDiscoveryService.kt`)
   - Removes devices not seen for 5+ minutes
   - Runs after subnet scans and discovery refresh

3. **Token Fallback** (`SyncClient.kt`)
   - If no persistent token, generates device token
   - Prevents "no persistent token" error

4. **Bidirectional Data Sync** (`appStore.ts`, `syncService.ts`)
   - Laptop pushes members to tablets
   - Laptop pulls check-ins/sessions from tablets
   - IPC bridge between main process and renderer

---

## Configuration

### Laptop Device ID Location
```
Windows: %APPDATA%/medlems-admin/device-id.txt
macOS: ~/Library/Application Support/medlems-admin/device-id.txt
Linux: ~/.config/medlems-admin/device-id.txt
```

### Ports
- **Sync API**: 8085 (changed from 8080 to avoid VS Code proxy conflict)
- **mDNS**: Standard multicast port 5353

### Timeouts
- Stale device: 5 minutes (300,000 ms)
- HTTP request: 30 seconds
- Subnet scan per-IP: 1.5 seconds

---

## Testing Checklist

- [ ] Restart laptop app - should keep same device ID
- [ ] Wait 5+ minutes with tablet offline - should be cleaned from laptop list
- [ ] Click "Synkronisér nu" on laptop - should push members and pull check-ins
- [ ] Make a check-in on tablet, sync - should appear on laptop
- [ ] Add member on laptop, sync - should appear on tablet

---

## Related Documentation

- [design.md](design.md) - Original feature specification
- [tasks.md](tasks.md) - Implementation task list
- [security-tasks.md](security-tasks.md) - Follow-up security improvements

