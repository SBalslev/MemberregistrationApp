# Scheduled common-room announcements - completion summary

**Completed:** 2026-10-12 19:36:22 UTC+2
**Completed by:** sbalslev
**Duration:** 30m 25s
**Related task:** 6.19
**Last updated:** 2026-10-12 20:39:50 UTC+2 by sbalslev

## What was implemented

- Added the `display_announcements` MySQL migration with schedules, publication
  status, priority, display duration, optimistic versions, audit attribution, and
  optional processed image storage.
- Added Skærmbeskeder to the existing trainer and administrator portal navigation.
- Added one shared portal page for creating, editing, publishing, archiving, and
  previewing announcements.
- Reused the existing portal roles, session, CSRF protection, audit log, and login
  flow. No second portal or portal credential was added.
- Added bounded JPEG, PNG, and WebP image handling. The portal decodes, resizes,
  and re-encodes uploads as JPEG.
- Added display-token-protected cloud endpoints for announcement metadata and
  images.
- Added outbound Pi polling, payload validation, independent image re-encoding,
  atomic disk caching, stale-image cleanup, and local schedule filtering.
- Added full-screen TV announcement slides. Important messages receive extra
  rotation weight, and each message controls its display duration.
- Preserved the existing photo and statistics view whenever no message is active.

## Design decisions

Announcement management belongs in the existing club portal at
`/portal/announcements.php`. Trainers and administrators already authenticate
there, so a separate application would duplicate login, navigation, and role
management.

The Raspberry Pi remains outside the trusted membership sync mesh. It reads only
published display DTOs and processed images through its existing display device
credential.

Published schedules use UTC in MySQL and Europe/Copenhagen time in the portal.
The Pi checks start and end times on every playlist request. A cached announcement
therefore stops displaying at its end time even when the cloud is unavailable.

## Key files

- `api/schema/V1_13_0__add_display_announcements.sql`
- `api/handlers/display_content.php`
- `display/src/common_room_display/announcements.py`
- `display/src/common_room_display/server.py`
- `display/src/common_room_display/static/index.html`
- `portal/announcements.php`
- `portal/includes/layout.php`
- `portal/includes/db.php`
- `portal/assets/portal.css`
- `portal/assets/portal.js`

The complete portal source is versioned in the repository's top-level `portal/`
directory. The production `portal/config.php` remains deployment-specific and is
excluded through `.gitignore`; deployments use `portal/config.php.example` as
the template.

## Validation

- `python -m unittest discover -s display\\tests -v`: passed, 27 tests.
- `python -m compileall -q display\\src display\\tests`: passed.
- PHP syntax checks passed for the display API handler, API router, announcement
  portal, portal database guard, and shared portal layout.
- JavaScript syntax checks passed for the TV kiosk and existing portal bundle.
- The portal write guard accepted `display_announcements` and still rejected a
  write to `members`.
- `git diff --check`: passed.

## Deployment prerequisites

1. Fix the existing `/Skytte/` database credential failure. The deployed login
   currently returns a PDO access-denied error before authentication.
2. Apply `api/schema/V1_13_0__add_display_announcements.sql`.
3. Deploy the API router and `display_content.php`.
4. Deploy the changed existing portal files.
5. Confirm PHP GD includes JPEG, PNG, and WebP support.
6. Deploy the updated Pi package and restart the backend and kiosk services.
7. Create a short scheduled test message in the existing portal and verify it
   appears and expires on the TV.

## Known limitations

- The first release targets `club-display`.
- Priorities are normal and important. Emergency takeover is not included.
- Recurring schedules, templates, analytics, and multi-display targeting are not
  included.
- Production deployment and TV verification were not performed in this task.
