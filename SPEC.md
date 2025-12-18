# ISS Skydning Registrering – Functional & Technical Specification (MVP)

Version: 1.4.0 (Performance optimizations + QR diagnostics)
Last Updated: 2025-12-18

## 1. Value Proposition
Self‑service kiosk Android app for a shooting club that lets members instantly check in by scanning a QR code on their membership card and record multiple practice scoring sessions (rifle/pistol variants) during the same day—fully offline with simple CSV import/export.

## 2. Personas & Modes
| Persona | Description | Capabilities |
|---------|-------------|--------------|
| Member (Kiosk User) | Walks up to kiosk to scan card and optionally enter practice score | Scan QR, view confirmation, enter practice session data |
| Attendant (UI label: Admin) | Staff/authorized person unlocking advanced controls | All kiosk functions + data edit/delete, CSV import/export, leaderboard view |

Modes:
- Kiosk Mode (default): Locked UI, large touch targets, camera auto-active, no destructive actions.
- Attendant Mode (UI: Admin): Unlocked via 4-digit PIN (default 3715 on first launch, stored hashed in SharedPreferences). PIN can be changed in the Admin menu. Auto re-lock after 60s inactivity. Also supports auto-unlock when scanning a special attendant badge (see §3.11).

## 3. Core User Flows (MVP)
### 3.1 First Scan of Day
1. Camera active (Ready screen).
2. User scans card (QR → URL with `id=<membershipId>`).
3. Parse membershipId; lookup member locally.
4. If found & no CheckIn today: create CheckIn + ScanEvent(FIRST_SCAN, linkedCheckInId).
5. Show Confirmation Screen (5s auto timeout): Member name + buttons [Done] [Add Practice Score].
6. If Add Practice Score → Practice Session Form.

### 3.2 Repeat Scan (Same Day)
1. Scan → create ScanEvent(REPEAT_SCAN) immediately.
2. Jump straight to Practice Session Form.
3. On Save: create PracticeSession; update ScanEvent.linkedSessionId.
4. On Cancel (after 60s idle or manual): set ScanEvent.canceledFlag = true (no PracticeSession).

### 3.3 Practice Session Form
Fields: Practice Type (enum), Classification (required per discipline), Points (required Int ≥0), Krydser (optional Int ≥0).  
UI: Top app bar with title, member identity shown as `membershipId – Name`, and a live idle countdown. Practice Type uses a segmented selector; inputs are grouped in a card with Material 3 components. Numeric keyboards for Points/Krydser.  
Buttons: Gem (Save) / Annuller (Cancel) / Mine resultater (My results).  
Idle 60s → auto Cancel.

Mine resultater (bottom sheet):
- Available without selecting a Classification (uses the current Practice Type only).
- Shows the member’s sessions for the last 12 months across all classifications for the selected Practice Type.
- The list is segmented by Classification (null/legacy entries labeled “Uklassificeret”), each segment sorted by newest first; highlights the top 3 best scores overall (tie-break: points DESC, krydser DESC, createdAtUtc DESC).
- Includes a small summary (total count and best score/date). Dates are formatted in Danish style (dd-MM-yyyy).
- Closing the sheet returns to the form; the overall 60s idle timeout still applies and will cancel as usual.
### 3.4 Leaderboard (UI: Resultatliste) – Attendant/Admin Mode
- Select Time Range: Today | This Month | Last 12 months ("Sidste 12 mdr.").
- Grouping: For each Practice Type, entries are grouped by Classification. Empty classification groups are hidden; entire disciplines with no visible entries are also hidden.
- For each Classification: Top 10 best scores (one per member). Sort: Points DESC, Krydser DESC, createdAt DESC.
- Legacy/null classifications are labeled and grouped under “Uklassificeret”.
- Row label: `membershipId – FirstName LastName` when available; fallback `membershipId` only.
- Back navigation uses an icon-only button.
- Excludes zero Points sessions.

### 3.8 Ready Screen Embedded Leaderboard (Kiosk)
- The Ready screen now splits the viewport: top half shows the camera preview for scanning; bottom half shows a compact leaderboard.
- Compact leaderboard displays multiple disciplines simultaneously in a two-column grid. Under each discipline card, entries are grouped by Classification and show up to 3 most recent sessions per classification (defaults to Today range). Empty classification groups are hidden; disciplines with no visible entries are hidden. Legacy/null classifications appear as “Uklassificeret”.
- A quick front/rear camera toggle is available from the bottom bar (buttons labeled “Front” and “Bagside”). Default lens at startup is the front-facing camera.
- Between camera and leaderboard, show an instruction banner: “Hold dit medlemskort foran kameraet for at scanne”.
### 3.12 QR Scanner Diagnostics (v1.4.0)
- Diagnostic mode can be toggled on/off in the Admin menu (disabled by default for clean kiosk UI).
- When enabled, a bug icon (🐞) overlay appears on the camera preview for troubleshooting scanning issues.
- Tapping the icon opens a diagnostic panel showing:
  - Camera initialization status and any errors
  - Frame processing statistics (frames processed, scan attempts, successful scans)
  - Current camera selection (Front/Back)
  - Resolution information
  - Last scan details (text preview, timestamp)
  - Pipeline stage tracking (camera lifecycle)
  - Android version
  - Embedded troubleshooting tips based on current state
- The panel can be dismissed with a close button (X icon) in the top-right.
- A reset button clears diagnostic history counters.
- Diagnostic updates are throttled (every 30 frames) to minimize performance impact.
- The diagnostic toggle preference persists across app restarts.
### 3.9 Manual Scan (Attendant)
1. Open "Manuel scanning" from Admin.
2. Search for a member by name/ID or enter an explicit membership ID.
3. Confirm to perform the same logic as a QR scan:
  - If no check-in exists today → create CheckIn and a FIRST_SCAN ScanEvent.
  - Otherwise → create a REPEAT_SCAN ScanEvent.
4. On success, show a choice dialog:
  - "Tilføj skydning": navigate to Practice Session form for that member (scanEventId is passed and linked on save).
  - "Færdig": remain on Admin; only the check-in/repeat scan is recorded.
5. If it's the member's birthday (today or since last check-in), play a short tone and show a Danish greeting.

### 3.10 Admin Menu (Flattened, Kiosk-Friendly)
- Single page with large buttons; no subpages.
- Actions:
  - Import / eksport (CSV) (now also contains a Maintenance card with Generér demodata + Ryd data)
  - Resultatliste
  - Manuel scanning
  - Skift PIN (change 4-digit admin PIN; validates current PIN and 2x new PIN match)
  - Vis diagnostik (toggle QR scanner diagnostics icon on/off; default off for clean kiosk UI)
  - Log ud (locks and returns to Ready; the sole exit from Admin)
  - Om (About) shown as a text button at bottom (out of primary action grid)
- There is no separate back button on the Admin screen when unlocked; use "Log ud" to leave.

### 3.11 Attendant Auto Unlock (Special Badge)
- Scanning membership ID `99000009` on the Ready screen instantly unlocks Admin mode programmatically and navigates to the Admin menu.
- No CheckIn or ScanEvent is created for this scan; it is purely a control action to ease kiosk operations for staff.
- The standard 60s inactivity auto-lock still applies while in Admin.
- This feature is offline-only and relies on the local kiosk configuration; the special ID can be changed in code in a future release if needed.

### 3.5 CSV Import (Members)
1. Attendant chooses CSV file.
2. Validate headers, scan for duplicates (same membershipId). Duplicates → skipped (report) (import continues). 
3. For each unique row: overwrite existing member fields (non-empty cells only). Empty cells ignored (keep existing values). 
4. After processing, any existing member not listed → mark status=INACTIVE (inactiveAt timestamp).
5. Present summary: total rows, imported, skipped duplicates, newly inactive count, errors.

### 3.6 CSV Export
- Members, PracticeSessions, CheckIns, ScanEvents.
- File naming: `<type>_YYYYMMDD_HHmmss.csv` (removed `_export_` prefix for brevity in UI preview buttons).
- Each CSV includes column `FORMAT_VERSION` (value `1`).
- All timestamps UTC ISO 8601 (`...Z`). Additional `local_date` column where relevant.
- Save location: file is written to app-private `externalFilesDir/exports` AND copied to public `Downloads/Medlemscheckin/` (shown in Toast). If public copy fails, internal path still usable for sharing.
  - Maintenance actions (Generate demo data / Clear data) were moved from Admin root into Import/Eksport screen in v1.3.9.
  - Android 10+ (Q): via MediaStore Downloads relative path.
  - Android 9 and below: direct write to public `Downloads/Medlemscheckin` (permission present for ≤28).
- UI now offers per-CSV preview (expand/collapse) with first rows and row count (excluding header) plus clear button.
- Batch ZIP export: `export_bundle_YYYYMMDD_HHmmss.zip` with individual CSVs + `manifest.txt` (rows per file) saved both internally and to public Downloads.

### 3.7 Attendant CRUD
- Edit or delete (soft-delete recommended future; MVP may perform hard delete) Members, PracticeSessions, CheckIns, ScanEvents.
- Deleting first-of-day CheckIn does NOT invalidate attendance if at least one PracticeSession exists that day.

## 4. Data Model (Room Entities – MVP)
(Note: Soft-delete fields optional MVP; flagged for Phase 2.)

### 4.1 Member
- membershipId (String, PK)
- firstName (String)
- lastName (String)
- email (String?)
- phone (String?)
- status (enum ACTIVE|INACTIVE) – default ACTIVE
- expiresOn (LocalDate?)
- updatedAtUtc (Instant)

### 4.2 CheckIn
- id (UUID, PK)
- membershipId (FK Member)
- createdAtUtc (Instant)
- localDate (LocalDate) – derived (device local midnight boundary)
- firstOfDayFlag (Boolean = true always; only one per member per localDate)

### 4.3 PracticeSession
- id (UUID)
- membershipId (FK Member)
- createdAtUtc (Instant)
- localDate (LocalDate)
- practiceType (enum: Riffel | Pistol | Luft Riffel | Luft Pistol | Andet)
- points (Int ≥0) REQUIRED
- krydser (Int? ≥0) OPTIONAL (null if absent)
- source (enum kiosk|attendant)

### 4.4 ScanEvent
- id (UUID)
- membershipId (FK Member)
- createdAtUtc (Instant)
- type (enum FIRST_SCAN | REPEAT_SCAN)
- linkedCheckInId (UUID?)
- linkedSessionId (UUID?)
- canceledFlag (Boolean, default false)

### 4.5 Potential Future Fields (Phase 2)
- deletedAtUtc, deletedBy
- notes (PracticeSession)
- deviceId
- auditUser (attendant actions)

### 4.6 Indexing Plan (Implemented in v1.4.0)
- Member: index (status), index (membershipId)
- CheckIn: composite index (membershipId, localDate)
- PracticeSession: index (membershipId), index (localDate), composite index (practiceType, localDate), composite index (membershipId, practiceType, classification)
- ScanEvent: composite index (membershipId, createdAtUtc)

These indices dramatically improve query performance for leaderboards, member lookups, and historical data retrieval. The composite indices are particularly effective for filtered queries combining multiple fields.

## 5. Business Rules
- Only one CheckIn per member per localDate; attempts to create second should be prevented (Repeat path uses Sessions only).
- Attendance for a day = existence of CheckIn OR ≥1 PracticeSession for that member that day.
- First scan always generates CheckIn + ScanEvent(FIRST_SCAN).
- Repeat scan always creates a ScanEvent(REPEAT_SCAN) regardless of outcome; if user cancels session, canceledFlag=true.
- Points required; Krydser optional. Zero-point sessions excluded from leaderboard.
- Membership QR parsing: extract integer after `id=` parameter in URL (must match `[0-9]+`). Ignore other params.
- Idle timeouts: Confirmation 5s → Ready; Form 60s → cancel.

## 6. Validation & Error Handling
| Context | Validation | Error UX |
|---------|------------|----------|
| Scan parsing | Must extract membershipId; if not numeric or not found locally | "Medlem ikke fundet" screen + auto reset after 5s |
| Practice form | practiceType required; points required >=0; krydser if provided >=0 | Inline field error + disable Save |
| CSV import | Header presence, duplicate IDs, invalid membershipId format | Import summary with counts + downloadable log |
| Leaderboard | None (empty states) | Display friendly empty state text |

## 7. Security (MVP)
- 4-digit PIN stored hashed (SHA-256, unsalted MVP) in SharedPreferences; default seeded to 3715 on first launch. PIN can be changed in Admin menu (requires current PIN + 2x new match). Auto re-lock after 60s inactivity in attendant UI.
- Programmatic unlock path: scanning special attendant badge `99000009` triggers an immediate unlock (no PIN) and navigates to Admin. This does not write any data.
- Unlimited attempts (flagged risk). Phase 2: hashed + attempt lockout + biometric.
- No network; no external auth.
- Data stored unencrypted (Phase 2 optional SQLCipher or EncryptedFile).

## 8. Accessibility & UX
- Touch targets ≥56dp (minimum 48dp).
- Support system font scaling up to 200% (Compose `TextUnit.Sp` + responsive layout, test large font).
- High contrast color scheme; kiosk screens simple, minimal text.
- Visual scan success feedback (green highlight, check icon).
- Ensure split layout remains readable at 200% font scaling (cards wrap, grid remains two columns on tablet portrait).

## 9. Localization
- MVP: Danish UI. Keep string resource keys in English to ease future English addition.
- UI labels: “Resultatliste” (Leaderboard), “Admin” (Attendant), camera toggle “Front” / “Bagside”.
- Date formatting: local date (device locale) for display; store UTC + localDate.
 - Date display convention: format LocalDate in UI as Danish dd-MM-yyyy (use a shared formatter); CSV exports remain ISO.

## 10. Ownership & Licensing
- Owner: Balslev.biz (CVR 32402402).
- License: MIT License. Free to use, copy, modify, distribute with attribution (retain copyright and license).
- See LICENSE file for details.

## 10. Performance Targets
- Scan decode + member lookup <300ms on mid-range device.
- Confirmation screen transition <150ms.
- Leaderboard query <400ms for 1 year of data (500 daily scans assumption).
- DB Size Expectations: 500 scans/day ~ (365 * 500) ~ 182,500 ScanEvents/year. Index plan must remain performant.

## 11. CSV Specifications
### 11.1 Members Import CSV
Headers (order flexible but recommended):  
`FORMAT_VERSION,membership_id,first_name,last_name,email,phone,status,expires_on,birth_date,updated_at_utc`

Rules:
- FORMAT_VERSION: exporter uses `2`. Importer accepts `1` or `2`; when `birth_date` is missing (v1 files), it’s ignored.
- Required fields: `FORMAT_VERSION`,`membership_id`,`first_name`,`last_name`,`status`.
- Optional fields: `email`,`phone`,`expires_on`,`birth_date`,`updated_at_utc`.
- Empty cell => retain existing stored value for that field (merge behavior).
- Missing membership_id after import => mark as INACTIVE.
- Duplicate membership_id rows in the same file are skipped and reported.
- Date formats: `birth_date` must be ISO local date `yyyy-MM-dd`; `expires_on` ISO local date string.

### 11.2 Export CSVs (examples)
Members (v2): `FORMAT_VERSION,membership_id,first_name,last_name,email,phone,status,expires_on,birth_date,updated_at_utc`  
PracticeSessions: `FORMAT_VERSION,session_id,membership_id,created_at_utc,local_date,practice_type,classification,points,krydser,source`  
CheckIns: `FORMAT_VERSION,checkin_id,membership_id,created_at_utc,local_date`  
ScanEvents: `FORMAT_VERSION,scan_event_id,membership_id,created_at_utc,type,linked_checkin_id,linked_session_id,canceled_flag`

Null Handling: Optional fields blank (empty string). All timestamps UTC ISO 8601 `Z`.

## 12. Leaderboard Logic
- Time Ranges: Today (current localDate), This Month (first day of month → current localDate), Last 12 months (from the first day of the month 11 months prior → current localDate).
- Grouping: First by PracticeType, then by Classification. Empty classification groups are hidden. Entire disciplines with no visible entries are hidden.
- Legacy sessions without a classification are grouped under the label “Uklassificeret”.

### v1.3.3 (Personal history in session + FlowRow migration)
- Practice Session screen adds a "Mine resultater" bottom sheet to view personal history for the last 12 months for the selected discipline/classification, with top 3 best highlighted, a summary (count + best), and in-sheet classification selector.
- Migrated UI chip layout from Accompanist FlowRow to Compose Foundation FlowRow to remove deprecations.
- Best (full leaderboard): Within each classification, consider the best session per member in the range, sort by points DESC, krydser DESC, createdAtUtc DESC; take top 10.
- Recent (Ready compact): Within each classification, take top 3 most recent sessions (points > 0) sorted by createdAtUtc DESC.
- Display: `membershipId – FirstName LastName` when available; fallback `membershipId` only.

## 13. Architecture (MVP)
  - UI: Jetpack Compose.
  - Navigation: Single-Activity (Navigation Compose) with screens: Ready, Confirmation, PracticeSessionForm, Leaderboard, ImportExport, AttendantMenu.
  - Camera & QR: ZXing DecoratedBarcodeView with native barcode scanning (offline decode). Front camera is the default at startup.
- State: ViewModel per screen, unidirectional data flow. Uses `derivedStateOf` for computed values to prevent unnecessary recompositions.
- Persistence: Room DB, DAOs for each entity with strategic indices for performance.
- DI: Hilt.
- Concurrency: Kotlin Coroutines + Flows.
  - Time: kotlinx-datetime for dates/times; `Instant.now()` with device zone for `localDate` derivation.

## 14. Key Components
| Layer | Component | Responsibility |
|-------|-----------|----------------|
| UI | ReadyScreen | ZXing camera preview + scan callback + compact multi-discipline leaderboard + camera toggle + diagnostics overlay |
| UI | ConfirmationScreen | Show first scan success + options |
| UI | PracticeSessionForm | Capture scoring inputs + personal history bottom sheet |
| UI | LeaderboardScreen | Display top scores grouped by discipline and classification |
| UI | ImportExportScreen | CSV import/export actions (attendant) + maintenance tools |
| Data | MemberDao | CRUD + search (id, name, email, phone) + bulk name loading |
| Data | CheckInDao | Enforce one per day per member |
| Data | PracticeSessionDao | Insert, query by date/type, leaderboard aggregates with indices |
| Data | ScanEventDao | Insert & update (canceledFlag, linkedSessionId) |
| Domain | LeaderboardRepository | Aggregate best per member with optimized queries |
| Domain | ScanProcessor | Parse QR, orchestrate flow (first vs repeat) |
| Domain | CsvFileExporter / CsvImporter | Export/import CSVs and ZIP with manifest |

## 15. ViewModel State Examples
### 15.1 ReadyViewModel State
- scanningEnabled:Boolean
- lastScanError:String?

### 15.2 ConfirmationViewModel State
- memberName:String
- membershipId:String
- countdownSeconds:Int

### 15.3 PracticeSessionForm State
- memberName:String
- membershipId:String
- practiceType:PracticeType?
- pointsInput:String
- krydserInput:String
- isSaving:Boolean
- formError:String?
- idleCountdown:Int

### 15.4 Leaderboard State
- timeRange:TimeRange (TODAY|THIS_MONTH)
- leaderboard: Map<PracticeType, List<LeaderboardEntry>>
- isLoading:Boolean

## 16. Error & Audit (MVP Simplified)
- Audit minimal: createdAtUtc on all entities.
- ScanEvent acts as scan audit (including canceledFlag). 
- Import summary ephemeral (optional persistence Phase 2).

## 17. Roadmap (Accepted)
MVP: Implemented (sections 3–16).  
v1.3.x-1.4.0: Performance optimizations, diagnostics, CI/CD, database indices, classification system, personal history, last 12 months range.  
Phase 2: PIN hardening (salt + KDF + lockout + biometric), multilanguage, encryption, audit trail expansion, advanced reporting, retention policies, kiosk hardening, dynamic practiceType management.

## 18. Risks & Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| Unsalted hash (no salt/KDF) | PIN brute-force (device access) | Phase 2: salt + PBKDF2/BCrypt/Scrypt + biometric |
| Device clock drift | Wrong day grouping | Offer manual reassign or re-compute tool Phase 2 |
| Large data growth | Performance degrade | Indexing + pruning (Phase 2) |
| Accidental deletion | Data loss | Soft deletes Phase 2 |

## 19. Open (Deferred) Items
- PIN security hardening (Phase 2) – add salt + KDF (PBKDF2/BCrypt) + attempt lockout + biometric.
- Soft delete & full audit log.
- Data retention / purge rules.
- Import log persistence.
- Multi-language expansion.

Note: Basic PIN hashing (SHA-256) and changeability is now implemented (v1.3.9). Full hardening deferred to Phase 2.

## 20. Acceptance Criteria (MVP Excerpts)
1. First scan displays confirmation within 1s and auto returns to Ready after 5s if untouched.
2. Repeat scan opens PracticeSession form with member name pre-filled within 1s.
3. CSV import with a duplicate membershipId reports duplicate lines and still imports non-duplicates.
4. Leaderboard Today & This Month returns ≤5 entries per practiceType with correct sort.
5. Zero-point sessions never appear in leaderboard.
6. Points required validation prevents save if blank or negative.
7. Kiosk returns to Ready after 60s idle in form (canceled ScanEvent flagged if repeat).
8. All timestamps exported in UTC with trailing Z; ZIP contains manifest.txt with file row counts.

## 21. Prototype Implementation Outline (Suggested Package Structure)
```
com.club.medlems
  data/
    db/AppDatabase.kt
    entity/{Member.kt, CheckIn.kt, PracticeSession.kt, ScanEvent.kt}
    dao/{MemberDao.kt, CheckInDao.kt, PracticeSessionDao.kt, ScanEventDao.kt}
    repository/{MemberRepository.kt,...}
  domain/
    ScanProcessor.kt
    LeaderboardCalculator.kt
  ui/
    ready/ReadyScreen.kt
    confirmation/ConfirmationScreen.kt
    session/PracticeSessionScreen.kt
    leaderboard/LeaderboardScreen.kt
    importexport/ImportExportScreen.kt
    components/*
  util/TimeUtils.kt
  di/Modules.kt
```

## 22. Sample Room Entity (Illustrative)
```kotlin
data class PracticeSession(
  @PrimaryKey val id: String,
  val membershipId: String,
  val createdAtUtc: Instant,
  val localDate: LocalDate,
  val practiceType: PracticeType,
  val points: Int,
  val krydser: Int?,
  val source: SessionSource
)
```

## 23. Leaderboard Query Pseudocode
```sql
SELECT ps.practiceType,
       ps.membershipId,
       MAX(ps.points) AS bestPoints,
       MAX(CASE WHEN ps.points = bestPoints THEN ps.krydser ELSE 0 END) AS bestKrydser,
       MAX(ps.createdAtUtc) AS lastTimestamp
FROM PracticeSession ps
WHERE ps.localDate BETWEEN :start AND :end
  AND ps.points > 0
GROUP BY ps.practiceType, ps.membershipId
ORDER BY bestPoints DESC, bestKrydser DESC, lastTimestamp DESC
LIMIT 5;
```
(Implementation may require subquery or window functions depending on SQLite capabilities.)

## 24. QR Parsing Logic
1. Scan raw string.
2. Find `id=` parameter (regex `id=([0-9]+)`).
3. membershipId = group(1) (numeric string). If missing → error.
4. Lookup member; branch to first or repeat logic.

## 25. Idle Timer Handling
- Each relevant screen uses an idle countdown; interaction resets countdown.
- On expiry: Confirmation returns to Ready, Session cancels (marks ScanEvent canceled if repeat path).

---
This specification reflects the implemented MVP and captures Phase 2 enhancements.

### v1.3.0 (Birthday greeting + CSV v2)
- Member now stores an optional birth_date (ISO yyyy-MM-dd).
- On scan, if the member has had a birthday since their last check-in (or today if first), the app shows a Danish greeting and plays a short tone.
- CSV format bumped to version 2. Members export now includes a `birth_date` column. Import accepts it (optional). Missing IDs become INACTIVE as before.

### v1.3.1 (Admin menu + Manual scan UX)
- Admin menu flattened to a single page with large buttons; removed in-menu back button. Use "Log ud" to exit.
- Manual scan now offers an immediate choice to add a practice session or finish after recording the scan.
- Leaderboard back navigation uses an icon-only button, and rows display `membershipId – Name`.

### v1.3.2 (Classification + grouped leaderboards)
- PracticeSession stores a required Classification per discipline (UI requires selection; values discipline-specific).
- The app remembers the last discipline + classification per member and preselects on next session.
- Sessions export CSV includes `classification` column.
- Leaderboards are grouped by practice type and classification:
  - Ready screen shows the top 3 most recent per classification.
  - Full leaderboard shows the top 10 best per classification (one per member).

### v1.3.5 (Doc + UX polish for leaderboards)
- Leaderboard and Ready embedded leaderboard hide entire disciplines with no entries for the selected range.
- Legacy/null classifications are grouped under “Uklassificeret” across views.
- Full leaderboard triggers an initial load on open so results are visible without user interaction.

### v1.3.6 (Last 12 months leaderboard range)
- Added a third range selector to Resultatliste: “Sidste 12 mdr.”
- Time window covers a rolling 12-month period starting at the first day of the month 11 months prior through today.

### v1.3.7 (Practice UI + history segmentation + Danish dates)
- Practice Session screen modernized: segmented selector for discipline, carded layout, and top app bar shows `membershipId – Name` and idle countdown.
- “Mine resultater” shows last 12 months across all classifications for the selected discipline, segmented by classification (with “Uklassificeret” group), and highlights top 3 best overall.
- Dates displayed in UI follow Danish format dd-MM-yyyy via a shared formatter.
### v1.4.0 (Performance optimizations + QR diagnostics + CI/CD)
- **Performance Optimizations**: Composables use `derivedStateOf` for computed values to prevent unnecessary recompositions. Camera diagnostics update every 30 frames instead of every frame. Filtered member lists optimized. CompactLeaderboardGrid calculations cached.
- **Database Performance**: Strategic indices added on frequently queried columns (Member: status, membershipId; CheckIn: composite on membershipId+localDate; PracticeSession: membershipId, localDate, and composite indices; ScanEvent: composite on membershipId+createdAtUtc). Bulk member name loading in single query instead of N+1 pattern.
- **QR Scanner Diagnostics**: Comprehensive troubleshooting overlay accessible via bug icon (🐞) on camera preview with real-time status, frame rate, resolution monitoring, scan statistics, and embedded troubleshooting tips.
- **Enhanced Logging**: Detailed logcat output with `ReadyScreen` tag for debugging.
- **Improved Manual Scan**: Enhanced dialog with contextual help when QR scanning fails.
- **CI/CD**: GitHub Actions for build, lint, and unit tests on PRs and pushes to main. Dependabot for Gradle and GitHub Actions dependencies.
- **Governance**: PR template requires README, SPEC, and CHANGELOG updates for behavior changes.
## 26. Classification Glossary (UI Options)
Classification is required for each Practice Session and is selected from discipline-specific options. The exported CSV includes the selected text value. Values are case-sensitive as shown.

- Riffel (Small-bore Rifle):
  - BK 1, BK 2, BK 3, BK 4, J 1, J 2, ST 1, ST 2, ST 3, Å 1, Å 2, Å 3, SE 1, SE 2, SE 3, FRI 1, FRI 2

- Luftriffel (Air Rifle):
  - BK 1, BK 2, BK 3, J 1, J 2, ST 1, ST 2, ST 3, Å 1, Å 2, SE 1, SE 2, FRI 1, FRI 2

- Pistol:
  - BK, JUN, 1H 1, 1H 2, 1H 3, 2H 1, 2H 2, SE1, SE2, FRI

- Luftpistol (Air Pistol):
  - BK, JUN, 1H 1, 1H 2, 2H 1, 2H 2, SE, FRI

- Andet (Other):
  - 22 Mod, GP 32, GPA, GR, GM, 22M

Notes:
- The lists above mirror the current UI options in `PracticeSessionScreen`. If the club updates classifications, adjust that screen and this glossary together.
- Leaderboards group by the exact classification text; empty groups are hidden.
