# Activity and guest results design

**Status:** Implemented
**Created:** 2026-10-03 10:55:26 UTC+2
**Last updated:** 2026-10-03 12:35:00 UTC+2 by sbalslev

## Data model

`Activity` stores the event name, type, active state, display setting, timestamps,
and sync metadata.

`ActivityGuest` stores an activity-scoped public identity. It deliberately does not
reuse `Member`, so visitors do not enter membership, finance, registration, or
member-statistics workflows.

`GuestResult` stores the visitor's score and references both the activity and
guest. `PracticeSession.activityId` associates an existing member result with an
activity without changing normal member history.

`GuestResult.deletedAtUtc` stores a synchronized removal marker. Removed results
remain available to synchronization so another device or the cloud cannot restore
them, but they are excluded from trainer views and the public display.

All new references are logical IDs rather than database foreign keys. This follows
the existing distributed sync model, where related records can arrive in separate
payloads and in different orders.

## Tablet flow

The trainer dashboard opens the activity screen. Creating an activity starts it
immediately. The member tablet does not expose activity management; it only
associates member-entered results with the active activity. The screen supports:

- Completing the active activity.
- Restarting an activity from history.
- Editing an activity's name, type, and public-display setting.
- Selecting a previously entered guest.
- Entering a guest and result in one operation.
- Editing guest identity, display consent, discipline, classification, and score.
- Removing a guest result after confirmation.
- Controlling whether the guest appears on the public display.

Member score entry checks the active activity when saving. The behavior is applied
to kiosk score entry, assisted check-in, and trainer add-session flows.

## Synchronization

Activities, guests, and guest results use the existing outbox and idempotent sync
patterns. `PracticeSession.activityId` remains optional for backward-compatible
deserialization and existing rows.

Guest-result removal uses the normal upsert path with `deletedAtUtc` as a removal
marker. This makes removal idempotent and preserves it across Android peer, laptop,
and cloud synchronization.

Cloud and laptop schemas mirror the Android records. Sync protocol versions are
advanced together so incompatible peers are detected instead of silently dropping
activity fields.

## Public display feed

The existing feed remains schema version 1 because the changes are additive and
all new fields are optional. When an activity is active and display-enabled:

- Member sessions are selected by `activityId` instead of club date.
- Visible guest results are merged with member results.
- Participant counts use stable internal keys but expose no IDs.
- Top scores are grouped by discipline and classification.
- Personal bests remain member-only.

When no activity is active, the feed retains its existing club-date behavior.

The Raspberry Pi keeps consuming prepared display DTOs. It does not receive raw
activity, guest, member, or synchronization entities.

## Failure behavior

- No active activity: save and display normal daily member results.
- Guest display disabled: omit that guest and all related results from the feed.
- Guest result removed: synchronize the removal marker and omit the result from
  local lists and the public feed.
- Tablet unavailable: the Raspberry Pi continues showing its last valid cached
  feed and marks it stale.
- Sync unavailable: local activity entry continues through the existing outbox.
