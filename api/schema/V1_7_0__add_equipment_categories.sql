-- V1_7_0__add_equipment_categories.sql
-- Migration: Add selectable equipment categories
-- Created: 2026-08-31

ALTER TABLE equipment_items
  MODIFY COLUMN type ENUM(
    'TrainingMaterial',
    'PISTOL',
    'AIR_PISTOL',
    'AIR_RIFLE',
    'RIFLE',
    'LONG_DISTANCE',
    'OTHER'
  ) NOT NULL DEFAULT 'TrainingMaterial';

UPDATE _schema_metadata
SET minor_version = 7,
    patch_version = 0,
    last_migration_at = NOW(),
    description = 'Schema 1.7.0 - Added equipment categories'
WHERE id = 1;

INSERT INTO _schema_metadata (id, major_version, minor_version, patch_version, last_migration_at, description)
SELECT 1, 1, 7, 0, NOW(), 'Schema 1.7.0 - Added equipment categories'
WHERE NOT EXISTS (SELECT 1 FROM _schema_metadata WHERE id = 1);
