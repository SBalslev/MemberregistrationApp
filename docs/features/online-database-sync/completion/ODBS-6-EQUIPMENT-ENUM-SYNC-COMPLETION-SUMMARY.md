# Equipment enum sync fix completion summary

**Started:** 2026-10-12 19:01:22 UTC+2
**Completed:** 2026-10-12 19:05:59 UTC+2
**Duration:** 4m 37s
**Last updated:** 2026-10-12 19:05:59 UTC+2 by sbalslev

## What was fixed

Online equipment synchronization failed because the clients sent canonical
uppercase values while MySQL accepted legacy title-case enum values.

- Client status `AVAILABLE` did not match MySQL status `Available`.
- Client status `CHECKED_OUT` did not match MySQL status `CheckedOut`.
- Client type `TRAINING_MATERIAL` did not match MySQL type `TrainingMaterial`.

MySQL reported the first mismatch as:

```text
SQLSTATE[01000]: Warning: 1265 Data truncated for column 'status' at row 1
```

## Implementation

- Added migration `api/schema/V1_12_0__canonicalize_equipment_enums.sql`.
- Temporarily widens the affected enum columns to preserve and translate existing data.
- Restores enum constraints with the canonical laptop and tablet values.
- Updated the fresh-install schema to use canonical values.
- Bumped the sync schema version to 1.12.0.
- Normalizes legacy equipment values at both the laptop and PHP API boundaries.
- Rejects unknown equipment types with their actual value before MySQL can truncate them.

## Deployment

Apply the migration to each existing online database before retrying sync:

```bash
mysql -u username -p database_name < schema/V1_12_0__canonicalize_equipment_enums.sql
```

The same file can be imported through phpMyAdmin when command-line MySQL access
is unavailable.

## Validation

- `npm run test:run -- src/database/onlineApiService.test.ts src/database/syncService.test.ts` passed: 42 tests.
- `npm run build` passed.
- `npm run build:win` produced the Windows installer successfully.
- PHP syntax validation passed for `sync_push.php` and `diagnostic.php`.
- The build emitted only existing bundle-size and Browserslist freshness warnings.
