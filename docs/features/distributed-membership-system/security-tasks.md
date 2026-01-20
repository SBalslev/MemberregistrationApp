# Security Model Improvement Tasks

> **Created**: January 18, 2026
> **Priority**: High (before production deployment)
> **Status**: In Progress (SEC-1, SEC-2, SEC-3, SEC-4 completed)
> **Last Updated**: Session date

---

## Overview

The current sync implementation uses a **fallback self-signed token** approach that works for MVP testing but is NOT production-ready. These tasks outline the proper security implementation.

---

## Task SEC-1: Implement Proper Pairing Ceremony

**Priority**: 🔴 High
**Estimated Effort**: 4-6 hours
**Status**: ✅ COMPLETED

### Description
Create a mutual authentication handshake when devices first connect.

### Requirements

- [x] Laptop displays 6-digit pairing code (time-limited, 2 minutes)
- [x] User enters code on tablet to confirm pairing
- [x] On successful code entry:
  - Tablet sends its device info + public identifier
  - Laptop sends its device info + shared secret
  - Both save each other's info to trusted device list
- [x] Failed attempts:
  - Rate limit to 3 attempts per device
  - Block device for 5 minutes after 3 failures
- [x] UI shows pairing status indicator

### Implementation

- `laptop/src/database/trustManager.ts` - Full pairing session management
- `laptop/electron/main.cjs` - `/api/pair` endpoint with rate limiting
- `laptop/src/pages/DevicesPage.tsx` - "Par ny enhed" button + modal with 6-digit code display
- `app/.../ui/sync/DevicePairingScreen.kt` - "Par med kode" button + code entry dialog
- `app/.../network/SyncClient.kt` - `pairWithDevice()` function

---

## Task SEC-2: Token Exchange on Pairing

**Priority**: 🔴 High
**Estimated Effort**: 2-3 hours
**Status**: ✅ COMPLETED

### Description
Exchange and persist authentication tokens during pairing ceremony.

### Requirements

- [x] On pairing success:
  - Laptop generates unique token for tablet (UUID v4 with `tok_` prefix)
  - Tablet stores token using TrustManager
  - Laptop persists tokens in database and in-memory cache
- [x] Tokens stored with device ID mapping:
  ```
  TrustedDevice(deviceId, deviceName, token, pairedAt, lastSeen, tokenExpiresAt)
  ```
- [x] Call `trustManager.savePersistentToken()` - now used in SyncClient.pairWithDevice()

### Implementation

- `laptop/src/database/db.ts` - Added migration for authToken/tokenExpiresAt columns
- `laptop/electron/main.cjs` - Stores tokens in trustedDevicesCache Map
- `app/.../network/TrustManager.kt` - Already had savePersistentToken(), now used

---

## Task SEC-3: Validate Tokens on All Endpoints

**Priority**: 🔴 High  
**Estimated Effort**: 2 hours
**Status**: ✅ COMPLETED

### Description
Add authentication middleware to validate tokens on sync endpoints.

### Requirements

- [x] Laptop validates `Authorization: Bearer <token>` header
- [x] Return 401 Unauthorized if:
  - No Authorization header
  - Token doesn't match any trusted device
  - Device not in paired list
- [x] Log failed auth attempts with device ID and IP

### Implementation

```javascript
// Laptop - main.cjs
function authMiddleware(req, res, next) {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
        console.warn('[Auth] No Authorization header from', req.ip);
        return res.status(401).json({ error: 'No token provided' });
    }
    const token = auth.split(' ')[1];
    const device = trustedDevicesCache.get(token);
    if (!device) {
        console.warn('[Auth] Invalid token from', req.ip);
        return res.status(401).json({ error: 'Invalid token' });
    }
    req.trustedDevice = device;
    next();
}

// Applied to: /api/sync/push, /api/sync/pull, /api/sync/initial, /api/sync/members
```

---

## Task SEC-4: Token Expiration and Renewal

**Priority**: 🟡 Medium
**Estimated Effort**: 3-4 hours
**Status**: ✅ COMPLETED

### Description
Tokens should expire and be renewable to limit damage from token compromise.

### Requirements

- [x] Token lifetime: 30 days
- [x] 7 days before expiry, automatically renew on next sync
- [x] Store `expiresAt` with token
- [x] Re-pairing required if token expired without renewal
- [ ] Option: Short-lived tokens (1 hour) renewed on each sync

### Implementation

- `laptop/src/database/trustManager.ts` - validateAuthToken() checks expiry and auto-renews
- `laptop/src/database/db.ts` - TrustedDevice schema includes tokenExpiresAt
- Token auto-renewal happens during validation if within 7 days of expiry
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

