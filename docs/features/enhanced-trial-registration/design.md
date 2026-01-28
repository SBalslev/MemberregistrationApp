# Enhanced Trial Registration - Technical Design

**Feature:** Enhanced Trial Registration with Age Validation & ID Capture
**Version:** 1.0
**Status:** Draft
**Created:** 2026-01-27

---

## 1. Overview

This document provides the technical design for enhancing the trial member registration flow with:
1. Age validation and adult detection
2. ID photo capture for adults
3. Photo review/retake flow
4. Trainer photo management
5. Assisted check-in
6. Automatic ID photo deletion

---

## 2. Architecture Changes

### 2.1 Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           MEMBER REGISTRATION                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Member App                                                                 │
│  ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐      │
│  │ Personal│ → │ Profile │ → │ Review  │ → │ ID Cap  │ → │ ID Rev  │ → Complete
│  │  Info   │   │ Photo   │   │ Accept? │   │ (Adult) │   │ Accept? │      │
│  └─────────┘   └─────────┘   └─────────┘   └─────────┘   └─────────┘      │
│                                  ↓ Retake        ↓ Skip if minor            │
│                              Back to camera   Continue to complete          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ Sync
┌─────────────────────────────────────────────────────────────────────────────┐
│                              TRAINER APP                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐      │
│  │ Trial Members    │ →  │ Member Detail    │ →  │ Retake Photo/ID  │      │
│  │ List (7 days)    │    │ (Photo + ID)     │    │                  │      │
│  └──────────────────┘    └──────────────────┘    └──────────────────┘      │
│                                                                             │
│  ┌──────────────────┐    ┌──────────────────┐                              │
│  │ Assisted         │ →  │ Practice Session │                              │
│  │ Check-in         │    │ (Optional)       │                              │
│  └──────────────────┘    └──────────────────┘                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ Sync
┌─────────────────────────────────────────────────────────────────────────────┐
│                              LAPTOP ADMIN                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐      │
│  │ Trial Members    │ →  │ View Photos      │ →  │ Assign Member ID │      │
│  │ + ID Status      │    │ (Profile + ID)   │    │                  │      │
│  └──────────────────┘    └──────────────────┘    └────────┬─────────┘      │
│                                                           │                 │
│                          ┌────────────────────────────────┴───┐            │
│                          ▼                                    ▼            │
│                   ┌──────────────┐                  ┌──────────────┐       │
│                   │ Fee Payment  │                  │ ID Photo     │       │
│                   │ Recorded     │────────────────→ │ Deletion     │       │
│                   └──────────────┘  Both conditions │ (Automatic)  │       │
│                                     met             └──────────────┘       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ Sync
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ONLINE DATABASE                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  members table:                                                             │
│  - id_photo_path, id_photo_thumbnail, id_photo_data (MEDIUMBLOB)           │
│  - Set to NULL when ID photo deleted                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Registration Flow State Machine

```
                    ┌──────────────────────────────────┐
                    │           START                  │
                    └─────────────┬────────────────────┘
                                  ▼
                    ┌──────────────────────────────────┐
                    │     PERSONAL_INFO                │
                    │  (name, birthDate*, contact)     │
                    └─────────────┬────────────────────┘
                                  │ Valid birth date required
                                  ▼
                    ┌──────────────────────────────────┐
                    │     PROFILE_PHOTO_CAPTURE        │
                    │  (front camera)                  │
                    └─────────────┬────────────────────┘
                                  │ Photo captured
                                  ▼
                    ┌──────────────────────────────────┐
                    │     PROFILE_PHOTO_REVIEW         │◄────────┐
                    │  [Accept] [Retake]               │         │
                    └─────────────┬────────────────────┘         │
                        Accept    │         │ Retake             │
                                  │         └────────────────────┘
                                  ▼
                    ┌──────────────────────────────────┐
                    │     CHECK_ADULT_STATUS           │
                    │  age >= 18 ?                     │
                    └─────────────┬────────────────────┘
                        Yes │           │ No (minor)
                            ▼           │
         ┌──────────────────────────────┤
         │  ID_PHOTO_CAPTURE            │
         │  (rear camera)               │
         └─────────────┬────────────────┘
                       │ Photo captured
                       ▼
         ┌──────────────────────────────┐
         │  ID_PHOTO_REVIEW             │◄────────┐
         │  [Accept] [Retake]           │         │
         └─────────────┬────────────────┘         │
             Accept    │         │ Retake         │
                       │         └────────────────┘
                       ▼
                    ┌──────────────────────────────────┐
                    │     GUARDIAN_INFO (if minor)     │◄────────────────────┐
                    │     or COMPLETE (if adult)       │                     │
                    └─────────────┬────────────────────┘                     │
                                  │                                          │
                                  ▼                                          │
                    ┌──────────────────────────────────┐                     │
                    │     REGISTRATION_COMPLETE        │─────────────────────┘
                    │  Trial member created            │   (minor path)
                    └──────────────────────────────────┘
```

---

## 3. Data Model Details

### 3.1 Member Entity Changes

#### Android (Kotlin)

```kotlin
@Entity(
    tableName = "members",
    indices = [
        Index(value = ["membershipId"], unique = true),
        Index(value = ["memberLifecycleStage"]),
        Index(value = ["status"])
    ]
)
data class Member(
    @PrimaryKey
    val internalId: String,

    val membershipId: String? = null,
    val memberLifecycleStage: MemberLifecycleStage = MemberLifecycleStage.TRIAL,
    val status: MemberStatus = MemberStatus.ACTIVE,

    // Personal info
    val firstName: String,
    val lastName: String,
    val birthDate: String? = null,  // ISO format: YYYY-MM-DD
    val gender: String? = null,

    // Contact info
    val email: String? = null,
    val phone: String? = null,
    val address: String? = null,
    val zipCode: String? = null,
    val city: String? = null,

    // Guardian info (for minors)
    val guardianName: String? = null,
    val guardianPhone: String? = null,
    val guardianEmail: String? = null,

    // Profile photo
    val photoPath: String? = null,
    val photoThumbnail: String? = null,  // Data URL for lists

    // ID photo (NEW)
    val idPhotoPath: String? = null,
    val idPhotoThumbnail: String? = null,  // Data URL for lists

    // Membership
    val expiresOn: String? = null,
    val mergedIntoId: String? = null,

    // Sync metadata
    val syncVersion: Long = 0,
    val createdAtUtc: String,
    val updatedAtUtc: String,
    val syncedAtUtc: String? = null
) {
    /**
     * Calculate age from birth date.
     * Returns null if birth date is not set or invalid.
     */
    fun calculateAge(): Int? {
        return birthDate?.let { bd ->
            try {
                val birth = LocalDate.parse(bd)
                val today = LocalDate.now()
                Period.between(birth, today).years
            } catch (e: Exception) {
                null
            }
        }
    }

    /**
     * Check if member is an adult (age >= 18).
     * Returns false if age cannot be determined.
     */
    val isAdult: Boolean
        get() = calculateAge()?.let { it >= 18 } ?: false

    /**
     * Check if ID photo is required (adult without ID photo).
     */
    val needsIdPhoto: Boolean
        get() = isAdult && idPhotoPath == null
}

enum class MemberLifecycleStage {
    TRIAL,  // No membershipId assigned yet
    FULL    // Has membershipId
}

enum class MemberStatus {
    ACTIVE,
    INACTIVE
}
```

#### TypeScript (Laptop)

```typescript
export interface Member {
  internalId: string;
  membershipId: string | null;
  memberLifecycleStage: 'TRIAL' | 'FULL';
  status: 'ACTIVE' | 'INACTIVE';

  // Personal info
  firstName: string;
  lastName: string;
  birthday: string | null;  // ISO format: YYYY-MM-DD
  gender: 'MALE' | 'FEMALE' | 'OTHER' | 'PREFER_NOT_TO_SAY' | null;

  // Contact info
  email: string | null;
  phone: string | null;
  address: string | null;
  zipCode: string | null;
  city: string | null;

  // Guardian info
  guardianName: string | null;
  guardianPhone: string | null;
  guardianEmail: string | null;

  // Profile photo
  photoPath: string | null;
  photoThumbnail: string | null;

  // ID photo (NEW)
  idPhotoPath: string | null;
  idPhotoThumbnail: string | null;

  // Membership
  expiresOn: string | null;
  mergedIntoId: string | null;

  // Sync metadata
  syncVersion: number;
  createdAtUtc: string;
  updatedAtUtc: string;
  syncedAtUtc: string | null;
}

// Utility functions
export function calculateAge(birthday: string | null): number | null {
  if (!birthday) return null;
  const birth = new Date(birthday);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

export function isAdult(member: Member): boolean {
  const age = calculateAge(member.birthday);
  return age !== null && age >= 18;
}

export function needsIdPhoto(member: Member): boolean {
  return isAdult(member) && !member.idPhotoPath;
}

export type IdPhotoStatus = 'available' | 'pending' | 'not_required';

export function getIdPhotoStatus(member: Member): IdPhotoStatus {
  if (!isAdult(member)) return 'not_required';
  if (member.idPhotoPath) return 'available';
  return 'pending';
}
```

### 3.2 Database Schema Changes

#### Laptop SQLite Migration

```typescript
// In db.ts - schema version increment
const SCHEMA_VERSION = 10;  // Was 9, now 10

// Migration for version 10
function migrateToVersion10(db: Database) {
  db.run(`
    ALTER TABLE members
    ADD COLUMN id_photo_path TEXT DEFAULT NULL
  `);

  db.run(`
    ALTER TABLE members
    ADD COLUMN id_photo_thumbnail TEXT DEFAULT NULL
  `);
}
```

#### Online MySQL Migration (V1_5_0)

```sql
-- V1_5_0__add_id_photo_fields.sql
-- Migration: Add ID photo support for adult verification

-- Add ID photo columns to members table
ALTER TABLE members
  ADD COLUMN id_photo_path VARCHAR(500) NULL COMMENT 'Path to ID photo file',
  ADD COLUMN id_photo_thumbnail MEDIUMTEXT NULL COMMENT 'ID photo thumbnail as data URL',
  ADD COLUMN id_photo_data MEDIUMBLOB NULL COMMENT 'ID photo binary data';

-- Add index for queries filtering by ID photo presence
CREATE INDEX idx_members_id_photo ON members(id_photo_path(100));

-- Add audit log entry type for ID photo deletion
-- (Using existing audit infrastructure)
INSERT INTO _audit_event_types (event_type, description)
VALUES ('ID_PHOTO_DELETED', 'ID photo was deleted after member onboarding')
ON DUPLICATE KEY UPDATE description = VALUES(description);

-- Update schema version
UPDATE _schema_metadata SET version = '1.5.0', updated_at = NOW()
WHERE version = '1.4.2';
```

---

## 4. Age Validation Implementation

### 4.1 Validation Rules

```kotlin
object BirthDateValidator {

    data class ValidationResult(
        val isValid: Boolean,
        val errorMessage: String? = null,
        val parsedDate: LocalDate? = null
    )

    fun validate(input: String): ValidationResult {
        // Rule 1: Parse the date
        val date = parseDate(input)
            ?: return ValidationResult(false, "Ugyldig datoformat. Brug DD-MM-ÅÅÅÅ eller ÅÅÅÅ-MM-DD")

        val today = LocalDate.now()

        // Rule 2: Cannot be in the future
        if (date.isAfter(today)) {
            return ValidationResult(false, "Fødselsdato kan ikke være i fremtiden")
        }

        // Rule 3: Cannot be more than 120 years ago
        val maxAge = 120
        val oldestAllowed = today.minusYears(maxAge.toLong())
        if (date.isBefore(oldestAllowed)) {
            return ValidationResult(false, "Fødselsdato kan ikke være mere end $maxAge år siden")
        }

        // Rule 4: Must be a real date (handled by parseDate)

        return ValidationResult(true, null, date)
    }

    private fun parseDate(input: String): LocalDate? {
        val formats = listOf(
            DateTimeFormatter.ISO_LOCAL_DATE,              // YYYY-MM-DD
            DateTimeFormatter.ofPattern("dd-MM-yyyy"),     // DD-MM-YYYY
            DateTimeFormatter.ofPattern("dd/MM/yyyy"),     // DD/MM/YYYY
            DateTimeFormatter.ofPattern("d-M-yyyy"),       // D-M-YYYY
            DateTimeFormatter.ofPattern("d/M/yyyy")        // D/M/YYYY
        )

        for (formatter in formats) {
            try {
                return LocalDate.parse(input.trim(), formatter)
            } catch (e: DateTimeParseException) {
                continue
            }
        }
        return null
    }
}
```

### 4.2 Age Calculation

```kotlin
object AgeCalculator {

    fun calculateAge(birthDate: LocalDate, referenceDate: LocalDate = LocalDate.now()): Int {
        return Period.between(birthDate, referenceDate).years
    }

    fun isAdult(birthDate: LocalDate, adultAge: Int = 18): Boolean {
        return calculateAge(birthDate) >= adultAge
    }

    fun isAdult(birthDateString: String?, adultAge: Int = 18): Boolean {
        if (birthDateString == null) return false
        return try {
            val date = LocalDate.parse(birthDateString)
            isAdult(date, adultAge)
        } catch (e: Exception) {
            false
        }
    }
}
```

---

## 5. Photo Capture Implementation

### 5.1 Photo File Naming Convention

```kotlin
object PhotoFileNaming {
    private const val PHOTO_DIR = "member_photos"

    /**
     * Get the file path for a member's profile photo.
     * Format: {appDir}/member_photos/{internalId}.jpg
     */
    fun getProfilePhotoPath(context: Context, internalId: String): File {
        val dir = File(context.getExternalFilesDir(null), PHOTO_DIR)
        dir.mkdirs()
        return File(dir, "${internalId}.jpg")
    }

    /**
     * Get the file path for a member's ID photo.
     * Format: {appDir}/member_photos/{internalId}_id.jpg
     */
    fun getIdPhotoPath(context: Context, internalId: String): File {
        val dir = File(context.getExternalFilesDir(null), PHOTO_DIR)
        dir.mkdirs()
        return File(dir, "${internalId}_id.jpg")
    }

    /**
     * Get the temporary file path for photo capture.
     * Format: {cacheDir}/temp_capture.jpg
     */
    fun getTempCapturePath(context: Context): File {
        return File(context.cacheDir, "temp_capture.jpg")
    }
}
```

### 5.2 Camera Selection

```kotlin
enum class CameraFacing {
    FRONT,  // For profile photos (selfie)
    BACK    // For ID photos (document capture)
}

// In camera setup
fun setupCamera(facing: CameraFacing) {
    val cameraSelector = when (facing) {
        CameraFacing.FRONT -> CameraSelector.DEFAULT_FRONT_CAMERA
        CameraFacing.BACK -> CameraSelector.DEFAULT_BACK_CAMERA
    }
    // ... camera setup code
}
```

### 5.3 Photo Review Screen

```kotlin
@Composable
fun PhotoReviewScreen(
    photoFile: File,
    title: String,
    instructions: String,
    onAccept: () -> Unit,
    onRetake: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.headlineMedium,
            modifier = Modifier.padding(bottom = 16.dp)
        )

        Text(
            text = instructions,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(bottom = 24.dp)
        )

        // Photo preview
        AsyncImage(
            model = photoFile,
            contentDescription = "Captured photo",
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .clip(RoundedCornerShape(8.dp)),
            contentScale = ContentScale.Fit
        )

        Spacer(modifier = Modifier.height(24.dp))

        // Action buttons
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            OutlinedButton(
                onClick = onRetake,
                modifier = Modifier.weight(1f)
            ) {
                Icon(Icons.Default.Refresh, contentDescription = null)
                Spacer(modifier = Modifier.width(8.dp))
                Text("Tag igen")
            }

            Button(
                onClick = onAccept,
                modifier = Modifier.weight(1f)
            ) {
                Icon(Icons.Default.Check, contentDescription = null)
                Spacer(modifier = Modifier.width(8.dp))
                Text("Acceptér")
            }
        }
    }
}
```

---

## 6. ID Photo Deletion Logic

### 6.1 Deletion Conditions

```typescript
// In idPhotoLifecycleService.ts

interface DeletionCheckResult {
  shouldDelete: boolean;
  reason?: string;
}

export function checkIdPhotoDeletion(
  member: Member,
  currentFiscalYear: number,
  paidFeeAmount: number,
  expectedFeeAmount: number
): DeletionCheckResult {
  // Condition 1: Must have membershipId assigned
  if (!member.membershipId) {
    return { shouldDelete: false, reason: 'No membershipId assigned' };
  }

  // Condition 2: Must have ID photo to delete
  if (!member.idPhotoPath) {
    return { shouldDelete: false, reason: 'No ID photo to delete' };
  }

  // Condition 3: Annual fee must be paid in full
  if (paidFeeAmount < expectedFeeAmount) {
    return {
      shouldDelete: false,
      reason: `Fee not fully paid (${paidFeeAmount}/${expectedFeeAmount})`
    };
  }

  return {
    shouldDelete: true,
    reason: 'MembershipId assigned and fee paid in full'
  };
}
```

### 6.2 Deletion Execution

```typescript
// In idPhotoLifecycleService.ts

export async function deleteIdPhoto(
  member: Member,
  reason: string,
  db: Database
): Promise<void> {
  // 1. Delete file from filesystem
  if (member.idPhotoPath) {
    const photoPath = getFullPhotoPath(member.idPhotoPath);
    if (fs.existsSync(photoPath)) {
      fs.unlinkSync(photoPath);
    }
  }

  // 2. Update member record
  const now = new Date().toISOString();
  db.run(`
    UPDATE members
    SET id_photo_path = NULL,
        id_photo_thumbnail = NULL,
        updated_at_utc = ?,
        sync_version = sync_version + 1
    WHERE internal_id = ?
  `, [now, member.internalId]);

  // 3. Log deletion for audit
  db.run(`
    INSERT INTO audit_log (
      event_type,
      entity_type,
      entity_id,
      details,
      created_at_utc
    ) VALUES (?, ?, ?, ?, ?)
  `, [
    'ID_PHOTO_DELETED',
    'member',
    member.internalId,
    JSON.stringify({ reason, membershipId: member.membershipId }),
    now
  ]);
}
```

### 6.3 Trigger Points

```typescript
// 1. On membershipId assignment
export async function assignMembershipId(
  member: Member,
  membershipId: string
): Promise<void> {
  // ... assign membershipId logic ...

  // Check if ID photo should be deleted
  const feeStatus = await getMemberFeeStatus(member.internalId);
  const result = checkIdPhotoDeletion(
    { ...member, membershipId },
    feeStatus.fiscalYear,
    feeStatus.paidAmount,
    feeStatus.expectedAmount
  );

  if (result.shouldDelete) {
    await deleteIdPhoto(member, result.reason!, db);
  }
}

// 2. On fee payment recording
export async function recordFeePayment(
  memberId: string,
  amount: number,
  paymentMethod: 'CASH' | 'BANK'
): Promise<void> {
  // ... record payment logic ...

  // Check if ID photo should be deleted
  const member = await getMemberById(memberId);
  const feeStatus = await getMemberFeeStatus(memberId);
  const result = checkIdPhotoDeletion(
    member,
    feeStatus.fiscalYear,
    feeStatus.paidAmount,
    feeStatus.expectedAmount
  );

  if (result.shouldDelete) {
    await deleteIdPhoto(member, result.reason!, db);
  }
}

// 3. Scheduled daily check
export async function runDailyIdPhotoCleanup(): Promise<void> {
  const candidates = await findMembersWithIdPhoto();

  for (const member of candidates) {
    const feeStatus = await getMemberFeeStatus(member.internalId);
    const result = checkIdPhotoDeletion(
      member,
      feeStatus.fiscalYear,
      feeStatus.paidAmount,
      feeStatus.expectedAmount
    );

    if (result.shouldDelete) {
      await deleteIdPhoto(member, result.reason!, db);
    }
  }
}
```

---

## 7. Sync Protocol Changes

### 7.1 Sync Payload

```typescript
interface MemberSyncPayload {
  // ... existing fields ...

  // Profile photo
  photoPath: string | null;
  photoThumbnail: string | null;
  photoBase64?: string;  // Only during transfer

  // ID photo (NEW)
  idPhotoPath: string | null;
  idPhotoThumbnail: string | null;
  idPhotoBase64?: string;  // Only during transfer
}
```

### 7.2 Sync Send (Android)

```kotlin
suspend fun prepareMemberForSync(member: Member): MemberSyncPayload {
    val payload = member.toSyncPayload()

    // Encode profile photo
    member.photoPath?.let { path ->
        val file = File(path)
        if (file.exists()) {
            payload.photoBase64 = Base64.encodeToString(
                file.readBytes(),
                Base64.NO_WRAP
            )
        }
    }

    // Encode ID photo (NEW)
    member.idPhotoPath?.let { path ->
        val file = File(path)
        if (file.exists()) {
            payload.idPhotoBase64 = Base64.encodeToString(
                file.readBytes(),
                Base64.NO_WRAP
            )
        }
    }

    return payload
}
```

### 7.3 Sync Receive (Laptop)

```typescript
async function processMemberFromSync(
  payload: MemberSyncPayload
): Promise<void> {
  // Process profile photo
  if (payload.photoBase64) {
    const photoPath = await savePhotoFile(
      payload.internalId,
      payload.photoBase64,
      'profile'
    );
    payload.photoPath = photoPath;
    payload.photoThumbnail = await generateThumbnail(photoPath);
  }

  // Process ID photo (NEW)
  if (payload.idPhotoBase64) {
    const idPhotoPath = await savePhotoFile(
      payload.internalId,
      payload.idPhotoBase64,
      'id'
    );
    payload.idPhotoPath = idPhotoPath;
    payload.idPhotoThumbnail = await generateThumbnail(idPhotoPath);
  } else if (payload.idPhotoPath === null) {
    // ID photo was deleted - clean up local file
    const existingMember = await getMemberById(payload.internalId);
    if (existingMember?.idPhotoPath) {
      await deletePhotoFile(existingMember.idPhotoPath);
    }
  }

  // Save member record
  await saveMember(payload);
}
```

---

## 8. UI Components

### 8.1 ID Photo Status Badge (Laptop)

```tsx
type IdPhotoStatus = 'available' | 'pending' | 'not_required';

interface IdPhotoStatusBadgeProps {
  status: IdPhotoStatus;
}

export function IdPhotoStatusBadge({ status }: IdPhotoStatusBadgeProps) {
  const config = {
    available: {
      label: 'ID bekræftet',
      color: 'bg-green-100 text-green-800',
      icon: CheckCircle
    },
    pending: {
      label: 'ID mangler',
      color: 'bg-yellow-100 text-yellow-800',
      icon: AlertCircle
    },
    not_required: {
      label: 'Ikke påkrævet',
      color: 'bg-gray-100 text-gray-600',
      icon: MinusCircle
    }
  };

  const { label, color, icon: Icon } = config[status];

  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs ${color}`}>
      <Icon className="w-3 h-3 mr-1" />
      {label}
    </span>
  );
}
```

### 8.2 Member Photos Display (Laptop)

```tsx
interface MemberPhotosProps {
  member: Member;
  onPhotoClick?: (type: 'profile' | 'id') => void;
}

export function MemberPhotos({ member, onPhotoClick }: MemberPhotosProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Profile Photo */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-gray-700">Profilbillede</h4>
        {member.photoPath ? (
          <img
            src={getPhotoSrc(member.photoPath)}
            alt="Profil"
            className="w-full aspect-square object-cover rounded-lg cursor-pointer hover:opacity-90"
            onClick={() => onPhotoClick?.('profile')}
          />
        ) : (
          <div className="w-full aspect-square bg-gray-100 rounded-lg flex items-center justify-center">
            <UserIcon className="w-12 h-12 text-gray-400" />
          </div>
        )}
      </div>

      {/* ID Photo */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-gray-700">ID-bekræftelse</h4>
        {member.idPhotoPath ? (
          <img
            src={getPhotoSrc(member.idPhotoPath)}
            alt="ID"
            className="w-full aspect-square object-cover rounded-lg cursor-pointer hover:opacity-90"
            onClick={() => onPhotoClick?.('id')}
          />
        ) : isAdult(member) ? (
          <div className="w-full aspect-square bg-yellow-50 rounded-lg flex items-center justify-center border-2 border-dashed border-yellow-300">
            <div className="text-center p-4">
              <AlertCircle className="w-8 h-8 text-yellow-500 mx-auto mb-2" />
              <span className="text-sm text-yellow-700">ID mangler</span>
            </div>
          </div>
        ) : (
          <div className="w-full aspect-square bg-gray-50 rounded-lg flex items-center justify-center">
            <span className="text-sm text-gray-500">Ikke påkrævet</span>
          </div>
        )}
      </div>
    </div>
  );
}
```

---

## 9. Testing Strategy

### 9.1 Unit Tests

```kotlin
// BirthDateValidatorTest.kt
class BirthDateValidatorTest {

    @Test
    fun `valid date in ISO format`() {
        val result = BirthDateValidator.validate("2000-05-15")
        assertTrue(result.isValid)
        assertEquals(LocalDate.of(2000, 5, 15), result.parsedDate)
    }

    @Test
    fun `valid date in Danish format`() {
        val result = BirthDateValidator.validate("15-05-2000")
        assertTrue(result.isValid)
    }

    @Test
    fun `rejects future date`() {
        val futureDate = LocalDate.now().plusDays(1).toString()
        val result = BirthDateValidator.validate(futureDate)
        assertFalse(result.isValid)
        assertNotNull(result.errorMessage)
    }

    @Test
    fun `rejects date more than 120 years ago`() {
        val result = BirthDateValidator.validate("1800-01-01")
        assertFalse(result.isValid)
    }

    @Test
    fun `rejects invalid date like Feb 30`() {
        val result = BirthDateValidator.validate("2000-02-30")
        assertFalse(result.isValid)
    }
}

// AgeCalculatorTest.kt
class AgeCalculatorTest {

    @Test
    fun `calculates age correctly`() {
        val birthDate = LocalDate.now().minusYears(25)
        assertEquals(25, AgeCalculator.calculateAge(birthDate))
    }

    @Test
    fun `birthday today is exactly that age`() {
        val birthDate = LocalDate.now().minusYears(18)
        assertTrue(AgeCalculator.isAdult(birthDate))
    }

    @Test
    fun `day before 18th birthday is minor`() {
        val birthDate = LocalDate.now().minusYears(18).plusDays(1)
        assertFalse(AgeCalculator.isAdult(birthDate))
    }
}
```

### 9.2 Integration Tests

```typescript
// idPhotoDeletion.test.ts
describe('ID Photo Deletion', () => {
  it('deletes ID photo when membershipId assigned and fee paid', async () => {
    // Setup: Create trial member with ID photo
    const member = await createTrialMember({
      firstName: 'Test',
      birthday: '2000-01-01',
      idPhotoPath: '/photos/test_id.jpg'
    });

    // Record fee payment
    await recordFeePayment(member.internalId, 850, 'BANK');

    // Assign membershipId
    await assignMembershipId(member, '12345');

    // Verify ID photo deleted
    const updated = await getMemberById(member.internalId);
    expect(updated.idPhotoPath).toBeNull();
    expect(updated.membershipId).toBe('12345');
  });

  it('keeps ID photo if fee not fully paid', async () => {
    const member = await createTrialMember({
      firstName: 'Test',
      birthday: '2000-01-01',
      idPhotoPath: '/photos/test_id.jpg'
    });

    // Partial fee payment
    await recordFeePayment(member.internalId, 400, 'BANK');

    // Assign membershipId
    await assignMembershipId(member, '12345');

    // ID photo should still exist
    const updated = await getMemberById(member.internalId);
    expect(updated.idPhotoPath).toBe('/photos/test_id.jpg');
  });
});
```

---

## 10. Security Considerations

1. **ID Photo Access Control**
   - ID photos are only visible to trainers and admins
   - Member app can capture but not view ID photos
   - ID photos excluded from any public displays

2. **Data Minimization**
   - ID photos deleted as soon as not needed
   - Deletion is automatic and mandatory
   - No option to retain ID photos after onboarding

3. **Audit Trail**
   - All ID photo captures logged
   - All ID photo deletions logged with reason
   - Logs retained for compliance (2 years)

4. **Encryption**
   - ID photos encrypted at rest on mobile devices
   - HTTPS required for all sync transfers
   - Online database uses encrypted storage

---

## 11. Open Technical Decisions

| ID | Question | Proposed Answer | Status |
|----|----------|-----------------|--------|
| TD-1 | Should ID photo thumbnail be smaller than profile thumbnail? | Same size (150x150) for consistency | Proposed |
| TD-2 | Should we compress ID photos more aggressively? | No, readability is important | Proposed |
| TD-3 | Maximum time to keep ID photo if fee never paid? | No limit - manual admin cleanup | Proposed |
