# Activity and guest results

Record club activities, results from visiting participants, and member results that
belong to the same activity.

**Status:** Implemented
**Created:** 2026-10-03 10:55:26 UTC+2
**Last updated:** 2026-10-03 11:11:46 UTC+2 by sbalslev

## Goals

- Let a trainer start and complete one active activity.
- Associate new member results with the active activity.
- Record results for visitors without creating membership records.
- Show combined member and guest results on the Raspberry Pi display.
- Keep normal daily scoring unchanged when no activity is active.
- Synchronize activities and results across trusted devices and the cloud API.

## Requirements

### Activity management

- A trainer can create an activity with a name and type.
- Supported types are open day, competition, training activity, and other.
- Only one activity can be active at a time.
- Starting another activity completes the previous active activity.
- A completed activity remains available in activity history.

### Guest results

- A guest belongs to an activity, not to the club member register.
- A guest stores a display name, optional club, optional start number, and display
  consent.
- A trainer can reuse a guest when entering more results.
- Guest results use the existing discipline, classification, points, and krydser
  fields.

### Member results

- A member result recorded while an activity is active stores that activity ID.
- Existing and non-activity results remain valid with a null activity ID.
- Member history and personal-best behavior remain unchanged.

### Public display

- The public feed includes the active activity title and type.
- Activity totals combine visible guest results and associated member results.
- Leaderboards separate discipline and classification.
- A guest's optional club can appear with the public display name.
- Internal activity, guest, result, and member IDs never appear in the public feed.

## Privacy

- Do not store contact details or birth dates for guests.
- Treat the entered display name as the name approved for public display.
- Hide all results for a guest when display consent is disabled.
- Keep the Raspberry Pi outside the trusted synchronization boundary.

## Out of scope

- Detailed series or shot-by-shot scoring.
- Team and relay scoring.
- Competition-specific tie-break rules beyond points and krydser.
- Public internet access to the activity feed.
