# Instant Tablet-to-Tablet Sync - Product Requirements Document

**Feature:** Instant Tablet-to-Tablet Sync
**Created:** 2026-02-03
**Status:** Draft
**Priority:** High

---

## Executive Summary

When a check-in or practice session is registered on one tablet, it should appear on the other tablet within seconds. The current 2-second debounce and 5-minute periodic sync is too slow for real-time operational use.

**Key Insight:** Tablets are in active use during training sessions. A trainer checking in a member needs to see that check-in reflected immediately on the member tablet (and vice versa). The laptop can sync less frequently since it's used for administrative purposes.

**Scope:** Instant tablet-to-tablet sync on all operational events + UI refresh on sync receive

---

## Clarified Requirements

| Question | Decision |
|----------|----------|
| When to trigger sync? | **Both foreground + background service** - immediate when active, background catches up |
| Offline tablet handling? | **Retry in 1 minute** via periodic sync fallback |
| UI notification on sync? | **Silent refresh** - just update the list, no toast/badge |
| Target latency? | **< 2 seconds** between tablets |
| Rapid check-ins (5 in 10s)? | **Each triggers sync** - no batching, every event syncs immediately |
| Laptop sync? | **Periodic only (5 min)** - pull-based is acceptable |
| Which entity types? | **All operational data** - CheckIn, PracticeSession, EquipmentCheckout, NewRegistration |

---

## Problem Statement

### Current Behavior

1. **2-second debounce** on entity changes before sync triggers
2. **No device prioritization** - tablets and laptop treated equally
3. **Sequential sync** - all peers synced in order, no fast-path for tablets
4. **5-minute periodic fallback** - too long if immediate sync fails
5. **UI may not refresh** - trainer tablet might not update views when new data arrives

### User Impact

- "I just checked in a member on the trainer tablet, but it doesn't show on the member tablet"
- Confusion about whether check-in was successful
- Manual workarounds (double-checking, manually refreshing)
- Perception that the system is unreliable

---

## Goals

### Primary Goals

1. **Instant tablet sync** - Check-ins/registrations sync to other tablets within 1-2 seconds
2. **Tablet priority** - Sync with tablets first, laptop can wait
3. **UI auto-refresh** - Views update automatically when sync data arrives
4. **Reliable fallback** - Periodic sync catches anything missed

### Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Tablet-to-tablet sync latency | 2-7 seconds | < 2 seconds |
| UI refresh on sync receive | Manual/delayed | Automatic |
| Laptop sync frequency | Same as tablets | Lower priority |

---

## Network Topology (Updated)

```
                    ┌─────────────────────┐
                    │   LAPTOP (Master)   │
                    │   Pull-based only   │
                    │   (5-min periodic)  │
                    └──────────┬──────────┘
                               │
                    Pulls from tablets every 5 min
                    (no push from tablets to laptop)
                               │
         ┌─────────────────────┼─────────────────────┐
         │                     │                     │
         ▼                     ▼                     ▼
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│  MEMBER TABLET  │◄══►│  MEMBER TABLET  │◄══►│ TRAINER TABLET  │
│                 │   │                 │   │                 │
└─────────────────┘   └─────────────────┘   └─────────────────┘
         ▲                     ▲                     ▲
         │                     │                     │
         └═════════════════════╧═════════════════════┘
                  INSTANT SYNC (< 2 seconds)
                  On: CheckIn, PracticeSession,
                      EquipmentCheckout, NewRegistration
```

---

## Proposed Solution

### 1. Immediate Sync for Operational Events (No Debounce)

All operational entity types trigger **immediate** sync to tablets, bypassing the 2-second debounce:

| Entity Type | Immediate Sync to Tablets | Sync to Laptop |
|-------------|--------------------------|----------------|
| CheckIn | Yes (0ms) | Periodic (5 min) |
| PracticeSession | Yes (0ms) | Periodic (5 min) |
| Member (new TRIAL registration) | Yes (0ms) | Periodic (5 min) |
| EquipmentCheckout | Yes (0ms) | Periodic (5 min) |
| Member (edit existing) | No (debounced) | Periodic (5 min) |
| Equipment (inventory) | No (debounced) | Periodic (5 min) |

**No batching:** Each check-in/registration triggers its own immediate sync. This ensures < 2 second latency even during rapid check-ins.

**Important:** New trial member registrations must sync to OTHER TABLETS (not just laptop). Currently, Member entities only sync to laptop. This requires changing the sync filtering logic.

### 2. Tablet-First Sync Order

When sync is triggered, prioritize tablets over laptop:

```kotlin
fun syncNow() {
    val tablets = connectedPeers.filter { it.type != DeviceType.LAPTOP }
    val laptops = connectedPeers.filter { it.type == DeviceType.LAPTOP }

    // Sync tablets first (parallel)
    tablets.forEach { syncWithPeer(it) }

    // Then sync laptop (lower priority)
    laptops.forEach { syncWithPeer(it) }
}
```

### 3. UI Auto-Refresh on Sync Receive

When the `SyncRepository.applySyncPayload()` completes, the UI should automatically refresh:

**Current:** Room database observers may not trigger UI updates for all views

**Proposed:**
- Emit explicit "data changed" events after sync
- Views observe these events and refresh
- Trainer tablet specifically needs to refresh check-in history and session lists

### 4. Reduced Laptop Sync Frequency

| Device Type | Immediate Sync Trigger | Periodic Sync Interval |
|-------------|----------------------|------------------------|
| Tablets | CheckIn, Session, Registration | 1 minute |
| Laptop | None (reactive only) | 5 minutes |

---

## Functional Requirements

### FR-1: Immediate Sync Triggers

**FR-1.1** CheckIn creation SHALL trigger immediate sync to all connected tablets.

**FR-1.2** PracticeSession creation SHALL trigger immediate sync to all connected tablets.

**FR-1.3** New TRIAL Member registration SHALL trigger immediate sync to all connected tablets.

**FR-1.4** EquipmentCheckout creation/update SHALL trigger immediate sync to all connected tablets.

**FR-1.5** Immediate sync SHALL bypass the 2-second debounce.

**FR-1.6** Immediate sync SHALL only target tablet devices (not laptop).

**FR-1.7** Each event SHALL trigger its own sync (no batching of rapid events).

**FR-1.8** Immediate sync SHALL work in both foreground and background (via background service).

**FR-1.9** TRIAL Members SHALL be included in tablet-to-tablet sync (unlike existing members which only sync to laptop).

### FR-2: Tablet Priority

**FR-2.1** When sync is triggered, tablets SHALL be synced before laptop.

**FR-2.2** Multiple tablets MAY be synced in parallel.

**FR-2.3** Laptop sync failure SHALL NOT block tablet sync.

### FR-3: UI Auto-Refresh (Silent)

**FR-3.1** After receiving sync data, the UI SHALL refresh affected views automatically.

**FR-3.2** Check-in lists SHALL update when new check-ins are synced.

**FR-3.3** Session lists SHALL update when new sessions are synced.

**FR-3.4** Registration lists SHALL update when new registrations are synced.

**FR-3.5** Equipment checkout lists SHALL update when new checkouts are synced.

**FR-3.6** UI refresh SHALL occur within 500ms of sync completion.

**FR-3.7** Refresh SHALL be silent (no toast, no badge, no notification) - just update the data.

### FR-4: Periodic Sync Fallback

**FR-4.1** Periodic sync SHALL run every 1 minute between tablets.

**FR-4.2** Periodic sync SHALL run every 5 minutes between tablet and laptop.

**FR-4.3** Periodic sync SHALL catch any missed immediate syncs.

---

## Technical Design

### SyncTrigger Changes

```kotlin
// SyncTrigger.kt - Add priority field
sealed class SyncTrigger {
    abstract val priority: SyncPriority
    abstract val targetDeviceTypes: Set<DeviceType>?

    // Existing triggers with new priority
    data class EntityChanged(
        val entityType: String,
        val entityId: String,
        val operation: String,
        override val priority: SyncPriority = SyncPriority.NORMAL,
        override val targetDeviceTypes: Set<DeviceType>? = null
    ) : SyncTrigger()

    // ... other triggers
}

enum class SyncPriority {
    IMMEDIATE,  // No debounce, tablets only
    NORMAL      // 2-second debounce, all devices
}
```

### SyncManager Changes

```kotlin
// SyncManager.kt - Handle immediate priority

private fun processTrigger(trigger: SyncTrigger) {
    when (trigger.priority) {
        SyncPriority.IMMEDIATE -> {
            // Bypass debounce, sync tablets immediately
            scope.launch {
                syncWithTablets()
            }
        }
        SyncPriority.NORMAL -> {
            // Existing debounced flow
            _syncTriggers.emit(trigger)
        }
    }
}

private suspend fun syncWithTablets() {
    val tablets = _connectedPeers.value.filter {
        it.type != DeviceType.LAPTOP
    }

    // Sync with all tablets in parallel
    coroutineScope {
        tablets.map { tablet ->
            async { syncWithPeer(tablet) }
        }.awaitAll()
    }
}

fun notifyEntityChanged(
    entityType: String,
    entityId: String,
    operation: String
) {
    // All operational data gets IMMEDIATE priority for tablet sync
    val priority = when (entityType) {
        "CheckIn", "PracticeSession", "NewMemberRegistration", "EquipmentCheckout" ->
            SyncPriority.IMMEDIATE
        else ->
            SyncPriority.NORMAL
    }

    val targetTypes = if (priority == SyncPriority.IMMEDIATE) {
        setOf(DeviceType.MEMBER_TABLET, DeviceType.TRAINER_TABLET)
    } else {
        null // All devices (debounced)
    }

    // No batching - each event triggers immediately
    scope.launch {
        if (priority == SyncPriority.IMMEDIATE) {
            // Bypass debounce entirely - sync now
            syncWithTabletsImmediately()
        } else {
            // Normal debounced path
            _syncTriggers.emit(
                SyncTrigger.EntityChanged(
                    entityType = entityType,
                    entityId = entityId,
                    operation = operation,
                    priority = priority,
                    targetDeviceTypes = targetTypes
                )
            )
        }
    }
}
```

### UI Refresh via SharedFlow

```kotlin
// SyncManager.kt - Add data changed event
private val _dataChangedEvents = MutableSharedFlow<DataChangedEvent>()
val dataChangedEvents: SharedFlow<DataChangedEvent> = _dataChangedEvents

data class DataChangedEvent(
    val entityTypes: Set<String>,
    val sourceDeviceId: String,
    val timestamp: Instant
)

// In applySyncPayload()
suspend fun applySyncPayload(payload: SyncPayload, sourceDeviceId: String) {
    // ... existing apply logic ...

    // Emit event for UI refresh
    val changedTypes = mutableSetOf<String>()
    if (payload.checkIns.isNotEmpty()) changedTypes.add("CheckIn")
    if (payload.practiceSessions.isNotEmpty()) changedTypes.add("PracticeSession")
    if (payload.registrations.isNotEmpty()) changedTypes.add("Registration")

    if (changedTypes.isNotEmpty()) {
        _dataChangedEvents.emit(DataChangedEvent(
            entityTypes = changedTypes,
            sourceDeviceId = sourceDeviceId,
            timestamp = Clock.System.now()
        ))
    }
}
```

### ViewModel Observation

```kotlin
// TrainerViewModel.kt (example)
init {
    // Observe sync data changes
    viewModelScope.launch {
        syncManager.dataChangedEvents.collect { event ->
            if ("CheckIn" in event.entityTypes ||
                "PracticeSession" in event.entityTypes) {
                refreshCheckInData()
            }
        }
    }
}

private fun refreshCheckInData() {
    // Re-query database to refresh UI
    viewModelScope.launch {
        _checkIns.value = checkInRepository.getTodaysCheckIns()
    }
}
```

---

## Code Changes Required

### Change 1: Allow Trial Members to Sync Between Tablets

Currently, Members only sync to laptop. Two places filter this:

**SyncRepository.kt:442-446**
```kotlin
// CURRENT: Only include members when pushing to laptop
val members = if (destinationDeviceType == DeviceType.LAPTOP) {
    memberDao.getUnsynced().map { it.toSyncable(deviceId) }
} else {
    emptyList()
}
```

**SyncOutboxManager.kt:159-165**
```kotlin
// CURRENT: Only include members when pushing to laptop
"Member" -> {
    if (destinationDeviceType == DeviceType.LAPTOP) {
        members.add(json.decodeFromString<SyncableMember>(entry.payload))
        outboxIds.add(entry.id)
    }
}
```

**CHANGE NEEDED:** Allow TRIAL members (new registrations) to sync to tablets:

```kotlin
// PROPOSED: Include TRIAL members for tablet sync
val members = if (destinationDeviceType == DeviceType.LAPTOP) {
    // Laptop gets all members
    memberDao.getUnsynced().map { it.toSyncable(deviceId) }
} else {
    // Tablets only get TRIAL members (new registrations)
    memberDao.getUnsynced()
        .filter { it.memberType == MemberType.TRIAL }
        .map { it.toSyncable(deviceId) }
}
```

---

## Implementation Tasks

### Task 1: Add SyncPriority to Triggers
- Add `priority` and `targetDeviceTypes` fields to `SyncTrigger`
- Modify `notifyEntityChanged()` to set IMMEDIATE priority for critical types

### Task 2: Implement Immediate Sync Path
- Add `syncWithTablets()` method that bypasses debounce
- Modify trigger processing to handle IMMEDIATE priority
- Sync tablets in parallel

### Task 3: Tablet-First Ordering
- Modify `syncNow()` to sort peers (tablets first, laptop last)
- Add error isolation (tablet failure doesn't block laptop)

### Task 4: Add DataChangedEvent Flow
- Create `DataChangedEvent` data class
- Add `dataChangedEvents` SharedFlow to SyncManager
- Emit events from `applySyncPayload()`

### Task 5: Update ViewModels
- Trainer ViewModel: observe data changes, refresh views
- Member ViewModel: observe data changes, refresh views
- Ensure Room observers are working for live queries

### Task 6: Adjust Periodic Intervals
- Reduce tablet-to-tablet periodic interval to 1 minute
- Keep laptop periodic interval at 5 minutes

---

## Testing Checklist

- [ ] Check-in on Trainer tablet appears on Member tablet within 2 seconds
- [ ] Check-in on Member tablet appears on Trainer tablet within 2 seconds
- [ ] Practice session syncs immediately between tablets
- [ ] New registration syncs immediately between tablets
- [ ] Equipment checkout syncs immediately between tablets
- [ ] Laptop receives data within 5 minutes (pull-based, not push)
- [ ] UI refreshes silently without any toast/notification
- [ ] If immediate sync fails, periodic sync catches it within 1 minute
- [ ] Multiple tablets sync in parallel (not sequential)
- [ ] 5 rapid check-ins (within 10 seconds) each sync independently
- [ ] Sync works when app is in background (background service)

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Network congestion from frequent syncs | Only critical events trigger immediate sync |
| Battery drain on tablets | Immediate sync is lightweight (single entity) |
| Race conditions with parallel sync | Sync payload includes timestamps for ordering |
| UI flicker from rapid refreshes | Debounce UI updates at 500ms |

---

## Success Criteria

1. **< 2 second sync latency** for check-ins between tablets
2. **Automatic UI refresh** - no manual action needed
3. **Zero missed syncs** - periodic fallback catches all
4. **No impact on laptop** - still syncs normally on 5-minute interval
