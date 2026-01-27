# Online Database Sync - Schema Changelog

This document tracks all schema changes to the online database and the corresponding sync protocol updates.

## Version History

### Version 1.4.2 (2026-01-27)

**Summary:** Added HONORARY member type for honorary members who don't pay fees.

**Changes:**

1. **Type Definitions (laptop/src/types/finance.ts, laptop/src/types/entities.ts):**
   - Added `'HONORARY'` to `MemberType` and `FeeCategoryType` union types
   - Added Danish label `'Æresmedlem'` to `MEMBER_TYPE_LABELS`

2. **Fee Calculation (laptop/src/utils/feeCategory.ts):**
   - `getFeeCategoryFromBirthDate()` now preserves HONORARY status regardless of age

3. **Database Schema:**
   - Migration adds HONORARY fee rate (0 kr) to all fiscal years
   - Online migration: `api/schema/V1_4_1__add_honorary_fee_rates.sql`
   - Local migration in `laptop/src/database/db.ts`

4. **Sync Converters (laptop/src/database/onlineApiService.ts):**
   - Updated type casts to use `MemberType` instead of hardcoded union

5. **UI Changes:**
   - Member edit dialogs include "Æresmedlem" option
   - Finance page shows read-only HONORARY fee rate (always 0 kr)
   - Honorary members display as "Betalt" (paid) in fee status table

**Impact:**
- Honorary members can be designated in the system
- They appear with 0 kr expected fee and always show as "paid"
- Fully backward compatible - existing members unchanged

---

### Version 1.4.1 (2026-01-27)

**Summary:** Fixed foreign key constraints and JOIN queries to use `internalId` consistently instead of `membershipId`.

**Background:** The trial member feature (see `docs/features/trial-member-registration/design.md`) introduced `internalId` (UUID) as the primary key for members, with `membershipId` being nullable for trial members. However, several foreign key constraints and JOIN queries were still referencing `membershipId`, causing silent failures when working with trial members.

**Changes:**

1. **Database Schema (laptop/src/database/db.ts):**
   - `TransactionLine.memberId` FK now references `Member(internalId)` instead of `Member(membershipId)`
   - `PendingFeePayment.memberId` FK now references `Member(internalId)` instead of `Member(membershipId)`
   - `PracticeSession` FK now on `internalMemberId` referencing `Member(internalId)`
   - `ScanEvent` FK now on `internalMemberId` referencing `Member(internalId)`
   - `EquipmentCheckout` FK now on `internalMemberId` referencing `Member(internalId)`

2. **Query Fixes (laptop/src/database/financeRepository.ts):**
   - `getPendingFeePayments()`: JOIN changed from `p.memberId = m.membershipId` to `p.memberId = m.internalId`
   - `getMemberFeeStatus()`: JOIN changed from `tl.memberId = m.membershipId` to `tl.memberId = m.internalId`
   - `getMemberFeeStatus()`: SELECT and GROUP BY changed from `m.membershipId` to `m.internalId`

**Impact:**
- Fee payment registration now works correctly for all members (was silently failing for payments linked by internalId)
- Member fee status display now correctly joins with transaction lines

**Note:** SQLite does not enforce foreign key constraints by default, so these schema changes are primarily documentation for the intended relationships. The actual fix was in the JOIN queries.

---

### Version 1.4.0 (2026-01-27)

**Summary:** Added sync support for NewMemberRegistration, SKV registrations, and SKV weapons tables.

**Changes:**

1. **Database Schema:**
   - Added `new_member_registrations` table for syncing registration data
   - Added `skv_registrations` table for weapon control registrations
   - Added `skv_weapons` table for individual weapon records
   - Migration file: `api/schema/V1_4_0__add_registrations_and_skv.sql`

2. **Sync Protocol:**
   - Added `newMemberRegistrations`, `skvRegistrations`, `skvWeapons` entity types
   - Updated sync handlers in PHP and TypeScript

---

### Version 1.3.0 (2026-01-27)

**Summary:** Added `source` column to `transaction_lines` table to track whether line amounts are from CASH or BANK.

**Changes:**

1. **Database Schema:**
   - Added `source VARCHAR(4) NOT NULL DEFAULT 'CASH'` column to `transaction_lines` table
   - Valid values: 'CASH', 'BANK'
   - Migration file: `api/schema/V1_3_0__add_transaction_line_source.sql`

2. **Sync Protocol:**
   - `OnlineTransactionLine` interface now includes `source: string` field
   - `transactionLineToOnline()` includes source in sync payload
   - `transactionLineFromOnline()` reads source (defaults to 'CASH' for backward compatibility)

3. **Local Database:**
   - Added `source TEXT NOT NULL DEFAULT 'CASH'` column to `TransactionLine` table
   - Migration runs automatically for existing databases

4. **UI Changes:**
   - Transaction dialog now shows "Kilde" (Source) toggle: Kasse/Bank
   - Validation checks all 4 combinations: Cash In, Cash Out, Bank In, Bank Out
   - Line totals must match header totals for each source/direction combination

**Files Modified:**

*TypeScript (Laptop):*
- `laptop/src/types/finance.ts` - Added `source: PaymentMethod` to interfaces
- `laptop/src/database/db.ts` - Added column to schema and migration
- `laptop/src/database/financeRepository.ts` - Updated queries
- `laptop/src/database/onlineApiService.ts` - Updated sync converters, `OnlineTransactionLine` type, and EXPECTED_API_VERSION to 1.3.0
- `laptop/src/database/onlineSyncService.ts` - Updated upsert function
- `laptop/src/database/syncService.ts` - Bumped version to 1.3.0
- `laptop/src/components/finance/TransactionDialog.tsx` - Added UI for source

*PHP (API):*
- `api/schema/V1_3_0__add_transaction_line_source.sql` - Migration file
- `api/handlers/sync_push.php` - Added source to INSERT/UPDATE (version 1.3.0)
- `api/handlers/sync_pull.php` - Added source to SELECT and response (version 1.3.0)
- `api/handlers/diagnostic.php` - Updated API_VERSION and EXPECTED_FILE_VERSIONS to 1.3.0

**Backward Compatibility:**
- Existing transaction lines default to 'CASH' source
- Clients with older schema (1.2.x) can still sync but won't include source field
- Server accepts missing source field and defaults to 'CASH'

---

### Version 1.2.0

**Summary:** Added `member_preferences` table for syncing UI preferences.

**Changes:**
- Added `member_preferences` table for storing practice type and classification preferences
- Sync protocol includes `memberPreferences` entity type

---

### Version 1.1.0

**Summary:** Initial trainer experience feature.

**Changes:**
- Added `trainer_info` table
- Added `trainer_disciplines` table

---

### Version 1.0.0

**Summary:** Initial schema with all core tables.

**Tables:**
- Members, check-ins, practice sessions
- Equipment items and checkouts
- Financial transactions, lines, categories
- Fiscal years and fee rates
- Pending fee payments

---

## Schema Versioning Rules

1. **Major version** changes break backward compatibility
2. **Minor version** changes add new features (backward compatible)
3. **Patch version** changes are bug fixes only

Clients with the same **major version** are compatible and can sync.

## How to Add a New Schema Change

1. Create migration file: `api/schema/V<version>__<description>.sql`
2. Update `SYNC_SCHEMA_VERSION` in `laptop/src/database/syncService.ts`
3. Update local database schema in `laptop/src/database/db.ts`
4. Add migration for existing databases in `runMigrations()`
5. Update sync converters in `onlineApiService.ts`
6. Update upsert functions in `onlineSyncService.ts`
7. Document the change in this file
