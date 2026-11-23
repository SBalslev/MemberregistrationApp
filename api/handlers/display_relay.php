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
    header("Content-Security-Policy: default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; form-action 'none'; base-uri 'none'");
    header('Referrer-Policy: no-referrer');
    header('Cache-Control: no-store');

    echo <<<'HTML'
<!doctype html>
<html lang="da">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <script>
    (() => {
      const param = new URLSearchParams(window.location.search).get("clawpilotTheme");
      const theme =
        param || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      document.documentElement.setAttribute("data-theme", theme);
    })();
  </script>
  <title>Del et foto med klubben</title>
  <style>
    :root {
      color-scheme: light;
      --cp-bg: #f7f4ef;
      --cp-bg-elevated: #fcfbf8;
      --cp-surface: #ffffff;
      --cp-surface-soft: #f5f5f5;
      --cp-border: #dedede;
      --cp-border-strong: #919191;
      --cp-text: #242424;
      --cp-text-muted: #5c5c5c;
      --cp-text-soft: #6f6f6f;
      --cp-accent: #b11f4b;
      --cp-accent-hover: #9a1a41;
      --cp-accent-soft: rgba(177, 31, 75, 0.08);
      --cp-accent-fg: #ffffff;
      --cp-success: #16a34a;
      --cp-danger: #dc2626;
      --cp-warning: #f59e0b;
      --cp-link: #0078d4;
      --cp-shadow: 0 18px 48px rgba(0, 0, 0, 0.12);
      --cp-overlay: rgba(255, 255, 255, 0.8);
      --cp-panel: rgba(255, 255, 255, 0.86);
      --cp-panel-strong: rgba(255, 255, 255, 0.96);
      --cp-sheen: rgba(255, 255, 255, 0.55);
      --cp-highlight: rgba(177, 31, 75, 0.12);
    }
    html[data-theme="dark"] {
      color-scheme: dark;
      --cp-bg: #3d3b3a;
      --cp-bg-elevated: #343231;
      --cp-surface: #292929;
      --cp-surface-soft: #2e2e2e;
      --cp-border: #474747;
      --cp-border-strong: #5f5f5f;
      --cp-text: #dedede;
      --cp-text-muted: #919191;
      --cp-text-soft: #b0b0b0;
      --cp-accent: #fd8ea1;
      --cp-accent-hover: #fb7b91;
      --cp-accent-soft: rgba(253, 142, 161, 0.14);
      --cp-accent-fg: #1a1a1a;
      --cp-success: #4ade80;
      --cp-danger: #f87171;
      --cp-warning: #fbbf24;
      --cp-link: #4da6ff;
      --cp-shadow: 0 18px 48px rgba(0, 0, 0, 0.32);
      --cp-overlay: rgba(41, 41, 41, 0.88);
      --cp-panel: rgba(41, 41, 41, 0.72);
      --cp-panel-strong: rgba(41, 41, 41, 0.96);
      --cp-sheen: rgba(255, 255, 255, 0.04);
      --cp-highlight: rgba(253, 142, 161, 0.12);
    }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: var(--cp-bg); color: var(--cp-text); font-family: "Segoe UI", Aptos, Calibri, -apple-system, BlinkMacSystemFont, sans-serif; }
    main { width: min(34rem, 100%); margin: 0 auto; padding: 2rem 1rem max(2rem, env(safe-area-inset-bottom)); }
    h1 { margin: 0 0 0.5rem; font-size: clamp(1.75rem, 7vw, 2.4rem); letter-spacing: 0; }
    p { color: var(--cp-text-muted); line-height: 1.5; }
    form { margin-top: 1.5rem; padding: 1.25rem; border: 1px solid var(--cp-border); border-radius: 16px; background: var(--cp-surface); }
    h2 { margin: 0 0 1rem; font-size: 1.1rem; }
    .choices { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
    button { min-height: 48px; padding: 0.875rem; border: 1px solid var(--cp-accent); border-radius: 0.625rem; background: var(--cp-accent); color: var(--cp-accent-fg); font: inherit; font-weight: 700; cursor: pointer; }
    button.secondary { border-color: var(--cp-border-strong); background: var(--cp-surface-soft); color: var(--cp-text); }
    button:not(:disabled):hover { background: var(--cp-accent-hover); color: var(--cp-accent-fg); }
    button:focus-visible { outline: 3px solid var(--cp-link); outline-offset: 3px; }
    button:disabled { opacity: 0.55; cursor: default; }
    .hint { font-size: 0.875rem; }
    #preview { display: block; width: 100%; max-height: 22rem; margin-top: 1rem; object-fit: contain; border-radius: 0.625rem; background: var(--cp-surface-soft); }
    #details { overflow-wrap: anywhere; }
    #remove { width: 100%; }
    #submit { width: 100%; margin-top: 1rem; }
    #message { min-height: 1.5rem; margin: 1rem 0 0; line-height: 1.5; overflow-wrap: anywhere; }
    [hidden] { display: none !important; }
    .success { color: var(--cp-success); }
    .error { color: var(--cp-danger); }
    @media (max-width: 350px) { .choices { grid-template-columns: 1fr; } form { padding: 1rem; } }
  </style>
</head>
<body>
  <main>
    <h1>Del et foto med klubben</h1>
    <p>Del et øjeblik fra klubben. Fotoet vises på klubskærmen i op til fire timer.</p>
    <form id="upload-form">
      <h2>1. Vælg dit foto</h2>
      <div class="choices">
        <button id="gallery" class="secondary" type="button">Vælg fra galleri</button>
        <button id="take-photo" class="secondary" type="button">Tag et foto</button>
      </div>
      <input id="photo" type="file" accept="image/*" hidden aria-label="Vælg fra galleri">
      <input id="camera" type="file" accept="image/*" capture="environment" hidden aria-label="Tag et foto">
      <p class="hint">JPEG, PNG eller WebP, højst 10 MB og 20 megapixel. HEIC/HEIF skal først gemmes som JPEG.</p>
      <img id="preview" alt="Forhåndsvisning af dit valgte foto" hidden>
      <p id="details" class="hint" hidden></p>
      <button id="remove" class="secondary" type="button" hidden>Fjern foto</button>
      <p class="hint">Del kun et foto, som alle på billedet er indforstået med at vise i klubben.</p>
      <button id="submit" type="submit" disabled>2. Send til skærmen</button>
      <p id="message" role="status" aria-live="polite" aria-atomic="true"></p>
    </form>
  </main>
  <script>
    const token = location.hash.slice(1);
    history.replaceState(null, "", location.pathname);
    const form = document.getElementById("upload-form");
    const photo = document.getElementById("photo");
    const camera = document.getElementById("camera");
    const gallery = document.getElementById("gallery");
    const takePhoto = document.getElementById("take-photo");
    const preview = document.getElementById("preview");
    const details = document.getElementById("details");
    const remove = document.getElementById("remove");
    const submit = document.getElementById("submit");
    const message = document.getElementById("message");
    let invitationValid = /^[a-f0-9]{64}$/.test(token);
    let selectedFile = null;
    let selectedContentType = "";
    let previewUrl = null;
    let ready = false;
    let busy = false;
    function showMessage(text, kind = "") {
      message.className = kind;
      message.textContent = text;
    }
    function updateControls() {
      gallery.disabled = takePhoto.disabled = remove.disabled = busy || !invitationValid;
      submit.disabled = busy || !invitationValid || !ready;
      form.setAttribute("aria-busy", String(busy));
    }
    function clearPhoto(resetInputs = true) {
      selectedFile = null;
      selectedContentType = "";
      ready = false;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = null;
      preview.removeAttribute("src");
      preview.hidden = details.hidden = remove.hidden = true;
      if (resetInputs) photo.value = camera.value = "";
      submit.textContent = "2. Send til skærmen";
      updateControls();
    }
    function selectPhoto(input) {
      const file = input.files[0];
      if (!file || busy || !invitationValid) return;
      clearPhoto(false);
      const extensionTypes = new Map([["jpg", "image/jpeg"], ["jpeg", "image/jpeg"], ["png", "image/png"], ["webp", "image/webp"]]);
      const contentType = ["image/jpeg", "image/png", "image/webp"].includes(file.type)
        ? file.type
        : (!file.type || file.type === "application/octet-stream" || file.type === "image/jpg")
          ? extensionTypes.get(file.name.split(".").pop().toLowerCase())
          : "";
      if (!contentType) {
        showMessage("Vælg et JPEG-, PNG- eller WebP-foto. Gem HEIC/HEIF som JPEG først.", "error");
        return;
      }
      if (!file.size || file.size > 10485760) {
        showMessage("Fotoet skal være mellem 1 byte og 10 MB. Vælg en mindre fil.", "error");
        return;
      }
      selectedFile = file;
      selectedContentType = contentType;
      previewUrl = URL.createObjectURL(file);
      details.hidden = remove.hidden = false;
      const size = file.size < 1048576
        ? `${Math.ceil(file.size / 1024)} KB`
        : `${(file.size / 1048576).toLocaleString("da-DK", { maximumFractionDigits: 1 })} MB`;
      details.textContent = `${file.name} · ${size}`;
      showMessage("Tjek fotoet, og send det til skærmen.");
      updateControls();
      loadPreview(file, previewUrl);
    }
    function loadPreview(file, url) {
      const image = new Image();
      const isCurrent = () => selectedFile === file && previewUrl === url;
      let triedDataUrl = false;
      image.onload = () => {
        if (!isCurrent()) return;
        if (image.naturalWidth * image.naturalHeight > 20000000) {
          clearPhoto();
          showMessage("Fotoet er for stort. Vælg et foto på højst 20 megapixel.", "error");
          return;
        }
        preview.src = image.src;
        preview.hidden = false;
        ready = true;
        updateControls();
      };
      image.onerror = () => {
        if (!isCurrent()) return;
        if (triedDataUrl) {
          ready = true;
          submit.textContent = "2. Send uden forhåndsvisning";
          showMessage("Forhåndsvisningen kunne ikke vises. Du kan stadig sende fotoet; skærmen kontrollerer filen.");
          updateControls();
          return;
        }
        triedDataUrl = true;
        const reader = new FileReader();
        reader.onload = () => {
          if (isCurrent()) image.src = reader.result;
        };
        reader.onerror = () => {
          if (isCurrent()) showMessage("Fotoet kunne ikke læses fra galleriet. Vælg det igen, eller prøv et andet foto.", "error");
        };
        reader.readAsDataURL(file);
      };
      image.src = url;
    }
    gallery.addEventListener("click", () => photo.click());
    takePhoto.addEventListener("click", () => camera.click());
    photo.addEventListener("change", () => selectPhoto(photo));
    camera.addEventListener("change", () => selectPhoto(camera));
    remove.addEventListener("click", () => {
      clearPhoto();
      showMessage("Fotoet er fjernet. Vælg et nyt foto.");
      gallery.focus();
    });
    updateControls();
    if (!invitationValid) {
      showMessage("QR-koden er ugyldig. Scan den igen fra klubskærmen.", "error");
    }
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (busy || submit.disabled || !invitationValid) return;
      const file = selectedFile;
      if (!file) {
        showMessage("Vælg først et foto.", "error");
        return;
      }
      busy = true;
      updateControls();
      showMessage("Sender foto. Vent et øjeblik...");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);
      try {
        const response = await fetch("./photos", {
          method: "POST",
          headers: {
            "Content-Type": selectedContentType,
            "X-Display-Upload-Token": token
          },
          body: file,
          signal: controller.signal
        });
        if (!response.ok) {
          if (response.status === 404) {
            invitationValid = false;
            throw new Error("QR-koden er udløbet. Scan den nye kode på klubskærmen.");
          }
          if (response.status === 413) throw new Error("Fotoet er for stort. Vælg en fil på højst 10 MB.");
          if (response.status === 429) throw new Error("Der er sendt for mange fotos. Prøv igen senere, eller scan en ny QR-kode.");
          throw new Error("Fotoet kunne ikke sendes. Prøv igen, eller vælg et andet foto.");
        }
        await response.json();
        clearPhoto();
        showMessage("Tak! Fotoet vises snart på klubskærmen. Du kan nu vælge et nyt foto.", "success");
      } catch (error) {
        showMessage(error.name === "AbortError"
          ? "Det tog for lang tid at sende fotoet. Tjek forbindelsen, og prøv igen."
          : error instanceof TypeError
            ? "Ingen forbindelse. Tjek internetforbindelsen, og prøv igen."
            : error.message, "error");
      } finally {
        clearTimeout(timeout);
        busy = false;
        updateControls();
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
