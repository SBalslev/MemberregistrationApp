# PHP API Layer - Technical Design

**Created:** 2026-01-27
**Last Updated:** 2026-01-27
**Status:** Draft
**Security Review:** v0.2 - Enhanced security measures added

---

## 1. Overview

Since direct MySQL access is blocked (port 3306 closed), we need a PHP API layer deployed to the web hosting that acts as a bridge between the laptop app and the MySQL database.

```
Laptop App  ──HTTPS──►  PHP API  ──localhost──►  MySQL
            (443)        (iss-skydning.dk)        (3306)
```

---

## 2. API Structure

```
https://iss-skydning.dk/api/
├── index.php               # Router / entry point
├── config.php              # Database config (excluded from git)
├── auth.php                # Authentication helpers
├── v1/
│   ├── connect.php         # Test connection + get schema version
│   ├── sync/
│   │   ├── push.php        # Receive data from laptop
│   │   ├── pull.php        # Send data to laptop
│   │   └── status.php      # Get sync status
│   ├── members/
│   │   ├── list.php        # GET all members (paginated)
│   │   └── photo.php       # GET/POST member photos
│   └── schema/
│       └── version.php     # GET schema version
└── .htaccess               # URL rewriting + security
```

---

## 3. Authentication

### 3.1 Token-Based Auth Flow

```
1. Laptop sends POST /api/v1/auth/token
   Body: { "password": "user-entered-password" }

2. API validates password against stored hash

3. On success, returns JWT token:
   { "token": "eyJ...", "expiresAt": "2026-01-28T12:00:00Z" }

4. Laptop includes token in subsequent requests:
   Header: Authorization: Bearer <token>

5. Token expires after 24 hours, laptop must re-authenticate
```

### 3.2 Password Storage

The API password is **not** the MySQL password. It's a separate sync API password:

```php
// config.php (not in git, chmod 600)
<?php
return [
    'db' => [
        'host' => 'localhost',
        'name' => 'iss_skydning_dkisssportsskytter',
        'user' => 'iss_skydning_dkisssportsskytter',
        'pass' => getenv('DB_PASSWORD'),  // From hosting environment
    ],
    'api' => [
        'password_hash' => '$2y$12$...',  // bcrypt hash (cost 12) of API password
        'jwt_secret' => getenv('JWT_SECRET'),  // Min 32 chars, generate with: openssl rand -base64 32
    ],
    'security' => [
        // Login lockout: 5 failed attempts = 15 min lockout
        'max_login_attempts' => 5,
        'lockout_duration_minutes' => 15,

        // IP allowlist (empty = allow all, or list specific IPs/ranges)
        'ip_allowlist' => [
            // '192.168.1.0/24',
            // '203.0.113.50',
        ],

        // Rate limiting
        'rate_limit_requests' => 60,      // requests per minute
        'rate_limit_window_seconds' => 60,
    ],
];
```

### 3.4 JWT Secret Requirements

Generate a strong JWT secret (minimum 32 characters):

```bash
# Generate secure secret
openssl rand -base64 32

# Example output (use your own, never this one):
# K7gNU3sdo+OL0wNhqoVWhr3g6s1xYv72ol/pe/Unols=
```

**Never use:**
- Simple passwords like "secret123"
- The same password as the API password
- Anything shorter than 32 characters

### 3.3 JWT Token Structure

```json
{
  "iss": "iss-skydning-sync-api",
  "sub": "laptop-sync",
  "iat": 1706356800,
  "exp": 1706443200,
  "device_id": "laptop-uuid-here"
}
```

---

## 4. API Endpoints

### 4.1 Authentication

#### POST /api/v1/auth/token

Request:
```json
{
  "password": "user-entered-password",
  "device_id": "laptop-uuid"
}
```

Response (200):
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_at": "2026-01-28T12:00:00Z"
}
```

Response (401):
```json
{
  "error": "Invalid password",
  "code": "AUTH_FAILED"
}
```

---

### 4.2 Schema Version

#### GET /api/v1/schema/version

Response (200):
```json
{
  "major": 1,
  "minor": 0,
  "patch": 0,
  "description": "Initial schema"
}
```

---

### 4.3 Sync Push

#### POST /api/v1/sync/push

Receives data from laptop, stores in database.

Request:
```json
{
  "device_id": "laptop-uuid",
  "batch_id": "uuid-for-idempotency",
  "schema_version": "1.0.0",
  "entities": {
    "members": [
      {
        "internal_id": "uuid",
        "membership_id": "123",
        "first_name": "John",
        "last_name": "Doe",
        "modified_at_utc": "2026-01-27T10:30:00Z",
        "sync_version": 5,
        "_action": "upsert"  // or "delete"
      }
    ],
    "check_ins": [...],
    "practice_sessions": [...],
    "finance_transactions": [...]
  }
}
```

Response (200):
```json
{
  "success": true,
  "processed": {
    "members": { "inserted": 2, "updated": 5, "deleted": 0 },
    "check_ins": { "inserted": 10, "updated": 0, "deleted": 0 }
  },
  "conflicts": [],
  "server_time": "2026-01-27T10:31:00Z"
}
```

Response (409 - Conflict):
```json
{
  "success": false,
  "error": "Version conflict",
  "conflicts": [
    {
      "entity": "members",
      "internal_id": "uuid",
      "local_version": 5,
      "server_version": 6,
      "server_modified_at": "2026-01-27T10:29:00Z"
    }
  ]
}
```

---

### 4.4 Sync Pull

#### GET /api/v1/sync/pull

Retrieves changes from database since last sync.

Request:
```
GET /api/v1/sync/pull?since=2026-01-26T00:00:00Z&entities=members,check_ins&limit=100
```

Response (200):
```json
{
  "has_more": true,
  "next_cursor": "2026-01-27T10:00:00Z",
  "server_time": "2026-01-27T10:31:00Z",
  "entities": {
    "members": [
      {
        "internal_id": "uuid",
        "membership_id": "123",
        "first_name": "John",
        "modified_at_utc": "2026-01-27T10:30:00Z",
        "sync_version": 6,
        "_deleted": false
      }
    ],
    "deleted": {
      "members": ["uuid-1", "uuid-2"]
    }
  }
}
```

---

### 4.5 Photo Upload

#### POST /api/v1/members/{id}/photo

Request (multipart/form-data):
```
Content-Type: multipart/form-data
--boundary
Content-Disposition: form-data; name="photo"; filename="photo.jpg"
Content-Type: image/jpeg

<binary data>
--boundary
Content-Disposition: form-data; name="content_hash"

sha256-hash-here
--boundary--
```

Response (200):
```json
{
  "success": true,
  "photo_id": "uuid",
  "size_bytes": 245000
}
```

Response (409 - Already exists):
```json
{
  "success": true,
  "photo_id": "existing-uuid",
  "message": "Photo with same hash already exists"
}
```

---

### 4.6 Photo Download

#### GET /api/v1/members/{id}/photo

Response: Binary image data with appropriate Content-Type header.

---

### 4.7 Sync Status

#### GET /api/v1/sync/status

Response (200):
```json
{
  "connected": true,
  "schema_version": "1.0.0",
  "last_sync": {
    "device_id": "laptop-uuid",
    "timestamp": "2026-01-27T10:30:00Z",
    "entities_pushed": 15,
    "entities_pulled": 3
  },
  "pending_deletes": 0,
  "server_time": "2026-01-27T10:31:00Z"
}
```

---

## 5. PHP Implementation

### 5.1 Entry Point (index.php)

```php
<?php
declare(strict_types=1);

require_once __DIR__ . '/vendor/autoload.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/security.php';

$config = require __DIR__ . '/config.php';

// Security headers (always set first)
header('Content-Type: application/json');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('X-XSS-Protection: 1; mode=block');
header('Referrer-Policy: strict-origin-when-cross-origin');

// NO CORS headers - Electron apps don't need CORS
// If you need CORS for testing, use specific origin:
// header('Access-Control-Allow-Origin: https://specific-trusted-domain.com');

// Handle preflight (shouldn't happen without CORS, but be safe)
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Get client IP (handle proxies)
$clientIp = getClientIp();

// 1. IP Allowlist check (if configured)
if (!checkIpAllowlist($clientIp, $config['security']['ip_allowlist'] ?? [])) {
    logSecurityEvent('ip_blocked', $clientIp, 'IP not in allowlist');
    http_response_code(403);
    echo json_encode(['error' => 'Access denied']);
    exit;
}

// 2. Rate limiting check
if (!checkRateLimit($clientIp, $config['security'])) {
    logSecurityEvent('rate_limited', $clientIp, 'Too many requests');
    http_response_code(429);
    echo json_encode(['error' => 'Too many requests. Please wait.']);
    exit;
}

// Parse request
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$uri = str_replace('/api/v1', '', $uri);
$method = $_SERVER['REQUEST_METHOD'];

// Route matching
$routes = [
    'POST /auth/token' => 'handleAuthToken',
    'GET /schema/version' => 'handleSchemaVersion',
    'POST /sync/push' => 'handleSyncPush',
    'GET /sync/pull' => 'handleSyncPull',
    'GET /sync/status' => 'handleSyncStatus',
    'POST /members/{id}/photo' => 'handlePhotoUpload',
    'GET /members/{id}/photo' => 'handlePhotoDownload',
];

// Find matching route and execute
$handler = matchRoute($method, $uri, $routes);
if ($handler) {
    // Auth check (except for /auth/token)
    if ($handler !== 'handleAuthToken') {
        $token = getBearerToken();
        if (!validateToken($token)) {
            logSecurityEvent('auth_failed', $clientIp, 'Invalid or expired token');
            http_response_code(401);
            echo json_encode(['error' => 'Unauthorized']);
            exit;
        }
    }

    // Log successful API access
    logApiAccess($clientIp, $method, $uri, getDeviceIdFromToken());

    $handler();
} else {
    http_response_code(404);
    echo json_encode(['error' => 'Not found']);
}
```

### 5.2 Database Connection

```php
<?php
// db.php

function getDbConnection(): PDO {
    static $pdo = null;

    if ($pdo === null) {
        $config = require __DIR__ . '/config.php';
        $dsn = sprintf(
            'mysql:host=%s;dbname=%s;charset=utf8mb4',
            $config['db']['host'],
            $config['db']['name']
        );

        $pdo = new PDO($dsn, $config['db']['user'], $config['db']['pass'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    }

    return $pdo;
}
```

### 5.3 Sync Push Handler

```php
<?php
// handlers/sync_push.php

function handleSyncPush(): void {
    $input = json_decode(file_get_contents('php://input'), true);

    if (!$input || !isset($input['batch_id'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid request']);
        return;
    }

    $pdo = getDbConnection();

    // Idempotency check
    if (isBatchProcessed($pdo, $input['batch_id'])) {
        echo json_encode(['success' => true, 'message' => 'Already processed']);
        return;
    }

    $result = [
        'success' => true,
        'processed' => [],
        'conflicts' => [],
    ];

    $pdo->beginTransaction();

    try {
        // Process each entity type
        if (isset($input['entities']['members'])) {
            $result['processed']['members'] = processMembersPush(
                $pdo,
                $input['entities']['members'],
                $input['device_id']
            );
        }

        if (isset($input['entities']['check_ins'])) {
            $result['processed']['check_ins'] = processCheckInsPush(
                $pdo,
                $input['entities']['check_ins']
            );
        }

        // ... other entity types

        // Record batch as processed
        recordProcessedBatch($pdo, $input['batch_id'], $input['device_id']);

        $pdo->commit();

    } catch (ConflictException $e) {
        $pdo->rollBack();
        $result['success'] = false;
        $result['conflicts'] = $e->getConflicts();
        http_response_code(409);

    } catch (Exception $e) {
        $pdo->rollBack();
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
        return;
    }

    $result['server_time'] = gmdate('Y-m-d\TH:i:s\Z');
    echo json_encode($result);
}

function processMembersPush(PDO $pdo, array $members, string $deviceId): array {
    $stats = ['inserted' => 0, 'updated' => 0, 'deleted' => 0];

    foreach ($members as $member) {
        $action = $member['_action'] ?? 'upsert';

        if ($action === 'delete') {
            $stmt = $pdo->prepare('DELETE FROM members WHERE internal_id = ?');
            $stmt->execute([$member['internal_id']]);
            $stats['deleted']++;
            continue;
        }

        // Check for conflict (last-edit-wins)
        $existing = $pdo->prepare(
            'SELECT sync_version, modified_at_utc FROM members WHERE internal_id = ?'
        );
        $existing->execute([$member['internal_id']]);
        $row = $existing->fetch();

        if ($row) {
            // Compare timestamps - last edit wins
            $serverTime = strtotime($row['modified_at_utc']);
            $clientTime = strtotime($member['modified_at_utc']);

            if ($clientTime <= $serverTime) {
                // Server is newer or same, skip this update
                continue;
            }

            // Client is newer, update
            updateMember($pdo, $member, $deviceId);
            $stats['updated']++;
        } else {
            // New record
            insertMember($pdo, $member, $deviceId);
            $stats['inserted']++;
        }
    }

    return $stats;
}
```

### 5.4 Sync Pull Handler

```php
<?php
// handlers/sync_pull.php

function handleSyncPull(): void {
    $since = $_GET['since'] ?? '1970-01-01T00:00:00Z';
    $entities = isset($_GET['entities']) ? explode(',', $_GET['entities']) : ['members'];
    $limit = min((int)($_GET['limit'] ?? 100), 500);

    $pdo = getDbConnection();
    $result = [
        'has_more' => false,
        'next_cursor' => null,
        'server_time' => gmdate('Y-m-d\TH:i:s\Z'),
        'entities' => [],
        'deleted' => [],
    ];

    foreach ($entities as $entity) {
        switch ($entity) {
            case 'members':
                $data = pullMembers($pdo, $since, $limit);
                $result['entities']['members'] = $data['records'];
                $result['deleted']['members'] = $data['deleted'];
                if (count($data['records']) >= $limit) {
                    $result['has_more'] = true;
                    $lastRecord = end($data['records']);
                    $result['next_cursor'] = $lastRecord['modified_at_utc'];
                }
                break;

            case 'check_ins':
                $result['entities']['check_ins'] = pullCheckIns($pdo, $since, $limit);
                break;

            // ... other entity types
        }
    }

    echo json_encode($result);
}

function pullMembers(PDO $pdo, string $since, int $limit): array {
    // Get modified/new records
    $stmt = $pdo->prepare(
        'SELECT * FROM members
         WHERE modified_at_utc > ?
         ORDER BY modified_at_utc ASC
         LIMIT ?'
    );
    $stmt->execute([$since, $limit]);
    $records = $stmt->fetchAll();

    // Get deleted records from deletion log
    $stmt = $pdo->prepare(
        'SELECT entity_id FROM _deletion_log
         WHERE entity_type = ? AND deleted_at_utc > ?'
    );
    $stmt->execute(['members', $since]);
    $deleted = array_column($stmt->fetchAll(), 'entity_id');

    return ['records' => $records, 'deleted' => $deleted];
}
```

---

## 6. Security Implementation

### 6.1 .htaccess

```apache
# Deny access to sensitive files
<FilesMatch "\.(php|ini|log|sh|sql)$">
    # Allow index.php and handler files
</FilesMatch>

<Files "config.php">
    Require all denied
</Files>

<Files "security.php">
    Require all denied
</Files>

<Files "*.log">
    Require all denied
</Files>

# Force HTTPS
RewriteEngine On
RewriteCond %{HTTPS} off
RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]

# URL rewriting for clean URLs
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^api/(.*)$ api/index.php [QSA,L]

# Prevent directory listing
Options -Indexes

# Security headers
Header always set X-Content-Type-Options "nosniff"
Header always set X-Frame-Options "DENY"
Header always set X-XSS-Protection "1; mode=block"
Header always set Referrer-Policy "strict-origin-when-cross-origin"
Header always set Content-Security-Policy "default-src 'none'; frame-ancestors 'none'"

# Limit request body size (10MB max for photo uploads)
LimitRequestBody 10485760
```

### 6.2 Security Functions (security.php)

```php
<?php
// security.php - Security helper functions

/**
 * Get real client IP (handles proxies)
 */
function getClientIp(): string {
    // Check for proxy headers (only trust if you're behind a known proxy)
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
function checkIpAllowlist(string $ip, array $allowlist): bool {
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
function ipInCidr(string $ip, string $cidr): bool {
    list($subnet, $bits) = explode('/', $cidr);
    $ip = ip2long($ip);
    $subnet = ip2long($subnet);
    $mask = -1 << (32 - (int)$bits);
    return ($ip & $mask) === ($subnet & $mask);
}

/**
 * Rate limiting with configurable window
 */
function checkRateLimit(string $clientIp, array $config): bool {
    $pdo = getDbConnection();
    $limit = $config['rate_limit_requests'] ?? 60;
    $window = $config['rate_limit_window_seconds'] ?? 60;

    // Clean old entries
    $pdo->exec("DELETE FROM _rate_limits WHERE created_at < NOW() - INTERVAL {$window} SECOND");

    // Count recent requests
    $stmt = $pdo->prepare(
        "SELECT COUNT(*) FROM _rate_limits
         WHERE ip = ? AND created_at > NOW() - INTERVAL ? SECOND"
    );
    $stmt->execute([$clientIp, $window]);
    $count = (int)$stmt->fetchColumn();

    if ($count >= $limit) {
        return false;
    }

    // Record this request
    $stmt = $pdo->prepare("INSERT INTO _rate_limits (ip, created_at) VALUES (?, NOW())");
    $stmt->execute([$clientIp]);

    return true;
}

/**
 * Check login attempts and enforce lockout
 */
function checkLoginLockout(string $identifier, array $config): array {
    $pdo = getDbConnection();
    $maxAttempts = $config['max_login_attempts'] ?? 5;
    $lockoutMinutes = $config['lockout_duration_minutes'] ?? 15;

    // Check for active lockout
    $stmt = $pdo->prepare(
        "SELECT COUNT(*) FROM _login_attempts
         WHERE identifier = ?
         AND success = 0
         AND attempted_at > NOW() - INTERVAL ? MINUTE"
    );
    $stmt->execute([$identifier, $lockoutMinutes]);
    $failedAttempts = (int)$stmt->fetchColumn();

    if ($failedAttempts >= $maxAttempts) {
        // Calculate remaining lockout time
        $stmt = $pdo->prepare(
            "SELECT MAX(attempted_at) FROM _login_attempts
             WHERE identifier = ? AND success = 0"
        );
        $stmt->execute([$identifier]);
        $lastAttempt = $stmt->fetchColumn();
        $lockoutEnds = strtotime($lastAttempt) + ($lockoutMinutes * 60);
        $remainingSeconds = $lockoutEnds - time();

        return [
            'locked' => true,
            'remaining_seconds' => max(0, $remainingSeconds),
            'message' => "Too many failed attempts. Try again in " . ceil($remainingSeconds / 60) . " minutes."
        ];
    }

    return ['locked' => false, 'attempts_remaining' => $maxAttempts - $failedAttempts];
}

/**
 * Record login attempt
 */
function recordLoginAttempt(string $identifier, bool $success, string $ip): void {
    $pdo = getDbConnection();

    $stmt = $pdo->prepare(
        "INSERT INTO _login_attempts (identifier, ip, success, attempted_at)
         VALUES (?, ?, ?, NOW())"
    );
    $stmt->execute([$identifier, $ip, $success ? 1 : 0]);

    // If successful, clear previous failed attempts
    if ($success) {
        $stmt = $pdo->prepare(
            "DELETE FROM _login_attempts WHERE identifier = ? AND success = 0"
        );
        $stmt->execute([$identifier]);
    }
}

/**
 * Log security events (failed auth, blocked IPs, etc.)
 */
function logSecurityEvent(string $eventType, string $ip, string $details = ''): void {
    $pdo = getDbConnection();

    $stmt = $pdo->prepare(
        "INSERT INTO _security_log (event_type, ip, details, created_at)
         VALUES (?, ?, ?, NOW())"
    );
    $stmt->execute([$eventType, $ip, $details]);

    // Also log to file for immediate access
    $logLine = sprintf(
        "[%s] %s | IP: %s | %s\n",
        date('Y-m-d H:i:s'),
        $eventType,
        $ip,
        $details
    );
    error_log($logLine, 3, __DIR__ . '/logs/security.log');
}

/**
 * Log API access for audit trail
 */
function logApiAccess(string $ip, string $method, string $uri, ?string $deviceId): void {
    $pdo = getDbConnection();

    $stmt = $pdo->prepare(
        "INSERT INTO _api_access_log (ip, method, uri, device_id, created_at)
         VALUES (?, ?, ?, ?, NOW())"
    );
    $stmt->execute([$ip, $method, $uri, $deviceId]);
}

/**
 * Validate and sanitize input
 */
function validateInput(array $input, array $rules): array {
    $errors = [];
    $sanitized = [];

    foreach ($rules as $field => $rule) {
        $value = $input[$field] ?? null;

        // Required check
        if (($rule['required'] ?? false) && ($value === null || $value === '')) {
            $errors[$field] = "Field '{$field}' is required";
            continue;
        }

        if ($value === null) {
            $sanitized[$field] = null;
            continue;
        }

        // Type validation
        switch ($rule['type'] ?? 'string') {
            case 'string':
                $value = trim((string)$value);
                $maxLen = $rule['max_length'] ?? 255;
                if (strlen($value) > $maxLen) {
                    $errors[$field] = "Field '{$field}' exceeds maximum length of {$maxLen}";
                }
                break;

            case 'email':
                $value = filter_var($value, FILTER_VALIDATE_EMAIL);
                if ($value === false) {
                    $errors[$field] = "Field '{$field}' must be a valid email";
                }
                break;

            case 'uuid':
                if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $value)) {
                    $errors[$field] = "Field '{$field}' must be a valid UUID";
                }
                break;

            case 'int':
                $value = filter_var($value, FILTER_VALIDATE_INT);
                if ($value === false) {
                    $errors[$field] = "Field '{$field}' must be an integer";
                }
                break;

            case 'datetime':
                $dt = DateTime::createFromFormat('Y-m-d\TH:i:s\Z', $value);
                if (!$dt) {
                    $errors[$field] = "Field '{$field}' must be ISO 8601 datetime";
                }
                break;
        }

        $sanitized[$field] = $value;
    }

    return ['valid' => empty($errors), 'errors' => $errors, 'data' => $sanitized];
}
```

### 6.3 Updated Auth Handler with Lockout

```php
<?php
// handlers/auth.php

function handleAuthToken(): void {
    global $config;

    $input = json_decode(file_get_contents('php://input'), true);
    $clientIp = getClientIp();

    // Validate input
    $validation = validateInput($input, [
        'password' => ['required' => true, 'type' => 'string', 'max_length' => 100],
        'device_id' => ['required' => true, 'type' => 'uuid'],
    ]);

    if (!$validation['valid']) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid request', 'details' => $validation['errors']]);
        return;
    }

    // Check lockout (use IP + device_id as identifier)
    $identifier = $clientIp . ':' . $validation['data']['device_id'];
    $lockout = checkLoginLockout($identifier, $config['security']);

    if ($lockout['locked']) {
        logSecurityEvent('login_locked', $clientIp, "Device: {$validation['data']['device_id']}");
        http_response_code(429);
        echo json_encode([
            'error' => $lockout['message'],
            'retry_after_seconds' => $lockout['remaining_seconds']
        ]);
        return;
    }

    // Verify password
    $passwordValid = password_verify(
        $validation['data']['password'],
        $config['api']['password_hash']
    );

    // Record attempt
    recordLoginAttempt($identifier, $passwordValid, $clientIp);

    if (!$passwordValid) {
        logSecurityEvent('login_failed', $clientIp, "Device: {$validation['data']['device_id']}");
        http_response_code(401);
        echo json_encode([
            'error' => 'Invalid password',
            'attempts_remaining' => $lockout['attempts_remaining'] - 1
        ]);
        return;
    }

    // Generate JWT token
    $issuedAt = time();
    $expiresAt = $issuedAt + (24 * 60 * 60);  // 24 hours

    $payload = [
        'iss' => 'iss-skydning-sync-api',
        'sub' => 'laptop-sync',
        'iat' => $issuedAt,
        'exp' => $expiresAt,
        'device_id' => $validation['data']['device_id'],
        'ip' => $clientIp,  // Bind token to IP for extra security
    ];

    $token = \Firebase\JWT\JWT::encode($payload, $config['api']['jwt_secret'], 'HS256');

    logSecurityEvent('login_success', $clientIp, "Device: {$validation['data']['device_id']}");

    echo json_encode([
        'token' => $token,
        'expires_at' => gmdate('Y-m-d\TH:i:s\Z', $expiresAt),
    ]);
}
```

### 6.4 Security Database Tables

```sql
-- Login attempts tracking (for lockout)
CREATE TABLE _login_attempts (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    identifier VARCHAR(100) NOT NULL,  -- IP:device_id
    ip VARCHAR(45) NOT NULL,
    success TINYINT(1) NOT NULL DEFAULT 0,
    attempted_at DATETIME NOT NULL,
    INDEX idx_identifier_time (identifier, attempted_at),
    INDEX idx_cleanup (attempted_at)
);

-- Rate limiting
CREATE TABLE _rate_limits (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    ip VARCHAR(45) NOT NULL,
    created_at DATETIME NOT NULL,
    INDEX idx_ip_time (ip, created_at),
    INDEX idx_cleanup (created_at)
);

-- Security event log
CREATE TABLE _security_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL,  -- login_failed, login_success, ip_blocked, rate_limited
    ip VARCHAR(45) NOT NULL,
    details TEXT,
    created_at DATETIME NOT NULL,
    INDEX idx_type_time (event_type, created_at),
    INDEX idx_ip (ip)
);

-- API access audit log
CREATE TABLE _api_access_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    ip VARCHAR(45) NOT NULL,
    method VARCHAR(10) NOT NULL,
    uri VARCHAR(255) NOT NULL,
    device_id VARCHAR(36),
    created_at DATETIME NOT NULL,
    INDEX idx_device_time (device_id, created_at),
    INDEX idx_cleanup (created_at)
);

-- Cleanup old logs (run daily via cron or hosting scheduled task)
-- DELETE FROM _login_attempts WHERE attempted_at < NOW() - INTERVAL 7 DAY;
-- DELETE FROM _rate_limits WHERE created_at < NOW() - INTERVAL 1 HOUR;
-- DELETE FROM _security_log WHERE created_at < NOW() - INTERVAL 90 DAY;
-- DELETE FROM _api_access_log WHERE created_at < NOW() - INTERVAL 30 DAY;
```

### 6.5 File Permissions

After deploying to hosting, set proper permissions:

```bash
# Config file - owner read only
chmod 600 config.php

# PHP files - owner read/execute
chmod 644 *.php
chmod 644 handlers/*.php

# Directories
chmod 755 .
chmod 755 handlers
chmod 755 vendor

# Logs directory (if using file logging)
mkdir -p logs
chmod 700 logs

# .htaccess
chmod 644 .htaccess
```

### 6.6 Security Checklist

Before going live, verify:

- [ ] `config.php` has chmod 600 and is denied via .htaccess
- [ ] JWT_SECRET is at least 32 random characters
- [ ] API password is strong (12+ chars, mixed case, numbers, symbols)
- [ ] Password hash uses bcrypt cost 12 or higher
- [ ] HTTPS is enforced (test with http:// URL)
- [ ] Rate limiting is working (test with rapid requests)
- [ ] Login lockout is working (test with 5 wrong passwords)
- [ ] Security logs are being written
- [ ] Old log entries are being cleaned up
- [ ] PHP error display is OFF in production
- [ ] PHP version is 8.1+ (older versions have vulnerabilities)

---

## 7. Deployment

### 7.1 Files to Deploy

```
/api/
├── index.php           # Main entry point with security checks
├── auth.php            # JWT helpers
├── db.php              # Database connection
├── security.php        # Security functions (lockout, rate limit, logging)
├── config.php          # Create manually, do NOT commit, chmod 600
├── handlers/
│   ├── auth.php        # Login with lockout
│   ├── sync_push.php
│   ├── sync_pull.php
│   └── ...
├── logs/               # Security logs, chmod 700
│   └── .htaccess       # Deny all access
├── .htaccess           # URL rewriting + security
└── vendor/             # Composer dependencies
    └── firebase/php-jwt/
```

**logs/.htaccess:**
```apache
Require all denied
```

### 7.2 Environment Setup

On hosting control panel:

1. **Create environment variables:**
   ```
   DB_PASSWORD=<mysql-password>
   JWT_SECRET=<run: openssl rand -base64 32>
   ```

2. **PHP Settings:**
   - Version: 8.1 or higher
   - Enable: PDO, PDO_MySQL, JSON
   - Disable: display_errors (production)
   - Set: error_log to writable path

3. **Generate API password hash:**
   ```bash
   # Use cost 12 for bcrypt
   php -r "echo password_hash('your-strong-api-password', PASSWORD_BCRYPT, ['cost' => 12]);"
   ```

### 7.3 Database Setup

Run these SQL commands via phpMyAdmin or MySQL client:

```sql
-- 1. Create application tables (members, check_ins, etc.)
-- See prd.md section 7 for full schema

-- 2. Create security tables
CREATE TABLE _login_attempts (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    identifier VARCHAR(100) NOT NULL,
    ip VARCHAR(45) NOT NULL,
    success TINYINT(1) NOT NULL DEFAULT 0,
    attempted_at DATETIME NOT NULL,
    INDEX idx_identifier_time (identifier, attempted_at)
);

CREATE TABLE _rate_limits (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    ip VARCHAR(45) NOT NULL,
    created_at DATETIME NOT NULL,
    INDEX idx_ip_time (ip, created_at)
);

CREATE TABLE _security_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL,
    ip VARCHAR(45) NOT NULL,
    details TEXT,
    created_at DATETIME NOT NULL,
    INDEX idx_type_time (event_type, created_at)
);

CREATE TABLE _api_access_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    ip VARCHAR(45) NOT NULL,
    method VARCHAR(10) NOT NULL,
    uri VARCHAR(255) NOT NULL,
    device_id VARCHAR(36),
    created_at DATETIME NOT NULL,
    INDEX idx_device_time (device_id, created_at)
);

-- 3. Create schema metadata
CREATE TABLE _schema_metadata (
    id INT PRIMARY KEY DEFAULT 1,
    major_version INT NOT NULL,
    minor_version INT NOT NULL,
    patch_version INT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    description VARCHAR(255)
);

INSERT INTO _schema_metadata (major_version, minor_version, patch_version, description)
VALUES (1, 0, 0, 'Initial schema');
```

### 7.4 Initial Deployment Steps

```bash
# 1. On local machine - prepare files
cd api
composer require firebase/php-jwt

# 2. Create config.php (DO NOT COMMIT)
cat > config.php << 'EOF'
<?php
return [
    'db' => [
        'host' => 'localhost',
        'name' => 'iss_skydning_dkisssportsskytter',
        'user' => 'iss_skydning_dkisssportsskytter',
        'pass' => getenv('DB_PASSWORD'),
    ],
    'api' => [
        'password_hash' => '$2y$12$YOUR_HASH_HERE',
        'jwt_secret' => getenv('JWT_SECRET'),
    ],
    'security' => [
        'max_login_attempts' => 5,
        'lockout_duration_minutes' => 15,
        'ip_allowlist' => [],  // Empty = allow all
        'rate_limit_requests' => 60,
        'rate_limit_window_seconds' => 60,
    ],
];
EOF

# 3. Upload via FTP/SFTP
# - Upload all files to /api/ folder
# - Create logs/ directory
# - Set permissions (see 6.5)

# 4. Test deployment
curl -X POST https://iss-skydning.dk/api/v1/auth/token \
  -H "Content-Type: application/json" \
  -d '{"password":"your-api-password","device_id":"test-uuid"}'
```

### 7.5 Scheduled Cleanup (Optional)

If your hosting supports cron jobs, add daily cleanup:

```bash
# Crontab entry (runs at 3 AM daily)
0 3 * * * php /path/to/api/cleanup.php
```

**cleanup.php:**
```php
<?php
require_once __DIR__ . '/db.php';
$pdo = getDbConnection();

// Clean old login attempts (keep 7 days)
$pdo->exec("DELETE FROM _login_attempts WHERE attempted_at < NOW() - INTERVAL 7 DAY");

// Clean rate limits (keep 1 hour)
$pdo->exec("DELETE FROM _rate_limits WHERE created_at < NOW() - INTERVAL 1 HOUR");

// Clean security log (keep 90 days)
$pdo->exec("DELETE FROM _security_log WHERE created_at < NOW() - INTERVAL 90 DAY");

// Clean access log (keep 30 days)
$pdo->exec("DELETE FROM _api_access_log WHERE created_at < NOW() - INTERVAL 30 DAY");

echo "Cleanup completed: " . date('Y-m-d H:i:s') . "\n";
```

---

## 8. Laptop App Changes

### 8.1 Replace MySQLService with ApiService

```typescript
// laptop/src/services/onlineApiService.ts

const API_BASE = 'https://iss-skydning.dk/api/v1';

class OnlineApiService {
  private token: string | null = null;
  private tokenExpiry: Date | null = null;

  async authenticate(password: string, deviceId: string): Promise<boolean> {
    const response = await fetch(`${API_BASE}/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, device_id: deviceId }),
    });

    if (!response.ok) return false;

    const data = await response.json();
    this.token = data.token;
    this.tokenExpiry = new Date(data.expires_at);
    return true;
  }

  async push(payload: SyncPayload): Promise<SyncResult> {
    return this.request('POST', '/sync/push', payload);
  }

  async pull(since: string, entities: string[]): Promise<PullResult> {
    const params = new URLSearchParams({
      since,
      entities: entities.join(','),
    });
    return this.request('GET', `/sync/pull?${params}`);
  }

  private async request<T>(method: string, path: string, body?: any): Promise<T> {
    if (!this.token || (this.tokenExpiry && new Date() > this.tokenExpiry)) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'API request failed');
    }

    return response.json();
  }
}
```

---

## 9. Testing

### 9.1 Manual API Test

```bash
# Test auth
curl -X POST https://iss-skydning.dk/api/v1/auth/token \
  -H "Content-Type: application/json" \
  -d '{"password":"test","device_id":"test-device"}'

# Test schema version (with token)
curl https://iss-skydning.dk/api/v1/schema/version \
  -H "Authorization: Bearer <token>"

# Test push
curl -X POST https://iss-skydning.dk/api/v1/sync/push \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"batch_id":"test-1","device_id":"test","entities":{"members":[]}}'
```

---

## 10. Migration Path

1. **Deploy PHP API to hosting**
   - Upload files
   - Set permissions
   - Configure environment variables

2. **Create MySQL tables via phpMyAdmin**
   - Application tables (members, check_ins, etc.)
   - Security tables (_login_attempts, _rate_limits, etc.)
   - Schema metadata

3. **Verify security**
   - Test HTTPS enforcement
   - Test rate limiting
   - Test login lockout
   - Check security logs

4. **Update laptop app**
   - Replace MySQLService with ApiService
   - Update connection dialog for API password

5. **Test with empty database**
   - Authenticate
   - Push test data
   - Pull test data

6. **Perform initial sync from laptop with existing data**

---

## 11. Security Summary

| Threat | Mitigation | Status |
|--------|------------|--------|
| Brute force password | Login lockout (5 attempts → 15 min) | Implemented |
| Password in source code | Environment variable + OS keychain | Implemented |
| SQL injection | Prepared statements everywhere | Implemented |
| Unauthorized access | JWT tokens (24h expiry) | Implemented |
| DDoS / abuse | Rate limiting (60 req/min) | Implemented |
| Man-in-the-middle | HTTPS enforced | Implemented |
| Token theft | Token bound to IP (optional) | Implemented |
| Audit trail | API access logging | Implemented |
| Config file exposure | .htaccess deny + chmod 600 | Implemented |
| Directory traversal | Clean URL routing | Implemented |
| XSS | JSON-only responses, security headers | Implemented |
| CORS abuse | No CORS headers (Electron doesn't need) | Implemented |

---

## 12. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-01-27 | sbalslev | Initial PHP API design |
| 0.2 | 2026-01-27 | sbalslev | Enhanced security: login lockout, IP allowlist, audit logging, input validation, removed wide-open CORS |
