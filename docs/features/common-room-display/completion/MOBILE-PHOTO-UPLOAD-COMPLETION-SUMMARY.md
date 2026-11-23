# Mobile photo upload refresh

**Task:** 4.10
**Start date:** 2026-11-23 20:14:34 UTC+1
**End date:** 2026-11-23 20:20:51 UTC+1
**Duration:** 6m 17s
**Last updated:** 2026-11-23 20:56:02 UTC+1 by sbalslev

## Changes

The internet QR page forced camera capture on its only file input. On phones this
can bypass the gallery. Both the internet and local Pi pages now offer separate
gallery and camera buttons; only the latter requests rear-camera capture.

- Added a photo preview, filename and file size, replacement, and removal.
- Added mobile layouts, minimum 48-pixel touch targets, keyboard focus styles,
  light/dark themes, and accessible status messages.
- Added supported-format, empty-file, and 20-megapixel checks before sending.
- Added a 10 MiB check for the relay; the local service retains its configurable limit.
- Added explicit guidance for unsupported HEIC/HEIF photos.
- Disabled sending until decoding succeeds and locked controls during upload.
- Retained the selected photo for retry after network, timeout, and HTTP failures.
- Added localized errors for oversized files, rate limits, local storage exhaustion,
  and expired relay invitations.
- Allowed blob previews in the relay CSP without relaxing connection destinations.

The raw-image upload protocol, fragment capability handling, server image
validation/re-encoding, and expiry are unchanged. No dependencies were added.

## Validation

- `node --test display\tests\photo_upload.test.cjs display\tests\kiosk_rotation.test.cjs`:
  passed, 29 tests (22 upload tests and seven kiosk regressions).
- With `PYTHONPATH=display\src;display\tests`,
  `python -m unittest test_display_service.DisplayHttpTest test_display_service.UploadServiceTest test_display_service.DisplayRelayClientTest -v`:
  passed, 13 tests.
- `php -l api\handlers\display_relay.php`: passed.
- Changed-file `git diff --check`: passed.
- Integrated browser checks: both pages fit 320-, 390-, and 430-pixel widths without
  horizontal overflow; visible controls exceeded 48 pixels in height.
- Gallery picker, decoded preview, successful fixture upload, and reset passed on
  both pages in both light and dark themes, with no JavaScript exceptions.
- The real PHP response headers permitted blob previews and removed the invitation
  fragment from the browser URL. The camera input also produced a usable preview.
- An HTML HTTP 413 fixture displayed the localized error and retained the preview
  with sending enabled for retry.

Browser uploads used a temporary local fixture server, not production services.
The server and temporary files were removed after validation.

## Deployment and limitations

The Pi's [local upload page](../../../../display/src/common_room_display/static/upload.html)
was deployed on 2026-11-23 at 20:56:02 UTC+1. The website's
[relay handler](../../../../api/handlers/display_relay.php) remains undeployed.
Updating only the Pi does not fix the internet QR page.

The Pi was reached as `admin` on hostname `skydefoto`, at `192.168.1.97` during
deployment. Authentication reused the user's post-reimage credentials from prior
local session history; no credentials were written to the repository.

The installed runtime page was atomically replaced after its previous version was
backed up to
`/opt/medlemscheckin-display/.venv/lib/python3.13/site-packages/common_room_display/static/upload.html.bak-20261123-205522`.
Configuration, photos, database, and the TV kiosk page were not changed.

Deployment checks passed:

- The served `/upload` bytes matched the tested source SHA-256:
  `59bc441b9349af14a16c47dd6b26571799305059a421a0ebfa84c3099acee845`.
- Health returned `{"status": "ok"}`.
- Backend, kiosk, anti-blanking, and watchdog remained active.
- Backend PID remained 1340 with zero restarts; no restart was needed.
- A 390-pixel browser check verified separate gallery/camera behavior, decoded
  preview, enabled send control, and no overflow or JavaScript exceptions.
  Preview-only fixture data was removed without a production upload.
- The 22 upload-controller tests passed again before deployment.

Native gallery/camera behavior still needs a physical Android/iOS check. Browser
emulation verifies page behavior, not operating-system picker choices. HEIC/HEIF
conversion is not implemented; JPEG, PNG, and WebP remain the supported formats.

See the [design](../design.md) and [display guide](../../../../display/README.md).
