# Instant Tablet-to-Tablet Sync - Implementation Tasks

**Feature:** Instant Tablet-to-Tablet Sync
**PRD:** [prd.md](./prd.md)
**Status:** Not Started

---

## Task Overview

| Task | Priority | Complexity | Status |
|------|----------|------------|--------|
| 1. Add SyncPriority to Triggers | High | Low | Not Started |
| 2. Implement Immediate Sync Path | High | Medium | Not Started |
| 3. Tablet-First Ordering | Medium | Low | Not Started |
| 4. Add DataChangedEvent Flow | High | Medium | Not Started |
| 5. Update ViewModels for Auto-Refresh | High | Medium | Not Started |
| 6. Adjust Periodic Intervals | Low | Low | Not Started |

---

## Task 1: Add SyncPriority to Triggers

**Files:**
- `app/src/main/java/com/club/medlems/data/sync/SyncTrigger.kt`
- `app/src/main/java/com/club/medlems/data/sync/SyncManager.kt`

**Changes:**

1. Add `SyncPriority` enum:
```kotlin
enum class SyncPriority {
    IMMEDIATE,  // No debounce, tablets only
    NORMAL      // 2-second debounce, all devices
}
```

2. Add fields to `SyncTrigger.EntityChanged`:
```kotlin
data class EntityChanged(
    val entityType: String,
    val entityId: String,
    val operation: String,
    val priority: SyncPriority = SyncPriority.NORMAL,
    val targetDeviceTypes: Set<DeviceType>? = null  // null = all
) : SyncTrigger()
```

3. Update `notifyEntityChanged()` in SyncManager to set priority based on entity type.

**Acceptance Criteria:**
- [ ] SyncPriority enum exists
- [ ] EntityChanged trigger has priority field
- [ ] CheckIn, PracticeSession, NewMemberRegistration get IMMEDIATE priority
- [ ] Other entity types get NORMAL priority

---

## Task 2: Implement Immediate Sync Path

**Files:**
- `app/src/main/java/com/club/medlems/data/sync/SyncManager.kt`

**Changes:**

1. Add `syncWithTabletsImmediately()` method:
```kotlin
private suspend fun syncWithTabletsImmediately() {
    val tablets = _connectedPeers.value.filter {
        it.type == DeviceType.MEMBER_TABLET ||
        it.type == DeviceType.TRAINER_TABLET
    }

    if (tablets.isEmpty()) {
        Log.d(TAG, "No tablets connected for immediate sync")
        return
    }

    Log.i(TAG, "Immediate sync to ${tablets.size} tablets")

    coroutineScope {
        tablets.map { tablet ->
            async {
                try {
                    syncWithPeer(tablet)
                } catch (e: Exception) {
                    Log.e(TAG, "Immediate sync to ${tablet.name} failed", e)
                }
            }
        }.awaitAll()
    }
}
```

2. Modify trigger processing to bypass debounce for IMMEDIATE priority:
```kotlin
private fun startTriggerProcessing() {
    scope.launch {
        _syncTriggers.collect { trigger ->
            when {
                trigger is SyncTrigger.EntityChanged &&
                trigger.priority == SyncPriority.IMMEDIATE -> {
                    // Immediate - no debounce
                    syncWithTabletsImmediately()
                }
                else -> {
                    // Normal - debounced
                    debouncedSync()
                }
            }
        }
    }
}
```

**Acceptance Criteria:**
- [ ] IMMEDIATE triggers sync tablets without waiting for debounce
- [ ] NORMAL triggers still use 2-second debounce
- [ ] Tablet sync failures are isolated (one failure doesn't block others)
- [ ] Sync happens in parallel for multiple tablets

---

## Task 3: Tablet-First Ordering

**Files:**
- `app/src/main/java/com/club/medlems/data/sync/SyncManager.kt`

**Changes:**

1. Modify `syncNow()` to sort peers:
```kotlin
suspend fun syncNow(): SyncResult {
    val peers = _connectedPeers.value.filter { trustManager.isTrusted(it.id) }

    // Sort: tablets first, then laptops
    val sortedPeers = peers.sortedBy {
        when (it.type) {
            DeviceType.MEMBER_TABLET, DeviceType.TRAINER_TABLET -> 0
            DeviceType.LAPTOP -> 1
            else -> 2
        }
    }

    // Sync in sorted order
    sortedPeers.forEach { peer ->
        syncWithPeer(peer)
    }

    // ...
}
```

**Acceptance Criteria:**
- [ ] Tablets always sync before laptop
- [ ] Order is consistent: Member tablets, Trainer tablets, then Laptop

---

## Task 4: Add DataChangedEvent Flow

**Files:**
- `app/src/main/java/com/club/medlems/data/sync/SyncManager.kt`
- `app/src/main/java/com/club/medlems/data/sync/SyncRepository.kt`

**Changes:**

1. Add data classes:
```kotlin
data class DataChangedEvent(
    val entityTypes: Set<String>,
    val sourceDeviceId: String,
    val timestamp: Instant
)
```

2. Add SharedFlow to SyncManager:
```kotlin
private val _dataChangedEvents = MutableSharedFlow<DataChangedEvent>(
    replay = 0,
    extraBufferCapacity = 10
)
val dataChangedEvents: SharedFlow<DataChangedEvent> = _dataChangedEvents
```

3. Emit events after `applySyncPayload()`:
```kotlin
// In SyncRepository or SyncManager after applying payload
val changedTypes = mutableSetOf<String>()
if (payload.checkIns.isNotEmpty()) changedTypes.add("CheckIn")
if (payload.practiceSessions.isNotEmpty()) changedTypes.add("PracticeSession")
if (payload.registrations?.isNotEmpty() == true) changedTypes.add("Registration")

if (changedTypes.isNotEmpty()) {
    _dataChangedEvents.emit(DataChangedEvent(
        entityTypes = changedTypes,
        sourceDeviceId = sourceDeviceId,
        timestamp = Clock.System.now()
    ))
}
```

**Acceptance Criteria:**
- [ ] DataChangedEvent is emitted after sync applies data
- [ ] Event includes which entity types changed
- [ ] Event is only emitted if data actually changed

---

## Task 5: Update ViewModels for Auto-Refresh

**Files:**
- Trainer app ViewModels (check-in, session lists)
- Member app ViewModels (check-in display)

**Changes:**

1. Observe `dataChangedEvents` in relevant ViewModels:
```kotlin
init {
    viewModelScope.launch {
        syncManager.dataChangedEvents.collect { event ->
            if ("CheckIn" in event.entityTypes) {
                refreshCheckIns()
            }
            if ("PracticeSession" in event.entityTypes) {
                refreshSessions()
            }
        }
    }
}
```

2. Add refresh methods that re-query the database.

3. Ensure Room LiveData/Flow observers are properly set up for lists.

**Acceptance Criteria:**
- [ ] Trainer tablet refreshes check-in list on sync
- [ ] Trainer tablet refreshes session list on sync
- [ ] Member tablet refreshes display on sync
- [ ] No manual action required to see new data

---

## Task 6: Adjust Periodic Intervals

**Files:**
- `app/src/main/java/com/club/medlems/data/sync/SyncManager.kt`

**Changes:**

1. Add separate intervals:
```kotlin
companion object {
    private val TABLET_SYNC_INTERVAL = 1.minutes   // Faster for tablets
    private val LAPTOP_SYNC_INTERVAL = 5.minutes   // Slower for laptop
}
```

2. Modify periodic sync to use different intervals based on peer type, or run two separate periodic loops.

**Acceptance Criteria:**
- [ ] Tablets sync every 1 minute
- [ ] Laptop syncs every 5 minutes
- [ ] Immediate sync still works independently of periodic

---

## Testing

### Manual Test Scenarios

1. **Check-in instant sync**
   - Check in member on Trainer tablet
   - Verify appears on Member tablet within 2 seconds
   - Repeat in reverse direction

2. **Session instant sync**
   - Register practice session on Trainer tablet
   - Verify appears on Member tablet within 2 seconds

3. **UI auto-refresh**
   - Have check-in list open on Trainer tablet
   - Check in member on Member tablet
   - Verify list updates without any tap/scroll

4. **Laptop delayed sync**
   - Check in member on tablet
   - Verify laptop doesn't immediately sync
   - Wait 5 minutes, verify laptop receives data

5. **Fallback periodic sync**
   - Disconnect tablets briefly during check-in
   - Reconnect
   - Verify data syncs within 1 minute

---

## Dependencies

- Requires current sync infrastructure (SyncManager, SyncClient, SyncRepository)
- Requires device discovery and trust system
- No external dependencies

---

## Rollback Plan

If issues arise, revert to normal debounce for all triggers:
```kotlin
// In notifyEntityChanged()
priority = SyncPriority.NORMAL  // Always normal, no immediate
```
