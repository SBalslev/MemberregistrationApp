# Tablet UX Improvements - Tasks

**Feature:** Tablet UX Improvements
**Design:** [design.md](design.md)
**Created:** 2026-01-20
**Completed:** 2026-01-20
**Status:** ✅ COMPLETE

---

## Overview

Address user feedback from 10.1" Android tablet usage:
- Leaderboard text too small
- Practice session flow not intuitive
- PIN code shown in plain text
- Admin menu cluttered

---

## Completed Tasks

### 1. PIN Masking (Security Fix)

**Status:** ✅ Complete

- [x] Add `PasswordVisualTransformation()` to login PIN field
- [x] Add `PasswordVisualTransformation()` to change PIN dialog (3 fields)
- [x] Use `KeyboardType.NumberPassword` for proper keyboard

**Files Modified:**
- `app/src/main/java/com/club/medlems/ui/attendant/AttendantMenuScreen.kt`

---

### 2. Leaderboard Text Sizing

**Status:** ✅ Complete

- [x] Practice type headers: `titleMedium` → `headlineSmall` (uppercase)
- [x] Classification headers: `titleSmall` → `titleLarge`
- [x] Column headers: default → `titleMedium`
- [x] Entry text: default → `titleMedium`
- [x] Increased padding and spacing

**Files Modified:**
- `app/src/main/java/com/club/medlems/ui/leaderboard/LeaderboardScreen.kt`

---

### 3. Admin Menu Reorganization

**Status:** ✅ Complete

Reorganized into 4 logical sections with visual cards:

- [x] **Daglig brug** (Daily use): Resultatliste, Manuel scanning, Tilmeld medlem
- [x] **Udstyr** (Equipment - conditional): Udstyr, Udlån
- [x] **Administration**: Import/Eksport, Redigér skydninger, Medlemssøgning
- [x] **System**: Enheder, Skift PIN, Diagnostik, Konflikter
- [x] **Log ud** section with red button
- [x] Added scrollable layout for smaller screens
- [x] Section headers with primary color

**Files Modified:**
- `app/src/main/java/com/club/medlems/ui/attendant/AttendantMenuScreen.kt`

---

### 4. Practice Session Progressive Flow

**Status:** ✅ Complete

Implemented step-by-step progressive reveal:

- [x] Step 1: Select practice type (always visible)
- [x] Step 2: Select classification (appears after step 1)
- [x] Step 3: Enter score (appears after step 2)
- [x] Save button (appears when form complete)
- [x] Numbered step badges with color state (incomplete → complete)
- [x] Larger touch targets (48dp chips, 64dp save button)
- [x] Larger text throughout (`titleMedium`, `titleLarge`, `headlineMedium`)
- [x] Scrollable layout for smaller screens
- [x] Increased idle timeout from 60s to 90s

**Files Modified:**
- `app/src/main/java/com/club/medlems/ui/session/PracticeSessionScreen.kt`

---

## Build Verification

- [x] `assembleMemberDebug` - BUILD SUCCESSFUL

---

## Summary of Changes

| Area | Change | Impact |
|------|--------|--------|
| Security | PIN fields now masked | Prevents shoulder surfing |
| Leaderboard | 50-70% larger text | Better readability on 10.1" |
| Admin menu | 4 grouped sections | Easier to find functions |
| Practice session | Progressive reveal | Clear step-by-step flow |

---

## Testing Notes

Test on 10.1" Android 6.0 tablet:
1. Verify PIN shows dots, not digits
2. Verify leaderboard text is readable from arm's length
3. Verify admin menu sections are clear
4. Verify practice session guides user through steps
5. Verify save button only appears when form is complete
