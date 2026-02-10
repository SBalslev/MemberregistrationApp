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
 * Handle POST /admin/entities/{type}/compare
 *
 * Compares local IDs with cloud IDs and returns the differences.
 * Request body: { "local_ids": ["id1", "id2", ...] }
 * Response: { "only_in_cloud": [...], "only_in_local": [...] }
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

    // Convert to sets for comparison
    $localSet = array_flip($localIds);
    $cloudSet = array_flip($cloudIds);

    // Find differences
    $onlyInCloud = array_values(array_diff($cloudIds, $localIds));
    $onlyInLocal = array_values(array_diff($localIds, $cloudIds));

    jsonResponse([
        'entity_type' => $entityType,
        'local_count' => count($localIds),
        'cloud_count' => count($cloudIds),
        'only_in_cloud' => $onlyInCloud,
        'only_in_local' => $onlyInLocal,
        'only_in_cloud_count' => count($onlyInCloud),
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
