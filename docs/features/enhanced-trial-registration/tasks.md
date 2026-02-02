# Enhanced Trial Registration - Implementation Tasks

**Feature:** Enhanced Trial Registration with Age Validation & ID Capture
**Created:** 2026-01-27
**Status:** Not Started

---

## Task Overview

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 | Data Model & Schema Updates | ✅ Complete |
| Phase 2 | Member App - Age Validation & Photo Review | ✅ Complete |
| Phase 3 | Member App - ID Photo Capture | ✅ Complete (merged into Phase 2) |
| Phase 4 | Sync - ID Photo Support | ✅ Complete |
| Phase 5 | Trainer App - View Features | ✅ Complete |
| Phase 6 | Trainer App - Retake & Assist Features | ✅ Complete |
| Phase 7 | Laptop Admin - ID Photo Display | ✅ Complete |
| Phase 8 | ID Photo Deletion Rule | ✅ Complete |

---

## Phase 1: Data Model & Schema Updates

### Task 1.1: Android Member Entity Update
**Status:** ✅ Complete

**Subtasks:**
- [x] 1.1.1 Add `idPhotoPath: String?` field to `Member` entity
- [x] 1.1.2 Add `idPhotoPath` and `idPhotoBase64` to `SyncableMember`
- [x] 1.1.3 Update `SyncSchemaVersion` to 1.5.0
- [x] 1.1.4 Create Room database migration (version 15 → 16)
- [x] 1.1.5 Update `AppDatabase` version to 16
- [x] 1.1.6 Update `SyncOutboxManager.queueMember()` to include idPhotoBase64

**Files:**
- `app/src/main/java/com/club/medlems/data/entity/Entities.kt`
- `app/src/main/java/com/club/medlems/data/db/AppDatabase.kt`
- `app/src/main/java/com/club/medlems/data/sync/SyncableEntities.kt`
- `app/src/main/java/com/club/medlems/data/sync/SyncMetadata.kt`
- `app/src/main/java/com/club/medlems/di/DatabaseModule.kt`
- `app/src/main/java/com/club/medlems/data/sync/SyncOutboxManager.kt`

### Task 1.2: TypeScript Member Interface Update
**Status:** ✅ Complete

**Subtasks:**
- [x] 1.2.1 Add `idPhotoPath: string | null` to `Member` interface
- [x] 1.2.2 Add `idPhotoThumbnail: string | null` to `Member` interface
- [x] 1.2.3 Add `isAdult(member: Member): boolean` utility function
- [x] 1.2.4 Update any type guards or validation functions
- [x] 1.2.5 Add `calculateAge()`, `needsIdPhoto()`, `getIdPhotoStatus()` utilities
- [x] 1.2.6 Update `MemberListItem` interface with birthDate and idPhotoThumbnail

**Files:**
- `laptop/src/types/entities.ts`

### Task 1.3: Laptop SQLite Schema Update
**Status:** ✅ Complete

**Subtasks:**
- [x] 1.3.1 Add `idPhotoPath` column to members table
- [x] 1.3.2 Add `idPhotoThumbnail` column to members table
- [x] 1.3.3 Update schema version to 14
- [x] 1.3.4 Add migration logic in `db.ts`
- [x] 1.3.5 Update `memberRepository.ts` upsertMember and getMembersForList

**Files:**
- `laptop/src/database/db.ts`
- `laptop/src/database/memberRepository.ts`

### Task 1.4: Online MySQL Schema Update
**Status:** ✅ Complete

**Subtasks:**
- [x] 1.4.1 Create migration script `V1_5_0__add_id_photo_fields.sql`
- [x] 1.4.2 Add `id_photo_path VARCHAR(500) NULL`
- [x] 1.4.3 Add `id_photo_thumbnail MEDIUMTEXT NULL`
- [x] 1.4.4 Update `member_photos.photo_type` ENUM to include 'id'
- [x] 1.4.5 Create `audit_log` table for ID photo deletion tracking
- [x] 1.4.6 Update schema changelog documentation

**Files:**
- `api/schema/V1_5_0__add_id_photo_fields.sql`
- `docs/features/online-database-sync/schema-changelog.md`

### Task 1.5: Sync Payload Type Update
**Status:** ✅ Complete

**Subtasks:**
- [x] 1.5.1 Add `idPhotoPath` and `idPhotoBase64` to Android `SyncableMember`
- [x] 1.5.2 Add `idPhotoBase64?: string` to TypeScript `SyncableMember` interface
- [x] 1.5.3 Update `syncService.ts` with ID photo processing
- [x] 1.5.4 Update `onlineApiService.ts` with ID photo fields
- [x] 1.5.5 Update `sync_push.php` to handle ID photo fields (v1.5.0)
- [x] 1.5.6 Update `sync_pull.php` to return ID photo fields (v1.5.0)
- [x] 1.5.7 Update `diagnostic.php` to v1.5.0

**Files:**
- `app/src/main/java/com/club/medlems/data/sync/SyncableEntities.kt`
- `laptop/src/database/syncService.ts`
- `laptop/src/database/onlineApiService.ts`
- `api/handlers/sync_push.php`
- `api/handlers/sync_pull.php`
- `api/handlers/diagnostic.php`

---

## Phase 2: Member App - Age Validation & Photo Review

### Task 2.1: Birth Date Validation
**Status:** ✅ Complete

**Subtasks:**
- [x] 2.1.1 Create `BirthDateValidator` utility class
- [x] 2.1.2 Validate date format (DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY, ISO)
- [x] 2.1.3 Validate date is not in future
- [x] 2.1.4 Validate age is not > 120 years
- [x] 2.1.5 Validate date is a real date (no Feb 30)
- [x] 2.1.6 Return validation result with error message
- [x] 2.1.7 Write unit tests for validator

**Files:**
- `app/src/main/java/com/club/medlems/util/BirthDateValidator.kt`
- `app/src/test/java/com/club/medlems/util/BirthDateValidatorTest.kt`

### Task 2.2: Update Registration Form with Validation
**Status:** ✅ Complete

**Subtasks:**
- [x] 2.2.1 Make birth date field required
- [x] 2.2.2 Add real-time validation feedback
- [x] 2.2.3 Show error state with message for invalid dates
- [x] 2.2.4 Block form submission until birth date is valid
- [x] 2.2.5 Calculate and display age after valid entry
- [x] 2.2.6 Show "adult - ID required" or "child" indicator

**Files:**
- `app/src/main/java/com/club/medlems/ui/attendant/RegistrationScreen.kt`

### Task 2.3: Photo Preview Screen Component
**Status:** ✅ Complete

**Subtasks:**
- [x] 2.3.1 Create `PhotoPreviewScreen` composable (inline in RegistrationScreen.kt)
- [x] 2.3.2 Display captured photo using Coil AsyncImage
- [x] 2.3.3 Add "Godkend" (Accept) button (primary action)
- [x] 2.3.4 Add "Tag nyt" (Retake) button (secondary action)
- [x] 2.3.5 Handle navigation back to camera on retake
- [x] 2.3.6 Handle navigation forward on accept
- [x] 2.3.7 Reusable for both profile and ID photo preview

**Files:**
- `app/src/main/java/com/club/medlems/ui/attendant/RegistrationScreen.kt`

### Task 2.4: Integrate Photo Review into Registration Flow
**Status:** ✅ Complete

**Subtasks:**
- [x] 2.4.1 Update registration flow state machine (6 steps)
- [x] 2.4.2 After profile photo capture, navigate to preview (step 3)
- [x] 2.4.3 On accept, proceed to ID photo (adults) or save (minors)
- [x] 2.4.4 On retake, return to camera
- [x] 2.4.5 Track photo acceptance state
- [x] 2.4.6 Update step indicator dynamically (4 or 6 steps)

**Files:**
- `app/src/main/java/com/club/medlems/ui/attendant/RegistrationScreen.kt`

---

## Phase 3: Member App - ID Photo Capture (Merged into Phase 2)

### Task 3.1: Adult Detection Logic
**Status:** ✅ Complete (merged into BirthDateValidator)

**Subtasks:**
- [x] 3.1.1 Age calculation integrated into `BirthDateValidator`
- [x] 3.1.2 Calculate age from birth date
- [x] 3.1.3 Return adult status (age >= 18) via `isAdult()` method
- [x] 3.1.4 Exposed via RegistrationState.isAdult for UI decisions
- [x] 3.1.5 Unit tests included in BirthDateValidatorTest

**Files:**
- `app/src/main/java/com/club/medlems/util/BirthDateValidator.kt`
- `app/src/test/java/com/club/medlems/util/BirthDateValidatorTest.kt`

### Task 3.2: ID Photo Capture Screen
**Status:** ✅ Complete (reusing CameraPreview with rear camera)

**Subtasks:**
- [x] 3.2.1 Reuse `CameraPreview` composable with `useFrontCamera=false`
- [x] 3.2.2 Display instructions via `instructionText` parameter
- [x] 3.2.3 Use rear-facing camera for ID capture
- [x] 3.2.4 Same capture button as profile photo
- [x] 3.2.5 Camera permissions already handled
- [x] 3.2.6 Save captured image to app-specific directory

**Files:**
- `app/src/main/java/com/club/medlems/ui/attendant/RegistrationScreen.kt`

### Task 3.3: ID Photo Preview Screen
**Status:** ✅ Complete (reusing PhotoPreviewScreen)

**Subtasks:**
- [x] 3.3.1 Reuse `PhotoPreviewScreen` with ID-specific labels
- [x] 3.3.2 Displays "ID-billede" label
- [x] 3.3.3 Same Accept/Retake buttons
- [x] 3.3.4 Navigation integrated into flow

**Files:**
- `app/src/main/java/com/club/medlems/ui/attendant/RegistrationScreen.kt`

### Task 3.4: Update Registration Flow for ID Step
**Status:** ✅ Complete

**Subtasks:**
- [x] 3.4.1 Added steps 4 (ID camera) and 5 (ID preview) for adults
- [x] 3.4.2 Minors skip from step 3 to step 6
- [x] 3.4.3 Dynamic step indicator (4 or 6 total steps)
- [x] 3.4.4 Full navigation between all steps
- [x] 3.4.5 RegistrationState includes idPhotoPath

**Files:**
- `app/src/main/java/com/club/medlems/ui/attendant/RegistrationScreen.kt`

### Task 3.5: Save ID Photo on Registration Complete
**Status:** ✅ Complete

**Subtasks:**
- [x] 3.5.1 ID photo saved with timestamp naming
- [x] 3.5.2 Path stored in Member.idPhotoPath
- [x] 3.5.3 ID photo included in member record
- [x] 3.5.4 Null for minors (not captured)

**Files:**
- `app/src/main/java/com/club/medlems/ui/attendant/RegistrationScreen.kt`

---

## Phase 4: Sync - ID Photo Support

### Task 4.1: Android Sync - Send ID Photo
**Status:** ✅ Complete

**Subtasks:**
- [x] 4.1.1 Read ID photo file when preparing sync payload
- [x] 4.1.2 Encode ID photo as base64
- [x] 4.1.3 Include `idPhotoBase64` in member sync payload
- [x] 4.1.4 Handle null ID photo (minors, not captured)
- [x] 4.1.5 Added idPhotoBase64 parameter to queueMember()

**Files:**
- `app/src/main/java/com/club/medlems/data/sync/SyncOutboxManager.kt`
- `app/src/main/java/com/club/medlems/data/sync/SyncableEntities.kt`
- `app/src/main/java/com/club/medlems/ui/attendant/RegistrationScreen.kt`

### Task 4.2: Laptop Sync - Receive ID Photo
**Status:** ✅ Complete (in Phase 1)

**Subtasks:**
- [x] 4.2.1 Parse `idPhotoBase64` from sync payload
- [x] 4.2.2 Decode and save ID photo file
- [x] 4.2.3 Generate ID photo thumbnail
- [x] 4.2.4 Store paths in member record
- [x] 4.2.5 Handle null ID photo appropriately

**Files:**
- `laptop/src/database/syncService.ts`

### Task 4.3: Online API - ID Photo Handling
**Status:** ✅ Complete (in Phase 1)

**Subtasks:**
- [x] 4.3.1 Update `sync_push.php` to receive ID photo fields (v1.5.0)
- [x] 4.3.2 Store ID photo in `id_photo_path`, `id_photo_thumbnail` columns
- [x] 4.3.3 Update `sync_pull.php` to include ID photo fields (v1.5.0)
- [x] 4.3.4 Handle null ID photo values

**Files:**
- `api/handlers/sync_push.php`
- `api/handlers/sync_pull.php`

### Task 4.4: Laptop Online Sync - ID Photo
**Status:** ✅ Complete (in Phase 1)

**Subtasks:**
- [x] 4.4.1 Include ID photo fields in online sync
- [x] 4.4.2 OnlineMember includes id_photo_path, id_photo_thumbnail
- [x] 4.4.3 memberToOnline/memberFromOnline handle ID photo fields

**Files:**
- `laptop/src/database/onlineApiService.ts`

---

## Phase 5: Trainer App - View Features

### Task 5.1: Trial Members List Component
**Status:** ✅ Complete

**Subtasks:**
- [x] 5.1.1 Create `TrialMembersSection` composable in TrainerDashboardScreen
- [x] 5.1.2 Query trial members from last 7 days via `getRecentTrialMembers()`
- [x] 5.1.3 Display name, registration date, age badge
- [x] 5.1.4 Show ID photo status indicator (profile photo & ID photo icons)
- [x] 5.1.5 Handle empty state (section hidden when no trial members)
- [x] 5.1.6 Auto-refresh with dashboard (30-second interval)

**Files:**
- `app/src/main/java/com/club/medlems/data/dao/Daos.kt` (added `getRecentTrialMembers`)
- `app/src/main/java/com/club/medlems/ui/trainer/dashboard/TrainerDashboardScreen.kt`
- `app/src/main/java/com/club/medlems/ui/trainer/dashboard/TrainerDashboardViewModel.kt`

### Task 5.2: Trial Member Detail View
**Status:** ✅ Complete

**Subtasks:**
- [x] 5.2.1 Create `TrialMemberDetailScreen` composable
- [x] 5.2.2 Display member information (name, age, contact)
- [x] 5.2.3 Display profile photo (full size in card)
- [x] 5.2.4 Display ID photo (full size) if available
- [x] 5.2.5 Show warning for adults missing ID photo
- [x] 5.2.6 Show "ID-billede kræves ikke for børn" for minors
- [x] 5.2.7 Navigation from dashboard cards to detail screen

**Files:**
- `app/src/main/java/com/club/medlems/ui/trainer/dashboard/TrialMemberDetailScreen.kt`

### Task 5.3: Add Trial Members to Dashboard
**Status:** ✅ Complete

**Subtasks:**
- [x] 5.3.1 Add "NYE PRØVEMEDLEMMER" section to trainer dashboard
- [x] 5.3.2 Show count badge on section header
- [x] 5.3.3 Horizontal card layout (up to 4 members visible)
- [x] 5.3.4 Cards clickable to navigate to detail view
- [x] 5.3.5 Visual indicator for missing ID photos (red background)

**Files:**
- `app/src/main/java/com/club/medlems/ui/trainer/dashboard/TrainerDashboardScreen.kt`

---

## Phase 6: Trainer App - Retake & Assist Features

### Task 6.1: Retake Profile Photo
**Status:** ✅ Complete

**Subtasks:**
- [x] 6.1.1 Add "Tag nyt billede" button to detail view
- [x] 6.1.2 Open front camera in capture mode (CameraOverlay)
- [x] 6.1.3 Direct capture (no preview step for simplicity)
- [x] 6.1.4 Replace existing photo on capture
- [x] 6.1.5 Update member record with new path
- [x] 6.1.6 Queue for sync via SyncOutboxManager with photo base64

**Files:**
- `app/src/main/java/com/club/medlems/ui/trainer/dashboard/TrialMemberDetailScreen.kt`

### Task 6.2: Retake ID Photo
**Status:** ✅ Complete

**Subtasks:**
- [x] 6.2.1 Add "Tag billede" button for ID (adults only)
- [x] 6.2.2 Open front camera (tablet is wall-mounted)
- [x] 6.2.3 Show instruction text for ID capture
- [x] 6.2.4 Save ID photo on capture
- [x] 6.2.5 Update member record with idPhotoPath
- [x] 6.2.6 ID section only shown for adults

**Files:**
- `app/src/main/java/com/club/medlems/ui/trainer/dashboard/TrialMemberDetailScreen.kt`

### Task 6.3: Assisted Check-in
**Status:** ✅ Complete

**Subtasks:**
- [x] 6.3.1 Add "Check In Member" to trainer dashboard (Check-in button in overview section)
- [x] 6.3.2 Member search dialog (name or ID)
- [x] 6.3.3 Show member photo for confirmation
- [x] 6.3.4 Create check-in record
- [x] 6.3.5 Show success/already checked in message
- [x] 6.3.7 Record trainer as operator

**Files:**
- `app/src/main/java/com/club/medlems/ui/trainer/dashboard/TrainerDashboardScreen.kt`
- `app/src/main/java/com/club/medlems/ui/trainer/dashboard/AssistedCheckInDialog.kt`

### Task 6.4: Assisted Practice Session
**Status:** ✅ Complete

**Subtasks:**
- [x] 6.4.1 Add "Add Practice Session" option after check-in (button in success view)
- [x] 6.4.2 Show practice session form (practice type selector, points input)
- [x] 6.4.3 Link session to member's internalId
- [x] 6.4.4 Record trainer as session source (SessionSource.attendant)
- [x] 6.4.5 Save and trigger sync

**Files:**
- `app/src/main/java/com/club/medlems/ui/trainer/dashboard/AssistedCheckInDialog.kt`

---

## Phase 7: Laptop Admin - ID Photo Display

### Task 7.1: Member Detail Dialog - ID Photo
**Status:** ✅ Complete

**Subtasks:**
- [x] 7.1.1 Add ID photo section to member detail dialog (MemberDetailPanel)
- [x] 7.1.2 Display ID photo if available
- [x] 7.1.3 Show "Not required" for minors (section hidden)
- [x] 7.1.4 Show "Afventer" badge if adult without ID
- [x] 7.1.5 Allow click to enlarge photos (modal with full-size photo)
- [x] 7.1.6 Label sections clearly (ID-bekræftelse section with status badge)

**Files:**
- `laptop/src/pages/MembersPage.tsx`

### Task 7.2: Trial Member List - ID Photo Status
**Status:** ✅ Complete

**Subtasks:**
- [x] 7.2.1 Add ID photo status column/indicator to trial member list (badge in member row)
- [x] 7.2.2 Status values: green badge (has ID) / yellow badge with "!" (needs ID)
- [x] 7.2.3 Visual indicator (CreditCard icon)
- [x] 7.2.4 Tooltip with title attribute

**Files:**
- `laptop/src/pages/MembersPage.tsx`

### Task 7.3: Filter by ID Photo Status
**Status:** ✅ Complete

**Subtasks:**
- [x] 7.3.1 Add filter option "ID Photo Status" (idPhotoFilter dropdown)
- [x] 7.3.2 Filter values: All / Has ID / Needs ID / Not required
- [x] 7.3.3 Update member query to support filter (filteredMembers useMemo)
- [x] 7.3.4 Combine with existing filters

**Files:**
- `laptop/src/pages/MembersPage.tsx`

---

## Phase 8: ID Photo Deletion Rule

### Task 8.1: Deletion Trigger Logic
**Status:** ✅ Complete

**Subtasks:**
- [x] 8.1.1 Create `IdPhotoLifecycleService` on laptop
- [x] 8.1.2 Check conditions: membershipId assigned AND fee paid
- [x] 8.1.3 Query to find members eligible for ID deletion (`findMembersEligibleForIdPhotoDeletion`)
- [x] 8.1.4 Implement deletion function (`deleteIdPhotoIfEligible`, `clearIdPhotoFromMember`)

**Files:**
- `laptop/src/services/idPhotoLifecycleService.ts`
- `laptop/src/database/db.ts` (AuditLog table, schema v15)

### Task 8.2: Trigger on MembershipId Assignment
**Status:** ✅ Complete

**Subtasks:**
- [x] 8.2.1 Hook into membershipId assignment flow (MembersPage.tsx)
- [x] 8.2.2 Check if fee is also paid (`hasMemberPaidFee`)
- [x] 8.2.3 Trigger deletion if both conditions met (`onMembershipIdAssigned`)
- [x] 8.2.4 Log action (audit log)

**Files:**
- `laptop/src/pages/MembersPage.tsx`
- `laptop/src/services/idPhotoLifecycleService.ts`

### Task 8.3: Trigger on Fee Payment
**Status:** ✅ Complete

**Subtasks:**
- [x] 8.3.1 Hook into fee payment recording (FinancePage.tsx after createPendingFeePayment)
- [x] 8.3.2 Check if membershipId is assigned (`checkIdPhotoEligibility`)
- [x] 8.3.3 Trigger deletion if both conditions met (`onFeePaymentRecorded`)
- [x] 8.3.4 Log action (audit log)

**Files:**
- `laptop/src/pages/FinancePage.tsx`
- `laptop/src/services/idPhotoLifecycleService.ts`

### Task 8.4: Scheduled Deletion Job
**Status:** ✅ Complete

**Subtasks:**
- [x] 8.4.1 Create startup job to check for deletions (`processAllEligibleIdPhotoDeletions`)
- [x] 8.4.2 Find all members with both conditions met
- [x] 8.4.3 Delete ID photos for eligible members
- [x] 8.4.4 Log all deletions
- [x] 8.4.5 Run on app startup (App.tsx init)

**Files:**
- `laptop/src/App.tsx`
- `laptop/src/services/idPhotoLifecycleService.ts`

### Task 8.5: ID Photo File Deletion
**Status:** ✅ Complete

**Subtasks:**
- [x] 8.5.1 File deletion handled by sync propagation (tablet removes local file)
- [x] 8.5.2 Set `idPhotoPath` to null (`clearIdPhotoFromMember`)
- [x] 8.5.3 Set `idPhotoThumbnail` to null
- [x] 8.5.4 Update member record
- [x] 8.5.5 Increment syncVersion for sync (queued via `queueMember`)

**Files:**
- `laptop/src/services/idPhotoLifecycleService.ts`

### Task 8.6: Sync ID Photo Deletion
**Status:** ✅ Complete

**Subtasks:**
- [x] 8.6.1 Include null ID photo fields in sync push (member synced via outbox)
- [x] 8.6.2 Online API handles null values (existing support)
- [x] 8.6.3 Sync pull propagates null to other devices (existing support)
- [x] 8.6.4 Trainer app receives null and clears local display

**Files:**
- `laptop/src/database/syncOutboxRepository.ts` (queueMember)
- `api/handlers/sync_push.php`
- `api/handlers/sync_pull.php`

### Task 8.7: Deletion Audit Logging
**Status:** ✅ Complete

**Subtasks:**
- [x] 8.7.1 Log deletion with timestamp, member ID, reason (`logIdPhotoDeletion`)
- [x] 8.7.2 Store in audit log table (AuditLog in db.ts)
- [x] 8.7.3 Admin can view deletion history (`getIdPhotoDeletionHistory`)
- [x] 8.7.4 Retention: Manual cleanup (admin runs query when needed)

**Files:**
- `laptop/src/services/idPhotoLifecycleService.ts`
- `laptop/src/database/db.ts` (AuditLog table)

---

## Phase 9: Member app registration UX refinements

### Task 9.1: Improve birth date, camera preview, and child flow
**Status:** ✅ Complete

**Subtasks:**

- [x] 9.1.1 Add birth date picker with year selection
- [x] 9.1.2 Unmirror front camera preview
- [x] 9.1.3 Enable name keyboard capitalization for name fields
- [x] 9.1.4 Force child registration toggle for minors

**Started:** 2026-02-02 12:00:00 UTC+1
**Completed:** 2026-02-02 12:45:00 UTC+1
**Duration:** 45m

**Files:**

- `app/src/main/java/com/club/medlems/ui/attendant/RegistrationScreen.kt`

---

### Task 9.2: Improve save feedback to prevent double taps
**Status:** ✅ Complete

**Subtasks:**

- [x] 9.2.1 Add a blocking save overlay with progress and status text
- [x] 9.2.2 Keep save button disabled while saving

**Started:** 2026-02-02 13:05:00 UTC+1
**Completed:** 2026-02-02 13:25:00 UTC+1
**Duration:** 20m

**Files:**

- `app/src/main/java/com/club/medlems/ui/attendant/RegistrationScreen.kt`

---

## Testing Checklist

### Unit Tests
- [ ] Birth date validation tests
- [ ] Age calculation tests
- [ ] Adult detection tests
- [ ] ID photo deletion rule tests

### Integration Tests
- [ ] Full registration flow (adult with ID)
- [ ] Full registration flow (minor without ID)
- [ ] Sync round-trip with ID photo
- [ ] ID photo deletion trigger

### Manual Testing
- [ ] Member app: Register as adult, capture ID
- [ ] Member app: Register as minor, skip ID
- [ ] Member app: Retake profile photo
- [ ] Member app: Retake ID photo
- [ ] Trainer app: View trial members
- [ ] Trainer app: Retake photos
- [ ] Trainer app: Assisted check-in
- [ ] Laptop: View ID photo
- [ ] Laptop: Assign membershipId and verify deletion
- [ ] Online sync: Verify ID photo sync

---

## Dependencies

| Task | Depends On |
|------|------------|
| Phase 2 | Phase 1 (data model) |
| Phase 3 | Phase 2 (photo review) |
| Phase 4 | Phase 1, Phase 3 |
| Phase 5 | Phase 4 (sync) |
| Phase 6 | Phase 5 |
| Phase 7 | Phase 4 (sync) |
| Phase 8 | Phase 7 |

---

## Notes

- Profile photo and ID photo are separate files with separate lifecycle
- ID photo is only captured for adults (age >= 18)
- ID photo is deleted when member becomes full member with paid fee
- Profile photo is never auto-deleted (retained for membership)
- Trainer can retake both photos but cannot delete them
- Only laptop admin flow triggers ID photo deletion
