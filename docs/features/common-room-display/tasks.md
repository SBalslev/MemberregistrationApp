# Common-room display - implementation tasks

**Feature:** Raspberry Pi common-room display
**PRD:** [prd.md](prd.md)
**Design:** [design.md](design.md)
**Status:** Not started
**Created:** 2026-08-31
**Last updated:** 2026-09-15 by sbalslev

## Delivery order

Build the read-only statistics path and offline kiosk before opening public uploads.
This allows the security boundary and Raspberry Pi performance to be tested early.

## Phase 1: Hardware and technical spike

- [ ] **1.1** Prepare a Raspberry Pi 2 Model B with Raspberry Pi OS Lite 32-bit.
- [ ] **1.2** Record available Python, Chromium, image-library, and service versions.
- [ ] **1.3** Verify 1280x720 and 1920x1080 HDMI output on the target TV.
- [ ] **1.4** Measure Chromium memory use with a minimal rotating slideshow.
- [ ] **1.5** Confirm `.local` access from representative Android and iOS phones.
- [ ] **1.6** Select the Python HTTP framework based on supported OS packages.
- [ ] **1.7** Confirm the club's privacy rule for abbreviated names, scores, and
  birthday greetings.

**Exit criteria:** The target image, runtime versions, display resolution, and
privacy assumptions are recorded. A minimal kiosk runs for eight hours without
failure.

## Phase 2: Public tablet display feed

- [x] **2.1** Add versioned display-feed DTOs that contain only allowed fields.
- [x] **2.2** Add a service that aggregates today's scores and counts.
- [x] **2.3** Add the inclusive birthday window from today through seven days ago.
- [x] **2.4** Reuse or extract abbreviated-name formatting without changing current
  celebration behavior.
- [x] **2.5** Add `GET /api/display/v1/feed` to the Android Ktor server.
- [x] **2.6** Add response size limits, request rate limiting, and local request
  logging for the public route.
- [x] **2.7** Add aggregation, year-boundary, leap-day, and empty-data tests.
- [x] **2.8** Add contract tests proving prohibited member fields are absent.
- [ ] **2.9** Verify existing authenticated sync routes still reject missing tokens.

**Implementation note (2026-08-31):** Main-source validation and focused display-
feed tests pass. Existing stale test constructors were updated with their required
`PolicyViolationDao` mock so the unit-test source set compiles.

**Exit criteria:** An unpaired client can read the display feed but cannot read or
write synchronized data. New scores appear in the feed within 30 seconds.

## Phase 3: Pi service and offline kiosk

- [x] **3.1** Create the `display/` component and dependency manifest.
- [>] **3.2** Add validated settings for tablet URL, poll interval, stale threshold,
  slide timings, and storage limits.
  Slide timing remains hardcoded in the first kiosk version.
- [x] **3.3** Poll, validate, and atomically cache the last valid display feed.
- [>] **3.4** Add SQLite media and settings storage with migrations.
  The media schema exists; versioned migrations and database-backed settings remain.
- [x] **3.5** Import permanent media from a configured SD-card directory.
- [x] **3.6** Build the combined playlist API.
- [x] **3.7** Build the full-screen kiosk page with photo and statistics slides.
- [x] **3.8** Add the upload QR code and stale-data indicator.
- [x] **3.9** Continue rotating cached statistics and photos while the tablet is
  offline.
- [x] **3.10** Add `systemd` units and automatic browser recovery.

**Exit criteria:** The Pi boots into the slideshow, survives a service or browser
restart, and works for 24 hours without the membership tablet.

## Phase 4: Public temporary photo upload

- [x] **4.1** Build the mobile upload page.
- [x] **4.2** Add bounded image request-body handling.
- [x] **4.3** Validate actual decoded type, file size, and pixel count.
- [x] **4.4** Correct orientation, remove metadata, resize, and re-encode images.
- [x] **4.5** Store files under random IDs using atomic writes.
- [x] **4.6** Add four-hour expiry and scheduled cleanup.
- [x] **4.7** Add per-client rate limiting and temporary-media disk quotas.
- [ ] **4.8** Add immediate-display and approval-first modes.
- [>] **4.9** Test malformed, oversized, duplicate, and metadata-bearing images.
  Malformed and metadata-bearing files are covered. Explicit oversized and duplicate
  cases remain.

**Exit criteria:** A valid phone upload joins the slideshow, invalid content is
rejected, metadata is removed, and temporary media expires automatically.

## Phase 5: Trainer moderation

- [x] **5.1** Add trainer credential setup with a salted hash.
- [x] **5.2** Add authenticated sessions and protection for state-changing requests.
- [>] **5.3** Build media lists for active, pending, permanent, paused, and expired
  records.
  Active temporary and permanent media are available in the trainer UI. Other
  states await approval and pause support.
- [>] **5.4** Add delete, approve, reject, pause, resume, and extend actions.
  Deletion is complete. Approval, pause, resume, and extension remain.
- [x] **5.5** Add promotion from temporary to permanent.
- [ ] **5.6** Add settings for expiry, rotation timing, and upload mode.
- [ ] **5.7** Record moderation actions in a bounded local audit log.
- [x] **5.8** Verify public clients cannot access any moderation operation.

**Exit criteria:** A trainer can remove a displayed photo within 15 seconds, and an
unauthenticated client cannot change media or settings.

## Phase 6: Deployment and pilot

- [>] **6.1** Add an idempotent Pi installation and upgrade script.
  The installer was run successfully on Raspberry Pi OS 13. The available test
  device was a Raspberry Pi Zero W, whose ARMv6 CPU lacks the NEON support required
  by current Chromium releases. The same installer was subsequently validated on a
  Raspberry Pi 4 Model B Rev 1.5, where the backend, X server, Chromium kiosk, and
  Avahi run successfully with zero service restarts.
- [>] **6.2** Document imaging, Wi-Fi, DHCP reservation, TV setup, credentials,
  backup, and recovery.
  Software installation, addressing, credentials, backup, and recovery are
  documented. Hardware imaging and TV-specific setup await the physical device.
- [ ] **6.3** Add log rotation, free-space monitoring, and startup orphan cleanup.
- [ ] **6.4** Run a 48-hour Raspberry Pi 2 hardware soak test.
- [ ] **6.5** Test cold boot, abrupt power loss, network loss, and tablet replacement.
- [ ] **6.6** Test the QR flow on representative Android and iOS devices.
- [ ] **6.7** Run a one- or two-week common-room pilot.
- [ ] **6.8** Review upload misuse, readability, timing, and moderation workload.
- [ ] **6.9** Decide whether approval-first mode or member display preferences are
  needed before general use.
- [x] **6.10** Add DHCP-safe LAN discovery for the member-tablet feed and Pi upload
  URL.
  - **Started:** 2026-09-15 17:23:31 UTC+2
  - **Completed:** 2026-09-15 17:50:37 UTC+2
  - **Duration:** 27m 6s
  - Reused the member tablet's existing mDNS advertisement without pairing the Pi.
    The Pi upload QR now uses its Avahi `.local` hostname by default.
- [x] **6.11** Add an internet photo relay with rotating capability URLs.
  - **Started:** 2026-09-15 18:37:46 UTC+2
  - **Completed:** 2026-09-15 22:28:00 UTC+2
  - **Production activated:** 2026-09-15 23:12:11 UTC+2
  - **Duration:** 3h 50m 14s
  - Added an HTTPS store-and-forward queue on `iss-skydning.dk`, a mobile upload
    page, hourly invitation rotation, outbound-only Pi delivery, acknowledgments,
    poison-image rejection, bounded quotas, and four-hour retention.
  - Raspberry Pi 4 deployment and the internet relay are active. Production API
    1.9.0, database schema 1.9.0, invitation rotation, cloud upload, Pi delivery,
    acknowledgment, and test-photo cleanup were verified end to end.
- [x] **6.12** Recover and reinstall the reset Raspberry Pi 4.
  - **Started:** 2026-09-28 19:45:59 UTC+2
  - **Completed:** 2026-09-28 21:18:54 UTC+2
  - **Duration:** 1h 32m 55s
  - Reinstalled the backend, Chromium kiosk, Avahi discovery, and cloud relay
    credential on the reset Debian 13 image.
  - Disabled LightDM, activated VT7 before Xorg startup, and added a delayed
    anti-blanking service to avoid the Raspberry Pi framebuffer initialization
    race.
  - Verified a cold boot with Wi-Fi, HDMI, Xorg, Chromium, the backend, Avahi, and
    anti-blanking active with zero service restarts.
  - Verified a production cloud upload reached the Pi in 10 seconds and removed
    the test photo afterward.
- [x] **6.13** Activate the member-tablet statistics feed in production.
  - **Started:** 2026-09-28 21:20:24 UTC+2
  - **Completed:** 2026-09-28 21:48:34 UTC+2
  - **Duration:** 28m 10s
  - Identified that `Medlemmer 1` advertised correctly but returned `404` for the
    display-feed route because it was still running app version 1.3.32.
  - Built and installed member release 1.3.34 without modifying the separately
    advertised trainer tablet.
  - Verified the live feed and Pi cache contain current participation counts,
    leaderboards, recent scores, and personal bests.
- [x] **6.14** Add automatic recovery for a frozen or disconnected display.
  - **Started:** 2026-10-03 08:50:50 UTC+2
  - **Completed:** 2026-10-03 10:30:00 UTC+2
  - **Duration:** 1h 39m 10s
  - Confirmed the membership tablet supplied the current club date while the Pi
    was absent from the LAN and Chromium continued showing its last rendered
    state.
  - Added a one-minute watchdog that probes the full playlist, restarts an
    unresponsive backend and its dependent kiosk, and reconnects Wi-Fi when the
    gateway is unreachable.
  - Enabled persistent journaling so service and network evidence survives a
    reboot.
  - Verified production feed polling every 15 seconds, four-hour photo expiry, a
    forced backend-and-kiosk recovery, and subsequent successful scheduled
    watchdog runs.

**Exit criteria:** The pilot has no unresolved privacy or reliability blocker, and
trainers have a tested recovery procedure.

## Definition of done

- [ ] All PRD success criteria pass on Raspberry Pi 2 hardware.
- [ ] The public feed exposes no raw member or sync entity.
- [ ] Public uploads are bounded, re-encoded, and automatically expired.
- [ ] Trainer deletion and authentication tests pass.
- [ ] Existing Android sync tests and app build pass.
- [ ] Pi unit, browser, recovery, and soak tests pass.
- [ ] Deployment and trainer operations documentation is complete.
- [ ] `FEATURE_STATUS.md` marks the feature complete.
