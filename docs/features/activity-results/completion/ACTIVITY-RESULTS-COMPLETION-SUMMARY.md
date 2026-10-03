# Activity and guest results completion summary

**Started:** 2026-10-03 10:55:26 UTC+2
**Completed:** 2026-10-03 11:30:45 UTC+2
**Duration:** 35m 19s
**Last updated:** 2026-10-03 14:36:00 UTC+2 by sbalslev

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

## Known limitations

- Scoring remains limited to discipline, classification, points, and krydser.
- Team scoring, shot series, and competition-specific tie-break rules are not
  included.
