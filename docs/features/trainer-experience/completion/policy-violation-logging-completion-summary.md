# Policy violation logging - completion summary

**Completed:** 2026-03-30
**Completed By:** sbalslev

## What was implemented

- Policy warnings and logging in trainer practice session flows
- Policy violation list on the trainer dashboard
- CSV export of policy violations on the admin laptop
- Sync of policy violations from trainer tablets to the laptop

## Design decisions

- Treat policy violations as append-only audit logs
- Send policy violations through the existing sync outbox pipeline
- Export policy logs as CSV to align with existing admin workflows

## Implementation details

- Android sync payload now includes policy violations
- Trainer dashboard shows recent policy warnings
- Laptop database adds PolicyViolation table and export query

## Testing and validation

- Not run in this change

## Follow-ups

- Add UI guidance for where to find policy log exports
- Include policy log exports in any scheduled reporting workflows
