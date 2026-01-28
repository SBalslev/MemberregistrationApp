-- V1_5_0__add_id_photo_fields.sql
-- Migration: Add ID photo support for adult verification during trial registration
-- Feature: Enhanced Trial Registration with Age Validation & ID Capture
-- Created: 2026-01-27

-- =============================================================================
-- ID PHOTO COLUMNS FOR MEMBERS TABLE
-- =============================================================================

-- Add ID photo path column (stores file path reference)
ALTER TABLE members
  ADD COLUMN id_photo_path VARCHAR(500) NULL
  COMMENT 'Path to ID photo file for adult verification';

-- Add ID photo thumbnail column (stores data URL for list views)
ALTER TABLE members
  ADD COLUMN id_photo_thumbnail MEDIUMTEXT NULL
  COMMENT 'ID photo thumbnail as data URL (150x150)';

-- =============================================================================
-- ID PHOTO BINARY STORAGE IN MEMBER_PHOTOS TABLE
-- =============================================================================

-- Update member_photos table to support 'id' photo type
-- The existing ENUM('registration', 'profile') needs to include 'id'
ALTER TABLE member_photos
  MODIFY COLUMN photo_type ENUM('registration', 'profile', 'id') NOT NULL DEFAULT 'registration'
  COMMENT 'Type of photo: registration (deprecated), profile, or id (for adult verification)';

-- =============================================================================
-- AUDIT LOG FOR ID PHOTO DELETION
-- =============================================================================

-- Create audit log table if it doesn't exist
CREATE TABLE IF NOT EXISTS audit_log (
  id VARCHAR(36) PRIMARY KEY,
  event_type VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(36) NOT NULL,
  details JSON NULL,
  performed_by_device_id VARCHAR(36) NULL,
  created_at_utc DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_event_type (event_type),
  INDEX idx_audit_entity (entity_type, entity_id),
  INDEX idx_audit_created (created_at_utc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Audit trail for sensitive operations like ID photo deletion';

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Add index for filtering members by ID photo presence
CREATE INDEX idx_members_id_photo ON members(id_photo_path(100));

-- =============================================================================
-- SCHEMA VERSION UPDATE
-- =============================================================================

-- Update schema metadata
UPDATE _schema_metadata
SET minor_version = 5,
    patch_version = 0,
    last_migration_at = NOW(),
    description = 'Schema 1.5.0 - Added ID photo fields for adult verification during trial registration'
WHERE id = 1;

-- If _schema_metadata doesn't have the row, insert it
INSERT INTO _schema_metadata (id, major_version, minor_version, patch_version, last_migration_at, description)
SELECT 1, 1, 5, 0, NOW(), 'Schema 1.5.0 - Added ID photo fields for adult verification during trial registration'
WHERE NOT EXISTS (SELECT 1 FROM _schema_metadata WHERE id = 1);
