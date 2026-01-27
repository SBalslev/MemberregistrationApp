<?php
/**
 * Diagnostic endpoint for verifying API deployment.
 * Returns version info and checksums to verify the API is correctly deployed.
 *
 * GET /api/v1/diagnostic
 */

declare(strict_types=1);

// API version - increment when making changes
const API_VERSION = '1.4.2';
const API_BUILD_DATE = '2026-01-27';

// Expected file versions - update these when releasing new versions
const EXPECTED_FILE_VERSIONS = [
    'handlers/sync_push.php' => '1.4.0',
    'handlers/sync_pull.php' => '1.4.0',
    'handlers/auth.php' => '1.1.0',
    'security.php' => '1.1.0',
];

/**
 * Extract version constant from a PHP file.
 */
function extractFileVersion(string $filePath): ?string {
    if (!file_exists($filePath)) {
        return null;
    }

    $content = file_get_contents($filePath);
    if ($content === false) {
        return null;
    }

    // Look for const VERSION patterns like: const SYNC_PUSH_VERSION = '1.1.0';
    if (preg_match("/const\s+\w+_VERSION\s*=\s*'([^']+)'/", $content, $matches)) {
        return $matches[1];
    }

    return null;
}

function handleDiagnostic(): void {
    // Collect file checksums for critical files
    $files = [
        'index.php',
        'db.php',
        'auth.php',
        'security.php',
        'handlers/auth.php',
        'handlers/sync_push.php',
        'handlers/sync_pull.php',
        'handlers/sync_status.php',
        'handlers/photos.php',
        'handlers/schema.php',
        'handlers/diagnostic.php',
    ];

    $checksums = [];
    $missingFiles = [];
    $fileVersions = [];
    $versionMismatches = [];

    foreach ($files as $file) {
        $path = __DIR__ . '/../' . $file;
        if (file_exists($path)) {
            $checksums[$file] = md5_file($path);

            // Extract version if this file has one
            $version = extractFileVersion($path);
            if ($version !== null) {
                $fileVersions[$file] = $version;

                // Check against expected version
                if (isset(EXPECTED_FILE_VERSIONS[$file])) {
                    $expected = EXPECTED_FILE_VERSIONS[$file];
                    if ($version !== $expected) {
                        $versionMismatches[$file] = [
                            'actual' => $version,
                            'expected' => $expected,
                        ];
                    }
                }
            }
        } else {
            $missingFiles[] = $file;
        }
    }

    // Calculate combined checksum of all files
    $combinedChecksum = md5(implode('', $checksums));

    // Check database connection
    $dbStatus = 'unknown';
    $schemaVersion = null;
    try {
        require_once __DIR__ . '/../db.php';
        $pdo = getDbConnection();
        $dbStatus = 'connected';

        // Get schema version
        $stmt = $pdo->query('SELECT major_version, minor_version, patch_version FROM _schema_metadata LIMIT 1');
        $row = $stmt->fetch();
        if ($row) {
            $schemaVersion = $row['major_version'] . '.' . $row['minor_version'] . '.' . $row['patch_version'];
        }
    } catch (Exception $e) {
        $dbStatus = 'error: ' . $e->getMessage();
    }

    // Check required PHP extensions
    $extensions = [
        'pdo' => extension_loaded('pdo'),
        'pdo_mysql' => extension_loaded('pdo_mysql'),
        'json' => extension_loaded('json'),
        'mbstring' => extension_loaded('mbstring'),
    ];

    // Check PHP version
    $phpVersion = PHP_VERSION;
    $phpVersionOk = version_compare($phpVersion, '8.1.0', '>=');

    // Check if config exists
    $configExists = file_exists(__DIR__ . '/../config.php');

    // Build response
    $allVersionsOk = empty($versionMismatches) && empty($missingFiles);

    $response = [
        'api' => [
            'version' => API_VERSION,
            'build_date' => API_BUILD_DATE,
            'combined_checksum' => $combinedChecksum,
        ],
        'files' => [
            'checksums' => $checksums,
            'versions' => $fileVersions,
            'expected_versions' => EXPECTED_FILE_VERSIONS,
            'version_mismatches' => $versionMismatches,
            'missing' => $missingFiles,
            'count' => count($checksums),
            'all_versions_ok' => $allVersionsOk,
        ],
        'database' => [
            'status' => $dbStatus,
            'schema_version' => $schemaVersion,
        ],
        'php' => [
            'version' => $phpVersion,
            'version_ok' => $phpVersionOk,
            'extensions' => $extensions,
        ],
        'config' => [
            'exists' => $configExists,
        ],
        'server_time' => gmdate('Y-m-d\TH:i:s\Z'),
        'deployment_ok' => $allVersionsOk && $dbStatus === 'connected' && $configExists && $phpVersionOk,
    ];

    echo json_encode($response, JSON_PRETTY_PRINT);
}
