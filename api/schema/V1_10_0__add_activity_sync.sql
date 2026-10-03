ALTER TABLE practice_sessions
    ADD COLUMN activity_id VARCHAR(36) NULL AFTER internal_member_id,
    ADD INDEX idx_practice_activity (activity_id);

CREATE TABLE IF NOT EXISTS activities (
    id VARCHAR(36) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    type ENUM('OPEN_DAY','COMPETITION','TRAINING','OTHER') NOT NULL,
    starts_at_utc DATETIME NOT NULL,
    ends_at_utc DATETIME NULL,
    status ENUM('DRAFT','ACTIVE','COMPLETED') NOT NULL DEFAULT 'DRAFT',
    display_enabled TINYINT(1) NOT NULL DEFAULT 1,
    created_at_utc DATETIME NOT NULL,
    modified_at_utc DATETIME NOT NULL,
    device_id VARCHAR(36) NOT NULL,
    sync_version BIGINT NOT NULL DEFAULT 1,
    synced_at_utc DATETIME NULL,
    INDEX idx_activity_status (status),
    INDEX idx_activity_modified (modified_at_utc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS activity_guests (
    id VARCHAR(36) PRIMARY KEY,
    activity_id VARCHAR(36) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    club_name VARCHAR(255) NULL,
    start_number VARCHAR(50) NULL,
    show_on_display TINYINT(1) NOT NULL DEFAULT 1,
    created_at_utc DATETIME NOT NULL,
    modified_at_utc DATETIME NOT NULL,
    device_id VARCHAR(36) NOT NULL,
    sync_version BIGINT NOT NULL DEFAULT 1,
    synced_at_utc DATETIME NULL,
    INDEX idx_activity_guest_activity (activity_id),
    INDEX idx_activity_guest_modified (modified_at_utc),
    CONSTRAINT fk_activity_guest_activity FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS guest_results (
    id VARCHAR(36) PRIMARY KEY,
    activity_id VARCHAR(36) NOT NULL,
    guest_id VARCHAR(36) NOT NULL,
    created_at_utc DATETIME NOT NULL,
    local_date DATE NOT NULL,
    practice_type VARCHAR(30) NOT NULL,
    points INT NOT NULL,
    krydser INT NULL,
    classification VARCHAR(50) NULL,
    device_id VARCHAR(36) NOT NULL,
    sync_version BIGINT NOT NULL DEFAULT 1,
    synced_at_utc DATETIME NULL,
    INDEX idx_guest_result_activity (activity_id),
    INDEX idx_guest_result_guest (guest_id),
    INDEX idx_guest_result_created (created_at_utc),
    CONSTRAINT fk_guest_result_activity FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE,
    CONSTRAINT fk_guest_result_guest FOREIGN KEY (guest_id) REFERENCES activity_guests(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

UPDATE _schema_metadata
SET minor_version = 10, patch_version = 0, last_migration_at = NOW(),
    description = 'Activity synchronization';
