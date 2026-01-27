# Member Preference Sync - Tasks

**Feature:** Member Preference Sync
**Design:** [design.md](design.md)
**Created:** 2026-01-21
**Completed:** 2026-01-21
**Status:** ✅ COMPLETE

---

## Overview

Sync member practice preferences (last selected discipline and classification) between tablets via the laptop, enabling seamless tablet replacement without losing user convenience settings.

---

## Completed Tasks

### 1. Android: Room Entity and DAO

**Status:** Complete

- [x] Created `MemberPreference` entity in `Entities.kt`
- [x] Created `MemberPreferenceDao` in `Daos.kt`
- [x] Added entity to `AppDatabase.kt` (version 12)
- [x] Created migration `MIGRATION_11_12` in `DatabaseModule.kt`
- [x] Added Hilt provider for `MemberPreferenceDao`

**Files Modified:**
- `app/src/main/java/com/club/medlems/data/entity/Entities.kt`
- `app/src/main/java/com/club/medlems/data/dao/Daos.kt`
- `app/src/main/java/com/club/medlems/data/db/AppDatabase.kt`
- `app/src/main/java/com/club/medlems/di/DatabaseModule.kt`

---

### 2. Android: Sync Payload Integration

**Status:** Complete

- [x] Created `SyncableMemberPreference` in `SyncableEntities.kt`
- [x] Added `memberPreferences` field to `SyncEntities` in `SyncPayload.kt`
- [x] Updated `totalCount` calculation to include preferences

**Files Modified:**
- `app/src/main/java/com/club/medlems/data/sync/SyncableEntities.kt`
- `app/src/main/java/com/club/medlems/data/sync/SyncPayload.kt`

---

### 3. Android: LastClassificationStore Update

**Status:** Complete

- [x] Injected `MemberPreferenceDao` into `LastClassificationStore`
- [x] Updated `set()` to write to both SharedPreferences and Room
- [x] Added `applyFromSync()` method for processing incoming preferences

**Files Modified:**
- `app/src/main/java/com/club/medlems/domain/prefs/LastClassificationStore.kt`

---

### 4. Android: SyncRepository Integration

**Status:** Complete

- [x] Injected `MemberPreferenceDao` and `LastClassificationStore`
- [x] Updated `collectUnsyncedEntities()` to include preferences when pushing to laptop
- [x] Updated `applySyncPayload()` to process incoming preferences (MEMBER_TABLET only)
- [x] Added `MemberPreference` to/from `SyncableMemberPreference` converters

**Files Modified:**
- `app/src/main/java/com/club/medlems/data/sync/SyncRepository.kt`

---

### 5. Laptop: Database and Sync Service

**Status:** Complete

- [x] Added `MemberPreference` table to schema in `db.ts`
- [x] Added migration for existing databases
- [x] Created `SyncableMemberPreference` interface in `syncService.ts`
- [x] Updated `SyncPayload` interface to include `memberPreferences`
- [x] Updated `SyncResult` to include `memberPreferencesProcessed`
- [x] Added `processMemberPreference()` function
- [x] Added `getMemberPreferencesForSync()` export
- [x] Updated `getFullSyncPayload()` to accept deviceType and include preferences

**Files Modified:**
- `laptop/src/database/db.ts`
- `laptop/src/database/syncService.ts`

---

### 6. Laptop: IPC and Type Updates

**Status:** Complete

- [x] Updated `main.cjs` to pass deviceType in sync:get-members request
- [x] Updated `main.cjs` to include memberPreferences in entities
- [x] Updated `App.tsx` to handle deviceType and include preferences
- [x] Updated `MemberDataPayload` interface in `electron.ts`
- [x] Added `SyncableMemberPreference` type in `electron.ts`

**Files Modified:**
- `laptop/electron/main.cjs`
- `laptop/src/App.tsx`
- `laptop/src/types/electron.ts`

---

### 7. Schema Version Bump

**Status:** Complete

- [x] Bumped Android `SyncSchemaVersion` to 1.2.0 in `SyncMetadata.kt`
- [x] Bumped Laptop `SYNC_SCHEMA_VERSION` to 1.2.0 in `syncService.ts`

**Files Modified:**
- `app/src/main/java/com/club/medlems/data/sync/SyncMetadata.kt`
- `laptop/src/database/syncService.ts`

---

## Build Verification

- [x] `assembleMemberDebug` - BUILD SUCCESSFUL
- [x] `npm run build` (laptop) - BUILD SUCCESSFUL
- [x] `npm test` (laptop) - 52 tests passed

---

## Sync Flow Summary

### Member Tablet -> Laptop (Push)

1. Member scans in and selects discipline/classification
2. `LastClassificationStore.set()` saves to SharedPreferences and Room DB
3. On next sync push, `SyncRepository.collectUnsyncedEntities()` includes preferences
4. Laptop receives and stores in `MemberPreference` table via `processMemberPreference()`

### Laptop -> Member Tablet (Pull)

1. New tablet pairs with laptop
2. Tablet requests sync pull with deviceType = MEMBER_TABLET
3. Laptop includes `memberPreferences` in response via `getMemberPreferencesForSync()`
4. Tablet receives and processes via `SyncRepository.applySyncPayload()`
5. `LastClassificationStore.applyFromSync()` updates both Room and SharedPreferences

---

## Testing Notes

1. On existing member tablet, select a discipline and classification
2. Verify preference is synced to laptop on next push
3. Set up new member tablet and pair with laptop
4. Verify preferences are received on first sync
5. Scan a member - their last preference should be pre-selected
