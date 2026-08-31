# Common-room display - implementation tasks

**Feature:** Raspberry Pi common-room display
**PRD:** [prd.md](prd.md)
**Design:** [design.md](design.md)
**Status:** Not started
**Created:** 2026-08-31
**Last updated:** 2026-08-31 by sbalslev

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
  The installer is implemented and shell-validated but not yet run on Pi hardware.
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
