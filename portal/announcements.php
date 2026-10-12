<?php
/**
 * Scheduled common-room display announcements for trainers and administrators.
 */

declare(strict_types=1);

require_once __DIR__ . '/includes/auth_guard.php';
requireRole('TRAINER');

const ANNOUNCEMENT_MAX_IMAGE_BYTES = 10485760;
const ANNOUNCEMENT_MAX_IMAGE_PIXELS = 20000000;
const ANNOUNCEMENT_MAX_IMAGE_WIDTH = 3840;
const ANNOUNCEMENT_MAX_IMAGE_HEIGHT = 2160;

$config = require __DIR__ . '/config.php';
$displayId = trim((string)($config['display']['id'] ?? 'club-display'));
if (!preg_match('/^[A-Za-z0-9_-]{1,64}$/', $displayId)) {
    throw new RuntimeException('Display ID is not configured correctly');
}

$db = portalDb();
$writer = portalWriterDb();
$errors = [];

if (isset($_GET['image'])) {
    $imageId = announcementId((string)$_GET['image']);
    $image = portalQueryOne(
        $db,
        'SELECT image_data, version
         FROM display_announcements
         WHERE id = ? AND display_id = ? AND image_data IS NOT NULL',
        [$imageId, $displayId]
    );
    if (!$image) {
        http_response_code(404);
        exit;
    }
    header('Content-Type: image/jpeg');
    header('Content-Length: ' . strlen($image['image_data']));
    header('Cache-Control: private, max-age=300');
    header('ETag: "' . (int)$image['version'] . '"');
    header('X-Content-Type-Options: nosniff');
    echo $image['image_data'];
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrfValidate();
    $action = (string)($_POST['action'] ?? '');
    try {
        if ($action === 'archive') {
            $id = announcementId((string)($_POST['id'] ?? ''));
            $updated = portalExecute(
                $writer,
                'UPDATE display_announcements
                 SET status = \'archived\', updated_by = ?, version = version + 1,
                     updated_at = UTC_TIMESTAMP()
                 WHERE id = ? AND display_id = ? AND status <> \'archived\'',
                [announcementActor(), $id, $displayId]
            );
            if ($updated !== 1) {
                throw new RuntimeException('Beskeden blev ikke fundet.');
            }
            logPortalAccess('DISPLAY_ANNOUNCEMENT_ARCHIVE');
            announcementRedirect('archived');
        }

        if ($action === 'remove_image') {
            $id = announcementId((string)($_POST['id'] ?? ''));
            $updated = portalExecute(
                $writer,
                'UPDATE display_announcements
                 SET image_mime = NULL, image_size = NULL, image_data = NULL,
                     updated_by = ?, version = version + 1, updated_at = UTC_TIMESTAMP()
                 WHERE id = ? AND display_id = ? AND status <> \'archived\'',
                [announcementActor(), $id, $displayId]
            );
            if ($updated !== 1) {
                throw new RuntimeException('Beskeden blev ikke fundet.');
            }
            logPortalAccess('DISPLAY_ANNOUNCEMENT_IMAGE_REMOVE');
            announcementRedirect('image_removed', $id);
        }

        if ($action === 'save') {
            $record = validateAnnouncementForm($_POST);
            $image = uploadedAnnouncementImage();
            $idValue = trim((string)($_POST['id'] ?? ''));
            $actor = announcementActor();
            if ($idValue === '') {
                $id = announcementUuid();
                portalExecute(
                    $writer,
                    'INSERT INTO display_announcements
                     (id, display_id, title, body, priority, status, starts_at, ends_at,
                      display_duration_seconds, image_mime, image_size, image_data,
                      created_by, updated_by, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())',
                    [
                        $id,
                        $displayId,
                        $record['title'],
                        $record['body'],
                        $record['priority'],
                        $record['status'],
                        $record['starts_at'],
                        $record['ends_at'],
                        $record['duration'],
                        $image === null ? null : 'image/jpeg',
                        $image === null ? null : strlen($image),
                        $image,
                        $actor,
                        $actor,
                    ]
                );
                logPortalAccess('DISPLAY_ANNOUNCEMENT_CREATE');
            } else {
                $id = announcementId($idValue);
                $version = filter_var(
                    $_POST['version'] ?? null,
                    FILTER_VALIDATE_INT,
                    ['options' => ['min_range' => 1]]
                );
                if ($version === false) {
                    throw new InvalidArgumentException('Ugyldig version. Genindlæs siden.');
                }
                $imageSql = '';
                $params = [
                    $record['title'],
                    $record['body'],
                    $record['priority'],
                    $record['status'],
                    $record['starts_at'],
                    $record['ends_at'],
                    $record['duration'],
                ];
                if ($image !== null) {
                    $imageSql = ', image_mime = ?, image_size = ?, image_data = ?';
                    array_push($params, 'image/jpeg', strlen($image), $image);
                }
                array_push($params, $actor, $id, $displayId, $version);
                $updated = portalExecute(
                    $writer,
                    'UPDATE display_announcements
                     SET title = ?, body = ?, priority = ?, status = ?, starts_at = ?,
                         ends_at = ?, display_duration_seconds = ?' . $imageSql . ',
                         updated_by = ?, version = version + 1, updated_at = UTC_TIMESTAMP()
                     WHERE id = ? AND display_id = ? AND version = ?
                       AND status <> \'archived\'',
                    $params
                );
                if ($updated !== 1) {
                    throw new RuntimeException(
                        'Beskeden blev ændret et andet sted. Genindlæs siden og prøv igen.'
                    );
                }
                logPortalAccess('DISPLAY_ANNOUNCEMENT_UPDATE');
            }
            announcementRedirect($record['status'] === 'published' ? 'published' : 'saved', $id);
        }

        throw new InvalidArgumentException('Ukendt handling.');
    } catch (InvalidArgumentException | RuntimeException $error) {
        $errors[] = $error->getMessage();
    } catch (Throwable $error) {
        error_log('announcements.php error: ' . $error->getMessage());
        $errors[] = 'Der opstod en teknisk fejl. Prøv igen senere.';
    }
}

$announcements = [];
$selected = null;
$dbError = null;
try {
    $announcements = portalQuery(
        $db,
        'SELECT id, title, body, priority, status, starts_at, ends_at,
                display_duration_seconds, image_mime, image_size, version,
                created_by, updated_by, created_at, updated_at
         FROM display_announcements
         WHERE display_id = ? AND status <> \'archived\'
         ORDER BY
           CASE status WHEN \'published\' THEN 0 ELSE 1 END,
           starts_at DESC',
        [$displayId]
    );
    $editId = trim((string)($_GET['edit'] ?? ''));
    if ($editId !== '') {
        $validEditId = announcementId($editId);
        foreach ($announcements as $announcement) {
            if ($announcement['id'] === $validEditId) {
                $selected = $announcement;
                break;
            }
        }
    }
} catch (Throwable $error) {
    error_log('announcements.php list error: ' . $error->getMessage());
    $dbError = 'Skærmbeskeder er ikke tilgængelige endnu. Databasemigreringen mangler måske.';
}

$defaults = [
    'id' => '',
    'title' => '',
    'body' => '',
    'priority' => 'normal',
    'status' => 'draft',
    'starts_at' => (new DateTimeImmutable('now', new DateTimeZone('Europe/Copenhagen')))
        ->modify('+15 minutes')->format('Y-m-d\TH:i'),
    'ends_at' => (new DateTimeImmutable('now', new DateTimeZone('Europe/Copenhagen')))
        ->modify('+7 days')->format('Y-m-d\TH:i'),
    'display_duration_seconds' => 15,
    'image_mime' => null,
    'version' => 1,
];
$form = $selected ? announcementFormValues($selected) : $defaults;
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $errors) {
    $form = array_merge($form, [
        'id' => trim((string)($_POST['id'] ?? '')),
        'title' => trim((string)($_POST['title'] ?? '')),
        'body' => trim((string)($_POST['body'] ?? '')),
        'priority' => (string)($_POST['priority'] ?? 'normal'),
        'status' => (string)($_POST['publish_state'] ?? 'draft'),
        'starts_at' => (string)($_POST['starts_at'] ?? ''),
        'ends_at' => (string)($_POST['ends_at'] ?? ''),
        'display_duration_seconds' => (int)($_POST['display_duration_seconds'] ?? 15),
        'version' => (int)($_POST['version'] ?? 1),
    ]);
}

$successMessages = [
    'saved' => 'Kladden er gemt.',
    'published' => 'Beskeden er udgivet.',
    'archived' => 'Beskeden er arkiveret.',
    'image_removed' => 'Billedet er fjernet.',
];
$success = $successMessages[(string)($_GET['result'] ?? '')] ?? '';

$portalPageTitle = 'Skærmbeskeder';
$portalNavActive = 'announcements';
include __DIR__ . '/includes/layout.php';
?>

<?php if ($dbError): ?>
<div class="portal-alert portal-alert-danger"><?= e($dbError) ?></div>
<?php else: ?>
<?php if ($success): ?>
<div class="portal-alert portal-alert-success"><?= e($success) ?></div>
<?php endif; ?>
<?php foreach ($errors as $error): ?>
<div class="portal-alert portal-alert-danger"><?= e($error) ?></div>
<?php endforeach; ?>

<div class="announcement-layout">
  <section class="portal-card">
    <div class="portal-card-header">
      <span>Beskeder til <?= e($displayId) ?></span>
      <a class="portal-btn portal-btn-primary portal-btn-sm" href="/portal/announcements.php">Ny besked</a>
    </div>
    <div class="announcement-list">
      <?php if (empty($announcements)): ?>
      <p class="text-muted">Der er ingen beskeder endnu.</p>
      <?php endif; ?>
      <?php foreach ($announcements as $announcement): ?>
      <?php $state = announcementState($announcement); ?>
      <a class="announcement-list-item <?= $form['id'] === $announcement['id'] ? 'selected' : '' ?>"
         href="?edit=<?= e($announcement['id']) ?>">
        <span class="announcement-list-heading">
          <strong><?= e($announcement['title']) ?></strong>
          <span class="badge <?= $state['class'] ?>"><?= e($state['label']) ?></span>
        </span>
        <span class="text-small text-muted">
          <?= e(announcementLocalDate($announcement['starts_at'], 'd.m.Y H:i')) ?>
          til <?= e(announcementLocalDate($announcement['ends_at'], 'd.m.Y H:i')) ?>
        </span>
        <?php if ($announcement['priority'] === 'important'): ?>
        <span class="badge badge-trial">Vigtig</span>
        <?php endif; ?>
      </a>
      <?php endforeach; ?>
    </div>
  </section>

  <section class="portal-card">
    <div class="portal-card-header"><?= $form['id'] ? 'Rediger besked' : 'Ny besked' ?></div>
    <div class="portal-card-body">
      <form method="POST" enctype="multipart/form-data" id="announcement-form">
        <input type="hidden" name="csrf_token" value="<?= e(csrfToken()) ?>">
        <input type="hidden" name="action" value="save">
        <input type="hidden" name="id" value="<?= e($form['id']) ?>">
        <input type="hidden" name="version" value="<?= (int)$form['version'] ?>">

        <div class="portal-form-group">
          <label class="portal-label" for="announcement-title">Titel</label>
          <input class="portal-input" id="announcement-title" name="title" maxlength="80"
                 value="<?= e($form['title']) ?>" required>
        </div>
        <div class="portal-form-group">
          <label class="portal-label" for="announcement-body">Information</label>
          <textarea class="portal-input announcement-textarea" id="announcement-body"
                    name="body" maxlength="600" required><?= e($form['body']) ?></textarea>
          <div class="text-small text-muted">Højst 600 tegn. Hold teksten kort nok til at læse på afstand.</div>
        </div>
        <div class="announcement-field-grid">
          <div class="portal-form-group">
            <label class="portal-label" for="announcement-start">Starter</label>
            <input class="portal-input" id="announcement-start" name="starts_at"
                   type="datetime-local" value="<?= e($form['starts_at']) ?>" required>
          </div>
          <div class="portal-form-group">
            <label class="portal-label" for="announcement-end">Slutter</label>
            <input class="portal-input" id="announcement-end" name="ends_at"
                   type="datetime-local" value="<?= e($form['ends_at']) ?>" required>
          </div>
          <div class="portal-form-group">
            <label class="portal-label" for="announcement-priority">Prioritet</label>
            <select class="portal-input" id="announcement-priority" name="priority">
              <option value="normal" <?= $form['priority'] === 'normal' ? 'selected' : '' ?>>Normal</option>
              <option value="important" <?= $form['priority'] === 'important' ? 'selected' : '' ?>>Vigtig</option>
            </select>
          </div>
          <div class="portal-form-group">
            <label class="portal-label" for="announcement-duration">Visningstid</label>
            <select class="portal-input" id="announcement-duration" name="display_duration_seconds">
              <?php foreach ([10, 15, 20, 30, 45, 60] as $duration): ?>
              <option value="<?= $duration ?>" <?= (int)$form['display_duration_seconds'] === $duration ? 'selected' : '' ?>>
                <?= $duration ?> sekunder
              </option>
              <?php endforeach; ?>
            </select>
          </div>
        </div>
        <div class="portal-form-group">
          <label class="portal-label" for="announcement-image">Billede (valgfrit)</label>
          <input class="portal-input" id="announcement-image" name="image" type="file"
                 accept="image/jpeg,image/png,image/webp">
          <div class="text-small text-muted">JPEG, PNG eller WebP. Højst 10 MB og 20 megapixels.</div>
        </div>

        <div class="announcement-preview <?= $form['image_mime'] ? '' : 'no-image' ?>" id="announcement-preview">
          <img id="announcement-preview-image"
               class="<?= $form['image_mime'] ? '' : 'hidden' ?>"
               src="<?= $form['image_mime'] ? '?image=' . e($form['id']) . '&v=' . (int)$form['version'] : '' ?>"
               alt="">
          <div class="announcement-preview-copy">
            <div class="announcement-preview-kicker" id="announcement-preview-kicker">
              <?= $form['priority'] === 'important' ? 'Vigtig besked fra ISS' : 'Besked fra ISS' ?>
            </div>
            <h2 id="announcement-preview-title"><?= e($form['title'] ?: 'Din titel vises her') ?></h2>
            <p id="announcement-preview-body"><?= e($form['body'] ?: 'Din information vises her.') ?></p>
          </div>
        </div>

        <div class="announcement-actions">
          <button class="portal-btn portal-btn-ghost" type="submit" name="publish_state" value="draft">Gem kladde</button>
          <button class="portal-btn portal-btn-primary" type="submit" name="publish_state" value="published">Udgiv</button>
        </div>
      </form>

      <?php if ($form['id']): ?>
      <div class="announcement-secondary-actions">
        <?php if ($form['image_mime']): ?>
        <form method="POST">
          <input type="hidden" name="csrf_token" value="<?= e(csrfToken()) ?>">
          <input type="hidden" name="action" value="remove_image">
          <input type="hidden" name="id" value="<?= e($form['id']) ?>">
          <button class="portal-btn portal-btn-ghost portal-btn-sm" type="submit">Fjern billede</button>
        </form>
        <?php endif; ?>
        <form method="POST" class="js-confirm-announcement-archive"
              data-announcement-title="<?= e($form['title']) ?>">
          <input type="hidden" name="csrf_token" value="<?= e(csrfToken()) ?>">
          <input type="hidden" name="action" value="archive">
          <input type="hidden" name="id" value="<?= e($form['id']) ?>">
          <button class="portal-btn portal-btn-danger portal-btn-sm" type="submit">Arkivér</button>
        </form>
      </div>
      <?php endif; ?>
    </div>
  </section>
</div>
<?php endif; ?>

<?php
layout_end();

function announcementId(string $id): string
{
    if (!preg_match('/^[a-f0-9-]{36}$/', $id)) {
        throw new InvalidArgumentException('Ugyldigt besked-id.');
    }
    return $id;
}

function announcementActor(): string
{
    return substr((string)($_SESSION['portal_user_id'] ?? $_SESSION['portal_member_id'] ?? 'portal'), 0, 100);
}

function announcementUuid(): string
{
    $bytes = random_bytes(16);
    $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
    $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
    $hex = bin2hex($bytes);
    return substr($hex, 0, 8) . '-' . substr($hex, 8, 4) . '-'
        . substr($hex, 12, 4) . '-' . substr($hex, 16, 4) . '-' . substr($hex, 20);
}

function validateAnnouncementForm(array $input): array
{
    $title = trim((string)($input['title'] ?? ''));
    $body = trim((string)($input['body'] ?? ''));
    if ($title === '' || announcementLength($title) > 80) {
        throw new InvalidArgumentException('Titlen skal være mellem 1 og 80 tegn.');
    }
    if ($body === '' || announcementLength($body) > 600) {
        throw new InvalidArgumentException('Teksten skal være mellem 1 og 600 tegn.');
    }
    $priority = (string)($input['priority'] ?? 'normal');
    if (!in_array($priority, ['normal', 'important'], true)) {
        throw new InvalidArgumentException('Ugyldig prioritet.');
    }
    $status = (string)($input['publish_state'] ?? 'draft');
    if (!in_array($status, ['draft', 'published'], true)) {
        throw new InvalidArgumentException('Ugyldig status.');
    }
    $timezone = new DateTimeZone('Europe/Copenhagen');
    $startsInput = (string)($input['starts_at'] ?? '');
    $endsInput = (string)($input['ends_at'] ?? '');
    $startsAt = DateTimeImmutable::createFromFormat(
        'Y-m-d\TH:i',
        $startsInput,
        $timezone
    );
    $endsAt = DateTimeImmutable::createFromFormat(
        'Y-m-d\TH:i',
        $endsInput,
        $timezone
    );
    if (
        !$startsAt
        || !$endsAt
        || $startsAt->format('Y-m-d\TH:i') !== $startsInput
        || $endsAt->format('Y-m-d\TH:i') !== $endsInput
    ) {
        throw new InvalidArgumentException('Start- eller sluttidspunktet er ugyldigt.');
    }
    if ($endsAt <= $startsAt) {
        throw new InvalidArgumentException('Sluttidspunktet skal ligge efter starttidspunktet.');
    }
    $duration = filter_var(
        $input['display_duration_seconds'] ?? 15,
        FILTER_VALIDATE_INT,
        ['options' => ['min_range' => 8, 'max_range' => 60]]
    );
    if ($duration === false) {
        throw new InvalidArgumentException('Visningstiden skal være mellem 8 og 60 sekunder.');
    }
    $utc = new DateTimeZone('UTC');
    return [
        'title' => $title,
        'body' => $body,
        'priority' => $priority,
        'status' => $status,
        'starts_at' => $startsAt->setTimezone($utc)->format('Y-m-d H:i:s'),
        'ends_at' => $endsAt->setTimezone($utc)->format('Y-m-d H:i:s'),
        'duration' => $duration,
    ];
}

function uploadedAnnouncementImage(): ?string
{
    if (!isset($_FILES['image']) || ($_FILES['image']['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
        return null;
    }
    if ($_FILES['image']['error'] !== UPLOAD_ERR_OK) {
        throw new InvalidArgumentException('Billedet kunne ikke uploades.');
    }
    $size = (int)($_FILES['image']['size'] ?? 0);
    if ($size < 1 || $size > ANNOUNCEMENT_MAX_IMAGE_BYTES) {
        throw new InvalidArgumentException('Billedet skal være mindre end 10 MB.');
    }
    $temporaryPath = (string)($_FILES['image']['tmp_name'] ?? '');
    $body = is_uploaded_file($temporaryPath) ? file_get_contents($temporaryPath) : false;
    if (!is_string($body) || strlen($body) !== $size) {
        throw new InvalidArgumentException('Billedet blev ikke modtaget korrekt.');
    }
    return processAnnouncementImage($body);
}

function processAnnouncementImage(string $body): string
{
    if (!function_exists('imagecreatefromstring') || !function_exists('imagejpeg')) {
        throw new RuntimeException('Serveren mangler GD-understøttelse til billeder.');
    }
    $details = @getimagesizefromstring($body);
    if (!$details || !in_array($details['mime'] ?? '', ['image/jpeg', 'image/png', 'image/webp'], true)) {
        throw new InvalidArgumentException('Kun JPEG-, PNG- og WebP-billeder understøttes.');
    }
    $width = (int)$details[0];
    $height = (int)$details[1];
    if ($width < 1 || $height < 1 || $width * $height > ANNOUNCEMENT_MAX_IMAGE_PIXELS) {
        throw new InvalidArgumentException('Billedets dimensioner er for store.');
    }
    $source = @imagecreatefromstring($body);
    if ($source === false) {
        throw new InvalidArgumentException('Billedet kunne ikke læses.');
    }
    $scale = min(1, ANNOUNCEMENT_MAX_IMAGE_WIDTH / $width, ANNOUNCEMENT_MAX_IMAGE_HEIGHT / $height);
    $targetWidth = max(1, (int)round($width * $scale));
    $targetHeight = max(1, (int)round($height * $scale));
    $target = imagecreatetruecolor($targetWidth, $targetHeight);
    $background = imagecolorallocate($target, 255, 255, 255);
    imagefill($target, 0, 0, $background);
    imagecopyresampled(
        $target,
        $source,
        0,
        0,
        0,
        0,
        $targetWidth,
        $targetHeight,
        $width,
        $height
    );
    ob_start();
    imagejpeg($target, null, 88);
    $processed = ob_get_clean();
    imagedestroy($source);
    imagedestroy($target);
    if (!is_string($processed) || $processed === '') {
        throw new RuntimeException('Billedet kunne ikke behandles.');
    }
    return $processed;
}

function announcementLength(string $value): int
{
    return function_exists('mb_strlen') ? mb_strlen($value, 'UTF-8') : strlen($value);
}

function announcementRedirect(string $result, string $id = ''): never
{
    $location = '/portal/announcements.php?result=' . rawurlencode($result);
    if ($id !== '') {
        $location .= '&edit=' . rawurlencode($id);
    }
    header('Location: ' . $location);
    exit;
}

function announcementFormValues(array $record): array
{
    return [
        'id' => $record['id'],
        'title' => $record['title'],
        'body' => $record['body'],
        'priority' => $record['priority'],
        'status' => $record['status'],
        'starts_at' => announcementLocalDate($record['starts_at'], 'Y-m-d\TH:i'),
        'ends_at' => announcementLocalDate($record['ends_at'], 'Y-m-d\TH:i'),
        'display_duration_seconds' => (int)$record['display_duration_seconds'],
        'image_mime' => $record['image_mime'],
        'version' => (int)$record['version'],
    ];
}

function announcementLocalDate(string $value, string $format): string
{
    return (new DateTimeImmutable($value, new DateTimeZone('UTC')))
        ->setTimezone(new DateTimeZone('Europe/Copenhagen'))
        ->format($format);
}

function announcementState(array $record): array
{
    if ($record['status'] === 'draft') {
        return ['label' => 'Kladde', 'class' => 'badge-inactive'];
    }
    $now = time();
    $startsAt = strtotime($record['starts_at'] . ' UTC');
    $endsAt = strtotime($record['ends_at'] . ' UTC');
    if ($startsAt > $now) {
        return ['label' => 'Planlagt', 'class' => 'badge-trial'];
    }
    if ($endsAt <= $now) {
        return ['label' => 'Udløbet', 'class' => 'badge-inactive'];
    }
    return ['label' => 'Aktiv', 'class' => 'badge-active'];
}
