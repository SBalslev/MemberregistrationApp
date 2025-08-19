# ISS Skydning Registrering

Android kiosk app for a shooting club: QR-based member check-in, practice session scoring, leaderboard, and CSV import/export. Built with Jetpack Compose, Room, and Hilt.

## Current Status (as of 2025-08-19)
- End-to-end app implemented: Ready (scanner), Confirmation, Practice Session, Resultatliste, Import/Export, Admin Menu.
- CameraX + ML Kit QR scanning wired to scan flow.
- Room database with DAOs for Members, CheckIns, PracticeSessions, ScanEvents.
- CSV import/export working, ZIP export includes manifest.txt; share via FileProvider.
- Kiosk UX: immersive sticky, portrait lock, keep-screen-on, idle timers.
- Build is green on Gradle 8.7, AGP 8.5.0, Kotlin 1.9.23, Hilt 2.49.

## Build & Run
Open in Android Studio (Ladybug/Koala compatible). Sync Gradle and run the `app` configuration.

### CLI Build (Windows PowerShell)
```
./gradlew.bat :app:assembleDebug
```
APK output: `app/build/outputs/apk/debug/app-debug.apk`

### Install to device/emulator
```
./gradlew.bat :app:installDebug
```

## Toolchain Versions
- Gradle Wrapper: 8.7
- Android Gradle Plugin: 8.5.0
- Kotlin: 1.9.23 (Kotlin Compiler Extension 1.5.11)
- Hilt: 2.49 (Gradle plugin applied; dependencies aligned)
- Compose BOM: 2024.05.00; Material3 1.2.1

## Features
- Scan: QR code reads membershipId from `id=` query param; first scan creates CheckIn; repeat scans go to session form and log ScanEvent.
- Confirmation: 5s auto-return; buttons for Done or Add Practice Score.
- Practice Session: modernized Material 3 form with segmented discipline selector; points (required) and krydser (optional) use numeric keyboards; validation and idle cancel (60s). Top bar shows member identity as `membershipId – Name` with a live idle countdown. “Mine resultater” opens a bottom sheet showing the last 12 months for the selected discipline across all classifications, segmented by classification (null shown as “Uklassificeret”), highlights top 3 best overall, summarizes counts/best, and formats dates as Danish dd-MM-yyyy.
- Resultatliste (Leaderboard): Today, This Month, or Last 12 months; grouped by discipline and classification. For each classification: top 10 best (one per member), sorted by points, krydser, timestamp. Empty classification groups and disciplines with no entries are hidden. Legacy/null classification entries appear under “Uklassificeret”. Loads automatically when opening the screen.
- Ready screen split view: camera preview uses top half; bottom half shows a compact multi-discipline leaderboard in two columns. For each classification, shows the 3 most recent sessions. Empty groups and disciplines are hidden. Quick toggle to switch front/rear camera (buttons labeled “Front” / “Bagside”).
	- A banner between camera and leaderboard instructs: “Hold dit medlemskort foran kameraet for at scanne”.
- CSV: Import members with dedupe/overwrite rules; export all tables; ZIP share with manifest rows per file.
- Admin Mode (Attendant): 4-digit PIN unlock; auto re-lock after inactivity.
	- Shortcut: scanning membership ID 99000009 on the Ready screen auto-unlocks Admin and opens the Admin menu.

## Notes
- Some deprecated APIs are used for immersive mode and Accompanist FlowRow; acceptable for Android 9 target. Migrate to WindowInsetsController and Compose Foundation FlowRow later.
- App theme is Material3; adaptive launcher icons included.

### Localization
- UI language: Danish. Key labels mapping: “Resultatliste” = Leaderboard, “Admin” = Attendant. Camera toggle buttons: “Front” / “Bagside”.
- Dates in UI use Danish format dd-MM-yyyy via a shared formatter; storage remains UTC timestamps + LocalDate.

## Changelog
- v1.3.7 (2025-08-19): Practice Session UI refresh; personal “Mine resultater” across classifications segmented by classification; Danish date formatting in UI; docs updated.
- v1.3.6 (2025-08-19): Added “Sidste 12 mdr.” leaderboard range; docs refresh; launcher icon update.

## License
MIT License © 2025 Balslev.biz (CVR 32402402)

You may use, copy, modify, and distribute this software under the terms of the MIT License. Please retain the copyright notice and license text in
redistributions. See `LICENSE` for the full text.
