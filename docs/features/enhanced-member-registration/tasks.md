# Enhanced Member Registration - Tasks

> **Design Document**: [design.md](design.md)
> **Created**: 2026-01-14
> **Last Updated**: 2026-01-20 by Claude
> **Status**: ✅ COMPLETE (via Trial Member Registration feature)

---

## Implementation Notice

⚠️ **This feature was implemented with a different architecture than originally planned.**

The Trial Member Registration feature (completed 2026-01-20) implemented all the functionality described here, but using a different approach:

| Original Plan | Actual Implementation |
|---------------|----------------------|
| `NewMemberRegistration` entity | `Member` entity with `memberType=TRIAL` |
| `RegistrationsPage` for approval | `MembersPage` with TRIAL filter |
| Approval creates new Member | Approval assigns `membershipId` |

See [Trial Member Registration](../trial-member-registration/completion/FEATURE-COMPLETION-SUMMARY.md) for implementation details.

---

## Overview

### Member list filter layout

**Started:** 2026-11-16 22:45:16 UTC+1
**Completed:** 2026-11-16 23:07:26 UTC+1
**Duration:** 22m 10s (including the sandbox-access interruption)
**Last Updated:** 2026-11-16 23:07:26 UTC+1 by sbalslev
**Status:** Implemented and validated with automated tests and production build

- [x] Replace the crowded dropdown row with one expandable, labelled filter panel.
- [x] Show active-filter counts, removable chips, and reset without clearing search.
- [x] Separate result count and exports from the filter controls.
- [x] Preserve immediate filtering, existing combinations, and CSV export behavior.
- [x] Update regression tests for panel expansion, all seven chips, reset,
  combined filters, view switching, filtered CSV downloads, and export-menu dismissal.
- [x] Run focused tests, TypeScript, production build, ESLint, and whitespace checks.

Validation commands run from `laptop` after sandbox command access was restored:

- `npm run test:run -- src\utils\memberPhotoExport.test.ts src\pages\MembersPage.test.tsx`: 23 passed.
- `npm run build`: passed, including TypeScript and Vite production output.
- `.\node_modules\.bin\eslint.cmd src\pages\MembersPage.test.tsx src\utils\memberPhotoExport.ts src\utils\memberPhotoExport.test.ts`: passed.
- `.\node_modules\.bin\eslint.cmd src\pages\MembersPage.tsx`: no errors; two existing hook-dependency warnings.
- `git diff --check` from the repository root: passed.

The initial test run exposed an assertion that assumed the test environment hides
buttons inside a closed native `details` element. It now checks the element's
actual `open` state; export-menu interactions and dismissal are also tested.

Visual inspection was attempted using a temporary Vite preview. The server
reported ready, but the integrated browser could not connect through loopback or
the advertised local network address. No visual approval is claimed. The preview
server was stopped after the attempts. The updated laptop production output is
built, but the installed desktop application has not been deployed.

### Member photo follow-up export

**Started:** 2026-11-11 19:03:46 UTC+1
**Completed:** 2026-11-11 19:10:37 UTC+1
**Duration:** 6m 51s
**Last Updated:** 2026-11-11 19:10:37 UTC+1 by sbalslev

- [x] Add a profile-photo filter to the laptop member list, separate from ID-photo status.
- [x] Export members missing profile photos to CSV, honoring search and other filters.
- [x] Include member identifiers and contact fields without photo or identity-document data.
- [x] Handle legacy photos, thumbnail-only photos, blank references, empty lists,
  Danish text, CSV quoting, and spreadsheet formula escaping.
- [x] Verify filtering and the actual downloaded CSV contents through UI tests.
- [x] Validate 11 focused tests, the production build, TypeScript, and new-file lint.

Validation commands (run from `laptop`):

- `npm run test:run -- src\utils\memberPhotoExport.test.ts src\pages\MembersPage.test.tsx`: 11 passed.
- `npm run build`: passed, including TypeScript and Vite production output.
- `.\node_modules\.bin\tsc.cmd -b`: passed after the final test changes.
- `.\node_modules\.bin\eslint.cmd src\utils\memberPhotoExport.ts src\utils\memberPhotoExport.test.ts src\pages\MembersPage.test.tsx`: passed.

The feature is available in source and the laptop production build. Updating an
already installed desktop application requires packaging/deployment separately.

This task list was designed to implement enhanced member registration including:

1. **Photo sync**: Transfer photo bytes from tablet to laptop (not just file path)
2. **Additional fields**: Capture gender, address, zipCode, city on tablet
3. **Approval workflow**: Display photo and complete data on laptop for approval
4. **Member photos**: Store photo with Member record upon approval

---

## Completion Status

### Phase 1: Android Entity & Database Changes ✅

All implemented in `Member` entity instead of `NewMemberRegistration`:

- [x] 1.1 Gender field - `Member.gender: String?` in `Entities.kt:108`
- [x] 1.2 Address fields - `Member.address`, `zipCode`, `city` in `Entities.kt:112-114`
- [x] 1.3 Database migration - Member table has all columns
- [x] 1.4 Sync payload - `SyncableMember` includes all fields in `SyncRepository.kt`
- [x] 1.5 Photo base64 encoding - `SyncRepository.kt:526-532` encodes photo for sync

### Phase 2: Android Registration UI ✅

Implemented in `RegistrationScreen.kt`:

- [x] 2.1 Registration form - 3-step form (Details → Photo → Guardian)
- [x] 2.2 Gender selection - Dropdown with MALE/FEMALE/OTHER options
- [x] 2.3 Address input section - address, zipCode, city fields
- [x] 2.4 ViewModel - `RegistrationState` data class with all fields
- [x] 2.5 Repository - Creates `Member(memberType=TRIAL)` directly

### Phase 3: Laptop Sync & Approval UI ✅

Implemented across multiple files:

- [x] 3.1 Type definitions - `Member` interface in `entities.ts` with all fields
- [x] 3.2 Database schema - `Member` table in `db.ts` with all columns
- [x] 3.3 Sync handling - `syncService.ts` processes members with photo (data URL)
- [x] 3.4 Approval UI - `MembersPage.tsx` with:
  - TRIAL filter dropdown showing count
  - "Tildel medlemsnummer" button for trial members
  - `AssignMemberIdModal` for membership ID assignment
  - Trial warning badges (30+ days amber, 90+ days red)
- [x] 3.5 Photo display - `registrationPhotoPath` stored as data URL

### Phase 4: Testing & Integration ✅

- [x] 4.1 Tablet registration - Creates trial Member with all fields
- [x] 4.2 Laptop sync - Receives trial members with photos
- [x] 4.3 Backward compatibility - FR-7.3 converts old `NewMemberRegistration` to trial members

---

## Key Implementation Files

### Android

| File | Purpose |
|------|---------|
| `app/.../data/entity/Entities.kt` | `Member` entity with all fields |
| `app/.../ui/attendant/RegistrationScreen.kt` | 3-step registration form |
| `app/.../data/sync/SyncRepository.kt` | Photo base64 encoding, sync logic |

### Laptop

| File | Purpose |
|------|---------|
| `laptop/src/types/entities.ts` | `Member` interface with all fields |
| `laptop/src/database/db.ts` | Member table schema |
| `laptop/src/database/syncService.ts` | Sync processing, FR-7.3 conversion |
| `laptop/src/pages/MembersPage.tsx` | Trial member display and approval |
| `laptop/src/database/memberRepository.ts` | `assignMembershipId()` function |

---

## Legacy Support

The `RegistrationsPage` and `NewMemberRegistration` table still exist for backward compatibility with older tablet versions. The sync service (FR-7.3) automatically converts any incoming `NewMemberRegistration` to a trial `Member`.

---

## Notes

- Photo storage: Data URL in database (`data:image/jpeg;base64,...`) instead of file system
- Guardian fields: Captured on tablet, synced to laptop, displayed in member details
- Trial member workflow: Filter by TRIAL on MembersPage → Click member → "Tildel medlemsnummer"
