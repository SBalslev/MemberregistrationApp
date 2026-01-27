<?php
/**
 * Database Connection Manager
 */

declare(strict_types=1);

/**
 * Get PDO database connection (singleton)
 */
function getDbConnection(): PDO
{
    static $pdo = null;

    if ($pdo === null) {
        $config = require __DIR__ . '/config.php';

        $dsn = sprintf(
            'mysql:host=%s;dbname=%s;charset=%s',
            $config['db']['host'],
            $config['db']['name'],
            $config['db']['charset'] ?? 'utf8mb4'
        );

        $options = [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci",
        ];

        try {
            $pdo = new PDO($dsn, $config['db']['user'], $config['db']['pass'], $options);
        } catch (PDOException $e) {
            // Log error but don't expose details
            error_log('Database connection failed: ' . $e->getMessage());
            throw new RuntimeException('Database connection failed');
        }
    }

    return $pdo;
}

/**
 * Execute a query and return all rows
 */
function dbQuery(string $sql, array $params = []): array
{
    $stmt = getDbConnection()->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll();
}

/**
 * Execute a query and return single row or null
 */
function dbQueryOne(string $sql, array $params = []): ?array
{
    $stmt = getDbConnection()->prepare($sql);
    $stmt->execute($params);
    $row = $stmt->fetch();
    return $row ?: null;
}

/**
 * Execute a statement (INSERT, UPDATE, DELETE)
 */
function dbExecute(string $sql, array $params = []): int
{
    $stmt = getDbConnection()->prepare($sql);
    $stmt->execute($params);
    return $stmt->rowCount();
}

/**
 * Get last insert ID
 */
function dbLastInsertId(): string
{
    return getDbConnection()->lastInsertId();
}

/**
 * Begin transaction
 */
function dbBeginTransaction(): void
{
    getDbConnection()->beginTransaction();
}

/**
 * Commit transaction
 */
function dbCommit(): void
{
    getDbConnection()->commit();
}

/**
 * Rollback transaction
 */
function dbRollback(): void
{
    if (getDbConnection()->inTransaction()) {
        getDbConnection()->rollBack();
    }
}
