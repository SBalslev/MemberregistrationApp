<?php
declare(strict_types=1);

require __DIR__ . '/../handlers/sync_push.php';

$existing = null;
$writes = [];

function dbQueryOne(string $sql, array $params): ?array
{
    return $GLOBALS['existing'];
}

function dbExecute(string $sql, array $params): void
{
    $GLOBALS['writes'][] = [$sql, $params];
}

$base = [
    'id' => 'activity',
    'title' => 'Klubskydning',
    'type' => 'COMPETITION',
    'starts_at_utc' => '2026-11-23T17:00:00Z',
    'ends_at_utc' => '2026-11-23T18:00:00Z',
    'status' => 'COMPLETED',
    'display_enabled' => true,
    'created_at_utc' => '2026-11-23T17:00:00Z',
    'modified_at_utc' => '2026-11-23T18:00:00Z',
    'sync_version' => 2,
];
$completed = ['status' => 'COMPLETED', 'modified_at_utc' => '2026-11-23 18:00:00', 'sync_version' => 2];
$cases = [
    [null, $base, true],
    [$completed, array_replace($base, ['status' => 'ACTIVE', 'modified_at_utc' => '2026-11-23T17:59:00Z', 'sync_version' => 99]), false],
    [$completed, array_replace($base, ['status' => 'ACTIVE', 'sync_version' => 99]), false],
    [$completed, array_replace($base, ['status' => 'ACTIVE', 'modified_at_utc' => '2026-11-23T18:00:00.999Z', 'sync_version' => 99]), false],
    [$completed, array_replace($base, ['status' => 'ACTIVE', 'modified_at_utc' => '2026-11-23T19:00:00Z']), true],
    [$completed, $base, false],
    [array_replace($completed, ['status' => 'ACTIVE', 'sync_version' => 99]), array_replace($base, ['modified_at_utc' => '2026-11-23T19:00:00Z', 'sync_version' => 1]), true],
    [array_replace($completed, ['status' => 'ACTIVE']), $base, true],
];
foreach ($cases as $index => [$local, $incoming, $applied]) {
    $existing = $local;
    $writes = [];
    $result = processActivitiesPush([$incoming], 'trainer');
    if ((count($writes) === 1) !== $applied) {
        throw new RuntimeException("Activity ordering case $index failed");
    }
    if (array_sum($result) !== (int)$applied) {
        throw new RuntimeException("Activity result case $index failed");
    }
}

echo 'Activity sync ordering: ' . count($cases) . " cases passed\n";
