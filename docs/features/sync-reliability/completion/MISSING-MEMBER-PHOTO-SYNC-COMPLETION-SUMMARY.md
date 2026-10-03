# Missing member photo sync completion summary

**Status:** Complete
**Started:** 2026-10-03 10:26:42 UTC+2
**Completed:** 2026-10-03 10:42:00 UTC+2
**Duration:** 15m 18s
**Last Updated:** 2026-10-03 10:42:00 UTC+2 by sbalslev

## What was fixed

- Direct tablet sync can repair missing profile and ID photos even when the incoming member `syncVersion` is unchanged.
- Newer member updates preserve existing photo paths and thumbnails when the payload does not contain photo bytes.
- Full online sync downloads missing profile and ID photos from the photo metadata returned by the online API.

## Incident evidence

The reported trial member existed in the laptop database, but the profile
photo path and thumbnail were both null, and no matching photo file existed
in the laptop application data directory. The implementation previously
counted online photo metadata without downloading the associated image.

## Behavior changes

- Equal-version member payloads remain idempotent for normal member data but may repair locally missing photos.
- Photo columns use merge behavior instead of being cleared when an update omits photo bytes.
- Online full sync stores downloaded photos in the standard member photo directory and writes the generated thumbnail to the member record.

## Validation

- Focused sync tests: 41 passed.
- Laptop TypeScript and Vite production build: passed.
- Regression coverage includes equal-version photo repair, photo preservation on payloads without bytes, and online photo download.

## Recovery

Install the fixed laptop build and run a full online sync. A full sync starts
from the beginning of the online photo metadata history and can backfill older
missing photos. If the online database does not contain the photo, retake the
photo on the membership tablet and synchronize the tablet directly with the
laptop.

## Related documentation

- [Sync reliability PRD](../prd.md)
- [Sync reliability tasks](../tasks.md)
- [Photo storage design](../../photo-storage-optimization/design.md)
