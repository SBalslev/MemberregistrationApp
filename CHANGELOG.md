# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project adheres to Semantic Versioning.

## [Unreleased]

### Added
- **Trial Member Registration (Prøvemedlem)**: Complete workflow for registering and managing trial members
  - Android: New member registration creates trial member with UUID-based `internalId`
  - Android: QR code displays `MC:{internalId}` format for trial member check-in
  - Android: Check-in screen shows "Prøvemedlem" badge for trial members
  - Android: All check-ins, practice sessions, and equipment checkouts use `internalMemberId` as foreign key
  - Laptop: Member list shows trial member filter and count badge
  - Laptop: Trial member badges with age warnings (purple default, yellow >30d, red >90d)
  - Laptop: "Tildel medlemsnummer" modal for assigning membershipId to trial members
  - Laptop: MembershipId uniqueness validation before assignment
  - Sync: Laptop-assigned membershipId flows to tablets via existing sync mechanism
  - Database: Schema version 1.1.0 with `internalId` as primary key, nullable `membershipId`
- **Duplicate Detection & Member Merge**: Tools for managing duplicate member records
  - Laptop: Duplicate detection based on phone, email, or similar names within 30 days
  - Laptop: View mode toggle (Members/Duplicates) in member list
  - Laptop: Confidence badges (high=phone/email match, medium=name similarity)
  - Laptop: Merge modal with member selection (keep vs merge)
  - Laptop: Preview of records to be transferred (check-ins, practice sessions, equipment, scans)
  - Laptop: Atomic merge with FK updates and `mergedIntoId` tracking on merged member
- **Enhanced Trial Registration**: Age validation, ID photo capture for adults, photo management, and automatic ID photo deletion
  - Android: Birth date picker with year selector; validation (not future, reasonable range)
  - Android: Adult detection (>= 18) with automatic child registration toggle
  - Android: ID photo capture step for adults (driver's licence or ID card), with preview/retake
  - Android: Front camera preview unmirrored; name fields use word capitalization
  - Trainer App: Trial members list (last 7 days) on dashboard with photo status indicators
  - Trainer App: Trial member detail view with full-size profile and ID photos
  - Trainer App: Retake profile or ID photo for trial members
  - Trainer App: Assisted check-in and practice session registration for members
  - Laptop: ID photo display in member detail, filter by ID photo status, click-to-enlarge
  - Laptop: `IdPhotoLifecycleService` - auto-deletes ID photo when membershipId assigned AND fee paid
  - Laptop: Startup batch job processes any eligible pending ID photo deletions
  - Laptop: Audit log entries for all ID photo deletions
  - Sync: `idPhotoBase64` included in member sync payload (schema v1.5.0); API updated
  - Database: Android DB v16, laptop SQLite schema v14, MySQL migration V1_5_0
  - Blocking save overlay on registration to prevent double-tap
- **Member Activity Overview**: Read-only activity timeline and cross-member statistics (laptop)
  - Overview page with attendance tab and practice tab, accessible from sidebar
  - Date range filter defaulting to current year (12-month max)
  - Trial filter: all members / without trial / only trial
  - Daily distinct check-in list view
  - Multi-day aggregated attendance with bar chart (Recharts)
  - Practice sessions grouped by discipline and classification
  - Drill-down from aggregates (50 rows/page pagination)
  - Member activity timeline in individual member detail view
  - GMT+1 day boundaries and season year logic
- **Sync Reliability Hardening**: Production-grade sync infrastructure improvements
  - Persistent outbox queue (`SyncOutbox`, `SyncOutboxDelivery` entities) for at-least-once delivery
  - Per-device delivery tracking with exponential backoff (up to 10 retries)
  - Idempotency via `messageId` deduplication in `ProcessedMessage` table
  - Reactive sync triggers with 2-second debounce replacing 5-minute polling
  - Device discovery and app start trigger immediate sync
  - Outbox cleanup job (24h retention for completed entries)
- **Member Deletion**: Permanent deletion of inactive members (see [1.3.2] entries for earlier items)
  - Cascade delete with transaction protection (cannot delete members with current year transactions)
  - Cloud sync with outbox-based retry mechanism
- **UI/UX Improvements (February 2026)**:
  - Dashboard: Member demographics section (adult/child counts, gender breakdown, two age modes)
  - Statistics page: Detailed age/gender breakdowns with print support
  - Members page: Active-first default sort, flexible 50/50 split layout
  - Edit Member modal: Wider (max-w-3xl), two-column layout
  - Finance page: Transactions sorted newest first
  - Browser `alert()`/`confirm()` replaced with `ConfirmDialog` component and toast notifications
  - ARIA accessibility attributes added to Sidebar, MembersPage, StatisticsPage
  - Color contrast improved (text-gray-500 -> text-gray-600 for important labels)
  - Dashboard equipment and conflict counts now load live data

### Changed
- Member entity now uses `internalId` (UUID) as primary key instead of `membershipId`
- All foreign key references updated from `membershipId` to `internalMemberId`
- Sync protocol includes `memberType` field for trial/full distinction
- Sync protocol v1.5.0 includes `idPhotoBase64`, `idPhotoPath`, `idPhotoThumbnail` fields
- Android DB version 16 (via sequential migrations from v5)
- PIN fields masked with `PasswordVisualTransformation` (security fix)
- Leaderboard text sizing increased 50-70% for 10.1" tablet readability
- Admin menu reorganized into 4 logical sections (Daglig brug, Udstyr, Administration, System)
- Practice session form uses progressive step-by-step reveal with numbered step badges
- Idle timeout on practice session form increased from 60s to 90s

### Deprecated
- **Approval Workflow (FR-7)**: Registration approval workflow removed
  - Laptop: RegistrationsPage removed from navigation (approval no longer needed)
  - Laptop: `pendingRegistrationCount` and `selectedRegistration` store fields deprecated
  - Sync: NewMemberRegistration no longer sent in outbound sync payloads
  - Sync: Incoming NewMemberRegistration auto-converted to trial members for backward compat
- **NewMemberRegistration entity**: Superseded by `Member(memberType=TRIAL)` architecture

### Added (continued - May 2026)
- **Celebration Carousel & Achievements** (member tablet): Dynamic post-session recognition
  - Ready screen: rotating carousel with monthly high scores, birthdays this week, biggest improvers, personal bests, most dedicated members; auto-advances 4s; falls back to scan-card slide when empty
  - Post-session overlay: milestone badges (1st/5th/10th... session), personal best, top-3 score, improvement percentage; auto-advances 3.2s, tappable to skip
  - Larger text and icons for tablet readability
  - ZXing English "Place a barcode..." text hidden via `strings.xml` override
- **Policy Violation Logging**: Trainer practice session policy warnings with audit trail
  - Policy warnings shown in trainer practice session flows
  - Policy violation list on trainer dashboard
  - CSV export from admin laptop
  - Sync via outbox pipeline to laptop
- **Membership Card Tracking**: Full-stack `cardStatus` field on Member entity
  - Tracked in Android DB, laptop SQLite, and online MySQL
  - Bidirectional sync
  - Advanced filter by card status in MembersPage
- **External Payment Marking**: Mark member fees as paid externally
  - External payment option in MemberFeeStatusTable
  - Policy violation logging on external payment
- **Online Sync Reliability Fixes** (ODBS-1 through ODBS-4):
  - Pagination cursor fix: `has_more` only when valid `next_cursor` exists
  - Finance pull stability: `financial_transactions` support and `source` column fallback
  - Device filter fix: qualified `device_id` to avoid ambiguous column in joins
  - Per-entity error capture: `errors` array in pull response instead of hard 500
- **Sync Improvements** (local network):
  - Subnet scanner prefers real network adapters over virtual interfaces
  - Tablet IP captured from push; full pull auto-triggered
  - Token recovery endpoint and auto-renewal for expired connections
  - Device exclusion filter added to all 18 pull functions
  - ScanEvent sync condition fixed to use `createdAtUtc` for accurate syncing
  - Sync feedback loop fix preventing phantom row creation

### Changed (May 2026)
- Activity lists sorted by date descending
- Inter-batch delay increased in online sync to prevent 429 rate limits
- `sql-wasm` WASM binaries added to laptop public assets for SQLite browser support

## [1.3.2] - 2026-01-05
### Added
- **Enhanced Member Registration Form**: Extended new member registration to collect comprehensive member data
  - Email field with email keyboard type
  - Phone number field with numeric phone keyboard
  - Birth date field with date format hint (dd-mm-åååå)
  - All member data saved to database (NewMemberRegistration entity)
  - Member information included in info text file alongside photo
- **Photo Sync to SD Card**: Automatic synchronization of registration photos
  - Photos automatically copied to SD card at `SD:/Medlemscheckin/member_photos/`
  - Both photo files (.jpg) and info files (_info.txt) synced
  - Incremental sync - only new photos since last sync
  - 30-day retention policy for local copies after successful sync to SD card
  - Photo sync integrated with existing hourly SD card auto-sync
  - Sync count displayed in status messages
- **Database Migration**: v5 → v6 to add firstName, lastName, email, phone, birthDate columns to NewMemberRegistration table

### Changed
- Camera photo storage moved from external DCIM to app's private directory for better compatibility
- Added visual feedback when taking photo (loading indicator with "Tager billede..." message)
- Camera button disabled during photo capture to prevent double-clicks

### Fixed
- Missing `background` import in RegistrationScreen causing compilation error
- Guardian fields now single-line only (were allowing multiline input)
- All phone fields now show numeric keyboard
- Email fields now show email keyboard
- Added better error handling and logging for camera operations

## [1.3.1] - 2026-01-01
### Fixed
- Updated app launcher icons for all density levels (mdpi, hdpi, xhdpi, xxhdpi, xxxhdpi)

## [1.3.0] - 2025-12-22
### Added
- **Member Registration Feature**: New screen for registering new members with photo capture
  - Front-facing camera for taking member photos
  - Photos saved to SD card in "Nyt medlem" folder with timestamp
  - Optional guardian information fields for child registrations
  - Guardian info saved alongside photo as text file (_vaerge.txt)
  - Temporary ID generation (NYT-{timestamp}) for unassigned members
  - Database entity to track registrations with photo path and guardian details
  - All UI elements in Danish language
  - Access via Admin menu "Tilmeld nyt medlem" button
- **Database Performance Indices**: Added strategic indices on frequently queried columns for faster database operations
  - Member table: status, membershipId
  - CheckIn table: composite index on (membershipId, localDate)
  - PracticeSession table: membershipId, localDate, (practiceType, localDate), (membershipId, practiceType, classification)
  - ScanEvent table: composite index on (membershipId, createdAtUtc)
- **Bulk Member Name Loading**: Optimized leaderboard to load member names in single query instead of N+1 pattern
- **QR Scanner Diagnostics**: Comprehensive troubleshooting overlay with toggle control
  - Toggle diagnostics on/off in Admin menu (disabled by default for clean kiosk UI)
  - Bug icon (🐞) overlay appears on camera preview when enabled
  - Real-time camera status, frame rate, and resolution monitoring
  - Scan attempt tracking and success rate statistics
  - Last scan details and error messages
  - Embedded troubleshooting tips based on current state
  - Reset functionality to clear diagnostic history
  - Preference persists across app restarts
- **Enhanced Logging**: Detailed logcat output with `ReadyScreen` tag for debugging camera and scanning issues
- **Improved Manual Scan Dialog**: Enhanced with contextual help text and troubleshooting tips when QR scanning fails
- **Comprehensive Troubleshooting Documentation**: New section in README covering:
  - Common scanning issues and solutions
  - Diagnostic tool usage guide
  - Technical details about QR code format and camera configuration
  - ADB logcat filtering instructions
- GitHub Actions CI: build, lint, and unit tests on PRs and pushes to main.
- Dependabot configuration for Gradle and GitHub Actions.
- Updated PR template to require README, SPEC, and CHANGELOG updates when behavior changes.
- Changeable admin PIN (default 3715) with hashed storage.
- CSV export previews in UI (expand/collapse with row counts).
- Exports now report public Downloads path in Toast.
- Maintenance section (Generate demo data & Clear data) relocated into Import/Eksport screen.

### Changed
- **Performance Optimizations**:
  - Composables now use `derivedStateOf` for computed values to prevent unnecessary recompositions
  - Camera diagnostics update only every 30 frames instead of every frame, reducing UI overhead
  - Filtered member lists in admin screens optimized with derivedStateOf
  - CompactLeaderboardGrid calculations cached and only recompute when data changes
- Database schema version updated to v5 with migration for NewMemberRegistration table
- QR scanning now uses optimized ZXing decoder with improved error handling
- Camera analyzer tracks frame processing statistics for performance monitoring
- Manual scan workflow provides better guidance for users when camera scanning is problematic
- Database schema version updated to v4 with automated migration
- Repository governance docs emphasize "Docs are never optional".
- CSV export saves directly to public Downloads/Medlemscheckin and internal exports dir.
- Admin menu simplified further; demo/clear data buttons removed from root and placed under Import/Eksport.

### Fixed
- Enhanced camera error reporting with user-friendly messages and recovery suggestions
- Improved frame processing reliability with better exception handling
- Better debouncing logic to prevent duplicate scan events

