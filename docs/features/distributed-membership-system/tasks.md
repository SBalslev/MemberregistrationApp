# Distributed Membership Management System - Tasks

> **Design Document**: [design.md](design.md)
> **Created**: January 14, 2026
> **Last Updated**: January 14, 2026 by sbalslev

---

## Tasks

### Phase 1: Shared Sync Infrastructure

**Status**: In Progress  
**Progress**: 0/5 tasks complete (0%)  
**Phase Started**: 2026-01-14 10:00:00 UTC+1  
**Phase Completed**: TBD

This foundational phase establishes the distributed sync protocol used by all devices.

---

- [x] 1.0 Design and implement sync protocol data models
  - **Started**: 2026-01-14 10:05:00 UTC+1
  - **Completed**: 2026-01-14 10:50:00 UTC+1
  - **Duration**: 45m
  - **Relevant Documentation:**
    - `/docs/features/distributed-membership-system/design.md` - FR-8, FR-18 (entity schemas, sync protocol)
    - `app/src/main/java/com/club/medlems/data/entity/` - Existing entity patterns
  - [x] 1.1 Create shared sync module/library that can be used by all apps
    - **Started**: 2026-01-14 10:05:00 UTC+1
    - **Completed**: 2026-01-14 10:20:00 UTC+1
    - **Duration**: 15m
    - Created `app/src/main/java/com/club/medlems/data/sync/` package
  - [x] 1.2 Define SyncMetadata interface with deviceId, syncVersion, createdAtUtc, modifiedAtUtc, syncedAtUtc fields
    - **Started**: 2026-01-14 10:20:00 UTC+1
    - **Completed**: 2026-01-14 10:25:00 UTC+1
    - **Duration**: 5m
    - Created `SyncMetadata.kt` with interface and DeviceType, DeviceInfo, SyncSchemaVersion
  - [x] 1.3 Create SyncPayload data class with schemaVersion, deviceId, timestamp, and entities map
    - **Started**: 2026-01-14 10:25:00 UTC+1
    - **Completed**: 2026-01-14 10:30:00 UTC+1
    - **Duration**: 5m
    - Created `SyncPayload.kt` with SyncPayload and SyncEntities data classes
  - [x] 1.4 Create SyncResponse data class with status, acceptedCount, conflicts, and error details
    - **Started**: 2026-01-14 10:30:00 UTC+1
    - **Completed**: 2026-01-14 10:35:00 UTC+1
    - **Duration**: 5m
    - Created SyncResponse, SyncConflict, ConflictType, ConflictVersion, ConflictResolution in SyncPayload.kt
  - [x] 1.5 Implement DeviceInfo data class with id, name, type (Member/Admin/Display/Laptop), lastSeen, pairingDate
    - **Started**: 2026-01-14 10:20:00 UTC+1
    - **Completed**: 2026-01-14 10:25:00 UTC+1
    - **Duration**: 5m
    - Implemented in SyncMetadata.kt alongside DeviceType enum
  - [x] 1.6 Create serialization configuration (kotlinx.serialization) for all sync data classes
    - **Started**: 2026-01-14 10:35:00 UTC+1
    - **Completed**: 2026-01-14 10:45:00 UTC+1
    - **Duration**: 10m
    - Created `SyncJson.kt` with JSON configuration and encode/decode helpers
    - Created `SyncableEntities.kt` with syncable wrappers for all entity types
    - Created `PairingModels.kt` with QR code and pairing data classes
    - Added kotlinx-serialization-json dependency to build.gradle.kts

---

- [x] 2.0 Implement device discovery and pairing mechanism
  - **Started**: 2026-01-14 10:50:00 UTC+1
  - **Completed**: 2026-01-14 12:10:00 UTC+1
  - **Duration**: 1h 20m
  - **Relevant Documentation:**
    - `/docs/features/distributed-membership-system/design.md` - FR-10, FR-22 (device security, pairing ceremony)
    - `app/src/main/java/com/club/medlems/` - Existing QR scanning capability
  - [x] 2.1 Add jmDNS dependency for Android and implement mDNS service advertisement
    - **Started**: 2026-01-14 10:50:00 UTC+1
    - **Completed**: 2026-01-14 11:15:00 UTC+1
    - **Duration**: 25m
    - Added jmDNS 3.5.9 and Ktor 2.3.9 (CIO engine) dependencies
    - Added network permissions to AndroidManifest.xml
    - Created `DeviceDiscoveryService.kt` with service advertisement
  - [x] 2.2 Implement mDNS service discovery to find other devices on local network
    - **Started**: 2026-01-14 10:50:00 UTC+1
    - **Completed**: 2026-01-14 11:15:00 UTC+1
    - **Duration**: (included in 2.1)
    - Combined with 2.1 - same file handles both advertisement and discovery
    - Implemented ServiceListener for device discovery flow
  - [x] 2.3 Create PairingQrCode data class containing trust token, network ID, and endpoint URL
    - **Started**: 2026-01-14 10:35:00 UTC+1
    - **Completed**: 2026-01-14 10:45:00 UTC+1
    - **Duration**: (completed as part of Task 1.6)
    - Already created in `PairingModels.kt` during Task 1.0
  - [x] 2.4 Implement QR code generation for pairing (encode PairingQrCode as JSON)
    - **Started**: 2026-01-14 11:20:00 UTC+1
    - **Completed**: 2026-01-14 11:30:00 UTC+1
    - **Duration**: 10m
    - Created `PairingQrCodeGenerator.kt` with ZXing QR code generation
    - Generates secure 256-bit trust tokens
  - [x] 2.5 Implement pairing handshake endpoint (POST /api/pair) with JWT token exchange
    - **Started**: 2026-01-14 11:30:00 UTC+1
    - **Completed**: 2026-01-14 11:50:00 UTC+1
    - **Duration**: 20m
    - Created `SyncApiServer.kt` with Ktor CIO embedded server
    - Implemented GET /api/sync/status and POST /api/pair endpoints
    - Added jmDNS and Ktor dependencies to build.gradle.kts
  - [x] 2.6 Implement trust token storage and validation using encrypted shared preferences
    - **Started**: 2026-01-14 11:50:00 UTC+1
    - **Completed**: 2026-01-14 12:10:00 UTC+1
    - **Duration**: 20m
    - Created `TrustManager.kt` with EncryptedSharedPreferences
    - Implements device token generation and validation
    - Added androidx.security:security-crypto dependency
  - [x] 2.7 Implement trust propagation - sync trusted device list to all paired devices
    - **Started**: 2026-01-14 11:50:00 UTC+1
    - **Completed**: 2026-01-14 12:10:00 UTC+1
    - **Duration**: (included in 2.6)
    - TrustManager includes `mergeTrustedDevices()` for propagation
    - PairingResponse includes trustedDevices list for initial sync
  - [x] 2.8 Add 5-minute QR code expiration and 30-second connection timeout handling
    - **Started**: 2026-01-14 11:20:00 UTC+1
    - **Completed**: 2026-01-14 11:50:00 UTC+1
    - **Duration**: (included in 2.4-2.5)
    - PairingQrCode.VALIDITY_MINUTES = 5 in PairingModels.kt
    - SyncApiServer validates token expiration before pairing

---

- [x] 3.0 Implement REST sync API server and client
  - **Started**: 2026-01-14 12:15:00 UTC+1
  - **Completed**: 2026-01-14 13:30:00 UTC+1
  - **Duration**: 1h 15m
  - **Relevant Documentation:**
    - `/docs/features/distributed-membership-system/design.md` - FR-18 (sync protocol specification)
    - `app/build.gradle.kts` - Existing dependencies (Ktor, serialization)
  - **Files Created/Modified:**
    - Created `SyncRepository.kt` - Database sync operations (apply/collect changes)
    - Created `SyncClient.kt` - HTTP client with retry logic for peer requests
    - Updated `SyncApiServer.kt` - Added push/pull endpoints
  - [x] 3.1 Add Ktor server dependencies and configure embedded server for Android
    - **Started**: 2026-01-14 11:30:00 UTC+1
    - **Completed**: 2026-01-14 11:50:00 UTC+1
    - **Duration**: (completed as part of Task 2.5)
    - Already added Ktor CIO dependencies and created SyncApiServer.kt
  - [x] 3.2 Implement GET /api/sync/status endpoint for health check and schema version negotiation
    - **Started**: 2026-01-14 11:30:00 UTC+1
    - **Completed**: 2026-01-14 11:50:00 UTC+1
    - **Duration**: (completed as part of Task 2.5)
    - Already implemented in SyncApiServer.kt
  - [x] 3.3 Implement POST /api/sync/push endpoint to receive entity changes from peers
    - **Started**: 2026-01-14 12:15:00 UTC+1
    - **Completed**: 2026-01-14 13:30:00 UTC+1
    - **Duration**: 1h 15m
    - Created `SyncRepository.kt` with applySyncPayload method
    - Added POST /api/sync/push endpoint to SyncApiServer.kt
    - Implements conflict detection with ConflictVersion tracking
  - [x] 3.4 Implement GET /api/sync/pull endpoint to send changes since timestamp to peers
    - **Started**: 2026-01-14 12:15:00 UTC+1
    - **Completed**: 2026-01-14 13:30:00 UTC+1
    - **Duration**: (included in 3.3)
    - Added POST /api/sync/pull endpoint to SyncApiServer.kt
    - Returns SyncPayload with entities collected since timestamp
    - Created collectChangesSince method in SyncRepository.kt
  - [x] 3.5 Implement JWT authentication middleware for all sync endpoints
    - **Started**: 2026-01-14 12:15:00 UTC+1
    - **Completed**: 2026-01-14 13:30:00 UTC+1
    - **Duration**: (included in 3.3)
    - validateAuthHeader function in SyncApiServer.kt checks Bearer tokens
    - Uses TrustManager.validateToken for device authentication
  - [x] 3.6 Create SyncClient class using Ktor HttpClient for making requests to peer devices
    - **Started**: 2026-01-14 12:15:00 UTC+1
    - **Completed**: 2026-01-14 13:30:00 UTC+1
    - **Duration**: (included in 3.3)
    - Created `SyncClient.kt` with Ktor CIO HttpClient
    - Implements push(), pull(), getStatus() methods
    - Includes proper timeout configuration
  - [x] 3.7 Implement retry logic with exponential backoff for failed sync attempts
    - **Started**: 2026-01-14 12:15:00 UTC+1
    - **Completed**: 2026-01-14 13:30:00 UTC+1
    - **Duration**: (included in 3.6)
    - SyncClient.withRetry() implements exponential backoff
    - 3 retries with 1s, 2s, 4s delays
  - [x] 3.8 Implement idempotent sync operations using syncVersion to prevent duplicate processing
    - **Started**: 2026-01-14 12:15:00 UTC+1
    - **Completed**: 2026-01-14 13:30:00 UTC+1
    - **Duration**: (included in 3.3)
    - SyncRepository.applySyncPayload checks for existing records before insert
    - Check-ins skip if exists for same member/date
    - Practice sessions check for duplicate content before insert
    - Registrations skip if ID already exists
    - **Duration**: TBD

---

- [x] 4.0 Implement conflict detection and resolution logic
  - **Started**: 2026-01-14 13:45:00 UTC+1
  - **Completed**: 2026-01-14 14:30:00 UTC+1
  - **Duration**: 45m
  - **Relevant Documentation:**
    - `/docs/features/distributed-membership-system/design.md` - FR-7, FR-19 (conflict resolution rules and UI)
  - **Files Created/Modified:**
    - Created `ConflictDetector.kt` - Conflict detection logic for all entity types
    - Created `ConflictRepository.kt` - SyncConflictEntity, SyncConflictDao, ConflictRepository
    - Updated `SyncRepository.kt` - Integrated ConflictDetector for member updates
    - Updated `SyncPayload.kt` - Added deviceType field for conflict resolution
    - Updated `AppDatabase.kt` - Added sync_conflicts table (v7)
    - Updated `AppConverters.kt` - Added ConflictEntityStatus converter
    - Updated `DatabaseModule.kt` - Added migration 6-7 and syncConflictDao provider
  - [x] 4.1 Create ConflictDetector class to identify conflicts during sync receive
    - **Started**: 2026-01-14 13:45:00 UTC+1
    - **Completed**: 2026-01-14 14:00:00 UTC+1
    - **Duration**: 15m
    - Created `ConflictDetector.kt` with detection methods for each entity type
    - Implements shouldAcceptMemberUpdate, detectEquipmentConflict, resolveCheckInConflict
  - [x] 4.2 Implement "keep both" resolution for CheckIn and PracticeSession duplicates
    - **Started**: 2026-01-14 13:45:00 UTC+1
    - **Completed**: 2026-01-14 14:00:00 UTC+1
    - **Duration**: (included in 4.1)
    - resolveCheckInConflict returns SKIP_ALREADY_CHECKED_IN for same member/date
    - resolvePracticeSessionConflict returns SKIP_DUPLICATE for exact matches
  - [x] 4.3 Implement "laptop wins" resolution for Member master data conflicts
    - **Started**: 2026-01-14 14:00:00 UTC+1
    - **Completed**: 2026-01-14 14:15:00 UTC+1
    - **Duration**: 15m
    - shouldAcceptMemberUpdate checks device types (LAPTOP takes precedence)
    - Added deviceType to SyncPayload for conflict resolution
  - [x] 4.4 Implement conflict flagging for equipment checkout conflicts (ConflictStatus.Pending)
    - **Started**: 2026-01-14 13:45:00 UTC+1
    - **Completed**: 2026-01-14 14:00:00 UTC+1
    - **Duration**: (included in 4.1)
    - detectEquipmentConflict returns EquipmentConflictInfo for manual resolution
    - ConflictStatus enum (PENDING, RESOLVED, CANCELLED) in SyncableEntities.kt
  - [x] 4.5 Create ConflictRepository to store and retrieve pending conflicts
    - **Started**: 2026-01-14 14:00:00 UTC+1
    - **Completed**: 2026-01-14 14:20:00 UTC+1
    - **Duration**: 20m
    - Created SyncConflictEntity Room entity
    - Created SyncConflictDao with queries for pending/resolved conflicts
    - Created ConflictRepository with store/resolve/cleanup methods
    - Added database migration 6-7
  - [x] 4.6 Implement conflict resolution sync - propagate resolution to all devices
    - **Started**: 2026-01-14 14:20:00 UTC+1
    - **Completed**: 2026-01-14 14:30:00 UTC+1
    - **Duration**: 10m
    - ConflictRepository.getUnyncedResolutions() for sync propagation
    - markSynced() to track propagated resolutions
    - cleanupOldConflicts() removes synced conflicts after 30 days

---

- [x] 5.0 Implement backup and restore functionality
  - **Started**: 2026-01-14 14:35:00 UTC+1
  - **Completed**: 2026-01-14 15:00:00 UTC+1
  - **Duration**: 25m
  - **Relevant Documentation:**
    - `/docs/features/distributed-membership-system/design.md` - FR-14 (backup and restore)
  - **Files Created:**
    - Created `BackupService.kt` - Complete backup/restore/validation service
    - Created `BackupWorker.kt` - WorkManager worker for scheduled backups
  - [x] 5.1 Create BackupService class to export SQLite database to timestamped file
    - **Started**: 2026-01-14 14:35:00 UTC+1
    - **Completed**: 2026-01-14 14:50:00 UTC+1
    - **Duration**: 15m
    - BackupService.createBackup() creates compressed ZIP with database and metadata
    - Includes database file, WAL, and SHM files
    - Stores BackupMetadata with schema version for compatibility
  - [x] 5.2 Implement scheduled automatic daily backup using WorkManager
    - **Started**: 2026-01-14 14:50:00 UTC+1
    - **Completed**: 2026-01-14 15:00:00 UTC+1
    - **Duration**: 10m
    - Created BackupWorker with HiltWorker annotation
    - BackupScheduler.initialize() for app startup
    - Runs every 24 hours with battery/storage constraints
  - [x] 5.3 Implement backup retention policy (configurable number of backups to keep)
    - **Started**: 2026-01-14 14:35:00 UTC+1
    - **Completed**: 2026-01-14 14:50:00 UTC+1
    - **Duration**: (included in 5.1)
    - applyRetentionPolicy() keeps only most recent 7 backups by default
    - Configurable via DEFAULT_RETENTION_COUNT
  - [x] 5.4 Create RestoreService to replace current database from backup file
    - **Started**: 2026-01-14 14:35:00 UTC+1
    - **Completed**: 2026-01-14 14:50:00 UTC+1
    - **Duration**: (included in 5.1)
    - BackupService.restoreFromBackup() handles full restore workflow
    - Closes database, extracts backup, replaces files
  - [x] 5.5 Add backup file picker UI for restore operation
    - **Started**: 2026-01-14 14:35:00 UTC+1
    - **Completed**: 2026-01-14 14:50:00 UTC+1
    - **Duration**: (included in 5.1)
    - BackupService.listBackups() returns available backups for UI
    - exportBackup() supports external location export
  - [x] 5.6 Implement backup file validation (schema version check, integrity check)
    - **Started**: 2026-01-14 14:35:00 UTC+1
    - **Completed**: 2026-01-14 14:50:00 UTC+1
    - **Duration**: (included in 5.1)
    - validateBackup() checks ZIP structure, metadata, schema compatibility
    - Returns ValidationResult with specific error information

---

### Phase 2: Member Tablet Modifications

**Status**: Not Started  
**Progress**: 0/3 tasks complete (0%)  
**Phase Started**: TBD  
**Phase Completed**: TBD

Enhance existing member tablet with sync capabilities while preserving current functionality.

---

- [ ] 6.0 Add sync metadata fields to existing entities
  - **Relevant Documentation:**
    - `/docs/features/distributed-membership-system/design.md` - FR-8.4 (sync metadata)
    - `app/src/main/java/com/club/medlems/data/entity/` - Existing entities
    - `app/src/main/java/com/club/medlems/data/dao/Daos.kt` - Existing DAOs
  - [ ] 6.1 Add deviceId, syncVersion, syncedAtUtc fields to Member entity
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 6.2 Add sync metadata fields to CheckIn entity
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 6.3 Add sync metadata fields to PracticeSession entity
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 6.4 Add sync metadata fields to ScanEvent entity
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 6.5 Add approvalStatus, approvedAtUtc, rejectedAtUtc, rejectionReason, createdMemberId to NewMemberRegistration
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 6.6 Create Room database migration to add new columns without data loss
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 6.7 Update DAOs with queries for sync operations (getModifiedSince, markSynced)
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD

---

- [ ] 7.0 Integrate background sync service into Member Tablet
  - **Relevant Documentation:**
    - `/docs/features/distributed-membership-system/design.md` - FR-9 (member tablet modifications)
    - `/docs/features/distributed-membership-system/design.md` - FR-3 (offline-first operation)
  - [ ] 7.1 Create SyncService as Android foreground service for continuous sync
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 7.2 Implement sync scheduling - trigger sync every 5 seconds when peers available
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 7.3 Implement change detection using Room database observers
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 7.4 Create SyncQueue to batch local changes for efficient sync
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 7.5 Implement 60-second grace period before marking peer devices as offline
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 7.6 Add WorkManager job for sync retry when network becomes available
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD

---

- [ ] 8.0 Add sync status indicator and pairing UI
  - **Relevant Documentation:**
    - `/docs/features/distributed-membership-system/design.md` - FR-16, FR-22 (network status, pairing)
  - [ ] 8.1 Create SyncStatusViewModel to expose current sync state (Connected, Syncing, Offline)
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 8.2 Add subtle sync status indicator in app footer (icon + text)
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 8.3 Create "Pair with Network" button in settings screen
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 8.4 Implement QR scanner screen for pairing (reuse existing QR scanning)
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 8.5 Add pairing success/failure feedback UI with retry option
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 8.6 Display list of paired devices with online/offline status in settings
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD

---

### Phase 3: Equipment Management Module

**Status**: Not Started  
**Progress**: 0/4 tasks complete (0%)  
**Phase Started**: TBD  
**Phase Completed**: TBD

New module for equipment checkout/check-in functionality.

---

- [ ] 9.0 Create Equipment entities, DAOs, and repository
  - **Relevant Documentation:**
    - `/docs/features/distributed-membership-system/design.md` - FR-8.2, FR-8.3 (EquipmentItem, EquipmentCheckout schemas)
  - [ ] 9.1 Create EquipmentType enum (TRAINING_MATERIAL with room for future expansion)
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 9.2 Create EquipmentStatus enum (AVAILABLE, CHECKED_OUT, MAINTENANCE, RETIRED)
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 9.3 Create ConflictStatus enum (PENDING, RESOLVED, CANCELLED)
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 9.4 Create EquipmentItem entity with all fields per FR-8.2
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 9.5 Create EquipmentCheckout entity with all fields per FR-8.3
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 9.6 Create EquipmentItemDao with CRUD operations and sync queries
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 9.7 Create EquipmentCheckoutDao with checkout/checkin queries and conflict queries
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 9.8 Create EquipmentRepository combining both DAOs with business logic
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 9.9 Add database migration to include new Equipment tables
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD

---

- [ ] 10.0 Implement equipment checkout/check-in business logic
  - **Relevant Documentation:**
    - `/docs/features/distributed-membership-system/design.md` - FR-5 (equipment management requirements)
  - [ ] 10.1 Implement checkoutEquipment(equipmentId, membershipId, notes) with one-item-per-member validation
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 10.2 Implement checkinEquipment(checkoutId, notes) to return equipment
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 10.3 Implement getAvailableEquipment() to list all equipment with status AVAILABLE
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 10.4 Implement getCheckedOutEquipment() with member names for display
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 10.5 Implement getMemberCurrentCheckout(membershipId) to check if member has equipment
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 10.6 Add equipment CRUD operations (create, update status to MAINTENANCE/RETIRED)
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD

---

- [ ] 11.0 Implement equipment conflict detection and resolution
  - **Relevant Documentation:**
    - `/docs/features/distributed-membership-system/design.md` - FR-5.9-5.12, FR-19 (conflict resolution)
  - [ ] 11.1 Implement conflict detection during sync - same equipment to different members
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 11.2 Create EquipmentConflict data class with both checkout attempts and timestamps
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 11.3 Implement getPendingConflicts() to retrieve all unresolved conflicts
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 11.4 Implement resolveConflict(conflictId, keepFirst: Boolean) with reassignment logic
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 11.5 Implement conflict notification tracking for display on sync
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD

---

- [ ] 12.0 Build equipment management UI components
  - **Relevant Documentation:**
    - `/docs/features/distributed-membership-system/design.md` - FR-19, Design Considerations (Admin Tablet UX)
  - [ ] 12.1 Create EquipmentListScreen composable with status color coding
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 12.2 Create EquipmentCheckoutDialog with member search and notes input
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 12.3 Create EquipmentCheckinDialog with notes input
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 12.4 Create AddEquipmentDialog for registering new equipment items
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 12.5 Create ConflictListSection composable with badge notification
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 12.6 Create ConflictResolutionDialog with "Keep First" and "Reassign" options
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 12.7 Create EquipmentViewModel to manage UI state and business logic calls
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD

---

### Phase 4: Admin Tablet Application

**Status**: Not Started  
**Progress**: 0/4 tasks complete (0%)  
**Phase Started**: TBD  
**Phase Completed**: TBD

New Android application build for admin functionality.

---

- [ ] 13.0 Create Admin Tablet project structure and build configuration
  - **Relevant Documentation:**
    - `/docs/features/distributed-membership-system/design.md` - FR-1.3.1, Technical Considerations (app builds)
    - `app/build.gradle.kts` - Existing Android build configuration
  - [ ] 13.1 Create new Android module or product flavor for admin app (com.club.medlems.admin)
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 13.2 Configure separate applicationId and app name in build.gradle.kts
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 13.3 Set up shared code dependencies between member and admin modules
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 13.4 Create admin-specific app icon and branding resources
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 13.5 Create AdminMainActivity and admin navigation graph
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 13.6 Add persistent "Admin Mode" indicator in header/toolbar
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD

---

- [ ] 14.0 Implement member lookup and assisted check-in
  - **Relevant Documentation:**
    - `/docs/features/distributed-membership-system/design.md` - FR-17 (member lookup)
    - `/docs/features/distributed-membership-system/design.md` - US-1 (admin assisted check-in)
  - [ ] 14.1 Create MemberSearchBar composable with live search (2-char minimum)
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 14.2 Implement searchMembers(query) in MemberRepository with name and ID search
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 14.3 Create MemberSearchResults composable showing ID, name, status
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 14.4 Create MemberActionMenu with options: Check In, Equipment Checkout, View History
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 14.5 Implement assisted check-in flow using existing CheckInDao
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 14.6 Create MemberLookupViewModel to manage search state and actions
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD

---

- [ ] 15.0 Integrate equipment management UI into Admin Tablet
  - **Relevant Documentation:**
    - `/docs/features/distributed-membership-system/design.md` - FR-5, Design Considerations (Admin Tablet UX)
  - [ ] 15.1 Add Equipment section to admin navigation (bottom nav or drawer)
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 15.2 Create EquipmentScreen as container for equipment list and conflicts
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 15.3 Integrate checkout flow with member search from task 14.0
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 15.4 Add conflict badge to Equipment navigation item
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 15.5 Implement sync notification when equipment status changes on other devices
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD

---

- [ ] 16.0 Implement conflict resolution interface
  - **Relevant Documentation:**
    - `/docs/features/distributed-membership-system/design.md` - FR-19 (equipment conflict resolution UI)
  - [ ] 16.1 Create ConflictsScreen showing all pending equipment conflicts
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 16.2 Create ConflictCard composable showing both checkout attempts with details
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 16.3 Implement conflict resolution dialog with consequences explanation
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 16.4 Connect resolution actions to EquipmentRepository.resolveConflict()
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 16.5 Show toast/snackbar confirmation after resolution
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 16.6 Remove resolved conflicts from pending list and update badge count
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD

---

### Phase 5: Display Tablet Applications

**Status**: Not Started  
**Progress**: 0/3 tasks complete (0%)  
**Phase Started**: TBD  
**Phase Completed**: TBD

Read-only display applications for equipment status and practice sessions.

---

- [ ] 17.0 Create Display Tablet base project and shared components
  - **Relevant Documentation:**
    - `/docs/features/distributed-membership-system/design.md` - FR-1.5, FR-1.6 (display tablet requirements)
    - `/docs/features/distributed-membership-system/design.md` - FR-20 (display tablet details)
  - [ ] 17.1 Create display module/flavor with read-only database access
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 17.2 Configure display app to only pull data (no push sync endpoints)
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 17.3 Create DisplayModeHeader composable showing "Display Mode - [Type]" prominently
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 17.4 Create configurable auto-refresh timer (10-30 seconds)
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 17.5 Create large font theme (24pt minimum) for distance viewing
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 17.6 Implement touch-only interaction (no keyboard input components)
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD

---

- [ ] 18.0 Build Equipment Display variant
  - **Relevant Documentation:**
    - `/docs/features/distributed-membership-system/design.md` - FR-20.2 (equipment display requirements)
  - [ ] 18.1 Create EquipmentDisplayScreen as full-screen status board
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 18.2 Create EquipmentStatusCard with color coding (Green/Red/Yellow)
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 18.3 Display equipment serial number, type, and current holder if checked out
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 18.4 Implement grid layout optimized for large screen visibility
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 18.5 Configure package name com.club.medlems.display.equipment
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD

---

- [ ] 19.0 Build Practice Session Display variant with rotating views
  - **Relevant Documentation:**
    - `/docs/features/distributed-membership-system/design.md` - FR-20.3-20.10 (practice display requirements)
  - [ ] 19.1 Create PracticeDisplayScreen with view rotation container
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 19.2 Create RecentSessionsView showing last 10-20 practice sessions with scores
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 19.3 Create LeaderboardView showing top 10 for selected discipline
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 19.4 Create TopMoversView showing biggest improvements this week
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 19.5 Create MostStableView showing lowest variance this month
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 19.6 Create MostImprovedView showing highest average gain this month
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 19.7 Implement 30-second configurable rotation timer between views
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 19.8 Create filter dropdowns: Discipline (All/Pistol/Rifle/Shotgun), Time period, Member
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 19.9 Implement rotation pause on user interaction
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 19.10 Implement 60-second idle timeout to revert to default rotation
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 19.11 Configure package name com.club.medlems.display.practice
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD

---

### Phase 6: Master Laptop Application

**Status**: Not Started  
**Progress**: 0/6 tasks complete (0%)  
**Phase Started**: TBD  
**Phase Completed**: TBD

New Progressive Web App for complete membership management.

---

- [ ] 20.0 Set up laptop PWA project with offline support
  - **Relevant Documentation:**
    - `/docs/features/distributed-membership-system/design.md` - Technical Considerations (browser-based PWA)
  - [ ] 20.1 Create new project with React + TypeScript + Vite
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 20.2 Add PWA plugin with service worker for offline support
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 20.3 Set up SQLite database using sql.js or better-sqlite3 for Electron
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 20.4 Implement database schema matching Android Room entities
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 20.5 Set up Ktor server equivalent for sync endpoints (Express or Fastify)
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 20.6 Implement mDNS advertisement and discovery for laptop
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 20.7 Create app shell with sidebar navigation layout
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD

---

- [ ] 21.0 Implement member management (CRUD operations)
  - **Relevant Documentation:**
    - `/docs/features/distributed-membership-system/design.md` - FR-6 (master data management)
  - [ ] 21.1 Create MembersPage with searchable, sortable member list
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 21.2 Create MemberDetailPanel showing full member profile
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 21.3 Create AddMemberForm with validation for all member fields
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 21.4 Create EditMemberForm with inline editing capability
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 21.5 Implement member status management (ACTIVE, INACTIVE, SUSPENDED)
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 21.6 Create MemberHistoryTab showing check-ins, practice sessions, equipment history
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD

---

- [ ] 22.0 Implement NewMemberRegistration approval workflow
  - **Relevant Documentation:**
    - `/docs/features/distributed-membership-system/design.md` - FR-21 (approval workflow)
  - [ ] 22.1 Create RegistrationQueuePage showing pending registrations
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 22.2 Create RegistrationCard with submission date, name, device source
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 22.3 Create ApprovalDialog with editable member fields pre-populated from registration
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 22.4 Implement "Approve & Create Member" action creating Member record
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 22.5 Implement "Reject Registration" action with optional rejection reason
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 22.6 Create RegistrationArchivePage for approved/rejected registrations
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 22.7 Link approved registrations to created members (registrationId field)
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD

---

- [ ] 23.0 Implement device pairing and management
  - **Relevant Documentation:**
    - `/docs/features/distributed-membership-system/design.md` - FR-22 (device pairing ceremony)
    - `/docs/features/distributed-membership-system/design.md` - FR-10 (device security)
  - [ ] 23.1 Create DevicesPage showing all paired devices with status
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 23.2 Create AddDeviceDialog with device type selection and name input
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 23.3 Implement QR code generation with pairing token, network ID, endpoint
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 23.4 Display full-screen QR code with countdown timer (5 minute expiration)
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 23.5 Implement pairing handshake endpoint (/api/pair) on laptop
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 23.6 Show real-time notification when device successfully pairs
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 23.7 Implement "Revoke Trust" action to remove device from network
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 23.8 Display device last seen timestamp and online/offline status
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD

---

- [ ] 24.0 Implement master data push with confirmation
  - **Relevant Documentation:**
    - `/docs/features/distributed-membership-system/design.md` - FR-15 (push confirmation)
    - `/docs/features/distributed-membership-system/design.md` - FR-4.3 (manual push)
  - [ ] 24.1 Create "Push Master Data" primary action button in member management
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 24.2 Create PushConfirmationDialog showing number of tablets to update
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 24.3 Implement push progress indicator showing per-device status
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 24.4 Show success notification with list of updated devices
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 24.5 Show failure notification with affected device names and retry option
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 24.6 Track pending changes indicator (unsent master data edits)
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD

---

- [ ] 25.0 Build dashboard and reporting views
  - **Relevant Documentation:**
    - `/docs/features/distributed-membership-system/design.md` - FR-6.4, FR-6.5 (historical data, reporting)
    - `/docs/features/distributed-membership-system/design.md` - Design Considerations (Master Laptop UX)
  - [ ] 25.1 Create DashboardPage as landing page
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 25.2 Create RecentActivityFeed showing check-ins, registrations, equipment events
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 25.3 Create DeviceStatusPanel showing online/offline for each paired device
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 25.4 Create QuickStatsCards: members checked in today, equipment out, pending registrations
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 25.5 Create EquipmentOverviewSection with current checkout status
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 25.6 Create SyncLogViewer for troubleshooting (accessible from settings)
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 25.7 Create SettingsPage with backup schedule, network config, restore options
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD

---

### Phase 7: Data Migration and Initial Setup

**Status**: Not Started  
**Progress**: 0/2 tasks complete (0%)  
**Phase Started**: TBD  
**Phase Completed**: TBD

One-time migration from existing single-device setup to distributed system.

---

- [ ] 26.0 Implement CSV import for member data on laptop
  - **Relevant Documentation:**
    - `/docs/features/distributed-membership-system/design.md` - FR-23 (data migration strategy)
    - `imports/members_import.csv` - Existing import format
  - [ ] 26.1 Create ImportPage with CSV file upload component
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 26.2 Implement CSV parser with column-to-field mapping configuration
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 26.3 Create ImportPreview showing parsed records with validation errors
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 26.4 Implement field validation (required fields, format checks, duplicate detection)
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 26.5 Create ImportConfirmation dialog with record count and warnings
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 26.6 Implement batch insert of validated records with progress indicator
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 26.7 Create ImportSummary showing imported count, skipped, and errors
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD

---

- [ ] 27.0 Implement initial sync and migration workflow
  - **Relevant Documentation:**
    - `/docs/features/distributed-membership-system/design.md` - FR-11 (initial data bootstrap)
    - `/docs/features/distributed-membership-system/design.md` - FR-23 (migration strategy)
  - [ ] 27.1 Detect first-time pairing and trigger full sync mode
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 27.2 Implement full sync from laptop to tablet for member master data
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 27.3 Implement full sync from tablet to laptop for historical CheckIn/PracticeSession data
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 27.4 Preserve tablet's local data during merge (no deletions)
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 27.5 Handle membership ID conflicts (laptop version wins)
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 27.6 Show migration progress and completion status on both devices
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 27.7 Mark initial sync complete and switch to delta sync mode
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD

---

### Phase 8: Integration Testing and Polish

**Status**: Not Started  
**Progress**: 0/3 tasks complete (0%)  
**Phase Started**: TBD  
**Phase Completed**: TBD

End-to-end testing and performance optimization.

---

- [ ] 28.0 Create integration tests for multi-device sync scenarios
  - **Relevant Documentation:**
    - `/docs/features/distributed-membership-system/design.md` - Success Metrics
  - [ ] 28.1 Create test harness for simulating multiple devices locally
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 28.2 Test: Member tablet creates check-in, syncs to admin tablet
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 28.3 Test: Practice session on tablet syncs to laptop
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 28.4 Test: Equipment checkout on admin tablet appears on laptop
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 28.5 Test: Offline operation - create data while offline, verify sync on reconnect
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 28.6 Test: Equipment checkout conflict detection and resolution flow
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 28.7 Test: Master data push from laptop to multiple tablets
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 28.8 Test: Device pairing flow end-to-end
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 28.9 Test: Backup and restore on all device types
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD

---

- [ ] 29.0 Implement logging and troubleshooting infrastructure
  - **Relevant Documentation:**
    - `/docs/features/distributed-membership-system/design.md` - FR-12 (logging and troubleshooting)
  - [ ] 29.1 Create SyncLogger for recording sync events with timestamps
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 29.2 Log sync initiated, completed, failed events with device IDs
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 29.3 Log equipment checkout/checkin events for troubleshooting
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 29.4 Log conflict detection and resolution events
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 29.5 Implement log rotation and retention (keep last 7 days)
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 29.6 Create log export functionality for sharing logs with support
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD

---

- [ ] 30.0 Performance testing and optimization
  - **Relevant Documentation:**
    - `/docs/features/distributed-membership-system/design.md` - Performance Targets
  - [ ] 30.1 Measure sync latency with 500+ members and 10,000+ practice sessions
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 30.2 Optimize delta sync to minimize payload size
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 30.3 Verify device discovery completes within 10 seconds
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 30.4 Verify backup completes in under 30 seconds
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 30.5 Verify restore completes in under 60 seconds
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 30.6 Test offline operation for 7+ days then sync
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD
  - [ ] 30.7 Optimize display tablet refresh for minimal UI jank
    - **Started**: TBD
    - **Completed**: TBD
    - **Duration**: TBD

---

## Summary

| Phase | Description | Parent Tasks | Sub-Tasks |
|-------|-------------|--------------|-----------|
| 1 | Shared Sync Infrastructure | 5 | 34 |
| 2 | Member Tablet Modifications | 3 | 19 |
| 3 | Equipment Management Module | 4 | 29 |
| 4 | Admin Tablet Application | 4 | 23 |
| 5 | Display Tablet Applications | 3 | 22 |
| 6 | Master Laptop Application | 6 | 40 |
| 7 | Data Migration and Initial Setup | 2 | 14 |
| 8 | Integration Testing and Polish | 3 | 22 |
| **Total** | | **30** | **203** |

---

## Recommended Execution Order

1. **Phase 1** (Sync Infrastructure) - Foundation for all other phases
2. **Phase 2** (Member Tablet Mods) - Modify existing app with sync
3. **Phase 3** (Equipment Module) - New shared module
4. **Phase 6** (Laptop App) - Parallel with Phase 4/5 after Phase 1-3
5. **Phase 4** (Admin Tablet) - After Phase 3 (uses equipment module)
6. **Phase 5** (Display Tablets) - After Phase 2 (uses sync infrastructure)
7. **Phase 7** (Migration) - After laptop and tablets can pair
8. **Phase 8** (Testing) - Final validation

---

**Document Version:** 1.0
**Created:** January 14, 2026
**Last Updated:** January 14, 2026 by sbalslev
**Status:** Ready for Implementation
