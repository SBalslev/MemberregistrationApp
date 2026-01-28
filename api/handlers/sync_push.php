<?php
/**
 * Sync Push Handler
 * Receives data from laptop and stores in database
 */

declare(strict_types=1);

// File version - increment when making changes
const SYNC_PUSH_VERSION = '1.5.0';  // 1.5.0: Added id_photo_path, id_photo_thumbnail for adult ID verification

// ===== Helper Functions =====

/**
 * Convert ISO 8601 datetime to MySQL DATETIME format.
 * Handles formats like: 2026-01-27T14:38:00.283Z, 2026-01-27T14:38:00Z, 2026-01-27 14:38:00
 */
function toMySqlDateTime(?string $isoDateTime): ?string
{
    if ($isoDateTime === null || $isoDateTime === '') {
        return null;
    }

    // Already in MySQL format?
    if (preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/', $isoDateTime)) {
        return $isoDateTime;
    }

    // Parse ISO 8601 format
    $dt = DateTime::createFromFormat('Y-m-d\TH:i:s.u\Z', $isoDateTime);
    if (!$dt) {
        $dt = DateTime::createFromFormat('Y-m-d\TH:i:s\Z', $isoDateTime);
    }
    if (!$dt) {
        $dt = DateTime::createFromFormat('Y-m-d\TH:i:sP', $isoDateTime);
    }
    if (!$dt) {
        // Last resort - try strtotime
        $ts = strtotime($isoDateTime);
        if ($ts !== false) {
            return gmdate('Y-m-d H:i:s', $ts);
        }
        return null;
    }

    return $dt->format('Y-m-d H:i:s');
}

/**
 * Convert practice type from laptop format to MySQL ENUM.
 * Laptop: 'RIFLE', 'PISTOL'
 * MySQL: 'Riffel', 'Pistol', 'LuftRiffel', 'LuftPistol', 'Andet'
 */
function toPracticeTypeEnum(?string $practiceType): string
{
    $map = [
        'RIFLE' => 'Riffel',
        'PISTOL' => 'Pistol',
        'AIR_RIFLE' => 'LuftRiffel',
        'AIR_PISTOL' => 'LuftPistol',
        // Allow direct MySQL enum values too
        'Riffel' => 'Riffel',
        'Pistol' => 'Pistol',
        'LuftRiffel' => 'LuftRiffel',
        'LuftPistol' => 'LuftPistol',
        'Andet' => 'Andet',
    ];

    return $map[$practiceType] ?? 'Andet';
}

/**
 * Convert boolean value for MySQL.
 */
function toBool($value): int
{
    if ($value === null) {
        return 0;
    }
    return $value ? 1 : 0;
}

/**
 * Get entity array supporting both camelCase and snake_case keys.
 * TypeScript sends camelCase, PHP expects snake_case.
 */
function getEntity(array $entities, string $snakeKey, string $camelKey): array
{
    return $entities[$snakeKey] ?? $entities[$camelKey] ?? [];
}

/**
 * Handle POST /sync/push
 */
function handleSyncPush(): void
{
    $config = require __DIR__ . '/../config.php';
    $authPayload = $GLOBALS['authPayload'] ?? null;
    $deviceId = $authPayload['device_id'] ?? 'unknown';

    // Parse input
    $input = json_decode(file_get_contents('php://input'), true);

    if (!$input) {
        errorResponse('Invalid JSON body', 400);
    }

    // Validate required fields
    $validation = validateInput($input, [
        'batch_id' => ['required' => true, 'type' => 'uuid'],
        'device_id' => ['required' => true, 'type' => 'device_id', 'max_length' => 64],
        'schema_version' => ['required' => true, 'type' => 'string', 'max_length' => 20],
    ]);

    if (!$validation['valid']) {
        errorResponse('Invalid request', 400, ['details' => $validation['errors']]);
    }

    $batchId = $validation['data']['batch_id'];

    // Idempotency check
    if (isBatchProcessed($batchId)) {
        jsonResponse([
            'success' => true,
            'message' => 'Batch already processed',
            'batch_id' => $batchId,
        ]);
        return;
    }

    // Check schema version compatibility
    $schemaCheck = checkSchemaCompatibility($validation['data']['schema_version']);
    if (!$schemaCheck['compatible']) {
        errorResponse($schemaCheck['message'], 409, [
            'server_version' => $schemaCheck['server_version'],
            'client_version' => $validation['data']['schema_version'],
        ]);
    }

    $entities = $input['entities'] ?? [];
    $result = [
        'success' => true,
        'processed' => [],
        'conflicts' => [],
        'batch_id' => $batchId,
    ];

    dbBeginTransaction();

    try {
        // Process each entity type (support both camelCase and snake_case keys)
        $membersData = getEntity($entities, 'members', 'members');
        if (!empty($membersData)) {
            $result['processed']['members'] = processMembersPush($membersData, $deviceId);
        }

        $checkInsData = getEntity($entities, 'check_ins', 'checkIns');
        if (!empty($checkInsData)) {
            $result['processed']['check_ins'] = processCheckInsPush($checkInsData, $deviceId);
        }

        $practiceSessionsData = getEntity($entities, 'practice_sessions', 'practiceSessions');
        if (!empty($practiceSessionsData)) {
            $result['processed']['practice_sessions'] = processPracticeSessionsPush($practiceSessionsData, $deviceId);
        }

        $equipmentItemsData = getEntity($entities, 'equipment_items', 'equipmentItems');
        if (!empty($equipmentItemsData)) {
            $result['processed']['equipment_items'] = processEquipmentItemsPush($equipmentItemsData, $deviceId);
        }

        $equipmentCheckoutsData = getEntity($entities, 'equipment_checkouts', 'equipmentCheckouts');
        if (!empty($equipmentCheckoutsData)) {
            $result['processed']['equipment_checkouts'] = processEquipmentCheckoutsPush($equipmentCheckoutsData, $deviceId);
        }

        $trainerInfosData = getEntity($entities, 'trainer_infos', 'trainerInfos');
        if (!empty($trainerInfosData)) {
            $result['processed']['trainer_infos'] = processTrainerInfosPush($trainerInfosData, $deviceId);
        }

        $trainerDisciplinesData = getEntity($entities, 'trainer_disciplines', 'trainerDisciplines');
        if (!empty($trainerDisciplinesData)) {
            $result['processed']['trainer_disciplines'] = processTrainerDisciplinesPush($trainerDisciplinesData, $deviceId);
        }

        // Finance entities
        $fiscalYearsData = getEntity($entities, 'fiscal_years', 'fiscalYears');
        if (!empty($fiscalYearsData)) {
            $result['processed']['fiscal_years'] = processFiscalYearsPush($fiscalYearsData, $deviceId);
        }

        $postingCategoriesData = getEntity($entities, 'posting_categories', 'postingCategories');
        if (!empty($postingCategoriesData)) {
            $result['processed']['posting_categories'] = processPostingCategoriesPush($postingCategoriesData, $deviceId);
        }

        $financialTransactionsData = getEntity($entities, 'financial_transactions', 'financialTransactions');
        if (!empty($financialTransactionsData)) {
            $result['processed']['financial_transactions'] = processFinancialTransactionsPush($financialTransactionsData, $deviceId);
        }

        $transactionLinesData = getEntity($entities, 'transaction_lines', 'transactionLines');
        if (!empty($transactionLinesData)) {
            $result['processed']['transaction_lines'] = processTransactionLinesPush($transactionLinesData, $deviceId);
        }

        $pendingFeePaymentsData = getEntity($entities, 'pending_fee_payments', 'pendingFeePayments');
        if (!empty($pendingFeePaymentsData)) {
            $result['processed']['pending_fee_payments'] = processPendingFeePaymentsPush($pendingFeePaymentsData, $deviceId);
        }

        $scanEventsData = getEntity($entities, 'scan_events', 'scanEvents');
        if (!empty($scanEventsData)) {
            $result['processed']['scan_events'] = processScanEventsPush($scanEventsData, $deviceId);
        }

        $memberPreferencesData = getEntity($entities, 'member_preferences', 'memberPreferences');
        if (!empty($memberPreferencesData)) {
            $result['processed']['member_preferences'] = processMemberPreferencesPush($memberPreferencesData, $deviceId);
        }

        $registrationsData = getEntity($entities, 'new_member_registrations', 'newMemberRegistrations');
        if (!empty($registrationsData)) {
            $result['processed']['new_member_registrations'] = processNewMemberRegistrationsPush($registrationsData, $deviceId);
        }

        $skvRegistrationsData = getEntity($entities, 'skv_registrations', 'skvRegistrations');
        if (!empty($skvRegistrationsData)) {
            $result['processed']['skv_registrations'] = processSkvRegistrationsPush($skvRegistrationsData, $deviceId);
        }

        $skvWeaponsData = getEntity($entities, 'skv_weapons', 'skvWeapons');
        if (!empty($skvWeaponsData)) {
            $result['processed']['skv_weapons'] = processSkvWeaponsPush($skvWeaponsData, $deviceId);
        }

        // Record batch as processed
        recordProcessedBatch($batchId, $deviceId);

        dbCommit();

        $result['server_time'] = gmdate('Y-m-d\TH:i:s\Z');
        jsonResponse($result);

    } catch (Exception $e) {
        dbRollback();
        error_log('Sync push failed: ' . $e->getMessage());
        errorResponse('Sync failed: ' . $e->getMessage(), 500);
    }
}

/**
 * Check if batch was already processed (idempotency)
 */
function isBatchProcessed(string $batchId): bool
{
    $row = dbQueryOne(
        "SELECT id FROM _processed_batches WHERE batch_id = ?",
        [$batchId]
    );
    return $row !== null;
}

/**
 * Record batch as processed
 */
function recordProcessedBatch(string $batchId, string $deviceId): void
{
    dbExecute(
        "INSERT INTO _processed_batches (batch_id, device_id, processed_at) VALUES (?, ?, NOW())",
        [$batchId, $deviceId]
    );
}

/**
 * Check schema version compatibility
 */
function checkSchemaCompatibility(string $clientVersion): array
{
    $serverRow = dbQueryOne(
        "SELECT major_version, minor_version, patch_version FROM _schema_metadata WHERE id = 1"
    );

    if (!$serverRow) {
        return ['compatible' => false, 'message' => 'Server schema not initialized'];
    }

    $serverVersion = sprintf('%d.%d.%d',
        $serverRow['major_version'],
        $serverRow['minor_version'],
        $serverRow['patch_version']
    );

    // Parse client version
    $clientParts = explode('.', $clientVersion);
    $clientMajor = (int)($clientParts[0] ?? 0);

    // Major version must match
    if ($clientMajor !== (int)$serverRow['major_version']) {
        return [
            'compatible' => false,
            'message' => 'Major version mismatch. Please update the application.',
            'server_version' => $serverVersion,
        ];
    }

    return [
        'compatible' => true,
        'server_version' => $serverVersion,
    ];
}

/**
 * Process members push - last edit wins
 */
function processMembersPush(array $members, string $deviceId): array
{
    $stats = ['inserted' => 0, 'updated' => 0, 'deleted' => 0, 'skipped' => 0];

    foreach ($members as $member) {
        $action = $member['_action'] ?? 'upsert';
        $internalId = $member['internal_id'] ?? null;

        if (!$internalId) {
            continue;
        }

        if ($action === 'delete') {
            // Log deletion for sync
            dbExecute(
                "INSERT INTO _deletion_log (entity_type, entity_id, deleted_by_device, deleted_at_utc)
                 VALUES ('members', ?, ?, NOW())",
                [$internalId, $deviceId]
            );
            dbExecute("DELETE FROM members WHERE internal_id = ?", [$internalId]);
            $stats['deleted']++;
            continue;
        }

        // Check existing record
        $existing = dbQueryOne(
            "SELECT modified_at_utc FROM members WHERE internal_id = ?",
            [$internalId]
        );

        $clientModified = $member['modified_at_utc'] ?? $member['updated_at_utc'] ?? null;

        if ($existing) {
            // Last edit wins - compare timestamps
            if ($clientModified && strtotime($clientModified) <= strtotime($existing['modified_at_utc'])) {
                $stats['skipped']++;
                continue;
            }

            // Update existing
            updateMember($member, $deviceId);
            $stats['updated']++;
        } else {
            // Insert new
            insertMember($member, $deviceId);
            $stats['inserted']++;
        }
    }

    return $stats;
}

/**
 * Insert a new member
 */
function insertMember(array $member, string $deviceId): void
{
    $sql = "INSERT INTO members (
        internal_id, membership_id, member_type, status,
        first_name, last_name, birth_date, gender,
        email, phone, address, zip_code, city,
        guardian_name, guardian_phone, guardian_email,
        member_fee_type, expires_on, merged_into_id,
        id_photo_path, id_photo_thumbnail,
        device_id, sync_version, created_at_utc, modified_at_utc, synced_at_utc
    ) VALUES (
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?,
        ?, ?, ?, ?, NOW()
    )";

    dbExecute($sql, [
        $member['internal_id'],
        $member['membership_id'] ?? null,
        $member['member_lifecycle_stage'] ?? 'TRIAL',  // TRIAL or FULL
        $member['status'] ?? 'ACTIVE',
        $member['first_name'],
        $member['last_name'],
        $member['birth_date'] ?? null,
        $member['gender'] ?? null,
        $member['email'] ?? null,
        $member['phone'] ?? null,
        $member['address'] ?? null,
        $member['zip_code'] ?? null,
        $member['city'] ?? null,
        $member['guardian_name'] ?? null,
        $member['guardian_phone'] ?? null,
        $member['guardian_email'] ?? null,
        $member['member_type'] ?? 'ADULT',  // Fee type: ADULT, CHILD, CHILD_PLUS
        $member['expires_on'] ?? null,
        $member['merged_into_id'] ?? null,
        $member['id_photo_path'] ?? null,
        $member['id_photo_thumbnail'] ?? null,
        $deviceId,
        $member['sync_version'] ?? 1,
        toMySqlDateTime($member['created_at_utc'] ?? null) ?? gmdate('Y-m-d H:i:s'),
        toMySqlDateTime($member['modified_at_utc'] ?? $member['updated_at_utc'] ?? null) ?? gmdate('Y-m-d H:i:s'),
    ]);
}

/**
 * Update an existing member
 */
function updateMember(array $member, string $deviceId): void
{
    $sql = "UPDATE members SET
        membership_id = ?,
        member_type = ?,
        status = ?,
        first_name = ?,
        last_name = ?,
        birth_date = ?,
        gender = ?,
        email = ?,
        phone = ?,
        address = ?,
        zip_code = ?,
        city = ?,
        guardian_name = ?,
        guardian_phone = ?,
        guardian_email = ?,
        member_fee_type = ?,
        expires_on = ?,
        merged_into_id = ?,
        id_photo_path = ?,
        id_photo_thumbnail = ?,
        device_id = ?,
        sync_version = ?,
        modified_at_utc = ?,
        synced_at_utc = NOW()
    WHERE internal_id = ?";

    dbExecute($sql, [
        $member['membership_id'] ?? null,
        $member['member_lifecycle_stage'] ?? 'TRIAL',  // TRIAL or FULL
        $member['status'] ?? 'ACTIVE',
        $member['first_name'],
        $member['last_name'],
        $member['birth_date'] ?? null,
        $member['gender'] ?? null,
        $member['email'] ?? null,
        $member['phone'] ?? null,
        $member['address'] ?? null,
        $member['zip_code'] ?? null,
        $member['city'] ?? null,
        $member['guardian_name'] ?? null,
        $member['guardian_phone'] ?? null,
        $member['guardian_email'] ?? null,
        $member['member_type'] ?? 'ADULT',  // Fee type: ADULT, CHILD, CHILD_PLUS
        $member['expires_on'] ?? null,
        $member['merged_into_id'] ?? null,
        $member['id_photo_path'] ?? null,
        $member['id_photo_thumbnail'] ?? null,
        $deviceId,
        $member['sync_version'] ?? 1,
        toMySqlDateTime($member['modified_at_utc'] ?? $member['updated_at_utc'] ?? null) ?? gmdate('Y-m-d H:i:s'),
        $member['internal_id'],
    ]);
}

/**
 * Process check-ins push (insert only, no updates)
 */
function processCheckInsPush(array $checkIns, string $deviceId): array
{
    $stats = ['inserted' => 0, 'skipped' => 0];

    foreach ($checkIns as $checkIn) {
        $id = $checkIn['id'] ?? null;
        if (!$id) continue;

        // Check if already exists
        $existing = dbQueryOne("SELECT id FROM check_ins WHERE id = ?", [$id]);
        if ($existing) {
            $stats['skipped']++;
            continue;
        }

        dbExecute(
            "INSERT INTO check_ins (id, internal_member_id, created_at_utc, local_date, first_of_day_flag, device_id, sync_version, synced_at_utc)
             VALUES (?, ?, ?, ?, ?, ?, ?, NOW())",
            [
                $id,
                $checkIn['internal_member_id'],
                toMySqlDateTime($checkIn['created_at_utc'] ?? null) ?? gmdate('Y-m-d H:i:s'),
                $checkIn['local_date'],
                toBool($checkIn['first_of_day_flag'] ?? false),
                $deviceId,
                $checkIn['sync_version'] ?? 1,
            ]
        );
        $stats['inserted']++;
    }

    return $stats;
}

/**
 * Process practice sessions push (insert only)
 */
function processPracticeSessionsPush(array $sessions, string $deviceId): array
{
    $stats = ['inserted' => 0, 'skipped' => 0];

    foreach ($sessions as $session) {
        $id = $session['id'] ?? null;
        if (!$id) continue;

        $existing = dbQueryOne("SELECT id FROM practice_sessions WHERE id = ?", [$id]);
        if ($existing) {
            $stats['skipped']++;
            continue;
        }

        dbExecute(
            "INSERT INTO practice_sessions (id, internal_member_id, created_at_utc, local_date, practice_type, points, krydser, classification, source, device_id, sync_version, synced_at_utc)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())",
            [
                $id,
                $session['internal_member_id'],
                toMySqlDateTime($session['created_at_utc'] ?? null) ?? gmdate('Y-m-d H:i:s'),
                $session['local_date'],
                toPracticeTypeEnum($session['practice_type'] ?? null),
                $session['points'] ?? 0,
                $session['krydser'] ?? null,
                $session['classification'] ?? null,
                $session['source'] ?? 'kiosk',
                $deviceId,
                $session['sync_version'] ?? 1,
            ]
        );
        $stats['inserted']++;
    }

    return $stats;
}

/**
 * Process equipment items push
 */
function processEquipmentItemsPush(array $items, string $deviceId): array
{
    $stats = ['inserted' => 0, 'updated' => 0, 'deleted' => 0, 'skipped' => 0];

    foreach ($items as $item) {
        $action = $item['_action'] ?? 'upsert';
        $id = $item['id'] ?? null;
        if (!$id) continue;

        if ($action === 'delete') {
            dbExecute(
                "INSERT INTO _deletion_log (entity_type, entity_id, deleted_by_device, deleted_at_utc) VALUES ('equipment_items', ?, ?, NOW())",
                [$id, $deviceId]
            );
            dbExecute("DELETE FROM equipment_items WHERE id = ?", [$id]);
            $stats['deleted']++;
            continue;
        }

        $existing = dbQueryOne("SELECT modified_at_utc FROM equipment_items WHERE id = ?", [$id]);
        $clientModified = $item['modified_at_utc'] ?? null;

        if ($existing) {
            if ($clientModified && strtotime($clientModified) <= strtotime($existing['modified_at_utc'])) {
                $stats['skipped']++;
                continue;
            }

            dbExecute(
                "UPDATE equipment_items SET serial_number = ?, type = ?, description = ?, status = ?, discipline = ?, device_id = ?, sync_version = ?, modified_at_utc = ?, synced_at_utc = NOW() WHERE id = ?",
                [
                    $item['serial_number'],
                    $item['type'] ?? 'TrainingMaterial',
                    $item['description'] ?? null,
                    $item['status'] ?? 'Available',
                    $item['discipline'] ?? null,
                    $deviceId,
                    $item['sync_version'] ?? 1,
                    toMySqlDateTime($clientModified) ?? gmdate('Y-m-d H:i:s'),
                    $id,
                ]
            );
            $stats['updated']++;
        } else {
            dbExecute(
                "INSERT INTO equipment_items (id, serial_number, type, description, status, discipline, device_id, sync_version, created_at_utc, modified_at_utc, synced_at_utc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())",
                [
                    $id,
                    $item['serial_number'],
                    $item['type'] ?? 'TrainingMaterial',
                    $item['description'] ?? null,
                    $item['status'] ?? 'Available',
                    $item['discipline'] ?? null,
                    $deviceId,
                    $item['sync_version'] ?? 1,
                    toMySqlDateTime($item['created_at_utc'] ?? null) ?? gmdate('Y-m-d H:i:s'),
                    toMySqlDateTime($clientModified) ?? gmdate('Y-m-d H:i:s'),
                ]
            );
            $stats['inserted']++;
        }
    }

    return $stats;
}

/**
 * Process equipment checkouts push (insert only for activity data)
 */
function processEquipmentCheckoutsPush(array $checkouts, string $deviceId): array
{
    $stats = ['inserted' => 0, 'updated' => 0, 'skipped' => 0];

    foreach ($checkouts as $checkout) {
        $id = $checkout['id'] ?? null;
        if (!$id) continue;

        $existing = dbQueryOne("SELECT id, checked_in_at_utc FROM equipment_checkouts WHERE id = ?", [$id]);

        if ($existing) {
            // Only update if adding check-in time
            if (!$existing['checked_in_at_utc'] && !empty($checkout['checked_in_at_utc'])) {
                dbExecute(
                    "UPDATE equipment_checkouts SET checked_in_at_utc = ?, checkin_notes = ?, synced_at_utc = NOW() WHERE id = ?",
                    [toMySqlDateTime($checkout['checked_in_at_utc']), $checkout['checkin_notes'] ?? null, $id]
                );
                $stats['updated']++;
            } else {
                $stats['skipped']++;
            }
        } else {
            dbExecute(
                "INSERT INTO equipment_checkouts (id, equipment_id, internal_member_id, checked_out_at_utc, checked_in_at_utc, checkout_notes, checkin_notes, conflict_status, device_id, sync_version, synced_at_utc)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())",
                [
                    $id,
                    $checkout['equipment_id'],
                    $checkout['internal_member_id'],
                    toMySqlDateTime($checkout['checked_out_at_utc'] ?? null) ?? gmdate('Y-m-d H:i:s'),
                    toMySqlDateTime($checkout['checked_in_at_utc'] ?? null),
                    $checkout['checkout_notes'] ?? null,
                    $checkout['checkin_notes'] ?? null,
                    $checkout['conflict_status'] ?? 'None',
                    $deviceId,
                    $checkout['sync_version'] ?? 1,
                ]
            );
            $stats['inserted']++;
        }
    }

    return $stats;
}

/**
 * Process trainer infos push
 */
function processTrainerInfosPush(array $infos, string $deviceId): array
{
    $stats = ['inserted' => 0, 'updated' => 0, 'skipped' => 0];

    foreach ($infos as $info) {
        $memberId = $info['internal_member_id'] ?? null;
        if (!$memberId) continue;

        $existing = dbQueryOne("SELECT modified_at_utc FROM trainer_info WHERE internal_member_id = ?", [$memberId]);
        $clientModified = $info['modified_at_utc'] ?? null;

        if ($existing) {
            if ($clientModified && strtotime($clientModified) <= strtotime($existing['modified_at_utc'])) {
                $stats['skipped']++;
                continue;
            }

            dbExecute(
                "UPDATE trainer_info SET is_trainer = ?, has_skydeleder_certificate = ?, certified_date = ?, notes = ?, device_id = ?, sync_version = ?, modified_at_utc = ?, synced_at_utc = NOW() WHERE internal_member_id = ?",
                [
                    toBool($info['is_trainer'] ?? false),
                    toBool($info['has_skydeleder_certificate'] ?? false),
                    $info['certified_date'] ?? null,
                    $info['notes'] ?? null,
                    $deviceId,
                    $info['sync_version'] ?? 1,
                    toMySqlDateTime($clientModified) ?? gmdate('Y-m-d H:i:s'),
                    $memberId,
                ]
            );
            $stats['updated']++;
        } else {
            dbExecute(
                "INSERT INTO trainer_info (internal_member_id, is_trainer, has_skydeleder_certificate, certified_date, notes, device_id, sync_version, created_at_utc, modified_at_utc, synced_at_utc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())",
                [
                    $memberId,
                    toBool($info['is_trainer'] ?? false),
                    toBool($info['has_skydeleder_certificate'] ?? false),
                    $info['certified_date'] ?? null,
                    $info['notes'] ?? null,
                    $deviceId,
                    $info['sync_version'] ?? 1,
                    toMySqlDateTime($info['created_at_utc'] ?? null) ?? gmdate('Y-m-d H:i:s'),
                    toMySqlDateTime($clientModified) ?? gmdate('Y-m-d H:i:s'),
                ]
            );
            $stats['inserted']++;
        }
    }

    return $stats;
}

/**
 * Process trainer disciplines push
 */
function processTrainerDisciplinesPush(array $disciplines, string $deviceId): array
{
    $stats = ['inserted' => 0, 'deleted' => 0, 'skipped' => 0];

    foreach ($disciplines as $discipline) {
        $action = $discipline['_action'] ?? 'upsert';
        $id = $discipline['id'] ?? null;
        if (!$id) continue;

        if ($action === 'delete') {
            dbExecute("DELETE FROM trainer_disciplines WHERE id = ?", [$id]);
            $stats['deleted']++;
            continue;
        }

        $existing = dbQueryOne("SELECT id FROM trainer_disciplines WHERE id = ?", [$id]);
        if ($existing) {
            $stats['skipped']++;
            continue;
        }

        dbExecute(
            "INSERT INTO trainer_disciplines (id, internal_member_id, discipline, level, certified_date, device_id, sync_version, created_at_utc, synced_at_utc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())",
            [
                $id,
                $discipline['internal_member_id'],
                $discipline['discipline'],
                $discipline['level'] ?? null,
                $discipline['certified_date'] ?? null,
                $deviceId,
                $discipline['sync_version'] ?? 1,
                toMySqlDateTime($discipline['created_at_utc'] ?? null) ?? gmdate('Y-m-d H:i:s'),
            ]
        );
        $stats['inserted']++;
    }

    return $stats;
}

/**
 * Process fiscal years push
 */
function processFiscalYearsPush(array $years, string $deviceId): array
{
    $stats = ['inserted' => 0, 'updated' => 0, 'skipped' => 0];

    foreach ($years as $year) {
        $yearNum = $year['year'] ?? $year['fiscal_year'] ?? null;
        if (!$yearNum) continue;

        $existing = dbQueryOne("SELECT modified_at_utc FROM fiscal_years WHERE year = ?", [$yearNum]);
        $clientModified = $year['modified_at_utc'] ?? $year['updated_at_utc'] ?? null;

        if ($existing) {
            if ($clientModified && strtotime($clientModified) <= strtotime($existing['modified_at_utc'])) {
                $stats['skipped']++;
                continue;
            }

            dbExecute(
                "UPDATE fiscal_years SET opening_cash_balance = ?, opening_bank_balance = ?, is_closed = ?, device_id = ?, sync_version = ?, modified_at_utc = ?, synced_at_utc = NOW() WHERE year = ?",
                [
                    $year['opening_cash_balance'] ?? $year['openingCashBalance'] ?? 0,
                    $year['opening_bank_balance'] ?? $year['openingBankBalance'] ?? 0,
                    toBool($year['is_closed'] ?? $year['isClosed'] ?? false),
                    $deviceId,
                    $year['sync_version'] ?? $year['syncVersion'] ?? 1,
                    toMySqlDateTime($clientModified) ?? gmdate('Y-m-d H:i:s'),
                    $yearNum,
                ]
            );
            $stats['updated']++;
        } else {
            dbExecute(
                "INSERT INTO fiscal_years (year, opening_cash_balance, opening_bank_balance, is_closed, device_id, sync_version, created_at_utc, modified_at_utc, synced_at_utc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())",
                [
                    $yearNum,
                    $year['opening_cash_balance'] ?? $year['openingCashBalance'] ?? 0,
                    $year['opening_bank_balance'] ?? $year['openingBankBalance'] ?? 0,
                    toBool($year['is_closed'] ?? $year['isClosed'] ?? false),
                    $deviceId,
                    $year['sync_version'] ?? $year['syncVersion'] ?? 1,
                    toMySqlDateTime($year['created_at_utc'] ?? $year['createdAtUtc'] ?? null) ?? gmdate('Y-m-d H:i:s'),
                    toMySqlDateTime($clientModified) ?? gmdate('Y-m-d H:i:s'),
                ]
            );
            $stats['inserted']++;
        }

        // Handle fee rates for this fiscal year
        $feeRates = $year['fee_rates'] ?? $year['feeRates'] ?? [];
        foreach ($feeRates as $rate) {
            $memberType = $rate['member_type'] ?? $rate['memberType'] ?? null;
            if (!$memberType) continue;

            dbExecute(
                "INSERT INTO fee_rates (fiscal_year, member_type, fee_amount) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE fee_amount = VALUES(fee_amount)",
                [$yearNum, $memberType, $rate['fee_amount'] ?? $rate['feeAmount'] ?? 0]
            );
        }
    }

    return $stats;
}

/**
 * Process posting categories push
 */
function processPostingCategoriesPush(array $categories, string $deviceId): array
{
    $stats = ['inserted' => 0, 'updated' => 0, 'deleted' => 0, 'skipped' => 0];

    foreach ($categories as $category) {
        $action = $category['_action'] ?? 'upsert';
        $id = $category['id'] ?? null;
        if (!$id) continue;

        if ($action === 'delete') {
            dbExecute("DELETE FROM posting_categories WHERE id = ?", [$id]);
            $stats['deleted']++;
            continue;
        }

        $existing = dbQueryOne("SELECT modified_at_utc FROM posting_categories WHERE id = ?", [$id]);
        $clientModified = $category['modified_at_utc'] ?? $category['updatedAtUtc'] ?? null;

        if ($existing) {
            if ($clientModified && strtotime($clientModified) <= strtotime($existing['modified_at_utc'])) {
                $stats['skipped']++;
                continue;
            }

            dbExecute(
                "UPDATE posting_categories SET name = ?, description = ?, sort_order = ?, is_active = ?, device_id = ?, sync_version = ?, modified_at_utc = ?, synced_at_utc = NOW() WHERE id = ?",
                [
                    $category['name'],
                    $category['description'] ?? null,
                    $category['sort_order'] ?? $category['sortOrder'] ?? 0,
                    toBool($category['is_active'] ?? $category['isActive'] ?? true),
                    $deviceId,
                    $category['sync_version'] ?? $category['syncVersion'] ?? 1,
                    toMySqlDateTime($clientModified) ?? gmdate('Y-m-d H:i:s'),
                    $id,
                ]
            );
            $stats['updated']++;
        } else {
            dbExecute(
                "INSERT INTO posting_categories (id, name, description, sort_order, is_active, device_id, sync_version, created_at_utc, modified_at_utc, synced_at_utc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())",
                [
                    $id,
                    $category['name'],
                    $category['description'] ?? null,
                    $category['sort_order'] ?? $category['sortOrder'] ?? 0,
                    toBool($category['is_active'] ?? $category['isActive'] ?? true),
                    $deviceId,
                    $category['sync_version'] ?? $category['syncVersion'] ?? 1,
                    toMySqlDateTime($category['created_at_utc'] ?? $category['createdAtUtc'] ?? null) ?? gmdate('Y-m-d H:i:s'),
                    toMySqlDateTime($clientModified) ?? gmdate('Y-m-d H:i:s'),
                ]
            );
            $stats['inserted']++;
        }
    }

    return $stats;
}

/**
 * Process financial transactions push
 */
function processFinancialTransactionsPush(array $transactions, string $deviceId): array
{
    $stats = ['inserted' => 0, 'updated' => 0, 'deleted' => 0, 'skipped' => 0];

    foreach ($transactions as $txn) {
        $action = $txn['_action'] ?? 'upsert';
        $id = $txn['id'] ?? null;
        if (!$id) continue;

        if ($action === 'delete') {
            // Soft delete - mark as deleted
            dbExecute("UPDATE financial_transactions SET is_deleted = 1, synced_at_utc = NOW() WHERE id = ?", [$id]);
            $stats['deleted']++;
            continue;
        }

        $existing = dbQueryOne("SELECT modified_at_utc FROM financial_transactions WHERE id = ?", [$id]);
        $clientModified = $txn['modified_at_utc'] ?? $txn['updatedAtUtc'] ?? null;

        if ($existing) {
            if ($clientModified && strtotime($clientModified) <= strtotime($existing['modified_at_utc'])) {
                $stats['skipped']++;
                continue;
            }

            dbExecute(
                "UPDATE financial_transactions SET fiscal_year = ?, sequence_number = ?, transaction_date = ?, description = ?, cash_in = ?, cash_out = ?, bank_in = ?, bank_out = ?, notes = ?, is_deleted = ?, device_id = ?, sync_version = ?, modified_at_utc = ?, synced_at_utc = NOW() WHERE id = ?",
                [
                    $txn['fiscal_year'] ?? $txn['fiscalYear'],
                    $txn['sequence_number'] ?? $txn['sequenceNumber'],
                    $txn['transaction_date'] ?? $txn['date'],
                    $txn['description'],
                    $txn['cash_in'] ?? $txn['cashIn'] ?? null,
                    $txn['cash_out'] ?? $txn['cashOut'] ?? null,
                    $txn['bank_in'] ?? $txn['bankIn'] ?? null,
                    $txn['bank_out'] ?? $txn['bankOut'] ?? null,
                    $txn['notes'] ?? null,
                    toBool($txn['is_deleted'] ?? $txn['isDeleted'] ?? false),
                    $deviceId,
                    $txn['sync_version'] ?? $txn['syncVersion'] ?? 1,
                    toMySqlDateTime($clientModified) ?? gmdate('Y-m-d H:i:s'),
                    $id,
                ]
            );
            $stats['updated']++;
        } else {
            dbExecute(
                "INSERT INTO financial_transactions (id, fiscal_year, sequence_number, transaction_date, description, cash_in, cash_out, bank_in, bank_out, notes, is_deleted, device_id, sync_version, created_at_utc, modified_at_utc, synced_at_utc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())",
                [
                    $id,
                    $txn['fiscal_year'] ?? $txn['fiscalYear'],
                    $txn['sequence_number'] ?? $txn['sequenceNumber'],
                    $txn['transaction_date'] ?? $txn['date'],
                    $txn['description'],
                    $txn['cash_in'] ?? $txn['cashIn'] ?? null,
                    $txn['cash_out'] ?? $txn['cashOut'] ?? null,
                    $txn['bank_in'] ?? $txn['bankIn'] ?? null,
                    $txn['bank_out'] ?? $txn['bankOut'] ?? null,
                    $txn['notes'] ?? null,
                    toBool($txn['is_deleted'] ?? $txn['isDeleted'] ?? false),
                    $deviceId,
                    $txn['sync_version'] ?? $txn['syncVersion'] ?? 1,
                    toMySqlDateTime($txn['created_at_utc'] ?? $txn['createdAtUtc'] ?? null) ?? gmdate('Y-m-d H:i:s'),
                    toMySqlDateTime($clientModified) ?? gmdate('Y-m-d H:i:s'),
                ]
            );
            $stats['inserted']++;
        }
    }

    return $stats;
}

/**
 * Process transaction lines push
 */
function processTransactionLinesPush(array $lines, string $deviceId): array
{
    $stats = ['inserted' => 0, 'updated' => 0, 'deleted' => 0, 'skipped' => 0];

    foreach ($lines as $line) {
        $action = $line['_action'] ?? 'upsert';
        $id = $line['id'] ?? null;
        if (!$id) continue;

        if ($action === 'delete') {
            dbExecute("DELETE FROM transaction_lines WHERE id = ?", [$id]);
            $stats['deleted']++;
            continue;
        }

        $existing = dbQueryOne("SELECT id FROM transaction_lines WHERE id = ?", [$id]);

        if ($existing) {
            dbExecute(
                "UPDATE transaction_lines SET transaction_id = ?, category_id = ?, amount = ?, is_income = ?, source = ?, member_id = ?, line_description = ?, synced_at_utc = NOW() WHERE id = ?",
                [
                    $line['transaction_id'] ?? $line['transactionId'],
                    $line['category_id'] ?? $line['categoryId'],
                    $line['amount'],
                    toBool($line['is_income'] ?? $line['isIncome'] ?? false),
                    $line['source'] ?? 'CASH',
                    $line['member_id'] ?? $line['memberId'] ?? null,
                    $line['line_description'] ?? $line['lineDescription'] ?? null,
                    $id,
                ]
            );
            $stats['updated']++;
        } else {
            dbExecute(
                "INSERT INTO transaction_lines (id, transaction_id, category_id, amount, is_income, source, member_id, line_description, synced_at_utc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())",
                [
                    $id,
                    $line['transaction_id'] ?? $line['transactionId'],
                    $line['category_id'] ?? $line['categoryId'],
                    $line['amount'],
                    toBool($line['is_income'] ?? $line['isIncome'] ?? false),
                    $line['source'] ?? 'CASH',
                    $line['member_id'] ?? $line['memberId'] ?? null,
                    $line['line_description'] ?? $line['lineDescription'] ?? null,
                ]
            );
            $stats['inserted']++;
        }
    }

    return $stats;
}

/**
 * Process pending fee payments push
 */
function processPendingFeePaymentsPush(array $payments, string $deviceId): array
{
    $stats = ['inserted' => 0, 'updated' => 0, 'deleted' => 0, 'skipped' => 0];

    foreach ($payments as $payment) {
        $action = $payment['_action'] ?? 'upsert';
        $id = $payment['id'] ?? null;
        if (!$id) continue;

        if ($action === 'delete') {
            dbExecute("DELETE FROM pending_fee_payments WHERE id = ?", [$id]);
            $stats['deleted']++;
            continue;
        }

        $existing = dbQueryOne("SELECT modified_at_utc FROM pending_fee_payments WHERE id = ?", [$id]);
        $clientModified = $payment['modified_at_utc'] ?? $payment['updatedAtUtc'] ?? null;

        if ($existing) {
            if ($clientModified && strtotime($clientModified) <= strtotime($existing['modified_at_utc'])) {
                $stats['skipped']++;
                continue;
            }

            dbExecute(
                "UPDATE pending_fee_payments SET fiscal_year = ?, member_id = ?, amount = ?, payment_date = ?, payment_method = ?, notes = ?, is_consolidated = ?, consolidated_transaction_id = ?, device_id = ?, sync_version = ?, modified_at_utc = ?, synced_at_utc = NOW() WHERE id = ?",
                [
                    $payment['fiscal_year'] ?? $payment['fiscalYear'],
                    $payment['member_id'] ?? $payment['memberId'],
                    $payment['amount'],
                    $payment['payment_date'] ?? $payment['paymentDate'],
                    $payment['payment_method'] ?? $payment['paymentMethod'],
                    $payment['notes'] ?? null,
                    toBool($payment['is_consolidated'] ?? $payment['isConsolidated'] ?? false),
                    $payment['consolidated_transaction_id'] ?? $payment['consolidatedTransactionId'] ?? null,
                    $deviceId,
                    $payment['sync_version'] ?? $payment['syncVersion'] ?? 1,
                    toMySqlDateTime($clientModified) ?? gmdate('Y-m-d H:i:s'),
                    $id,
                ]
            );
            $stats['updated']++;
        } else {
            dbExecute(
                "INSERT INTO pending_fee_payments (id, fiscal_year, member_id, amount, payment_date, payment_method, notes, is_consolidated, consolidated_transaction_id, device_id, sync_version, created_at_utc, modified_at_utc, synced_at_utc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())",
                [
                    $id,
                    $payment['fiscal_year'] ?? $payment['fiscalYear'],
                    $payment['member_id'] ?? $payment['memberId'],
                    $payment['amount'],
                    $payment['payment_date'] ?? $payment['paymentDate'],
                    $payment['payment_method'] ?? $payment['paymentMethod'],
                    $payment['notes'] ?? null,
                    toBool($payment['is_consolidated'] ?? $payment['isConsolidated'] ?? false),
                    $payment['consolidated_transaction_id'] ?? $payment['consolidatedTransactionId'] ?? null,
                    $deviceId,
                    $payment['sync_version'] ?? $payment['syncVersion'] ?? 1,
                    toMySqlDateTime($payment['created_at_utc'] ?? $payment['createdAtUtc'] ?? null) ?? gmdate('Y-m-d H:i:s'),
                    toMySqlDateTime($clientModified) ?? gmdate('Y-m-d H:i:s'),
                ]
            );
            $stats['inserted']++;
        }
    }

    return $stats;
}

/**
 * Process scan events push
 */
function processScanEventsPush(array $events, string $deviceId): array
{
    $stats = ['inserted' => 0, 'updated' => 0, 'deleted' => 0, 'skipped' => 0];

    foreach ($events as $event) {
        $action = $event['_action'] ?? 'upsert';
        $id = $event['id'] ?? null;
        if (!$id) continue;

        if ($action === 'delete') {
            dbExecute("DELETE FROM scan_events WHERE id = ?", [$id]);
            $stats['deleted']++;
            continue;
        }

        $existing = dbQueryOne("SELECT id FROM scan_events WHERE id = ?", [$id]);

        if ($existing) {
            dbExecute(
                "UPDATE scan_events SET internal_member_id = ?, scan_type = ?, linked_check_in_id = ?, linked_session_id = ?, canceled_flag = ?, device_id = ?, sync_version = ?, synced_at_utc = NOW() WHERE id = ?",
                [
                    $event['internal_member_id'] ?? $event['internalMemberId'],
                    $event['scan_type'] ?? $event['scanType'],
                    $event['linked_check_in_id'] ?? $event['linkedCheckInId'] ?? null,
                    $event['linked_session_id'] ?? $event['linkedSessionId'] ?? null,
                    toBool($event['canceled_flag'] ?? $event['canceledFlag'] ?? false),
                    $deviceId,
                    $event['sync_version'] ?? $event['syncVersion'] ?? 1,
                    $id,
                ]
            );
            $stats['updated']++;
        } else {
            dbExecute(
                "INSERT INTO scan_events (id, internal_member_id, created_at_utc, scan_type, linked_check_in_id, linked_session_id, canceled_flag, device_id, sync_version, synced_at_utc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())",
                [
                    $id,
                    $event['internal_member_id'] ?? $event['internalMemberId'],
                    toMySqlDateTime($event['created_at_utc'] ?? $event['createdAtUtc'] ?? null) ?? gmdate('Y-m-d H:i:s'),
                    $event['scan_type'] ?? $event['scanType'],
                    $event['linked_check_in_id'] ?? $event['linkedCheckInId'] ?? null,
                    $event['linked_session_id'] ?? $event['linkedSessionId'] ?? null,
                    toBool($event['canceled_flag'] ?? $event['canceledFlag'] ?? false),
                    $deviceId,
                    $event['sync_version'] ?? $event['syncVersion'] ?? 1,
                ]
            );
            $stats['inserted']++;
        }
    }

    return $stats;
}

/**
 * Process member preferences push
 */
function processMemberPreferencesPush(array $preferences, string $deviceId): array
{
    $stats = ['inserted' => 0, 'updated' => 0, 'deleted' => 0, 'skipped' => 0];

    foreach ($preferences as $pref) {
        $action = $pref['_action'] ?? 'upsert';
        $memberId = $pref['member_id'] ?? $pref['memberId'] ?? null;
        if (!$memberId) continue;

        if ($action === 'delete') {
            dbExecute("DELETE FROM member_preferences WHERE member_id = ?", [$memberId]);
            $stats['deleted']++;
            continue;
        }

        $clientModified = $pref['modified_at_utc'] ?? $pref['modifiedAtUtc'] ?? null;
        $existing = dbQueryOne("SELECT modified_at_utc FROM member_preferences WHERE member_id = ?", [$memberId]);

        if ($existing) {
            if ($clientModified && strtotime($clientModified) <= strtotime($existing['modified_at_utc'])) {
                $stats['skipped']++;
                continue;
            }

            dbExecute(
                "UPDATE member_preferences SET last_practice_type = ?, last_classification = ?, device_id = ?, sync_version = ?, modified_at_utc = ?, synced_at_utc = NOW() WHERE member_id = ?",
                [
                    $pref['last_practice_type'] ?? $pref['lastPracticeType'] ?? null,
                    $pref['last_classification'] ?? $pref['lastClassification'] ?? null,
                    $deviceId,
                    $pref['sync_version'] ?? $pref['syncVersion'] ?? 1,
                    toMySqlDateTime($clientModified) ?? gmdate('Y-m-d H:i:s'),
                    $memberId,
                ]
            );
            $stats['updated']++;
        } else {
            dbExecute(
                "INSERT INTO member_preferences (member_id, last_practice_type, last_classification, device_id, sync_version, modified_at_utc, synced_at_utc) VALUES (?, ?, ?, ?, ?, ?, NOW())",
                [
                    $memberId,
                    $pref['last_practice_type'] ?? $pref['lastPracticeType'] ?? null,
                    $pref['last_classification'] ?? $pref['lastClassification'] ?? null,
                    $deviceId,
                    $pref['sync_version'] ?? $pref['syncVersion'] ?? 1,
                    toMySqlDateTime($clientModified) ?? gmdate('Y-m-d H:i:s'),
                ]
            );
            $stats['inserted']++;
        }
    }

    return $stats;
}

/**
 * Process new member registrations push
 */
function processNewMemberRegistrationsPush(array $registrations, string $deviceId): array
{
    $stats = ['inserted' => 0, 'updated' => 0, 'deleted' => 0, 'skipped' => 0];

    foreach ($registrations as $reg) {
        $action = $reg['_action'] ?? 'upsert';
        $id = $reg['id'] ?? null;
        if (!$id) continue;

        if ($action === 'delete') {
            dbExecute("DELETE FROM new_member_registrations WHERE id = ?", [$id]);
            $stats['deleted']++;
            continue;
        }

        $clientModified = $reg['modified_at_utc'] ?? $reg['modifiedAtUtc'] ?? $reg['created_at_utc'] ?? $reg['createdAtUtc'] ?? null;
        $existing = dbQueryOne("SELECT modified_at_utc FROM new_member_registrations WHERE id = ?", [$id]);

        if ($existing) {
            if ($clientModified && strtotime($clientModified) <= strtotime($existing['modified_at_utc'])) {
                $stats['skipped']++;
                continue;
            }

            dbExecute(
                "UPDATE new_member_registrations SET
                    first_name = ?, last_name = ?, birthday = ?, gender = ?,
                    email = ?, phone = ?, address = ?, zip_code = ?, city = ?, notes = ?,
                    photo_path = ?, guardian_name = ?, guardian_phone = ?, guardian_email = ?,
                    source_device_id = ?, source_device_name = ?,
                    approval_status = ?, approved_at_utc = ?, rejected_at_utc = ?,
                    rejection_reason = ?, created_member_id = ?,
                    device_id = ?, sync_version = ?, modified_at_utc = ?, synced_at_utc = NOW()
                WHERE id = ?",
                [
                    $reg['first_name'] ?? $reg['firstName'],
                    $reg['last_name'] ?? $reg['lastName'],
                    $reg['birthday'] ?? null,
                    $reg['gender'] ?? null,
                    $reg['email'] ?? null,
                    $reg['phone'] ?? null,
                    $reg['address'] ?? null,
                    $reg['zip_code'] ?? $reg['zipCode'] ?? null,
                    $reg['city'] ?? null,
                    $reg['notes'] ?? null,
                    $reg['photo_path'] ?? $reg['photoPath'] ?? null,
                    $reg['guardian_name'] ?? $reg['guardianName'] ?? null,
                    $reg['guardian_phone'] ?? $reg['guardianPhone'] ?? null,
                    $reg['guardian_email'] ?? $reg['guardianEmail'] ?? null,
                    $reg['source_device_id'] ?? $reg['sourceDeviceId'],
                    $reg['source_device_name'] ?? $reg['sourceDeviceName'] ?? null,
                    $reg['approval_status'] ?? $reg['approvalStatus'] ?? 'PENDING',
                    toMySqlDateTime($reg['approved_at_utc'] ?? $reg['approvedAtUtc'] ?? null),
                    toMySqlDateTime($reg['rejected_at_utc'] ?? $reg['rejectedAtUtc'] ?? null),
                    $reg['rejection_reason'] ?? $reg['rejectionReason'] ?? null,
                    $reg['created_member_id'] ?? $reg['createdMemberId'] ?? null,
                    $deviceId,
                    $reg['sync_version'] ?? $reg['syncVersion'] ?? 1,
                    toMySqlDateTime($clientModified) ?? gmdate('Y-m-d H:i:s'),
                    $id,
                ]
            );
            $stats['updated']++;
        } else {
            dbExecute(
                "INSERT INTO new_member_registrations (
                    id, first_name, last_name, birthday, gender,
                    email, phone, address, zip_code, city, notes,
                    photo_path, guardian_name, guardian_phone, guardian_email,
                    source_device_id, source_device_name,
                    approval_status, approved_at_utc, rejected_at_utc,
                    rejection_reason, created_member_id, created_at_utc,
                    device_id, sync_version, modified_at_utc, synced_at_utc
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())",
                [
                    $id,
                    $reg['first_name'] ?? $reg['firstName'],
                    $reg['last_name'] ?? $reg['lastName'],
                    $reg['birthday'] ?? null,
                    $reg['gender'] ?? null,
                    $reg['email'] ?? null,
                    $reg['phone'] ?? null,
                    $reg['address'] ?? null,
                    $reg['zip_code'] ?? $reg['zipCode'] ?? null,
                    $reg['city'] ?? null,
                    $reg['notes'] ?? null,
                    $reg['photo_path'] ?? $reg['photoPath'] ?? null,
                    $reg['guardian_name'] ?? $reg['guardianName'] ?? null,
                    $reg['guardian_phone'] ?? $reg['guardianPhone'] ?? null,
                    $reg['guardian_email'] ?? $reg['guardianEmail'] ?? null,
                    $reg['source_device_id'] ?? $reg['sourceDeviceId'],
                    $reg['source_device_name'] ?? $reg['sourceDeviceName'] ?? null,
                    $reg['approval_status'] ?? $reg['approvalStatus'] ?? 'PENDING',
                    toMySqlDateTime($reg['approved_at_utc'] ?? $reg['approvedAtUtc'] ?? null),
                    toMySqlDateTime($reg['rejected_at_utc'] ?? $reg['rejectedAtUtc'] ?? null),
                    $reg['rejection_reason'] ?? $reg['rejectionReason'] ?? null,
                    $reg['created_member_id'] ?? $reg['createdMemberId'] ?? null,
                    toMySqlDateTime($reg['created_at_utc'] ?? $reg['createdAtUtc'] ?? null) ?? gmdate('Y-m-d H:i:s'),
                    $deviceId,
                    $reg['sync_version'] ?? $reg['syncVersion'] ?? 1,
                    toMySqlDateTime($clientModified) ?? gmdate('Y-m-d H:i:s'),
                ]
            );
            $stats['inserted']++;
        }
    }

    return $stats;
}

/**
 * Process SKV registrations push
 */
function processSkvRegistrationsPush(array $registrations, string $deviceId): array
{
    $stats = ['inserted' => 0, 'updated' => 0, 'deleted' => 0, 'skipped' => 0];

    foreach ($registrations as $reg) {
        $action = $reg['_action'] ?? 'upsert';
        $id = $reg['id'] ?? null;
        if (!$id) continue;

        if ($action === 'delete') {
            dbExecute("DELETE FROM skv_registrations WHERE id = ?", [$id]);
            $stats['deleted']++;
            continue;
        }

        $clientUpdated = $reg['updated_at_utc'] ?? $reg['updatedAtUtc'] ?? null;
        $existing = dbQueryOne("SELECT updated_at_utc FROM skv_registrations WHERE id = ?", [$id]);

        if ($existing) {
            if ($clientUpdated && strtotime($clientUpdated) <= strtotime($existing['updated_at_utc'])) {
                $stats['skipped']++;
                continue;
            }

            dbExecute(
                "UPDATE skv_registrations SET
                    member_id = ?, skv_level = ?, status = ?, last_approved_date = ?,
                    updated_at_utc = ?, device_id = ?, sync_version = ?, synced_at_utc = NOW()
                WHERE id = ?",
                [
                    $reg['member_id'] ?? $reg['memberId'],
                    $reg['skv_level'] ?? $reg['skvLevel'] ?? 6,
                    $reg['status'] ?? 'not_started',
                    $reg['last_approved_date'] ?? $reg['lastApprovedDate'] ?? null,
                    toMySqlDateTime($clientUpdated) ?? gmdate('Y-m-d H:i:s'),
                    $deviceId,
                    $reg['sync_version'] ?? $reg['syncVersion'] ?? 1,
                    $id,
                ]
            );
            $stats['updated']++;
        } else {
            dbExecute(
                "INSERT INTO skv_registrations (
                    id, member_id, skv_level, status, last_approved_date,
                    created_at_utc, updated_at_utc, device_id, sync_version, synced_at_utc
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())",
                [
                    $id,
                    $reg['member_id'] ?? $reg['memberId'],
                    $reg['skv_level'] ?? $reg['skvLevel'] ?? 6,
                    $reg['status'] ?? 'not_started',
                    $reg['last_approved_date'] ?? $reg['lastApprovedDate'] ?? null,
                    toMySqlDateTime($reg['created_at_utc'] ?? $reg['createdAtUtc'] ?? null) ?? gmdate('Y-m-d H:i:s'),
                    toMySqlDateTime($clientUpdated) ?? gmdate('Y-m-d H:i:s'),
                    $deviceId,
                    $reg['sync_version'] ?? $reg['syncVersion'] ?? 1,
                ]
            );
            $stats['inserted']++;
        }
    }

    return $stats;
}

/**
 * Process SKV weapons push
 */
function processSkvWeaponsPush(array $weapons, string $deviceId): array
{
    $stats = ['inserted' => 0, 'updated' => 0, 'deleted' => 0, 'skipped' => 0];

    foreach ($weapons as $weapon) {
        $action = $weapon['_action'] ?? 'upsert';
        $id = $weapon['id'] ?? null;
        if (!$id) continue;

        if ($action === 'delete') {
            dbExecute("DELETE FROM skv_weapons WHERE id = ?", [$id]);
            $stats['deleted']++;
            continue;
        }

        $clientUpdated = $weapon['updated_at_utc'] ?? $weapon['updatedAtUtc'] ?? null;
        $existing = dbQueryOne("SELECT updated_at_utc FROM skv_weapons WHERE id = ?", [$id]);

        if ($existing) {
            if ($clientUpdated && strtotime($clientUpdated) <= strtotime($existing['updated_at_utc'])) {
                $stats['skipped']++;
                continue;
            }

            dbExecute(
                "UPDATE skv_weapons SET
                    skv_registration_id = ?, model = ?, description = ?, serial = ?,
                    type = ?, caliber = ?, last_reviewed_date = ?,
                    updated_at_utc = ?, device_id = ?, sync_version = ?, synced_at_utc = NOW()
                WHERE id = ?",
                [
                    $weapon['skv_registration_id'] ?? $weapon['skvRegistrationId'],
                    $weapon['model'],
                    $weapon['description'] ?? null,
                    $weapon['serial'],
                    $weapon['type'],
                    $weapon['caliber'] ?? null,
                    $weapon['last_reviewed_date'] ?? $weapon['lastReviewedDate'] ?? null,
                    toMySqlDateTime($clientUpdated) ?? gmdate('Y-m-d H:i:s'),
                    $deviceId,
                    $weapon['sync_version'] ?? $weapon['syncVersion'] ?? 1,
                    $id,
                ]
            );
            $stats['updated']++;
        } else {
            dbExecute(
                "INSERT INTO skv_weapons (
                    id, skv_registration_id, model, description, serial, type, caliber,
                    last_reviewed_date, created_at_utc, updated_at_utc, device_id, sync_version, synced_at_utc
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())",
                [
                    $id,
                    $weapon['skv_registration_id'] ?? $weapon['skvRegistrationId'],
                    $weapon['model'],
                    $weapon['description'] ?? null,
                    $weapon['serial'],
                    $weapon['type'],
                    $weapon['caliber'] ?? null,
                    $weapon['last_reviewed_date'] ?? $weapon['lastReviewedDate'] ?? null,
                    toMySqlDateTime($weapon['created_at_utc'] ?? $weapon['createdAtUtc'] ?? null) ?? gmdate('Y-m-d H:i:s'),
                    toMySqlDateTime($clientUpdated) ?? gmdate('Y-m-d H:i:s'),
                    $deviceId,
                    $weapon['sync_version'] ?? $weapon['syncVersion'] ?? 1,
                ]
            );
            $stats['inserted']++;
        }
    }

    return $stats;
}
