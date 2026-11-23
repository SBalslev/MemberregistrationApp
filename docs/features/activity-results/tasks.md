# Activity and guest results tasks

**Started:** 2026-10-03 10:55:26 UTC+2
**Completed:** 2026-10-03 11:30:45 UTC+2
**Duration:** 35m 19s
**Last updated:** 2026-11-23 21:13:52 UTC+1 by sbalslev

## Implementation

- [x] Add activity, guest, and guest-result entities and Room migration.
- [x] Add an optional activity reference to member practice sessions.
- [x] Add activity management and guest-result entry to the trainer dashboard.
- [x] Add activity, guest identity, and guest-result editing.
- [x] Add synchronized guest-result removal markers.
- [x] Associate kiosk, assisted, and trainer-entered member results.
- [x] Extend trusted device, laptop, and cloud synchronization.
- [x] Merge member and guest results in the public display feed.
- [x] Show the active activity and visiting club on the Raspberry Pi.
- [x] Add public-feed privacy and combined-result tests.
- [x] Complete final cross-component validation.
- [x] Deploy trainer version 1.3.36 in place with tablet data preserved.

## Activity closure follow-up

- [x] Persist increasing activity lifecycle versions and reject stale activity merges.
  - **Started:** 2026-11-23 19:58:17 UTC+1
  - **Completed:** 2026-11-23 20:52:21 UTC+1
  - **Duration:** 54m 4s
  - Added Android, laptop, and cloud ordering coverage and preserved newer restarts.
  - Verified 15 Android tests, 42 laptop tests, type-checking, and eight PHP cases.
  - Built signed member and trainer 1.3.39 APKs using only the requested fixes.
  - Observed the closed activity clear through existing sync on the live Pi.
  - At implementation completion, tablet ADB and hosting deployment access were
    unavailable. The trainer deployment below was performed after USB attachment.

- [x] Deploy trainer 1.3.39 using the installed build type and retain local data.
  - **Started:** 2026-11-23 21:03:22 UTC+1
  - **Completed:** 2026-11-23 21:13:52 UTC+1
  - **Duration:** 10m 30s
  - Confirmed installed 1.3.38 was release, verified both APK signatures and matching
    signing certificates, and installed release 1.3.39 with `adb install -r`.
  - Saved the old APK and a verified native Android app-data backup before updating.
  - Compared 18 backed-up app-data files before launch: every SHA-256 hash matched.
    Database integrity and every table count also matched, including 111 members,
    887 practice sessions, 1,107 check-ins, three activities, and 12 guest results.
  - Preserved package UID, first-install timestamp, data directory, and schema 21.
  - Trainer login and the live display feed loaded without trainer runtime or
    database errors. The feed has no active activity.
  - Member-tablet installation and API/laptop deployment remain pending.
