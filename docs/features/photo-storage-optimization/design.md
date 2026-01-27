# Photo Storage Optimization - Design Document

> **Status:** Planning
> **Created:** 2026-01-20
> **Author:** Claude

---

## Overview

Optimize photo storage to support efficient list rendering while preserving full-quality photos for features like leaderboards and member detail views.

### Current Problem

- Photos stored as base64 data URLs directly in SQLite database
- `SELECT *` queries load all photo data (~2-5MB per member) into memory
- No compression on Android before sync
- Database bloat affects backup size and query performance

### Solution

Store photos in two formats:
1. **Full resolution** on file system for detail views and future leaderboards
2. **Thumbnail** (150x150px) in database for fast list rendering

---

## Architecture

```
Android Tablet                         Laptop
──────────────                         ──────
CameraX (full resolution)
  ↓
Save to disk
  ↓
base64 encode (full quality)
  ↓
─────── Sync (full photo) ─────────►   Receive photoBase64
                                         ↓
                                       ┌─────────────────────────────┐
                                       │ Async Photo Processing:     │
                                       │                             │
                                       │ 1. Decode base64            │
                                       │ 2. Save full → file system  │
                                       │ 3. Generate 150x150 thumb   │
                                       │ 4. Store thumb as data URL  │
                                       │ 5. Update DB record         │
                                       └─────────────────────────────┘
```

---

## Data Model

### Database Schema

```sql
-- Member table changes
ALTER TABLE Member ADD COLUMN photoPath TEXT;       -- Path to full photo file
ALTER TABLE Member ADD COLUMN photoThumbnail TEXT;  -- Small data URL (~5-10KB)

-- Remove after migration (breaking change)
-- registrationPhotoPath column will be dropped
```

### File Storage

```
{app.getPath('userData')}/
  photos/
    members/
      {internalId}.jpg    -- Full resolution photo
```

---

## Specifications

### Thumbnail

| Property | Value |
|----------|-------|
| Dimensions | 150x150px |
| Crop | Square, center-crop |
| Format | JPEG |
| Quality | 75 |
| Target size | ~5-10KB |
| Storage | Database column `photoThumbnail` as data URL |

### Full Photo

| Property | Value |
|----------|-------|
| Processing | None - keep original as received |
| Format | JPEG (as received from tablet) |
| Storage | File system: `photos/members/{internalId}.jpg` |
| Naming | Overwrite on update |

---

## Sync Behavior

### Tablet → Laptop

| Entity | Photo Handling |
|--------|----------------|
| Trial Member | Full photo synced as `photoBase64` |
| Full Member | No photo sync (created on laptop) |

### Laptop → Tablet

| Current | Future |
|---------|--------|
| No photos sent to tablets | May send thumbnails for leaderboards |

---

## Query Patterns

### List Views (Fast)

```typescript
// Only select thumbnail for list rendering
function getMembersForList(): MemberListItem[] {
  return query(`
    SELECT internalId, membershipId, firstName, lastName,
           memberLifecycleStage, status, photoThumbnail, createdAtUtc
    FROM Member
    ORDER BY lastName, firstName
  `);
}
```

### Detail View (Full Data)

```typescript
// Full member data including photo path
function getMemberByInternalId(id: string): Member {
  return query('SELECT * FROM Member WHERE internalId = ?', [id]);
}
```

### Photo Display

| Context | Source | Reason |
|---------|--------|--------|
| Member list | `photoThumbnail` | Fast loading, small data |
| Member detail panel | `photoPath` (file) | Full quality |
| Leaderboards | `photoPath` (file) | Full quality display |
| Check-in confirmation | `photoThumbnail` | Fast loading |

---

## File Lifecycle

### Creation
- Photo saved when trial member syncs from tablet
- Thumbnail generated asynchronously via Sharp

### Update
- New photo overwrites existing file
- New thumbnail replaces old in database

### Deletion
- When member is deleted, photo file is also deleted
- Handled in `deleteMember()` function

---

## Dependencies

- **Sharp** - Node.js image processing library
  - Fast, native bindings
  - Supports JPEG, PNG, WebP
  - Handles resize, crop, quality adjustment

```json
{
  "dependencies": {
    "sharp": "^0.33.x"
  }
}
```

---

## Migration Strategy

**Breaking change** - clean migration, no backward compatibility.

1. On app startup, run migration:
   - For each member with `registrationPhotoPath` containing data URL:
     - Decode base64
     - Save to file system
     - Generate thumbnail
     - Update `photoPath` and `photoThumbnail`
     - Clear `registrationPhotoPath`
2. Drop `registrationPhotoPath` column after migration complete

---

## Error Handling

| Scenario | Handling |
|----------|----------|
| Sharp fails to process | Log error, store null thumbnail, retry on next sync |
| File write fails | Log error, keep data URL as fallback |
| File read fails (display) | Show placeholder image |
| Thumbnail too large | Re-compress at lower quality |

---

## Future Considerations

1. **Tablet leaderboards** - May need to sync thumbnails to tablets
2. **Face detection** - Could improve crop centering for headshots
3. **Multiple sizes** - Could add medium size (300x300) if needed
4. **WebP format** - Better compression, but need browser/Electron support check
