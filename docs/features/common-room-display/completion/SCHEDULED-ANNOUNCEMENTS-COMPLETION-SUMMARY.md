# Scheduled common-room announcements - completion summary

**Completed:** 2026-10-12 19:36:22 UTC+2
**Completed by:** sbalslev
**Duration:** 30m 25s
**Related task:** 6.19
**Last updated:** 2026-11-23 21:45:59 UTC+1 by sbalslev

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

## Overview timing follow-up

Task 6.20 increased the composite overview interval from 12 to 60 seconds before
each announcement. Announcement durations and priority weighting are unchanged.
The internal photo, score-page, highlight, and headline rotations remain 12 seconds.

- **Started:** 2026-10-19 18:54:37 UTC+2
- **Completed:** 2026-10-19 19:00:58 UTC+2
- **Duration:** 6m 21s
- `node --test display\tests\kiosk_rotation.test.cjs`: passed, four timing tests.
- `python -m unittest discover -s display\tests -v`: 25 passed, two failed because
  existing announcement-image fixtures expired on October 12. Both passed with
  the fixture clock patched for validation only; no unrelated test changes made.
- `python -m unittest test_display_service.DisplayHttpTest -v` with
  `PYTHONPATH` pointing to `display\tests`: passed, two HTTP integration tests.
- **Production deployed:** 2026-10-19 19:09:59 UTC+2
- Backed up the installed page and atomically replaced it without changing
  configuration, photos, or the database. Restarted the kiosk and anti-blanking
  service; the backend did not need a restart.
- Verified the HTTP page matches the tested local file exactly, all four display
  services are active, Chromium is running, the kiosk has zero service restarts,
  and the playlist contains fresh statistics and one announcement.
- Physical TV observation was not performed.

## Known limitations

- The first release targets `club-display`.
- Priorities are normal and important. Emergency takeover is not included.
- Recurring schedules, templates, analytics, and multi-display targeting are not
  included.
- Physical TV verification was not performed. The overview timing follow-up was
  deployed and remotely verified on 2026-10-19.

## Image fitting, orientation, and optional panning

**Task:** 6.23
**Start date:** 2026-11-23 21:24:14 UTC+1
**End date:** 2026-11-23 21:33:08 UTC+1
**Duration:** 8m 54s
**Last updated:** 2026-11-23 21:33:08 UTC+1 by sbalslev

The kiosk and portal preview previously cropped images with `object-fit: cover`.
Both now default to showing the whole image. The portal also previously stripped
JPEG orientation metadata before applying it; all eight camera orientations,
including mirrored variants, are now normalized before resizing and re-encoding.

Added per-message **Vis hele billedet** and **Panorér langsomt over billedet**
choices. Migration 1.14.0 stores `fit` or `pan`, defaulting existing records to
`fit`. The API delivers the mode, the Pi validates and caches it, and old feeds
without the field remain compatible.

Opt-in panning fills the panel and moves along its overflowing dimension during
one announcement. The first and last 10 percent of the duration pause at the
ends. The kiosk subtracts image load time; the preview restarts on image, mode,
or duration changes. Reduced-motion preferences show the whole image instead.
The editor and archive initializers were moved out of the password-reset submit
handler because their incorrect scope prevented the announcement editor booting.

Validation passed:

- With `$extensions` set to the PHP installation's `ext` directory,
  `php -d "extension_dir=$extensions" -d extension=gd -d extension=exif portal\tests\announcement_image.test.php`:
  eight EXIF orientations with pixel-corner checks, JPEG/PNG/WebP re-encoding,
  portrait resizing, metadata removal, invalid-image rejection, form defaults,
  both modes, invalid-mode rejection, and API mode delivery.
- `node --test display\tests\kiosk_rotation.test.cjs portal\tests\announcement_editor.test.cjs`:
  12 tests passed.
- With `PYTHONPATH=display\src;display\tests`,
  `python -m unittest test_display_service.AnnouncementCacheTest.test_image_display_modes_are_validated_and_survive_cache_restart test_display_service.AnnouncementCacheTest.test_cache_filters_schedule_and_survives_restart test_display_service.UploadServiceTest test_display_service.DisplayHttpTest -v`:
  12 tests passed.
- PHP syntax checks for the portal, image test, and content handler, plus
  `node --check portal\assets\portal.js`: passed.
- Portal-to-Pi processing of an EXIF portrait preserved all four corners through
  1620x2160 portal output and 810x1080 Pi cache output, without a second rotation.
- Browser checks reproduced the old crop and verified whole-image fitting for
  portrait, landscape, square, and panoramic images at 1280x720, 1920x1080,
  and 3840x2160. Portal preview checks passed at 390x844, 1280x720, and 1920x1080.
- Animation sampling verified vertical portrait movement, horizontal panorama
  movement, both endpoint pauses, configured duration, and reduced-motion
  fallback. Live editor fixtures verified mode switching, duration updates, and
  preview restart without accessing production data.
- Changed-file `git diff --check`: passed.

Deployment remains pending. Apply migration 1.14.0 before updating the website
portal and API handler; enable PHP GD and EXIF. Update the Pi's announcement
service and kiosk page. No production database, photos, or services were changed,
and no physical TV test was performed. Previously uploaded sideways photos must
be uploaded again because their original orientation metadata was discarded.

### Pi deployment

**Deployment started:** 2026-11-23 21:35:03 UTC+1
**Files installed:** 2026-11-23 21:41:58 UTC+1
**Deployment verified:** 2026-11-23 21:45:59 UTC+1
**Duration:** 10m 56s
**Last updated:** 2026-11-23 21:45:59 UTC+1 by sbalslev

Deployed only the installed announcement module and kiosk page on `skydefoto`
at `192.168.1.97`, using the existing trusted SSH host key. No configuration,
photos, database, upload page, or other runtime files were changed.

Both previous files were retained beside the installed files with suffix
`.bak-20261123-214158`. Files were staged, hash-checked, syntax-checked, and
atomically replaced with their original ownership and permissions. The temporary
staging directory was removed afterward.

Installed SHA-256 values:

- Announcement module:
  `89a7d0f7ae322fab662bf4a629e798abb3c27240adb7c35f7afeec3a7ae97d69`
- Kiosk page:
  `3d0fe770687b2a11272ac7c9ee9ee3d9b599a9ec6018711e0645f535de0296db`

Verification passed:

- Ten kiosk Node.js tests and two focused cache tests passed before deployment.
- The installed Pi module accepted legacy feeds, both image modes, and disk-cache
  restart, and rejected an invalid mode using temporary fixture storage.
- The served kiosk bytes matched the tested local page hash.
- Backend, kiosk, anti-blanking, and watchdog timer remained active.
- Backend PID 9089 and kiosk PID 9105 had zero automatic restarts.
- Health returned `{"status": "ok"}`; the playlist contained fresh statistics,
  six photos, and two announcements. Both announcements supplied `fit` explicitly
  through the live web feed.
- Screen-saver timeout was zero and DPMS was disabled.
- No backend or kiosk error-priority journal entries appeared in the checked
  five-minute window.

The additional live-browser check could not complete because the integrated
browser connection timed out. Physical TV observation was not performed.
The deployed bytes match the earlier browser-tested source.

The user was instructed to apply database migration 1.14.0, then upload the
announcement portal, portal CSS and JavaScript, and display-content API handler,
with PHP GD and EXIF enabled. Those web/database operations were not performed
by this session; the final live feed did expose the new image-mode field.
