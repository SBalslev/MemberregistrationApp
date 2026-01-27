# Trial Member Registration (Prøvemedlem) - Product Requirements Document

**Feature:** Trial Member Registration and Workflow Simplification
**Version:** 1.5
**Last Updated:** 2026-01-20
**Updated By:** sbalslev
**Status:** ✅ COMPLETED

---

## Executive Summary

This feature refactors the current member registration workflow by eliminating the separate `NewMemberRegistration` entity and approval flow. Instead, new registrations immediately create a `Member` record with a special "Trial" (Prøvemedlem) status. The member ID is assigned later on the laptop and synchronized back to tablets, enabling a streamlined workflow while maintaining data integrity across the distributed system.

## Problem Statement

### Current State

1. **Separate Registration Entity**: New sign-ups create a `NewMemberRegistration` record that requires explicit approval
2. **Approval Bottleneck**: Admin must approve each registration before a Member record is created
3. **Delayed Member Access**: New members cannot check in or use services until approved
4. **Dual Entity Complexity**: Two entities (NewMemberRegistration + Member) represent the same person at different stages
5. **Member ID Timing**: Member ID is only assigned after laptop approval, preventing immediate tablet functionality

### Desired State

1. **Single Entity**: All members (including new registrations) are stored as `Member` records from day one
2. **No Approval Flow**: Registration immediately creates a trial member (Prøvemedlem)
3. **Immediate Access**: Trial members can check in and use services right away
4. **Deferred ID Assignment**: `membershipId` can be null initially and assigned later on the laptop
5. **Bidirectional Sync**: Member updates (including ID assignment) sync from laptop back to tablets

## Goals

| ID | Goal | Success Metric |
|----|------|----------------|
| G-1 | Eliminate approval workflow latency | New registrations usable within seconds |
| G-2 | Simplify data model | Remove `NewMemberRegistration` entity entirely |
| G-3 | Enable immediate check-in for trial members | Trial members can check in using internal ID |
| G-4 | Support laptop-to-tablet member updates | Member ID changes sync to all tablets within 30 seconds |
| G-5 | Prevent duplicate members during sync | Zero duplicate member records from same registration |
| G-6 | Maintain backward compatibility | Existing member records unaffected |

## User Stories

### US-1: Immediate Trial Member Creation

**As a** club staff member using the tablet  
**I want** new registrations to immediately become trial members  
**So that** the new person can check in and start practicing right away

**Acceptance Criteria:**

- Registration form submission creates a Member record with `memberType = TRIAL`
- Trial member appears in member list immediately
- Trial member can check in using their name or internal UUID
- No approval step required

### US-2: Trial Member Identification on Tablet

**As a** club staff member  
**I want** to identify trial members without a membership ID  
**So that** I can assist them with check-in and distinguish them from full members

**Acceptance Criteria:**

- Trial members display a visual indicator (badge/icon)
- Trial members appear in search results by name
- Trial member card shows "Prøvemedlem" (Trial Member) badge
- Internal UUID can be used for scanning/lookup if QR code is generated

### US-3: Member ID Assignment on Laptop

**As a** club administrator using the laptop  
**I want** to assign an official membership ID to trial members  
**So that** they become full members in the club's system

**Acceptance Criteria:**

- Laptop displays list of trial members without membership IDs
- Admin can edit trial member and assign membershipId
- Assigned membershipId is validated for uniqueness
- Save operation updates Member record and triggers sync

### US-4: Bidirectional Member Sync

**As a** system operator  
**I want** member updates (including ID assignments) to sync from laptop to tablets  
**So that** all devices have consistent member data

**Acceptance Criteria:**

- Member record changes on laptop sync to all tablets
- Trial member receiving an ID updates on tablets
- Sync preserves check-in and practice session history linked to internal ID
- No duplicate members created during sync

### US-5: Trial Member to Full Member Transition

**As a** trial member  
**I want** my check-in history to be preserved when I become a full member  
**So that** my practice sessions and attendance are not lost

**Acceptance Criteria:**

- All CheckIn records remain linked after membershipId assignment
- All PracticeSession records remain linked
- Member profile shows complete history
- No manual data migration required

## Functional Requirements

### FR-1: Member Entity Changes

**FR-1.1** Member entity SHALL use a separate `internalId: UUID` as the primary key instead of `membershipId`.

**FR-1.2** Member entity `membershipId` SHALL become nullable and optional.

**FR-1.3** Member entity SHALL add `memberType: MemberType` enum with values: `TRIAL`, `ACTIVE`, `INACTIVE`.

**FR-1.4** Member entity SHALL add `registrationPhotoPath: String?` for photo captured during registration.

**FR-1.5** All foreign key references to members (CheckIn, PracticeSession, etc.) SHALL use `internalId` instead of `membershipId`.

**FR-1.6** Existing members with `membershipId` SHALL have `memberType = ACTIVE`.

**FR-1.7** New registrations SHALL create Member with `memberType = TRIAL` and `membershipId = null`.

### FR-2: Registration Flow Changes

**FR-2.1** Tablet registration form SHALL create a Member record directly (no NewMemberRegistration).

**FR-2.2** Created Member SHALL have:

- `internalId`: Generated UUID
- `membershipId`: null (to be assigned later)
- `memberType`: TRIAL
- `status`: ACTIVE
- All captured personal data (name, contact, guardian info, etc.)
- `registrationPhotoPath`: Path to captured photo

**FR-2.3** Trial member SHALL be immediately visible in member lists and searchable.

**FR-2.4** Trial member SHALL be able to check in using `internalId` or name lookup.

**FR-2.5** Check-in and practice session records SHALL reference `internalId`.

### FR-3: Laptop Trial Member Management

**FR-3.1** Laptop SHALL display a filtered view of trial members (memberType = TRIAL).

**FR-3.2** Laptop SHALL allow editing trial member details including:

- All personal information fields
- `membershipId` assignment (unique, validated)
- `memberType` change to ACTIVE

**FR-3.3** When `membershipId` is assigned, `memberType` SHALL automatically change to ACTIVE.

**FR-3.4** Laptop SHALL validate `membershipId` uniqueness before saving.

**FR-3.5** Laptop SHALL display warning if trial member has been active >30 days without ID assignment.

### FR-4: Synchronization Protocol Updates

**FR-4.1** Member sync payload SHALL include:

- `internalId` (UUID, required, immutable)
- `membershipId` (String?, nullable)
- `memberType` (enum)
- All existing member fields

**FR-4.2** Sync conflict resolution for members:

- `internalId` is the merge key (never changes)
- Laptop version takes precedence for `membershipId` and `memberType`
- Other fields use last-write-wins based on `modifiedAtUtc`

**FR-4.3** Tablet-to-laptop sync:

- New trial members (created on tablet) sync to laptop
- Tablet photo syncs as base64 (existing functionality)

**FR-4.4** Laptop-to-tablet sync:

- Updated members (including ID assignment) sync to tablets
- `membershipId` changes from null to assigned value sync correctly
- `memberType` changes sync correctly

**FR-4.5** Sync SHALL use `internalId` for duplicate detection:

- If `internalId` exists on target device, update the record
- If `internalId` does not exist, insert new record
- Never create duplicates from same registration

### FR-5: Migration and Backward Compatibility

**FR-5.1** Existing Member records SHALL be migrated:

- Generate `internalId` from existing `membershipId` (deterministic UUID)
- Set `memberType = ACTIVE`
- No change to `membershipId`

**FR-5.2** Existing NewMemberRegistration records SHALL be migrated:

- Create Member record with `memberType = TRIAL`
- Generate `internalId` from registration `id`
- Set `membershipId = null`
- Copy all personal data fields
- Mark original registration as migrated

**FR-5.3** Foreign key references in CheckIn, PracticeSession, ScanEvent, EquipmentCheckout, and TransactionLine SHALL be updated:

- Add `internalMemberId` column
- Populate from member lookup by `membershipId`
- Deprecate but retain `membershipId` for compatibility
- Create index on `internalMemberId` for query performance

**FR-5.4** NewMemberRegistration entity SHALL be deprecated:

- No new records created
- Existing records retained for audit trail
- UI and sync code removed after migration

### FR-6: UI/UX Changes

**FR-6.1** Tablet member list SHALL show trial member indicator (badge/icon).

**FR-6.2** Trial member card SHALL display "Prøvemedlem" label prominently.

**FR-6.3** Tablet registration confirmation SHALL show:

- "Prøvemedlem oprettet" (Trial member created)
- Member name and internal reference
- "Kan tjekke ind nu" (Can check in now)

**FR-6.4** Laptop trial member list SHALL:

- Show pending ID assignment count in navigation
- Display days since registration
- Highlight long-pending registrations (>30 days)

**FR-6.5** Laptop member edit form SHALL:

- Show current `memberType` with dropdown to change
- Show `membershipId` field (editable for trials, read-only for assigned)
- Validate uniqueness on blur/save

### FR-7: Removal of Approval Workflow

**FR-7.1** Remove `ApprovalStatus` enum and related fields from codebase.

**FR-7.2** Remove approval workflow UI from laptop application.

**FR-7.3** Remove approval-related sync fields (`approvalStatus`, `approvedAtUtc`, `rejectedAtUtc`, `rejectionReason`, `createdMemberId`).

**FR-7.4** Remove `NewMemberRegistrationDao` approval-related methods.

**FR-7.5** Retain photo sync functionality (move to Member entity).

### FR-10: Equipment Checkout Support for Trial Members

**FR-10.1** EquipmentCheckout entity SHALL use `internalMemberId` as foreign key to Member.

**FR-10.2** Trial members SHALL be able to check out equipment using their `internalId`.

**FR-10.3** Equipment checkout history SHALL be preserved when trial member receives `membershipId`.

**FR-10.4** Migration SHALL update existing EquipmentCheckout records to use `internalMemberId`.

### FR-11: Financial Transaction Support for Trial Members

**FR-11.1** TransactionLine entity SHALL use `internalMemberId` as foreign key to Member.

**FR-11.2** Trial members SHALL be linkable to financial transactions (per DD-8).

**FR-11.3** Member fee status view SHALL display trial members with appropriate badge.

**FR-11.4** Migration SHALL update existing TransactionLine records to use `internalMemberId`.

### FR-12: Trial Member Check-in and Lookup

**FR-12.1** Member lookup SHALL support search by `internalId` in addition to `membershipId`.

**FR-12.2** Trial members SHALL be findable via name search on tablets.

**FR-12.3** QR code format for trial members SHALL be "MC:{internalId}".

**FR-12.4** Barcode scanner SHALL parse both `membershipId` and "MC:" prefixed `internalId`.

**FR-12.5** Check-in confirmation SHALL display trial member badge when applicable.

### FR-13: Sync Version Compatibility

**FR-13.1** Sync protocol SHALL include schema version in handshake.

**FR-13.2** Tablet SHALL display upgrade prompt if laptop requires newer schema version.

**FR-13.3** Laptop SHALL reject sync from incompatible older tablet versions with helpful message.

**FR-13.4** Schema version SHALL be bumped to "2.0.0" for trial member support.

## Non-Functional Requirements

### NFR-1: Performance

**NFR-1.1** Trial member creation SHALL complete in <1 second on tablet.

**NFR-1.2** Member sync with ID assignment SHALL complete in <5 seconds per member.

**NFR-1.3** Member list query SHALL support filtering by `memberType` with index.

### NFR-2: Data Integrity

**NFR-2.1** `internalId` SHALL be globally unique (UUID v4).

**NFR-2.2** `membershipId` SHALL be unique across all devices when assigned.

**NFR-2.3** Zero data loss during trial-to-full member transition.

**NFR-2.4** All historical records linked to member preserved.

### NFR-3: Backward Compatibility

**NFR-3.1** Migration SHALL be reversible for 30 days (retain original data).

**NFR-3.2** API version bump to indicate new schema.

**NFR-3.3** Older app versions SHALL display helpful upgrade message.

## Data Model Changes

### Updated Member Entity (Android Kotlin)

```kotlin
@Entity(indices = [
    Index(value = ["membershipId"], unique = true),
    Index(value = ["memberType"]),
    Index(value = ["status"])
])
data class Member(
    @PrimaryKey val internalId: String,  // UUID, immutable
    val membershipId: String? = null,     // Club-assigned ID, nullable for trials
    val memberType: MemberType = MemberType.TRIAL,
    val firstName: String,
    val lastName: String,
    val email: String? = null,
    val phone: String? = null,
    val status: MemberStatus = MemberStatus.ACTIVE,
    val expiresOn: String? = null,
    val birthDate: LocalDate? = null,
    val gender: String? = null,
    val address: String? = null,
    val zipCode: String? = null,
    val city: String? = null,
    val guardianName: String? = null,
    val guardianPhone: String? = null,
    val guardianEmail: String? = null,
    val registrationPhotoPath: String? = null,
    val createdAtUtc: Instant,
    val updatedAtUtc: Instant = Instant.DISTANT_PAST,
    
    // Sync metadata
    val deviceId: String? = null,
    val syncVersion: Long = 0,
    val syncedAtUtc: Instant? = null
)

/** Member lifecycle stage (see DD-5) */
enum class MemberType { 
    TRIAL,  // Registered but no official membershipId yet
    FULL    // Has official membershipId assigned
}

/** Member operational status (see DD-5) */
enum class MemberStatus { 
    ACTIVE,   // Can check in, use club services
    INACTIVE  // Cannot check in, archived/expired
}
```

### Updated CheckIn Entity (example of FK change)

```kotlin
@Entity(indices = [Index(value = ["internalMemberId", "localDate"])])
data class CheckIn(
    @PrimaryKey val id: String,
    val internalMemberId: String,  // FK to Member.internalId
    @Deprecated("Use internalMemberId") val membershipId: String? = null,
    val createdAtUtc: Instant,
    val localDate: LocalDate,
    val firstOfDayFlag: Boolean = true,
    
    // Sync metadata
    val deviceId: String? = null,
    val syncVersion: Long = 0,
    val syncedAtUtc: Instant? = null
)
```

### Updated TypeScript Member Type (Laptop)

```typescript
/** Member lifecycle stage (see DD-5) */
export type MemberType = 'TRIAL' | 'FULL';

/** Member operational status (see DD-5) */
export type MemberStatus = 'ACTIVE' | 'INACTIVE';

export interface Member {
  internalId: string;           // UUID, immutable
  membershipId: string | null;  // Nullable for trials
  memberType: MemberType;       // TRIAL or FULL
  firstName: string;
  lastName: string;
  birthday: string | null;
  gender: Gender | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  zipCode: string | null;
  city: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  guardianEmail: string | null;
  photoUri: string | null;
  status: MemberStatus;         // ACTIVE or INACTIVE
  createdAtUtc: string;
  updatedAtUtc: string;
  syncedAtUtc: string | null;
  syncVersion: number;
}
```

## Migration Strategy

### Phase 1: Schema Migration

1. Add `internalId` column to Member table (generate from existing membershipId)
2. Add `memberType` column (default ACTIVE for existing)
3. Add `registrationPhotoPath` column
4. Update indexes

### Phase 2: Foreign Key Migration

1. Add `internalMemberId` to CheckIn, PracticeSession, ScanEvent
2. Populate via lookup from membershipId
3. Validate all references resolved

### Phase 3: Registration Migration

1. Convert pending NewMemberRegistration to Member (memberType = TRIAL)
2. Mark registrations as migrated
3. Test sync with migrated data

### Phase 4: Code Migration

1. Update DAOs to use internalId
2. Update sync payload and handlers
3. Update UI components
4. Remove approval workflow code

### Phase 5: Cleanup

1. Deprecate NewMemberRegistration entity
2. Remove approval workflow UI
3. Update documentation
4. Bump schema version

## Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Data loss during migration | High | Low | Full backup before migration, reversible for 30 days |
| Sync conflicts with old app versions | Medium | Medium | Version detection, upgrade prompts |
| Duplicate members from concurrent registration | High | Low | UUID for internalId guarantees uniqueness |
| Missing member links after FK migration | High | Low | Validation step, orphan detection queries |
| User confusion about trial status | Medium | Medium | Clear UI indicators, documentation |
| **Field mismatch between entities** | **High** | **High** | **See Gap Analysis section below** |
| **Sensitive data on tablets** | **Medium** | **High** | **Privacy-aware sync filtering** |
| **Photo storage location change** | **Medium** | **Medium** | **Clear migration path for photo files** |

---

## Gap Analysis: Entity Field Differences

### Critical Issue Identified

The current `Member` entity on Android tablets is **missing fields** that exist in `NewMemberRegistration`. When registrations become members immediately, this data would be lost.

### Field Comparison Table

| Field | NewMemberRegistration | Android Member | Laptop Member | Gap? |
|-------|----------------------|----------------|---------------|------|
| firstName | ✅ | ✅ | ✅ | No |
| lastName | ✅ | ✅ | ✅ | No |
| email | ✅ | ✅ | ✅ | No |
| phone | ✅ | ✅ | ✅ | No |
| birthDate | ✅ | ✅ | ✅ | No |
| **gender** | ✅ | ❌ | ✅ | **YES** |
| **address** | ✅ | ❌ | ✅ | **YES** |
| **zipCode** | ✅ | ❌ | ✅ | **YES** |
| **city** | ✅ | ❌ | ✅ | **YES** |
| **guardianName** | ✅ | ❌ | ✅ | **YES** |
| **guardianPhone** | ✅ | ❌ | ✅ | **YES** |
| **guardianEmail** | ✅ | ❌ | ✅ | **YES** |
| **photoPath** | ✅ | ❌ | ✅ (photoUri) | **YES** |
| status | N/A | ✅ | ✅ | No |
| expiresOn | N/A | ✅ | N/A | Laptop gap |
| memberType | N/A | N/A | ✅ | Android gap |

### Required Schema Changes

**FR-1 Amendment - Add Missing Fields to Android Member:**

```kotlin
data class Member(
    @PrimaryKey val internalId: String,
    val membershipId: String? = null,
    val memberType: MemberType = MemberType.TRIAL,
    val firstName: String,
    val lastName: String,
    val email: String? = null,
    val phone: String? = null,
    val status: MemberStatus = MemberStatus.ACTIVE,
    val expiresOn: String? = null,
    val birthDate: LocalDate? = null,
    
    // === FIELDS TO ADD (from NewMemberRegistration) ===
    val gender: String? = null,
    val address: String? = null,
    val zipCode: String? = null,
    val city: String? = null,
    val guardianName: String? = null,
    val guardianPhone: String? = null,
    val guardianEmail: String? = null,
    val registrationPhotoPath: String? = null,
    val createdAtUtc: Instant,  // Also missing!
    
    // Sync metadata
    val updatedAtUtc: Instant = Instant.DISTANT_PAST,
    val deviceId: String? = null,
    val syncVersion: Long = 0,
    val syncedAtUtc: Instant? = null
)
```

### Privacy Considerations

**Issue:** The laptop currently filters sensitive data before syncing to tablets using `MemberForTabletSync`. With trial members created on tablets, we now have **sensitive data originating from tablets**.

**Decision:** Option D (Accept trade-off) - per DD-4.

**Implementation:**

- All member data (including sensitive fields) stored on all devices
- `MemberForTabletSync` interface removed entirely (per DD-9)
- Single `Member` type used for all sync operations
- Tablets display sensitive data only in detailed member view (not list)

### Sync Payload Updates Required

**Critical Gap Identified:** Current `SyncableMember` is missing 7 fields + photo that exist in `SyncableNewMemberRegistration`.

**Current SyncableMember fields:**

```
membershipId, firstName, lastName, email, phone, status, expiresOn, birthDate, registrationId
```

**Missing fields that MUST be added:**

| Field | Purpose |
|-------|---------|
| `gender` | Personal information |
| `address` | Contact address |
| `zipCode` | Postal code |
| `city` | City |
| `guardianName` | Parent/guardian for minors |
| `guardianPhone` | Guardian contact |
| `guardianEmail` | Guardian email |
| `photoBase64` | Registration photo |

**New Requirement FR-14: Sync Payload Update**

**FR-14.1** `SyncableMember` SHALL include all fields from `SyncableNewMemberRegistration`.

**FR-14.2** `SyncableMember` SHALL include `internalId` as primary identifier.

**FR-14.3** `SyncableMember` SHALL include `memberType` field (TRIAL/FULL).

**FR-14.4** `SyncableMember` SHALL include `photoBase64` for photo sync.

**FR-14.5** Sync schema version SHALL be bumped to "10.0.0".

### Current Version Information

| System | Current Version | New Version |
|--------|-----------------|-------------|
| Android Room Database | 10 | **11** |
| Laptop Sync Schema | 9.0.0 | **10.0.0** |

### Sync Direction (Simplified per DD-9)

**New Architecture:**

```
Tablet → Laptop: Member (full data, all fields)
Laptop → Tablet: Member (full data, all fields)
```

No more filtering or separate types. Single `Member` entity everywhere.

### Photo Handling

**Current:** `NewMemberRegistration.photoPath` stores local file path, syncs as base64.

**New Consideration:**

- Where does `Member.registrationPhotoPath` point?
- Photo file location: `/app/registrations/` vs `/app/members/`?
- Photo filename: Should use `internalId` not `registrationId`

**New Requirement FR-8: Photo Management**

**FR-8.1** Registration photos SHALL be stored at: `{app_dir}/member_photos/{internalId}.jpg`

**FR-8.2** Photo sync SHALL embed base64 in sync payload (existing behavior).

**FR-8.3** Receiving device SHALL store photo using same path convention.

**FR-8.4** Photo deletion SHALL follow member deletion/inactivation rules.

### MemberType vs MemberStatus Confusion

**Potential Issue:** We now have two status-like fields:

- `memberType`: TRIAL, ACTIVE, INACTIVE
- `status`: ACTIVE, INACTIVE

**Clarification Required:**

| memberType | status | Meaning |
|------------|--------|---------|
| TRIAL | ACTIVE | New registration, can check in, no ID yet |
| TRIAL | INACTIVE | Trial expired or manually deactivated |
| ACTIVE | ACTIVE | Full member with ID, can check in |
| ACTIVE | INACTIVE | Full member, membership lapsed |
| INACTIVE | INACTIVE | Former member, archived |

**Recommendation:** Consider renaming:

- `memberType` → `membershipStage` (clearer: TRIAL vs CONFIRMED)
- Keep `status` for active/inactive operational status

Or alternatively, merge into single enum:

```kotlin
enum class MemberStatus {
    TRIAL_ACTIVE,      // New registration, active
    TRIAL_EXPIRED,     // Trial period ended, not converted
    MEMBER_ACTIVE,     // Full member, active
    MEMBER_INACTIVE,   // Full member, lapsed
    ARCHIVED           // Historical record
}
```

---

## Open Questions

## Design Decisions

The following decisions have been made to resolve the open questions:

### DD-1: Trial Member Feature Access

**Decision:** Trial members have **full access** to all features (check-in, practice sessions).

**Rationale:**

- The purpose of trial membership is to allow immediate participation
- Restricting features defeats the goal of eliminating approval delays
- Club can track trial member activity for conversion follow-up
- No technical benefit to restricting features

### DD-2: Trial Status Duration

**Decision:** No automatic expiration. Laptop shows **warning after 30 days**, **alert after 90 days**.

**Rationale:**

- Auto-expiration could accidentally deactivate legitimate members
- Visual warnings prompt admin action without data loss
- Club workflow may have legitimate reasons for extended trial periods
- Easy to add auto-expiration later if needed

**Implementation:**

- Yellow badge: 30-60 days without membershipId
- Red badge: 60+ days without membershipId
- Dashboard widget: "X trial members pending ID assignment"

### DD-3: Trial Member Deletion

**Decision:** Soft delete only via `status = INACTIVE`. Hard delete requires laptop admin action.

**Rationale:**

- Preserves audit trail and check-in history
- GDPR compliance may require hard delete capability on laptop
- Tablets cannot permanently delete member records
- Inactive trial members excluded from normal queries

### DD-4: Privacy Strategy for Sensitive Data

**Decision:** **Option D (Accept trade-off)** with future enhancement path.

**Rationale:**

- This is a small club environment with trusted staff
- Tablets are club property, not personal devices
- Complexity of Option B outweighs privacy benefit for MVP
- Can revisit if club expands or requirements change

**Implementation:**

- All member data (including sensitive fields) stored on all devices
- Tablets display sensitive data only in detailed member view (not list)
- Future enhancement: Add "Privacy Mode" setting to strip sensitive data

**Mitigation:**

- Tablets require PIN/password lock (club policy, not enforced by app)
- Member list shows name + trial badge only (not address/guardian)

### DD-5: MemberType and Status Enums

**Decision:** Keep **separate enums** but with clear semantics.

**Rationale:**

- Merging breaks more existing code than keeping separate
- Two dimensions are genuinely different concepts:
  - `memberType`: Lifecycle stage (TRIAL → FULL)
  - `status`: Operational state (ACTIVE/INACTIVE)
- Cleaner queries: "all active trials" vs "all inactive full members"

**Clarified Semantics:**

| memberType | Meaning |
|------------|---------|
| TRIAL | Registered but no official membershipId yet |
| FULL | Has official membershipId assigned |

| status | Meaning |
|--------|---------|
| ACTIVE | Can check in, use club services |
| INACTIVE | Cannot check in, archived/expired |

**Valid Combinations:**

| memberType | status | Use Case |
|------------|--------|----------|
| TRIAL | ACTIVE | New registration, using club |
| TRIAL | INACTIVE | Trial expired/rejected, never converted |
| FULL | ACTIVE | Normal active member |
| FULL | INACTIVE | Membership lapsed, former member |

**Rename:** Change `ACTIVE` memberType to `FULL` to avoid confusion with status.

### DD-6: Unsynced Trial Member Data

**Decision:** Retain indefinitely on tablet. Sync on next connection.

**Rationale:**

- Data loss is worse than stale data
- Tablets will eventually connect to laptop
- No automatic expiration of unsynced data
- Laptop admin can see "last sync" timestamp per device

**Implementation:**

- Trial members show "Not synced" indicator if `syncedAtUtc` is null
- Dashboard: "X members pending sync from [device]"
- No automatic cleanup of unsynced records

### DD-7: Duplicate Registration Prevention

**Decision:** **Detection, not prevention.** Laptop provides merge UI.

**Rationale:**

- Prevention at registration time is unreliable (offline tablets)
- Phone/email could be typos, blocking legitimate registrations
- Better UX: Let registration succeed, handle duplicates on laptop
- Laptop has full view of all members for accurate dedup

**Implementation:**

- Registration always succeeds (creates trial member)
- Laptop "Potential Duplicates" view shows:
  - Same phone number across different internalIds
  - Same email across different internalIds
  - Similar names (fuzzy match) registered within 7 days
- Admin can merge duplicates (keep one internalId, link history from both)

**New Requirement FR-9: Duplicate Detection and Member Merge**

**FR-9.1** Laptop SHALL display potential duplicate members based on matching phone, email, or similar names.

**FR-9.2** Laptop SHALL provide merge UI to combine two member records.

**FR-9.3** Merge SHALL preserve all history from both records by updating foreign keys:

- CheckIn records
- PracticeSession records
- ScanEvent records
- EquipmentCheckout records
- TransactionLine records

**FR-9.4** Merged member SHALL use the internalId of the primary (kept) record.

**FR-9.5** Merged (deleted) member record SHALL have `mergedIntoId` field pointing to surviving member for audit trail. Status remains INACTIVE (no new MERGED enum value).

**FR-9.6** Merge operation SHALL be atomic (all or nothing) within a database transaction.

### DD-8: Trial Members in Financial Tracking

**Decision:** Trial members **can** have financial transactions linked via `internalId`.

**Rationale:**

- Trial members may pay for day passes, equipment, etc.
- Waiting for membershipId assignment delays financial tracking
- `internalId` is stable and unique, suitable for financial FK
- When membershipId is assigned, existing transactions remain valid

**Implementation:**

- `TransactionLine.internalMemberId` links to `Member.internalId`
- Fee status view includes trial members (marked with trial badge)
- Annual membership fees typically assigned after membershipId (club policy)

### DD-9: Remove MemberForTabletSync Interface

**Decision:** Remove `MemberForTabletSync` entirely. Use single `Member` type everywhere.

**Rationale:**

- Per DD-4, all data is on all devices anyway
- Simpler codebase with single type
- Trial members originate on tablets with full data
- No benefit to filtering when syncing back

**Implementation:**

- Delete `MemberForTabletSync` interface from laptop codebase
- Delete `toTabletMember()` function
- Update all sync code to use `Member` directly
- Both directions sync complete member data

### DD-10: Member Merge Status Tracking

**Decision:** Do NOT add `MERGED` to `MemberStatus` enum. Use `mergedIntoId` field only.

**Rationale:**

- Keep enum simple (ACTIVE/INACTIVE only)
- `mergedIntoId != null` implicitly indicates merged state
- Avoids enum migration complexity
- Merged records set to INACTIVE status

**Implementation:**

- Add `mergedIntoId: String?` field to Member entity
- Merged member: `status = INACTIVE`, `mergedIntoId = {surviving member's internalId}`
- Query for merged: `WHERE mergedIntoId IS NOT NULL`

---

## Resolved Questions Archive

*The following questions have been resolved. See Design Decisions section above.*

1. ~~Q: Should trial members have any feature restrictions?~~ → **DD-1: Full access**

2. ~~Q: How long can a member remain in TRIAL status?~~ → **DD-2: No limit, warnings at 30/90 days**

3. ~~Q: Can trial members be deleted?~~ → **DD-3: Soft delete only on tablet**

4. ~~Q: Which privacy option for sensitive data on tablets?~~ → **DD-4: Accept trade-off (Option D)**

5. ~~Q: Should we merge memberType and status into single enum?~~ → **DD-5: Keep separate, rename ACTIVE→FULL**

6. ~~Q: What happens to trial member data if sync never completes?~~ → **DD-6: Retain indefinitely**

7. ~~Q: How to handle duplicate registrations for same person?~~ → **DD-7: Detect on laptop, merge UI**

8. ~~Q: Should trial members appear in financial/fee tracking?~~ → **DD-8: Yes, via internalId**

9. ~~Q: Should we remove MemberForTabletSync or keep for filtering?~~ → **DD-9: Remove entirely, use Member everywhere**

10. ~~Q: Should MERGED be a new MemberStatus enum value?~~ → **DD-10: No, use mergedIntoId field only**

---

## Remaining Open Questions

1. **Q: Should we generate temporary printable cards for trial members?**
   - Could use QR code with internalId
   - Deferred to future enhancement

## Appendix

### A. Glossary

| Term | Definition |
|------|------------|
| Trial Member (Prøvemedlem) | A member with `memberType = TRIAL`, no assigned membership ID yet |
| Full Member | A member with `memberType = FULL` and an assigned `membershipId` |
| Internal ID | UUID that uniquely identifies a member across all devices, never changes |
| Membership ID | Club-assigned identifier, typically a number or formatted string |
| Member Type | Lifecycle stage: `TRIAL` (pending ID) or `FULL` (has ID) |
| Member Status | Operational state: `ACTIVE` (can use services) or `INACTIVE` (archived) |

### B. Related Documents

- [Trial Member Registration - Technical Design](design.md) ← **Primary technical reference**
- [Distributed Membership System Design](../distributed-membership-system/design.md)
- [Enhanced Member Registration Design](../enhanced-member-registration/design.md)
- [Equipment Sync Feature](../equipment-sync/)

### C. Revision History

| Date | Author | Changes |
|------|--------|---------|
| 2026-01-20 | sbalslev | Initial PRD creation |
| 2026-01-20 | sbalslev | v1.1: Added Gap Analysis section identifying entity field mismatches, privacy considerations, sync complexity, photo handling, and status enum confusion. Added 5 new open questions. |
| 2026-01-20 | sbalslev | v1.2: Resolved all 8 open questions with Design Decisions (DD-1 through DD-8). Added FR-9 for duplicate detection. Renamed memberType.ACTIVE to FULL. |
| 2026-01-20 | sbalslev | v1.3: Added FR-10 (Equipment Checkout), FR-11 (Financial Transactions), FR-12 (Trial Member Lookup/QR), FR-13 (Sync Version Compatibility). Updated FR-5.3 to include all entities. Expanded FR-9 with merge details and audit trail. |
| 2026-01-20 | sbalslev | v1.4: Added FR-14 (Sync Payload Update) with 7 missing fields + photo. Added DD-9 (remove MemberForTabletSync) and DD-10 (no MERGED enum). Documented current versions: Android DB v10→11, Sync schema 9.0.0→10.0.0. |
