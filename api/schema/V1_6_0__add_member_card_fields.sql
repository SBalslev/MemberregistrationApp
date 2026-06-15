-- V1_6_0__add_member_card_fields.sql
-- Migration: Add membership card tracking fields to members table
-- Created: 2026-05-18

-- =============================================================================
-- MEMBER CARD TRACKING COLUMNS
-- =============================================================================

ALTER TABLE members
  ADD COLUMN card_status VARCHAR(20) NOT NULL DEFAULT 'none'
  COMMENT 'Membership card status: none, requested, printed, delivered';

ALTER TABLE members
  ADD COLUMN card_file_reference VARCHAR(255) NULL
  COMMENT 'Reference used for external card printing';

ALTER TABLE members
  ADD COLUMN card_printed_at_utc DATETIME NULL;

ALTER TABLE members
  ADD COLUMN card_requested_at_utc DATETIME NULL;

ALTER TABLE members
  ADD COLUMN card_requested_by_device_id VARCHAR(36) NULL;

-- =============================================================================
-- SCHEMA VERSION UPDATE
-- =============================================================================

UPDATE _schema_metadata
SET minor_version = 6,
    patch_version = 0,
    last_migration_at = NOW(),
    description = 'Schema 1.6.0 - Added membership card tracking fields'
WHERE id = 1;

INSERT INTO _schema_metadata (id, major_version, minor_version, patch_version, last_migration_at, description)
SELECT 1, 1, 6, 0, NOW(), 'Schema 1.6.0 - Added membership card tracking fields'
WHERE NOT EXISTS (SELECT 1 FROM _schema_metadata WHERE id = 1);
