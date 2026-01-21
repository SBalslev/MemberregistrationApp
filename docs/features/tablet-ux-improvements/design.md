# Tablet UX Improvements - Design Document

**Created:** 2026-01-20
**Target Device:** 10.1" Android tablet (Android 6.0)
**Status:** Approved - Ready for Implementation

---

## Overview

Address user feedback from tablet usage:
1. Leaderboard text too small
2. Practice session flow not intuitive
3. PIN code shown in plain text (security)
4. Admin menu too cluttered

---

## 1. Leaderboard Text Size

### Problem
Text is too small on 10.1" tablet. Uses Material defaults designed for phones.

### Solution
Increase typography scale for tablet readability:

| Element | Current | Proposed |
|---------|---------|----------|
| Practice type header (Riffel, Pistol) | `titleMedium` (16sp) | `headlineSmall` (24sp) |
| Classification header (A, B, C) | `titleSmall` (14sp) | `titleLarge` (22sp) |
| Column headers (Medlem, Points) | `bodyMedium` (14sp) | `titleMedium` (16sp) |
| Entry text (name, score) | default body (14sp) | `titleMedium` (16sp) |
| Filter chips | default | increase padding, larger touch targets |

### Visual Change
```
BEFORE:                          AFTER:
Riffel (small)                   RIFFEL (large, bold)
  A (tiny)                         A (medium, bold)
  Medlem    Points                 Medlem         Points
  123 - Hans  95/3                 123 - Hans     95/3
```

---

## 2. Practice Session Flow

### Problem
Users don't understand what to do next. All elements merged in one card without visual guidance.

### Current Flow
```
┌─────────────────────────────────────┐
│ Skydnings-type: [Riffel][Pistol]... │
│ Klassifikation: [A][B][C]...        │
│ Point: [____]  Krydser: [____]      │
│ [Gem] [Mine resultater] [Annuller]  │
└─────────────────────────────────────┘
```

### Proposed Flow
Visual step-by-step with clear sections:

```
┌─────────────────────────────────────┐
│ TRIN 1: Vælg skydningstype          │
│ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐    │
│ │Riffel│ │Pistol│ │Luft │ │ ... │   │
│ └─────┘ └─────┘ └─────┘ └─────┘    │
└─────────────────────────────────────┘
           ↓
┌─────────────────────────────────────┐
│ TRIN 2: Vælg klassifikation         │
│ [A] [B] [C] [Åben] ...              │
└─────────────────────────────────────┘
           ↓
┌─────────────────────────────────────┐
│ TRIN 3: Indtast resultat            │
│ Point: [________]                   │
│ Krydser (valgfri): [________]       │
└─────────────────────────────────────┘
           ↓
┌─────────────────────────────────────┐
│        [ GEM RESULTAT ]             │  ← Large, green, prominent
│                                     │
│  [Mine resultater]    [Annuller]    │  ← Secondary, smaller
└─────────────────────────────────────┘
```

### Key Changes
1. **Step headers** - "TRIN 1:", "TRIN 2:", "TRIN 3:" with numbers
2. **Separate cards** for each step (or clear dividers)
3. **Visual flow** - downward progression
4. **Button hierarchy:**
   - "Gem" → Large, filled, green/primary color
   - "Mine resultater" → Outlined, secondary
   - "Annuller" → Text only, subtle

### Option B: Progressive Disclosure
Only show next step after previous is completed:
- Show type selection first
- After type selected → reveal classification
- After classification selected → reveal score input
- After score entered → reveal save button

**Decision:** Option B - Progressive reveal. Only show next step after previous is completed.

---

## 3. PIN Code Security

### Problem
PIN is displayed in plain text - security risk if someone is watching.

### Solution
Add password masking to all PIN fields:

```kotlin
// Before
OutlinedTextField(value = pinInput, ...)

// After
OutlinedTextField(
    value = pinInput,
    visualTransformation = PasswordVisualTransformation(),
    ...
)
```

### Affected Fields
1. Login PIN field (AttendantMenuScreen.kt:141)
2. Change PIN - Current PIN field (line 501)
3. Change PIN - New PIN field (line 502)
4. Change PIN - Repeat PIN field (line 503)

**Risk:** Low - straightforward change.

---

## 4. Admin Menu Reorganization

### Problem
13+ buttons in a flat grid. Too many options, hard to find things.

### Current Layout
```
┌──────────────────────────────────────────┐
│ [Import/Eksport]    [Resultatliste]      │
│ [Manuel scanning]   [Tilmeld medlem]     │
│ [Skift PIN]         [Vis diagnostik]     │
│ [Redigér skydninger]                     │
│ [Medlemssøgning]                         │
│ [Udstyr]            [Udlån]              │
│ [Konflikter]                             │
│ [Enheder]                                │
│ ─────────────────────────────────────    │
│ [Log ud]                                 │
│ Om                                       │
└──────────────────────────────────────────┘
```

### Proposed: Grouped Sections

```
┌──────────────────────────────────────────┐
│           ═══ ADMIN MENU ═══             │
├──────────────────────────────────────────┤
│ DAGLIG BRUG                              │
│ [📊 Resultatliste]  [📷 Manuel scanning] │
│ [➕ Tilmeld medlem]                       │
├──────────────────────────────────────────┤
│ UDSTYR (kun Trainer)                     │
│ [🔧 Udstyr]         [📦 Udlån]           │
├──────────────────────────────────────────┤
│ INDSTILLINGER                            │
│ [⚙️ Mere...]                             │  ← Opens subpage
├──────────────────────────────────────────┤
│ [🔒 Log ud]                              │
└──────────────────────────────────────────┘
```

### "Mere..." Subpage Contains:
- Import/Eksport
- Redigér skydninger
- Medlemssøgning
- Skift PIN
- Vis/Skjul diagnostik
- Enheder (device pairing)
- Konflikter
- Om

### Alternative: All Visible with Sections
If subpages feel too hidden, keep all on one page but with clear section headers and dividers:

```
┌──────────────────────────────────────────┐
│ ══ Daglig brug ══                        │
│ [Resultatliste]     [Manuel scanning]    │
│ [Tilmeld medlem]                         │
│                                          │
│ ══ Udstyr ══                             │
│ [Udstyr]            [Udlån]              │
│                                          │
│ ══ Administration ══                     │
│ [Import/Eksport]    [Redigér skydninger] │
│ [Medlemssøgning]                         │
│                                          │
│ ══ System ══                             │
│ [Skift PIN]         [Diagnostik]         │
│ [Enheder]           [Konflikter]         │
│                                          │
│ ──────────────────────────────────────   │
│ [Log ud]                        Om       │
└──────────────────────────────────────────┘
```

**Decision:** Option B - All visible with section headers (no subpage navigation).

---

## Summary of Changes

| Area | Change | Risk |
|------|--------|------|
| Leaderboard | Larger typography | Low |
| Practice session | Step-based visual flow | Medium - test with users |
| PIN fields | Add password masking | Low |
| Admin menu | Group into sections | Medium - user relearning |

---

## Decisions Made

1. **Practice session:** Option B - Progressive reveal
2. **Admin menu:** Option B - Sections with headers, all visible

---

## Implementation Order

1. ✅ Design approved
2. **PIN masking** - Quick security fix
3. **Leaderboard text sizing** - Simple typography changes
4. **Admin menu grouping** - Add section headers
5. **Practice session progressive flow** - Most complex change
6. Test on actual 10.1" tablet
