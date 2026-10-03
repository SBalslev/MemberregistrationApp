ALTER TABLE guest_results
    ADD COLUMN deleted_at_utc DATETIME NULL AFTER synced_at_utc,
    ADD INDEX idx_guest_result_deleted (deleted_at_utc);

UPDATE _schema_metadata
SET minor_version = 11, patch_version = 0, last_migration_at = NOW(),
    description = 'Guest result synchronized soft deletion';
