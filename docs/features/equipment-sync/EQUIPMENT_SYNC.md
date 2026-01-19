# Equipment Sync Implementation

This document describes the tablet-to-laptop sync implementation for equipment check-in/out operations.

## Overview

Equipment items and their checkout records now sync bidirectionally between Android tablets and the laptop application. This enables:

- Equipment created on any device to be available on all devices
- Checkout/check-in operations to propagate across the network
- Conflict detection for concurrent checkout attempts

## Architecture

### Sync Flow

```
┌─────────────┐     Push (POST /api/sync/push)      ┌─────────────┐
│   Tablet    │ ─────────────────────────────────► │   Laptop    │
│  (Android)  │ ◄───────────────────────────────── │  (Electron) │
└─────────────┘     Pull (GET /api/sync/pull)       └─────────────┘
```

### Entity Types

1. **EquipmentItem**: Physical equipment (e.g., training materials)
   - Syncs via `equipmentItems` array in sync payload
   - Version-based conflict resolution using `syncVersion`

2. **EquipmentCheckout**: Checkout/check-in records
   - Syncs via `equipmentCheckouts` array in sync payload
   - Includes check-in status for return tracking
   - Supports conflict status for concurrent checkout detection

## Data Model

### SyncableEquipmentItem

| Field | Type | Description |
|-------|------|-------------|
| id | String | Unique identifier (UUID) |
| serialNumber | String | Human-readable equipment identifier |
| type | String | Equipment category (e.g., "TRAINING_MATERIAL") |
| description | String? | Optional description (max 200 chars) |
| status | String | AVAILABLE, CHECKED_OUT, MAINTENANCE, RETIRED |
| deviceId | String | Device that last modified this record |
| syncVersion | Long | Monotonically increasing version number |
| createdAtUtc | Instant | Creation timestamp |
| modifiedAtUtc | Instant | Last modification timestamp |
| syncedAtUtc | Instant? | Last sync timestamp |

### SyncableEquipmentCheckout

| Field | Type | Description |
|-------|------|-------------|
| id | String | Unique identifier (UUID) |
| equipmentId | String | Reference to EquipmentItem |
| membershipId | String | Reference to Member |
| checkedOutAtUtc | Instant | Checkout timestamp |
| checkedInAtUtc | Instant? | Check-in timestamp (null if still out) |
| checkedOutByDeviceId | String | Device that performed checkout |
| checkedInByDeviceId | String? | Device that performed check-in |
| checkoutNotes | String? | Notes at checkout (max 500 chars) |
| checkinNotes | String? | Notes at return (max 500 chars) |
| conflictStatus | String? | PENDING, RESOLVED, CANCELLED |
| deviceId | String | Device that last modified this record |
| syncVersion | Long | Monotonically increasing version number |

## Implementation Details

### Android (SyncRepository.kt)

**Collecting equipment for sync:**

```kotlin
suspend fun collectChangesSince(since: Instant, deviceId: String): SyncEntities {
    val equipmentItems = equipmentItemDao.getUnsynced()
        .map { it.toSyncable(deviceId) }
    val equipmentCheckouts = equipmentCheckoutDao.getUnsynced()
        .map { it.toSyncable(deviceId) }
    // ... includes in SyncEntities
}
```

**Applying incoming equipment:**

```kotlin
// Process equipment items - version-based upsert
payload.entities.equipmentItems.forEach { syncItem ->
    val existing = equipmentItemDao.get(syncItem.id)
    if (existing == null) {
        equipmentItemDao.insert(syncItem.toEntity())
    } else if (syncItem.syncVersion > existing.syncVersion) {
        equipmentItemDao.update(syncItem.toEntity())
    }
}

// Process checkouts - handles check-in from other device
payload.entities.equipmentCheckouts.forEach { syncCheckout ->
    val existing = equipmentCheckoutDao.get(syncCheckout.id)
    if (existing == null) {
        equipmentCheckoutDao.insert(syncCheckout.toEntity())
    } else if (syncCheckout.syncVersion > existing.syncVersion) {
        equipmentCheckoutDao.update(syncCheckout.toEntity())
    }
}
```

### Laptop (syncService.ts)

**Processing incoming equipment:**

```typescript
async function processEquipmentItem(item: SyncableEquipmentItem): Promise<boolean> {
    const existing = query('SELECT id, syncVersion FROM EquipmentItem WHERE id = ?', [item.id]);
    
    if (existing.length > 0) {
        if (existing[0].syncVersion >= item.syncVersion) {
            return false; // Our version is same or newer
        }
        // Update existing
        execute('UPDATE EquipmentItem SET ...', [...]);
        return true;
    }
    
    // Insert new
    execute('INSERT INTO EquipmentItem ...', [...]);
    return true;
}
```

**Sending equipment to tablets:**

```typescript
export function getEquipmentForSync(): { 
    equipmentItems: SyncableEquipmentItem[], 
    equipmentCheckouts: SyncableEquipmentCheckout[] 
} {
    const items = query('SELECT ... FROM EquipmentItem');
    const checkouts = query('SELECT ... FROM EquipmentCheckout');
    return { equipmentItems: items, equipmentCheckouts: checkouts };
}
```

## Conflict Resolution

Equipment sync uses **version-based conflict resolution**:

1. Each entity has a `syncVersion` field
2. When syncing, the higher `syncVersion` wins
3. The `syncVersion` is incremented on each local modification

For concurrent checkout conflicts:

1. If equipment is already checked out on one device
2. And another device attempts checkout before sync
3. The `conflictStatus` field is set to `PENDING`
4. Manual resolution is required via the UI

## Related Files

### Android

- [SyncRepository.kt](../../../app/src/main/java/com/club/medlems/data/sync/SyncRepository.kt) - Main sync logic
- [SyncableEntities.kt](../../../app/src/main/java/com/club/medlems/data/sync/SyncableEntities.kt) - Sync data types
- [Daos.kt](../../../app/src/main/java/com/club/medlems/data/dao/Daos.kt) - EquipmentItemDao, EquipmentCheckoutDao
- [Entities.kt](../../../app/src/main/java/com/club/medlems/data/entity/Entities.kt) - EquipmentItem, EquipmentCheckout

### Laptop

- [syncService.ts](../../../laptop/src/database/syncService.ts) - Sync processing
- [entities.ts](../../../laptop/src/types/entities.ts) - Type definitions
- [main.cjs](../../../laptop/electron/main.cjs) - HTTP sync endpoints
- [App.tsx](../../../laptop/src/App.tsx) - IPC handlers for sync

## Testing

Equipment sync is covered by:

- **Android unit tests**: SyncVersionTest, DeviceTypeFilteringTest
- **Laptop Vitest tests**: syncService.test.ts

## See Also

- [SPEC.md](../../../SPEC.md) - Full system specification
- [SD_CARD_SYNC.md](../../../SD_CARD_SYNC.md) - Offline sync documentation
