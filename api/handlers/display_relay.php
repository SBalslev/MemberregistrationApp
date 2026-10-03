<?php
/**
 * Internet photo relay for the common-room display.
 */

declare(strict_types=1);

const DISPLAY_RELAY_MAX_UPLOAD_BYTES = 10485760;
const DISPLAY_RELAY_MAX_IMAGE_PIXELS = 20000000;
const DISPLAY_RELAY_INVITATION_SECONDS = 3600;
const DISPLAY_RELAY_PHOTO_SECONDS = 14400;
const DISPLAY_RELAY_MAX_UPLOADS_PER_INVITATION = 20;
const DISPLAY_RELAY_MAX_UPLOADS_PER_IP = 5;

function handleDisplayRelayUploadPage(): void
{
    header('Content-Type: text/html; charset=utf-8');
    header("Content-Security-Policy: default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; form-action 'none'; base-uri 'none'");
    header('Referrer-Policy: no-referrer');
    header('Cache-Control: no-store');

    echo <<<'HTML'
<!doctype html>
<html lang="da">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Del et foto med klubben</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, sans-serif; }
    body { margin: 0; background: #f7f4ef; color: #242424; }
    main { width: min(32rem, calc(100% - 2rem)); margin: 8vh auto; padding: 2rem; border-radius: 1rem; background: white; box-shadow: 0 1rem 3rem #0002; }
    h1 { margin-top: 0; }
    label, button { display: block; width: 100%; }
    input { width: 100%; margin: 1rem 0; }
    button { border: 0; border-radius: .6rem; padding: .9rem; background: #b11f4b; color: white; font: inherit; font-weight: 700; }
    button:disabled { opacity: .55; }
    #status { min-height: 1.5rem; margin-top: 1rem; }
  </style>
</head>
<body>
  <main>
    <h1>Del et foto med klubben</h1>
    <p>Vælg et foto. Det vises på klubskærmen i op til fire timer.</p>
    <label for="photo">Foto</label>
    <input id="photo" type="file" accept="image/jpeg,image/png,image/webp" capture="environment">
    <button id="upload" type="button">Vis på klubskærmen</button>
    <p id="status" role="status"></p>
  </main>
  <script>
    const token = location.hash.slice(1);
    history.replaceState(null, "", location.pathname);
    const photo = document.getElementById("photo");
    const button = document.getElementById("upload");
    const status = document.getElementById("status");
    if (!token) {
      button.disabled = true;
      status.textContent = "QR-koden er ugyldig. Scan den igen fra klubskærmen.";
    }
    button.addEventListener("click", async () => {
      const file = photo.files[0];
      if (!file) {
        status.textContent = "Vælg først et foto.";
        return;
      }
      button.disabled = true;
      status.textContent = "Sender foto...";
      try {
        const response = await fetch("./photos", {
          method: "POST",
          headers: {
            "Content-Type": file.type,
            "X-Display-Upload-Token": token
          },
          body: file
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Upload mislykkedes");
        photo.value = "";
        status.textContent = "Tak! Fotoet vises snart på klubskærmen.";
      } catch (error) {
        status.textContent = error.message;
      } finally {
        button.disabled = false;
      }
    });
  </script>
</body>
</html>
HTML;
    exit;
}

function handleDisplayRelayCreateInvitation(): void
{
    $config = require __DIR__ . '/../config.php';
    requireDisplayRelayDevice($config);
    cleanupDisplayRelay();

    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    $displayId = trim((string)($input['display_id'] ?? ''));
    if (!preg_match('/^[A-Za-z0-9_-]{1,64}$/', $displayId)) {
        errorResponse('Invalid display_id', 400);
    }

    $token = bin2hex(random_bytes(32));
    $invitationId = bin2hex(random_bytes(16));
    $expiresAt = gmdate('Y-m-d H:i:s', time() + DISPLAY_RELAY_INVITATION_SECONDS);
    dbExecute(
        'INSERT INTO display_relay_invitations
         (id, token_hash, display_id, max_uploads, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())',
        [
            $invitationId,
            hash('sha256', $token),
            $displayId,
            DISPLAY_RELAY_MAX_UPLOADS_PER_INVITATION,
            $expiresAt,
        ]
    );

    $baseUrl = rtrim((string)($config['display_relay']['public_base_url'] ?? ''), '/');
    if (!str_starts_with($baseUrl, 'https://')) {
        errorResponse('Display relay public URL is not configured', 500);
    }

    jsonResponse([
        'upload_url' => $baseUrl . '/display-relay/upload#' . $token,
        'expires_at' => gmdate('c', strtotime($expiresAt . ' UTC')),
    ], 201);
}

function handleDisplayRelayPhotoUpload(): void
{
    cleanupDisplayRelay();
    $token = trim($_SERVER['HTTP_X_DISPLAY_UPLOAD_TOKEN'] ?? '');
    if (!preg_match('/^[a-f0-9]{64}$/', $token)) {
        errorResponse('Upload invitation is invalid or expired', 404);
    }

    $invitation = dbQueryOne(
        'SELECT id, display_id, max_uploads, upload_count
         FROM display_relay_invitations
         WHERE token_hash = ? AND expires_at > UTC_TIMESTAMP()
         LIMIT 1',
        [hash('sha256', $token)]
    );
    if (!$invitation) {
        errorResponse('Upload invitation is invalid or expired', 404);
    }
    if ((int)$invitation['upload_count'] >= (int)$invitation['max_uploads']) {
        errorResponse('Upload invitation has reached its limit', 429);
    }

    $clientIp = $GLOBALS['clientIp'] ?? '0.0.0.0';
    $contentLength = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($contentLength < 1 || $contentLength > DISPLAY_RELAY_MAX_UPLOAD_BYTES) {
        errorResponse('Photo must be between 1 byte and 10 MB', 413);
    }
    $body = file_get_contents('php://input', false, null, 0, DISPLAY_RELAY_MAX_UPLOAD_BYTES + 1);
    if ($body === false || strlen($body) !== $contentLength) {
        errorResponse('Photo upload was incomplete', 400);
    }

    $image = @getimagesizefromstring($body);
    $mimeType = $image['mime'] ?? '';
    $allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!in_array($mimeType, $allowedTypes, true)) {
        errorResponse('Only JPEG, PNG, and WebP photos are supported', 400);
    }
    $pixels = (int)$image[0] * (int)$image[1];
    if ($pixels < 1 || $pixels > DISPLAY_RELAY_MAX_IMAGE_PIXELS) {
        errorResponse('Photo dimensions are too large', 400);
    }

    $photoId = bin2hex(random_bytes(16));
    $expiresAt = gmdate('Y-m-d H:i:s', time() + DISPLAY_RELAY_PHOTO_SECONDS);
    dbBeginTransaction();
    try {
        dbExecute(
            'INSERT INTO display_relay_client_quotas
             (client_ip, window_started_at, upload_count)
             VALUES (?, UTC_TIMESTAMP(), 1)
             ON DUPLICATE KEY UPDATE
               upload_count = IF(
                 window_started_at <= UTC_TIMESTAMP() - INTERVAL 1 HOUR,
                 1,
                 upload_count + 1
               ),
               window_started_at = IF(
                 window_started_at <= UTC_TIMESTAMP() - INTERVAL 1 HOUR,
                 UTC_TIMESTAMP(),
                 window_started_at
               )',
            [$clientIp]
        );
        $clientQuota = dbQueryOne(
            'SELECT upload_count FROM display_relay_client_quotas WHERE client_ip = ? FOR UPDATE',
            [$clientIp]
        );
        if ((int)($clientQuota['upload_count'] ?? 0) > DISPLAY_RELAY_MAX_UPLOADS_PER_IP) {
            dbRollback();
            errorResponse('Upload limit reached. Try again later.', 429);
        }
        $updated = dbExecute(
            'UPDATE display_relay_invitations
             SET upload_count = upload_count + 1
             WHERE id = ? AND expires_at > UTC_TIMESTAMP() AND upload_count < max_uploads',
            [$invitation['id']]
        );
        if ($updated !== 1) {
            dbRollback();
            errorResponse('Upload invitation has reached its limit', 429);
        }
        dbExecute(
            'INSERT INTO display_relay_photos
                 (id, invitation_id, display_id, mime_type, file_size, image_data, client_ip, expires_at, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())',
            [
                $photoId,
                $invitation['id'],
                $invitation['display_id'],
                $mimeType,
                strlen($body),
                $body,
                $clientIp,
                $expiresAt,
            ]
        );
        dbCommit();
    } catch (Throwable $error) {
        dbRollback();
        throw $error;
    }

    jsonResponse(['accepted' => true, 'photo_id' => $photoId], 201);
}

function handleDisplayRelayNextPhoto(): void
{
    $config = require __DIR__ . '/../config.php';
    requireDisplayRelayDevice($config);
    cleanupDisplayRelay();
    $displayIdValue = $_GET['display_id'] ?? '';
    $displayId = is_string($displayIdValue) ? trim($displayIdValue) : '';
    if (!preg_match('/^[A-Za-z0-9_-]{1,64}$/', $displayId)) {
        errorResponse('Invalid display_id', 400);
    }

    $photo = dbQueryOne(
        "SELECT id, mime_type, file_size, expires_at
         FROM display_relay_photos
         WHERE display_id = ? AND status = 'queued' AND expires_at > UTC_TIMESTAMP()
         ORDER BY created_at ASC
         LIMIT 1",
        [$displayId]
    );
    jsonResponse(['photo' => $photo ?: null]);
}

function handleDisplayRelayPhotoDownload(): void
{
    $config = require __DIR__ . '/../config.php';
    requireDisplayRelayDevice($config);
    $photoId = displayRelayPhotoId();
    $photo = dbQueryOne(
        "SELECT image_data, mime_type
         FROM display_relay_photos
         WHERE id = ? AND status = 'queued' AND expires_at > UTC_TIMESTAMP()",
        [$photoId]
    );
    if (!$photo) {
        errorResponse('Photo not found', 404);
    }
    header('Content-Type: ' . $photo['mime_type']);
    header('Content-Length: ' . strlen($photo['image_data']));
    header('Cache-Control: no-store');
    echo $photo['image_data'];
    exit;
}

function handleDisplayRelayPhotoAck(): void
{
    $config = require __DIR__ . '/../config.php';
    requireDisplayRelayDevice($config);
    $photoId = displayRelayPhotoId();
    $updated = dbExecute(
        "UPDATE display_relay_photos
         SET status = 'delivered', delivered_at = UTC_TIMESTAMP(), image_data = ''
         WHERE id = ? AND status = 'queued'",
        [$photoId]
    );
    if ($updated !== 1) {
        errorResponse('Photo not found', 404);
    }
    jsonResponse(['acknowledged' => true]);
}

function handleDisplayRelayPhotoReject(): void
{
    $config = require __DIR__ . '/../config.php';
    requireDisplayRelayDevice($config);
    $photoId = displayRelayPhotoId();
    $updated = dbExecute(
        "UPDATE display_relay_photos
         SET status = 'expired', image_data = ''
         WHERE id = ? AND status = 'queued'",
        [$photoId]
    );
    if ($updated !== 1) {
        errorResponse('Photo not found', 404);
    }
    jsonResponse(['rejected' => true]);
}

function requireDisplayRelayDevice(array $config): void
{
    $expected = (string)($config['display_relay']['device_token'] ?? '');
    $provided = getBearerToken() ?? '';
    if (strlen($expected) < 32 || !hash_equals($expected, $provided)) {
        errorResponse('Unauthorized', 401);
    }
}

function cleanupDisplayRelay(): void
{
    dbExecute(
        "UPDATE display_relay_photos
         SET status = 'expired', image_data = ''
         WHERE status = 'queued' AND expires_at <= UTC_TIMESTAMP()"
    );
    dbExecute(
        "DELETE FROM display_relay_invitations
         WHERE expires_at < UTC_TIMESTAMP() - INTERVAL 4 HOUR"
    );
    dbExecute(
        "DELETE FROM display_relay_client_quotas
         WHERE window_started_at < UTC_TIMESTAMP() - INTERVAL 1 DAY"
    );
}

function displayRelayPhotoId(): string
{
    $photoId = $GLOBALS['routeParams']['id'] ?? '';
    if (!preg_match('/^[a-f0-9]{32}$/', $photoId)) {
        errorResponse('Invalid photo ID', 400);
    }
    return $photoId;
}
