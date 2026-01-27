# Member Preference Sync - Design Document

**Created:** 2026-01-21
**Completed:** 2026-01-21
**Status:** Complete

---

## Overview

Sync member practice preferences (last selected discipline and classification) between tablets via the laptop, enabling seamless tablet replacement without losing user convenience settings.

---

## Problem

When replacing a Member tablet:
- Current `LastClassificationStore` uses local SharedPreferences
- Preferences are lost when tablet is replaced
- Members must re-select their discipline/classification on first scan

---

## Solution

Add `MemberPreference` to the sync system:
1. Store preferences in Room database (not just SharedPreferences)
2. Sync preferences from Member tablet → Laptop
3. Sync preferences from Laptop → new Member tablet during initial sync

---

## Data Model

### MemberPreference Entity

```kotlin
@Entity(tableName = "member_preference")
data class MemberPreference(
    @PrimaryKey
    val memberId: String,           // internalMemberId
    val lastPracticeType: String?,  // PracticeType enum name
    val lastClassification: String?,
    val updatedAtUtc: Instant
)
```

### Syncable Version

```kotlin
@Serializable
data class SyncableMemberPreference(
    val memberId: String,
    val lastPracticeType: String?,
    val lastClassification: String?,
    val updatedAtUtc: Instant
)
```

---

## Sync Flow

### Member Tablet → Laptop

1. Member scans in, selects discipline/classification
2. `LastClassificationStore.set()` saves to:
   - SharedPreferences (for fast local access)
   - Room database (for sync)
3. On next sync push, include `memberPreferences` in payload
4. Laptop stores in `MemberPreference` table

### Laptop → New Member Tablet

1. New tablet pairs with laptop
2. Initial sync includes `memberPreferences` from laptop
3. Tablet processes preferences:
   - Inserts into Room database
   - Updates SharedPreferences via `LastClassificationStore`

---

## Implementation

### Android Changes

1. **Room Entity:** `MemberPreference.kt`
2. **DAO:** `MemberPreferenceDao.kt`
3. **Add to AppDatabase**
4. **Update SyncEntities:** Add `memberPreferences` field
5. **Update SyncClient:** Include preferences in push payload
6. **Update LastClassificationStore:** Write to Room DB
7. **Process incoming preferences:** On initial sync

### Laptop Changes

1. **Schema:** Add `MemberPreference` table
2. **Types:** Add `SyncableMemberPreference` interface
3. **SyncService:** Process incoming preferences
4. **Full sync payload:** Include preferences for tablets

---

## Filtering by Device Type

Only Member tablets need these preferences. The laptop already checks `deviceType` and can:
- Send preferences only to MEMBER_TABLET devices
- Skip sending to TRAINER_TABLET, EQUIPMENT_DISPLAY, PRACTICE_DISPLAY

---

## Schema Version

Bump to 1.2.0 (minor version for backward-compatible addition)
