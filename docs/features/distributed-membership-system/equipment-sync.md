# Equipment Sync Implementation

> **Last Updated**: 2026-01-19
> **Status**: Implemented
> **Related**: FR-8 (Equipment Management), FR-18 (Sync Protocol)

---

## Overview

Equipment check-in/check-out operations now sync bidirectionally between tablets and the laptop. This ensures:

- Equipment status is consistent across all devices
- Check-outs and returns are visible on all connected devices
- Conflict detection for equipment already checked out

---

## Data Flow

```
┌─────────────────┐                    ┌─────────────────┐
│  Trainer Tablet │                    │  Master Laptop  │
│                 │                    │                 │
│  Check out      │ ───── push ─────►  │  Receives       │
│  equipment      │                    │  checkout       │
│                 │                    │                 │
│  Receives       │ ◄──── pull ─────   │  Updates status │
│  status update  │                    │  or resolves    │
└─────────────────┘                    └─────────────────┘
        │                                      │
        │                                      │
        ▼                                      ▼
┌─────────────────┐                    ┌─────────────────┐
│  Other Tablets  │ ◄── sync both ──►  │  All devices    │
│  see equipment  │      ways          │  stay in sync   │
│  status         │                    │                 │
└─────────────────┘                    └─────────────────┘
```

---

## Synced Entities

### EquipmentItem

Represents a piece of equipment (rifle, pistol, accessory, etc.)

| Field | Type | Description |
|-------|------|-------------|
| id | String | Unique identifier |
| serialNumber | String | Physical serial number |
| type | Enum | TRAINING_MATERIAL, RIFLE, PISTOL, ACCESSORY, etc. |
| status | Enum | AVAILABLE, CHECKED_OUT, MAINTENANCE, RETIRED |
| description | String? | Optional notes |
| syncVersion | Long | Incremented on each update |
| syncedAtUtc | Instant? | Last sync timestamp |

### EquipmentCheckout

Represents a check-out/return transaction

| Field | Type | Description |
|-------|------|-------------|
| id | String | Unique identifier |
| equipmentId | String | Reference to EquipmentItem |
| membershipId | String | Member who checked out |
| checkedOutAtUtc | Instant | When checked out |
| checkedInAtUtc | Instant? | When returned (null = still out) |
| checkedOutByDeviceId | String | Device that recorded checkout |
| checkedInByDeviceId | String? | Device that recorded return |
| checkoutNotes | String? | Notes on checkout |
| checkinNotes | String? | Notes on return |
| conflictStatus | Enum? | For conflict resolution |
| syncVersion | Long | Incremented on each update |

---

## Sync Logic

### Push (Device → Peers)

```kotlin
// Android: SyncRepository.collectUnsyncedEntities()
val unsyncedItems = equipmentItemDao.getUnsynced()
val unsyncedCheckouts = equipmentCheckoutDao.getUnsynced()

// Convert to sync format
val syncItems = unsyncedItems.map { it.toSyncable(deviceId) }
val syncCheckouts = unsyncedCheckouts.map { it.toSyncable(deviceId) }
```

### Receive (Peers → Device)

```kotlin
// Android: SyncRepository.applySyncPayload()
payload.entities.equipmentItems.forEach { syncItem ->
    val existing = equipmentItemDao.get(syncItem.id)
    when {
        existing == null -> equipmentItemDao.insert(syncItem.toEntity())
        syncItem.syncVersion > existing.syncVersion -> equipmentItemDao.update(syncItem.toEntity())
        // else: skip (already up to date)
    }
}

// Same logic for checkouts
payload.entities.equipmentCheckouts.forEach { syncCheckout ->
    val existing = equipmentCheckoutDao.get(syncCheckout.id)
    when {
        existing == null -> equipmentCheckoutDao.insert(syncCheckout.toEntity())
        syncCheckout.syncVersion > existing.syncVersion -> equipmentCheckoutDao.update(syncCheckout.toEntity())
    }
}
```

---

## Conflict Detection

Equipment conflicts can occur when:

1. Same equipment checked out on multiple devices simultaneously
2. Equipment returned on one device while another shows it as out

### Resolution

- `syncVersion` comparison determines which record wins
- Laptop can manually resolve conflicts via admin UI
- `conflictStatus` field tracks resolution state

---

## API Endpoints

### POST /api/sync/push

Accepts equipment in payload:

```json
{
  "schemaVersion": "1.0.0",
  "deviceId": "tablet-1",
  "deviceType": "TRAINER_TABLET",
  "timestamp": "2026-01-19T10:00:00Z",
  "entities": {
    "equipmentItems": [...],
    "equipmentCheckouts": [...]
  }
}
```

### GET /api/sync/pull

Returns equipment in response:

```json
{
  "schemaVersion": "1.0.0",
  "deviceId": "laptop-master",
  "deviceType": "LAPTOP",
  "timestamp": "2026-01-19T10:00:00Z",
  "entities": {
    "members": [...],
    "equipmentItems": [...],
    "equipmentCheckouts": [...]
  }
}
```

---

## Files Modified

### Android

- [SyncRepository.kt](../../../app/src/main/java/com/club/medlems/data/sync/SyncRepository.kt)
  - Added `equipmentItemDao` and `equipmentCheckoutDao` injections
  - Added equipment to `collectUnsyncedEntities()`
  - Added equipment processing to `applySyncPayload()`
  - Added `toSyncable()` and `toEntity()` converters
  - Added `markEquipmentItemSynced()` and `markEquipmentCheckoutSynced()`

- [Daos.kt](../../../app/src/main/java/com/club/medlems/data/dao/Daos.kt)
  - `EquipmentItemDao.getUnsynced()` - returns unsynced items
  - `EquipmentItemDao.markSynced()` - marks item as synced
  - `EquipmentCheckoutDao.getUnsynced()` - returns unsynced checkouts
  - `EquipmentCheckoutDao.markSynced()` - marks checkout as synced

### Laptop

- [syncService.ts](../../../laptop/src/database/syncService.ts)
  - Added `processEquipmentItem()` - processes incoming equipment items
  - Added `processEquipmentCheckout()` - processes incoming checkouts
  - Added `getEquipmentForSync()` - returns equipment for pull response
  - Updated `processSyncPayload()` - processes equipment entities

- [App.tsx](../../../laptop/src/App.tsx)
  - Updated `onGetMembersRequest` to include equipment in response

- [main.cjs](../../../laptop/electron/main.cjs)
  - Updated `/api/sync/pull` to include equipment in response

---

## Tests

### Laptop (Vitest)

```bash
cd laptop && npm test
```

- `should insert new equipment item when ID does not exist`
- `should update equipment item when incoming syncVersion is higher`
- `should skip equipment item when local syncVersion >= incoming`
- `should insert new checkout when ID does not exist`
- `should update checkout with check-in time when returned`
- `should sync equipment between tablets and laptop`

### Android (JUnit)

```bash
./gradlew :app:testMemberDebugUnitTest --tests "com.club.medlems.data.sync.*"
```

---

## Usage Example

### Trainer checks out equipment (Tablet)

1. Trainer selects member and equipment on tablet
2. Tablet creates `EquipmentCheckout` record
3. Tablet updates `EquipmentItem.status` to `CHECKED_OUT`
4. On next sync, both records push to laptop and other tablets

### Member returns equipment (Any device)

1. Staff scans or selects the equipment
2. Device updates `EquipmentCheckout.checkedInAtUtc`
3. Device updates `EquipmentItem.status` to `AVAILABLE`
4. Changes sync to all devices

---

## Future Enhancements

- [ ] Real-time push notifications for equipment status changes
- [ ] Equipment reservation system
- [ ] Maintenance scheduling with sync support
- [ ] Equipment usage analytics across devices
