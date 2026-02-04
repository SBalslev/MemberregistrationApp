# Online MySQL Database Integration - Product Requirements Document

**Document Status:** Draft - PRD Analysis Phase
**Created:** 2026-01-27
**Last Updated:** 2026-01-27
**Author:** sbalslev

---

## 1. Introduction/Overview

This feature introduces an online MySQL database to the existing distributed membership management system, enabling data synchronization beyond the local network. The online database serves as a central repository that can receive and provide updates when connected to the internet, while preserving the system's offline-first architecture.

**Key Architectural Constraints:**
1. Only the laptop application connects to the online database
2. **Direct MySQL access is blocked** - must use PHP API layer (verified 2026-01-27)
3. Multiple laptops can sync to the same online database
4. Tablets sync only via local network to laptop(s)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          CURRENT ARCHITECTURE                               │
│                                                                             │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐               │
│  │ Member       │ ←─→ │ Trainer      │ ←─→ │ Master       │               │
│  │ Tablet       │     │ Tablet       │     │ Laptop       │               │
│  └──────────────┘     └──────────────┘     └──────────────┘               │
│         Local Network (LAN) - Peer-to-Peer Sync                           │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                          PROPOSED ARCHITECTURE                              │
│                                                                             │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐                │
│  │ Member       │ ←─→ │ Trainer      │ ←─→ │ Laptop A     │◄───┐          │
│  │ Tablet       │     │ Tablet       │     └──────────────┘    │          │
│  └──────────────┘     └──────────────┘                         │ HTTPS    │
│         Local Network (LAN)            ┌──────────────┐        │          │
│                                        │ Laptop B     │◄───────┤          │
│                                        │ (optional)   │        │          │
│                                        └──────────────┘        ▼          │
│                                                         ┌─────────────┐   │
│                                                         │  PHP API    │   │
│                                                         │ iss-skydning│   │
│                                                         │    .dk      │   │
│                                                         └──────┬──────┘   │
│                                                                │localhost │
│                                                         ┌──────▼──────┐   │
│                                                         │   MySQL     │   │
│                                                         │  Database   │   │
│                                                         └─────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Problem Solved:**

- Enable data updates from outside the training facility network
- Provide backup/recovery capability via cloud storage
- Support administrative updates between training sessions
- Enable future multi-site or remote administration scenarios
- Allow membership management from home/office

---

## 2. Goals

1. **G-1:** Enable the laptop app to synchronize member data with an online MySQL database
2. **G-2:** Maintain offline-first operation - system must work without internet connectivity
3. **G-3:** Implement secure credential handling - database password never stored in source code
4. **G-4:** Design a versioned database schema supporting backwards compatibility
5. **G-5:** Preserve existing local network sync functionality unchanged
6. **G-6:** Minimize data conflicts between online and local data

## 3. Non-Goals (Out of Scope)

1. **NG-1:** Direct tablet-to-online-database communication (tablets sync only via laptop)
2. **NG-2:** Real-time sync (batch/periodic sync is acceptable)
3. **NG-3:** Full cloud migration (local SQLite remains primary)
4. **NG-4:** User authentication system (device-level auth only for Phase 1)
5. **NG-5:** Multi-club federation (single club focus)
6. **NG-6:** Mobile app online connectivity

---

## 4. User Stories

**US-1: Remote Membership Update**

As a club administrator, I want to update member information from my home computer via the laptop app so that I can manage memberships outside of training sessions.

**US-2: Secure Database Connection**

As a club administrator, I want to enter the database password when connecting (not have it stored in code) so that credentials remain secure and can be changed without updating the application.

**US-3: Online Database Backup**

As a club administrator, I want member data automatically synchronized to the online database so that I have an off-site backup in case of local device failure.

**US-4: Sync Status Visibility**

As a club administrator, I want to see the status of online synchronization (last sync time, pending changes, errors) so that I can verify data is properly backed up.

Pending deletes from the online database should be visible and actionable in the settings UI.

**US-5: Offline Graceful Degradation**

As a club administrator, I want the system to continue working normally when internet is unavailable so that training sessions are never interrupted by online connectivity issues.

**US-6: Schema Version Awareness**

As a club administrator, I want clear notification when my app version is incompatible with the online database so that I can update before data corruption occurs.

---

## 5. Connection Details

### 5.1 Connectivity Test Results (2026-01-27)

| Test | Result |
|------|--------|
| Port 3306 (MySQL direct) | **BLOCKED** |
| Port 443 (HTTPS) | **OPEN** |

**Decision:** PHP API layer required for database access.

### 5.2 API Endpoint

| Parameter | Value |
|-----------|-------|
| Base URL | `https://iss-skydning.dk/api/sync/` |
| Authentication | API key + password-based token |
| Protocol | HTTPS (TLS 1.2+) |

### 5.3 Database (accessed via PHP)

| Parameter | Value |
|-----------|-------|
| Host | `localhost` (from PHP) |
| Database | `iss_skydning_dkisssportsskytter` |
| Username | `iss_skydning_dkisssportsskytter` |
| Password | *Configured in PHP environment* |

### 5.4 Security Requirements

- API password entered in laptop app UI (for token generation)
- Password may be cached in OS keychain (opt-in via Electron safeStorage)
- All communication over HTTPS
- API tokens expire after 24 hours

---

## 6. Functional Requirements

### FR-1: Connection Management

**FR-1.1** Laptop app SHALL provide a UI for entering MySQL connection credentials (password).

**FR-1.2** Laptop app SHALL validate connection before attempting sync operations.

**FR-1.3** Laptop app SHALL display clear connection status (Connected/Disconnected/Error).

**FR-1.4** Laptop app SHALL NOT store password in plaintext on disk or in source code.

**FR-1.5** Laptop app SHALL support optional encrypted password storage (user opt-in with master password).

**FR-1.6** Laptop app SHALL gracefully handle connection failures without blocking local operations.

### FR-2: Schema Versioning

**FR-2.1** Online database SHALL include a `schema_version` metadata table.

**FR-2.2** Schema version SHALL use semantic versioning: `MAJOR.MINOR.PATCH`.

**FR-2.3** MAJOR version change indicates breaking changes requiring app update.

**FR-2.4** MINOR version change indicates backwards-compatible additions.

**FR-2.5** PATCH version change indicates backwards-compatible fixes.

**FR-2.6** Laptop app SHALL check schema version before sync operations.

**FR-2.7** Laptop app SHALL refuse sync if MAJOR version mismatch exists.

**FR-2.8** Laptop app SHALL warn user on MINOR version mismatch but allow sync.

**FR-2.9** Schema migrations SHALL be documented and reversible where possible.

### FR-3: Data Synchronization

**FR-3.1** Laptop app SHALL support bidirectional sync with online database.

**FR-3.2** Sync SHALL be triggered manually by user action (Phase 1).

**FR-3.3** Sync SHALL optionally run on a configurable schedule (Phase 2).

**FR-3.4** Entity Sync Matrix:

| Entity | Direction | Cloud Editable | Notes |
|--------|-----------|----------------|-------|
| Member | Bidirectional | Yes | Laptop-mastered, but cloud can edit |
| MemberPhoto | Bidirectional | Yes | Binary with deduplication |
| TrainerInfo | Bidirectional | Yes | Laptop-mastered, cloud editable |
| TrainerDiscipline | Bidirectional | Yes | Laptop-mastered, cloud editable |
| Finance* | Bidirectional | Yes | Full cloud editing support |
| CheckIn | One-way (up) | No | Tablet → Laptop → Cloud |
| PracticeSession | One-way (up) | No | Tablet → Laptop → Cloud |
| ScanEvent | One-way (up) | No | Audit trail |
| Equipment | Bidirectional | Yes | Master data |
| EquipmentCheckout | One-way (up) | No | Activity data |

*Finance includes: FiscalYear, PostingCategory, FinancialTransaction, TransactionLine, PendingFeePayment

**FR-3.4.1** "Cloud Editable" entities can be modified directly in the online database (e.g., by another laptop or future admin interface).

**FR-3.4.2** "One-way (up)" entities are created on tablets, synced to laptop, then uploaded to cloud. They cannot be modified in cloud.

**FR-3.5** Sync SHALL use timestamp-based change detection.

**FR-3.6** Laptop app SHALL maintain a sync log for audit purposes.

**FR-3.7** Sync operations SHALL be atomic (all-or-nothing per entity type).

**FR-3.8** Sync SHALL be resumable after interruption:
  - Track sync progress per entity type
  - On network failure, save current position
  - On reconnect, resume from last successful position
  - Do not re-upload already-synced records

**FR-3.9** Network instability handling:
  - Retry failed requests (3 attempts, exponential backoff)
  - Timeout after 30 seconds per request
  - Allow user to cancel long-running sync
  - Display progress indicator during sync

### FR-4: Conflict Resolution

**FR-4.1** Conflict resolution policy: **Last edit wins** (based on `modifiedAtUtc` timestamp).

**FR-4.2** When the same record is modified in both local and online:
  - Compare `modifiedAtUtc` timestamps
  - Record with most recent timestamp overwrites the other
  - No user prompt required (automatic resolution)

**FR-4.3** Conflict resolution decisions SHALL be logged for audit (which record won, timestamps).

**FR-4.4** All synced records SHALL include:
  - `modifiedAtUtc` - Last modification timestamp (UTC)
  - `modifiedByDevice` - Device ID that made the change

**FR-4.5** Multi-laptop scenario: Same rules apply - last edit wins regardless of which laptop.

### FR-4.5: Delete Handling

**FR-4.5.1** When a record is deleted locally, it SHALL be deleted from online database.

**FR-4.5.2** When a record is deleted online (e.g., by another laptop), pulling that deletion to local SHALL:
  - Display confirmation dialog: "X records will be deleted from local database"
  - List affected records (member names, etc.)
  - Require user confirmation before applying deletions

**FR-4.5.3** Merged members (`mergedIntoId` set) SHALL sync the merge relationship to online.

**FR-4.5.4** Soft delete (status=INACTIVE) vs hard delete:
  - Members: Prefer soft delete (status=INACTIVE), hard delete only on explicit user action
  - Activity data (CheckIn, Sessions): No delete from online (archive)
  - Equipment: Support hard delete with cascade to checkouts

### FR-5: Data Integrity

**FR-5.1** All synced records SHALL include `syncVersion` for optimistic locking.

**FR-5.2** UUIDs SHALL be used for all primary keys (no auto-increment conflicts).

**FR-5.3** Referential integrity SHALL be maintained during sync operations.

**FR-5.4** Failed sync operations SHALL be retryable without data duplication.

### FR-6: Status and Monitoring

**FR-6.1** Laptop app SHALL display last successful sync timestamp.

**FR-6.2** Laptop app SHALL display count of pending local changes.

**FR-6.3** Laptop app SHALL display sync error messages with actionable guidance.

**FR-6.4** Laptop app SHALL provide a sync history log view.

---

## 7. Database Schema Design

### 7.1 Metadata Table

```sql
CREATE TABLE _schema_metadata (
    id INT PRIMARY KEY DEFAULT 1,
    major_version INT NOT NULL,
    minor_version INT NOT NULL,
    patch_version INT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_migration_at DATETIME,
    description VARCHAR(255),
    CHECK (id = 1)  -- Ensures single row
);

-- Initial version
INSERT INTO _schema_metadata (major_version, minor_version, patch_version, description)
VALUES (1, 0, 0, 'Initial schema');
```

### 7.2 Sync Tracking Table

```sql
CREATE TABLE _sync_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_id VARCHAR(36) NOT NULL,
    sync_direction ENUM('PUSH', 'PULL') NOT NULL,
    started_at DATETIME NOT NULL,
    completed_at DATETIME,
    status ENUM('IN_PROGRESS', 'SUCCESS', 'FAILED', 'PARTIAL') NOT NULL,
    entities_pushed INT DEFAULT 0,
    entities_pulled INT DEFAULT 0,
    error_message TEXT,
    app_version VARCHAR(20)
);

CREATE INDEX idx_sync_log_device ON _sync_log(device_id);
CREATE INDEX idx_sync_log_started ON _sync_log(started_at);
```

### 7.3 Core Entity Tables

```sql
-- Member table (mirrors local schema with online-specific additions)
CREATE TABLE members (
    internal_id VARCHAR(36) PRIMARY KEY,  -- UUID
    membership_id VARCHAR(20),
    member_type ENUM('TRIAL', 'FULL') NOT NULL DEFAULT 'TRIAL',
    status ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    birth_date DATE,
    gender ENUM('MALE', 'FEMALE', 'OTHER'),
    email VARCHAR(255),
    phone VARCHAR(20),
    address VARCHAR(255),
    zip_code VARCHAR(10),
    city VARCHAR(100),
    guardian_name VARCHAR(200),
    guardian_phone VARCHAR(20),
    guardian_email VARCHAR(255),
    expires_on DATE,
    registration_photo_path VARCHAR(500),
    merged_into_id VARCHAR(36),

    -- Sync metadata
    device_id VARCHAR(36) NOT NULL,
    sync_version BIGINT NOT NULL DEFAULT 1,
    created_at_utc DATETIME NOT NULL,
    modified_at_utc DATETIME NOT NULL,
    synced_at_utc DATETIME,

    INDEX idx_member_membership_id (membership_id),
    INDEX idx_member_status (status),
    INDEX idx_member_sync_version (sync_version),
    INDEX idx_member_modified (modified_at_utc)
);

-- Check-ins table
CREATE TABLE check_ins (
    id VARCHAR(36) PRIMARY KEY,  -- UUID
    internal_member_id VARCHAR(36) NOT NULL,
    created_at_utc DATETIME NOT NULL,
    local_date DATE NOT NULL,
    first_of_day_flag BOOLEAN DEFAULT FALSE,

    -- Sync metadata
    device_id VARCHAR(36) NOT NULL,
    sync_version BIGINT NOT NULL DEFAULT 1,
    synced_at_utc DATETIME,

    INDEX idx_checkin_member (internal_member_id),
    INDEX idx_checkin_date (local_date),
    INDEX idx_checkin_sync (sync_version),
    FOREIGN KEY (internal_member_id) REFERENCES members(internal_id)
);

-- Practice sessions table
CREATE TABLE practice_sessions (
    id VARCHAR(36) PRIMARY KEY,  -- UUID
    internal_member_id VARCHAR(36) NOT NULL,
    created_at_utc DATETIME NOT NULL,
    local_date DATE NOT NULL,
    practice_type ENUM('Riffel', 'Pistol', 'LuftRiffel', 'LuftPistol', 'Andet') NOT NULL,
    points INT NOT NULL,
    krydser INT,
    classification VARCHAR(50),
    source ENUM('kiosk', 'attendant') NOT NULL DEFAULT 'kiosk',

    -- Sync metadata
    device_id VARCHAR(36) NOT NULL,
    sync_version BIGINT NOT NULL DEFAULT 1,
    synced_at_utc DATETIME,

    INDEX idx_session_member (internal_member_id),
    INDEX idx_session_date (local_date),
    INDEX idx_session_type_date (practice_type, local_date),
    INDEX idx_session_sync (sync_version),
    FOREIGN KEY (internal_member_id) REFERENCES members(internal_id)
);

-- Equipment items table
CREATE TABLE equipment_items (
    id VARCHAR(36) PRIMARY KEY,  -- UUID
    serial_number VARCHAR(50) NOT NULL UNIQUE,
    type ENUM('TrainingMaterial') NOT NULL,
    description VARCHAR(200),
    status ENUM('Available', 'CheckedOut', 'Maintenance', 'Retired') NOT NULL DEFAULT 'Available',
    discipline VARCHAR(50),

    -- Sync metadata
    device_id VARCHAR(36) NOT NULL,
    sync_version BIGINT NOT NULL DEFAULT 1,
    created_at_utc DATETIME NOT NULL,
    modified_at_utc DATETIME NOT NULL,
    synced_at_utc DATETIME,

    INDEX idx_equipment_status (status),
    INDEX idx_equipment_sync (sync_version)
);

-- Equipment checkouts table
CREATE TABLE equipment_checkouts (
    id VARCHAR(36) PRIMARY KEY,  -- UUID
    equipment_id VARCHAR(36) NOT NULL,
    internal_member_id VARCHAR(36) NOT NULL,
    checked_out_at_utc DATETIME NOT NULL,
    checked_in_at_utc DATETIME,
    checkout_notes TEXT,
    checkin_notes TEXT,
    conflict_status ENUM('None', 'Pending', 'Resolved', 'Cancelled') DEFAULT 'None',

    -- Sync metadata
    device_id VARCHAR(36) NOT NULL,
    sync_version BIGINT NOT NULL DEFAULT 1,
    synced_at_utc DATETIME,

    INDEX idx_checkout_equipment (equipment_id),
    INDEX idx_checkout_member (internal_member_id),
    INDEX idx_checkout_status (conflict_status),
    INDEX idx_checkout_sync (sync_version),
    FOREIGN KEY (equipment_id) REFERENCES equipment_items(id),
    FOREIGN KEY (internal_member_id) REFERENCES members(internal_id)
);

-- Trainer info table
CREATE TABLE trainer_info (
    internal_member_id VARCHAR(36) PRIMARY KEY,
    has_skydeleder_certificate BOOLEAN DEFAULT FALSE,
    certified_date DATE,
    notes TEXT,

    -- Sync metadata
    device_id VARCHAR(36) NOT NULL,
    sync_version BIGINT NOT NULL DEFAULT 1,
    modified_at_utc DATETIME NOT NULL,
    synced_at_utc DATETIME,

    FOREIGN KEY (internal_member_id) REFERENCES members(internal_id)
);

-- Member photos table (binary storage)
CREATE TABLE member_photos (
    id VARCHAR(36) PRIMARY KEY,  -- UUID
    internal_member_id VARCHAR(36) NOT NULL,
    photo_type ENUM('registration', 'profile') NOT NULL DEFAULT 'registration',
    content_hash VARCHAR(64) NOT NULL,  -- SHA-256 for deduplication
    mime_type VARCHAR(50) NOT NULL DEFAULT 'image/jpeg',
    file_size INT NOT NULL,  -- Original size in bytes
    width INT,
    height INT,
    photo_data MEDIUMBLOB NOT NULL,  -- Up to 16MB compressed

    -- Sync metadata
    device_id VARCHAR(36) NOT NULL,
    sync_version BIGINT NOT NULL DEFAULT 1,
    created_at_utc DATETIME NOT NULL,
    synced_at_utc DATETIME,

    INDEX idx_photo_member (internal_member_id),
    INDEX idx_photo_hash (content_hash),
    INDEX idx_photo_sync (sync_version),
    FOREIGN KEY (internal_member_id) REFERENCES members(internal_id)
);
```

### 7.4 Migration Strategy

```sql
-- Migrations table to track applied migrations
CREATE TABLE _migrations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    version VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    checksum VARCHAR(64),  -- SHA-256 of migration script
    execution_time_ms INT
);
```

**Migration Naming Convention:** `V{major}_{minor}_{patch}__{description}.sql`

Example:
- `V1_0_0__initial_schema.sql`
- `V1_1_0__add_trainer_disciplines.sql`
- `V1_1_1__fix_checkin_index.sql`

---

## 8. Backwards Compatibility Strategy

### 8.1 Version Compatibility Matrix

| App Version | Schema v1.0.x | Schema v1.1.x | Schema v2.0.x |
|-------------|---------------|---------------|---------------|
| 1.0.x       | Full          | Read-only     | Incompatible  |
| 1.1.x       | Full          | Full          | Incompatible  |
| 2.0.x       | Migration     | Migration     | Full          |

### 8.2 Compatibility Rules

1. **Adding columns:** Always use `DEFAULT` value or `NULL` for backwards compatibility
2. **Removing columns:** Deprecate first (ignore in app), remove in next MAJOR version
3. **Changing column types:** Create new column, migrate data, deprecate old column
4. **Adding tables:** No compatibility impact (old apps ignore)
5. **Removing tables:** Only in MAJOR version upgrade

### 8.3 Graceful Degradation

- Older app versions can connect to newer schema (MINOR version) in read-only mode
- Newer app versions detect older schema and offer migration
- Unknown columns in sync responses are ignored (forward compatible)
- Unknown enum values default to safe fallback

---

## 9. Security Considerations

### 9.1 Credential Handling

| Requirement | Implementation |
|-------------|----------------|
| No hardcoded passwords | Password entered via UI at runtime |
| Secure transmission | Use SSL/TLS (MySQL native or stunnel) |
| Memory protection | Clear password from memory after connection |
| Optional persistence | OS keychain via Electron `safeStorage` API |

**Electron safeStorage:** Uses OS-level encryption (Windows DPAPI, macOS Keychain, Linux Secret Service) to securely store the database password. User can opt-in to "Remember password" which encrypts and stores credentials in OS keychain.

### 9.2 Connection Security

```
Recommended: MySQL over TLS
Alternative: SSH tunnel to database server

Connection string (no password):
mysql://iss_skydning_dkisssportsskytter@iss-skydning.dk.mysql:3306/iss_skydning_dkisssportsskytter?ssl=true
```

### 9.3 Data Protection

- Sync only necessary fields (no sensitive financial data in Phase 1)
- Photo data synced as binary BLOBs with compression and deduplication
- Consider field-level encryption for sensitive personal data (Phase 2)

---

## 10. Implementation Phases

### Phase 1: Foundation (MVP)
- [ ] MySQL connection UI (password entry)
- [ ] OS keychain integration (Electron safeStorage) for "Remember password"
- [ ] Schema version checking
- [ ] Initial schema deployment script
- [ ] Manual sync trigger (push/pull buttons)
- [ ] Member entity sync only
- [ ] Basic sync status display
- [ ] Error handling and logging

### Phase 2: Full Entity Sync
- [ ] CheckIn sync
- [ ] PracticeSession sync
- [ ] Equipment sync
- [ ] MemberPhoto binary sync (with compression/deduplication)
- [ ] TrainerInfo sync
- [ ] Conflict detection and resolution UI
- [ ] Sync history log view

### Phase 3: Automation & Polish
- [ ] Scheduled automatic sync (optional, user-configurable)
- [ ] Sync progress indicators with cancel option
- [ ] Retry logic for failed syncs (3 retries, exponential backoff)
- [ ] Data validation and integrity checks
- [ ] Bandwidth optimization for photo sync

### Phase 4: Advanced Features (Future)
- [ ] Multi-device online sync coordination
- [ ] Real-time sync notifications
- [ ] Selective sync (choose what to sync)
- [ ] Data archival and cleanup

---

## 11. Technical Architecture (Laptop App)

### 11.1 New Dependencies

```json
{
  "mysql2": "^3.x",           // MySQL driver with Promise support
  "sql.js": "existing",       // Keep for local SQLite
}
```

### 11.2 Service Architecture

```
laptop/src/
├── database/
│   ├── db.ts                    // Local SQLite (existing)
│   ├── onlineDb.ts              // NEW: MySQL connection manager
│   ├── onlineSchema.ts          // NEW: Schema version management
│   └── onlineSync/
│       ├── onlineSyncService.ts // NEW: Sync orchestration
│       ├── memberOnlineSync.ts  // NEW: Member sync logic
│       ├── sessionOnlineSync.ts // NEW: Session sync logic
│       └── conflictResolver.ts  // NEW: Conflict resolution
├── stores/
│   └── onlineConnectionStore.ts // NEW: Connection state (Zustand)
└── components/
    └── onlineSync/
        ├── ConnectionDialog.tsx // NEW: Password entry UI
        ├── SyncStatus.tsx       // NEW: Status display
        └── SyncHistoryLog.tsx   // NEW: History view
```

### 11.3 Connection Flow

```
1. User clicks "Connect to Online Database"
2. ConnectionDialog opens, prompts for password
3. onlineDb.connect(password) attempts connection
4. On success: Store connection in memory, update UI state
5. On failure: Display error, allow retry
6. Connection status shown in header/footer
7. Sync buttons enabled when connected
```

---

## 12. Design Decisions

| # | Question | Decision |
|---|----------|----------|
| 1 | Should sync be automatic or manual? | **Manual** - User triggers sync explicitly |
| 2 | How to handle photos (binary data)? | **Include binaries** - Photos synced as BLOB data |
| 3 | Should old app versions be blocked from writing? | **Yes** - Read-only for minor version mismatch |
| 4 | Max sync batch size? | **50 records** per batch (balances memory/network) |
| 5 | Retry policy for failed syncs? | **3 retries** with exponential backoff (1s, 2s, 4s) |
| 6 | Should encrypted password storage use OS keychain? | **Yes** - Use Electron safeStorage API (OS keychain) |

### 12.1 Photo Sync Details

Photos are synced as binary data to ensure complete data backup in the online database:

- **Storage:** MEDIUMBLOB column (up to 16MB per photo)
- **Compression:** Photos compressed before upload (JPEG quality 80%)
- **Chunked upload:** Large photos split into 1MB chunks for reliability
- **Deduplication:** SHA-256 hash to avoid re-uploading unchanged photos
- **Bandwidth:** Estimated 200KB-500KB per member photo

---

## 13. Success Metrics

1. **Sync reliability:** >99% of sync operations complete successfully
2. **Data integrity:** Zero data loss or corruption incidents
3. **Offline resilience:** Local operations unaffected by online status
4. **Sync latency:** Manual sync completes within 30 seconds for typical dataset
5. **User adoption:** Administrators actively use online sync feature

---

## 14. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Network instability | Medium | High | Robust retry logic, clear status indicators |
| Schema version mismatch | Low | High | Version check before any sync operation |
| Credential exposure | Low | Critical | Never persist password, use TLS |
| Data conflicts | Medium | Medium | Clear conflict resolution UI, audit logging |
| MySQL server downtime | Low | Medium | Graceful degradation, local-only mode |

---

## 15. Dependencies

- MySQL server availability and credentials (provided)
- Laptop app Electron environment for secure storage APIs
- Network access to `iss-skydning.dk.mysql:3306`

---

## 16. Appendix

### A. Glossary

| Term | Definition |
|------|------------|
| Local DB | SQLite database on laptop (sql.js) |
| Online DB | MySQL database on iss-skydning.dk |
| Sync | Bidirectional data transfer between local and online |
| Push | Send local changes to online DB |
| Pull | Retrieve online changes to local DB |
| Schema Version | Database structure version (MAJOR.MINOR.PATCH) |

### B. Related Documents

- `docs/features/online-database-sync/technical-design.md` - Technical implementation design
- `docs/features/distributed-membership-system/design.md` - Existing sync architecture
- `docs/features/distributed-membership-system/sync-implementation-notes.md` - Local sync details
- `laptop/src/database/db.ts` - Current local database schema

### C. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-01-27 | sbalslev | Initial PRD draft |
| 0.2 | 2026-01-27 | sbalslev | Added photo binary sync, OS keychain for credentials, finalized design decisions |
| 0.3 | 2026-01-27 | sbalslev | PHP API approach (MySQL port blocked), multi-laptop support, complete entity sync matrix, last-edit-wins conflict resolution, delete confirmation, resumable sync |
