# Member activity reflection - Implementation tasks

**Feature:** Laptop member activity reflection
**Created:** 2026-01-25
**Status:** Done
**Updated By:** sbalslev
**Related Documents:**

- [PRD](prd.md)

---

## Overview

Implement a read-only member activity timeline and a cross-member overview page split into attendance and practice tabs. Data is sourced from existing synced tables.

---

## Phase 1: Data access and aggregation

- [x] **1.1** Add repository helpers for member timeline activity
	- **Started**: 2026-01-25 21:55:21 UTC+01:00
	- **Completed**: 2026-01-25 21:56:55 UTC+01:00
	- **Duration**: 2m
- [x] **1.2** Add queries for distinct daily check-ins (single day list)
	- **Started**: 2026-01-25 21:55:21 UTC+01:00
	- **Completed**: 2026-01-25 21:56:55 UTC+01:00
	- **Duration**: 2m
- [x] **1.3** Add queries for distinct member counts per day (multi-day)
	- **Started**: 2026-01-25 21:55:21 UTC+01:00
	- **Completed**: 2026-01-25 21:56:55 UTC+01:00
	- **Duration**: 2m
- [x] **1.4** Add queries for practice sessions grouped by discipline and classification
	- **Started**: 2026-01-25 21:55:21 UTC+01:00
	- **Completed**: 2026-01-25 21:56:55 UTC+01:00
	- **Duration**: 2m
- [x] **1.5** Add trial vs. full member attendance breakdowns
	- **Started**: 2026-01-25 21:55:21 UTC+01:00
	- **Completed**: 2026-01-25 21:56:55 UTC+01:00
	- **Duration**: 2m
- [x] **1.6** Apply GMT+1 day boundaries and season year logic
	- **Started**: 2026-01-25 21:55:21 UTC+01:00
	- **Completed**: 2026-01-25 21:56:55 UTC+01:00
	- **Duration**: 2m

---

## Phase 2: Overview page UI

- [x] **2.1** Add member activity overview page and route
	- **Started**: 2026-01-25 21:56:55 UTC+01:00
	- **Completed**: 2026-01-25 22:00:00 UTC+01:00
	- **Duration**: 4m
- [x] **2.2** Add attendance and practice tabs
	- **Started**: 2026-01-25 21:56:55 UTC+01:00
	- **Completed**: 2026-01-25 22:00:00 UTC+01:00
	- **Duration**: 4m
- [x] **2.3** Add filters for date range and activity type
	- **Started**: 2026-01-25 21:56:55 UTC+01:00
	- **Completed**: 2026-01-25 22:04:19 UTC+01:00
	- **Duration**: 7m
- [x] **2.4** Add trial filter toggle with three states
	- **Started**: 2026-01-25 21:56:55 UTC+01:00
	- **Completed**: 2026-01-25 22:00:00 UTC+01:00
	- **Duration**: 4m
- [x] **2.5** Default the date range to current year with 12-month max range
	- **Started**: 2026-01-25 21:56:55 UTC+01:00
	- **Completed**: 2026-01-25 22:00:00 UTC+01:00
	- **Duration**: 4m
- [x] **2.6** Implement daily distinct check-in list view
	- **Started**: 2026-01-25 21:56:55 UTC+01:00
	- **Completed**: 2026-01-25 22:00:00 UTC+01:00
	- **Duration**: 4m
- [x] **2.7** Implement aggregated multi-day attendance view
	- **Started**: 2026-01-25 21:56:55 UTC+01:00
	- **Completed**: 2026-01-25 22:00:00 UTC+01:00
	- **Duration**: 4m
- [x] **2.8** Add practice session breakdowns by discipline and classification
	- **Started**: 2026-01-25 21:56:55 UTC+01:00
	- **Completed**: 2026-01-25 22:00:00 UTC+01:00
	- **Duration**: 4m
- [x] **2.9** Implement drill-down from aggregates, excluding single-day distinct check-in list
	- **Started**: 2026-01-25 21:56:55 UTC+01:00
	- **Completed**: 2026-01-25 22:04:19 UTC+01:00
	- **Duration**: 7m
- [x] **2.10** Add pagination for attendance and drill-down lists at 50 rows per page
	- **Started**: 2026-01-25 21:56:55 UTC+01:00
	- **Completed**: 2026-01-25 22:00:00 UTC+01:00
	- **Duration**: 4m
- [x] **2.11** Scope discipline and classification filters to practice tab only
	- **Started**: 2026-01-25 21:56:55 UTC+01:00
	- **Completed**: 2026-01-25 22:00:00 UTC+01:00
	- **Duration**: 4m

---

## Phase 3: Member timeline UI

- [x] **3.1** Replace "Se aktivitet" placeholder with timeline view
	- **Started**: 2026-01-25 22:07:34 UTC+01:00
	- **Completed**: 2026-01-25 22:07:34 UTC+01:00
	- **Duration**: 0m
- [x] **3.2** Add activity type filters and date range controls
	- **Started**: 2026-01-25 22:07:34 UTC+01:00
	- **Completed**: 2026-01-25 22:07:34 UTC+01:00
	- **Duration**: 0m
- [x] **3.3** Show source device and activity summary in each entry
	- **Started**: 2026-01-25 22:16:28 UTC+01:00
	- **Completed**: 2026-01-25 22:16:28 UTC+01:00
	- **Duration**: 0m
	- **Notes**: Source device intentionally hidden in UI
- [x] **3.4** Add empty states and error handling
	- **Started**: 2026-01-25 22:07:34 UTC+01:00
	- **Completed**: 2026-01-25 22:07:34 UTC+01:00
	- **Duration**: 0m

---

## Phase 4: Testing and validation

- [x] **4.1** Unit tests for aggregation queries and filters
	- **Started**: 2026-01-25 22:04:19 UTC+01:00
	- **Completed**: 2026-01-25 22:04:19 UTC+01:00
	- **Duration**: 0m
- [x] **4.2** UI tests for overview filters and drill-down behavior
	- **Started**: 2026-01-25 22:16:28 UTC+01:00
	- **Completed**: 2026-01-25 22:18:57 UTC+01:00
	- **Duration**: 2m
- [x] **4.3** Validate Danish UI text, labels, and error messages
	- **Started**: 2026-01-25 22:16:28 UTC+01:00
	- **Completed**: 2026-01-25 22:18:57 UTC+01:00
	- **Duration**: 2m

---

## Acceptance criteria

- [ ] Member timeline replaces the placeholder and is read-only
- [ ] Overview page defaults to current year and respects filters
- [ ] Trial filter supports all members, without trial, and only trial
- [ ] Daily distinct check-ins show a full list without drill-down
- [ ] Multi-day views show distinct member counts per day
- [ ] Practice sessions group by discipline and classification
- [ ] Drill-down works for aggregates only
- [ ] Attendance and drill-down lists paginate at 50 rows per page
- [ ] No export functionality is added
