# Enhanced Trial Registration - Feature Complete

**Completed:** 2026-02-03
**Completed By:** sbalslev
**Related Documents:**

- [PRD](../prd.md)
- [Design](../design.md)
- [Tasks](../tasks.md)

---

## Summary

The Enhanced Trial Registration feature adds age validation, ID photo capture for adult trial members, full photo review/retake flows, trainer photo management, assisted check-in, and automatic ID photo lifecycle management to the existing trial member registration workflow.

All 8 phases are complete.

---

## What Was Implemented

### Phase 1 - Data Model

- `idPhotoPath` and `idPhotoThumbnail` fields added to `Member` entity and `SyncableMember`
- Android Room DB migrated from v15 to v16
- Sync schema version bumped to 1.5.0
- Laptop SQLite schema updated to v14 with `idPhotoPath`, `idPhotoThumbnail` columns
- MySQL migration `V1_5_0__add_id_photo_fields.sql` created
- `SyncOutboxManager.queueMember()` updated to include `idPhotoBase64`

### Phase 2 & 3 - Member App Registration Flow

- Birth date entry uses a date picker (easier year selection)
- Birth date validation: not future, not implausible age, correct format
- Adult detection (age >= 18) with auto-set child registration toggle for minors
- Full 6-step wizard for adults (personal info, profile photo, profile review, ID photo, ID review, guardian/save)
- 4-step wizard for minors (personal info, profile photo, profile review, guardian/save)
- Front camera preview unmirrored for natural experience
- Name fields use word capitalization in keyboard
- Blocking save overlay with progress text to prevent double-tap

### Phase 4 - Sync

- Android outbox includes `idPhotoBase64` (null for minors)
- `sync_push.php` and `sync_pull.php` updated for schema v1.5.0
- `id_photo_path` and `id_photo_thumbnail` fields handled in online sync
- `OnlineMember` TypeScript type updated

### Phase 5 & 6 - Trainer App

- `TrialMembersSection` on trainer dashboard showing trial members registered in last 7 days
- Photo status indicators (profile + ID) on dashboard cards
- `TrialMemberDetailScreen` with full-size photos, age badge, contact info
- Warning shown for adults missing ID photo; "not required" message for minors
- "Tag nyt billede" (retake profile photo) using `CameraOverlay`
- "Tag billede" (retake ID photo) for adults only
- Assisted check-in via `AssistedCheckInDialog` with member search and photo confirmation
- Assisted practice session linked from assisted check-in success

### Phase 7 - Laptop Admin

- ID photo section in `MemberDetailPanel` (MembersPage) with click-to-enlarge modal
- "Afventer" badge for adults without ID photo; section hidden for minors
- ID photo status filter in trial member list (All / Has ID / Needs ID / Not required)

### Phase 8 - ID Photo Deletion Lifecycle

- `IdPhotoLifecycleService` on laptop checks eligibility: membershipId assigned AND fee paid
- Hook in `MembersPage.tsx` on membership assignment (`onMembershipIdAssigned`)
- Hook in `FinancePage.tsx` after fee payment recording (`onFeePaymentRecorded`)
- Startup batch job in `App.tsx` processes all eligible members on launch
- File deletion + null out `idPhotoPath` and `idPhotoThumbnail` on member record
- Member queued for sync so tablet removes its local ID photo file
- Audit log entries written for every deletion (AuditLog table, schema v15)

---

## Design Decisions

- **Wizard approach (not single form):** Reduces cognitive load for registration staff; allows retake at each step before committing.
- **Adult/minor split in step count:** Adults get 6 steps (with ID photo); minors get 4 steps. Dynamic step indicator communicates this clearly.
- **ID photo deletion on both triggers:** Fee payment alone or membership assignment alone is insufficient - both must be true before privacy-sensitive ID is removed. This prevents premature deletion if fees are paid in advance.
- **Audit log for deletions:** Provides accountability trail for GDPR-style data minimization operations.
- **Startup batch job:** Catches cases where the laptop was offline when a trigger event occurred (e.g., fee recorded offline, membership assigned offline).
- **Tablet removes local ID photo file via sync:** The laptop sets `idPhotoPath = null` and queues the member for sync. The tablet, on receiving the updated member, detects the cleared path and deletes the local file.

---

## Key Files

| Component | Files |
|-----------|-------|
| Android registration flow | `RegistrationScreen.kt` |
| Android trainer features | `TrialMemberDetailScreen.kt`, `AssistedCheckInDialog.kt`, `TrainerDashboardScreen.kt` |
| Laptop ID photo display | `MembersPage.tsx` |
| ID photo lifecycle | `idPhotoLifecycleService.ts` |
| Fee payment trigger | `FinancePage.tsx` |
| Startup job | `App.tsx` |
| API sync | `sync_push.php`, `sync_pull.php` |
| Audit log | `db.ts` (AuditLog table, schema v15) |

---

## Known Gaps

- `EquipmentTransaction` audit entity (for equipment operation logging) was specified in the Trainer Experience PRD but was not implemented. Core functionality works without it.
- Tablet-side deletion is passive (triggered by receiving a member sync with null ID photo path); there is no explicit "delete ID photo" sync command.

---

## Future Considerations

- Add explicit sync command type for ID photo deletion to make tablet behaviour more deterministic.
- Consider push notification or dashboard alert when a trial member has been waiting for ID review longer than X days.
- Privacy dashboard showing which members still have ID photos on file.
