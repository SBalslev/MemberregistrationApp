<?php
/**
 * Sync Status Handler
 */

declare(strict_types=1);

/**
 * Handle GET /sync/status
 */
function handleSyncStatus(): void
{
    $authPayload = $GLOBALS['authPayload'] ?? null;
    $deviceId = $authPayload['device_id'] ?? null;

    // Get schema version
    $schema = dbQueryOne(
        "SELECT major_version, minor_version, patch_version FROM _schema_metadata WHERE id = 1"
    );
    $schemaVersion = $schema
        ? sprintf('%d.%d.%d', $schema['major_version'], $schema['minor_version'], $schema['patch_version'])
        : 'unknown';

    // Get last sync for this device
    $lastSync = null;
    if ($deviceId) {
        $lastSync = dbQueryOne(
            "SELECT device_id, started_at, completed_at, status, entities_pushed, entities_pulled
             FROM _sync_log
             WHERE device_id = ?
             ORDER BY started_at DESC
             LIMIT 1",
            [$deviceId]
        );
    }

    // Count pending deletes (deletions that happened since device's last sync)
    $pendingDeletes = 0;
    if ($lastSync && $lastSync['completed_at']) {
        $deleteCount = dbQueryOne(
            "SELECT COUNT(*) as cnt FROM _deletion_log WHERE deleted_at_utc > ?",
            [$lastSync['completed_at']]
        );
        $pendingDeletes = (int)($deleteCount['cnt'] ?? 0);
    }

    // Get entity counts for all synced tables
    $counts = [
        // Core member data
        'members' => (int)(dbQueryOne("SELECT COUNT(*) as cnt FROM members")['cnt'] ?? 0),
        'member_photos' => (int)(dbQueryOne("SELECT COUNT(*) as cnt FROM member_photos")['cnt'] ?? 0),
        'member_preferences' => (int)(dbQueryOne("SELECT COUNT(*) as cnt FROM member_preferences")['cnt'] ?? 0),
        // Activity data
        'check_ins' => (int)(dbQueryOne("SELECT COUNT(*) as cnt FROM check_ins")['cnt'] ?? 0),
        'practice_sessions' => (int)(dbQueryOne("SELECT COUNT(*) as cnt FROM practice_sessions")['cnt'] ?? 0),
        'scan_events' => (int)(dbQueryOne("SELECT COUNT(*) as cnt FROM scan_events")['cnt'] ?? 0),
        // Equipment data
        'equipment_items' => (int)(dbQueryOne("SELECT COUNT(*) as cnt FROM equipment_items")['cnt'] ?? 0),
        'equipment_checkouts' => (int)(dbQueryOne("SELECT COUNT(*) as cnt FROM equipment_checkouts")['cnt'] ?? 0),
        // Trainer data
        'trainer_info' => (int)(dbQueryOne("SELECT COUNT(*) as cnt FROM trainer_info")['cnt'] ?? 0),
        'trainer_disciplines' => (int)(dbQueryOne("SELECT COUNT(*) as cnt FROM trainer_disciplines")['cnt'] ?? 0),
        // Finance data
        'posting_categories' => (int)(dbQueryOne("SELECT COUNT(*) as cnt FROM posting_categories")['cnt'] ?? 0),
        'fiscal_years' => (int)(dbQueryOne("SELECT COUNT(*) as cnt FROM fiscal_years")['cnt'] ?? 0),
        'fee_rates' => (int)(dbQueryOne("SELECT COUNT(*) as cnt FROM fee_rates")['cnt'] ?? 0),
        'financial_transactions' => (int)(dbQueryOne("SELECT COUNT(*) as cnt FROM financial_transactions")['cnt'] ?? 0),
        'transaction_lines' => (int)(dbQueryOne("SELECT COUNT(*) as cnt FROM transaction_lines")['cnt'] ?? 0),
        'pending_fee_payments' => (int)(dbQueryOne("SELECT COUNT(*) as cnt FROM pending_fee_payments")['cnt'] ?? 0),
    ];

    jsonResponse([
        'connected' => true,
        'schema_version' => $schemaVersion,
        'device_id' => $deviceId,
        'last_sync' => $lastSync ? [
            'timestamp' => formatDatetimeForStatus($lastSync['completed_at'] ?? $lastSync['started_at']),
            'status' => $lastSync['status'],
            'entities_pushed' => (int)$lastSync['entities_pushed'],
            'entities_pulled' => (int)$lastSync['entities_pulled'],
        ] : null,
        'pending_deletes' => $pendingDeletes,
        'entity_counts' => $counts,
        'server_time' => gmdate('Y-m-d\TH:i:s\Z'),
    ]);
}

/**
 * Format datetime for status response
 */
function formatDatetimeForStatus(?string $datetime): ?string
{
    if (!$datetime) {
        return null;
    }
    $dt = new DateTime($datetime);
    return $dt->format('Y-m-d\TH:i:s\Z');
}
