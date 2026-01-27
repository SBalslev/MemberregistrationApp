<?php
/**
 * Photo Upload/Download Handler
 */

declare(strict_types=1);

/**
 * Handle POST /photos
 * Upload a member photo
 */
function handlePhotoUpload(): void
{
    $config = require __DIR__ . '/../config.php';
    $authPayload = $GLOBALS['authPayload'] ?? null;
    $deviceId = $authPayload['device_id'] ?? 'unknown';

    // Check for file upload
    if (empty($_FILES['photo'])) {
        // Try JSON body with base64
        $input = json_decode(file_get_contents('php://input'), true);

        if (!$input || empty($input['photo_data'])) {
            errorResponse('No photo provided', 400);
        }

        // Validate input
        $validation = validateInput($input, [
            'internal_member_id' => ['required' => true, 'type' => 'uuid'],
            'content_hash' => ['required' => true, 'type' => 'string', 'max_length' => 64],
            'photo_type' => ['type' => 'enum', 'values' => ['registration', 'profile']],
        ]);

        if (!$validation['valid']) {
            errorResponse('Invalid request', 400, ['details' => $validation['errors']]);
        }

        $memberId = $validation['data']['internal_member_id'];
        $contentHash = $validation['data']['content_hash'];
        $photoType = $validation['data']['photo_type'] ?? 'registration';

        // Decode base64
        $photoData = base64_decode($input['photo_data']);
        if ($photoData === false) {
            errorResponse('Invalid base64 photo data', 400);
        }

        processPhotoUpload($memberId, $photoData, $contentHash, $photoType, $deviceId, $config);
        return;
    }

    // Handle multipart form upload
    $file = $_FILES['photo'];

    if ($file['error'] !== UPLOAD_ERR_OK) {
        errorResponse('File upload error: ' . $file['error'], 400);
    }

    $maxSize = $config['sync']['max_photo_size'] ?? 16777216;
    if ($file['size'] > $maxSize) {
        errorResponse('Photo exceeds maximum size of ' . ($maxSize / 1024 / 1024) . 'MB', 400);
    }

    // Validate MIME type
    $allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mimeType = finfo_file($finfo, $file['tmp_name']);
    finfo_close($finfo);

    if (!in_array($mimeType, $allowedTypes)) {
        errorResponse('Invalid image type. Allowed: JPEG, PNG, GIF, WebP', 400);
    }

    $memberId = $_POST['internal_member_id'] ?? null;
    $contentHash = $_POST['content_hash'] ?? null;
    $photoType = $_POST['photo_type'] ?? 'registration';

    if (!$memberId || !preg_match('/^[0-9a-f-]{36}$/i', $memberId)) {
        errorResponse('Invalid member ID', 400);
    }

    $photoData = file_get_contents($file['tmp_name']);

    // Calculate hash if not provided
    if (!$contentHash) {
        $contentHash = hash('sha256', $photoData);
    }

    processPhotoUpload($memberId, $photoData, $contentHash, $photoType, $deviceId, $config);
}

/**
 * Process and store uploaded photo
 */
function processPhotoUpload(
    string $memberId,
    string $photoData,
    string $contentHash,
    string $photoType,
    string $deviceId,
    array $config
): void {
    // Check for duplicate by hash
    $existing = dbQueryOne(
        "SELECT id FROM member_photos WHERE internal_member_id = ? AND content_hash = ?",
        [$memberId, $contentHash]
    );

    if ($existing) {
        jsonResponse([
            'success' => true,
            'photo_id' => $existing['id'],
            'message' => 'Photo with same hash already exists',
            'duplicate' => true,
        ]);
        return;
    }

    // Get image dimensions
    $imageInfo = @getimagesizefromstring($photoData);
    $width = $imageInfo[0] ?? null;
    $height = $imageInfo[1] ?? null;
    $mimeType = $imageInfo['mime'] ?? 'image/jpeg';

    // Generate UUID for photo
    $photoId = generateUuid();

    // Insert photo record
    dbExecute(
        "INSERT INTO member_photos (id, internal_member_id, photo_type, content_hash, mime_type, file_size, width, height, photo_data, device_id, sync_version, created_at_utc, synced_at_utc)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())",
        [
            $photoId,
            $memberId,
            $photoType,
            $contentHash,
            $mimeType,
            strlen($photoData),
            $width,
            $height,
            $photoData,
            $deviceId,
        ]
    );

    jsonResponse([
        'success' => true,
        'photo_id' => $photoId,
        'size_bytes' => strlen($photoData),
        'width' => $width,
        'height' => $height,
    ]);
}

/**
 * Handle GET /photos/{id}
 * Download a photo
 */
function handlePhotoDownload(): void
{
    $routeParams = $GLOBALS['routeParams'] ?? [];
    $photoId = $routeParams['id'] ?? null;

    if (!$photoId) {
        errorResponse('Photo ID required', 400);
    }

    // Try by photo ID first
    $photo = dbQueryOne(
        "SELECT photo_data, mime_type, content_hash FROM member_photos WHERE id = ?",
        [$photoId]
    );

    // If not found, try by member ID (returns latest photo)
    if (!$photo) {
        $photo = dbQueryOne(
            "SELECT photo_data, mime_type, content_hash FROM member_photos
             WHERE internal_member_id = ?
             ORDER BY created_at_utc DESC
             LIMIT 1",
            [$photoId]
        );
    }

    if (!$photo) {
        errorResponse('Photo not found', 404);
    }

    // Set headers for image response
    header('Content-Type: ' . $photo['mime_type']);
    header('Content-Length: ' . strlen($photo['photo_data']));
    header('ETag: "' . $photo['content_hash'] . '"');
    header('Cache-Control: public, max-age=86400'); // Cache for 24 hours

    // Check If-None-Match for caching
    $clientEtag = $_SERVER['HTTP_IF_NONE_MATCH'] ?? '';
    if ($clientEtag === '"' . $photo['content_hash'] . '"') {
        http_response_code(304);
        exit;
    }

    echo $photo['photo_data'];
    exit;
}

/**
 * Generate a UUID v4
 */
function generateUuid(): string
{
    $data = random_bytes(16);
    $data[6] = chr(ord($data[6]) & 0x0f | 0x40);
    $data[8] = chr(ord($data[8]) & 0x3f | 0x80);

    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
}
