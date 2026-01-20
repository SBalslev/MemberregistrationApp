# Photo Storage Optimization - Tasks

> **Design Document:** [design.md](design.md)
> **Created:** 2026-01-20
> **Completed:** 2026-01-20
> **Status:** ✅ COMPLETE

---

## Overview

Implement thumbnail + full photo storage to optimize member list performance while preserving full-quality photos for leaderboards and detail views.

**Key Changes:**
- Full photos stored on file system: `{userData}/photos/members/{internalId}.jpg`
- 150x150 thumbnails stored in database as data URLs
- Async processing with Sharp via IPC (main process)
- Migration runs on app startup for existing data URLs

---

## Phase 1: Dependencies & Schema

**Status:** ✅ Complete
**Progress:** 4/4 tasks

---

- [x] **1.1 Install Sharp dependency**
  - Add `sharp` to laptop/package.json
  - Run `npm install`
  - Verify Sharp works in Electron environment
  - Note: Sharp has native bindings, may need rebuild for Electron

- [x] **1.2 Add database columns**
  - Add `photoPath TEXT` column to Member table
  - Add `photoThumbnail TEXT` column to Member table
  - Update `db.ts` schema definition
  - Add migration in `ensureMigrations()`

- [x] **1.3 Update TypeScript types**
  - Update `Member` interface in `entities.ts`:
    - Add `photoPath: string | null`
    - Add `photoThumbnail: string | null`
  - Update `SyncableMember` in `electron.ts` if needed

- [x] **1.4 Create photos directory utility**
  - Create `laptop/src/utils/photoStorage.ts`
  - Function: `getPhotosDir()` - returns `{userData}/photos/members`
  - Function: `ensurePhotosDir()` - creates directory if needed
  - Function: `getPhotoPath(internalId)` - returns full path for member photo

---

## Phase 2: Photo Processing Service

**Status:** ✅ Complete
**Progress:** 0/4 tasks

---

- [x] **2.1 Create photo processing module**
  - Create `laptop/src/utils/photoProcessor.ts`
  - Import Sharp
  - Export async functions for photo operations

- [x] **2.2 Implement saveFullPhoto()**
  ```typescript
  async function saveFullPhoto(
    internalId: string,
    base64Data: string
  ): Promise<string>  // Returns file path
  ```
  - Decode base64 to buffer
  - Save to `photos/members/{internalId}.jpg`
  - Return saved file path

- [x] **2.3 Implement generateThumbnail()**
  ```typescript
  async function generateThumbnail(
    imagePath: string
  ): Promise<string>  // Returns data URL
  ```
  - Load image with Sharp
  - Resize to 150x150 with cover fit (center crop)
  - Output JPEG quality 75
  - Convert to base64 data URL
  - Return `data:image/jpeg;base64,{base64}`

- [x] **2.4 Implement processPhoto() combined function**
  ```typescript
  async function processPhoto(
    internalId: string,
    base64Data: string
  ): Promise<{ photoPath: string; photoThumbnail: string }>
  ```
  - Call saveFullPhoto()
  - Call generateThumbnail()
  - Return both results
  - Handle errors gracefully

---

## Phase 3: Sync Integration

**Status:** ✅ Complete
**Progress:** 0/3 tasks

---

- [x] **3.1 Update syncService.ts - processRegistration()**
  - When `photoBase64` is present:
    - Call `processPhoto()` asynchronously
    - Store `photoPath` and `photoThumbnail` in Member record
    - Remove data URL storage in `photoPath` column

- [x] **3.2 Update syncService.ts - processMember()**
  - When `photoBase64` is present:
    - Call `processPhoto()` asynchronously
    - Update `photoPath` and `photoThumbnail` columns
  - When updating existing member with new photo:
    - Overwrite existing file

- [x] **3.3 Handle async processing**
  - Option A: Process synchronously during sync (simpler)
  - Option B: Queue for background processing (better UX)
  - Decide based on Sharp performance testing
  - If async: update DB record after processing completes

---

## Phase 4: Repository & Query Updates

**Status:** ✅ Complete
**Progress:** 0/4 tasks

---

- [x] **4.1 Create MemberListItem type**
  - New type with only fields needed for list view:
    ```typescript
    interface MemberListItem {
      internalId: string;
      membershipId: string | null;
      firstName: string;
      lastName: string;
      memberLifecycleStage: 'TRIAL' | 'FULL';
      status: MemberStatus;
      photoThumbnail: string | null;
      createdAtUtc: string;
    }
    ```

- [x] **4.2 Add getMembersForList() function**
  - New function in `memberRepository.ts`
  - SELECT only list-view columns (no photoPath, no full data)
  - Returns `MemberListItem[]`

- [x] **4.3 Update deleteMember() function**
  - Delete photo file from file system when member is deleted
  - Use `fs.unlink()` or `fs.rm()`
  - Handle file not found gracefully

- [x] **4.4 Keep getAllMembers() for detail views**
  - Existing function still returns full Member
  - Used when loading member detail panel
  - No changes needed, but document usage

---

## Phase 5: UI Updates

**Status:** ✅ Complete
**Progress:** 0/4 tasks

---

- [x] **5.1 Update MembersPage list rendering**
  - Use `getMembersForList()` instead of `getAllMembers()`
  - Display `photoThumbnail` in list items
  - Load full member data only when selected

- [x] **5.2 Update MemberDetailPanel photo display**
  - Use `photoPath` for detail view (file:// URL)
  - Fallback to `photoThumbnail` if file missing
  - Show placeholder if no photo

- [x] **5.3 Update RegistrationsPage photo display**
  - Use `photoThumbnail` for list
  - Use `photoPath` for detail panel
  - Handle both data URLs and file paths

- [x] **5.4 Test photo display across app**
  - Member list thumbnails
  - Member detail full photo
  - Registration list/detail
  - Add/Edit member modals

---

## Phase 6: Migration

**Status:** ✅ Complete
**Progress:** 0/3 tasks

---

- [x] **6.1 Create migration function**
  ```typescript
  async function migratePhotosToFileSystem(): Promise<void>
  ```
  - Query all members with `registrationPhotoPath` containing `data:image`
  - For each: decode, save file, generate thumbnail
  - Update `photoPath` and `photoThumbnail` columns
  - Clear `registrationPhotoPath`

- [x] **6.2 Run migration on app startup**
  - Call migration after database initialization
  - Run only once (check if already migrated)
  - Log progress for debugging

- [x] **6.3 Drop registrationPhotoPath column**
  - After migration verified complete
  - Add schema migration to remove column
  - Update TypeScript types to remove field

---

## Phase 7: Testing & Cleanup

**Status:** ✅ Complete
**Progress:** 0/4 tasks

---

- [x] **7.1 Test sync with new tablet registration**
  - Register trial member on tablet with photo
  - Sync to laptop
  - Verify: full photo saved to file system
  - Verify: thumbnail generated and stored
  - Verify: displays correctly in UI

- [x] **7.2 Test member deletion**
  - Delete member with photo
  - Verify photo file is removed from file system

- [x] **7.3 Test photo update**
  - Sync member with updated photo
  - Verify file is overwritten
  - Verify thumbnail is regenerated

- [x] **7.4 Performance testing**
  - Load member list with 100+ members
  - Measure memory usage before/after optimization
  - Verify list scrolling is smooth

---

## Completion Criteria

- [x] Sharp installed and working in Electron
- [x] Full photos stored in `{userData}/photos/members/`
- [x] 150x150 thumbnails stored in database
- [x] Member list uses thumbnails only
- [x] Detail views show full-quality photos
- [x] Existing data URLs migrated
- [x] Photo files deleted with member
- [x] All tests passing

---

## Files to Modify

| File | Changes |
|------|---------|
| `laptop/package.json` | Add sharp dependency |
| `laptop/src/database/db.ts` | Add columns, migration |
| `laptop/src/types/entities.ts` | Add photoPath, photoThumbnail |
| `laptop/src/utils/photoStorage.ts` | New file - directory utilities |
| `laptop/src/utils/photoProcessor.ts` | New file - Sharp processing |
| `laptop/src/database/syncService.ts` | Integrate photo processing |
| `laptop/src/database/memberRepository.ts` | Add getMembersForList(), update delete |
| `laptop/src/pages/MembersPage.tsx` | Use thumbnails in list |
| `laptop/src/pages/RegistrationsPage.tsx` | Use thumbnails in list |

---

## Notes

- **Breaking change:** This is a clean migration, no backward compatibility with old data URLs
- **Sharp in Electron:** May need `electron-rebuild` after installing Sharp
- **Async processing:** Start with synchronous processing, optimize if needed
- **Error recovery:** If thumbnail generation fails, store null and retry on next sync
