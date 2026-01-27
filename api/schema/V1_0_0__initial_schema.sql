-- =============================================
-- ISS Skydning Online Database Schema
-- Version: 1.2.0 (must match laptop SYNC_SCHEMA_VERSION)
-- Created: 2026-01-27
-- =============================================

-- Use utf8mb4 for full Unicode support
SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

-- =============================================
-- METADATA TABLES
-- =============================================

-- Schema version tracking
CREATE TABLE IF NOT EXISTS _schema_metadata (
    id INT PRIMARY KEY DEFAULT 1,
    major_version INT NOT NULL,
    minor_version INT NOT NULL,
    patch_version INT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_migration_at DATETIME,
    description VARCHAR(255),
    CONSTRAINT chk_single_row CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Schema version - must match laptop app SYNC_SCHEMA_VERSION
INSERT INTO _schema_metadata (major_version, minor_version, patch_version, description)
VALUES (1, 2, 0, 'Schema 1.2.0 - matches laptop app');

-- Sync log for audit trail
CREATE TABLE IF NOT EXISTS _sync_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_id VARCHAR(36) NOT NULL,
    sync_direction ENUM('PUSH', 'PULL', 'BOTH') NOT NULL,
    started_at DATETIME NOT NULL,
    completed_at DATETIME,
    status ENUM('IN_PROGRESS', 'SUCCESS', 'FAILED', 'PARTIAL') NOT NULL DEFAULT 'IN_PROGRESS',
    entities_pushed INT DEFAULT 0,
    entities_pulled INT DEFAULT 0,
    error_message TEXT,
    app_version VARCHAR(20),
    INDEX idx_sync_log_device (device_id),
    INDEX idx_sync_log_started (started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Processed batches for idempotency
CREATE TABLE IF NOT EXISTS _processed_batches (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    batch_id VARCHAR(36) NOT NULL UNIQUE,
    device_id VARCHAR(36) NOT NULL,
    processed_at DATETIME NOT NULL,
    INDEX idx_batch_device (device_id),
    INDEX idx_batch_processed (processed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Deletion log for sync
CREATE TABLE IF NOT EXISTS _deletion_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(36) NOT NULL,
    deleted_by_device VARCHAR(36) NOT NULL,
    deleted_at_utc DATETIME NOT NULL,
    INDEX idx_deletion_type (entity_type),
    INDEX idx_deletion_time (deleted_at_utc),
    INDEX idx_deletion_entity (entity_type, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- SECURITY TABLES
-- =============================================

-- Login attempts for lockout
CREATE TABLE IF NOT EXISTS _login_attempts (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    identifier VARCHAR(100) NOT NULL,
    ip VARCHAR(45) NOT NULL,
    success TINYINT(1) NOT NULL DEFAULT 0,
    attempted_at DATETIME NOT NULL,
    INDEX idx_identifier_time (identifier, attempted_at),
    INDEX idx_cleanup (attempted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Rate limiting
CREATE TABLE IF NOT EXISTS _rate_limits (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    ip VARCHAR(45) NOT NULL,
    created_at DATETIME NOT NULL,
    INDEX idx_ip_time (ip, created_at),
    INDEX idx_cleanup (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Security event log
CREATE TABLE IF NOT EXISTS _security_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL,
    ip VARCHAR(45) NOT NULL,
    details TEXT,
    created_at DATETIME NOT NULL,
    INDEX idx_type_time (event_type, created_at),
    INDEX idx_ip (ip)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- API access audit log
CREATE TABLE IF NOT EXISTS _api_access_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    ip VARCHAR(45) NOT NULL,
    method VARCHAR(10) NOT NULL,
    uri VARCHAR(255) NOT NULL,
    device_id VARCHAR(36),
    created_at DATETIME NOT NULL,
    INDEX idx_device_time (device_id, created_at),
    INDEX idx_cleanup (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- CORE APPLICATION TABLES
-- =============================================

-- Members table
CREATE TABLE IF NOT EXISTS members (
    internal_id VARCHAR(36) PRIMARY KEY,
    membership_id VARCHAR(20),
    member_type ENUM('TRIAL', 'FULL') NOT NULL DEFAULT 'TRIAL',
    status ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    birth_date DATE,
    gender ENUM('MALE', 'FEMALE', 'OTHER'),
    email VARCHAR(255),
    phone VARCHAR(20),
    address VARCHAR(255),
    zip_code VARCHAR(10),
    city VARCHAR(100),
    guardian_name VARCHAR(200),
    guardian_phone VARCHAR(20),
    guardian_email VARCHAR(255),
    member_fee_type VARCHAR(20) DEFAULT 'ADULT',
    expires_on DATE,
    merged_into_id VARCHAR(36),
    -- Sync metadata
    device_id VARCHAR(36) NOT NULL,
    sync_version BIGINT NOT NULL DEFAULT 1,
    created_at_utc DATETIME NOT NULL,
    modified_at_utc DATETIME NOT NULL,
    synced_at_utc DATETIME,
    INDEX idx_member_membership_id (membership_id),
    INDEX idx_member_status (status),
    INDEX idx_member_type (member_type),
    INDEX idx_member_sync_version (sync_version),
    INDEX idx_member_modified (modified_at_utc),
    INDEX idx_member_name (last_name, first_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Member photos (binary storage)
CREATE TABLE IF NOT EXISTS member_photos (
    id VARCHAR(36) PRIMARY KEY,
    internal_member_id VARCHAR(36) NOT NULL,
    photo_type ENUM('registration', 'profile') NOT NULL DEFAULT 'registration',
    content_hash VARCHAR(64) NOT NULL,
    mime_type VARCHAR(50) NOT NULL DEFAULT 'image/jpeg',
    file_size INT NOT NULL,
    width INT,
    height INT,
    photo_data MEDIUMBLOB NOT NULL,
    -- Sync metadata
    device_id VARCHAR(36) NOT NULL,
    sync_version BIGINT NOT NULL DEFAULT 1,
    created_at_utc DATETIME NOT NULL,
    synced_at_utc DATETIME,
    INDEX idx_photo_member (internal_member_id),
    INDEX idx_photo_hash (content_hash),
    INDEX idx_photo_sync (sync_version),
    FOREIGN KEY (internal_member_id) REFERENCES members(internal_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Check-ins table
CREATE TABLE IF NOT EXISTS check_ins (
    id VARCHAR(36) PRIMARY KEY,
    internal_member_id VARCHAR(36) NOT NULL,
    created_at_utc DATETIME NOT NULL,
    local_date DATE NOT NULL,
    first_of_day_flag BOOLEAN DEFAULT FALSE,
    -- Sync metadata
    device_id VARCHAR(36) NOT NULL,
    sync_version BIGINT NOT NULL DEFAULT 1,
    synced_at_utc DATETIME,
    INDEX idx_checkin_member (internal_member_id),
    INDEX idx_checkin_date (local_date),
    INDEX idx_checkin_member_date (internal_member_id, local_date),
    INDEX idx_checkin_sync (sync_version),
    FOREIGN KEY (internal_member_id) REFERENCES members(internal_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Practice sessions table
CREATE TABLE IF NOT EXISTS practice_sessions (
    id VARCHAR(36) PRIMARY KEY,
    internal_member_id VARCHAR(36) NOT NULL,
    created_at_utc DATETIME NOT NULL,
    local_date DATE NOT NULL,
    practice_type ENUM('Riffel', 'Pistol', 'LuftRiffel', 'LuftPistol', 'Andet') NOT NULL,
    points INT NOT NULL,
    krydser INT,
    classification VARCHAR(50),
    source ENUM('kiosk', 'attendant') NOT NULL DEFAULT 'kiosk',
    -- Sync metadata
    device_id VARCHAR(36) NOT NULL,
    sync_version BIGINT NOT NULL DEFAULT 1,
    synced_at_utc DATETIME,
    INDEX idx_session_member (internal_member_id),
    INDEX idx_session_date (local_date),
    INDEX idx_session_type_date (practice_type, local_date),
    INDEX idx_session_member_type (internal_member_id, practice_type),
    INDEX idx_session_sync (sync_version),
    FOREIGN KEY (internal_member_id) REFERENCES members(internal_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Scan events (audit trail)
CREATE TABLE IF NOT EXISTS scan_events (
    id VARCHAR(36) PRIMARY KEY,
    internal_member_id VARCHAR(36) NOT NULL,
    created_at_utc DATETIME NOT NULL,
    scan_type ENUM('FIRST_SCAN', 'REPEAT_SCAN') NOT NULL,
    linked_check_in_id VARCHAR(36),
    linked_session_id VARCHAR(36),
    canceled_flag BOOLEAN DEFAULT FALSE,
    -- Sync metadata
    device_id VARCHAR(36) NOT NULL,
    sync_version BIGINT NOT NULL DEFAULT 1,
    synced_at_utc DATETIME,
    INDEX idx_scan_member (internal_member_id),
    INDEX idx_scan_time (internal_member_id, created_at_utc),
    INDEX idx_scan_sync (sync_version),
    FOREIGN KEY (internal_member_id) REFERENCES members(internal_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- EQUIPMENT TABLES
-- =============================================

-- Equipment items
CREATE TABLE IF NOT EXISTS equipment_items (
    id VARCHAR(36) PRIMARY KEY,
    serial_number VARCHAR(50) NOT NULL UNIQUE,
    type ENUM('TrainingMaterial') NOT NULL DEFAULT 'TrainingMaterial',
    description VARCHAR(200),
    status ENUM('Available', 'CheckedOut', 'Maintenance', 'Retired') NOT NULL DEFAULT 'Available',
    discipline VARCHAR(50),
    -- Sync metadata
    device_id VARCHAR(36) NOT NULL,
    sync_version BIGINT NOT NULL DEFAULT 1,
    created_at_utc DATETIME NOT NULL,
    modified_at_utc DATETIME NOT NULL,
    synced_at_utc DATETIME,
    INDEX idx_equipment_status (status),
    INDEX idx_equipment_serial (serial_number),
    INDEX idx_equipment_sync (sync_version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Equipment checkouts
CREATE TABLE IF NOT EXISTS equipment_checkouts (
    id VARCHAR(36) PRIMARY KEY,
    equipment_id VARCHAR(36) NOT NULL,
    internal_member_id VARCHAR(36) NOT NULL,
    checked_out_at_utc DATETIME NOT NULL,
    checked_in_at_utc DATETIME,
    checkout_notes TEXT,
    checkin_notes TEXT,
    conflict_status ENUM('None', 'Pending', 'Resolved', 'Cancelled') DEFAULT 'None',
    -- Sync metadata
    device_id VARCHAR(36) NOT NULL,
    sync_version BIGINT NOT NULL DEFAULT 1,
    synced_at_utc DATETIME,
    INDEX idx_checkout_equipment (equipment_id),
    INDEX idx_checkout_member (internal_member_id),
    INDEX idx_checkout_status (conflict_status),
    INDEX idx_checkout_time (checked_out_at_utc),
    INDEX idx_checkout_sync (sync_version),
    FOREIGN KEY (equipment_id) REFERENCES equipment_items(id) ON DELETE CASCADE,
    FOREIGN KEY (internal_member_id) REFERENCES members(internal_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- TRAINER TABLES
-- =============================================

-- Trainer info
CREATE TABLE IF NOT EXISTS trainer_info (
    internal_member_id VARCHAR(36) PRIMARY KEY,
    is_trainer BOOLEAN DEFAULT FALSE,
    has_skydeleder_certificate BOOLEAN DEFAULT FALSE,
    certified_date DATE,
    notes TEXT,
    -- Sync metadata
    device_id VARCHAR(36) NOT NULL,
    sync_version BIGINT NOT NULL DEFAULT 1,
    created_at_utc DATETIME NOT NULL,
    modified_at_utc DATETIME NOT NULL,
    synced_at_utc DATETIME,
    INDEX idx_trainer_sync (sync_version),
    FOREIGN KEY (internal_member_id) REFERENCES members(internal_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Trainer disciplines
CREATE TABLE IF NOT EXISTS trainer_disciplines (
    id VARCHAR(36) PRIMARY KEY,
    internal_member_id VARCHAR(36) NOT NULL,
    discipline VARCHAR(50) NOT NULL,
    level VARCHAR(20),
    certified_date DATE,
    -- Sync metadata
    device_id VARCHAR(36) NOT NULL,
    sync_version BIGINT NOT NULL DEFAULT 1,
    created_at_utc DATETIME NOT NULL,
    synced_at_utc DATETIME,
    INDEX idx_trainer_disc_member (internal_member_id),
    INDEX idx_trainer_disc_sync (sync_version),
    FOREIGN KEY (internal_member_id) REFERENCES members(internal_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- FINANCE TABLES
-- =============================================

-- Posting categories
CREATE TABLE IF NOT EXISTS posting_categories (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    -- Sync metadata
    device_id VARCHAR(36) NOT NULL,
    sync_version BIGINT NOT NULL DEFAULT 1,
    created_at_utc DATETIME NOT NULL,
    modified_at_utc DATETIME NOT NULL,
    synced_at_utc DATETIME,
    INDEX idx_category_active (is_active),
    INDEX idx_category_sync (sync_version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Fiscal years
CREATE TABLE IF NOT EXISTS fiscal_years (
    year INT PRIMARY KEY,
    opening_cash_balance DECIMAL(10,2) NOT NULL DEFAULT 0,
    opening_bank_balance DECIMAL(10,2) NOT NULL DEFAULT 0,
    is_closed BOOLEAN NOT NULL DEFAULT FALSE,
    -- Sync metadata
    device_id VARCHAR(36) NOT NULL,
    sync_version BIGINT NOT NULL DEFAULT 1,
    created_at_utc DATETIME NOT NULL,
    modified_at_utc DATETIME NOT NULL,
    synced_at_utc DATETIME,
    INDEX idx_fiscal_sync (sync_version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Fee rates
CREATE TABLE IF NOT EXISTS fee_rates (
    fiscal_year INT NOT NULL,
    member_type VARCHAR(20) NOT NULL,
    fee_amount DECIMAL(10,2) NOT NULL,
    PRIMARY KEY (fiscal_year, member_type),
    FOREIGN KEY (fiscal_year) REFERENCES fiscal_years(year) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Financial transactions
CREATE TABLE IF NOT EXISTS financial_transactions (
    id VARCHAR(36) PRIMARY KEY,
    fiscal_year INT NOT NULL,
    sequence_number INT NOT NULL,
    transaction_date DATE NOT NULL,
    description VARCHAR(255) NOT NULL,
    cash_in DECIMAL(10,2),
    cash_out DECIMAL(10,2),
    bank_in DECIMAL(10,2),
    bank_out DECIMAL(10,2),
    notes TEXT,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    -- Sync metadata
    device_id VARCHAR(36) NOT NULL,
    sync_version BIGINT NOT NULL DEFAULT 1,
    created_at_utc DATETIME NOT NULL,
    modified_at_utc DATETIME NOT NULL,
    synced_at_utc DATETIME,
    UNIQUE KEY uk_fiscal_seq (fiscal_year, sequence_number),
    INDEX idx_txn_year (fiscal_year),
    INDEX idx_txn_date (transaction_date),
    INDEX idx_txn_sync (sync_version),
    FOREIGN KEY (fiscal_year) REFERENCES fiscal_years(year) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Transaction lines
CREATE TABLE IF NOT EXISTS transaction_lines (
    id VARCHAR(36) PRIMARY KEY,
    transaction_id VARCHAR(36) NOT NULL,
    category_id VARCHAR(36) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    is_income BOOLEAN NOT NULL DEFAULT FALSE,
    member_id VARCHAR(36),
    line_description VARCHAR(255),
    -- Sync metadata
    device_id VARCHAR(36),
    sync_version BIGINT NOT NULL DEFAULT 1,
    synced_at_utc DATETIME,
    INDEX idx_line_txn (transaction_id),
    INDEX idx_line_category (category_id),
    INDEX idx_line_member (member_id),
    INDEX idx_line_sync (sync_version),
    FOREIGN KEY (transaction_id) REFERENCES financial_transactions(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES posting_categories(id) ON DELETE RESTRICT,
    FOREIGN KEY (member_id) REFERENCES members(internal_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Pending fee payments
CREATE TABLE IF NOT EXISTS pending_fee_payments (
    id VARCHAR(36) PRIMARY KEY,
    fiscal_year INT NOT NULL,
    member_id VARCHAR(36) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    payment_date DATE NOT NULL,
    payment_method ENUM('CASH', 'BANK') NOT NULL,
    notes TEXT,
    is_consolidated BOOLEAN NOT NULL DEFAULT FALSE,
    consolidated_transaction_id VARCHAR(36),
    -- Sync metadata
    device_id VARCHAR(36) NOT NULL,
    sync_version BIGINT NOT NULL DEFAULT 1,
    created_at_utc DATETIME NOT NULL,
    modified_at_utc DATETIME NOT NULL,
    synced_at_utc DATETIME,
    INDEX idx_pending_year (fiscal_year),
    INDEX idx_pending_member (member_id),
    INDEX idx_pending_consolidated (is_consolidated),
    INDEX idx_pending_sync (sync_version),
    FOREIGN KEY (fiscal_year) REFERENCES fiscal_years(year) ON DELETE RESTRICT,
    FOREIGN KEY (member_id) REFERENCES members(internal_id) ON DELETE CASCADE,
    FOREIGN KEY (consolidated_transaction_id) REFERENCES financial_transactions(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- MEMBER PREFERENCES
-- =============================================

CREATE TABLE IF NOT EXISTS member_preferences (
    member_id VARCHAR(36) PRIMARY KEY,
    last_practice_type VARCHAR(20),
    last_classification VARCHAR(50),
    -- Sync metadata
    device_id VARCHAR(36),
    sync_version BIGINT NOT NULL DEFAULT 1,
    modified_at_utc DATETIME NOT NULL,
    synced_at_utc DATETIME,
    FOREIGN KEY (member_id) REFERENCES members(internal_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- CLEANUP EVENTS (for scheduled maintenance)
-- =============================================

-- Create event to clean old data (if events are enabled on server)
-- Note: May need to enable event scheduler: SET GLOBAL event_scheduler = ON;

DELIMITER //

CREATE EVENT IF NOT EXISTS cleanup_old_data
ON SCHEDULE EVERY 1 DAY
STARTS CURRENT_TIMESTAMP
DO
BEGIN
    -- Clean login attempts older than 7 days
    DELETE FROM _login_attempts WHERE attempted_at < NOW() - INTERVAL 7 DAY;

    -- Clean rate limits older than 1 hour
    DELETE FROM _rate_limits WHERE created_at < NOW() - INTERVAL 1 HOUR;

    -- Clean security log older than 90 days
    DELETE FROM _security_log WHERE created_at < NOW() - INTERVAL 90 DAY;

    -- Clean API access log older than 30 days
    DELETE FROM _api_access_log WHERE created_at < NOW() - INTERVAL 30 DAY;

    -- Clean processed batches older than 7 days
    DELETE FROM _processed_batches WHERE processed_at < NOW() - INTERVAL 7 DAY;

    -- Clean deletion log older than 90 days
    DELETE FROM _deletion_log WHERE deleted_at_utc < NOW() - INTERVAL 90 DAY;
END//

DELIMITER ;

-- =============================================
-- SEED DEFAULT DATA
-- =============================================

-- Insert default posting categories
INSERT INTO posting_categories (id, name, description, sort_order, is_active, device_id, sync_version, created_at_utc, modified_at_utc) VALUES
('cat-kontingent', 'Kontingent', 'Medlemskontingent', 1, TRUE, 'system', 1, NOW(), NOW()),
('cat-ammunition', 'Ammunition', 'Salg af ammunition', 2, TRUE, 'system', 1, NOW(), NOW()),
('cat-udstyr', 'Udstyr', 'Salg af udstyr', 3, TRUE, 'system', 1, NOW(), NOW()),
('cat-kurser', 'Kurser', 'Kursusindtægter', 4, TRUE, 'system', 1, NOW(), NOW()),
('cat-diverse', 'Diverse', 'Øvrige indtægter/udgifter', 5, TRUE, 'system', 1, NOW(), NOW())
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- =============================================
-- GRANTS (run as admin user if needed)
-- =============================================

-- Example grants for application user:
-- GRANT SELECT, INSERT, UPDATE, DELETE ON database_name.* TO 'app_user'@'localhost';
-- FLUSH PRIVILEGES;
