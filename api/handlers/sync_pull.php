<?php
/**
 * Sync Pull Handler
 * Sends data to laptop from database
 */

declare(strict_types=1);

// File version - increment when making changes
const SYNC_PULL_VERSION = '1.5.0';  // 1.5.0: Added id_photo_path and id_photo_thumbnail fields for adult verification

/**
 * Convert practice type from MySQL ENUM to laptop format.
 * MySQL: 'Riffel', 'Pistol', 'LuftRiffel', 'LuftPistol', 'Andet'
 * Laptop: 'RIFLE', 'PISTOL'
 */
function fromPracticeTypeEnum(?string $practiceType): string
{
    $map = [
        'Riffel' => 'RIFLE',
        'Pistol' => 'PISTOL',
        'LuftRiffel' => 'AIR_RIFLE',
        'LuftPistol' => 'AIR_PISTOL',
        'Andet' => 'OTHER',
    ];

    return $map[$practiceType] ?? 'RIFLE';
}

/**
 * Handle GET /sync/pull
 */
function handleSyncPull(): void
{
    $config = require __DIR__ . '/../config.php';

    // Parse query parameters
    $since = $_GET['since'] ?? '1970-01-01T00:00:00Z';
    $entitiesParam = $_GET['entities'] ?? 'members';
    $limit = min((int)($_GET['limit'] ?? 50), 500);

    // Convert since to MySQL datetime format
    $sinceDate = date('Y-m-d H:i:s', strtotime($since));

    $entities = array_map('trim', explode(',', $entitiesParam));

    $result = [
        'has_more' => false,
        'next_cursor' => null,
        'server_time' => gmdate('Y-m-d\TH:i:s\Z'),
        'entities' => [],
        'deleted' => [],
    ];

    // Track the earliest cursor for pagination across all entity types
    $earliestCursor = null;

    foreach ($entities as $entity) {
        switch ($entity) {
            case 'members':
                $data = pullMembers($sinceDate, $limit);
                $result['entities']['members'] = $data['records'];
                $result['deleted']['members'] = $data['deleted'];
                if (count($data['records']) >= $limit && !empty($data['records'])) {
                    $lastRecord = end($data['records']);
                    if ($earliestCursor === null || $lastRecord['modified_at_utc'] < $earliestCursor) {
                        $earliestCursor = $lastRecord['modified_at_utc'];
                    }
                }
                break;

            case 'check_ins':
                $result['entities']['check_ins'] = pullCheckIns($sinceDate, $limit);
                break;

            case 'practice_sessions':
                $result['entities']['practice_sessions'] = pullPracticeSessions($sinceDate, $limit);
                break;

            case 'equipment_items':
                $data = pullEquipmentItems($sinceDate, $limit);
                $result['entities']['equipment_items'] = $data['records'];
                $result['deleted']['equipment_items'] = $data['deleted'];
                break;

            case 'equipment_checkouts':
                $result['entities']['equipment_checkouts'] = pullEquipmentCheckouts($sinceDate, $limit);
                break;

            case 'trainer_infos':
                $result['entities']['trainer_infos'] = pullTrainerInfos($sinceDate, $limit);
                break;

            case 'trainer_disciplines':
                $result['entities']['trainer_disciplines'] = pullTrainerDisciplines($sinceDate, $limit);
                break;

            case 'photos':
                $result['entities']['photos'] = pullPhotoMetadata($sinceDate, $limit);
                break;

            case 'fiscal_years':
                $result['entities']['fiscal_years'] = pullFiscalYears($sinceDate, $limit);
                break;

            case 'fee_rates':
                $result['entities']['fee_rates'] = pullFeeRates($sinceDate, $limit);
                break;

            case 'posting_categories':
                $result['entities']['posting_categories'] = pullPostingCategories($sinceDate, $limit);
                break;

            case 'transaction_lines':
                $result['entities']['transaction_lines'] = pullTransactionLines($sinceDate, $limit);
                break;

            case 'pending_fee_payments':
                $pendingPayments = pullPendingFeePayments($sinceDate, $limit);
                $result['entities']['pending_fee_payments'] = $pendingPayments;
                if (count($pendingPayments) >= $limit && !empty($pendingPayments)) {
                    $lastRecord = end($pendingPayments);
                    if ($earliestCursor === null || $lastRecord['modified_at_utc'] < $earliestCursor) {
                        $earliestCursor = $lastRecord['modified_at_utc'];
                    }
                }
                break;

            case 'scan_events':
                $result['entities']['scan_events'] = pullScanEvents($sinceDate, $limit);
                break;

            case 'member_preferences':
                $result['entities']['member_preferences'] = pullMemberPreferences($sinceDate, $limit);
                break;

            case 'new_member_registrations':
                $result['entities']['new_member_registrations'] = pullNewMemberRegistrations($sinceDate, $limit);
                break;

            case 'skv_registrations':
                $result['entities']['skv_registrations'] = pullSkvRegistrations($sinceDate, $limit);
                break;

            case 'skv_weapons':
                $result['entities']['skv_weapons'] = pullSkvWeapons($sinceDate, $limit);
                break;
        }
    }

    // Check if any entity type reached the limit - if so, there might be more data
    foreach ($result['entities'] as $entityType => $records) {
        if (is_array($records) && count($records) >= $limit) {
            $result['has_more'] = true;
            break;
        }
    }

    // Use the earliest cursor if we have more data
    if ($result['has_more'] && $earliestCursor !== null) {
        $result['next_cursor'] = $earliestCursor;
    } elseif ($result['has_more']) {
        // Fallback: use the since date if no cursor was computed
        // This ensures we re-pull with the same cursor to get remaining records
        $result['next_cursor'] = $since;
    }

    jsonResponse($result);
}

/**
 * Pull members modified since date
 */
function pullMembers(string $since, int $limit): array
{
    $records = dbQuery(
        "SELECT
            internal_id, membership_id, member_type, member_fee_type, status,
            first_name, last_name, birth_date, gender,
            email, phone, address, zip_code, city,
            guardian_name, guardian_phone, guardian_email,
            expires_on, merged_into_id,
            id_photo_path, id_photo_thumbnail,
            device_id, sync_version,
            created_at_utc, modified_at_utc, synced_at_utc
         FROM members
         WHERE modified_at_utc > ?
         ORDER BY modified_at_utc ASC
         LIMIT ?",
        [$since, $limit]
    );

    // Format for client
    $formatted = array_map(function ($row) {
        return [
            'internal_id' => $row['internal_id'],
            'membership_id' => $row['membership_id'],
            'member_type' => $row['member_fee_type'] ?? 'ADULT', // Fee type: ADULT, CHILD, CHILD_PLUS
            'member_lifecycle_stage' => $row['member_type'], // Lifecycle: TRIAL or FULL
            'status' => $row['status'],
            'first_name' => $row['first_name'],
            'last_name' => $row['last_name'],
            'birth_date' => $row['birth_date'],
            'gender' => $row['gender'],
            'email' => $row['email'],
            'phone' => $row['phone'],
            'address' => $row['address'],
            'zip_code' => $row['zip_code'],
            'city' => $row['city'],
            'guardian_name' => $row['guardian_name'],
            'guardian_phone' => $row['guardian_phone'],
            'guardian_email' => $row['guardian_email'],
            'expires_on' => $row['expires_on'],
            'merged_into_id' => $row['merged_into_id'],
            'id_photo_path' => $row['id_photo_path'],
            'id_photo_thumbnail' => $row['id_photo_thumbnail'],
            'device_id' => $row['device_id'],
            'sync_version' => (int)$row['sync_version'],
            'created_at_utc' => formatDatetime($row['created_at_utc']),
            'modified_at_utc' => formatDatetime($row['modified_at_utc']),
            'synced_at_utc' => formatDatetime($row['synced_at_utc']),
        ];
    }, $records);

    // Get deleted records
    $deleted = dbQuery(
        "SELECT entity_id FROM _deletion_log
         WHERE entity_type = 'members' AND deleted_at_utc > ?",
        [$since]
    );
    $deletedIds = array_column($deleted, 'entity_id');

    return ['records' => $formatted, 'deleted' => $deletedIds];
}

/**
 * Pull check-ins
 */
function pullCheckIns(string $since, int $limit): array
{
    $records = dbQuery(
        "SELECT id, internal_member_id, created_at_utc, local_date, first_of_day_flag, device_id, sync_version
         FROM check_ins
         WHERE synced_at_utc > ? OR (synced_at_utc IS NULL AND created_at_utc > ?)
         ORDER BY created_at_utc ASC
         LIMIT ?",
        [$since, $since, $limit]
    );

    return array_map(function ($row) {
        return [
            'id' => $row['id'],
            'internal_member_id' => $row['internal_member_id'],
            'created_at_utc' => formatDatetime($row['created_at_utc']),
            'local_date' => $row['local_date'],
            'first_of_day_flag' => (bool)$row['first_of_day_flag'],
            'device_id' => $row['device_id'],
            'sync_version' => (int)$row['sync_version'],
        ];
    }, $records);
}

/**
 * Pull practice sessions
 */
function pullPracticeSessions(string $since, int $limit): array
{
    $records = dbQuery(
        "SELECT id, internal_member_id, created_at_utc, local_date, practice_type, points, krydser, classification, source, device_id, sync_version
         FROM practice_sessions
         WHERE synced_at_utc > ? OR (synced_at_utc IS NULL AND created_at_utc > ?)
         ORDER BY created_at_utc ASC
         LIMIT ?",
        [$since, $since, $limit]
    );

    return array_map(function ($row) {
        return [
            'id' => $row['id'],
            'internal_member_id' => $row['internal_member_id'],
            'created_at_utc' => formatDatetime($row['created_at_utc']),
            'local_date' => $row['local_date'],
            'practice_type' => fromPracticeTypeEnum($row['practice_type']),
            'points' => (int)$row['points'],
            'krydser' => $row['krydser'] !== null ? (int)$row['krydser'] : null,
            'classification' => $row['classification'],
            'source' => $row['source'],
            'device_id' => $row['device_id'],
            'sync_version' => (int)$row['sync_version'],
        ];
    }, $records);
}

/**
 * Pull equipment items
 */
function pullEquipmentItems(string $since, int $limit): array
{
    $records = dbQuery(
        "SELECT id, serial_number, type, description, status, discipline, device_id, sync_version, created_at_utc, modified_at_utc
         FROM equipment_items
         WHERE modified_at_utc > ?
         ORDER BY modified_at_utc ASC
         LIMIT ?",
        [$since, $limit]
    );

    $formatted = array_map(function ($row) {
        return [
            'id' => $row['id'],
            'serial_number' => $row['serial_number'],
            'type' => $row['type'],
            'description' => $row['description'],
            'status' => $row['status'],
            'discipline' => $row['discipline'],
            'device_id' => $row['device_id'],
            'sync_version' => (int)$row['sync_version'],
            'created_at_utc' => formatDatetime($row['created_at_utc']),
            'modified_at_utc' => formatDatetime($row['modified_at_utc']),
        ];
    }, $records);

    $deleted = dbQuery(
        "SELECT entity_id FROM _deletion_log
         WHERE entity_type = 'equipment_items' AND deleted_at_utc > ?",
        [$since]
    );

    return ['records' => $formatted, 'deleted' => array_column($deleted, 'entity_id')];
}

/**
 * Pull equipment checkouts
 */
function pullEquipmentCheckouts(string $since, int $limit): array
{
    $records = dbQuery(
        "SELECT id, equipment_id, internal_member_id, checked_out_at_utc, checked_in_at_utc, checkout_notes, checkin_notes, conflict_status, device_id, sync_version
         FROM equipment_checkouts
         WHERE synced_at_utc > ? OR (synced_at_utc IS NULL AND checked_out_at_utc > ?)
         ORDER BY checked_out_at_utc ASC
         LIMIT ?",
        [$since, $since, $limit]
    );

    return array_map(function ($row) {
        return [
            'id' => $row['id'],
            'equipment_id' => $row['equipment_id'],
            'internal_member_id' => $row['internal_member_id'],
            'checked_out_at_utc' => formatDatetime($row['checked_out_at_utc']),
            'checked_in_at_utc' => formatDatetime($row['checked_in_at_utc']),
            'checkout_notes' => $row['checkout_notes'],
            'checkin_notes' => $row['checkin_notes'],
            'conflict_status' => $row['conflict_status'],
            'device_id' => $row['device_id'],
            'sync_version' => (int)$row['sync_version'],
        ];
    }, $records);
}

/**
 * Pull trainer infos
 */
function pullTrainerInfos(string $since, int $limit): array
{
    $records = dbQuery(
        "SELECT internal_member_id, is_trainer, has_skydeleder_certificate, certified_date, notes, device_id, sync_version, created_at_utc, modified_at_utc
         FROM trainer_info
         WHERE modified_at_utc > ?
         ORDER BY modified_at_utc ASC
         LIMIT ?",
        [$since, $limit]
    );

    return array_map(function ($row) {
        return [
            'internal_member_id' => $row['internal_member_id'],
            'is_trainer' => (bool)$row['is_trainer'],
            'has_skydeleder_certificate' => (bool)$row['has_skydeleder_certificate'],
            'certified_date' => $row['certified_date'],
            'notes' => $row['notes'],
            'device_id' => $row['device_id'],
            'sync_version' => (int)$row['sync_version'],
            'created_at_utc' => formatDatetime($row['created_at_utc']),
            'modified_at_utc' => formatDatetime($row['modified_at_utc']),
        ];
    }, $records);
}

/**
 * Pull trainer disciplines
 */
function pullTrainerDisciplines(string $since, int $limit): array
{
    $records = dbQuery(
        "SELECT id, internal_member_id, discipline, level, certified_date, device_id, sync_version, created_at_utc
         FROM trainer_disciplines
         WHERE created_at_utc > ?
         ORDER BY created_at_utc ASC
         LIMIT ?",
        [$since, $limit]
    );

    return array_map(function ($row) {
        return [
            'id' => $row['id'],
            'internal_member_id' => $row['internal_member_id'],
            'discipline' => $row['discipline'],
            'level' => $row['level'],
            'certified_date' => $row['certified_date'],
            'device_id' => $row['device_id'],
            'sync_version' => (int)$row['sync_version'],
            'created_at_utc' => formatDatetime($row['created_at_utc']),
        ];
    }, $records);
}

/**
 * Pull photo metadata (not binary data)
 */
function pullPhotoMetadata(string $since, int $limit): array
{
    $records = dbQuery(
        "SELECT id, internal_member_id, photo_type, content_hash, mime_type, file_size, width, height, device_id, sync_version, created_at_utc
         FROM member_photos
         WHERE created_at_utc > ?
         ORDER BY created_at_utc ASC
         LIMIT ?",
        [$since, $limit]
    );

    return array_map(function ($row) {
        return [
            'id' => $row['id'],
            'internal_member_id' => $row['internal_member_id'],
            'photo_type' => $row['photo_type'],
            'content_hash' => $row['content_hash'],
            'mime_type' => $row['mime_type'],
            'file_size' => (int)$row['file_size'],
            'width' => $row['width'] ? (int)$row['width'] : null,
            'height' => $row['height'] ? (int)$row['height'] : null,
            'device_id' => $row['device_id'],
            'sync_version' => (int)$row['sync_version'],
            'created_at_utc' => formatDatetime($row['created_at_utc']),
        ];
    }, $records);
}

/**
 * Pull fiscal years
 */
function pullFiscalYears(string $since, int $limit): array
{
    $records = dbQuery(
        "SELECT year, opening_cash_balance, opening_bank_balance, is_closed, device_id, sync_version, created_at_utc, modified_at_utc
         FROM fiscal_years
         WHERE modified_at_utc > ?
         ORDER BY year ASC
         LIMIT ?",
        [$since, $limit]
    );

    return array_map(function ($row) {
        return [
            'year' => (int)$row['year'],
            'opening_cash_balance' => (float)$row['opening_cash_balance'],
            'opening_bank_balance' => (float)$row['opening_bank_balance'],
            'is_closed' => (bool)$row['is_closed'],
            'device_id' => $row['device_id'],
            'sync_version' => (int)$row['sync_version'],
            'created_at_utc' => formatDatetime($row['created_at_utc']),
            'modified_at_utc' => formatDatetime($row['modified_at_utc']),
        ];
    }, $records);
}

/**
 * Pull fee rates
 */
function pullFeeRates(string $since, int $limit): array
{
    // Fee rates don't have timestamps, pull all for fiscal years modified since
    $records = dbQuery(
        "SELECT fr.fiscal_year, fr.member_type, fr.fee_amount
         FROM fee_rates fr
         JOIN fiscal_years fy ON fr.fiscal_year = fy.year
         WHERE fy.modified_at_utc > ?
         LIMIT ?",
        [$since, $limit]
    );

    return array_map(function ($row) {
        return [
            'fiscal_year' => (int)$row['fiscal_year'],
            'member_type' => $row['member_type'],
            'fee_amount' => (float)$row['fee_amount'],
        ];
    }, $records);
}

/**
 * Pull posting categories
 */
function pullPostingCategories(string $since, int $limit): array
{
    $records = dbQuery(
        "SELECT id, name, description, sort_order, is_active, device_id, sync_version, created_at_utc, modified_at_utc
         FROM posting_categories
         WHERE modified_at_utc > ?
         ORDER BY sort_order ASC
         LIMIT ?",
        [$since, $limit]
    );

    return array_map(function ($row) {
        return [
            'id' => $row['id'],
            'name' => $row['name'],
            'description' => $row['description'],
            'sort_order' => (int)$row['sort_order'],
            'is_active' => (bool)$row['is_active'],
            'device_id' => $row['device_id'],
            'sync_version' => (int)$row['sync_version'],
            'created_at_utc' => formatDatetime($row['created_at_utc']),
            'modified_at_utc' => formatDatetime($row['modified_at_utc']),
        ];
    }, $records);
}

/**
 * Pull transaction lines
 */
function pullTransactionLines(string $since, int $limit): array
{
    $records = dbQuery(
        "SELECT tl.id, tl.transaction_id, tl.category_id, tl.amount, tl.is_income, tl.source, tl.member_id, tl.line_description
         FROM transaction_lines tl
         JOIN financial_transactions ft ON tl.transaction_id = ft.id
         WHERE ft.modified_at_utc > ?
         ORDER BY ft.sequence_number ASC
         LIMIT ?",
        [$since, $limit]
    );

    return array_map(function ($row) {
        return [
            'id' => $row['id'],
            'transaction_id' => $row['transaction_id'],
            'category_id' => $row['category_id'],
            'amount' => (float)$row['amount'],
            'is_income' => (bool)$row['is_income'],
            'source' => $row['source'] ?? 'CASH',
            'member_id' => $row['member_id'],
            'line_description' => $row['line_description'],
        ];
    }, $records);
}

/**
 * Pull pending fee payments
 */
function pullPendingFeePayments(string $since, int $limit): array
{
    $records = dbQuery(
        "SELECT id, fiscal_year, member_id, amount, payment_date, payment_method, notes, is_consolidated, consolidated_transaction_id, device_id, sync_version, created_at_utc, modified_at_utc
         FROM pending_fee_payments
         WHERE modified_at_utc > ?
         ORDER BY modified_at_utc ASC
         LIMIT ?",
        [$since, $limit]
    );

    return array_map(function ($row) {
        return [
            'id' => $row['id'],
            'fiscal_year' => (int)$row['fiscal_year'],
            'member_id' => $row['member_id'],
            'amount' => (float)$row['amount'],
            'payment_date' => $row['payment_date'],
            'payment_method' => $row['payment_method'],
            'notes' => $row['notes'],
            'is_consolidated' => (bool)$row['is_consolidated'],
            'consolidated_transaction_id' => $row['consolidated_transaction_id'],
            'device_id' => $row['device_id'],
            'sync_version' => (int)$row['sync_version'],
            'created_at_utc' => formatDatetime($row['created_at_utc']),
            'modified_at_utc' => formatDatetime($row['modified_at_utc']),
        ];
    }, $records);
}

/**
 * Pull scan events
 */
function pullScanEvents(string $since, int $limit): array
{
    $records = dbQuery(
        "SELECT id, internal_member_id, scan_type, linked_check_in_id, linked_session_id, canceled_flag, device_id, sync_version, created_at_utc, synced_at_utc
         FROM scan_events
         WHERE synced_at_utc > ? OR (synced_at_utc IS NULL AND created_at_utc > ?)
         ORDER BY created_at_utc ASC
         LIMIT ?",
        [$since, $since, $limit]
    );

    return array_map(function ($row) {
        return [
            'id' => $row['id'],
            'internal_member_id' => $row['internal_member_id'],
            'scan_type' => $row['scan_type'],
            'linked_check_in_id' => $row['linked_check_in_id'],
            'linked_session_id' => $row['linked_session_id'],
            'canceled_flag' => (bool)$row['canceled_flag'],
            'device_id' => $row['device_id'],
            'sync_version' => (int)$row['sync_version'],
            'created_at_utc' => formatDatetime($row['created_at_utc']),
            'synced_at_utc' => formatDatetime($row['synced_at_utc']),
        ];
    }, $records);
}

/**
 * Pull member preferences
 */
function pullMemberPreferences(string $since, int $limit): array
{
    $records = dbQuery(
        "SELECT member_id, last_practice_type, last_classification, device_id, sync_version, modified_at_utc
         FROM member_preferences
         WHERE modified_at_utc > ?
         ORDER BY modified_at_utc ASC
         LIMIT ?",
        [$since, $limit]
    );

    return array_map(function ($row) {
        return [
            'member_id' => $row['member_id'],
            'last_practice_type' => $row['last_practice_type'],
            'last_classification' => $row['last_classification'],
            'device_id' => $row['device_id'],
            'sync_version' => (int)$row['sync_version'],
            'modified_at_utc' => formatDatetime($row['modified_at_utc']),
        ];
    }, $records);
}

/**
 * Pull new member registrations
 */
function pullNewMemberRegistrations(string $since, int $limit): array
{
    $records = dbQuery(
        "SELECT id, first_name, last_name, birthday, gender,
                email, phone, address, zip_code, city, notes, photo_path,
                guardian_name, guardian_phone, guardian_email,
                source_device_id, source_device_name,
                approval_status, approved_at_utc, rejected_at_utc,
                rejection_reason, created_member_id, created_at_utc,
                device_id, sync_version, modified_at_utc
         FROM new_member_registrations
         WHERE modified_at_utc > ?
         ORDER BY modified_at_utc ASC
         LIMIT ?",
        [$since, $limit]
    );

    return array_map(function ($row) {
        return [
            'id' => $row['id'],
            'first_name' => $row['first_name'],
            'last_name' => $row['last_name'],
            'birthday' => $row['birthday'],
            'gender' => $row['gender'],
            'email' => $row['email'],
            'phone' => $row['phone'],
            'address' => $row['address'],
            'zip_code' => $row['zip_code'],
            'city' => $row['city'],
            'notes' => $row['notes'],
            'photo_path' => $row['photo_path'],
            'guardian_name' => $row['guardian_name'],
            'guardian_phone' => $row['guardian_phone'],
            'guardian_email' => $row['guardian_email'],
            'source_device_id' => $row['source_device_id'],
            'source_device_name' => $row['source_device_name'],
            'approval_status' => $row['approval_status'],
            'approved_at_utc' => formatDatetime($row['approved_at_utc']),
            'rejected_at_utc' => formatDatetime($row['rejected_at_utc']),
            'rejection_reason' => $row['rejection_reason'],
            'created_member_id' => $row['created_member_id'],
            'created_at_utc' => formatDatetime($row['created_at_utc']),
            'device_id' => $row['device_id'],
            'sync_version' => (int)$row['sync_version'],
            'modified_at_utc' => formatDatetime($row['modified_at_utc']),
        ];
    }, $records);
}

/**
 * Pull SKV registrations
 */
function pullSkvRegistrations(string $since, int $limit): array
{
    $records = dbQuery(
        "SELECT id, member_id, skv_level, status, last_approved_date,
                created_at_utc, updated_at_utc, device_id, sync_version
         FROM skv_registrations
         WHERE updated_at_utc > ?
         ORDER BY updated_at_utc ASC
         LIMIT ?",
        [$since, $limit]
    );

    return array_map(function ($row) {
        return [
            'id' => $row['id'],
            'member_id' => $row['member_id'],
            'skv_level' => (int)$row['skv_level'],
            'status' => $row['status'],
            'last_approved_date' => $row['last_approved_date'],
            'created_at_utc' => formatDatetime($row['created_at_utc']),
            'updated_at_utc' => formatDatetime($row['updated_at_utc']),
            'device_id' => $row['device_id'],
            'sync_version' => (int)$row['sync_version'],
        ];
    }, $records);
}

/**
 * Pull SKV weapons
 */
function pullSkvWeapons(string $since, int $limit): array
{
    $records = dbQuery(
        "SELECT id, skv_registration_id, model, description, serial, type, caliber,
                last_reviewed_date, created_at_utc, updated_at_utc, device_id, sync_version
         FROM skv_weapons
         WHERE updated_at_utc > ?
         ORDER BY updated_at_utc ASC
         LIMIT ?",
        [$since, $limit]
    );

    return array_map(function ($row) {
        return [
            'id' => $row['id'],
            'skv_registration_id' => $row['skv_registration_id'],
            'model' => $row['model'],
            'description' => $row['description'],
            'serial' => $row['serial'],
            'type' => $row['type'],
            'caliber' => $row['caliber'],
            'last_reviewed_date' => $row['last_reviewed_date'],
            'created_at_utc' => formatDatetime($row['created_at_utc']),
            'updated_at_utc' => formatDatetime($row['updated_at_utc']),
            'device_id' => $row['device_id'],
            'sync_version' => (int)$row['sync_version'],
        ];
    }, $records);
}

/**
 * Format datetime to ISO 8601
 */
function formatDatetime(?string $datetime): ?string
{
    if (!$datetime) {
        return null;
    }
    $dt = new DateTime($datetime);
    return $dt->format('Y-m-d\TH:i:s\Z');
}
