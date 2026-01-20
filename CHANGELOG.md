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

### Changed
- Member entity now uses `internalId` (UUID) as primary key instead of `membershipId`
- All foreign key references updated from `membershipId` to `internalMemberId`
- Sync protocol includes `memberType` field for trial/full distinction

### Deprecated
- **Approval Workflow (FR-7)**: Registration approval workflow removed
  - Laptop: RegistrationsPage removed from navigation (approval no longer needed)
  - Laptop: `pendingRegistrationCount` and `selectedRegistration` store fields deprecated
  - Sync: NewMemberRegistration no longer sent in outbound sync payloads
  - Sync: Incoming NewMemberRegistration auto-converted to trial members for backward compat

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

