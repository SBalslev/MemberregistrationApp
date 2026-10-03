# Common-room display software MVP - completion summary

**Completed:** 2026-08-31
**Completed by:** sbalslev
**Status:** Software MVP and Raspberry Pi 4 deployment complete; pilot validation pending

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

## LAN discovery update

**Started:** 2026-09-15 17:23:31 UTC+2
**Completed:** 2026-09-15 17:50:37 UTC+2
**Duration:** 27m 6s
**Last updated:** 2026-09-15 17:50:37 UTC+2

The display now discovers member tablets through the existing
`_medlemssync._tcp.local.` advertisement and filters on `MEMBER_TABLET`. It still
uses only the public display-feed route and does not join the trusted sync mesh.
The upload QR uses the Pi's Avahi `.local` hostname by default, so moving the
system between DHCP networks no longer requires editing IP addresses.

## Internet photo relay update

**Started:** 2026-09-15 18:37:46 UTC+2
**Completed:** 2026-09-15 22:28:00 UTC+2
**Duration:** 3h 50m 14s
**Production activated:** 2026-09-15 23:12:11 UTC+2
**Last updated:** 2026-09-15 23:12:11 UTC+2

Members no longer need to join the club network to upload a display photo. The TV
shows an hourly, unguessable HTTPS capability URL hosted by `iss-skydning.dk`.
Uploads enter a four-hour bounded queue, and the Pi retrieves them over outbound
HTTPS using its own credential. No public inbound connection to the Pi is needed.

The implementation includes per-invitation and per-client quotas, image type and
dimension checks, local re-encoding and metadata removal, idempotent ingestion,
delivery acknowledgment, and explicit rejection so malformed media cannot block
later photos.

The display build was installed on a Raspberry Pi 4 Model B Rev 1.5 running
64-bit Debian 13. Avahi, the Python backend, Xorg, and Chromium kiosk all started
successfully with zero restarts. A real HTTP photo upload returned `201`, appeared
in the playlist, and was removed after validation.

The production relay was activated on `iss-skydning.dk` with API and database
schema version 1.9.0. The Pi created a rotating invitation, a real cloud upload
returned `201`, and the photo reached the Pi in 10 seconds. The processed photo
returned `200` from the Pi, the cloud queue was empty after acknowledgment, and the
test photo was removed.

## Reset-device recovery update

**Started:** 2026-09-28 19:45:59 UTC+2
**Completed:** 2026-09-28 21:18:54 UTC+2
**Duration:** 1h 32m 55s
**Last updated:** 2026-09-28 21:18:54 UTC+2

The Raspberry Pi 4 was reinstalled after its operating system was reset. The
installer restored the backend, Chromium kiosk, Avahi discovery, and cloud relay
configuration on Debian 13.

The kiosk now activates VT7 before starting Xorg. This prevents `systemd-logind`
from returning paused DRM devices and avoids the legacy framebuffer fallback that
caused a black screen. A separate delayed one-shot service disables X11 screen
blanking after Xorg is stable.

A final cold boot verified Wi-Fi, HDMI, Xorg, Chromium, the backend, Avahi, and the
anti-blanking service with zero restarts. The health endpoint returned `ok`, the
public relay QR decoded successfully, and a real cloud photo reached the Pi in 10
seconds before test cleanup.

## Production statistics-feed activation

**Started:** 2026-09-28 21:20:24 UTC+2
**Completed:** 2026-09-28 21:48:34 UTC+2
**Duration:** 28m 10s
**Last updated:** 2026-09-28 21:48:34 UTC+2

The Pi discovered `Medlemmer 1` correctly, but the tablet's app version 1.3.32
returned `404` for `/api/display/v1/feed`. Member release 1.3.34 was built, tested,
and installed in place without changing the separately advertised trainer tablet.

The production feed now returns schema version 1 with current participation
counts, pistol and rifle leaderboards, recent scores, and personal bests. The Pi
reports the statistics as available and fresh.

## Automatic recovery update

**Started:** 2026-10-03 08:50:50 UTC+2
**Completed:** 2026-10-03 10:30:00 UTC+2
**Duration:** 1h 39m 10s
**Last updated:** 2026-10-03 10:30:00 UTC+2

The TV retained Monday's browser state after the Pi became unreachable on the
club network. The membership tablet was healthy and already supplied the current
club date, which isolated the failure to the Pi rather than the display-feed
aggregation.

A one-minute systemd watchdog now requests the full local playlist. It restarts
the backend and its dependent Chromium kiosk if playlist assembly stops
responding, then reapplies the anti-blanking settings. It reconnects `wlan0` when
the local gateway is unreachable. The installer also creates persistent journal
storage so future failures retain service and network logs across reboot.

Production validation deliberately stopped the backend. The final recovery test
replaced backend process `3915` with `5542` and kiosk process `4428` with `5562`,
restored the playlist and full-screen display, and completed subsequent scheduled
checks successfully. The Pi then returned a fresh tablet snapshot with the
current club date. Existing uploads were expired correctly, and a newly delivered
relay photo retained its expected four-hour lifetime.

## Activity display deployment

**Deployed:** 2026-10-03 11:40:19 UTC+2

**Last updated:** 2026-10-03 11:40:19 UTC+2 by sbalslev

The production Pi received the activity-aware kiosk renderer. The deployment
preserved its configuration, database, and media. Backend, kiosk, and anti-blanking
services restarted cleanly with zero restart failures. External validation
confirmed a healthy backend, a fresh membership feed, and the new activity and
visiting-club rendering code.
