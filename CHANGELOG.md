# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project adheres to Semantic Versioning.

## [Unreleased]
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

