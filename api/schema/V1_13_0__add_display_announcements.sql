-- V1_13_0__add_display_announcements.sql
-- Migration: Add scheduled announcements for common-room displays
-- Created: 2026-10-12

CREATE TABLE IF NOT EXISTS display_announcements (
  id CHAR(36) PRIMARY KEY,
  display_id VARCHAR(64) NOT NULL,
  title VARCHAR(80) NOT NULL,
  body TEXT NOT NULL,
  priority ENUM('normal', 'important') NOT NULL DEFAULT 'normal',
  status ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'draft',
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL,
  display_duration_seconds TINYINT UNSIGNED NOT NULL DEFAULT 15,
  image_mime VARCHAR(32) NULL,
  image_size INT UNSIGNED NULL,
  image_data MEDIUMBLOB NULL,
  version BIGINT UNSIGNED NOT NULL DEFAULT 1,
  created_by VARCHAR(100) NOT NULL,
  updated_by VARCHAR(100) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_display_announcement_delivery (display_id, status, starts_at, ends_at),
  INDEX idx_display_announcement_updated (display_id, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

UPDATE _schema_metadata
SET minor_version = 13,
    patch_version = 0,
    last_migration_at = NOW(),
    description = 'Schema 1.13.0 - Added scheduled display announcements'
WHERE id = 1;
