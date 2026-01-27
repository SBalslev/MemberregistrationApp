<?php
/**
 * Authentication Handler
 */

declare(strict_types=1);

// File version - increment when making changes
const AUTH_VERSION = '1.1.0';  // 1.1.0: Changed device_id validation to support non-UUID format

/**
 * Handle POST /auth/token
 * Authenticate with password and receive JWT token
 */
function handleAuthToken(): void
{
    $config = require __DIR__ . '/../config.php';
    $clientIp = getClientIp();

    // Parse input
    $input = json_decode(file_get_contents('php://input'), true);

    if (!$input) {
        errorResponse('Invalid JSON body', 400);
    }

    // Validate input
    // Note: device_id is a string identifier, not necessarily a UUID
    $validation = validateInput($input, [
        'password' => ['required' => true, 'type' => 'string', 'max_length' => 100],
        'device_id' => ['required' => true, 'type' => 'device_id', 'max_length' => 64],
    ]);

    if (!$validation['valid']) {
        errorResponse('Invalid request', 400, ['details' => $validation['errors']]);
    }

    $password = $validation['data']['password'];
    $deviceId = $validation['data']['device_id'];

    // Check lockout (use IP + device_id as identifier)
    $identifier = $clientIp . ':' . $deviceId;
    $lockout = checkLoginLockout($identifier, $config['security']);

    if ($lockout['locked']) {
        logSecurityEvent('login_locked', $clientIp, "Device: {$deviceId}");
        errorResponse($lockout['message'], 429, [
            'retry_after_seconds' => $lockout['remaining_seconds']
        ]);
    }

    // Verify password
    $passwordValid = password_verify($password, $config['api']['password_hash']);

    // Record attempt
    recordLoginAttempt($identifier, $passwordValid, $clientIp);

    if (!$passwordValid) {
        logSecurityEvent('login_failed', $clientIp, "Device: {$deviceId}");
        errorResponse('Invalid password', 401, [
            'attempts_remaining' => max(0, ($lockout['attempts_remaining'] ?? 5) - 1)
        ]);
    }

    // Generate token
    $token = createAuthToken($deviceId, $clientIp);
    $expiresAt = time() + ($config['api']['token_lifetime'] ?? 86400);

    logSecurityEvent('login_success', $clientIp, "Device: {$deviceId}");

    jsonResponse([
        'token' => $token,
        'expires_at' => gmdate('Y-m-d\TH:i:s\Z', $expiresAt),
        'device_id' => $deviceId,
    ]);
}
