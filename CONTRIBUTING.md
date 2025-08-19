# Contributing to ISS Skydning Registrering

Thanks for your interest in contributing. This repo aims for a small, friendly, and pragmatic vibe.

## Ground rules (the vibe)
- Docs are never optional: update SPEC.md, README.md, and CHANGELOG.md with any behavior or UI change.
- Keep PRs small and focused; prefer iterative improvements over big-bang changes.
- Favor clarity over cleverness. Prefer explicit names and simple flows.
- User-facing text is Danish; keep it short, clear, and consistent.
- Kiosk-first: large touch targets, simple navigation, minimal dialogs.
- Offline-first: do not add network dependencies without discussion.
- Respect privacy: never commit personal data (CSV imports), secrets, or keystores.

## Code style & structure
- Language: Kotlin, Compose Material 3, Hilt, Room.
- Kotlin style: Official. Auto-format before commit.
- Compose:
  - State hoisting and unidirectional data flow.
  - Modifiers last, minimal recomposition, remember/derivedStateOf where relevant.
  - No heavy work in composition; use ViewModel + coroutines.
  - Strings via resources when shared; in-screen literals acceptable for MVP but prefer resources for reuse.
- Architecture:
  - Single-Activity Navigation Compose.
  - ViewModel per screen; repository/DAO boundaries respected.
  - Room queries in DAOs; keep SQL readable and indexed.
- Naming:
  - Files/Screens: `ReadyScreen.kt`, `LeaderboardViewModel.kt`.
  - Entities/DAOs: `PracticeSessionDao` with clear method names (e.g., `sessionsForMemberInRange`).

## Commits & branches
- Conventional Commits recommended:
  - `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, `test:`
- Branches: `feature/<short>`, `fix/<short>`; open PRs against `main`.
- Rebase or merge—either is fine. Keep history readable.

## PR checklist
- Builds locally (`./gradlew :app:assembleDebug`).
- No sensitive files committed (CSV, keystore, local.properties).
- UI labels are Danish and accessible at large font sizes.
- Docs updated when behavior changes (README, SPEC, and CHANGELOG entry).
- Screenshots/GIFs for UI tweaks (optional but helpful).

## Tests (as feasible)
- Unit tests for pure logic (formatters, calculators, parsing).
- Optional UI tests for complex flows.
- Keep tests fast and deterministic.

## Local setup
- Android Studio (Koala/Ladybug+), JDK 17+
- Build: `./gradlew.bat :app:assembleDebug` (Windows) or `./gradlew :app:assembleDebug` (macOS/Linux)

## Reporting issues
- Use the Bug/Feature templates. Include steps, expected/actual, screenshots.

## License
- MIT. By contributing, you agree your contributions are licensed under MIT.
