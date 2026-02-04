# Trainer Experience PRD

**Feature:** Trainer Experience & Practice Management
**Version:** 1.0
**Status:** ✅ Complete
**Last Updated:** 2026-02-03
**Updated By:** Claude
**Created:** 2026-01-21

---

## Executive Summary

This feature introduces a dedicated trainer experience on the trainer tablet, enabling certified trainers to authenticate via their membership card and access specialized tools for managing practice sessions. The system will track trainer qualifications, certifications, and roles while providing a dashboard for monitoring daily check-ins, practice sessions, and equipment management.

---

## Problem Statement

Currently, there is no differentiated experience for trainers on the trainer tablet. Trainers need:
- A secure way to authenticate that distinguishes them from regular members
- Tools to manage and monitor practice sessions
- Equipment check-in/check-out functionality
- Access to historical data for tracking member progress

Without this feature, trainers lack efficient tools to fulfill their responsibilities, and there's no access control preventing unauthorized members from accessing trainer functions.

---

## Goals

| Goal | Success Metric |
|------|----------------|
| Secure trainer authentication | Only authorized trainers can access trainer tablet functions |
| Streamlined practice management | Trainers can view all daily check-ins and practice sessions in one dashboard |
| Equipment accountability | 100% of equipment check-outs are tracked with trainer assignment |
| Historical insights | Trainers can access relevant historical data within defined limits |

---

## User Stories

### US-1: Trainer Authentication
**As a** trainer
**I want to** scan my membership card on the trainer tablet
**So that** I can access trainer-specific functions

**Acceptance Criteria:**
- [ ] Scanning a trainer's membership card grants access to trainer dashboard
- [ ] Scanning a non-trainer member's card displays an "unauthorized" message
- [ ] Session timeout after configurable period of inactivity
- [ ] Trainer name and role displayed after authentication

### US-2: Trainer Role Management
**As an** administrator
**I want to** assign trainer roles and certifications to members
**So that** the system knows who is authorized as a trainer

**Acceptance Criteria:**
- [ ] Can designate a member as a trainer
- [ ] Can specify trainer type/discipline
- [ ] Can record Skydeleder certification
- [ ] Can mark member as assistant trainer for specific disciplines
- [ ] Trainer data syncs across devices

### US-3: Daily Check-in Overview
**As a** trainer
**I want to** see who has checked in today
**So that** I know which members are present at the range

**Acceptance Criteria:**
- [ ] Dashboard shows list of today's check-ins
- [ ] Each entry shows member name, check-in time, and discipline
- [ ] List updates in real-time as members check in
- [ ] Can filter/search check-ins

### US-4: Practice Session Management
**As a** trainer
**I want to** view today's registered practice sessions
**So that** I can monitor ongoing activities

**Acceptance Criteria:**
- [ ] Dashboard shows all practice sessions for current day
- [ ] Shows member, discipline, start time, and status
- [ ] Can see practice session results/scores when completed
- [ ] Visual distinction between active and completed sessions

### US-5: Equipment Management
**As a** trainer
**I want to** manage equipment check-in/check-out
**So that** equipment usage is tracked and accountable

**Acceptance Criteria:**
- [ ] Can create new equipment items
- [ ] Can check out equipment to a member
- [ ] Can check in equipment when returned
- [ ] Shows current equipment status (available/checked-out)
- [ ] Records which trainer performed each operation

### US-6: Historical Data Access
**As a** trainer
**I want to** access limited historical check-in and practice session data
**So that** I can track member progress over time

**Acceptance Criteria:**
- [ ] Can view check-ins for past 3 months
- [ ] Can view practice session results for past 3 months
- [ ] Can filter by member, discipline, or date range
- [ ] Data is read-only (no editing of historical records)

### US-7: Trial Member Overview
**As a** trainer
**I want to** see recently registered trial members
**So that** I can welcome them and verify their registration quality

**Acceptance Criteria:**
- [ ] Dashboard shows list of trial members from last 7 days
- [ ] Each entry shows name, registration date, photo thumbnail
- [ ] Indicates if member has ID photo on file (for adults)
- [ ] Can tap to view full member details with photos

### US-8: View Member Photos
**As a** trainer
**I want to** view a trial member's profile photo and ID photo
**So that** I can verify their identity and check photo quality

**Acceptance Criteria:**
- [ ] Member detail view shows profile photo full-size
- [ ] Member detail view shows ID photo full-size (if available)
- [ ] Photos can be zoomed/expanded for inspection
- [ ] Shows "No ID photo" for minors (not required)

### US-9: Retake Member Photos
**As a** trainer
**I want to** retake a member's profile photo or ID photo
**So that** I can improve photo quality if the original is unacceptable

**Acceptance Criteria:**
- [ ] "Retake Photo" button available in member detail view
- [ ] Opens camera, captures new photo
- [ ] Shows preview with accept/retake options
- [ ] On accept, replaces existing photo and syncs update
- [ ] "Retake ID" button only shown for adult members

### US-10: Assisted Check-in
**As a** trainer
**I want to** check in a member on their behalf
**So that** members without cards can still register attendance

**Acceptance Criteria:**
- [ ] "Check In Member" function accessible from dashboard
- [ ] Search member by name or internal ID
- [ ] Confirm member identity (shows photo)
- [ ] Creates check-in record for current day
- [ ] Shows message if member already checked in today
- [ ] Plays check-in sound confirmation

### US-11: Assisted Practice Session
**As a** trainer
**I want to** register a practice session for a member
**So that** members without cards can record their scores

**Acceptance Criteria:**
- [ ] Option to "Add Practice Session" after assisted check-in
- [ ] Standard practice session form (discipline, points, classification)
- [ ] Session linked to member's internalId
- [ ] Trainer recorded as session source/operator
- [ ] Session syncs to laptop and leaderboards

---

## Functional Requirements

### FR-1: Trainer Role Data Model
The system shall track trainer-related attributes using a separate `TrainerInfo` entity:
- `isTrainer`: Boolean flag indicating trainer status
- `hasSkydelederCertificate`: Boolean for Skydeleder certification (single certificate, no levels)
- `certifiedDate`: Date when trainer status was granted

Discipline-specific trainer levels shall be tracked in a separate `TrainerDiscipline` entity:
- Each trainer can have multiple discipline entries
- Each discipline entry specifies the level: `FULL` or `ASSISTANT`
- A trainer can be FULL in one discipline and ASSISTANT in another

### FR-2: Trainer Authentication

- Membership card scan triggers trainer lookup
- If member has `isTrainer = true`, grant access to trainer dashboard
- If member is not a trainer, display unauthorized message
- Allow admin PIN login as a fallback for initial setup or missing trainer records
- Log all authentication attempts (success and failure)

### FR-3: Today's Check-in Dashboard
- Query check-ins where `date = today`
- Display member name, check-in time, discipline
- Auto-refresh or manual refresh capability
- Support for filtering and search

### FR-4: Practice Session Dashboard
- Query practice sessions where `date = today`
- Display member, discipline, status, results (if complete)
- Real-time status updates

### FR-5: Equipment CRUD Operations
- Create: Add new equipment with name, type, serial number, and optional discipline
- Equipment types include: firearms (pistols, rifles), cleaning gear, repair kits, safety gear, etc.
- Equipment can be discipline-specific (e.g., rifle cleaning kit) or general (e.g., safety glasses)
- Check-out: Assign equipment to member with timestamp and trainer ID
- Check-in: Return equipment with timestamp and trainer ID
- Query: List all equipment with current status, filterable by discipline

### FR-6: Historical Data Queries
- Lookback period: 3 months (90 days)
- Trainers can view all members' data (not filtered by trainer's discipline)
- Filter by member, discipline, date range
- Paginated results for large datasets

### FR-7: Trial Member Management
- Query trial members registered in last 7 days
- Display in dedicated dashboard section or screen
- Show photo thumbnail and ID photo status indicator
- Navigate to full detail view with all photos
- Refresh on sync completion

### FR-8: Photo Viewing
- Display profile photo at full resolution
- Display ID photo at full resolution (adults only)
- Support pinch-to-zoom or tap-to-expand
- Clear labels distinguish profile photo from ID photo
- Handle missing photos gracefully (placeholder image)

### FR-9: Photo Retake
- Camera capture for profile photo (front camera)
- Camera capture for ID photo (rear camera, adults only)
- Preview screen with accept/retake options
- Replace existing photo on accept
- Update member record with new photo path
- Trigger sync to propagate change
- Record trainer ID as operator for audit

### FR-10: Assisted Check-in
- Search members by name (fuzzy match) or exact internalId
- Display member photo and name for confirmation
- Create CheckIn record with current date
- Play audio confirmation on success
- Detect and report if member already checked in today
- Record trainer ID as check-in operator

### FR-11: Assisted Practice Session
- Show after assisted check-in completion
- Use standard practice session form
- Pre-fill member information
- Create PracticeSession record linked to member's internalId
- Set source field to indicate trainer-assisted
- Record trainer ID as session operator

---

## Non-Functional Requirements

### NFR-1: Security

- Trainer tablet should not expose trainer functions without authentication
- Session timeout: 60 seconds of inactivity (trainers must re-scan card to continue)
- PIN fallback uses the existing admin PIN and respects lockout behavior
- All trainer actions should be auditable

### NFR-2: Performance
- Dashboard should load within 2 seconds
- Check-in list should support 100+ entries without degradation
- Equipment operations should complete within 1 second

### NFR-3: Offline Capability
- Trainer dashboard should work offline with cached data
- Equipment operations should queue when offline and sync when connected

### NFR-4: Sync Compatibility
- Trainer data must sync with existing sync infrastructure
- New entities must follow `Syncable*` patterns

---

## Data Model Changes

### New/Modified Entities

```kotlin
// Separate entity for trainer information (linked to Member by memberId)
@Entity(tableName = "trainer_info")
data class TrainerInfo(
    @PrimaryKey
    val memberId: String,
    val isTrainer: Boolean = false,
    val hasSkydelederCertificate: Boolean = false,  // Single certificate, no levels
    val certifiedDate: Long? = null,
    val lastModified: Long,
    val syncId: String
)

// Per-discipline trainer level (allows FULL in one discipline, ASSISTANT in another)
// Reuses existing PracticeType enum: Riffel, Pistol, LuftRiffel, LuftPistol, Andet
@Entity(
    tableName = "trainer_discipline",
    foreignKeys = [ForeignKey(
        entity = TrainerInfo::class,
        parentColumns = ["memberId"],
        childColumns = ["memberId"],
        onDelete = ForeignKey.CASCADE
    )]
)
data class TrainerDiscipline(
    @PrimaryKey
    val id: String,
    val memberId: String,
    val discipline: PracticeType,  // Reuses existing enum
    val level: TrainerLevel,       // FULL or ASSISTANT
    val certifiedDate: Long? = null,
    val lastModified: Long,
    val syncId: String
)

enum class TrainerLevel { FULL, ASSISTANT }

// Equipment entity with optional discipline
@Entity(tableName = "equipment")
data class Equipment(
    @PrimaryKey
    val equipmentId: String,
    val name: String,
    val type: String,              // e.g., "FIREARM", "CLEANING_GEAR", "REPAIR_KIT", "SAFETY_GEAR"
    val category: String?,         // e.g., "PISTOL", "RIFLE" for firearms
    val discipline: PracticeType?, // Optional - null for general equipment like safety glasses
    val serialNumber: String?,
    val status: EquipmentStatus,   // AVAILABLE, CHECKED_OUT, MAINTENANCE
    val checkedOutToMemberId: String?,
    val checkedOutByTrainerId: String?,
    val checkedOutAt: Long?,
    val lastModified: Long,
    val syncId: String
)

// Note: EquipmentStatus enum already exists in Entities.kt

// Equipment transaction log for audit trail
@Entity(tableName = "equipment_transactions")
data class EquipmentTransaction(
    @PrimaryKey
    val transactionId: String,
    val equipmentId: String,
    val memberId: String?,
    val trainerId: String,
    val action: String,  // CHECK_OUT, CHECK_IN, CREATED, MAINTENANCE
    val timestamp: Long,
    val syncId: String
)
```

### TypeScript equivalents for Laptop sync

```typescript
interface TrainerInfo {
  memberId: string;
  isTrainer: boolean;
  hasSkydelederCertificate: boolean;
  certifiedDate: number | null;
  lastModified: number;
  syncId: string;
}

// Reuses existing PracticeType: 'Riffel' | 'Pistol' | 'LuftRiffel' | 'LuftPistol' | 'Andet'
type TrainerLevel = 'FULL' | 'ASSISTANT';

interface TrainerDiscipline {
  id: string;
  memberId: string;
  discipline: PracticeType;  // Reuses existing type
  level: TrainerLevel;
  certifiedDate: number | null;
  lastModified: number;
  syncId: string;
}

interface Equipment {
  equipmentId: string;
  name: string;
  type: string;                    // "FIREARM", "CLEANING_GEAR", "REPAIR_KIT", "SAFETY_GEAR"
  category: string | null;
  discipline: PracticeType | null; // null for general equipment
  serialNumber: string | null;
  status: 'Available' | 'CheckedOut' | 'Maintenance';  // Matches existing EquipmentStatus
  checkedOutToMemberId: string | null;
  checkedOutByTrainerId: string | null;
  checkedOutAt: number | null;
  lastModified: number;
  syncId: string;
}

interface EquipmentTransaction {
  transactionId: string;
  equipmentId: string;
  memberId: string | null;
  trainerId: string;
  action: 'CHECK_OUT' | 'CHECK_IN' | 'CREATED' | 'MAINTENANCE';
  timestamp: number;
  syncId: string;
}
```

---

## Implementation Phases

### Phase 1: Data Model & Sync
- Add TrainerInfo entity
- Add TrainerDiscipline entity (per-discipline levels)
- Add Equipment and EquipmentTransaction entities
- Implement sync for all new entities
- Database migration

### Phase 2: Trainer Authentication
- Card scan integration on trainer tablet
- Trainer validation logic
- Session management with 60s timeout
- "Extend session" popup before timeout
- UI for authentication flow

### Phase 2b: Laptop Admin - Trainer Management
- UI to view all members and their trainer status
- Ability to designate a member as trainer
- Manage trainer disciplines and levels (FULL/ASSISTANT)
- Toggle Skydeleder certification

### Phase 3: Dashboard - Today's View
- Check-in list component
- Practice session list component
- Real-time updates
- Filter/search functionality

### Phase 4: Equipment Management
- Equipment CRUD UI
- Check-out/check-in flow
- Equipment status display
- Transaction logging

### Phase 5: Historical Data
- Date range queries
- Historical views for check-ins and practice sessions
- Filtering and pagination

---

## Open Questions

| ID | Question | Status | Resolution |
|----|----------|--------|------------|
| | No open questions at this time | | |

---

## Resolved Questions

| ID | Question | Resolution | Date |
|----|----------|------------|------|
| Q1 | Should trainer info be a separate entity or fields on Member? | Separate `TrainerInfo` entity linked by memberId | 2026-01-21 |
| Q2 | What is the session timeout duration for trainer authentication? | 60 seconds of inactivity | 2026-01-21 |
| Q3 | How many days of historical data should be accessible? | 3 months (90 days) | 2026-01-21 |
| Q4 | Should there be different access levels for different trainer types? | No, same access level for all trainers (for now) | 2026-01-21 |
| Q5 | Is Skydeleder a single certification or are there levels? | Single boolean certificate | 2026-01-21 |
| Q6 | Can a trainer be an assistant in one discipline and full trainer in another? | Yes - use `TrainerDiscipline` entity with per-discipline level | 2026-01-21 |
| Q7 | Should equipment be discipline-specific? | Yes, with optional discipline field (null = general equipment) | 2026-01-21 |
| Q8 | What equipment types need to be tracked? | Diverse: firearms (pistols, rifles), cleaning gear, repair kits, safety gear | 2026-01-21 |
| Q10 | How should trainers be initially designated? | Via laptop admin interface (trainers are members first) | 2026-01-21 |
| Q11 | Should there be a "re-authenticate" prompt before timeout or just auto-logout? | Show "extend session" popup before timeout | 2026-01-21 |
| Q12 | What disciplines are supported? Should they be configurable? | Reuse existing `PracticeType` enum: Riffel, Pistol, LuftRiffel, LuftPistol, Andet | 2026-01-21 |
| Q9 | Should trainers see all members or only those in their discipline? | All members - trainers help manage all sessions from IT perspective | 2026-01-21 |

---

## Design Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| DD-1 | TrainerInfo as separate entity | Keeps Member entity clean; trainer data only relevant to subset of members; easier to sync independently |
| DD-2 | TrainerDiscipline as separate join table | Allows flexible per-discipline trainer levels; a trainer can be FULL in pistol but ASSISTANT in rifle |
| DD-3 | 60-second session timeout | Short timeout for security on shared tablet; trainers expected to work in focused bursts |
| DD-4 | Equipment discipline field is nullable | Allows general equipment (safety glasses) alongside discipline-specific items (rifle cleaning kit) |
| DD-5 | Trainers see all members/sessions | Trainers act as IT managers for the range, not discipline gatekeepers; simplifies UI and queries |
| DD-6 | Single Skydeleder certificate level | Keeps certification tracking simple; binary yes/no is sufficient for access control |
| DD-7 | Trainer management on laptop | Members are created on tablets, but trainer designation is admin function done on laptop |
| DD-8 | "Extend session" popup before timeout | Better UX than abrupt logout; gives trainer chance to continue working |
| DD-9 | Reuse existing PracticeType enum | Consistency with practice session registration; no need to maintain separate discipline list |

---

## Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Unauthorized access to trainer functions | High | Medium | Robust authentication, session timeouts, audit logging |
| Data sync conflicts for equipment status | Medium | Medium | Last-write-wins with timestamp, transaction log for audit |
| Offline equipment operations causing double check-outs | Medium | Low | Optimistic locking, sync queue with conflict resolution |

---

## Appendices

### A. Glossary

| Term | Definition |
|------|------------|
| Skydeleder | Danish term for "Range Safety Officer" - a certified trainer who can supervise shooting activities |
| Discipline | A specific type of shooting sport (e.g., rifle, pistol, shotgun) |
| Practice Session | A recorded training session with optional scores/results |
| Trainer Tablet | The dedicated device used by trainers for management functions |
| Member Tablet | The device used by members for check-in and personal tracking |

### B. Related Documents

- [Sync Protocol Documentation](../../../docs/)
- [Equipment Sync Feature](../equipment-sync/) (if exists)
- [Member Check-in Flow](../member-preference-sync/)

### C. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-01-21 | | Initial draft |
| 0.2 | 2026-01-21 | | Resolved Q1-Q9; added TrainerDiscipline entity; updated data models |
| 0.3 | 2026-01-21 | | Resolved Q10-Q12; reuse existing PracticeType enum; laptop admin for trainer designation; extend session popup |
| 0.4 | 2026-01-27 | sbalslev | Added US-7 to US-11 for trial member management, photo viewing/retake, assisted check-in, and assisted practice session. Added FR-7 to FR-11. |

