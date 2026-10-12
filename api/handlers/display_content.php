<?php
/**
 * Outbound-only content delivery for the common-room display.
 */

declare(strict_types=1);

const DISPLAY_CONTENT_VERSION = '1.0.0';

function handleDisplayAnnouncements(): void
{
    $config = require __DIR__ . '/../config.php';
    requireDisplayContentDevice($config);
    $displayId = displayContentDisplayId();
    $rows = dbQuery(
        'SELECT id, title, body, priority, starts_at, ends_at,
                display_duration_seconds, image_mime, version
         FROM display_announcements
         WHERE display_id = ? AND status = \'published\'
           AND ends_at > UTC_TIMESTAMP()
           AND starts_at < UTC_TIMESTAMP() + INTERVAL 30 DAY
         ORDER BY FIELD(priority, \'important\', \'normal\'), starts_at ASC, created_at ASC
         LIMIT 100',
        [$displayId]
    );
    $announcements = array_map(
        static function (array $row) use ($displayId): array {
            return [
                'id' => $row['id'],
                'title' => $row['title'],
                'body' => $row['body'],
                'priority' => $row['priority'],
                'startsAt' => displayContentUtcIso($row['starts_at']),
                'endsAt' => displayContentUtcIso($row['ends_at']),
                'displayDurationSeconds' => (int)$row['display_duration_seconds'],
                'version' => (int)$row['version'],
                'imagePath' => $row['image_mime']
                    ? '/display-content/' . rawurlencode($displayId)
                        . '/announcements/' . rawurlencode($row['id']) . '/image'
                    : null,
            ];
        },
        $rows
    );
    jsonResponse([
        'schemaVersion' => 1,
        'displayId' => $displayId,
        'serverTime' => gmdate('c'),
        'announcements' => $announcements,
    ]);
}

function handleDisplayAnnouncementImage(): void
{
    $config = require __DIR__ . '/../config.php';
    requireDisplayContentDevice($config);
    $displayId = displayContentDisplayId();
    $announcementId = displayContentAnnouncementId();
    $image = dbQueryOne(
        'SELECT image_data, version
         FROM display_announcements
         WHERE id = ? AND display_id = ? AND status = \'published\'
           AND starts_at < UTC_TIMESTAMP() + INTERVAL 30 DAY
           AND ends_at > UTC_TIMESTAMP()
           AND image_data IS NOT NULL',
        [$announcementId, $displayId]
    );
    if (!$image) {
        errorResponse('Image not found', 404);
    }
    header('Content-Type: image/jpeg');
    header('Content-Length: ' . strlen($image['image_data']));
    header('Cache-Control: private, max-age=300');
    header('ETag: "' . (int)$image['version'] . '"');
    header('X-Content-Type-Options: nosniff');
    echo $image['image_data'];
    exit;
}

function requireDisplayContentDevice(array $config): void
{
    $expected = (string)($config['display_relay']['device_token'] ?? '');
    $provided = getBearerToken() ?? '';
    if (strlen($expected) < 32 || !hash_equals($expected, $provided)) {
        errorResponse('Unauthorized', 401);
    }
}

function displayContentDisplayId(): string
{
    $displayId = (string)($GLOBALS['routeParams']['displayId'] ?? '');
    if (!preg_match('/^[A-Za-z0-9_-]{1,64}$/', $displayId)) {
        errorResponse('Invalid display ID', 400);
    }
    return $displayId;
}

function displayContentAnnouncementId(): string
{
    $id = (string)($GLOBALS['routeParams']['id'] ?? '');
    if (!preg_match('/^[a-f0-9-]{36}$/', $id)) {
        errorResponse('Invalid announcement ID', 400);
    }
    return $id;
}

function displayContentUtcIso(string $databaseDate): string
{
    return (new DateTimeImmutable($databaseDate, new DateTimeZone('UTC')))
        ->format('Y-m-d\TH:i:s\Z');
}
