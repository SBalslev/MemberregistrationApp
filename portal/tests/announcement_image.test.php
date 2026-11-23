<?php

declare(strict_types=1);

// Load the pure image functions without running the authenticated portal page.
$source = file_get_contents(__DIR__ . '/../announcements.php');
preg_match_all('/^const ANNOUNCEMENT_MAX_IMAGE_\w+ = \d+;/m', $source, $constants);
eval(implode("\n", $constants[0]));
$start = strpos($source, 'function processAnnouncementImage(');
eval(substr($source, $start));
$formStart = strpos($source, 'function validateAnnouncementForm(');
$formEnd = strpos($source, 'function uploadedAnnouncementImage(', $formStart);
eval(substr($source, $formStart, $formEnd - $formStart));

function check(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function imageFixture(string $format, int $width = 120, int $height = 80): string
{
    $image = imagecreatetruecolor($width, $height);
    foreach ([[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0]] as $index => $rgb) {
        $left = ($index % 2) * intdiv($width, 2);
        $top = intdiv($index, 2) * intdiv($height, 2);
        imagefilledrectangle(
            $image,
            $left,
            $top,
            $left + intdiv($width, 2) - 1,
            $top + intdiv($height, 2) - 1,
            imagecolorallocate($image, ...$rgb)
        );
    }
    ob_start();
    match ($format) {
        'jpeg' => imagejpeg($image, null, 95),
        'png' => imagepng($image),
        'webp' => imagewebp($image, null, 95),
    };
    $body = ob_get_clean();
    imagedestroy($image);
    return $body;
}

function withOrientation(string $jpeg, int $orientation): string
{
    $tiff = "II" . pack('vV', 42, 8)
        . pack('v', 1)
        . pack('vvV', 0x0112, 3, 1)
        . pack('vv', $orientation, 0)
        . pack('V', 0);
    $exif = "Exif\0\0" . $tiff;
    return substr($jpeg, 0, 2) . "\xff\xe1" . pack('n', strlen($exif) + 2)
        . $exif . substr($jpeg, 2);
}

function corners(GdImage $image): array
{
    $width = imagesx($image);
    $height = imagesy($image);
    $colors = [];
    foreach ([[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]] as [$x, $y]) {
        $pixel = imagecolorat($image, (int)($width * $x), (int)($height * $y));
        $r = ($pixel >> 16) & 255;
        $g = ($pixel >> 8) & 255;
        $b = $pixel & 255;
        $colors[] = $r > 180 && $g > 180 ? 'yellow'
            : ($r > 180 ? 'red' : ($g > 180 ? 'green' : ($b > 180 ? 'blue' : 'unknown')));
    }
    return $colors;
}

$expected = [
    1 => ['red', 'green', 'blue', 'yellow'],
    2 => ['green', 'red', 'yellow', 'blue'],
    3 => ['yellow', 'blue', 'green', 'red'],
    4 => ['blue', 'yellow', 'red', 'green'],
    5 => ['red', 'blue', 'green', 'yellow'],
    6 => ['blue', 'red', 'yellow', 'green'],
    7 => ['yellow', 'green', 'blue', 'red'],
    8 => ['green', 'yellow', 'red', 'blue'],
];
$jpeg = imageFixture('jpeg');
foreach ($expected as $orientation => $colors) {
    $processed = processAnnouncementImage(withOrientation($jpeg, $orientation));
    $image = imagecreatefromstring($processed);
    $size = $orientation >= 5 ? [80, 120] : [120, 80];
    check([imagesx($image), imagesy($image)] === $size, "Wrong size for orientation $orientation");
    check(corners($image) === $colors, "Wrong pixels for orientation $orientation");
    check(strpos($processed, "Exif\0\0") === false, 'EXIF metadata was retained');
    imagedestroy($image);
}

foreach (['jpeg', 'png', 'webp'] as $format) {
    $processed = processAnnouncementImage(imageFixture($format));
    $details = getimagesizefromstring($processed);
    check([$details[0], $details[1]] === [120, 80], "$format was resized unnecessarily");
    check($details['mime'] === 'image/jpeg', "$format was not re-encoded as JPEG");
    $image = imagecreatefromstring($processed);
    check(corners($image) === $expected[1], "$format lost image content");
    imagedestroy($image);
}

$portrait = processAnnouncementImage(withOrientation(imageFixture('jpeg', 4000, 3000), 6));
$details = getimagesizefromstring($portrait);
check([$details[0], $details[1]] === [1620, 2160], 'Portrait was not resized after orientation');

try {
    processAnnouncementImage('not an image');
    throw new RuntimeException('Invalid image was accepted');
} catch (InvalidArgumentException $error) {
    check($error->getMessage() !== '', 'Invalid image error was empty');
}

echo "Passed: 8 EXIF orientations, 3 formats, portrait resizing, metadata removal, invalid image rejection.\n";

$input = [
    'title' => 'Klubbesked',
    'body' => 'Information',
    'starts_at' => '2026-11-23T18:00',
    'ends_at' => '2026-11-23T20:00',
];
check(validateAnnouncementForm($input)['image_display_mode'] === 'fit', 'Legacy forms must default to fit');
foreach (['fit', 'pan'] as $mode) {
    $input['image_display_mode'] = $mode;
    check(validateAnnouncementForm($input)['image_display_mode'] === $mode, 'Image mode was not preserved');
}
$input['image_display_mode'] = 'invalid';
try {
    validateAnnouncementForm($input);
    throw new RuntimeException('Invalid image mode was accepted');
} catch (InvalidArgumentException $error) {
    check($error->getMessage() !== '', 'Invalid image mode error was empty');
}

require __DIR__ . '/../../api/handlers/display_content.php';
$handler = file_get_contents(__DIR__ . '/../../api/handlers/display_content.php');
$mapStart = strpos($handler, '$announcements = array_map(');
$mapEnd = strpos($handler, 'jsonResponse([', $mapStart);
$displayId = 'club-display';
foreach (['fit', 'pan'] as $mode) {
    $rows = [[
        'id' => '33333333-3333-4333-8333-333333333333',
        'title' => 'Klubbesked',
        'body' => 'Information',
        'priority' => 'normal',
        'starts_at' => '2026-11-23 18:00:00',
        'ends_at' => '2026-11-23 20:00:00',
        'display_duration_seconds' => 30,
        'image_display_mode' => $mode,
        'version' => 1,
        'image_mime' => 'image/jpeg',
    ]];
    eval(substr($handler, $mapStart, $mapEnd - $mapStart));
    check($announcements[0]['imageDisplayMode'] === $mode, 'API omitted image display mode');
    check($announcements[0]['displayDurationSeconds'] === 30, 'API changed duration');
}
echo "Passed: form defaults, both display modes, invalid-mode rejection, API image mode delivery.\n";
