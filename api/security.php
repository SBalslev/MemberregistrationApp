<?php
/**
 * Security Helper Functions
 * - IP allowlist
 * - Rate limiting
 * - Login lockout
 * - Audit logging
 * - Input validation
 */

declare(strict_types=1);

// File version - increment when making changes
const SECURITY_VERSION = '1.1.0';  // 1.1.0: Added device_id validation type

require_once __DIR__ . '/db.php';

/**
 * Get real client IP (handles proxies)
 */
function getClientIp(): string
{
    // Check for proxy headers (only trust if behind known proxy)
    $headers = ['HTTP_X_FORWARDED_FOR', 'HTTP_X_REAL_IP', 'REMOTE_ADDR'];

    foreach ($headers as $header) {
        if (!empty($_SERVER[$header])) {
            // X-Forwarded-For can contain multiple IPs, take the first
            $ips = explode(',', $_SERVER[$header]);
            $ip = trim($ips[0]);
            if (filter_var($ip, FILTER_VALIDATE_IP)) {
                return $ip;
            }
        }
    }

    return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
}

/**
 * Check if IP is in allowlist
 * Returns true if allowlist is empty (allow all) or IP matches
 */
function checkIpAllowlist(string $ip, array $allowlist): bool
{
    // Empty allowlist = allow all
    if (empty($allowlist)) {
        return true;
    }

    foreach ($allowlist as $allowed) {
        if (strpos($allowed, '/') !== false) {
            // CIDR notation
            if (ipInCidr($ip, $allowed)) {
                return true;
            }
        } else {
            // Exact match
            if ($ip === $allowed) {
                return true;
            }
        }
    }

    return false;
}

/**
 * Check if IP is within CIDR range
 */
function ipInCidr(string $ip, string $cidr): bool
{
    list($subnet, $bits) = explode('/', $cidr);
    $ip = ip2long($ip);
    $subnet = ip2long($subnet);
    $mask = -1 << (32 - (int)$bits);
    return ($ip & $mask) === ($subnet & $mask);
}

/**
 * Rate limiting check
 */
function checkRateLimit(string $clientIp, array $config): bool
{
    $limit = $config['rate_limit_requests'] ?? 60;
    $window = $config['rate_limit_window_seconds'] ?? 60;

    try {
        // Clean old entries
        dbExecute(
            "DELETE FROM _rate_limits WHERE created_at < NOW() - INTERVAL ? SECOND",
            [$window]
        );

        // Count recent requests
        $row = dbQueryOne(
            "SELECT COUNT(*) as cnt FROM _rate_limits WHERE ip = ? AND created_at > NOW() - INTERVAL ? SECOND",
            [$clientIp, $window]
        );
        $count = (int)($row['cnt'] ?? 0);

        if ($count >= $limit) {
            return false;
        }

        // Record this request
        dbExecute(
            "INSERT INTO _rate_limits (ip, created_at) VALUES (?, NOW())",
            [$clientIp]
        );

        return true;
    } catch (Exception $e) {
        // If rate limit table doesn't exist, allow request but log error
        error_log('Rate limit check failed: ' . $e->getMessage());
        return true;
    }
}

/**
 * Check login attempts and enforce lockout
 */
function checkLoginLockout(string $identifier, array $config): array
{
    $maxAttempts = $config['max_login_attempts'] ?? 5;
    $lockoutMinutes = $config['lockout_duration_minutes'] ?? 15;

    try {
        // Count failed attempts in lockout window
        $row = dbQueryOne(
            "SELECT COUNT(*) as cnt FROM _login_attempts
             WHERE identifier = ? AND success = 0 AND attempted_at > NOW() - INTERVAL ? MINUTE",
            [$identifier, $lockoutMinutes]
        );
        $failedAttempts = (int)($row['cnt'] ?? 0);

        if ($failedAttempts >= $maxAttempts) {
            // Calculate remaining lockout time
            $lastAttempt = dbQueryOne(
                "SELECT MAX(attempted_at) as last_attempt FROM _login_attempts
                 WHERE identifier = ? AND success = 0",
                [$identifier]
            );

            if ($lastAttempt && $lastAttempt['last_attempt']) {
                $lockoutEnds = strtotime($lastAttempt['last_attempt']) + ($lockoutMinutes * 60);
                $remainingSeconds = max(0, $lockoutEnds - time());

                return [
                    'locked' => true,
                    'remaining_seconds' => $remainingSeconds,
                    'message' => sprintf(
                        'Too many failed attempts. Try again in %d minutes.',
                        (int)ceil($remainingSeconds / 60)
                    )
                ];
            }
        }

        return [
            'locked' => false,
            'attempts_remaining' => $maxAttempts - $failedAttempts
        ];
    } catch (Exception $e) {
        error_log('Login lockout check failed: ' . $e->getMessage());
        return ['locked' => false, 'attempts_remaining' => $maxAttempts];
    }
}

/**
 * Record login attempt
 */
function recordLoginAttempt(string $identifier, bool $success, string $ip): void
{
    try {
        dbExecute(
            "INSERT INTO _login_attempts (identifier, ip, success, attempted_at) VALUES (?, ?, ?, NOW())",
            [$identifier, $ip, $success ? 1 : 0]
        );

        // If successful, clear previous failed attempts
        if ($success) {
            dbExecute(
                "DELETE FROM _login_attempts WHERE identifier = ? AND success = 0",
                [$identifier]
            );
        }
    } catch (Exception $e) {
        error_log('Failed to record login attempt: ' . $e->getMessage());
    }
}

/**
 * Log security events
 */
function logSecurityEvent(string $eventType, string $ip, string $details = ''): void
{
    try {
        dbExecute(
            "INSERT INTO _security_log (event_type, ip, details, created_at) VALUES (?, ?, ?, NOW())",
            [$eventType, $ip, $details]
        );
    } catch (Exception $e) {
        // Fallback to error_log
        error_log(sprintf('[SECURITY] %s | IP: %s | %s', $eventType, $ip, $details));
    }

    // Also log to file for immediate access
    $logDir = __DIR__ . '/logs';
    if (is_writable($logDir)) {
        $logLine = sprintf(
            "[%s] %s | IP: %s | %s\n",
            date('Y-m-d H:i:s'),
            $eventType,
            $ip,
            $details
        );
        @file_put_contents($logDir . '/security.log', $logLine, FILE_APPEND | LOCK_EX);
    }
}

/**
 * Log API access for audit trail
 */
function logApiAccess(string $ip, string $method, string $uri, ?string $deviceId): void
{
    try {
        dbExecute(
            "INSERT INTO _api_access_log (ip, method, uri, device_id, created_at) VALUES (?, ?, ?, ?, NOW())",
            [$ip, $method, $uri, $deviceId]
        );
    } catch (Exception $e) {
        // Silent fail for audit logging
        error_log('Failed to log API access: ' . $e->getMessage());
    }
}

/**
 * Validate and sanitize input
 */
function validateInput(array $input, array $rules): array
{
    $errors = [];
    $sanitized = [];

    foreach ($rules as $field => $rule) {
        $value = $input[$field] ?? null;

        // Required check
        if (($rule['required'] ?? false) && ($value === null || $value === '')) {
            $errors[$field] = "Field '{$field}' is required";
            continue;
        }

        if ($value === null || $value === '') {
            $sanitized[$field] = null;
            continue;
        }

        // Type validation
        $type = $rule['type'] ?? 'string';
        $valid = true;

        switch ($type) {
            case 'string':
                $value = trim((string)$value);
                $maxLen = $rule['max_length'] ?? 255;
                if (strlen($value) > $maxLen) {
                    $errors[$field] = "Field '{$field}' exceeds maximum length of {$maxLen}";
                    $valid = false;
                }
                break;

            case 'email':
                $value = filter_var(trim($value), FILTER_VALIDATE_EMAIL);
                if ($value === false) {
                    $errors[$field] = "Field '{$field}' must be a valid email";
                    $valid = false;
                    $value = null;
                }
                break;

            case 'uuid':
                if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $value)) {
                    $errors[$field] = "Field '{$field}' must be a valid UUID";
                    $valid = false;
                }
                break;

            case 'device_id':
                // Device ID: alphanumeric, hyphens, underscores (e.g., "laptop-abc123" or full UUID)
                if (!preg_match('/^[a-zA-Z0-9_-]{4,64}$/', $value)) {
                    $errors[$field] = "Field '{$field}' must be a valid device identifier (alphanumeric, 4-64 chars)";
                    $valid = false;
                }
                break;

            case 'int':
                $value = filter_var($value, FILTER_VALIDATE_INT);
                if ($value === false) {
                    $errors[$field] = "Field '{$field}' must be an integer";
                    $valid = false;
                    $value = null;
                }
                break;

            case 'float':
                $value = filter_var($value, FILTER_VALIDATE_FLOAT);
                if ($value === false) {
                    $errors[$field] = "Field '{$field}' must be a number";
                    $valid = false;
                    $value = null;
                }
                break;

            case 'bool':
                $value = filter_var($value, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
                if ($value === null) {
                    $errors[$field] = "Field '{$field}' must be a boolean";
                    $valid = false;
                }
                break;

            case 'datetime':
                $dt = DateTime::createFromFormat('Y-m-d\TH:i:s\Z', $value);
                if (!$dt) {
                    // Try alternate format
                    $dt = DateTime::createFromFormat('Y-m-d H:i:s', $value);
                }
                if (!$dt) {
                    $errors[$field] = "Field '{$field}' must be ISO 8601 datetime";
                    $valid = false;
                }
                break;

            case 'date':
                $dt = DateTime::createFromFormat('Y-m-d', $value);
                if (!$dt) {
                    $errors[$field] = "Field '{$field}' must be YYYY-MM-DD date";
                    $valid = false;
                }
                break;

            case 'enum':
                $allowed = $rule['values'] ?? [];
                if (!in_array($value, $allowed, true)) {
                    $errors[$field] = "Field '{$field}' must be one of: " . implode(', ', $allowed);
                    $valid = false;
                }
                break;

            case 'array':
                if (!is_array($value)) {
                    $errors[$field] = "Field '{$field}' must be an array";
                    $valid = false;
                }
                break;
        }

        if ($valid) {
            $sanitized[$field] = $value;
        }
    }

    return [
        'valid' => empty($errors),
        'errors' => $errors,
        'data' => $sanitized
    ];
}

/**
 * Send JSON response and exit
 */
function jsonResponse(array $data, int $statusCode = 200): void
{
    http_response_code($statusCode);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * Send error response and exit
 */
function errorResponse(string $message, int $statusCode = 400, array $extra = []): void
{
    jsonResponse(array_merge(['error' => $message], $extra), $statusCode);
}
