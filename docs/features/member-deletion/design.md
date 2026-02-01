# Delete Inactive Member Feature

**Status:** Complete
**Implemented:** February 2026

## Overview

Allows permanent deletion of inactive members from the laptop (master) with cascade deletion of related data, sync to cloud, and appropriate safeguards.

## Requirements

1. **Only INACTIVE members can be deleted** (both TRIAL and FULL)
2. **Laptop-only operation** - laptop is the master
3. **Confirmation dialog** - shows what will be deleted before proceeding
4. **Cascade delete** - remove all related records
5. **Transaction exception** - members with transactions in the current year cannot be deleted
6. **Orphan transactions** - TransactionLine.memberId set to NULL (transactions preserved)
7. **Cloud sync** - deletion propagated to online database with retry support

## Database Tables Affected

### Cascade DELETE (removed with member):
| Table | FK Column |
|-------|-----------|
| CheckIn | internalMemberId |
| PracticeSession | internalMemberId |
| ScanEvent | internalMemberId |
| EquipmentCheckout | internalMemberId |
| MemberPreference | memberId |
| TrainerInfo | memberId |
| TrainerDiscipline | memberId |
| SKVRegistration | memberId |
| SKVWeapon | skvRegistrationId (via SKVRegistration) |
| PendingFeePayment | memberId |

### SET NULL (orphaned, not deleted):
| Table | FK Column |
|-------|-----------|
| TransactionLine | memberId |

## Implementation

### Files Modified

| File | Changes |
|------|---------|
| `laptop/src/database/financeRepository.ts` | Added transaction checking functions |
| `laptop/src/database/memberRepository.ts` | Added `getMemberDeletePreview()`, `deleteMemberPermanently()` |
| `laptop/src/database/onlineSyncService.ts` | Added `processPendingMemberDeletions()` for outbox processing |
| `laptop/src/database/syncOutboxRepository.ts` | Added `queueMemberDeletion()`, `MemberDeletionPayload` |
| `laptop/src/pages/MembersPage.tsx` | Added `DeleteMemberDialog`, delete button |

### Key Functions

#### `getMemberDeletePreview(internalId: string): MemberDeletePreview`
Returns counts of all related data that will be deleted, plus:
- `canDelete: boolean` - false if member is ACTIVE or has current-year transactions
- `blockingReason?: string` - Danish explanation if deletion is blocked

#### `deleteMemberPermanently(internalId: string): Promise<MemberDeleteResult>`
1. Validates member is INACTIVE with no current-year transactions
2. Collects all related entity IDs (for cloud sync)
3. Performs cascade delete in a transaction
4. Deletes photo files from disk
5. Queues deletion to sync outbox for cloud sync with retry

#### `processPendingMemberDeletions()`
Called during online sync to process queued member deletions:
- Retrieves pending DELETE operations from SyncOutbox
- Pushes to cloud API with all related entity IDs
- Marks as completed on success, records failure for retry on error
- Uses exponential backoff (up to 10 retries)

## UI Flow

1. User selects an INACTIVE member in MembersPage
2. Red "Slet medlem permanent" button appears
3. Click opens DeleteMemberDialog showing:
   - Member name, ID, status
   - Warning: "Denne handling kan ikke fortrydes"
   - List of data to be deleted with counts
   - If has current year transactions: error message, delete button disabled
   - If has transactions in previous years: note that they will be orphaned
4. User clicks "Slet permanent"
5. Deletion executes (with loading state)
6. Success toast, member removed from list
7. Cloud sync triggered via outbox (with retry support)

## Cloud Sync Details

### Push Flow
1. Local deletion completes
2. Deletion queued to `SyncOutbox` table with all related entity IDs
3. During next online sync, `processPendingMemberDeletions()` processes queue
4. Sends `_action: 'delete'` to PHP API for member and all related entities
5. On success, outbox entry marked as completed
6. On failure, retry scheduled with exponential backoff

### Pull Flow
When pulling from cloud, if a member deletion is detected:
- Checks if member still exists locally
- If member doesn't exist (we deleted it), skips adding to pending deletes
- If member exists (someone else deleted it), adds to pending deletes for user confirmation

### API Format
```json
{
  "device_id": "...",
  "batch_id": "uuid",
  "schema_version": "1.5.0",
  "entities": {
    "members": [{ "internal_id": "...", "_action": "delete" }],
    "checkIns": [{ "id": "...", "_action": "delete" }],
    ...
  }
}
```

## Validation Rules

1. **Status Check:** Only INACTIVE members can be deleted
2. **Transaction Check:** Members with TransactionLine entries in the current fiscal year cannot be deleted
3. **Orphan Warning:** Members with TransactionLine entries in previous years show a warning that transactions will be orphaned (memberId set to NULL)

## Testing

### Unit Tests
- `financeRepository.test.ts`: Transaction checking functions (4 tests)
- `memberRepository.test.ts`: Preview and deletion functions (4 tests)

### Manual Testing Checklist
- [ ] Delete inactive member with no related data
- [ ] Delete inactive member with check-ins, sessions, etc.
- [ ] Verify cannot delete active member
- [ ] Verify cannot delete member with current year transactions
- [ ] Verify cloud sync reflects deletion
- [ ] Verify transaction lines are orphaned (memberId = NULL)
- [ ] Verify retry works when offline during deletion
