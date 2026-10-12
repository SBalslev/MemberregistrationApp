<?php
/**
 * Portal Database Factory
 *
 * Uses a single MySQL connection (same user as the sync API).
 * Read-only and write-only guarantees are enforced at the PHP layer:
 *
 *   portalDb() / portalAdminDb()
 *     → same connection; portalQuery/portalQueryOne assert SELECT-only
 *
 *   portalWriterDb()
 *     → same connection; portalExecute asserts INSERT/UPDATE/DELETE
 *       and that every referenced table is explicitly portal-managed
 */

declare(strict_types=1);

function _portalPdo(): PDO
{
    static $pdo = null;
    if ($pdo !== null) return $pdo;

    $cfg = require dirname(__DIR__) . '/config.php';
    $db  = $cfg['db'];

    $dsn = sprintf(
        'mysql:host=%s;dbname=%s;charset=%s',
        $db['host'], $db['name'], $db['charset']
    );

    try {
        $pdo = new PDO($dsn, $db['user'], $db['pass'], [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
            PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci",
        ]);
    } catch (PDOException $e) {
        error_log('Portal DB connection failed: ' . $e->getMessage());
        throw new RuntimeException('Database connection failed');
    }

    return $pdo;
}

/** Non-sensitive read queries (members, check-ins, sessions, equipment, trainers) */
function portalDb(): PDO { return _portalPdo(); }

/** Admin read queries (same connection — financial + SKV access controlled by page-level requireRole) */
function portalAdminDb(): PDO { return _portalPdo(); }

/** Write connection — same PDO; portalExecute() enforces portal-managed tables only */
function portalWriterDb(): PDO { return _portalPdo(); }

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/**
 * Run a SELECT and return all rows.
 * Throws if $sql is not a SELECT statement (read-only enforcement).
 */
function portalQuery(PDO $pdo, string $sql, array $params = []): array
{
    _portalAssertSelect($sql);
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll();
}

/**
 * Run a SELECT and return one row or null.
 * Throws if $sql is not a SELECT statement.
 */
function portalQueryOne(PDO $pdo, string $sql, array $params = []): ?array
{
    _portalAssertSelect($sql);
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $row = $stmt->fetch();
    return $row ?: null;
}

/**
 * Run an INSERT/UPDATE/DELETE — only on portal-managed tables.
 * Throws on any other statement or table name.
 */
function portalExecute(PDO $pdo, string $sql, array $params = []): int
{
    _portalAssertPortalWrite($sql);
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return $stmt->rowCount();
}

// ---------------------------------------------------------------------------
// Internal guards
// ---------------------------------------------------------------------------

function _portalAssertSelect(string $sql): void
{
    $verb = strtoupper(substr(ltrim($sql), 0, 6));
    if ($verb !== 'SELECT') {
        error_log('Portal security: non-SELECT blocked: ' . substr($sql, 0, 120));
        throw new RuntimeException('Portal: only SELECT queries are permitted on read connections');
    }
}

function _portalAssertPortalWrite(string $sql): void
{
    $norm = strtoupper(ltrim($sql));

    // Must be a write statement
    $writeVerbs = ['INSERT', 'UPDATE', 'DELETE'];
    $isWrite = false;
    foreach ($writeVerbs as $v) {
        if (str_starts_with($norm, $v)) { $isWrite = true; break; }
    }
    if (!$isWrite) {
        error_log('Portal security: non-write blocked in writer: ' . substr($sql, 0, 120));
        throw new RuntimeException('Portal: only INSERT/UPDATE/DELETE permitted on write connection');
    }

    // Extract table names from INTO/FROM/JOIN and standalone UPDATE...SET clauses.
    // Must NOT match "ON DUPLICATE KEY UPDATE column" — hence UPDATE requires SET to follow.
    preg_match_all('/\b(?:INTO|FROM|JOIN)\s+`?(\w+)`?/i', $sql, $mInto);
    preg_match_all('/\bUPDATE\s+`?(\w+)`?\s+SET\b/i', $sql, $mUpd);
    $tables = array_merge($mInto[1], $mUpd[1]);

    $allowedTables = ['display_announcements'];
    foreach ($tables as $table) {
        if (stripos($table, 'portal_') !== 0 && !in_array(strtolower($table), $allowedTables, true)) {
            error_log('Portal security: write to non-portal table blocked: ' . $table);
            throw new RuntimeException('Portal: write is not permitted for this table');
        }
    }
}
