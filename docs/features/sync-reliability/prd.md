# Sync Reliability Hardening - Product Requirements Document

**Feature:** Sync Reliability Hardening
**Created:** 2026-01-23
**Status:** Draft
**Priority:** High

---

## Executive Summary

The current synchronization system has a solid architectural foundation but lacks production-grade reliability. This PRD focuses on hardening the existing sync infrastructure to be "rock solid and error tolerant" with a key architectural enhancement: **tablet-to-tablet mesh sync**.

**Key Insight:** The laptop is typically offline (locked in a safe) and only available a few hours per week. Tablets are the "always on" backbone and must sync with each other directly.

**Scope:** Tablet ↔ Tablet mesh sync + Laptop as occasional sync participant
**Deferred:** TLS encryption (separate future initiative)

---

## Network Topology

```
                    ┌─────────────────────┐
                    │   LAPTOP (Master)   │
                    │   Occasionally On   │
                    │   (few hrs/week)    │
                    └──────────┬──────────┘
                               │
              On discovery:    │    Every 5 min while online:
              Push members     │    Pull check-ins/sessions
              to tablets       │    from tablets
                               │
         ┌─────────────────────┼─────────────────────┐
         │                     │                     │
         ▼                     ▼                     ▼
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│  MEMBER TABLET  │◄─►│  MEMBER TABLET  │◄─►│ TRAINER TABLET  │
│     Always On   │   │    Always On    │   │   Always On     │
└─────────────────┘   └─────────────────┘   └─────────────────┘
         ▲                     ▲                     ▲
         │                     │                     │
         └─────────────────────┴─────────────────────┘
                    MESH SYNC (Near Real-Time)
                    - On local change: push immediately
                    - On device discovery: sync pending changes
```

**Sync Triggers:**

| Scenario | Trigger | Frequency |
|----------|---------|-----------|
| Tablet makes a change | Push to all known tablets | Immediate (debounced 2s) |
| Tablet discovers another tablet | Exchange pending changes | On discovery |
| Laptop comes online | Detect tablets need sync | On discovery |
| Laptop is online | Pull from tablets | Every 5 minutes |
| Manual sync button | Full sync cycle | User-initiated |

---

## Problem Statement

### Current Pain Points

1. **No tablet-to-tablet sync** - Tablets only sync with laptop. When laptop is offline (most of the time), tablets cannot share data with each other.

2. **Manual sync only** - Users must remember to click "Synkronisér nu". Forgetting leads to stale data across devices without any indication.

3. **No crash recovery** - If the app crashes or loses network mid-sync, there's no way to resume. Unsynced changes exist only as timestamps in the database with no queue mechanism.

4. **Silent failures** - When a device is unreachable, sync skips it and continues. Users may not notice that some devices didn't sync.

5. **No automatic retry** - Transient network issues (Wi-Fi hiccup, device sleeping) cause permanent sync failure until manual retry.

6. **Full payload every time** - Even for a single member change, the entire member list is pushed. Inefficient for larger datasets.

### Impact

- **Data inconsistency** - Tablets have different views of check-ins/sessions when laptop is offline
- **Lost work** - Check-ins recorded on one tablet don't appear on others until laptop syncs
- **User frustration** - "I just checked someone in on the other tablet, why don't I see it here?"
- **Support overhead** - Manual sync burden and confusion about data freshness

---

## Goals

### Primary Goals

1. **Tablet mesh sync** - Tablets sync with each other directly, without requiring laptop
2. **Automatic synchronization** - Devices sync without user intervention
3. **Guaranteed delivery** - All changes eventually reach all devices
4. **Graceful failure handling** - Transient errors don't cause data loss
5. **Visible sync status** - Always know when last sync occurred and if anything is pending

### Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Tablet-to-tablet sync | Not supported | Near real-time |
| Sync requires user action | Always | Never (automatic) |
| Data loss on app crash | Possible | Zero |
| Recovery from network failure | Manual | Automatic |
| Sync status visibility | None | Always visible |

### Non-Goals (Deferred)

- TLS/HTTPS encryption (separate initiative)
- Real-time push notifications (WebSocket)
- Multi-laptop federation

---

## Proposed Solution

### Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      SYNC RELIABILITY                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   OUTBOX     │───▶│   SYNC       │───▶│   RETRY      │  │
│  │   QUEUE      │    │   ENGINE     │    │   MANAGER    │  │
│  │              │    │              │    │              │  │
│  │ - Pending    │    │ - Delta calc │    │ - Exp backoff│  │
│  │ - Persisted  │    │ - Batch send │    │ - Max retries│  │
│  │ - Ordered    │    │ - Ack/Nack   │    │ - Dead letter│  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│         │                   │                   │           │
│         └───────────────────┴───────────────────┘           │
│                            │                                 │
│                     ┌──────▼──────┐                         │
│                     │  SCHEDULER  │                         │
│                     │             │                         │
│                     │ - Interval  │                         │
│                     │ - On-change │                         │
│                     │ - On-online │                         │
│                     └─────────────┘                         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Component Breakdown

#### 1. Persistent Outbox Queue

Changes are written to a persistent queue before being synced. The queue survives app crashes and restarts.

**Laptop side:**
```sql
CREATE TABLE SyncOutbox (
  id TEXT PRIMARY KEY,
  entityType TEXT NOT NULL,      -- 'member', 'equipment', etc.
  entityId TEXT NOT NULL,        -- internalId of the entity
  operation TEXT NOT NULL,       -- 'upsert' or 'delete'
  payload TEXT NOT NULL,         -- JSON snapshot at time of change
  targetDeviceId TEXT,           -- NULL = all devices, or specific device
  createdAtUtc TEXT NOT NULL,
  attempts INTEGER DEFAULT 0,
  lastAttemptUtc TEXT,
  lastError TEXT,
  status TEXT DEFAULT 'pending'  -- 'pending', 'in_progress', 'completed', 'failed'
);

CREATE INDEX idx_outbox_status ON SyncOutbox(status, createdAtUtc);
```

**Tablet side (Android Room):**
```kotlin
@Entity(tableName = "sync_outbox")
data class SyncOutboxEntry(
    @PrimaryKey val id: String,
    val entityType: String,
    val entityId: String,
    val operation: String,
    val payload: String,
    val createdAtUtc: Instant,
    var attempts: Int = 0,
    var lastAttemptUtc: Instant? = null,
    var lastError: String? = null,
    var status: String = "pending"
)
```

#### 2. Delta Sync Protocol

Instead of sending full payloads, send only changes since last successful sync.

**Request:**
```http
GET /api/sync/pull?since=2026-01-23T10:00:00Z&deviceId=tablet-001
```

**Response:**
```json
{
  "syncTimestamp": "2026-01-23T10:05:00Z",
  "members": {
    "upserted": [...],    // Members created or updated since timestamp
    "deleted": [...]      // Member IDs that were deleted/merged
  },
  "fullSyncRequired": false  // True if delta is too large or first sync
}
```

**Sync Checkpoint Table:**
```sql
CREATE TABLE SyncCheckpoint (
  deviceId TEXT PRIMARY KEY,
  lastSyncUtc TEXT NOT NULL,
  lastSyncVersion INTEGER NOT NULL
);
```

#### 3. Automatic Sync Scheduler

Sync triggers automatically without user intervention.

**Trigger Events:**

| Trigger | Behavior |
|---------|----------|
| **Interval** | Every 60 seconds when devices are online |
| **On change** | 5-second debounce after local data change |
| **On reconnect** | Immediate sync when device comes online |
| **On app start** | Sync on application launch |
| **Manual** | User can still force immediate sync |

**Scheduler Configuration:**
```typescript
interface SyncSchedulerConfig {
  intervalMs: number;           // Default: 60000 (60 seconds)
  debounceMs: number;           // Default: 5000 (5 seconds)
  enabled: boolean;             // Can be disabled for testing
  syncOnReconnect: boolean;     // Default: true
  syncOnAppStart: boolean;      // Default: true
}
```

#### 4. Retry with Exponential Backoff

Failed sync attempts are retried with increasing delays.

**Retry Strategy:**
```
Attempt 1: Immediate
Attempt 2: 5 seconds
Attempt 3: 15 seconds
Attempt 4: 60 seconds
Attempt 5: 5 minutes
Attempt 6+: 15 minutes (max backoff)

Max attempts: 10 (then move to dead letter)
```

**Dead Letter Handling:**
- After max retries, entry moves to `status = 'failed'`
- Failed entries visible in admin UI
- Manual retry option available
- Alert shown if dead letter queue grows

#### 5. Sync Status & Feedback

Users should always know the sync state without needing to understand the system.

**Status Indicator States:**
```
🟢 Synced        - All devices up to date
🟡 Syncing...    - Sync in progress
🟠 Pending (3)   - 3 items waiting to sync
🔴 Error         - Sync failed, needs attention
⚪ Offline       - No devices reachable
```

**Status Bar Component:**
- Always visible in laptop sidebar
- Click to expand details
- Shows per-device sync status
- Shows pending outbox count
- Shows last successful sync time

---

## Functional Requirements

### FR-1: Persistent Outbox Queue

**FR-1.1** All data changes SHALL be written to outbox before local commit.

**FR-1.2** Outbox entries SHALL survive application restart.

**FR-1.3** Outbox entries SHALL be processed in order (FIFO per entity).

**FR-1.4** Outbox entries SHALL include full entity snapshot (not just changed fields).

**FR-1.5** Outbox entries SHALL track attempt count and last error.

### FR-2: Delta Sync

**FR-2.1** Laptop SHALL track last successful sync timestamp per device.

**FR-2.2** Pull requests SHALL include `since` parameter with last sync timestamp.

**FR-2.3** Server SHALL return only entities modified since the `since` timestamp.

**FR-2.4** Server SHALL return `fullSyncRequired: true` if delta is impractical (e.g., first sync, too many changes).

**FR-2.5** Deleted/merged entities SHALL be tracked and included in delta response.

### FR-3: Automatic Sync Scheduler

**FR-3.1** Sync SHALL trigger automatically every 60 seconds when devices are online.

**FR-3.2** Sync SHALL trigger within 5 seconds of a local data change (debounced).

**FR-3.3** Sync SHALL trigger immediately when a device transitions from offline to online.

**FR-3.4** Sync SHALL trigger on application startup.

**FR-3.5** Automatic sync SHALL be configurable (enable/disable, interval).

**FR-3.6** Manual sync SHALL remain available and bypass the scheduler.

### FR-4: Retry & Error Handling

**FR-4.1** Failed sync attempts SHALL be retried with exponential backoff.

**FR-4.2** Backoff delays SHALL follow: 0s, 5s, 15s, 60s, 5m, 15m (max).

**FR-4.3** Maximum retry attempts SHALL be 10 before moving to dead letter.

**FR-4.4** Dead letter entries SHALL be visible in admin UI.

**FR-4.5** Dead letter entries SHALL support manual retry.

**FR-4.6** Transient errors (timeout, connection refused) SHALL trigger retry.

**FR-4.7** Permanent errors (400, 401, 403) SHALL NOT trigger retry.

### FR-5: Sync Status UI

**FR-5.1** Laptop sidebar SHALL display sync status indicator.

**FR-5.2** Status indicator SHALL show: synced, syncing, pending count, error, offline.

**FR-5.3** Clicking status indicator SHALL show detailed sync information.

**FR-5.4** Detail view SHALL show per-device sync status.

**FR-5.5** Detail view SHALL show pending outbox count.

**FR-5.6** Detail view SHALL show last successful sync time per device.

**FR-5.7** Error state SHALL show actionable error message.

### FR-6: Sync Acknowledgment

**FR-6.1** Successful sync SHALL acknowledge outbox entries (mark completed).

**FR-6.2** Acknowledged entries SHALL be deleted after 24 hours.

**FR-6.3** Sync response SHALL include list of successfully processed entity IDs.

**FR-6.4** Partial success SHALL acknowledge only successfully processed entries.

---

## Technical Design

### Database Schema Changes

**Laptop (SQLite):**

```sql
-- Outbox for pending sync items
CREATE TABLE SyncOutbox (
  id TEXT PRIMARY KEY,
  entityType TEXT NOT NULL,
  entityId TEXT NOT NULL,
  operation TEXT NOT NULL,
  payload TEXT NOT NULL,
  targetDeviceId TEXT,
  createdAtUtc TEXT NOT NULL,
  attempts INTEGER DEFAULT 0,
  lastAttemptUtc TEXT,
  lastError TEXT,
  status TEXT DEFAULT 'pending'
);

-- Track sync progress per device
CREATE TABLE SyncCheckpoint (
  deviceId TEXT PRIMARY KEY,
  lastPushUtc TEXT,
  lastPullUtc TEXT,
  lastPushVersion INTEGER DEFAULT 0,
  lastPullVersion INTEGER DEFAULT 0
);

-- Track deleted entities for delta sync
CREATE TABLE SyncTombstone (
  entityType TEXT NOT NULL,
  entityId TEXT NOT NULL,
  deletedAtUtc TEXT NOT NULL,
  PRIMARY KEY (entityType, entityId)
);
```

**Android (Room):**

```kotlin
@Entity(tableName = "sync_outbox")
data class SyncOutboxEntry(
    @PrimaryKey val id: String,
    val entityType: String,
    val entityId: String,
    val operation: String,
    val payload: String,
    val createdAtUtc: Instant,
    var attempts: Int = 0,
    var lastAttemptUtc: Instant? = null,
    var lastError: String? = null,
    var status: String = "pending"
)

@Entity(tableName = "sync_checkpoint")
data class SyncCheckpoint(
    @PrimaryKey val targetId: String, // "laptop" or device ID
    val lastPushUtc: Instant?,
    val lastPullUtc: Instant?
)
```

### API Changes

**Enhanced Pull Endpoint:**
```http
GET /api/sync/pull?since=<ISO8601>&deviceId=<id>&types=members,equipment
```

Response additions:
```json
{
  "syncTimestamp": "2026-01-23T10:05:00Z",
  "fullSyncRequired": false,
  "members": {
    "upserted": [...],
    "deletedIds": ["uuid-1", "uuid-2"]
  },
  "acknowledged": ["outbox-id-1", "outbox-id-2"]
}
```

**Enhanced Push Endpoint:**
```http
POST /api/sync/push
Content-Type: application/json

{
  "deviceId": "tablet-001",
  "outboxIds": ["id-1", "id-2"],
  "members": [...],
  "checkIns": [...]
}
```

Response:
```json
{
  "success": true,
  "acknowledged": ["id-1", "id-2"],
  "failed": [],
  "serverTimestamp": "2026-01-23T10:05:00Z"
}
```

### Sync Flow (Revised)

```
┌─────────────────────────────────────────────────────────────────┐
│                    LAPTOP SYNC CYCLE                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. SCHEDULER TRIGGERS                                          │
│     └─▶ Check: Any pending outbox entries?                      │
│     └─▶ Check: Any online devices?                              │
│                                                                  │
│  2. FOR EACH ONLINE DEVICE:                                     │
│     ┌────────────────────────────────────────────────────────┐  │
│     │ a. PUSH PHASE                                          │  │
│     │    - Query outbox WHERE status='pending'               │  │
│     │    - Group by entityType                               │  │
│     │    - POST /api/sync/push with outboxIds                │  │
│     │    - On success: mark entries 'completed'              │  │
│     │    - On failure: increment attempts, set lastError     │  │
│     │                                                        │  │
│     │ b. PULL PHASE                                          │  │
│     │    - GET /api/sync/pull?since=<lastPullUtc>            │  │
│     │    - Process upserted entities                         │  │
│     │    - Process deletedIds (soft delete/tombstone)        │  │
│     │    - Update SyncCheckpoint.lastPullUtc                 │  │
│     └────────────────────────────────────────────────────────┘  │
│                                                                  │
│  3. UPDATE UI STATUS                                            │
│     └─▶ Emit sync result to status indicator                    │
│                                                                  │
│  4. SCHEDULE NEXT CYCLE                                         │
│     └─▶ If pending items: retry with backoff                    │
│     └─▶ If all synced: wait for interval or change trigger     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Tablet Mesh Foundation (Android)

**Scope:**
- Persistent outbox queue on Android
- Tablet-to-tablet sync protocol
- On-change sync trigger (immediate push to known tablets)
- On-discovery sync (exchange pending changes when tablet found)
- Sync status indicator on tablet UI
- Retry with exponential backoff

**Key deliverables:**
- `SyncOutbox` Room entity and DAO
- `MeshSyncService` for tablet-to-tablet communication
- Enhanced device discovery with sync-on-connect
- Tablet sync status UI component

**Duration:** 2-3 weeks

### Phase 2: Laptop Integration

**Scope:**
- Laptop detects "sync needed" when discovering tablets
- Laptop pushes member master data on discovery
- Laptop pulls check-ins/sessions every 5 minutes while online
- Persistent outbox queue on laptop
- Sync status UI in laptop sidebar
- "Last synced" timestamp per device

**Key deliverables:**
- `SyncOutbox` SQLite table and repository
- Enhanced laptop sync scheduler
- Sync status sidebar component
- Delta sync optimization (only send changes)

**Duration:** 1-2 weeks

### Phase 3: Polish & Edge Cases

**Scope:**
- Dead letter queue UI (failed sync items)
- Comprehensive error messages
- Offline duration indicator
- Performance optimization for larger datasets
- Full test coverage

**Duration:** 1 week

---

## Testing Strategy

### Unit Tests

- Outbox queue operations (add, remove, retry logic)
- Delta calculation (modified since timestamp)
- Backoff timing calculation
- Checkpoint management

### Integration Tests

- Full sync cycle with mock devices
- Crash recovery (kill process, restart, verify queue)
- Network failure simulation (timeout, connection refused)
- Partial sync success handling

### Manual Testing Checklist

- [ ] Sync triggers automatically every 60 seconds
- [ ] Sync triggers within 5 seconds of member edit
- [ ] Sync triggers immediately when tablet comes online
- [ ] App crash mid-sync → restart → pending items retry
- [ ] Network disconnect → reconnect → automatic sync
- [ ] Status indicator shows correct state at all times
- [ ] Dead letter items visible in admin UI
- [ ] Manual retry of dead letter item works

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Outbox grows unbounded | Low | Medium | Auto-cleanup of completed entries after 24h |
| Sync storms on reconnect | Medium | Low | Debounce + rate limiting |
| Clock skew breaks delta | Low | High | Use server timestamp for checkpoints |
| Conflicting edits during sync | Medium | Medium | Existing syncVersion conflict resolution |

---

## Open Questions

### Resolved

1. **Sync frequency** - ✅ RESOLVED
   - Tablet-to-tablet: Immediate on change (debounced 2s) + on discovery
   - Laptop pull from tablets: Every 5 minutes while online
   - Laptop push to tablets: On discovery (detect sync needed)

2. **Tablet-to-tablet sync** - ✅ RESOLVED
   - True mesh network (Option A)
   - Tablets sync directly with each other
   - Laptop is occasional visitor, not required for tablet sync

3. **Outbox retention** - ✅ RESOLVED
   - 24 hours - enough for debugging, not too much storage
   - Cleanup job runs on app start and after each sync cycle

4. **Conflict notification** - ✅ RESOLVED
   - Silent (log only) - conflicts are rare and auto-resolution is acceptable
   - No user-facing notification needed

5. **Offline indicator** - ✅ RESOLVED
   - Yes, show "Sidst set: 3 dage siden" in device list
   - Helps users understand device availability

6. **Reactive sync debounce** - ✅ RESOLVED
   - 2 seconds debounce after local change before triggering sync
   - Batches rapid changes (e.g., multiple check-ins in quick succession)

7. **Outbox delivery confirmation** - ✅ RESOLVED
   - Track delivery per-device in outbox
   - Keep retrying for devices that haven't confirmed
   - Entry only fully "delivered" when all known peers have confirmed
   - Offline devices get the change when they come back online

8. **Member data sync direction** - ✅ RESOLVED
   - Laptop-initiated push only (on discovery)
   - Tablets do NOT periodically pull members
   - Member changes are rare, laptop push is sufficient

9. **Tablet type cross-sync** - ✅ RESOLVED
   - All tablet types sync with each other (MEMBER ↔ MEMBER, MEMBER ↔ TRAINER, TRAINER ↔ TRAINER)
   - Check-ins and practice sessions should be visible everywhere

---

## Success Criteria

1. **Zero manual sync required** for normal operation
2. **No data loss** after app crash or network failure
3. **< 5 second** sync latency for single-item changes
4. **Visible sync status** at all times
5. **All existing tests pass** (no regression)

---

## Appendix: Current vs. Proposed Comparison

| Aspect | Current | Proposed |
|--------|---------|----------|
| Sync trigger | Manual button | Automatic (interval + change + reconnect) |
| Crash recovery | None | Persistent outbox queue |
| Network failure | Skip device | Retry with exponential backoff |
| Payload size | Full every time | Delta (changes since last sync) |
| User feedback | Toast on complete | Persistent status indicator |
| Failed items | Lost | Dead letter queue with manual retry |
| Sync history | None | Checkpoint per device |
