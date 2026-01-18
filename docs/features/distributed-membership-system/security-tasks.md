# Security Model Improvement Tasks

> **Created**: January 18, 2026
> **Priority**: High (before production deployment)
> **Status**: Not Started

---

## Overview

The current sync implementation uses a **fallback self-signed token** approach that works for MVP testing but is NOT production-ready. These tasks outline the proper security implementation.

---

## Task SEC-1: Implement Proper Pairing Ceremony

**Priority**: 🔴 High
**Estimated Effort**: 4-6 hours

### Description
Create a mutual authentication handshake when devices first connect.

### Requirements

- [ ] Laptop displays 6-digit pairing code (time-limited, 2 minutes)
- [ ] User enters code on tablet to confirm pairing
- [ ] On successful code entry:
  - Tablet sends its device info + public identifier
  - Laptop sends its device info + shared secret
  - Both save each other's info to trusted device list
- [ ] Failed attempts:
  - Rate limit to 3 attempts per device
  - Block device for 5 minutes after 3 failures
- [ ] UI shows pairing status indicator

### Files to Modify

| File | Changes |
|------|---------|
| `main.cjs` | Add `/api/pair/initiate` and `/api/pair/confirm` endpoints |
| `DeviceCard.tsx` | Add "Pair Device" button with code entry modal |
| `SyncApiServer.kt` | Add pairing endpoints |
| `PairingViewModel.kt` | New - handle pairing flow |
| `TrustManager.kt` | Save paired device tokens persistently |

---

## Task SEC-2: Token Exchange on Pairing

**Priority**: 🔴 High
**Estimated Effort**: 2-3 hours

### Description
Exchange and persist authentication tokens during pairing ceremony.

### Requirements

- [ ] On pairing success:
  - Laptop generates unique token for tablet (UUID v4)
  - Tablet generates unique token for laptop (UUID v4)
  - Both persist tokens in encrypted storage
- [ ] Tokens stored with device ID mapping:
  ```
  TrustedDevice(deviceId, deviceName, token, pairedAt, lastSeen)
  ```
- [ ] Call `trustManager.savePersistentToken()` - currently exists but never used

### Files to Modify

| File | Changes |
|------|---------|
| `TrustManager.kt` | Implement proper token storage from pairing |
| `TrustedDevice.kt` | Add token field to entity |
| `main.cjs` | Store tablet tokens in config file |

---

## Task SEC-3: Validate Tokens on All Endpoints

**Priority**: 🔴 High  
**Estimated Effort**: 2 hours

### Description
Add authentication middleware to validate tokens on sync endpoints.

### Requirements

- [ ] Laptop validates `Authorization: Bearer <token>` header
- [ ] Return 401 Unauthorized if:
  - No Authorization header
  - Token doesn't match any trusted device
  - Device not in paired list
- [ ] Log failed auth attempts with device ID and IP

### Implementation

```javascript
// Laptop - main.cjs
function authMiddleware(req, res, next) {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
    }
    const token = auth.split(' ')[1];
    const device = trustedDevices.find(d => d.token === token);
    if (!device) {
        return res.status(401).json({ error: 'Invalid token' });
    }
    req.trustedDevice = device;
    next();
}

// Apply to sync routes
server.use('/api/sync', authMiddleware);
```

---

## Task SEC-4: Token Expiration and Renewal

**Priority**: 🟡 Medium
**Estimated Effort**: 3-4 hours

### Description
Tokens should expire and be renewable to limit damage from token compromise.

### Requirements

- [ ] Token lifetime: 30 days
- [ ] 7 days before expiry, automatically renew on next sync
- [ ] Store `expiresAt` with token
- [ ] Re-pairing required if token expired without renewal
- [ ] Option: Short-lived tokens (1 hour) renewed on each sync

---

## Task SEC-5: HTTPS for Sync API

**Priority**: 🟡 Medium
**Estimated Effort**: 4-6 hours

### Description
Encrypt sync traffic to prevent network sniffing.

### Requirements

- [ ] Generate self-signed certificate on first run
- [ ] Or use mutual TLS with certificate pinning
- [ ] Laptop serves HTTPS on port 8085
- [ ] Android accepts laptop's certificate (pinned or trusted)
- [ ] Fallback to HTTP for local development only

### Considerations

- Self-signed certs require manual trust on Android
- mkcert could generate locally-trusted certs
- Certificate rotation adds complexity

---

## Task SEC-6: Audit Logging

**Priority**: 🟢 Low
**Estimated Effort**: 2 hours

### Description
Log security-relevant events for debugging and audit.

### Events to Log

- Pairing attempts (success/failure)
- Auth failures (invalid token, missing header)
- Device removals from trusted list
- Sync operations (timestamp, device, record counts)

### Storage

- SQLite table: `AuditLog(timestamp, event, deviceId, details)`
- Rotate after 1000 entries or 30 days

---

## Implementation Order

1. **SEC-3** (Token validation) - Quick win, blocks unauthenticated requests
2. **SEC-1** (Pairing ceremony) - Establishes trust properly
3. **SEC-2** (Token exchange) - Completes pairing security
4. **SEC-4** (Expiration) - Limits exposure window
5. **SEC-5** (HTTPS) - Encrypts traffic
6. **SEC-6** (Audit) - Nice to have for troubleshooting

---

## Related

- [sync-implementation-notes.md](sync-implementation-notes.md) - Current implementation
- [tasks.md](tasks.md) - Main task list

