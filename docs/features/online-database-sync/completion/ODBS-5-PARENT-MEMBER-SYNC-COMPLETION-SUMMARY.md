# ODBS-5 - Include parent members in child pushes

**Completed:** 2026-09-28 21:12:15 UTC+2
**Completed By:** sbalslev

## What was implemented

Incremental sync now collects member IDs referenced by pending check-ins and practice sessions. Those members are included in the member push even when their local sync timestamps would otherwise exclude them.

## Root cause

Parent and child records were selected independently. After cloud data was reset or became incomplete, a pending check-in could be pushed without its unchanged member, causing a MySQL foreign key violation.

## Design decision

The client restores the dependency before sending child batches. The existing server-side parent-before-child processing remains unchanged, and no database migration is required.

## Testing and validation

- Added a focused test for required parent selection during incremental sync.
- Built the laptop application successfully.