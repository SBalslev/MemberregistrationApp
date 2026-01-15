# Enhanced Member Registration - Tasks

> **Design Document**: [design.md](design.md)
> **Created**: 2026-01-14
> **Last Updated**: 2026-01-14 by sbalslev

---

## Overview

This task list implements enhanced member registration including:

1. **Photo sync**: Transfer photo bytes from tablet to laptop (not just file path)
2. **Additional fields**: Capture gender, address, zipCode, city on tablet
3. **Approval workflow**: Display photo and complete data on laptop for approval
4. **Member photos**: Store photo with Member record upon approval

**Key Insight**: Tablets create `NewMemberRegistration` (unapproved). Laptop approves and creates `Member` record. The laptop "Add Member" button creates approved members directly (different workflow).

**Dependencies:**

- Distributed Membership System Phase 1 (sync infrastructure) - COMPLETE
- Laptop member fields (gender, address, zipCode, city) - COMPLETE

---

## Tasks

### Phase 1: Android Entity & Database Changes

**Status**: Not Started  
**Progress**: 0/5 tasks complete (0%)

---

- [ ] 1.1 Add Gender enum to Android Entities.kt
  - **Estimated Duration**: 15m
  - Add `enum class Gender { MALE, FEMALE, OTHER, PREFER_NOT_TO_SAY }`
  - Place with other enums at top of Entities.kt
  - Include KDoc documentation

- [ ] 1.2 Update NewMemberRegistration entity with new fields
  - **Estimated Duration**: 20m
  - Add `gender: Gender? = null` field
  - Add `address: String? = null` field (max 200 chars)
  - Add `zipCode: String? = null` field (max 10 chars)
  - Add `city: String? = null` field (max 100 chars)
  - Place fields logically (gender after lastName, address after phone)

- [ ] 1.3 Create Room database migration
  - **Estimated Duration**: 30m
  - Increment database version
  - Add migration adding 4 new columns to NewMemberRegistration table
  - Test migration with existing data
  - Reference: `app/src/main/java/.../data/local/AppDatabase.kt`

- [ ] 1.4 Update SyncableEntities for new fields
  - **Estimated Duration**: 15m
  - Update `SyncableNewMemberRegistration` wrapper in SyncableEntities.kt
  - Ensure gender serialized as string for cross-platform compatibility
  - Add address, zipCode, city to sync payload

- [ ] 1.5 Implement photo base64 encoding in sync payload
  - **Estimated Duration**: 30m
  - Read photo file from `photoPath` when creating sync payload
  - Compress image if > 500KB
  - Encode as base64 string
  - Add `photoData` and `photoMimeType` fields to sync payload
  - Reference: SyncableEntities.kt or sync service

---

### Phase 2: Android Registration UI

**Status**: Not Started  
**Progress**: 0/5 tasks complete (0%)

---

- [ ] 2.1 Identify and update registration form composable
  - **Estimated Duration**: 30m
  - Find existing registration form in UI layer
  - Understand current form layout and validation
  - Document form structure before making changes

- [ ] 2.2 Add gender selection field
  - **Estimated Duration**: 45m
  - Add dropdown/exposed menu for gender selection
  - Danish labels: Mand, Kvinde, Andet, Ønsker ikke at oplyse
  - Place after name fields, before birthdate
  - Optional field (nullable)

- [ ] 2.3 Add address input section
  - **Estimated Duration**: 45m
  - Add address line input (single line, max 200 chars)
  - Add zipCode input (number keyboard, max 10 chars)
  - Add city input (text, max 100 chars)
  - Danish labels: Adresse, Postnummer, By
  - Place after contact info, before guardian section

- [ ] 2.4 Update registration ViewModel
  - **Estimated Duration**: 30m
  - Add state properties for new fields
  - Update form submission to include new fields
  - Ensure validation (optional but validate format if provided)

- [ ] 2.5 Update registration repository/use case
  - **Estimated Duration**: 20m
  - Update NewMemberRegistration creation to include new fields
  - Ensure local save includes all new fields

---

### Phase 3: Laptop Sync & Approval UI

**Status**: Not Started  
**Progress**: 0/5 tasks complete (0%)

---

- [ ] 3.1 Update laptop NewMemberRegistration type
  - **Estimated Duration**: 15m
  - Update `laptop/src/types/entities.ts`
  - Add gender, address, zipCode, city fields to NewMemberRegistration interface
  - Ensure ApprovalStatus type exists

- [ ] 3.2 Update laptop database schema for NewMemberRegistration
  - **Estimated Duration**: 20m
  - Update `laptop/src/database/db.ts`
  - Add columns to NewMemberRegistration table
  - Increment schema version

- [ ] 3.3 Update sync server to handle new fields and photo
  - **Estimated Duration**: 45m
  - Update `laptop/electron/main.cjs` sync endpoints
  - Decode base64 `photoData` and save to `userData/photos/{registrationId}.jpg`
  - Store local photo path in NewMemberRegistration record
  - Ensure new fields received in push and sent in pull
  - Handle null values for backward compatibility

- [ ] 3.4 Create RegistrationsPage with approval UI
  - **Estimated Duration**: 2h
  - Create `laptop/src/pages/RegistrationsPage.tsx`
  - Display pending registrations with photo thumbnails
  - Create approval dialog showing full photo and all fields
  - Allow editing fields before approval
  - Implement approve action: create Member, copy photo to member-photos/
  - Implement reject action: mark as rejected with optional reason
  - Add navigation to RegistrationsPage from sidebar/dashboard

- [ ] 3.5 Add photoPath to Member entity
  - **Estimated Duration**: 15m
  - Update `laptop/src/types/entities.ts` - add photoPath to Member
  - Update `laptop/src/database/db.ts` - add photoPath column
  - Update `laptop/src/database/memberRepository.ts` - handle photoPath in upsert
  - Update MembersPage to display member photos

---

### Phase 4: Testing & Integration

**Status**: Not Started  
**Progress**: 0/3 tasks complete (0%)

---

- [ ] 4.1 End-to-end test: tablet registration with new fields
  - **Estimated Duration**: 30m
  - Register new member on tablet with all fields
  - Verify local storage includes new fields
  - Verify sync sends new fields

- [ ] 4.2 Test laptop receives new registration fields
  - **Estimated Duration**: 30m
  - Sync tablet registration to laptop
  - Verify new fields display in registration queue
  - Test approval workflow creates complete Member record

- [ ] 4.3 Backward compatibility test
  - **Estimated Duration**: 20m
  - Test older registration without new fields syncs correctly
  - Test laptop handles null values gracefully
  - Document any edge cases

---

## Completion Criteria

- [ ] All Phase 1-4 tasks complete
- [ ] Photo syncs from tablet to laptop as base64, stored as file
- [ ] Gender, address, zipCode, city captured on tablet
- [ ] RegistrationsPage shows pending registrations with photos
- [ ] Approval creates Member with photo and all fields
- [ ] Backward compatibility verified
- [ ] Documentation updated

---

## Notes

- Guardian fields already exist in NewMemberRegistration - no changes needed
- Member entity on laptop already has gender, address, zipCode, city, guardian fields (completed earlier)
- MemberForTabletSync filtering already excludes sensitive data (address, email, phone, guardian info, photos)
- Laptop "Add Member" button creates approved Members directly (different from tablet registration flow)
- Photo storage: `userData/photos/` for registrations, `userData/member-photos/` for approved members
