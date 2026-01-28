# Enhanced Trial Registration with ID Verification

**Feature:** Enhanced Trial Registration with Age Validation & ID Capture
**Version:** 1.0
**Status:** Draft
**Created:** 2026-01-27
**Author:** sbalslev

---

## Executive Summary

This feature enhances the trial member registration flow with age validation, adult ID verification, photo review capabilities, and trainer assistance features. Adults (18+) must provide a government ID photo during registration. The trainer app gains capabilities to view and retake photos, and assist members with check-in. The ID photo is automatically deleted when the member receives a membership ID and has paid their annual fee.

---

## Problem Statement

### Current State
1. **No age validation**: Birth date field has no validation for valid dates
2. **No adult verification**: No mechanism to verify adult identity during trial registration
3. **No photo review**: Photos are captured but cannot be reviewed/retaken in a dedicated flow
4. **Limited trainer capabilities**: Trainers cannot view or update member photos, nor assist with check-in efficiently
5. **No ID lifecycle management**: No business rule to delete ID photos when no longer needed

### Desired State
1. **Valid birth dates**: Registration validates birth date is a plausible date
2. **Adult ID requirement**: Adults (18+) must capture a government ID photo
3. **Photo review flow**: Both profile and ID photos can be reviewed and retaken
4. **Trainer photo management**: Trainers can view and retake photos for trial members
5. **Trainer assisted check-in**: Trainers can help members check in and register practice sessions
6. **ID photo lifecycle**: ID photos deleted when member is fully onboarded (ID assigned + fee paid)

---

## Goals

| ID | Goal | Success Metric |
|----|------|----------------|
| G-1 | Validate member age at registration | 100% of registrations have valid birth dates |
| G-2 | Capture adult ID for verification | All adult (18+) trial members have ID photo |
| G-3 | Improve photo quality through review | Users can retake photos until satisfied |
| G-4 | Enable trainer photo management | Trainers can view/retake photos for all trial members |
| G-5 | Streamline trainer-assisted check-in | Trainers can check in members without cards |
| G-6 | Automatic ID photo cleanup | ID photos deleted within 24h of full membership |
| G-7 | Sync ID photos across all systems | ID photos available on trainer app and laptop |

---

## User Stories

### Epic 1: Member App - Enhanced Registration

#### US-1.1: Age Validation
**As a** potential member registering at the kiosk
**I want** the system to validate my birth date
**So that** my age is accurately recorded for membership purposes

**Acceptance Criteria:**
- [ ] Birth date field validates format (YYYY-MM-DD or DD-MM-YYYY)
- [ ] Birth date must be a real date (no Feb 30, etc.)
- [ ] Birth date cannot be in the future
- [ ] Birth date cannot indicate age > 120 years
- [ ] Clear error message displayed for invalid dates
- [ ] Cannot proceed without valid birth date

#### US-1.2: Adult Detection
**As a** potential member registering at the kiosk
**I want** the system to detect if I am an adult
**So that** appropriate verification can be requested

**Acceptance Criteria:**
- [ ] System calculates age from birth date
- [ ] If age >= 18, user is flagged as adult
- [ ] Adult status triggers ID verification requirement
- [ ] Age displayed for confirmation before proceeding

#### US-1.3: Profile Photo Review & Retake
**As a** potential member
**I want** to review my photo before accepting it
**So that** I can ensure the photo is acceptable quality

**Acceptance Criteria:**
- [ ] After photo capture, display preview screen
- [ ] Preview shows full-size photo clearly
- [ ] "Accept" button to proceed with photo
- [ ] "Retake" button to return to camera
- [ ] Can retake unlimited times until satisfied
- [ ] Photo not saved until explicitly accepted

#### US-1.4: ID Photo Capture (Adults Only)
**As an** adult (18+) potential member
**I want** to capture a photo of my government ID
**So that** my identity can be verified by club staff

**Acceptance Criteria:**
- [ ] ID capture step shown only for adults (age >= 18)
- [ ] Instructions displayed: "Please show your driver's license or ID card"
- [ ] Rear camera used for ID capture (not selfie camera)
- [ ] ID photo stored separately from profile photo
- [ ] Clear distinction in UI between profile photo and ID photo steps

#### US-1.5: ID Photo Review & Retake
**As an** adult potential member
**I want** to review my ID photo before accepting it
**So that** I can ensure the ID is clearly readable

**Acceptance Criteria:**
- [ ] After ID capture, display preview screen
- [ ] Preview shows ID photo clearly
- [ ] "Accept" button to proceed
- [ ] "Retake" button to return to camera
- [ ] Can retake unlimited times until satisfied
- [ ] ID photo not saved until explicitly accepted

#### US-1.6: Registration Completion with ID
**As a** potential member who has completed all steps
**I want** to complete my registration
**So that** I can start my trial membership

**Acceptance Criteria:**
- [ ] Registration saves: profile photo, ID photo (if adult), all personal data
- [ ] Trial member created with `memberLifecycleStage = TRIAL`
- [ ] Both photos sync to laptop and trainer app
- [ ] Confirmation screen shows registration successful
- [ ] Member can immediately check in using name search

---

### Epic 2: Trainer App - Trial Member Management

#### US-2.1: View Trial Members List
**As a** trainer
**I want** to see a list of recent trial members
**So that** I can welcome and assist new members

**Acceptance Criteria:**
- [ ] Dashboard shows "New Trial Members" section
- [ ] Lists trial members registered in last 7 days
- [ ] Shows: name, registration date, photo thumbnail
- [ ] Indicates if member has ID photo on file
- [ ] Tapping entry opens member detail view

#### US-2.2: View Trial Member Photos
**As a** trainer
**I want** to view a trial member's profile photo and ID photo
**So that** I can verify their identity and photo quality

**Acceptance Criteria:**
- [ ] Member detail view shows profile photo (full size)
- [ ] Member detail view shows ID photo (full size) if available
- [ ] Photos can be zoomed/expanded for inspection
- [ ] Clear labels distinguish profile photo from ID photo
- [ ] Shows "No ID photo" indicator for minors or missing ID

#### US-2.3: Retake Profile Photo
**As a** trainer
**I want** to retake a trial member's profile photo
**So that** I can improve photo quality if needed

**Acceptance Criteria:**
- [ ] "Retake Photo" button available in member detail view
- [ ] Opens camera in photo capture mode
- [ ] Shows preview with accept/retake options
- [ ] Accepted photo replaces existing profile photo
- [ ] Update syncs to laptop and member app
- [ ] Original photo is overwritten (not archived)

#### US-2.4: Retake ID Photo
**As a** trainer
**I want** to retake a trial member's ID photo
**So that** I can capture a clearer ID image

**Acceptance Criteria:**
- [ ] "Retake ID" button available for adult trial members
- [ ] Opens camera in ID capture mode (rear camera)
- [ ] Shows preview with accept/retake options
- [ ] Accepted photo replaces existing ID photo
- [ ] Update syncs to laptop and member app
- [ ] Button hidden for minors (no ID requirement)

#### US-2.5: Assisted Check-in
**As a** trainer
**I want** to check in a member on their behalf
**So that** members without cards can still register attendance

**Acceptance Criteria:**
- [ ] "Check In Member" function in trainer dashboard
- [ ] Search member by name or internal ID
- [ ] Confirm member identity (shows photo)
- [ ] Creates check-in record for current day
- [ ] Shows existing check-in if already checked in today
- [ ] Plays check-in sound confirmation

#### US-2.6: Assisted Practice Session Registration
**As a** trainer
**I want** to register a practice session for a member
**So that** members without cards can record their scores

**Acceptance Criteria:**
- [ ] After assisted check-in, option to "Add Practice Session"
- [ ] Standard practice session form (discipline, points, classification)
- [ ] Session linked to member's internalId
- [ ] Trainer ID recorded as session source
- [ ] Syncs to laptop and leaderboards

---

### Epic 3: Laptop Admin - ID Photo Management

#### US-3.1: View ID Photo in Member Details
**As an** administrator
**I want** to view a member's ID photo alongside their profile photo
**So that** I can verify their identity before assigning membership

**Acceptance Criteria:**
- [ ] Member detail dialog shows both profile and ID photos
- [ ] ID photo section labeled "ID Verification Photo"
- [ ] Photos can be clicked to enlarge
- [ ] Shows "No ID photo" for minors
- [ ] Shows "ID photo pending" if adult but no ID synced yet

#### US-3.2: ID Photo Sync Status
**As an** administrator
**I want** to see if ID photos have synced from tablets
**So that** I know when I can verify a member's identity

**Acceptance Criteria:**
- [ ] Trial member list indicates ID photo status
- [ ] Status: "ID photo available" / "ID photo pending" / "Not required (minor)"
- [ ] Filter option to show only members with pending ID photos
- [ ] Sync timestamp shown for ID photo

#### US-3.3: Automatic ID Photo Deletion
**As a** system
**I want** to delete ID photos when they are no longer needed
**So that** we comply with data minimization principles

**Acceptance Criteria:**
- [ ] Trigger conditions: membershipId assigned AND annual fee fully paid
- [ ] ID photo deleted from laptop storage
- [ ] ID photo deletion syncs to online database
- [ ] Deletion logged for audit trail
- [ ] Profile photo is NOT deleted (retained for membership)
- [ ] Admin notified of deletion via activity log

---

### Epic 4: Online Database Sync

#### US-4.1: ID Photo Sync to Cloud
**As a** system administrator
**I want** ID photos to sync to the online database
**So that** data is backed up and available across locations

**Acceptance Criteria:**
- [ ] `id_photo` field added to online `members` table
- [ ] ID photo syncs as base64 in sync payload
- [ ] ID photo deletion syncs (sets field to null)
- [ ] Sync maintains photo integrity (no corruption)
- [ ] ID photos subject to same backup/retention as profile photos

#### US-4.2: ID Photo Pull to Devices
**As a** trainer app
**I want** to receive ID photos from the online database
**So that** I can view ID photos captured on other devices

**Acceptance Criteria:**
- [ ] ID photos included in sync pull response
- [ ] Trainer app stores ID photos locally
- [ ] ID photos displayed in trial member view
- [ ] Updates to ID photos (retakes) sync correctly

---

## Functional Requirements

### FR-1: Age Validation

**FR-1.1** Birth date input SHALL validate format as valid date.

**FR-1.2** System SHALL reject birth dates in the future.

**FR-1.3** System SHALL reject birth dates indicating age > 120 years.

**FR-1.4** System SHALL calculate age as `floor((today - birthDate) / 365.25)`.

**FR-1.5** Birth date SHALL be required for registration (not optional).

### FR-2: Adult ID Capture

**FR-2.1** System SHALL determine adult status as `age >= 18`.

**FR-2.2** Adult registrations SHALL require ID photo capture step.

**FR-2.3** Minor registrations SHALL skip ID photo capture step.

**FR-2.4** ID capture SHALL use rear-facing camera.

**FR-2.5** ID photo SHALL be stored in `idPhotoPath` field (separate from `photoPath`).

**FR-2.6** ID photo filename SHALL use pattern: `{internalId}_id.jpg`.

### FR-3: Photo Review Flow

**FR-3.1** After each photo capture, system SHALL display preview screen.

**FR-3.2** Preview screen SHALL offer "Accept" and "Retake" options.

**FR-3.3** "Retake" SHALL return to camera without saving photo.

**FR-3.4** "Accept" SHALL save photo and proceed to next step.

**FR-3.5** User MAY retake photos unlimited times.

### FR-4: Member Entity Changes

**FR-4.1** Member entity SHALL add `idPhotoPath: String?` field for ID photo file path.

**FR-4.2** Member entity SHALL add `idPhotoThumbnail: String?` field for ID photo thumbnail.

**FR-4.3** Member entity SHALL add `isAdult: Boolean` computed field (`age >= 18`).

**FR-4.4** Sync payload SHALL include `idPhotoBase64` field for ID photo sync.

### FR-5: Trainer App Features

**FR-5.1** Trainer dashboard SHALL display list of trial members from last 7 days.

**FR-5.2** Trainer app SHALL display profile and ID photos in member detail view.

**FR-5.3** Trainer app SHALL allow retaking profile photo for any member.

**FR-5.4** Trainer app SHALL allow retaking ID photo for adult members only.

**FR-5.5** Trainer app SHALL provide assisted check-in via member search.

**FR-5.6** Trainer app SHALL allow registering practice sessions for any member.

**FR-5.7** Assisted operations SHALL record trainer's `internalId` as operator.

### FR-6: Laptop Admin Features

**FR-6.1** Member detail dialog SHALL display ID photo alongside profile photo.

**FR-6.2** Trial member list SHALL indicate ID photo availability status.

**FR-6.3** Admin SHALL be able to filter trial members by ID photo status.

### FR-7: ID Photo Deletion Rule

**FR-7.1** System SHALL delete ID photo when BOTH conditions are met:
  - Member has `membershipId` assigned (not null)
  - Member has paid annual membership fee in full for current fiscal year

**FR-7.2** ID photo deletion SHALL remove file from local storage.

**FR-7.3** ID photo deletion SHALL set `idPhotoPath` and `idPhotoThumbnail` to null.

**FR-7.4** ID photo deletion SHALL sync to online database (set fields to null).

**FR-7.5** ID photo deletion SHALL be logged with timestamp and reason.

**FR-7.6** Deletion check SHALL run on:
  - MembershipId assignment
  - Fee payment recording
  - Daily scheduled job

### FR-8: Sync Protocol Updates

**FR-8.1** Sync schema version SHALL be incremented for ID photo support.

**FR-8.2** Member sync payload SHALL include:
  - `idPhotoPath`: String? (local path)
  - `idPhotoThumbnail`: String? (data URL)
  - `idPhotoBase64`: String? (for transfer)

**FR-8.3** Online API SHALL store ID photo in `id_photo_data` MEDIUMBLOB column.

**FR-8.4** Sync SHALL handle ID photo deletion (null values).

---

## Non-Functional Requirements

### NFR-1: Performance

**NFR-1.1** Photo preview SHALL display within 500ms of capture.

**NFR-1.2** ID photo sync SHALL not significantly increase sync time (< 2 additional seconds).

**NFR-1.3** ID photo deletion job SHALL complete within 10 seconds for up to 100 members.

### NFR-2: Storage

**NFR-2.1** ID photos SHALL be compressed to JPEG quality 80 (same as profile photos).

**NFR-2.2** ID photo max file size SHALL be 500KB.

**NFR-2.3** ID photos SHALL be stored in same directory structure as profile photos.

### NFR-3: Privacy & Security

**NFR-3.1** ID photos SHALL be treated as sensitive personal data.

**NFR-3.2** ID photos SHALL be deleted as soon as no longer needed (per FR-7).

**NFR-3.3** ID photo access SHALL be limited to trainer and admin roles.

**NFR-3.4** Member app SHALL NOT display ID photos (only capture).

### NFR-4: Usability

**NFR-4.1** Photo review UI SHALL clearly show photo at sufficient size for quality assessment.

**NFR-4.2** Retake button SHALL be prominently displayed.

**NFR-4.3** Adult ID requirement SHALL be clearly communicated before capture.

---

## Data Model Changes

### Android Entity: Member (Updated)

```kotlin
@Entity(indices = [
    Index(value = ["membershipId"], unique = true),
    Index(value = ["memberLifecycleStage"]),
    Index(value = ["status"])
])
data class Member(
    @PrimaryKey val internalId: String,
    val membershipId: String? = null,
    val memberLifecycleStage: MemberLifecycleStage = MemberLifecycleStage.TRIAL,
    val firstName: String,
    val lastName: String,
    val birthDate: LocalDate? = null,
    val gender: String? = null,
    // ... existing fields ...

    // Profile photo
    val photoPath: String? = null,
    val photoThumbnail: String? = null,

    // ID photo (NEW)
    val idPhotoPath: String? = null,
    val idPhotoThumbnail: String? = null,

    // Sync metadata
    val syncVersion: Long = 0,
    val createdAtUtc: Instant,
    val updatedAtUtc: Instant,
    val syncedAtUtc: Instant? = null
) {
    /** Computed property: is member an adult (age >= 18) */
    val isAdult: Boolean
        get() = birthDate?.let {
            val age = Period.between(it, LocalDate.now()).years
            age >= 18
        } ?: false
}
```

### TypeScript Entity: Member (Updated)

```typescript
export interface Member {
  internalId: string;
  membershipId: string | null;
  memberLifecycleStage: 'TRIAL' | 'FULL';
  firstName: string;
  lastName: string;
  birthday: string | null;
  gender: Gender | null;
  // ... existing fields ...

  // Profile photo
  photoPath: string | null;
  photoThumbnail: string | null;

  // ID photo (NEW)
  idPhotoPath: string | null;
  idPhotoThumbnail: string | null;

  // Sync metadata
  syncVersion: number;
  createdAtUtc: string;
  updatedAtUtc: string;
  syncedAtUtc: string | null;
}

// Computed helper
export function isAdult(member: Member): boolean {
  if (!member.birthday) return false;
  const birthDate = new Date(member.birthday);
  const today = new Date();
  const age = Math.floor((today.getTime() - birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  return age >= 18;
}
```

### Online Database Schema Update

```sql
-- Add ID photo columns to members table
ALTER TABLE members
ADD COLUMN id_photo_path VARCHAR(500) NULL,
ADD COLUMN id_photo_thumbnail MEDIUMTEXT NULL,
ADD COLUMN id_photo_data MEDIUMBLOB NULL;

-- Add deletion log entry type
-- (uses existing _deletion_log table)
```

### Sync Payload Update

```typescript
interface MemberSyncPayload extends Member {
  photoBase64?: string;      // Profile photo for transfer
  idPhotoBase64?: string;    // ID photo for transfer (NEW)
}
```

---

## Implementation Phases

### Phase 1: Data Model & Schema
1. Add `idPhotoPath` and `idPhotoThumbnail` to Android Member entity
2. Add fields to TypeScript Member interface
3. Update laptop SQLite schema
4. Update online MySQL schema (V1.5.0)
5. Update sync payload types

### Phase 2: Member App - Age Validation & Photo Review
1. Add birth date validation logic
2. Implement photo preview/review screen
3. Add accept/retake buttons to photo flow
4. Add adult detection logic

### Phase 3: Member App - ID Photo Capture
1. Add ID photo capture step for adults
2. Implement rear camera selection
3. Add ID photo preview/review screen
4. Store ID photo with separate path
5. Update registration completion to save ID photo

### Phase 4: Sync - ID Photo Support
1. Add `idPhotoBase64` to sync payload
2. Update tablet sync to send ID photos
3. Update laptop sync to receive ID photos
4. Update online API to handle ID photos
5. Update pull sync to distribute ID photos

### Phase 5: Trainer App - View Features
1. Add trial members list to dashboard
2. Implement member detail view with photos
3. Display both profile and ID photos
4. Add ID photo status indicators

### Phase 6: Trainer App - Retake & Assist Features
1. Implement retake profile photo
2. Implement retake ID photo (adults only)
3. Implement assisted check-in
4. Implement assisted practice session registration
5. Record trainer as operator for assisted actions

### Phase 7: Laptop Admin - ID Photo Display
1. Add ID photo to member detail dialog
2. Add ID photo status to trial member list
3. Add filter for ID photo status

### Phase 8: ID Photo Deletion Rule
1. Implement deletion trigger logic
2. Add check on membershipId assignment
3. Add check on fee payment recording
4. Implement scheduled deletion job
5. Add deletion logging
6. Sync deletion to online database

---

## Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| ID photos not captured due to skipped step | High | Low | Make ID capture mandatory for adults, cannot proceed without |
| Poor ID photo quality | Medium | Medium | Preview/retake flow, trainer can retake |
| ID photo not synced before needed | Medium | Low | Indicate sync status, allow manual sync trigger |
| Privacy concerns with ID storage | High | Low | Auto-deletion rule, limited access, audit logging |
| Sync payload size increase | Medium | Medium | Compress ID photos, same limits as profile photos |

---

## Open Questions

| ID | Question | Status |
|----|----------|--------|
| Q1 | Should ID photos be visible on member tablet (self-service)? | Proposed: No - only capture, not view |
| Q2 | How long to retain ID photo deletion audit logs? | Proposed: 2 years |
| Q3 | Should trainer be able to capture ID for existing members (not just trial)? | Proposed: No - only during trial period |

---

## Appendix

### A. Glossary

| Term | Definition |
|------|------------|
| Profile Photo | The member's face photo used for identification at check-in |
| ID Photo | Photo of government-issued identification (driver's license, ID card) |
| Adult | A person aged 18 years or older |
| Minor | A person under 18 years of age |
| Trial Member | A member with `memberLifecycleStage = TRIAL`, no membership ID assigned |
| Full Member | A member with assigned `membershipId` and `memberLifecycleStage = FULL` |

### B. Related Documents

- [Trial Member Registration PRD](../trial-member-registration/prd.md)
- [Enhanced Member Registration Design](../enhanced-member-registration/design.md)
- [Trainer Experience PRD](../trainer-experience/prd.md)
- [Photo Storage Optimization](../photo-storage-optimization/design.md)
- [Online Database Sync Technical Design](../online-database-sync/technical-design.md)

### C. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-27 | sbalslev | Initial PRD creation |
