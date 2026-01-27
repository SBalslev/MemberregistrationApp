-- Migration V1_3_0: Add source column to transaction_lines
-- This column tracks whether the line amount is from CASH or BANK
-- Required for proper validation that line totals match transaction header amounts

-- Add source column to transaction_lines table
ALTER TABLE transaction_lines
ADD COLUMN source VARCHAR(4) NOT NULL DEFAULT 'CASH'
AFTER is_income;

-- Add check constraint for valid values (MySQL 8.0.16+)
-- Note: For older MySQL versions, this constraint is informational only
ALTER TABLE transaction_lines
ADD CONSTRAINT chk_transaction_line_source CHECK (source IN ('CASH', 'BANK'));

-- Update schema metadata
UPDATE _schema_metadata
SET minor_version = 3,
    patch_version = 0,
    last_migration_at = NOW(),
    description = 'Schema 1.3.0 - Added source column to transaction_lines'
WHERE id = 1;
