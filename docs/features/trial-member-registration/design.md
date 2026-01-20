# Trial Member Registration - Technical Design Document

**Feature:** Trial Member Registration (Prøvemedlem)
**Version:** 1.2
**Last Updated:** 2026-01-20
**Author:** sbalslev
**Related PRD:** [prd.md](prd.md)

---

## 1. Overview

This document details the technical implementation of the Trial Member Registration feature, which refactors the member registration workflow to eliminate the separate `NewMemberRegistration` entity and approval flow. New registrations immediately create a `Member` record with `memberType = TRIAL`.

### 1.1 Key Changes

| Component | Current State | New State |
|-----------|---------------|-----------|
| Registration entity | `NewMemberRegistration` | `Member` with `memberType = TRIAL` |
| Primary key | `membershipId` | `internalId` (UUID) |
| Approval workflow | Required | Removed |
| Member ID assignment | At approval time | Deferred, on laptop |
| Sync direction | Tablet→Laptop only for registrations | Bidirectional for all members |

### 1.2 Design Principles

1. **UUID as identity**: `internalId` is immutable and globally unique
2. **Eventual consistency**: All devices converge to same state via sync
3. **Laptop authority**: Laptop owns `membershipId` assignment and merge decisions
4. **No data loss**: All fields from `NewMemberRegistration` preserved in `Member`

---

## 2. Data Model

### 2.1 Member Entity (Android/Kotlin)

```kotlin
package com.club.medlems.data.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate

/** Member lifecycle stage */
enum class MemberType {
    /** Registered on tablet, no membershipId assigned yet */
    TRIAL,
    /** Has official membershipId assigned */
    FULL
}

/** Member operational status */
enum class MemberStatus {
    /** Can check in and use club services */
    ACTIVE,
    /** Archived, cannot check in */
    INACTIVE
}

@Entity(
    tableName = "members",
    indices = [
        Index(value = ["membershipId"], unique = true),
        Index(value = ["memberType"]),
        Index(value = ["status"]),
        Index(value = ["lastName", "firstName"])
    ]
)
data class Member(
    /** Immutable UUID, primary key across all devices */
    @PrimaryKey 
    val internalId: String,
    
    /** Club-assigned ID, null for trial members */
    val membershipId: String? = null,
    
    /** Lifecycle stage: TRIAL or FULL */
    val memberType: MemberType = MemberType.TRIAL,
    
    /** Operational status: ACTIVE or INACTIVE */
    val status: MemberStatus = MemberStatus.ACTIVE,
    
    // === Personal Information ===
    val firstName: String,
    val lastName: String,
    val birthDate: LocalDate? = null,
    val gender: String? = null,
    val email: String? = null,
    val phone: String? = null,
    val address: String? = null,
    val zipCode: String? = null,
    val city: String? = null,
    
    // === Guardian Information (for minors) ===
    val guardianName: String? = null,
    val guardianPhone: String? = null,
    val guardianEmail: String? = null,
    
    // === Membership Details ===
    val expiresOn: String? = null,
    val registrationPhotoPath: String? = null,
    
    // === Merge Tracking (per DD-10) ===
    /** If merged into another member, points to surviving member's internalId */
    val mergedIntoId: String? = null,
    
    // === Timestamps ===
    val createdAtUtc: Instant,
    val updatedAtUtc: Instant = Instant.DISTANT_PAST,
    
    // === Sync Metadata ===
    /** Device that created/last modified this record */
    val deviceId: String? = null,
    /** Monotonically increasing version for conflict detection */
    val syncVersion: Long = 0,
    /** Last successful sync timestamp */
    val syncedAtUtc: Instant? = null
)
```

### 2.2 Member Entity (Laptop/TypeScript)

```typescript
// laptop/src/types/entities.ts

export type MemberType = 'TRIAL' | 'FULL';
export type MemberStatus = 'ACTIVE' | 'INACTIVE';
export type Gender = 'MALE' | 'FEMALE' | 'OTHER';

export interface Member {
  // Identity
  internalId: string;           // UUID, immutable primary key
  membershipId: string | null;  // Club ID, null for trials
  memberType: MemberType;       // TRIAL or FULL
  status: MemberStatus;         // ACTIVE or INACTIVE
  
  // Personal Information
  firstName: string;
  lastName: string;
  birthday: string | null;      // ISO date YYYY-MM-DD
  gender: Gender | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  zipCode: string | null;
  city: string | null;
  
  // Guardian (for minors)
  guardianName: string | null;
  guardianPhone: string | null;
  guardianEmail: string | null;
  
  // Membership
  expiresOn: string | null;
  photoUri: string | null;
  
  // Merge tracking (per DD-10)
  mergedIntoId: string | null;  // If merged, points to surviving member
  
  // Timestamps
  createdAtUtc: string;         // ISO datetime
  updatedAtUtc: string;         // ISO datetime
  
  // Sync
  deviceId: string | null;
  syncVersion: number;
  syncedAtUtc: string | null;
}

// NOTE: MemberForTabletSync removed per DD-9
// All sync operations use Member type directly
```

### 2.3 Foreign Key Updates

All entities referencing members must migrate from `membershipId` to `internalId`:

```kotlin
// CheckIn entity
@Entity(indices = [Index(value = ["internalMemberId", "localDate"])])
data class CheckIn(
    @PrimaryKey val id: String,
    val internalMemberId: String,  // NEW: FK to Member.internalId
    @Deprecated("Use internalMemberId")
    val membershipId: String? = null,  // DEPRECATED: retained for migration
    val createdAtUtc: Instant,
    val localDate: LocalDate,
    val firstOfDayFlag: Boolean = true,
    // ... sync metadata
)

// PracticeSession entity
@Entity
data class PracticeSession(
    @PrimaryKey val id: String,
    val internalMemberId: String,  // NEW: FK to Member.internalId
    @Deprecated("Use internalMemberId")
    val membershipId: String? = null,  // DEPRECATED
    // ... other fields
)

// ScanEvent entity  
@Entity
data class ScanEvent(
    @PrimaryKey val id: String,
    val internalMemberId: String,  // NEW: FK to Member.internalId
    @Deprecated("Use internalMemberId")
    val membershipId: String? = null,  // DEPRECATED
    // ... other fields
)
```

### 2.4 Syncable Member Entity

```kotlin
// SyncableEntities.kt
@Serializable
data class SyncableMember(
    val internalId: String,
    val membershipId: String? = null,
    val memberType: MemberType,
    val status: MemberStatus,
    
    val firstName: String,
    val lastName: String,
    val birthDate: LocalDate? = null,
    val gender: String? = null,
    val email: String? = null,
    val phone: String? = null,
    val address: String? = null,
    val zipCode: String? = null,
    val city: String? = null,
    
    val guardianName: String? = null,
    val guardianPhone: String? = null,
    val guardianEmail: String? = null,
    
    val expiresOn: String? = null,
    val registrationPhotoBase64: String? = null,  // Photo embedded for sync
    
    // Sync metadata
    override val deviceId: String,
    override val syncVersion: Long,
    override val createdAtUtc: Instant,
    override val modifiedAtUtc: Instant,
    override val syncedAtUtc: Instant? = null
) : SyncMetadata
```

---

## 3. Sync Architecture

### 3.1 Sync Flow Diagrams

#### 3.1.1 Trial Member Creation (Tablet → Laptop)

```
┌─────────────────┐                              ┌─────────────────┐
│     TABLET      │                              │     LAPTOP      │
└────────┬────────┘                              └────────┬────────┘
         │                                                │
         │  1. User fills registration form               │
         ▼                                                │
    ┌─────────────────────────────────┐                   │
    │ Create Member record:           │                   │
    │   internalId = UUID.randomUUID()│                   │
    │   membershipId = null           │                   │
    │   memberType = TRIAL            │                   │
    │   status = ACTIVE               │                   │
    │   deviceId = thisDevice         │                   │
    │   syncVersion = 1               │                   │
    └─────────────────────────────────┘                   │
         │                                                │
         │  2. Store locally, capture photo               │
         │                                                │
         │  3. Sync triggers (immediate or periodic)      │
         │                                                │
         │  ──────── POST /api/sync/push ────────────►    │
         │  {                                             │
         │    deviceId: "tablet-001",                     │
         │    members: [{ internalId, ... }],             │
         │    photos: [{ internalId, base64 }]            │
         │  }                                             │
         │                                                ▼
         │                              ┌─────────────────────────────┐
         │                              │ Laptop receives:            │
         │                              │   - Check internalId exists │
         │                              │   - If new: INSERT          │
         │                              │   - If exists: merge by     │
         │                              │     syncVersion             │
         │                              │   - Save photo to disk      │
         │                              └─────────────────────────────┘
         │                                                │
         │  ◄──────── 200 OK ────────────────────────────│
         │  { accepted: 1, conflicts: 0 }                 │
         │                                                │
         ▼                                                │
    ┌─────────────────────────────────┐                   │
    │ Mark as synced:                 │                   │
    │   syncedAtUtc = now()           │                   │
    └─────────────────────────────────┘                   │
```

#### 3.1.2 Member ID Assignment (Laptop → Tablet)

```
┌─────────────────┐                              ┌─────────────────┐
│     LAPTOP      │                              │     TABLET      │
└────────┬────────┘                              └────────┬────────┘
         │                                                │
         │  1. Admin assigns membershipId                 │
         ▼                                                │
    ┌─────────────────────────────────┐                   │
    │ Update Member:                  │                   │
    │   membershipId = "2024-042"     │                   │
    │   memberType = FULL             │                   │
    │   syncVersion++                 │                   │
    │   updatedAtUtc = now()          │                   │
    └─────────────────────────────────┘                   │
         │                                                │
         │  2. Admin clicks "Push to Tablets"             │
         │                                                │
         │  ──────── POST /api/sync/push ────────────►    │
         │  {                                             │
         │    deviceId: "laptop-main",                    │
         │    members: [{                                 │
         │      internalId: "uuid-xxx",                   │
         │      membershipId: "2024-042",                 │
         │      memberType: "FULL",                       │
         │      syncVersion: 2                            │
         │    }]                                          │
         │  }                                             │
         │                                                ▼
         │                              ┌─────────────────────────────┐
         │                              │ Tablet receives:            │
         │                              │   - Find by internalId      │
         │                              │   - Compare syncVersion     │
         │                              │   - Higher version wins     │
         │                              │   - Update local record     │
         │                              └─────────────────────────────┘
         │                                                │
         │  ◄──────── 200 OK ────────────────────────────│
```

### 3.2 Conflict Resolution Rules

| Field | Conflict Strategy | Notes |
|-------|-------------------|-------|
| `internalId` | Immutable | Never changes, used as merge key |
| `membershipId` | Laptop wins | Only laptop can assign |
| `memberType` | Laptop wins | Laptop controls promotion to FULL |
| `status` | Laptop wins | Laptop controls activation/deactivation |
| Personal fields | Last-write-wins | Based on `modifiedAtUtc` |
| `syncVersion` | Highest wins | Monotonically increasing per device |

### 3.3 Duplicate Detection

```typescript
// laptop/src/utils/duplicateDetection.ts

interface PotentialDuplicate {
  member1: Member;
  member2: Member;
  matchType: 'PHONE' | 'EMAIL' | 'NAME_SIMILARITY';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

function detectDuplicates(members: Member[]): PotentialDuplicate[] {
  const duplicates: PotentialDuplicate[] = [];
  
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const m1 = members[i];
      const m2 = members[j];
      
      // Same phone number
      if (m1.phone && m2.phone && normalizePhone(m1.phone) === normalizePhone(m2.phone)) {
        duplicates.push({ member1: m1, member2: m2, matchType: 'PHONE', confidence: 'HIGH' });
      }
      
      // Same email
      if (m1.email && m2.email && m1.email.toLowerCase() === m2.email.toLowerCase()) {
        duplicates.push({ member1: m1, member2: m2, matchType: 'EMAIL', confidence: 'HIGH' });
      }
      
      // Similar names registered within 7 days
      if (isSimilarName(m1, m2) && isWithinDays(m1.createdAtUtc, m2.createdAtUtc, 7)) {
        duplicates.push({ member1: m1, member2: m2, matchType: 'NAME_SIMILARITY', confidence: 'MEDIUM' });
      }
    }
  }
  
  return duplicates;
}
```

---

## 4. Database Migration

### 4.1 Android Room Migration

```kotlin
// Migration_X_Y.kt
val MIGRATION_X_Y = object : Migration(X, Y) {
    override fun migrate(database: SupportSQLiteDatabase) {
        // Step 1: Create new members table with new schema
        database.execSQL("""
            CREATE TABLE members_new (
                internalId TEXT PRIMARY KEY NOT NULL,
                membershipId TEXT,
                memberType TEXT NOT NULL DEFAULT 'FULL',
                status TEXT NOT NULL DEFAULT 'ACTIVE',
                firstName TEXT NOT NULL,
                lastName TEXT NOT NULL,
                birthDate TEXT,
                gender TEXT,
                email TEXT,
                phone TEXT,
                address TEXT,
                zipCode TEXT,
                city TEXT,
                guardianName TEXT,
                guardianPhone TEXT,
                guardianEmail TEXT,
                expiresOn TEXT,
                registrationPhotoPath TEXT,
                createdAtUtc TEXT NOT NULL,
                updatedAtUtc TEXT NOT NULL,
                deviceId TEXT,
                syncVersion INTEGER NOT NULL DEFAULT 0,
                syncedAtUtc TEXT
            )
        """)
        
        // Step 2: Migrate existing members (generate internalId from membershipId)
        database.execSQL("""
            INSERT INTO members_new (
                internalId, membershipId, memberType, status,
                firstName, lastName, birthDate, email, phone,
                createdAtUtc, updatedAtUtc, deviceId, syncVersion, syncedAtUtc
            )
            SELECT 
                lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || 
                      substr(hex(randomblob(2)),2) || '-' || 
                      substr('89ab', abs(random()) % 4 + 1, 1) || 
                      substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6))),
                membershipId, 'FULL', status,
                firstName, lastName, birthDate, email, phone,
                COALESCE(updatedAtUtc, datetime('now')), 
                COALESCE(updatedAtUtc, datetime('now')),
                deviceId, syncVersion, syncedAtUtc
            FROM members
        """)
        
        // Step 3: Migrate pending registrations to trial members
        database.execSQL("""
            INSERT INTO members_new (
                internalId, membershipId, memberType, status,
                firstName, lastName, birthDate, gender,
                email, phone, address, zipCode, city,
                guardianName, guardianPhone, guardianEmail,
                registrationPhotoPath, createdAtUtc, updatedAtUtc,
                deviceId, syncVersion, syncedAtUtc
            )
            SELECT 
                id, NULL, 'TRIAL', 'ACTIVE',
                firstName, lastName, birthDate, gender,
                email, phone, address, zipCode, city,
                guardianName, guardianPhone, guardianEmail,
                photoPath, createdAtUtc, createdAtUtc,
                deviceId, syncVersion, syncedAtUtc
            FROM new_member_registrations
            WHERE approvalStatus = 'PENDING'
        """)
        
        // Step 4: Create mapping table for FK migration
        database.execSQL("""
            CREATE TABLE member_id_mapping AS
            SELECT m.membershipId AS old_id, m.internalId AS new_id
            FROM members_new m
            WHERE m.membershipId IS NOT NULL
        """)
        
        // Step 5: Add internalMemberId to related tables
        database.execSQL("ALTER TABLE check_ins ADD COLUMN internalMemberId TEXT")
        database.execSQL("ALTER TABLE practice_sessions ADD COLUMN internalMemberId TEXT")
        database.execSQL("ALTER TABLE scan_events ADD COLUMN internalMemberId TEXT")
        
        // Step 6: Populate internalMemberId from mapping
        database.execSQL("""
            UPDATE check_ins SET internalMemberId = (
                SELECT new_id FROM member_id_mapping WHERE old_id = check_ins.membershipId
            )
        """)
        database.execSQL("""
            UPDATE practice_sessions SET internalMemberId = (
                SELECT new_id FROM member_id_mapping WHERE old_id = practice_sessions.membershipId
            )
        """)
        database.execSQL("""
            UPDATE scan_events SET internalMemberId = (
                SELECT new_id FROM member_id_mapping WHERE old_id = scan_events.membershipId
            )
        """)
        
        // Step 7: Drop old table, rename new
        database.execSQL("DROP TABLE members")
        database.execSQL("ALTER TABLE members_new RENAME TO members")
        
        // Step 8: Create indexes
        database.execSQL("CREATE UNIQUE INDEX idx_members_membershipId ON members(membershipId)")
        database.execSQL("CREATE INDEX idx_members_memberType ON members(memberType)")
        database.execSQL("CREATE INDEX idx_members_status ON members(status)")
        database.execSQL("CREATE INDEX idx_members_name ON members(lastName, firstName)")
        
        // Step 9: Cleanup
        database.execSQL("DROP TABLE member_id_mapping")
        // Note: new_member_registrations retained for audit trail
    }
}
```

### 4.2 Laptop SQLite Migration

```typescript
// laptop/src/database/migrations/trial-member-migration.ts

export async function migrateToTrialMembers(db: Database): Promise<void> {
  await db.exec('BEGIN TRANSACTION');
  
  try {
    // Add new columns to members table
    await db.exec(`
      ALTER TABLE members ADD COLUMN internalId TEXT;
      ALTER TABLE members ADD COLUMN memberType TEXT DEFAULT 'FULL';
    `);
    
    // Generate internalIds for existing members
    const members = await db.all('SELECT membershipId FROM members');
    for (const member of members) {
      const internalId = crypto.randomUUID();
      await db.run(
        'UPDATE members SET internalId = ? WHERE membershipId = ?',
        [internalId, member.membershipId]
      );
    }
    
    // Make internalId primary key (requires table rebuild)
    await db.exec(`
      CREATE TABLE members_new AS SELECT * FROM members;
      DROP TABLE members;
      CREATE TABLE members (
        internalId TEXT PRIMARY KEY,
        membershipId TEXT UNIQUE,
        memberType TEXT NOT NULL DEFAULT 'FULL',
        -- ... all other columns
      );
      INSERT INTO members SELECT * FROM members_new;
      DROP TABLE members_new;
    `);
    
    // Migrate pending registrations
    await db.exec(`
      INSERT INTO members (internalId, memberType, firstName, lastName, ...)
      SELECT id, 'TRIAL', firstName, lastName, ...
      FROM new_member_registrations
      WHERE approvalStatus = 'PENDING';
    `);
    
    await db.exec('COMMIT');
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
}
```

---

## 5. API Changes

### 5.1 Updated Sync Payload

```typescript
interface SyncPayload {
  schemaVersion: string;  // Bump to "2.0.0"
  deviceId: string;
  timestamp: string;
  
  members: SyncableMember[];  // Now includes trial members
  checkIns: SyncableCheckIn[];
  practiceSessions: SyncablePracticeSession[];
  scanEvents: SyncableScanEvent[];
  
  // Photo data embedded for trial members
  photos: {
    internalId: string;
    base64Data: string;
    mimeType: string;
  }[];
}

interface SyncableMember {
  internalId: string;           // PRIMARY KEY
  membershipId: string | null;  // Nullable for trials
  memberType: 'TRIAL' | 'FULL';
  status: 'ACTIVE' | 'INACTIVE';
  
  // All personal fields...
  
  // Sync metadata
  deviceId: string;
  syncVersion: number;
  createdAtUtc: string;
  modifiedAtUtc: string;
  syncedAtUtc: string | null;
}
```

### 5.2 New Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `GET /api/members/trials` | GET | List trial members pending ID assignment |
| `PATCH /api/members/{internalId}/assign-id` | PATCH | Assign membershipId to trial member |
| `GET /api/members/duplicates` | GET | Get potential duplicate members |
| `POST /api/members/merge` | POST | Merge two member records |

### 5.3 Member Assignment Endpoint

```typescript
// PATCH /api/members/{internalId}/assign-id
interface AssignMemberIdRequest {
  membershipId: string;
}

interface AssignMemberIdResponse {
  success: boolean;
  member: Member;
  error?: string;  // e.g., "membershipId already exists"
}
```

### 5.4 Merge Endpoint

```typescript
// POST /api/members/merge
interface MergeMembersRequest {
  keepInternalId: string;     // Member to keep
  mergeInternalId: string;    // Member to merge and delete
}

interface MergeMembersResponse {
  success: boolean;
  mergedMember: Member;
  migratedRecords: {
    checkIns: number;
    practiceSessions: number;
    scanEvents: number;
  };
}
```

---

## 6. UI Changes

### 6.1 Tablet Changes

#### 6.1.1 Registration Flow

```
Current Flow:
  Registration Form → NewMemberRegistration → "Pending Approval" message

New Flow:
  Registration Form → Member (TRIAL) → "Prøvemedlem oprettet" message
                                     → Member can check in immediately
```

#### 6.1.2 Member List

- Add "Prøvemedlem" badge for `memberType = TRIAL`
- Show name prominently, hide sensitive data in list view
- Trial members searchable by name

#### 6.1.3 Check-in Screen

- Accept check-in by `internalId` (from QR) or name search
- Trial members show badge during check-in confirmation
- No restriction on trial member check-ins

### 6.2 Laptop Changes

#### 6.2.1 Trial Members View

New navigation item: "Prøvemedlemmer" (Trial Members)

| Column | Description |
|--------|-------------|
| Name | First + Last name |
| Registered | Date registered |
| Days Pending | Days since registration (yellow >30, red >90) |
| Device | Source device name |
| Sync Status | Synced / Pending |
| Actions | Edit, Assign ID, Delete |

#### 6.2.2 Assign Member ID Dialog

```
┌─────────────────────────────────────────────┐
│  Tildel medlemsnummer                       │
├─────────────────────────────────────────────┤
│                                             │
│  Prøvemedlem: [Navn Navnesen]               │
│  Registreret: [2026-01-15]                  │
│                                             │
│  Medlemsnummer: [____________]              │
│                                             │
│  ☐ Brug næste ledige nummer (2024-043)      │
│                                             │
│  [Annuller]              [Tildel & Aktiver] │
└─────────────────────────────────────────────┘
```

#### 6.2.3 Duplicate Detection View

```
┌─────────────────────────────────────────────────────────────┐
│  Mulige dubletter (3)                                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ⚠️ HIGH: Same phone number                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Jens Hansen (TRIAL)     vs    Jansen Hansen (FULL)  │   │
│  │ Phone: 12345678               Phone: 12345678       │   │
│  │ Registered: 2026-01-18        Member since: 2024    │   │
│  │                                                     │   │
│  │ [Sammenflet →]  [Behold begge]  [Vis detaljer]      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. Photo Handling

### 7.1 Storage Convention

| Platform | Photo Path |
|----------|------------|
| Android | `{app_internal}/member_photos/{internalId}.jpg` |
| Laptop | `{app_data}/photos/{internalId}.jpg` |

### 7.2 Photo Sync Flow

1. **Tablet captures photo** → Save to `member_photos/{internalId}.jpg`
2. **Sync triggered** → Read file, encode as base64, include in payload
3. **Laptop receives** → Decode base64, save to `photos/{internalId}.jpg`
4. **Laptop→Tablet sync** → If photo updated on laptop, include base64

### 7.3 Photo Compression

```kotlin
fun compressPhotoForSync(photoPath: String): String {
    val bitmap = BitmapFactory.decodeFile(photoPath)
    val scaled = Bitmap.createScaledBitmap(bitmap, 400, 400, true)
    val stream = ByteArrayOutputStream()
    scaled.compress(Bitmap.CompressFormat.JPEG, 80, stream)
    return Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)
}
```

---

## 8. Testing Strategy

### 8.1 Unit Tests

| Test | Description |
|------|-------------|
| `MemberCreationTest` | Trial member created with correct defaults |
| `UuidGenerationTest` | internalId is valid UUID v4 |
| `MemberTypeTransitionTest` | TRIAL → FULL when membershipId assigned |
| `SyncVersionTest` | syncVersion increments on update |
| `DuplicateDetectionTest` | Phone/email/name matching works |

### 8.2 Integration Tests

| Test | Description |
|------|-------------|
| `TabletRegistrationSyncTest` | Trial member syncs tablet → laptop |
| `LaptopIdAssignmentSyncTest` | ID assignment syncs laptop → tablet |
| `ConflictResolutionTest` | Higher syncVersion wins |
| `PhotoSyncTest` | Photo transfers correctly |
| `MigrationTest` | Existing data migrated without loss |

### 8.3 E2E Test Scenarios

1. **Happy Path**: Register on tablet → Sync to laptop → Assign ID → Sync back → Check in with ID
2. **Offline Tablet**: Register while offline → Connect → Verify sync completes
3. **Duplicate Scenario**: Register same person on two tablets → Detect on laptop → Merge
4. **Trial Check-in**: Register as trial → Check in before sync → Verify history preserved after ID assignment

---

## 9. Rollback Plan

### 9.1 Database Rollback

```kotlin
val MIGRATION_Y_X = object : Migration(Y, X) {
    override fun migrate(database: SupportSQLiteDatabase) {
        // Restore original schema
        // Move TRIAL members back to new_member_registrations
        // Remove internalId columns
    }
}
```

### 9.2 Feature Toggle

```kotlin
object FeatureFlags {
    val TRIAL_MEMBER_ENABLED = BuildConfig.ENABLE_TRIAL_MEMBERS
}

// In registration flow
if (FeatureFlags.TRIAL_MEMBER_ENABLED) {
    createTrialMember(formData)
} else {
    createNewMemberRegistration(formData)  // Legacy path
}
```

---

## 10. Gap Analysis - Additional Entities Requiring Migration

### 10.1 EquipmentCheckout Entity

**Current State:** Uses `membershipId` as foreign key to Member.

```kotlin
data class EquipmentCheckout(
    // ...
    val membershipId: String,  // ⚠️ PROBLEM: Trial members have no membershipId
    // ...
)
```

**Problem:** Trial members cannot check out equipment because they have no `membershipId`.

**Solution:** Add `internalMemberId` field, same pattern as CheckIn/PracticeSession.

```kotlin
@Entity(indices = [
    Index(value = ["equipmentId"]),
    Index(value = ["internalMemberId"]),  // NEW
    Index(value = ["checkedInAtUtc"]),
    Index(value = ["conflictStatus"])
])
data class EquipmentCheckout(
    @PrimaryKey val id: String,
    val equipmentId: String,
    val internalMemberId: String,  // NEW: FK to Member.internalId
    @Deprecated("Use internalMemberId")
    val membershipId: String? = null,  // DEPRECATED
    // ... rest unchanged
)
```

**Migration:** Same pattern as CheckIn - add column, populate via mapping table.

### 10.2 TransactionLine Entity (Laptop)

**Current State:** Uses `memberId` which implicitly refers to `membershipId`.

```typescript
export interface TransactionLine {
  id: string;
  transactionId: string;
  categoryId: string;
  amount: number;
  isIncome: boolean;
  memberId: string | null;  // ⚠️ AMBIGUOUS: Is this membershipId or internalId?
  lineDescription: string | null;
}
```

**Problem:** Per DD-8, trial members should be linkable to financial transactions. But `memberId` is unclear.

**Solution:** Rename to `internalMemberId` for consistency.

```typescript
export interface TransactionLine {
  id: string;
  transactionId: string;
  categoryId: string;
  amount: number;
  isIncome: boolean;
  internalMemberId: string | null;  // RENAMED: FK to Member.internalId
  lineDescription: string | null;
}
```

**Migration:** 

1. Add `internalMemberId` column
2. Populate from mapping table (old memberId → new internalId lookup)
3. Rename column or keep both during transition

### 10.3 Missing Entity: MemberForTabletSync

**Current State:** The `MemberForTabletSync` interface strips sensitive fields for tablet sync.

**Problem:** With trial members created on tablet, they have sensitive data. The design states DD-4 (accept trade-off) but the existing sync code may still strip fields.

**Solution:** Update `MemberForTabletSync` to include ALL member fields, or remove it entirely.

```typescript
// Option A: Remove MemberForTabletSync, use Member everywhere
// Option B: Keep but only filter for laptop→tablet direction on FULL members

// Recommended: Option A for simplicity
// All devices store all member data (per DD-4)
```

### 10.4 ScanEvent Entity Check

**Status:** Already mentioned in design, but verify membershipId index.

```kotlin
@Entity
data class ScanEvent(
    @PrimaryKey val id: String,
    val internalMemberId: String,  // ✅ Already in design
    @Deprecated("Use internalMemberId")
    val membershipId: String? = null,
    // ...
)
```

**Action:** Ensure index created on `internalMemberId`.

---

## 11. Additional Technical Gaps

### 11.1 Member Search/Lookup Logic

**Current:** Member lookup uses `membershipId` for barcode/QR scan.

**Problem:** Trial members have no `membershipId`. How do they check in?

**Solution Options:**

| Option | Implementation | UX |
|--------|----------------|-----|
| A. Name search only | Search by first+last name | Works but slower |
| B. QR with internalId | Generate QR containing internalId | Requires printing |
| C. Temporary numeric ID | Auto-assign temp ID like "T-001" | Clean but complex |

**Recommendation:** Option A (name search) for MVP, Option B as enhancement.

**Code Change:**

```kotlin
// MemberRepository.kt
suspend fun findMemberForCheckIn(query: String): Member? {
    // Try membershipId first (existing full members)
    memberDao.findByMembershipId(query)?.let { return it }
    
    // Try internalId (QR code scenario)
    memberDao.findByInternalId(query)?.let { return it }
    
    // Name search as fallback
    return null  // Let UI handle name search separately
}
```

### 11.2 Barcode Generation for Trial Members

**Gap:** Design mentions QR codes with internalId but doesn't specify format.

**Addition:**

```kotlin
// QR Code format for trial members
// Content: "MC:{internalId}"
// Example: "MC:550e8400-e29b-41d4-a716-446655440000"

fun generateMemberQrContent(member: Member): String {
    return if (member.membershipId != null) {
        member.membershipId  // Full members use membershipId
    } else {
        "MC:${member.internalId}"  // Trial members use prefixed internalId
    }
}

fun parseMemberQr(content: String): String {
    return if (content.startsWith("MC:")) {
        content.removePrefix("MC:")  // Returns internalId
    } else {
        content  // Returns membershipId
    }
}
```

### 11.3 Sync Payload Version Compatibility

**Gap:** Design mentions schema version bump but doesn't specify backward compatibility handling.

**Addition:**

```typescript
// Sync version negotiation
interface SyncHandshake {
  clientVersion: string;   // "2.0.0" for trial member support
  minSupportedVersion: string;  // "1.5.0" for older tablets
}

// Version handling logic
function canSync(clientVersion: string, serverVersion: string): boolean {
  // Major version must match
  // Minor version server >= client
  const [cMajor, cMinor] = clientVersion.split('.').map(Number);
  const [sMajor, sMinor] = serverVersion.split('.').map(Number);
  return cMajor === sMajor && sMinor >= cMinor;
}

// Upgrade prompt
if (!canSync(tabletVersion, laptopVersion)) {
  showUpgradeDialog("Please update tablet app to continue syncing");
}
```

### 11.4 Member Merge - History Reassignment

**Gap:** Design mentions merge but doesn't detail how history records are reassigned.

**Addition:**

```typescript
// MergeService.ts
async function mergeMembers(
  keepId: string, 
  mergeId: string
): Promise<MergeResult> {
  await db.transaction(async () => {
    // 1. Update all CheckIns
    await db.run(
      'UPDATE check_ins SET internalMemberId = ? WHERE internalMemberId = ?',
      [keepId, mergeId]
    );
    
    // 2. Update all PracticeSessions
    await db.run(
      'UPDATE practice_sessions SET internalMemberId = ? WHERE internalMemberId = ?',
      [keepId, mergeId]
    );
    
    // 3. Update all ScanEvents
    await db.run(
      'UPDATE scan_events SET internalMemberId = ? WHERE internalMemberId = ?',
      [keepId, mergeId]
    );
    
    // 4. Update all EquipmentCheckouts
    await db.run(
      'UPDATE equipment_checkouts SET internalMemberId = ? WHERE internalMemberId = ?',
      [keepId, mergeId]
    );
    
    // 5. Update all TransactionLines
    await db.run(
      'UPDATE transaction_lines SET internalMemberId = ? WHERE internalMemberId = ?',
      [keepId, mergeId]
    );
    
    // 6. Delete merged member (or mark as merged)
    await db.run(
      'UPDATE members SET status = ?, mergedIntoId = ? WHERE internalId = ?',
      ['MERGED', keepId, mergeId]
    );
  });
}
```

**New Field for Audit:**

```kotlin
data class Member(
    // ... existing fields ...
    val mergedIntoId: String? = null,  // If merged, points to surviving member
)
```

### 11.5 Trial Member Expiration Warning UI

**Gap:** DD-2 mentions 30/90 day warnings but design doesn't specify UI implementation.

**Addition:**

```typescript
// TrialMemberBadge.tsx
function getTrialBadgeVariant(member: Member): BadgeVariant {
  if (member.memberType !== 'TRIAL') return 'none';
  
  const daysSinceRegistration = daysBetween(member.createdAtUtc, now());
  
  if (daysSinceRegistration > 90) return 'error';      // Red
  if (daysSinceRegistration > 30) return 'warning';    // Yellow
  return 'info';  // Blue/neutral
}

// Dashboard widget
interface TrialMemberStats {
  total: number;
  under30Days: number;
  between30And90Days: number;
  over90Days: number;
}
```

### 11.6 Offline Registration Conflict

**Gap:** What if same person registers on two offline tablets simultaneously?

**Scenario:**

1. Tablet A (offline): Creates trial member "Hans Jensen" with internalId-A
2. Tablet B (offline): Creates trial member "Hans Jensen" with internalId-B  
3. Both sync to laptop → Two different trial members exist

**Solution:** Already covered by DD-7 (duplicate detection). But add explicit test case:

```typescript
// E2E Test: Concurrent Offline Registration
test('detects duplicates from offline registration', async () => {
  // 1. Create trial on tablet A (offline)
  const memberA = createTrialMember({ firstName: 'Hans', lastName: 'Jensen', phone: '12345678' });
  
  // 2. Create trial on tablet B (offline) - same person
  const memberB = createTrialMember({ firstName: 'Hans', lastName: 'Jensen', phone: '12345678' });
  
  // 3. Sync both to laptop
  await syncTablet('A');
  await syncTablet('B');
  
  // 4. Verify duplicate detected
  const duplicates = await getDuplicates();
  expect(duplicates).toContainEqual({
    member1: memberA,
    member2: memberB,
    matchType: 'PHONE',
    confidence: 'HIGH'
  });
});
```

---

## 12. Risk Additions

| Risk | Impact | Mitigation |
|------|--------|------------|
| Equipment checkout broken for trials | High | Add internalMemberId to EquipmentCheckout |
| Financial links broken for trials | Medium | Rename TransactionLine.memberId |
| Trial check-in UX confusion | Medium | Clear name search UI, future QR support |
| Merge loses history | High | Comprehensive FK update in merge logic |
| Sync version mismatch | Medium | Version negotiation protocol |

---

## 13. Revision History

| Date | Author | Changes |
|------|--------|---------|
| 2026-01-20 | sbalslev | Initial design document |
| 2026-01-20 | sbalslev | v1.1: Added Gap Analysis sections 10-12 covering EquipmentCheckout, TransactionLine, member search, QR codes, sync versioning, merge details, and warning UI |
| 2026-01-20 | sbalslev | v1.2: Added mergedIntoId field to Member entity (DD-10). Added note about MemberForTabletSync removal (DD-9). Current versions: Android DB v10→11, Sync schema 9.0.0→10.0.0. |

