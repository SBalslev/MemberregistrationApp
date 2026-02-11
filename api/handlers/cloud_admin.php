<?php
/**
 * Cloud Admin Handler
 *
 * Provides endpoints for viewing and managing cloud data.
 * Used by the laptop app to compare local vs cloud data and delete discrepancies.
 */

declare(strict_types=1);

// File version
const CLOUD_ADMIN_VERSION = '1.0.0';

/**
 * Entity type to table name mapping
 */
function getEntityTableMap(): array
{
    return [
        'members' => ['table' => 'members', 'id_column' => 'internal_id'],
        'check_ins' => ['table' => 'check_ins', 'id_column' => 'id'],
        'practice_sessions' => ['table' => 'practice_sessions', 'id_column' => 'id'],
        'equipment_items' => ['table' => 'equipment_items', 'id_column' => 'id'],
        'equipment_checkouts' => ['table' => 'equipment_checkouts', 'id_column' => 'id'],
        'trainer_info' => ['table' => 'trainer_info', 'id_column' => 'member_id'],
        'trainer_disciplines' => ['table' => 'trainer_disciplines', 'id_column' => 'id'],
        'posting_categories' => ['table' => 'posting_categories', 'id_column' => 'id'],
        'fiscal_years' => ['table' => 'fiscal_years', 'id_column' => 'year'],
        'fee_rates' => ['table' => 'fee_rates', 'id_column' => 'id'],
        'financial_transactions' => ['table' => 'financial_transactions', 'id_column' => 'id'],
        'transaction_lines' => ['table' => 'transaction_lines', 'id_column' => 'id'],
        'pending_fee_payments' => ['table' => 'pending_fee_payments', 'id_column' => 'id'],
        'scan_events' => ['table' => 'scan_events', 'id_column' => 'id'],
        'member_preferences' => ['table' => 'member_preferences', 'id_column' => 'member_id'],
        'new_member_registrations' => ['table' => 'new_member_registrations', 'id_column' => 'id'],
        'skv_registrations' => ['table' => 'skv_registrations', 'id_column' => 'id'],
        'skv_weapons' => ['table' => 'skv_weapons', 'id_column' => 'id'],
    ];
}

/**
 * Handle GET /admin/entities/{type}
 *
 * Lists all record IDs for a specific entity type.
 * Query params:
 *   - limit: max records to return (default 1000)
 *   - offset: pagination offset (default 0)
 */
function handleListEntityIds(): void
{
    $entityType = $GLOBALS['routeParams']['type'] ?? '';
    $limit = min((int)($_GET['limit'] ?? 1000), 10000);
    $offset = (int)($_GET['offset'] ?? 0);

    $entityMap = getEntityTableMap();

    if (!isset($entityMap[$entityType])) {
        errorResponse("Unknown entity type: $entityType", 400);
    }

    $table = $entityMap[$entityType]['table'];
    $idColumn = $entityMap[$entityType]['id_column'];

    // Get all IDs for this entity type
    $records = dbQuery(
        "SELECT $idColumn as id FROM $table ORDER BY $idColumn LIMIT ? OFFSET ?",
        [$limit, $offset]
    );

    $ids = array_column($records, 'id');

    // Get total count
    $countResult = dbQueryOne("SELECT COUNT(*) as cnt FROM $table");
    $totalCount = (int)($countResult['cnt'] ?? 0);

    jsonResponse([
        'entity_type' => $entityType,
        'ids' => $ids,
        'count' => count($ids),
        'total' => $totalCount,
        'limit' => $limit,
        'offset' => $offset,
        'has_more' => ($offset + count($ids)) < $totalCount,
    ]);
}

/**
 * Get display columns for each entity type (for showing meaningful info)
 */
function getEntityDisplayColumns(): array
{
    return [
        'members' => [
            'select' => 'internal_id, membership_id, first_name, last_name, status, created_at_utc',
            'format' => fn($r) => [
                'id' => $r['internal_id'],
                'display' => trim(($r['first_name'] ?? '') . ' ' . ($r['last_name'] ?? '')),
                'details' => "#{$r['membership_id']} - {$r['status']}",
                'created' => $r['created_at_utc'],
            ],
        ],
        'check_ins' => [
            'select' => 'c.id, c.local_date, c.created_at_utc, m.first_name, m.last_name, m.membership_id',
            'join' => 'LEFT JOIN members m ON c.internal_member_id = m.internal_id',
            'format' => fn($r) => [
                'id' => $r['id'],
                'display' => trim(($r['first_name'] ?? '') . ' ' . ($r['last_name'] ?? '')) ?: 'Ukendt medlem',
                'details' => "Dato: {$r['local_date']}",
                'created' => $r['created_at_utc'],
            ],
        ],
        'practice_sessions' => [
            'select' => 'p.id, p.local_date, p.practice_type, p.created_at_utc, m.first_name, m.last_name',
            'join' => 'LEFT JOIN members m ON p.internal_member_id = m.internal_id',
            'format' => fn($r) => [
                'id' => $r['id'],
                'display' => trim(($r['first_name'] ?? '') . ' ' . ($r['last_name'] ?? '')) ?: 'Ukendt medlem',
                'details' => "{$r['practice_type']} - {$r['local_date']}",
                'created' => $r['created_at_utc'],
            ],
        ],
        'pending_fee_payments' => [
            'select' => 'p.id, p.fiscal_year, p.amount, p.payment_date, p.payment_method, p.created_at_utc, m.first_name, m.last_name, m.membership_id',
            'join' => 'LEFT JOIN members m ON p.member_id = m.internal_id',
            'format' => fn($r) => [
                'id' => $r['id'],
                'display' => trim(($r['first_name'] ?? '') . ' ' . ($r['last_name'] ?? '')) ?: 'Ukendt medlem',
                'details' => sprintf("%s kr - %s (%d) - %s",
                    number_format((float)$r['amount'], 2, ',', '.'),
                    $r['payment_date'],
                    $r['fiscal_year'],
                    $r['payment_method']
                ),
                'created' => $r['created_at_utc'],
            ],
        ],
        'financial_transactions' => [
            'select' => 'id, sequence_number, date, description, created_at_utc',
            'format' => fn($r) => [
                'id' => $r['id'],
                'display' => "Bilag #{$r['sequence_number']}",
                'details' => "{$r['date']} - {$r['description']}",
                'created' => $r['created_at_utc'],
            ],
        ],
        'transaction_lines' => [
            'select' => 'tl.id, tl.amount, tl.is_income, tl.line_description, tl.created_at_utc, ft.sequence_number, ft.date',
            'join' => 'LEFT JOIN financial_transactions ft ON tl.transaction_id = ft.id',
            'format' => fn($r) => [
                'id' => $r['id'],
                'display' => sprintf("%s kr (%s)",
                    number_format((float)$r['amount'], 2, ',', '.'),
                    $r['is_income'] ? 'Indtægt' : 'Udgift'
                ),
                'details' => "Bilag #{$r['sequence_number']} - {$r['line_description']}",
                'created' => $r['created_at_utc'],
            ],
        ],
        'equipment_items' => [
            'select' => 'id, name, category, status, created_at_utc',
            'format' => fn($r) => [
                'id' => $r['id'],
                'display' => $r['name'],
                'details' => "{$r['category']} - {$r['status']}",
                'created' => $r['created_at_utc'],
            ],
        ],
        'equipment_checkouts' => [
            'select' => 'ec.id, ec.checkout_date, ec.return_date, ec.created_at_utc, ei.name as item_name, m.first_name, m.last_name',
            'join' => 'LEFT JOIN equipment_items ei ON ec.item_id = ei.id LEFT JOIN members m ON ec.member_id = m.internal_id',
            'format' => fn($r) => [
                'id' => $r['id'],
                'display' => $r['item_name'] ?? 'Ukendt udstyr',
                'details' => sprintf("%s - %s (%s)",
                    trim(($r['first_name'] ?? '') . ' ' . ($r['last_name'] ?? '')) ?: 'Ukendt',
                    $r['checkout_date'],
                    $r['return_date'] ? "returneret {$r['return_date']}" : 'ikke returneret'
                ),
                'created' => $r['created_at_utc'],
            ],
        ],
        'scan_events' => [
            'select' => 's.id, s.scan_type, s.created_at_utc, m.first_name, m.last_name',
            'join' => 'LEFT JOIN members m ON s.internal_member_id = m.internal_id',
            'format' => fn($r) => [
                'id' => $r['id'],
                'display' => trim(($r['first_name'] ?? '') . ' ' . ($r['last_name'] ?? '')) ?: 'Ukendt medlem',
                'details' => $r['scan_type'],
                'created' => $r['created_at_utc'],
            ],
        ],
    ];
}

/**
 * Handle POST /admin/entities/{type}/compare
 *
 * Compares local IDs with cloud IDs and returns the differences with details.
 * Request body: { "local_ids": ["id1", "id2", ...] }
 */
function handleCompareEntityIds(): void
{
    $entityType = $GLOBALS['routeParams']['type'] ?? '';

    $entityMap = getEntityTableMap();

    if (!isset($entityMap[$entityType])) {
        errorResponse("Unknown entity type: $entityType", 400);
    }

    // Parse request body
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input || !isset($input['local_ids'])) {
        errorResponse("Request body must contain 'local_ids' array", 400);
    }

    $localIds = $input['local_ids'];
    if (!is_array($localIds)) {
        errorResponse("'local_ids' must be an array", 400);
    }

    $table = $entityMap[$entityType]['table'];
    $idColumn = $entityMap[$entityType]['id_column'];

    // Get all cloud IDs
    $cloudRecords = dbQuery("SELECT $idColumn as id FROM $table");
    $cloudIds = array_column($cloudRecords, 'id');

    // Find differences
    $onlyInCloudIds = array_values(array_diff($cloudIds, $localIds));
    $onlyInLocal = array_values(array_diff($localIds, $cloudIds));

    // Get detailed info for cloud-only records (limit to first 100 for performance)
    $displayConfig = getEntityDisplayColumns();
    $onlyInCloudDetails = [];

    if (count($onlyInCloudIds) > 0 && isset($displayConfig[$entityType])) {
        $config = $displayConfig[$entityType];
        $alias = $entityType === 'check_ins' ? 'c' :
                 ($entityType === 'practice_sessions' ? 'p' :
                 ($entityType === 'pending_fee_payments' ? 'p' :
                 ($entityType === 'transaction_lines' ? 'tl' :
                 ($entityType === 'equipment_checkouts' ? 'ec' :
                 ($entityType === 'scan_events' ? 's' : '')))));

        $idRef = $alias ? "$alias.$idColumn" : $idColumn;
        $limitedIds = array_slice($onlyInCloudIds, 0, 100);
        $placeholders = implode(',', array_fill(0, count($limitedIds), '?'));

        $join = $config['join'] ?? '';
        $sql = "SELECT {$config['select']} FROM $table" . ($alias ? " $alias" : "") . " $join WHERE $idRef IN ($placeholders)";

        $records = dbQuery($sql, $limitedIds);
        $formatter = $config['format'];

        foreach ($records as $record) {
            $onlyInCloudDetails[] = $formatter($record);
        }
    } elseif (count($onlyInCloudIds) > 0) {
        // Fallback for entity types without display config
        foreach (array_slice($onlyInCloudIds, 0, 100) as $id) {
            $onlyInCloudDetails[] = [
                'id' => $id,
                'display' => (string)$id,
                'details' => '',
                'created' => null,
            ];
        }
    }

    jsonResponse([
        'entity_type' => $entityType,
        'local_count' => count($localIds),
        'cloud_count' => count($cloudIds),
        'only_in_cloud' => $onlyInCloudIds,
        'only_in_cloud_details' => $onlyInCloudDetails,
        'only_in_local' => $onlyInLocal,
        'only_in_cloud_count' => count($onlyInCloudIds),
        'only_in_local_count' => count($onlyInLocal),
    ]);
}

/**
 * Handle GET /admin/entities/{type}/{id}
 *
 * Gets details for a specific entity record.
 */
function handleGetEntityDetails(): void
{
    $entityType = $GLOBALS['routeParams']['type'] ?? '';
    $entityId = $GLOBALS['routeParams']['id'] ?? '';

    $entityMap = getEntityTableMap();

    if (!isset($entityMap[$entityType])) {
        errorResponse("Unknown entity type: $entityType", 400);
    }

    $table = $entityMap[$entityType]['table'];
    $idColumn = $entityMap[$entityType]['id_column'];

    $record = dbQueryOne(
        "SELECT * FROM $table WHERE $idColumn = ?",
        [$entityId]
    );

    if (!$record) {
        errorResponse("Record not found", 404);
    }

    jsonResponse([
        'entity_type' => $entityType,
        'id' => $entityId,
        'record' => $record,
    ]);
}

/**
 * Handle DELETE /admin/entities/{type}/{id}
 *
 * Deletes a specific entity record from the cloud.
 */
function handleDeleteEntity(): void
{
    $entityType = $GLOBALS['routeParams']['type'] ?? '';
    $entityId = $GLOBALS['routeParams']['id'] ?? '';

    $entityMap = getEntityTableMap();

    if (!isset($entityMap[$entityType])) {
        errorResponse("Unknown entity type: $entityType", 400);
    }

    $table = $entityMap[$entityType]['table'];
    $idColumn = $entityMap[$entityType]['id_column'];

    // Check if record exists
    $record = dbQueryOne(
        "SELECT $idColumn FROM $table WHERE $idColumn = ?",
        [$entityId]
    );

    if (!$record) {
        errorResponse("Record not found", 404);
    }

    // Delete the record
    dbExecute(
        "DELETE FROM $table WHERE $idColumn = ?",
        [$entityId]
    );

    // Log the deletion
    $authPayload = $GLOBALS['authPayload'] ?? null;
    $deviceId = $authPayload['device_id'] ?? 'unknown';
    error_log("[CloudAdmin] Deleted $entityType/$entityId by device $deviceId");

    jsonResponse([
        'success' => true,
        'entity_type' => $entityType,
        'id' => $entityId,
        'message' => "Record deleted successfully",
    ]);
}

/**
 * Handle POST /admin/entities/{type}/delete-batch
 *
 * Deletes multiple entity records from the cloud.
 * Request body: { "ids": ["id1", "id2", ...] }
 */
function handleDeleteEntityBatch(): void
{
    $entityType = $GLOBALS['routeParams']['type'] ?? '';

    $entityMap = getEntityTableMap();

    if (!isset($entityMap[$entityType])) {
        errorResponse("Unknown entity type: $entityType", 400);
    }

    // Parse request body
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input || !isset($input['ids'])) {
        errorResponse("Request body must contain 'ids' array", 400);
    }

    $ids = $input['ids'];
    if (!is_array($ids) || empty($ids)) {
        errorResponse("'ids' must be a non-empty array", 400);
    }

    // Limit batch size to prevent abuse
    if (count($ids) > 500) {
        errorResponse("Maximum batch size is 500 records", 400);
    }

    $table = $entityMap[$entityType]['table'];
    $idColumn = $entityMap[$entityType]['id_column'];

    // Delete records
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $deleted = dbExecute(
        "DELETE FROM $table WHERE $idColumn IN ($placeholders)",
        $ids
    );

    // Log the deletion
    $authPayload = $GLOBALS['authPayload'] ?? null;
    $deviceId = $authPayload['device_id'] ?? 'unknown';
    error_log("[CloudAdmin] Batch deleted " . count($ids) . " $entityType records by device $deviceId");

    jsonResponse([
        'success' => true,
        'entity_type' => $entityType,
        'requested' => count($ids),
        'deleted' => $deleted,
        'message' => "$deleted records deleted successfully",
    ]);
}
