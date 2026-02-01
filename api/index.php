<?php
/**
 * ISS Skydning Sync API - Entry Point
 *
 * Routes all API requests and applies security checks.
 */

declare(strict_types=1);

// Error handling
error_reporting(E_ALL);
ini_set('display_errors', '0');
ini_set('log_errors', '1');

// Load dependencies
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/security.php';
require_once __DIR__ . '/auth.php';

// Load config
$config = require __DIR__ . '/config.php';

// Security headers
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('X-XSS-Protection: 1; mode=block');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('Cache-Control: no-store, no-cache, must-revalidate');

// Handle preflight requests (shouldn't happen without CORS, but be safe)
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Get client IP
$clientIp = getClientIp();

// 1. IP Allowlist check
if (!checkIpAllowlist($clientIp, $config['security']['ip_allowlist'] ?? [])) {
    logSecurityEvent('ip_blocked', $clientIp, 'IP not in allowlist');
    errorResponse('Access denied', 403);
}

// 2. Rate limiting check
if (!checkRateLimit($clientIp, $config['security'])) {
    logSecurityEvent('rate_limited', $clientIp, 'Too many requests');
    errorResponse('Too many requests. Please wait.', 429);
}

// Parse request
$requestUri = $_SERVER['REQUEST_URI'] ?? '/';
$uri = parse_url($requestUri, PHP_URL_PATH);

// Remove base path if present (e.g., /api/v1)
$basePath = '/api/v1';
if (strpos($uri, $basePath) === 0) {
    $uri = substr($uri, strlen($basePath));
}
if (empty($uri)) {
    $uri = '/';
}

$method = $_SERVER['REQUEST_METHOD'];

// Route definitions
$routes = [
    // Authentication
    'POST /auth/token' => 'handlers/auth.php:handleAuthToken',

    // Schema
    'GET /schema/version' => 'handlers/schema.php:handleSchemaVersion',

    // Sync
    'POST /sync/push' => 'handlers/sync_push.php:handleSyncPush',
    'GET /sync/pull' => 'handlers/sync_pull.php:handleSyncPull',
    'GET /sync/status' => 'handlers/sync_status.php:handleSyncStatus',

    // Photos
    'POST /photos' => 'handlers/photos.php:handlePhotoUpload',
    'GET /photos/{id}' => 'handlers/photos.php:handlePhotoDownload',

    // MinIdraet search
    'GET /minidraet/search' => 'handlers/minidraet_search.php:handleMinIdraetSearch',
    'POST /minidraet/search' => 'handlers/minidraet_search.php:handleMinIdraetSearch',

    // Health check
    'GET /health' => 'handleHealthCheck',
    'GET /' => 'handleHealthCheck',

    // Diagnostic (public, for deployment verification)
    'GET /diagnostic' => 'handlers/diagnostic.php:handleDiagnostic',
];

// Simple health check handler (inline)
function handleHealthCheck(): void
{
    jsonResponse([
        'status' => 'ok',
        'timestamp' => gmdate('Y-m-d\TH:i:s\Z'),
        'version' => '1.0.0',
    ]);
}

// Find matching route
$matchedRoute = null;
$routeParams = [];

foreach ($routes as $pattern => $handler) {
    list($routeMethod, $routePath) = explode(' ', $pattern, 2);

    if ($routeMethod !== $method) {
        continue;
    }

    // Convert route pattern to regex
    $regex = preg_replace('/\{([^}]+)\}/', '(?P<$1>[^/]+)', $routePath);
    $regex = '#^' . $regex . '$#';

    if (preg_match($regex, $uri, $matches)) {
        $matchedRoute = $handler;
        // Extract named parameters
        foreach ($matches as $key => $value) {
            if (is_string($key)) {
                $routeParams[$key] = $value;
            }
        }
        break;
    }
}

if (!$matchedRoute) {
    errorResponse('Not found', 404);
}

// Check authentication for protected routes
$publicRoutes = [
    'handleHealthCheck',
    'handlers/auth.php:handleAuthToken',
    'handlers/diagnostic.php:handleDiagnostic',
    'handlers/minidraet_search.php:handleMinIdraetSearch',
];
$isPublicRoute = in_array($matchedRoute, $publicRoutes, true);

if (!$isPublicRoute) {
    $token = getBearerToken();
    $tokenPayload = validateToken($token);

    if (!$tokenPayload) {
        logSecurityEvent('auth_failed', $clientIp, 'Invalid or expired token');
        errorResponse('Unauthorized', 401);
    }

    // Store token payload for handlers
    $GLOBALS['authPayload'] = $tokenPayload;

    // Log API access
    logApiAccess($clientIp, $method, $uri, $tokenPayload['device_id'] ?? null);
}

// Execute handler
if (is_callable($matchedRoute)) {
    // Inline function
    $matchedRoute();
} elseif (strpos($matchedRoute, ':') !== false) {
    // File:function format
    list($file, $function) = explode(':', $matchedRoute);
    $handlerFile = __DIR__ . '/' . $file;

    if (!file_exists($handlerFile)) {
        error_log("Handler file not found: $handlerFile");
        errorResponse('Internal server error', 500);
    }

    require_once $handlerFile;

    if (!function_exists($function)) {
        error_log("Handler function not found: $function");
        errorResponse('Internal server error', 500);
    }

    // Pass route params to handler
    $GLOBALS['routeParams'] = $routeParams;
    $function();
} else {
    errorResponse('Internal server error', 500);
}
