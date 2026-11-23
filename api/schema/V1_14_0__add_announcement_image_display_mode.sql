-- Migration: Add opt-in panning for scheduled announcement images
-- Created: 2026-11-23

ALTER TABLE display_announcements
    ADD COLUMN image_display_mode ENUM('fit', 'pan') NOT NULL DEFAULT 'fit'
    AFTER image_data;

UPDATE _schema_metadata
SET minor_version = 14,
    patch_version = 0,
    last_migration_at = NOW(),
    description = 'Schema 1.14.0 - Optional announcement image panning'
WHERE id = 1;
