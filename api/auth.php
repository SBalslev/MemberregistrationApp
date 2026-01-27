<?php
/**
 * JWT Authentication Helpers
 */

declare(strict_types=1);

// Simple JWT implementation (no external dependencies)
// For production, consider using firebase/php-jwt

/**
 * Generate JWT token
 */
function generateJwt(array $payload, string $secret): string
{
    $header = [
        'alg' => 'HS256',
        'typ' => 'JWT'
    ];

    $headerEncoded = base64UrlEncode(json_encode($header));
    $payloadEncoded = base64UrlEncode(json_encode($payload));

    $signature = hash_hmac('sha256', "$headerEncoded.$payloadEncoded", $secret, true);
    $signatureEncoded = base64UrlEncode($signature);

    return "$headerEncoded.$payloadEncoded.$signatureEncoded";
}

/**
 * Validate and decode JWT token
 */
function validateJwt(string $token, string $secret): ?array
{
    $parts = explode('.', $token);
    if (count($parts) !== 3) {
        return null;
    }

    list($headerEncoded, $payloadEncoded, $signatureEncoded) = $parts;

    // Verify signature
    $expectedSignature = hash_hmac('sha256', "$headerEncoded.$payloadEncoded", $secret, true);
    $expectedSignatureEncoded = base64UrlEncode($expectedSignature);

    if (!hash_equals($expectedSignatureEncoded, $signatureEncoded)) {
        return null;
    }

    // Decode payload
    $payload = json_decode(base64UrlDecode($payloadEncoded), true);
    if (!$payload) {
        return null;
    }

    // Check expiration
    if (isset($payload['exp']) && $payload['exp'] < time()) {
        return null;
    }

    return $payload;
}

/**
 * Base64 URL-safe encode
 */
function base64UrlEncode(string $data): string
{
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

/**
 * Base64 URL-safe decode
 */
function base64UrlDecode(string $data): string
{
    return base64_decode(strtr($data, '-_', '+/'));
}

/**
 * Get Bearer token from Authorization header
 */
function getBearerToken(): ?string
{
    $headers = [];

    // Try different ways to get Authorization header
    if (isset($_SERVER['HTTP_AUTHORIZATION'])) {
        $headers['Authorization'] = $_SERVER['HTTP_AUTHORIZATION'];
    } elseif (isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
        $headers['Authorization'] = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
    } elseif (function_exists('apache_request_headers')) {
        $requestHeaders = apache_request_headers();
        $headers = array_combine(
            array_map('ucwords', array_keys($requestHeaders)),
            array_values($requestHeaders)
        );
    }

    if (!isset($headers['Authorization'])) {
        return null;
    }

    if (preg_match('/Bearer\s+(.+)$/i', $headers['Authorization'], $matches)) {
        return $matches[1];
    }

    return null;
}

/**
 * Validate token and return payload
 */
function validateToken(?string $token): ?array
{
    if (!$token) {
        return null;
    }

    $config = require __DIR__ . '/config.php';
    return validateJwt($token, $config['api']['jwt_secret']);
}

/**
 * Get device ID from current valid token
 */
function getDeviceIdFromToken(): ?string
{
    $token = getBearerToken();
    if (!$token) {
        return null;
    }

    $payload = validateToken($token);
    return $payload['device_id'] ?? null;
}

/**
 * Create a new auth token for a device
 */
function createAuthToken(string $deviceId, string $ip): string
{
    $config = require __DIR__ . '/config.php';

    $issuedAt = time();
    $expiresAt = $issuedAt + ($config['api']['token_lifetime'] ?? 86400);

    $payload = [
        'iss' => 'iss-skydning-sync-api',
        'sub' => 'laptop-sync',
        'iat' => $issuedAt,
        'exp' => $expiresAt,
        'device_id' => $deviceId,
        'ip' => $ip,
    ];

    return generateJwt($payload, $config['api']['jwt_secret']);
}
