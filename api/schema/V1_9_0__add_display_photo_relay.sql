-- V1_9_0__add_display_photo_relay.sql
-- Migration: Add rotating display invitations and store-and-forward photo queue
-- Created: 2026-09-15

CREATE TABLE IF NOT EXISTS display_relay_invitations (
  id CHAR(32) PRIMARY KEY,
  token_hash CHAR(64) NOT NULL UNIQUE,
  display_id VARCHAR(64) NOT NULL,
  max_uploads INT UNSIGNED NOT NULL DEFAULT 20,
  upload_count INT UNSIGNED NOT NULL DEFAULT 0,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_display_relay_invitation_lookup (display_id, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS display_relay_photos (
  id CHAR(32) PRIMARY KEY,
  invitation_id CHAR(32) NOT NULL,
  display_id VARCHAR(64) NOT NULL,
  status ENUM('queued', 'delivered', 'expired') NOT NULL DEFAULT 'queued',
  mime_type VARCHAR(32) NOT NULL,
  file_size INT UNSIGNED NOT NULL,
  image_data MEDIUMBLOB NOT NULL,
  client_ip VARCHAR(45) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  delivered_at DATETIME NULL,
  CONSTRAINT fk_display_relay_invitation
    FOREIGN KEY (invitation_id) REFERENCES display_relay_invitations(id)
    ON DELETE CASCADE,
  INDEX idx_display_relay_delivery (display_id, status, created_at),
  INDEX idx_display_relay_client_limit (client_ip, created_at),
  INDEX idx_display_relay_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS display_relay_client_quotas (
  client_ip VARCHAR(45) PRIMARY KEY,
  window_started_at DATETIME NOT NULL,
  upload_count INT UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

UPDATE _schema_metadata
SET minor_version = 9,
    patch_version = 0,
    last_migration_at = NOW(),
    description = 'Schema 1.9.0 - Added common-room display photo relay'
WHERE id = 1;

INSERT INTO _schema_metadata (
  id,
  major_version,
  minor_version,
  patch_version,
  last_migration_at,
  description
)
SELECT 1, 1, 9, 0, NOW(), 'Schema 1.9.0 - Added common-room display photo relay'
WHERE NOT EXISTS (SELECT 1 FROM _schema_metadata WHERE id = 1);
