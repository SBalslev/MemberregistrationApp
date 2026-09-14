# Common-room display software MVP - completion summary

**Completed:** 2026-08-31
**Completed by:** sbalslev
**Status:** Software MVP complete; Raspberry Pi hardware validation pending

## What was implemented

- Public Android display feed with allowlisted serializable models.
- Daily counts, recent scores, top scores, personal bests, and recent birthdays.
- Abbreviated display names and inactive-member filtering.
- Separate feed rate limiting and request logging without weakening sync security.
- Python service with validated configuration and cached tablet-feed polling.
- Full-screen kiosk, QR upload entry point, and permanent photo discovery.
- Temporary photo upload with type, size, pixel, quota, and rate limits.
- Image orientation correction, resizing, JPEG re-encoding, and metadata removal.
- Four-hour temporary media expiry with scheduled background cleanup.
- Trainer PIN hashing, session cookies, CSRF protection, deletion, and promotion.
- Raspberry Pi OS Lite installer and `systemd` services.

## Design decisions

The Pi remains outside the trusted device-sync mesh. The tablet publishes only a
small display projection, and public uploads terminate on the Pi. Trainer
moderation uses a local PIN hash and does not depend on member or trainer records.

The upload page sends the selected image as a bounded raw request body instead of
multipart form data. This avoids a multipart parser dependency on the Raspberry Pi
while preserving the same phone workflow.

## Validation

- `:app:compileMemberDebugKotlin` passed.
- Focused Android display-feed tests passed after stale existing test constructors
  were updated with their required mock dependency.
- All 16 Python tests passed.
- Python source compilation passed.
- Both deployment shell scripts passed `bash -n`.
- `systemd` files passed required-directive checks.
- Playwright verified the kiosk at 1920 by 1080 with no overflow or console errors.
- Playwright verified upload and trainer pages at 390 by 844 with no horizontal
  overflow or console errors.

## Remaining work

- Test installation, cold boot, HDMI behavior, and Chromium performance on the
  Raspberry Pi 2 and target TV.
- Add approval-first uploads, pause/resume, expiry extension, and configurable slide
  timing.
- Add background expiry scheduling, audit-log retention, and free-space monitoring.
- Run phone compatibility, power-loss, soak, and common-room pilot tests.

## Hardware deployment update

On 2026-09-14, the installer and backend service were validated on Raspberry Pi OS
13. The available board identified itself as a Raspberry Pi Zero W Rev 1.1, not a
Raspberry Pi 2. Its ARMv6 CPU lacks the NEON SIMD support required by the packaged
Chromium release, so the browser kiosk cannot run on that board. The backend,
display page, upload page, and trainer page remained reachable over the network.
