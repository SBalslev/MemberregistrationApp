-- Migration V1_4_0: Add new_member_registrations, skv_registrations, and skv_weapons tables
-- These tables support:
-- 1. New member registration workflow (tablet -> laptop approval)
-- 2. SKV (Skydevåbenkontrol) registration and weapon tracking

-- =============================================
-- NEW MEMBER REGISTRATIONS
-- =============================================

CREATE TABLE IF NOT EXISTS new_member_registrations (
    id VARCHAR(36) PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    birthday DATE,
    gender ENUM('MALE', 'FEMALE', 'OTHER'),
    email VARCHAR(255),
    phone VARCHAR(20),
    address VARCHAR(200),
    zip_code VARCHAR(10),
    city VARCHAR(100),
    notes TEXT,
    photo_path VARCHAR(500),
    -- Guardian info for under-18 registrations
    guardian_name VARCHAR(200),
    guardian_phone VARCHAR(20),
    guardian_email VARCHAR(255),
    -- Source device info
    source_device_id VARCHAR(36) NOT NULL,
    source_device_name VARCHAR(100),
    -- Approval workflow
    approval_status ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    approved_at_utc DATETIME,
    rejected_at_utc DATETIME,
    rejection_reason TEXT,
    created_member_id VARCHAR(36),
    -- Timestamps
    created_at_utc DATETIME NOT NULL,
    -- Sync metadata
    device_id VARCHAR(36) NOT NULL,
    sync_version BIGINT NOT NULL DEFAULT 1,
    synced_at_utc DATETIME,
    modified_at_utc DATETIME NOT NULL,
    INDEX idx_registration_status (approval_status),
    INDEX idx_registration_source (source_device_id),
    INDEX idx_registration_sync (sync_version),
    INDEX idx_registration_modified (modified_at_utc),
    FOREIGN KEY (created_member_id) REFERENCES members(internal_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- SKV REGISTRATIONS
-- =============================================

CREATE TABLE IF NOT EXISTS skv_registrations (
    id VARCHAR(36) PRIMARY KEY,
    member_id VARCHAR(36) NOT NULL,
    skv_level INT NOT NULL DEFAULT 6,
    status ENUM('approved', 'requested', 'not_started') NOT NULL DEFAULT 'not_started',
    last_approved_date DATE,
    -- Timestamps
    created_at_utc DATETIME NOT NULL,
    updated_at_utc DATETIME NOT NULL,
    -- Sync metadata
    device_id VARCHAR(36) NOT NULL,
    sync_version BIGINT NOT NULL DEFAULT 1,
    synced_at_utc DATETIME,
    UNIQUE INDEX idx_skv_member (member_id),
    INDEX idx_skv_status (status),
    INDEX idx_skv_sync (sync_version),
    FOREIGN KEY (member_id) REFERENCES members(internal_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- SKV WEAPONS
-- =============================================

CREATE TABLE IF NOT EXISTS skv_weapons (
    id VARCHAR(36) PRIMARY KEY,
    skv_registration_id VARCHAR(36) NOT NULL,
    model VARCHAR(100) NOT NULL,
    description VARCHAR(255),
    serial VARCHAR(50) NOT NULL,
    type VARCHAR(50) NOT NULL,
    caliber VARCHAR(50),
    last_reviewed_date DATE,
    -- Timestamps
    created_at_utc DATETIME NOT NULL,
    updated_at_utc DATETIME NOT NULL,
    -- Sync metadata
    device_id VARCHAR(36) NOT NULL,
    sync_version BIGINT NOT NULL DEFAULT 1,
    synced_at_utc DATETIME,
    INDEX idx_weapon_registration (skv_registration_id),
    INDEX idx_weapon_serial (serial),
    INDEX idx_weapon_sync (sync_version),
    FOREIGN KEY (skv_registration_id) REFERENCES skv_registrations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Update schema metadata
UPDATE _schema_metadata
SET minor_version = 4,
    patch_version = 0,
    last_migration_at = NOW(),
    description = 'Schema 1.4.0 - Added new_member_registrations, skv_registrations, skv_weapons'
WHERE id = 1;
