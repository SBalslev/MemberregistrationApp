# Common-room display - product requirements

**Feature:** Raspberry Pi common-room display
**Status:** Planned
**Priority:** Medium
**Created:** 2026-08-31
**Last updated:** 2026-08-31 by sbalslev

## Overview

Connect a Raspberry Pi 2 Model B to the common-room TV. The display rotates club
photos and public, display-ready statistics from the membership tablet. People on
the local network can add temporary photos from their phones by scanning a QR code.
Trainers can remove photos and manage which photos remain permanently.

The display is not a trusted sync device. It must not receive member records or
join the existing key exchange and pairing system.

## Goals

1. Show an attractive, readable slideshow on the common-room TV.
2. Celebrate current club activity without exposing unnecessary personal data.
3. Let visitors add temporary photos with a phone and no account.
4. Let trainers delete, retain, and manage photos.
5. Continue showing cached content when the membership tablet is unavailable.
6. Run reliably on Raspberry Pi 2 hardware with minimal maintenance.

## Non-goals

- Synchronizing the membership database to the Raspberry Pi.
- Letting the Raspberry Pi change scores, members, or check-ins.
- Uploading common-room photos to the cloud membership API.
- Supporting video in the first release.
- Making the display available outside the club's local network.

## User stories

### US-1: View club activity

As a person in the common room, I want to see today's results and other positive
club statistics so that the display reflects what is happening in the club.

### US-2: View club photos

As a person in the common room, I want to see a rotating selection of club photos.

### US-3: Add a temporary photo

As a visitor on the club Wi-Fi, I want to scan a QR code and upload a photo without
creating an account so that it can join the slideshow for a few hours.

### US-4: Moderate photos

As a trainer, I want to delete an uploaded photo immediately and make selected
photos permanent so that the display remains appropriate and useful.

### US-5: Recover automatically

As a trainer, I want the display to restart after a power failure without manual
login or setup.

## Functional requirements

### FR-1: Display rotation

**FR-1.1** The Raspberry Pi SHALL render a full-screen TV display in kiosk mode.

**FR-1.2** The display SHALL rotate between photos and available statistics.

**FR-1.3** The default duration SHALL be configurable by content type.

**FR-1.4** The display SHALL omit a slide when its source data is empty.

**FR-1.5** A small upload QR code MAY remain visible over display content.

**FR-1.6** The display SHALL show a discreet stale-data indicator when statistics
have not been refreshed within a configurable period.

### FR-2: Public statistics

**FR-2.1** The membership tablet SHALL provide a separate, read-only display feed.

**FR-2.2** Reading the display feed SHALL NOT require device pairing or a sync token.

**FR-2.3** The feed SHALL contain prepared display data, not synchronized entities.

**FR-2.4** The first release SHALL support:

- Top scores recorded today, grouped by discipline.
- Recent scores from today.
- Participant and practice-session counts for today.
- Personal bests achieved today when they can be calculated reliably.
- Birthdays that occurred today or during the previous seven calendar days.

**FR-2.5** Birthday content SHALL contain no date of birth, birth year, or age.

**FR-2.6** Member names SHALL default to first name and last initial, for example
`Søren B.`.

**FR-2.7** The feed SHALL never include member IDs, internal IDs, contact details,
addresses, full birth dates, member photos, or raw database records.

**FR-2.8** The feed SHALL include its generation time and a schema version.

**FR-2.9** The Pi SHALL poll the feed at a configurable interval, initially 15
seconds, and cache the last valid response.

### FR-3: Permanent photos

**FR-3.1** Photos placed in a configured permanent-media directory on the Pi's SD
card SHALL remain available until a trainer deletes them.

**FR-3.2** A trainer SHALL be able to promote a temporary photo to permanent.

**FR-3.3** Removing the source SD card SHALL NOT corrupt the media catalog.

### FR-4: Public temporary uploads

**FR-4.1** Any device that can reach the Pi on the local network SHALL be able to
open the upload page without authentication.

**FR-4.2** The upload page SHALL accept JPEG, PNG, and WebP images.

**FR-4.3** Temporary photos SHALL expire four hours after upload by default.

**FR-4.4** Expired files SHALL be removed automatically.

**FR-4.5** The service SHALL validate file type, decoded dimensions, and file size.

**FR-4.6** The service SHALL decode and re-encode uploaded images, remove metadata,
and create display-sized output before serving them.

**FR-4.7** Original filenames SHALL NOT be used as stored filenames or URLs.

**FR-4.8** The service SHALL enforce per-client rate limits and total storage limits.

**FR-4.9** Upload behavior SHALL support two configurable modes:

- Immediate display, which is the initial default.
- Trainer approval before display.

### FR-5: Trainer moderation

**FR-5.1** Trainer controls SHALL require a Pi-local PIN or password.

**FR-5.2** A trainer SHALL be able to view temporary, permanent, pending, and expired
photo records.

**FR-5.3** A trainer SHALL be able to delete any photo immediately.

**FR-5.4** A trainer SHALL be able to approve, pause, extend, or make a temporary
photo permanent.

**FR-5.5** Public users SHALL NOT be able to call moderation operations.

### FR-6: Operations

**FR-6.1** The Pi service and kiosk SHALL start automatically at boot.

**FR-6.2** Both processes SHALL restart automatically after failure.

**FR-6.3** The display SHALL work from cached statistics and local photos when the
membership tablet is offline.

**FR-6.4** The service SHALL protect the SD card from unbounded logs and media use.

**FR-6.5** The Pi SHALL use a stable local address through DHCP reservation where
available.

## Security and privacy requirements

The local network is not treated as trusted. Unauthenticated means that the
endpoint publishes a deliberately limited data product; it does not mean that raw
membership data is available without a token.

- Existing `/api/sync/*` endpoints remain authenticated and unchanged.
- Public upload routes run on the Pi, not on the membership tablet.
- Display-feed models use an allowlist of fields.
- Public routes use rate limiting and bounded request bodies.
- Moderation routes use authentication and request forgery protection where
  applicable.
- Images are never executed or served with user-controlled content types.

Before implementation, the club SHALL confirm that displaying abbreviated names,
scores, and birthday greetings matches its privacy policy. A member opt-out or
explicit display-consent field is a follow-up if policy requires it.

## Success criteria

- The display starts without interaction after a cold boot.
- A score entered on the membership tablet appears within 30 seconds.
- No prohibited member field appears in display-feed contract tests.
- A phone can upload a valid photo through the QR flow in under one minute.
- A temporary photo disappears after its expiry time.
- A trainer can delete a displayed photo and have it disappear within 15 seconds.
- The display remains usable for at least 24 hours while the tablet is offline.

## Open product decisions

- Club-approved wording for birthday and achievement slides.
- Whether public uploads should switch to approval-first after the pilot.
- Whether a member-level public-display preference is required.
- The final per-client upload rate and total disk quota.
