# Task 3.6 - Inspect and correct member fee entries

**Completed:** 2026-09-28 20:52:58 UTC+2
**Completed By:** sbalslev
**Related Tasks:** 2.5, 2.6

## What was implemented

- Fixed member history lookup to use the same internal member ID stored on transaction lines.
- Added voucher numbers to the member transaction history.
- Added an edit action that opens the linked transaction in the existing editor.

## Design decisions

The correction flow reuses the existing transaction editor. This avoids a second editing path and preserves current transaction validation and save behavior.

## Testing and validation

- Added a focused component test with different internal and visible membership IDs.
- Verified that linked fee entries render and that the edit action returns the correct transaction ID.