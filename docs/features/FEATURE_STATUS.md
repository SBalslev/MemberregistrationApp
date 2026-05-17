# Feature Status Overview

**Project:** Medlemscheckin (Club Member Check-in System)
**Last Updated:** 2026-05-17
**Updated By:** sbalslev

---

## Planned Features 📋

| Feature | Status | Target | Documentation |
|---------|--------|--------|---------------|
| **Instant Tablet Sync** | 📋 Not Started | TBD | [prd.md](instant-tablet-sync/prd.md) |
| **SKV Registration** | 📋 Not Started | TBD | [prd.md](skv-registration/prd.md) |

### Instant Tablet Sync

**Summary:** Immediate tablet-to-tablet sync (< 2 seconds) for check-ins, practice sessions, and equipment checkouts using priority-based sync triggers and UI auto-refresh on receive.

**Key Capabilities Planned:**

- IMMEDIATE vs NORMAL sync priority on entity changes
- Tablet-first sync ordering (Member tablet, Trainer tablet, then Laptop)
- `DataChangedEvent` flow for ViewModel auto-refresh
- Faster periodic interval for tablets (1 min vs 5 min for laptop)

### SKV Registration

**Summary:** Laptop-only tracking of SKV registration status, weapon approvals, and Excel export. No tablet UI or sync.

**Key Capabilities Planned:**

- SKV registration level and approval date per member
- Weapon type and caliber tracking with controlled lists
- Excel export with separate registration and weapons tabs
- Lazy default SKV6 not_started for members without records

---

## In Progress Features 🔄

| Feature | Status | Documentation |
|---------|--------|---------------|
| **Sync Reliability Hardening** | 🔄 In Progress | [prd.md](sync-reliability/prd.md) |

### Sync Reliability Hardening

**Summary:** Production-grade sync hardening with persistent outbox queue, tablet mesh sync, reactive triggers, and idempotency.

**Implemented Capabilities:**

- ✅ Persistent outbox queue (`SyncOutbox`, `SyncOutboxDelivery` entities)
- ✅ Per-device delivery tracking
- ✅ Reactive sync triggers with 2-second debounce
- ✅ Idempotency via `messageId` deduplication
- ✅ Exponential backoff on failure
- ✅ Outbox cleanup job (24h retention for completed entries)
- ✅ Device discovery triggers sync
- ⏳ `PracticeSessionRepository` notify sync trigger (task 2.2.2)
- ⏳ `NewMemberRegistrationRepository` notify sync trigger (task 2.2.3)
- ⏳ `EquipmentCheckoutRepository` notify sync trigger (task 2.2.4)

---

## Completed Features ✅

| Feature | Status | Completion Date | Documentation |
|---------|--------|-----------------|---------------|
| **Celebration Carousel & Achievements** | ✅ Complete | 2026-05-17 | [FEATURE-COMPLETION-SUMMARY.md](celebration-carousel/completion/FEATURE-COMPLETION-SUMMARY.md) |
| **Enhanced Trial Registration** | ✅ Complete | 2026-02-03 | [tasks.md](enhanced-trial-registration/tasks.md) |
| **Trainer Experience** | ✅ Complete | 2026-02-03 | [prd.md](trainer-experience/prd.md) |
| **Member Activity** | ✅ Complete | 2026-01-26 | [tasks.md](member-activity/tasks.md) |
| **Distributed Membership System** | ✅ Complete | 2026-01-20 | [FEATURE_COMPLETE.md](distributed-membership-system/completion/FEATURE_COMPLETE.md) |
| **Trial Member Registration** | ✅ Complete | 2026-01-20 | [FEATURE-COMPLETION-SUMMARY.md](trial-member-registration/completion/FEATURE-COMPLETION-SUMMARY.md) |
| **Equipment Sync** | ✅ Complete | 2026-01-20 | [FEATURE_COMPLETE.md](equipment-sync/completion/FEATURE_COMPLETE.md) |
| **Enhanced Member Registration** | ✅ Complete | 2026-01-20 | [tasks.md](enhanced-member-registration/tasks.md) |

> **Note:** Enhanced Member Registration was implemented as part of Trial Member Registration with a different architecture (trial Members instead of NewMemberRegistration entities).

---

## Completed Features (Continued)

| Feature | Status | Completion Date | Documentation |
|---------|--------|-----------------|---------------|
| **Photo Storage Optimization** | ✅ Complete | 2026-01-20 | [tasks.md](photo-storage-optimization/tasks.md) |
| **Financial Transactions** | ✅ Complete | 2026-01-20 | [tasks.md](financial-transactions/tasks.md) |
| **Tablet UX Improvements** | ✅ Complete | 2026-01-20 | [tasks.md](tablet-ux-improvements/tasks.md) |
| **Member Preference Sync** | ✅ Complete | 2026-01-21 | [tasks.md](member-preference-sync/tasks.md) |
| **Member Deletion** | ✅ Complete | 2026-02-01 | [design.md](member-deletion/design.md) |
| **UI/UX Improvements (Feb 2026)** | ✅ Complete | 2026-02-01 | See below |
| **Policy Violation Logging** | ✅ Complete | 2026-03-30 | [completion doc](trainer-experience/completion/policy-violation-logging-completion-summary.md) |
| **Membership Card Tracking** | ✅ Complete | 2026-05-17 | See below |
| **External Payment Marking** | ✅ Complete | 2026-05-17 | See below |
| **Online Sync Reliability Fixes** | ✅ Complete | 2026-05-17 | [tasks.md](online-database-sync/tasks.md) |

## Completed Feature Details

### 1. Enhanced Trial Registration

**Summary:** Age validation, ID photo capture for adults, photo review/retake flow, trainer photo management, assisted check-in, and automatic ID photo deletion.

**Key Capabilities:**

- Birth date validation (valid date, not future, reasonable age range)
- Adult detection (age >= 18)
- ID photo capture for adults (driver's licence or ID card)
- Photo review and retake flow for both profile and ID photos
- Trainer can view trial members and their photos (last 7 days)
- Trainer can retake profile or ID photos
- Trainer assisted check-in and practice session registration
- ID photo sync to laptop and online database (base64 encoded)
- ID photo automatically deleted when membershipId assigned AND fee paid (lifecycle service)
- Audit log entries for ID photo deletions
- Startup job cleans up any orphaned eligible deletions

**Implementation (8 Phases):**

- **Phase 1 - Data Model:** `idPhotoPath`, `idPhotoThumbnail` fields on Member; schema v1.5.0; DB v16; online MySQL migration
- **Phase 2 & 3 - Member App:** Birth date picker, age validation, ID photo capture step (adults), photo preview/retake, child toggle auto-set
- **Phase 4 - Sync:** ID photo base64 included in outbox member push; PHP API updated for v1.5.0
- **Phase 5 & 6 - Trainer App:** Trial member list (7 days), detail view with photos, retake profile/ID, assisted check-in, assisted practice session
- **Phase 7 - Laptop:** ID photo display in MembersPage, filter by ID photo status, click-to-enlarge
- **Phase 8 - Deletion:** `IdPhotoLifecycleService`, triggers on membership assignment and fee payment, startup batch job, audit log

**Key Files:**

- Android: `RegistrationScreen.kt`, `TrialMemberDetailScreen.kt`, `AssistedCheckInDialog.kt`
- Laptop: `MembersPage.tsx`, `idPhotoLifecycleService.ts`, `FinancePage.tsx`
- API: `sync_push.php`, `sync_pull.php`

### 2. Trainer Experience

**Summary:** Dedicated trainer experience on the trainer tablet with authentication, practice management, equipment checkout, and trial member photo management.

**Key Capabilities:**

- **Trainer Authentication:** Card scan authentication with 60-second session timeout and "extend session" warning
- **Admin PIN Fallback:** PIN-based authentication for initial setup when no trainers are registered
- **Daily Overview Dashboard:** Real-time view of today's check-ins and practice sessions
- **Equipment Management:** Full CRUD for equipment items with check-out/check-in flow
- **Trial Member Management:** View recent trial members, photos, and ID photo status
- **Photo Retake:** Camera capture to retake profile or ID photos for trial members
- **Assisted Check-in:** Search and check in members on their behalf (US-10)
- **Assisted Practice Session:** Register practice sessions for members without cards (US-11)
- **Historical Data:** 90-day lookback with date range, member, and discipline filtering
- **Laptop Admin:** Trainer designation, Skydeleder certification, and discipline management

**Implementation (5 Phases):**

- **Phase 1 - Data Model & Sync:** `TrainerInfo`, `TrainerDiscipline` entities with bidirectional sync
- **Phase 2 - Trainer Authentication:** `TrainerAuthViewModel`, `TrainerSessionManager` with 60s timeout
- **Phase 2b - Laptop Admin:** `TrainersPage.tsx`, `TrainerDetailPanel.tsx` for trainer management
- **Phase 3 - Dashboard:** `TrainerDashboardScreen.kt` with check-ins, sessions, trial members
- **Phase 4 - Equipment:** `EquipmentListScreen.kt`, `EquipmentDetailScreen.kt`, `MemberSearchDialog.kt`
- **Phase 5 - Historical Data:** `HistoryScreen.kt`, `HistoryViewModel.kt` with pagination

**User Stories Completed (11/11):**

| US | Description | Status |
|----|-------------|--------|
| US-1 | Trainer Authentication | ✅ |
| US-2 | Trainer Role Management | ✅ |
| US-3 | Daily Check-in Overview | ✅ |
| US-4 | Practice Session Management | ✅ |
| US-5 | Equipment Management | ✅ |
| US-6 | Historical Data Access | ✅ |
| US-7 | Trial Member Overview | ✅ |
| US-8 | View Member Photos | ✅ |
| US-9 | Retake Member Photos | ✅ |
| US-10 | Assisted Check-in | ✅ |
| US-11 | Assisted Practice Session | ✅ |

**Key Files:**

- Android: `ui/trainer/` package (~15 files)
- Laptop: `TrainersPage.tsx`, `TrainerDetailPanel.tsx`, `trainerRepository.ts`
- Sync: `SyncPayload.kt`, `SyncRepository.kt`, `syncService.ts`

**Note:** `EquipmentTransaction` entity for audit logging was specified in PRD but not implemented. Core functionality works without it.

### 2. Distributed Membership System

**Summary:** Real-time sync of member data, check-ins, practice sessions, and equipment across multiple devices.

**Key Capabilities:**

- Bidirectional sync between Android tablets and Windows laptop
- Device discovery via mDNS/NSD
- Secure pairing with 6-digit codes
- Token-based authentication with 30-day expiry
- Offline-first operation
- 4 Android build flavors: Member, Trainer, EquipmentDisplay, PracticeDisplay

**Statistics:**

- 9 phases completed
- 34 parent tasks, 196 sub-tasks
- ~15,000 lines of code

### 3. Trial Member Registration

**Summary:** Support for trial members who can check in without a membership number.

**Key Capabilities:**

- `internalId` (UUID) as primary key for all members
- `membershipId` nullable for trial members
- `MemberType` enum (TRIAL/FULL) for lifecycle tracking
- QR code check-in with `MC:{internalId}` format
- Trial member badges and age warnings
- Member merge with FK transfer

### 4. Equipment Sync

**Summary:** Equipment tracking and checkout sync (implemented as Phase 3 of Distributed Membership System).

**Key Capabilities:**

- Equipment item sync across devices
- Checkout/check-in with member linking
- Conflict detection for concurrent checkouts
- Wall-mounted display variant

### 5. Enhanced Member Registration

**Summary:** Photo sync and additional member fields (implemented via Trial Member Registration).

**Key Capabilities:**

- Photo transfer from tablet to laptop (base64 encoded, stored as data URL)
- Additional fields: gender, address, zipCode, city captured on tablet
- Trial member workflow on MembersPage (filter by TRIAL, assign membershipId)
- Photo display in member details

**Architecture Note:** Implemented using `Member(memberType=TRIAL)` instead of `NewMemberRegistration`. Approval workflow is on MembersPage, not a separate RegistrationsPage.

---

## Completed Feature Details (Continued)

### 6. Photo Storage Optimization

**Summary:** Optimize photo storage for performance while preserving full-quality photos.

**Key Capabilities:**

- Full-resolution photos stored on file system: `{userData}/photos/members/{internalId}.jpg`
- 150x150 thumbnails in database as data URLs for fast list rendering
- Async processing with Sharp library via IPC (main process)
- Photo file lifecycle management (create, update, delete with member)
- Auto-migration of existing data URLs on app startup

**Implementation Notes:**
- Photo processing runs in Electron main process (Sharp + IPC)
- `photoPath` stores file system path, `photoThumbnail` stores data URL
- `getPhotoSrc()` utility handles file:// URL conversion
- Migration runs once on startup for existing members with data URL photos

### 7. Financial Transactions (Kassebog)

**Summary:** Club financial transaction recording and reporting.

**Key Capabilities:**

- Transaction recording with posting categories (Patroner/skiver, Kapskydning, Kontingent, etc.)
- Transaction lines with optional member links
- Fiscal year management with opening/closing balances
- Running balance calculations (Cash + Bank)
- Member fee tracking with expected vs. paid amounts
- Quick fee payment registration
- Pending payment consolidation (batch MobilePay entries)
- Excel export matching Kassebog 2025.xlsx format
- Category totals and year summary
- Finance charts visualization
- Print-friendly view
- Date range and category filtering

**Implementation:**

- 11 components in `laptop/src/components/finance/`
- Repository: `financeRepository.ts` (751 lines)
- Page: `FinancePage.tsx` (662 lines)
- Excel export: `excelExport.ts`
- Types: `finance.ts`

### 8. Member Preference Sync

**Summary:** Sync member practice preferences between tablets via the laptop for seamless tablet replacement.

**Key Capabilities:**

- Stores last selected discipline and classification in Room DB (not just SharedPreferences)
- Syncs preferences from Member tablet to Laptop on push
- Syncs preferences from Laptop to new Member tablet on initial sync
- Only sent to MEMBER_TABLET devices (not Trainer, EquipmentDisplay, PracticeDisplay)
- Preserves user convenience settings when replacing tablets

**Implementation:**

- Android: `MemberPreference` Room entity with DAO
- Android: `LastClassificationStore` writes to both SharedPreferences and Room
- Android: Database version 12 with migration
- Laptop: `MemberPreference` table in SQLite schema
- Sync: `memberPreferences` field in `SyncEntities`

### 9. Member Deletion

**Summary:** Permanent deletion of inactive members with cascade delete, transaction protection, and cloud sync.

**Key Capabilities:**

- Delete button only visible for INACTIVE members
- Confirmation dialog showing all data that will be deleted
- Cascade delete of related records (check-ins, sessions, SKV registrations, etc.)
- Transaction protection: cannot delete members with current year transactions
- Transaction preservation: TransactionLine.memberId set to NULL (orphaned, not deleted)
- Cloud sync with outbox-based retry mechanism
- Exponential backoff for failed sync attempts (up to 10 retries)

**Implementation:**

- `getMemberDeletePreview()` - returns counts and deletion eligibility
- `deleteMemberPermanently()` - performs cascade delete and queues cloud sync
- `DeleteMemberDialog` component in MembersPage
- `processPendingMemberDeletions()` in onlineSyncService for outbox processing
- `queueMemberDeletion()` in syncOutboxRepository for reliable delivery

### 10. UI/UX Improvements (February 2026)

**Summary:** Various UI improvements to the laptop admin application for better usability.

**Key Changes:**

**Dashboard - Member Overview:**
- Added member demographics section showing adult/child counts
- Two age calculation modes: today's age and age as of January 1 (for sports season eligibility)
- Gender breakdown (male, female, other, unspecified)
- Counts only active full members (excludes trial and inactive)
- Link to new Statistics page for detailed breakdown

**Statistics Page (New):**
- Dedicated statistics page accessible from sidebar and dashboard
- Detailed age breakdown tables by gender (today and Jan 1)
- Gender summary cards with percentages
- Print-friendly layout with print button
- Responsive two-column layout

**Members Page:**
- Default sorting: active members first, then alphabetically by first name, last name
- Flexible 50/50 split layout (list and detail panel)
- Member list constrained to reasonable width (min 320px, max 600px)
- Detail panel takes remaining space and adapts to width
- Responsive two-column layout in detail panel for larger screens
- SKV details in three-column grid layout

**Edit Member Modal:**
- Wider modal (max-w-3xl instead of max-w-lg)
- Two-column form layout on medium+ screens
- Guardian fields in three-column layout
- Better use of screen real estate

**Finance Page - Transaction List:**
- Transactions now sorted newest first (# descending)
- Running balances still calculated correctly in chronological order
- Better UX for viewing recent transactions without scrolling

**Implementation:**
- `DashboardPage.tsx` - Added member demographics calculation and display
- `StatisticsPage.tsx` - New page with detailed statistics and print support
- `MembersPage.tsx` - Updated sorting, layout, and EditMemberModal
- `FinancePage.tsx` - Reversed transaction display order after balance calculation
- `Sidebar.tsx` - Added Statistics navigation item
- `App.tsx` - Added Statistics route
- `pages/index.ts` - Exported StatisticsPage

### 11. UX Review Fixes (February 2026)

**Summary:** Comprehensive UX review and fixes addressing accessibility, consistency, and usability issues.

**Critical Fixes:**

- **Browser Dialogs Replaced:** All `alert()` and `confirm()` calls replaced with `ConfirmDialog` component and toast notifications
  - `SettingsPage.tsx` - Database clear now uses two-step confirmation dialog
  - `DevicesPage.tsx` - Device removal uses ConfirmDialog
  - `MembersPage.tsx` - Weapon deletion uses ConfirmDialog
  - `DisciplineEditor.tsx` - Error alerts replaced with showError() toast
  - `ImportPage.tsx` - Validation alerts replaced with showWarning()/showError() toasts

**Accessibility Improvements:**

- **ARIA Attributes Added:**
  - `Sidebar.tsx` - Navigation with `aria-label`, `aria-current` for active page, `aria-hidden` for decorative icons
  - `MembersPage.tsx` - Search inputs with `role="search"`, `aria-label` for filters
  - `StatisticsPage.tsx` - Tables with `aria-label`, headers with `scope="col"`

- **Color Contrast Fixed:**
  - Updated `text-gray-500` to `text-gray-600` for important information text
  - Fixed in Sidebar (Master Laptop label), Dashboard (member counts), MembersPage (DetailRow labels)

**Dashboard Fixes:**

- **Equipment Count:** Now loads actual count of active equipment checkouts from EquipmentCheckout table
- **Conflict Count:** Now loads actual count of pending sync conflicts from SyncConflict table
- **Removed TODO placeholders** for equipment and conflicts stats

**Files Modified:**
- `DisciplineEditor.tsx` - showError() for discipline operations
- `ImportPage.tsx` - showWarning()/showError() for CSV validation
- `SettingsPage.tsx` - Two-step ConfirmDialog for database clear
- `DevicesPage.tsx` - ConfirmDialog for device removal
- `MembersPage.tsx` - ConfirmDialog for weapon deletion, accessibility labels
- `Sidebar.tsx` - ARIA navigation attributes
- `StatisticsPage.tsx` - Table accessibility attributes
- `DashboardPage.tsx` - Live equipment and conflict counts

### 12. Member Activity

**Summary:** Read-only member activity timeline and cross-member overview page with attendance and practice tabs.

**Key Capabilities:**

- Member activity timeline in member detail (replaces placeholder)
- Overview page with attendance tab and practice tab
- Date range filter (defaults to current year, 12-month max)
- Trial filter: all members / without trial / only trial
- Daily distinct check-in list view
- Multi-day aggregated attendance with bar chart
- Practice sessions grouped by discipline and classification
- Drill-down from aggregates (50 rows/page pagination)
- GMT+1 day boundaries and season year logic

**Implementation:**

- `laptop/src/` - Activity page with repository helpers, aggregation queries, bar chart (Recharts), pagination
- Source device intentionally hidden in timeline entries

### 13. Policy Violation Logging

**Summary:** Policy warnings and audit logging for trainer practice session flows, with CSV export and sync to laptop.

**Key Capabilities:**

- Policy warnings displayed in trainer practice session flows
- Policy violation list on trainer dashboard
- `PolicyViolation` table in laptop database
- CSV export of policy violations from admin laptop
- Sync via existing outbox pipeline (Android sync payload includes policy violations)

**Files:**

- Android: `TrainerDashboardScreen.kt`, `TrainerDashboardViewModel.kt`, `SyncPayload.kt`
- Laptop: `policyViolationRepository.ts`

### 14. Membership Card Tracking

**Summary:** Full-stack tracking of membership card status and assignment across Android tablets, laptop, and online API.

**Key Capabilities:**

- `cardStatus` field on `Member` entity (Android DB and laptop SQLite)
- Card status synced in both directions (tablet <-> laptop <-> online)
- Advanced member filters in MembersPage (filter by card status and activity)
- `TrialMemberDetailScreen` shows card status
- Import/export includes card status field

**Files:**

- Android: `Entities.kt`, `AppDatabase.kt`, `SyncableEntities.kt`, `SyncRepository.kt`, `DatabaseModule.kt`
- Laptop: `entities.ts`, `db.ts`, `memberRepository.ts`, `syncService.ts`, `onlineApiService.ts`, `MembersPage.tsx`
- API: `sync_push.php`, `sync_pull.php`, `index.php`

### 15. External Payment Marking

**Summary:** Ability to mark member fees as paid externally (e.g., via bank transfer), with policy violation logging integration.

**Key Capabilities:**

- External payment option on `MemberFeeStatusTable`
- `financeRepository.ts` updated with external fee marking
- Policy violation logging when external payment recorded
- Import page updated for external payment data
- `.vscode/tasks.json` updated for build tasks

**Files:**

- Laptop: `MemberFeeStatusTable.tsx`, `financeRepository.ts`, `FinancePage.tsx`, `SettingsPage.tsx`, `ImportPage.tsx`

### 16. Celebration Carousel & Achievements

**Summary:** Dynamic celebration content on the ready screen and post-session achievement overlays after recording a training session.

**Key Capabilities:**

- **Celebration Carousel (Ready Screen):** Rotating slides replacing the static scan-card banner
  - Monthly high scores per discipline and classification
  - Birthdays this week
  - Biggest improvers this month (top 3 climbers month vs. month)
  - Personal bests this month
  - Most dedicated members (most training days this month)
  - Auto-advances every 4 seconds; falls back to scan-card slide when no data
  - Larger text (`titleLarge`/`headlineSmall`) and 40dp icons for tablet readability

- **Post-Session Achievement Overlay:** Full-screen overlay after saving a session
  - Session milestones (1st, 5th, 10th, 25th, 50th, 100th session)
  - Personal best: new all-time high for this discipline/classification
  - Top 3 score: 2nd or 3rd highest ever
  - Improvement: score improvement vs. previous session (with %)
  - Deterministic varied messages via `session.id.hashCode()` seed
  - Auto-advances at 3.2s/slide, tappable to skip, dot indicators

- ZXing default English "Place a barcode..." text overridden to empty string in `strings.xml` and `values-da/strings.xml`

**Files:**

- `ui/ready/CelebrationViewModel.kt` (new)
- `ui/ready/ReadyScreen.kt`, `ui/session/PracticeSessionScreen.kt`
- `data/dao/Daos.kt` (3 new queries)
- `res/values/strings.xml`, `res/values-da/strings.xml`

### 17. Online Sync Reliability Fixes

**Summary:** Four targeted fixes to the online database sync (PHP API and laptop) for pagination, finance pulls, device filtering, and error reporting.

**Fixes (ODBS-1 through ODBS-4):**

- **ODBS-1:** Pagination cursor fix - `has_more` only returned when a valid `next_cursor` exists
- **ODBS-2:** Finance pull stability - added `financial_transactions` pull support and fallback for missing `source` column
- **ODBS-3:** Transaction line device filter - qualified `device_id` against `financial_transactions` to avoid ambiguous column in joins
- **ODBS-4:** Per-entity error capture - sync pull returns `errors` array with entity-level failures instead of hard 500

**Files:**

- `api/handlers/sync_pull.php`
- `laptop/src/database/onlineSyncService.ts`

---

## Build Status

| Platform | Build | Status |
|----------|-------|--------|
| Android - Member | `./gradlew assembleMemberDebug` | ✅ Passing |
| Android - Trainer | `./gradlew assembleTrainerDebug` | ✅ Passing |
| Android - EquipmentDisplay | `./gradlew assembleEquipmentDisplayDebug` | ✅ Passing |
| Android - PracticeDisplay | `./gradlew assemblePracticeDisplayDebug` | ✅ Passing |
| Laptop | `npm run build` | ✅ Passing |

---

## Next Steps

1. **Sync Reliability (Final):** Wire `PracticeSessionRepository`, `NewMemberRegistrationRepository`, and `EquipmentCheckoutRepository` to notify sync triggers (tasks 2.2.2-2.2.4)
2. **Instant Tablet Sync:** Implement priority-based immediate sync and UI auto-refresh for tablet-to-tablet operations
3. **SKV Registration:** Implement laptop-only SKV registration tracking and Excel export
4. **Production Deployment:** All completed features are ready for production use
5. **Optional - Equipment Audit Trail:** Add `EquipmentTransaction` entity for equipment operation logging
6. **Optional - HTTPS:** Implement HTTPS for sync API (SEC-5) if security requirements increase
7. **Future:** Consider additional features (MobilePay integration, bank CSV import, attendance reports)