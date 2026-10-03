# Online database sync tasks

**Last updated:** 2026-09-28 by sbalslev

## Sync reliability fixes

- [x] **ODBS-1** Fix sync pull pagination cursor
  - **Started**: 2026-05-17 10:00:00 UTC+0
  - **Completed**: 2026-05-17 10:45:00 UTC+0
  - **Duration**: 45m
  - Pagination now returns `has_more` only when a valid `next_cursor` is computed from timestamped entities.

- [x] **ODBS-2** Stabilize finance pulls
  - **Started**: 2026-05-17 19:20:00 UTC+0
  - **Completed**: 2026-05-17 19:40:00 UTC+0
  - **Duration**: 20m
  - Added `financial_transactions` pull support and a fallback for transaction line `source` when the column is missing.

- [x] **ODBS-3** Fix transaction line device filter
  - **Started**: 2026-05-17 20:10:00 UTC+0
  - **Completed**: 2026-05-17 20:20:00 UTC+0
  - **Duration**: 10m
  - Qualified device exclusion against `financial_transactions` to avoid ambiguous `device_id` in join queries.

- [x] **ODBS-4** Capture pull errors per entity
  - **Started**: 2026-05-17 20:30:00 UTC+0
  - **Completed**: 2026-05-17 20:40:00 UTC+0
  - **Duration**: 10m
  - Sync pull now returns an `errors` array with entity-level failures instead of a hard 500.

- [x] **ODBS-5** Include parent members in child pushes
  - **Started**: 2026-09-28 21:05:00 UTC+2
  - **Completed**: 2026-09-28 21:12:15 UTC+2
  - **Duration**: 7m 15s
  - Incremental sync now includes members referenced by pending check-ins and practice sessions before pushing child records.
  - Missing local parent records produce an actionable sync error before contacting the cloud database.
