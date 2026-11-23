# Activity and guest results completion summary

**Started:** 2026-10-03 10:55:26 UTC+2
**Completed:** 2026-10-03 11:30:45 UTC+2
**Duration:** 35m 19s
**Last updated:** 2026-11-23 21:13:52 UTC+1 by sbalslev

## What was implemented

- Added activities with open-day, competition, training, and other types.
- Added a trainer-dashboard workflow to start and complete activities.
- Added activity-scoped guests with optional club, start number, and display
  consent.
- Added guest result entry with reusable participants.
- Added activity editing and guest identity/result editing on the trainer tablet.
- Added synchronized guest-result removal markers so deleted results cannot
  reappear from another device or the cloud.
- Associated kiosk, assisted, and trainer-entered member results with the active
  activity.
- Synchronized activities, guests, guest results, and member activity references
  across Android peers, the laptop, and the cloud API.
- Combined member and visible guest results in the public display feed.
- Updated the Raspberry Pi display with the activity title, classifications, and
  visiting-club labels.
- Preserved normal daily scoring and display behavior when no activity is active.

## Design decisions

- Kept visitors out of the member register to avoid affecting membership, finance,
  registration, and member-statistics workflows.
- Kept `PracticeSession.activityId` nullable for existing records and older sync
  payloads.
- Allowed one active activity at a time to keep automatic result association
  predictable.
- Kept the public feed additive and free of internal entity IDs.
- Applied display consent to the guest so disabling it hides all results for that
  participant.

## Validation

- Android member unit suite passed.
- Trainer and member role-specific Kotlin compilation passed after activity
  management was moved to the trainer dashboard.
- Android display-feed tests cover combined member and guest results, privacy, and
  display consent, including removal-marker filtering.
- Android synchronization regression coverage verifies that activities are
  applied even when a peer payload contains no new practice sessions.
- Android display-feed coverage verifies that checked-in members without a score
  are included in the participant count.
- Laptop test suite passed: 237 tests in 18 files.
- Laptop production build passed.
- Raspberry Pi display suite passed: 24 tests.
- PHP syntax checks passed for sync push, sync pull, sync status, and cloud admin.
- Git whitespace validation passed.

## Raspberry Pi deployment

**Deployed:** 2026-10-03 11:40:19 UTC+2

The activity-aware kiosk was deployed to the production Raspberry Pi at
`192.168.1.97`. Configuration, media, and the display database were preserved.
The backend, Chromium kiosk, and anti-blanking services restarted successfully
with zero restart failures.

Network validation confirmed:

- Health endpoint returned `ok`.
- The membership feed was available and fresh at six seconds old.
- The deployed page contained the activity-title and visiting-club renderers.
- The live playlist retained its existing photo.

## Trainer tablet deployment

**Deployed:** 2026-10-03 12:24:33 UTC+2

Trainer version 1.3.35 was installed over the production package. The original
first-install timestamp and `/data/user/0/com.club.medlems.trainer` data directory
were preserved. Only `com.club.medlems.trainer` remains installed, the app
launched successfully, and no fatal or Room migration errors were logged.

Trainer version 1.3.36 was then installed in place at 12:44:03 UTC+2. The
20-to-21 Room migration completed without errors, the original first-install
timestamp and data directory remained unchanged, and only the production package
remained installed. Live UI inspection confirmed that the existing activity and
guest result were preserved and that activity edit, result edit, and result remove
controls were visible.

## Member tablet deployment

**Deployed:** 2026-10-03 13:05:42 UTC+2

Member version 1.3.36 was installed over production version 1.3.34 after creating
a 37 MB pre-upgrade backup. The original first-install timestamp and
`/data/user/0/com.club.medlems` data directory were preserved. The 19-to-20 and
20-to-21 Room migrations completed without errors, only `com.club.medlems`
remained installed, and live UI inspection confirmed that synchronized member
data was still available.

## Display-feed incident and fix

**Resolved:** 2026-10-03 14:34:22 UTC+2

Live end-to-end inspection found that the Raspberry Pi was polling the member
tablet successfully, but the member tablet had not applied the trainer's activity
records. Activity, guest, and guest-result processing was incorrectly nested
inside the practice-session loop, so a payload with no new practice sessions
skipped those entities. Version 1.3.37 moved each entity type to its own processing
loop and added regression coverage.

The participant metric also counted only participants with scores. Version 1.3.38
adds checked-in active members to that metric while retaining visible guests with
results. The trainer tablet was backed up and updated in place to version 1.3.38.
Its live feed then reported the preserved **Skydesportens Dag 2026** activity,
three results totaling 313 points, and 10 participants. The member tablet still
requires the same 1.3.38 update before the Raspberry Pi receives the corrected
check-in count from its configured feed source.

## Activity closure and stale replay follow-up

**Started:** 2026-11-23 19:58:17 UTC+1
**Completed:** 2026-11-23 20:52:21 UTC+1
**Duration:** 54m 4s
**Last updated:** 2026-11-23 20:52:21 UTC+1 by sbalslev

The member tablet and Pi initially both published activity `test` in fresh feeds.
The activity subsequently cleared through existing synchronization while the fix
was being prepared. Live browser validation confirmed normal club results and
eight rifle leaderboard scores with recorded krydser, including `195/6` and `173/0`.
No activity records were changed manually and no Pi-only hiding workaround was added.

Code inspection identified unchanged lifecycle versions and unconditional or
version-only merges that could restore stale active records. Creation now starts
at version 1; completion, restart, editing, and automatic completion increment
the persisted version and clear the sync timestamp. Android, laptop, and cloud
activity merges compare modification times first, prefer completion on ties, and
accept later explicit restarts.

Validation:

```powershell
.\gradlew.bat :app:testMemberReleaseUnitTest `
  --tests 'com.club.medlems.network.display.DisplayFeedBuilderTest' `
  --tests 'com.club.medlems.data.sync.SyncRepositoryActivityTest' `
  --tests 'com.club.medlems.ui.activity.ActivityManagementViewModelTest' `
  :app:assembleMemberRelease :app:assembleTrainerRelease --console=plain --no-daemon
```

- The command above passed 15 Android tests and built both release APKs.
  It ran in a clean worktree with an isolated Gradle cache; unrelated pending
  working-tree changes were excluded.
- `npm run test:run -- src\database\activitySync.test.ts src\database\syncService.test.ts`:
  passed, 42 tests, including actual SQLite execution of the activity merge SQL.
- `npx tsc -b --pretty false` in `laptop`: passed.
- `php -l api\handlers\sync_push.php`: passed.
- `php api\tests\activity-sync.php`: passed, eight ordering cases.
- APK metadata and signature verification passed for `com.club.medlems` and
  `com.club.medlems.trainer`, version 1.3.39, version code 10339.

At implementation completion, neither signed APK was installed because tablet
ADB access was unavailable. The trainer was subsequently attached and updated
as described below. The member APK and API/laptop deployment remain pending.
The observed live activity clearance at 20:52 was not caused by deploying these
new tablet or API changes.

## Trainer 1.3.39 data-preserving deployment

**Started:** 2026-11-23 21:03:22 UTC+1
**Completed:** 2026-11-23 21:13:52 UTC+1
**Duration:** 10m 30s
**Last updated:** 2026-11-23 21:13:52 UTC+1 by sbalslev

The attached trainer tablet had release 1.3.38, not a debug build. Both the saved
installed APK and prepared release 1.3.39 APK passed signature verification with
the same signing certificate. The update used `adb install -r` without uninstalling
or clearing data; version 1.3.39 / 10339 remains a release build.

The pre-upgrade Android backup was validated to contain the database and its WAL.
A second backup after installation, before application launch, had identical
SHA-256 hashes for all 18 backed-up app-data files. Database integrity checks
passed, schema 21 was unchanged, and every table count matched, including:

- 111 members, 887 practice sessions, and 1,107 check-ins.
- Three activities, 12 guests, and 12 guest results.
- Existing equipment, trainer configuration, preferences, and synchronization rows.

The package UID remained 10190, the first-install timestamp remained
2026-11-09 21:13:59, and the data directory remained
`/data/user/0/com.club.medlems.trainer`. Only the production trainer package is
installed.

The upgraded application launched successfully to trainer login. Its live
display feed responded with schema 1, no active activity, 21 participants,
16 sessions, and 3,284 points. No fatal, SQLite, or Room errors were logged for
the trainer process. Temporary device files and the local feed-forwarding helper
were removed after verification. The old APK and verified data backups are
retained outside the repository for recovery.

Member-tablet installation and API/laptop deployment are still pending.

## Known limitations

- Scoring remains limited to discipline, classification, points, and krydser.
- Team scoring, shot series, and competition-specific tie-break rules are not
  included.
