# Enhanced Member Registration - Design Document

## Introduction/Overview

This feature enhances the new member registration workflow to ensure complete data capture on tablets and proper synchronization (including photos) to the laptop for approval. The feature clarifies the distinct workflows:

1. **Tablet Registration Flow**: Prospective members self-register on tablets → data syncs to laptop → admin approves → Member record created
2. **Laptop Direct Entry**: Admin creates an approved Member directly (for manual/offline registrations)

**Current State:**

- Tablets capture: name, email, phone, birthDate, guardianName/Phone/Email, photo (local file)
- Registration syncs to laptop but **photo file does not sync** (only path string)
- Admin must manually add: address, zipCode, city, gender during approval
- Photo must be recaptured or imported separately on laptop

**Proposed State:**

- Tablets capture ALL member data upfront including address and gender
- **Photo syncs as base64-encoded data** to laptop
- Approval workflow displays photo and all data
- Approved registration creates complete Member record with photo

**Problems Solved:**

- Photo not syncing (only file path transferred, which is meaningless on laptop)
- Incomplete data capture requiring manual admin entry
- Delayed data collection (address/gender added later)
- Inconsistent data quality

## Goals

1. **Sync photos from tablet to laptop** as part of registration data
2. Extend tablet registration to capture complete member address (address, zipCode, city)
3. Add gender selection to tablet registration
4. Laptop approval workflow displays photo and creates Member with photo
5. Store member photos on laptop (file system or database)
6. Maintain backward compatibility with existing registrations

## User Stories

**US-1: Photo Synchronization**

As a club administrator, I want to see the member's photo captured on the tablet when reviewing registrations on the laptop so that I can verify identity before approval.

**US-2: Complete Member Registration**

As a club staff member using the tablet, I want to capture a new member's full address and gender during registration so that the membership record is complete when approved.

**US-3: Approval with Photo**

As a club administrator approving registrations on the laptop, I want the member's photo to be automatically transferred to their Member record upon approval.

**US-4: Address Capture**

As a prospective member registering at the club, I want to enter my address during registration so that the club has accurate contact information.

## Functional Requirements

### FR-1: Photo Synchronization (NEW - Critical)

**FR-1.1** Tablet SHALL encode photo as base64 string when preparing sync payload.

**FR-1.2** NewMemberRegistration sync payload SHALL include `photoBase64` field containing encoded photo data.

**FR-1.3** Laptop SHALL decode and store photo when receiving registration sync.

**FR-1.4** Laptop SHALL store photos in local file system with predictable naming (e.g., `photos/registration_{id}.jpg`).

**FR-1.5** Registration approval UI SHALL display photo preview from stored file.

**FR-1.6** Upon approval, photo SHALL be copied/moved to member photos directory (e.g., `photos/members/{membershipId}.jpg`).

**FR-1.7** Member entity SHALL store photo path reference after approval.

**FR-1.8** Photo sync SHALL be optional - registrations without photos SHALL sync successfully.

**FR-1.9** Photo size SHOULD be limited (max 500KB base64, ~375KB raw) to prevent sync payload bloat.

### FR-2: NewMemberRegistration Entity Changes

**FR-2.1** NewMemberRegistration entity SHALL add `gender` field with values: Male, Female, Other, PreferNotToSay.

**FR-2.2** NewMemberRegistration entity SHALL add `address` field (nullable String, max 200 characters).

**FR-2.3** NewMemberRegistration entity SHALL add `zipCode` field (nullable String, max 10 characters).

**FR-2.4** NewMemberRegistration entity SHALL add `city` field (nullable String, max 100 characters).

**FR-2.5** NewMemberRegistration entity SHALL retain `photoPath` for local tablet storage.

**FR-2.6** Sync payload SHALL add `photoBase64` field (not stored in entity, computed during sync).

### FR-3: Tablet Registration UI

**FR-3.1** Registration form SHALL include address input section with fields: address, zipCode, city.

**FR-3.2** Registration form SHALL include gender selection (dropdown or radio buttons).

**FR-3.3** Address fields SHALL be optional (not required for registration).

**FR-3.4** Gender field SHALL be optional with "Prefer not to say" as valid selection.

**FR-3.5** Photo capture SHALL remain required (existing functionality).

**FR-3.6** Form layout SHALL remain scrollable to accommodate additional fields.

### FR-4: Sync Protocol

**FR-4.1** Sync payload for NewMemberRegistration SHALL include new fields (gender, address, zipCode, city, photoBase64).

**FR-4.2** Tablet sync logic SHALL read photo file and encode to base64 before sending.

**FR-4.3** Laptop sync receive logic SHALL decode base64 and save photo file.

**FR-4.4** Sync protocol SHALL handle null values for new fields (backward compatibility).

**FR-4.5** Schema version SHALL increment to indicate new field availability.

**FR-4.6** Large payloads (due to photo) SHALL be handled without timeout (consider chunking for future if needed).

### FR-5: Laptop Registration Queue UI

**FR-5.1** Registration queue page SHALL list all pending NewMemberRegistration records.

**FR-5.2** Each registration entry SHALL show: photo thumbnail, name, registration date, status.

**FR-5.3** Clicking a registration SHALL open approval dialog with full details.

**FR-5.4** Approval dialog SHALL display:

- Large photo preview
- All registration fields (name, gender, birthDate, contact, address, guardian if applicable)
- Editable fields for admin corrections

**FR-5.5** Approval dialog SHALL have actions:

- "Approve & Create Member" - Creates Member record with all data including photo
- "Reject" - Marks registration as rejected with optional reason

### FR-6: Member Creation from Approval

**FR-6.1** Upon approval, system SHALL generate membershipId if not provided.

**FR-6.2** System SHALL copy photo to member photos directory.

**FR-6.3** System SHALL create Member record with all fields from registration.

**FR-6.4** System SHALL update NewMemberRegistration with approvalStatus=Approved and createdMemberId.

**FR-6.5** Member record SHALL include `photoPath` pointing to member's photo file.

**FR-6.6** Member entity on laptop SHALL add `photoPath` field (nullable String).

## Non-Functional Requirements

### NFR-1: Performance

**NFR-1.1** Photo encoding/decoding SHALL NOT block UI (use background thread on tablet).

**NFR-1.2** Sync with photo SHALL complete within 30 seconds on local network.

**NFR-1.3** Photo compression to JPEG quality 80 to reduce size.

### NFR-2: Storage

**NFR-2.1** Photos stored in app data directory, not synced to cloud.

**NFR-2.2** Registration photos retained until approval/rejection decision.

**NFR-2.3** Rejected registration photos MAY be deleted after 30 days (future cleanup).

### NFR-3: Backward Compatibility

**NFR-3.1** Existing registrations without new fields SHALL continue to sync and be processable.

**NFR-3.2** Registrations without photoBase64 SHALL be accepted (photo displays as "No photo").

## Data Model Changes

### Android Entity: NewMemberRegistration (Updated)

```kotlin
@Entity
data class NewMemberRegistration(
    @PrimaryKey val id: String,
    val temporaryId: String,
    val createdAtUtc: Instant,
    
    // Photo - stored locally, synced as base64
    val photoPath: String,  // Local file path on tablet
    
    // Personal info
    val firstName: String,
    val lastName: String,
    val gender: Gender? = null,           // NEW
    val birthDate: String? = null,
    
    // Contact info
    val email: String? = null,
    val phone: String? = null,
    
    // Address - NEW
    val address: String? = null,
    val zipCode: String? = null,
    val city: String? = null,
    
    // Guardian (for under-18)
    val guardianName: String? = null,
    val guardianPhone: String? = null,
    val guardianEmail: String? = null,
    
    // Approval workflow
    val approvalStatus: ApprovalStatus = ApprovalStatus.PENDING,
    val approvedAtUtc: Instant? = null,
    val rejectedAtUtc: Instant? = null,
    val rejectionReason: String? = null,
    val createdMemberId: String? = null,
    
    // Sync metadata
    val deviceId: String? = null,
    val syncVersion: Long = 0,
    val syncedAtUtc: Instant? = null
)

enum class Gender {
    MALE, FEMALE, OTHER, PREFER_NOT_TO_SAY
}
```

### Sync Payload for NewMemberRegistration

```kotlin
// Tablet side - when sending
data class SyncableNewMemberRegistration(
    // All entity fields...
    val photoBase64: String? = null  // Encoded photo data (not in Room entity)
)

// Conversion function
fun NewMemberRegistration.toSyncable(): SyncableNewMemberRegistration {
    val photoBytes = File(photoPath).readBytes()
    val photoBase64 = Base64.encodeToString(photoBytes, Base64.NO_WRAP)
    return SyncableNewMemberRegistration(
        // copy all fields...
        photoBase64 = photoBase64
    )
}
```

### Laptop Entity: NewMemberRegistration (TypeScript)

```typescript
export interface NewMemberRegistration {
  id: string;
  temporaryId: string;
  createdAtUtc: string;
  
  // Photo - stored locally after sync
  photoPath: string;  // Local file path on laptop (after saving decoded photo)
  
  // Personal info
  firstName: string;
  lastName: string;
  gender?: Gender;
  birthDate?: string;
  
  // Contact
  email?: string;
  phone?: string;
  
  // Address
  address?: string;
  zipCode?: string;
  city?: string;
  
  // Guardian
  guardianName?: string;
  guardianPhone?: string;
  guardianEmail?: string;
  
  // Approval workflow
  approvalStatus: ApprovalStatus;
  approvedAtUtc?: string;
  rejectedAtUtc?: string;
  rejectionReason?: string;
  createdMemberId?: string;
  
  // Sync metadata
  deviceId?: string;
  syncVersion: number;
  syncedAtUtc?: string;
}

// Sync payload includes base64 photo
export interface NewMemberRegistrationSyncPayload extends NewMemberRegistration {
  photoBase64?: string;  // Only in sync, not stored in DB
}
```

### Laptop Entity: Member (Add photoPath)

```typescript
export interface Member {
  membershipId: string;
  firstName: string;
  lastName: string;
  gender?: Gender;
  birthDate?: string;
  email?: string;
  phone?: string;
  address?: string;
  zipCode?: string;
  city?: string;
  guardianName?: string;
  guardianPhone?: string;
  guardianEmail?: string;
  status: MemberStatus;
  expiresOn?: string;
  photoPath?: string;  // NEW - path to member photo
  registrationId?: string;  // Link to original registration
  // ... sync metadata
}
```

## Technical Considerations

### Photo Storage Strategy

**Tablet:**

- Photos stored in app-private directory: `/data/data/com.club.medlems/files/photos/`
- File naming: `registration_{id}.jpg`
- JPEG compression quality 80

**Laptop (Electron):**

- Photos stored in app data: `{userData}/photos/`
  - Registration photos: `{userData}/photos/registrations/{id}.jpg`
  - Member photos: `{userData}/photos/members/{membershipId}.jpg`
- Use Electron's `app.getPath('userData')` for cross-platform path

**Photo Encoding/Decoding:**

```javascript
// Laptop - receiving photo
function saveRegistrationPhoto(registrationId: string, base64Data: string): string {
  const buffer = Buffer.from(base64Data, 'base64');
  const photoDir = path.join(app.getPath('userData'), 'photos', 'registrations');
  fs.mkdirSync(photoDir, { recursive: true });
  const photoPath = path.join(photoDir, `${registrationId}.jpg`);
  fs.writeFileSync(photoPath, buffer);
  return photoPath;
}

// On approval - copy to members
function copyPhotoToMember(registrationPhotoPath: string, membershipId: string): string {
  const memberPhotoDir = path.join(app.getPath('userData'), 'photos', 'members');
  fs.mkdirSync(memberPhotoDir, { recursive: true });
  const memberPhotoPath = path.join(memberPhotoDir, `${membershipId}.jpg`);
  fs.copyFileSync(registrationPhotoPath, memberPhotoPath);
  return memberPhotoPath;
}
```

### Sync Flow

```
TABLET                                    LAPTOP
   |                                         |
   | 1. User takes photo                     |
   | 2. Photo saved locally                  |
   | 3. User fills registration form         |
   | 4. NewMemberRegistration created        |
   |                                         |
   | ========== SYNC PUSH ==================>|
   | 5. Read photo file                      |
   | 6. Encode to base64                     |
   | 7. Include in sync payload              |
   |                                         | 8. Receive payload
   |                                         | 9. Decode base64
   |                                         | 10. Save photo file
   |                                         | 11. Store registration with local photoPath
   |                                         |
   |                                         | 12. Admin reviews in UI (sees photo)
   |                                         | 13. Admin approves
   |                                         | 14. Copy photo to members/
   |                                         | 15. Create Member with photoPath
   |                                         |
```

## Out of Scope

1. Photo editing/cropping on tablet (future enhancement)
2. Multiple photos per registration
3. Photo sync from laptop back to tablets (members don't need photos on tablets)
4. Cloud backup of photos

## Dependencies

- Distributed Membership System feature (existing sync infrastructure)
- Existing photo capture on tablet (already implemented)
- Electron file system access (Node.js fs module)

## Migration

1. Existing NewMemberRegistration records without new fields will have null values
2. Existing registrations without synced photos will show "No photo" in approval UI
3. No data loss - new fields are all nullable

## Success Metrics

1. Photos successfully sync from tablet to laptop (visible in approval UI)
2. Approved members have photos in their profile
3. New fields (gender, address) captured and synced
4. No regression in existing registration functionality
