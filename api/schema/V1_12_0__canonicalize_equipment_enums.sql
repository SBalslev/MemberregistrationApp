ALTER TABLE equipment_items
    MODIFY COLUMN type VARCHAR(30) NOT NULL DEFAULT 'TRAINING_MATERIAL',
    MODIFY COLUMN status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE';

UPDATE equipment_items
SET type = CASE type
        WHEN 'TrainingMaterial' THEN 'TRAINING_MATERIAL'
        ELSE UPPER(type)
    END,
    status = CASE status
        WHEN 'Available' THEN 'AVAILABLE'
        WHEN 'CheckedOut' THEN 'CHECKED_OUT'
        WHEN 'Maintenance' THEN 'MAINTENANCE'
        WHEN 'Retired' THEN 'RETIRED'
        ELSE UPPER(status)
    END;

ALTER TABLE equipment_items
    MODIFY COLUMN type ENUM(
        'TRAINING_MATERIAL',
        'PISTOL',
        'AIR_PISTOL',
        'AIR_RIFLE',
        'RIFLE',
        'LONG_DISTANCE',
        'OTHER'
    ) NOT NULL DEFAULT 'TRAINING_MATERIAL',
    MODIFY COLUMN status ENUM(
        'AVAILABLE',
        'CHECKED_OUT',
        'MAINTENANCE',
        'RETIRED'
    ) NOT NULL DEFAULT 'AVAILABLE';

UPDATE _schema_metadata
SET minor_version = 12,
    patch_version = 0,
    last_migration_at = NOW(),
    description = 'Canonical equipment type and status enum values'
WHERE id = 1;
