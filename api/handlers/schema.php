<?php
/**
 * Schema Version Handler
 */

declare(strict_types=1);

/**
 * Handle GET /schema/version
 * Return current database schema version
 */
function handleSchemaVersion(): void
{
    try {
        $row = dbQueryOne(
            "SELECT major_version, minor_version, patch_version, description, created_at
             FROM _schema_metadata WHERE id = 1"
        );

        if (!$row) {
            errorResponse('Schema metadata not found. Database may need initialization.', 500);
        }

        jsonResponse([
            'major' => (int)$row['major_version'],
            'minor' => (int)$row['minor_version'],
            'patch' => (int)$row['patch_version'],
            'version' => sprintf('%d.%d.%d', $row['major_version'], $row['minor_version'], $row['patch_version']),
            'description' => $row['description'],
            'created_at' => $row['created_at'],
        ]);
    } catch (Exception $e) {
        error_log('Schema version check failed: ' . $e->getMessage());
        errorResponse('Failed to retrieve schema version', 500);
    }
}
