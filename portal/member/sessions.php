<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/includes/auth_guard.php';
requireRole('MEMBER');

$user = portalUser();
$db   = portalDb();

$limit  = 30;
$page   = max(1, (int)($_GET['page'] ?? 1));
$offset = ($page - 1) * $limit;

$sessions = portalQuery(
    $db,
    "SELECT practice_type, points, krydser, classification, local_date, source
     FROM practice_sessions
     WHERE internal_member_id = ?
     ORDER BY local_date DESC, created_at_utc DESC
     LIMIT ? OFFSET ?",
    [$user['member_id'], $limit, $offset]
);

$total = (int)(portalQueryOne(
    $db,
    "SELECT COUNT(*) AS cnt FROM practice_sessions WHERE internal_member_id = ?",
    [$user['member_id']]
)['cnt'] ?? 0);
$totalPages = max(1, (int)ceil($total / $limit));

// 12-month stats per discipline
$averages = portalQuery(
    $db,
    "SELECT practice_type,
            ROUND(AVG(points), 1)  AS avg_points,
            ROUND(AVG(krydser), 1) AS avg_krydser,
            MAX(points)            AS best_points,
            MIN(points)            AS worst_points,
            COUNT(*)               AS session_count,
            MAX(local_date)        AS last_date,
            ROUND(AVG(CASE WHEN local_date >= DATE_SUB(CURDATE(), INTERVAL 3 MONTH) THEN points END), 1) AS avg_3m
     FROM practice_sessions
     WHERE internal_member_id = ?
       AND local_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
     GROUP BY practice_type
     ORDER BY practice_type",
    [$user['member_id']]
);

// 12-month data points for charts (all sessions, ordered by date asc per discipline)
$chartRows = portalQuery(
    $db,
    "SELECT practice_type, local_date, points
     FROM practice_sessions
     WHERE internal_member_id = ?
       AND local_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
     ORDER BY practice_type, local_date ASC, created_at_utc ASC",
    [$user['member_id']]
);
// Group by discipline
$chartData = [];
foreach ($chartRows as $r) {
    $chartData[$r['practice_type']][] = ['date' => $r['local_date'], 'points' => (int)$r['points']];
}

// Max scores per discipline for bar scaling
$maxScores = ['Riffel' => 200, 'Pistol' => 300, 'LuftRiffel' => 400, 'LuftPistol' => 400, 'Andet' => 100];

$portalPageTitle = 'Mine resultater';
$portalNavActive = 'sessions';
include __DIR__ . '/../includes/layout.php';
?>

<?php if ($averages): ?>
<div class="portal-card" style="margin-bottom:1.5rem;">
  <div class="portal-card-header">Statistik — seneste 12 måneder</div>
  <div class="portal-card-body">
    <?php foreach ($averages as $avg): ?>
    <?php
      $maxScore = $maxScores[$avg['practice_type']] ?? 100;
      $trend = null;
      if ($avg['avg_3m'] !== null && $avg['avg_points'] > 0) {
          $diff = round($avg['avg_3m'] - $avg['avg_points'], 1);
          $trend = $diff > 0 ? "↑ +{$diff}" : ($diff < 0 ? "↓ {$diff}" : "→ ±0");
          $trendClass = $diff > 0 ? 'success' : ($diff < 0 ? 'danger' : 'muted');
      }
    ?>
    <div style="margin-bottom:1.5rem;">
      <div class="flex-between" style="margin-bottom:.35rem;">
        <span style="font-weight:700;font-size:.95rem;"><?= e($avg['practice_type']) ?></span>
        <span class="text-muted text-small"><?= (int)$avg['session_count'] ?> resultater</span>
      </div>
      <div class="portal-bar-wrap" style="margin-bottom:.4rem;">
        <div class="portal-bar-track">
          <div class="portal-bar-fill"
               style="width:<?= min(100, round($avg['avg_points'] / $maxScore * 100)) ?>%"></div>
        </div>
        <span class="portal-bar-label"><?= e((string)$avg['avg_points']) ?> gns.</span>
      </div>
      <div style="display:flex;gap:1.5rem;flex-wrap:wrap;font-size:.82rem;color:#6b7280;margin-top:.25rem;">
        <span>Bedste: <strong style="color:#10b981;"><?= (int)$avg['best_points'] ?></strong></span>
        <span>Laveste: <strong><?= (int)$avg['worst_points'] ?></strong></span>
        <?php if ($avg['avg_krydser'] > 0): ?>
        <span>Gns. krydser: <strong><?= e($avg['avg_krydser']) ?></strong></span>
        <?php endif; ?>
        <?php if ($trend): ?>
        <span>Tendens (3 mdr.): <strong class="text-<?= $trendClass ?>"><?= $trend ?></strong></span>
        <?php endif; ?>
      </div>
    </div>
    <?php endforeach; ?>
  </div>
</div>
<?php endif; ?>

<?php if (count($chartData) > 0): ?>
<?php
function renderSparkline(array $points, int $maxScore, string $color = '#1B6B93'): string {
    if (count($points) < 2) {
        // Single point — just show a dot
        $pt = $points[0];
        $y = 88 - round(($pt['points'] / max($maxScore, 1)) * 80);
        return '<svg viewBox="0 0 600 100" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block;">'
             . "<circle cx='300' cy='{$y}' r='4' fill='{$color}'/>"
             . '</svg>';
    }
    $n       = count($points);
    $w       = 600;
    $h       = 100;
    $padX    = 8;
    $padYTop = 8;
    $padYBot = 12;
    $chartH  = $h - $padYTop - $padYBot;
    $chartW  = $w - $padX * 2;

    $vals   = array_column($points, 'points');
    $minV   = (int)min($vals);
    $maxV   = max((int)max($vals), (int)($maxScore * 0.1));
    $range  = max(1, $maxV - $minV);

    $coords = [];
    foreach ($points as $i => $pt) {
        $x = $padX + round(($i / ($n - 1)) * $chartW);
        $y = $padYTop + $chartH - round((($pt['points'] - $minV) / $range) * $chartH);
        $coords[] = "{$x},{$y}";
    }
    $polyline = implode(' ', $coords);

    // Fill area under line
    $first = $coords[0];  $last = $coords[$n - 1];
    [$fx] = explode(',', $first); [$lx] = explode(',', $last);
    $bottom = $padYTop + $chartH;
    $fillPts = "{$fx},{$bottom} " . $polyline . " {$lx},{$bottom}";

    // Axis label (min/max)
    $labelMax = $maxV;
    $labelMin = $minV;

    $svg  = '<svg viewBox="0 0 600 100" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block;">';
    $svg .= "<polygon points='{$fillPts}' fill='{$color}' fill-opacity='0.12'/>";
    $svg .= "<polyline points='{$polyline}' fill='none' stroke='{$color}' stroke-width='2' stroke-linejoin='round' stroke-linecap='round'/>";
    // Dot on last point
    [$lx2, $ly2] = explode(',', $coords[$n - 1]);
    $svg .= "<circle cx='{$lx2}' cy='{$ly2}' r='3' fill='{$color}'/>";
    // Y-axis labels
    $svg .= "<text x='2' y='" . ($padYTop + 6) . "' font-size='7' fill='#9ca3af'>{$labelMax}</text>";
    $svg .= "<text x='2' y='" . ($padYTop + $chartH) . "' font-size='7' fill='#9ca3af'>{$labelMin}</text>";
    $svg .= '</svg>';
    return $svg;
}

$disciplineColors = [
    'Riffel'     => '#1B6B93',
    'Pistol'     => '#F59E0B',
    'LuftRiffel' => '#10b981',
    'LuftPistol' => '#8b5cf6',
    'Andet'      => '#6b7280',
];
?>
<div class="portal-card" style="margin-bottom:1.5rem;">
  <div class="portal-card-header">Udvikling — seneste 12 måneder</div>
  <div class="portal-card-body">
    <div style="display:flex;flex-direction:column;gap:1.25rem;">
      <?php foreach ($chartData as $discipline => $pts): ?>
      <?php
        $maxScore = $maxScores[$discipline] ?? 100;
        $color    = $disciplineColors[$discipline] ?? '#1B6B93';
        $first    = $pts[0]['points'];
        $last_pt  = end($pts)['points'];
        $diff     = $last_pt - $first;
      ?>
      <div style="background:var(--portal-card-bg,#fff);border:1px solid rgba(0,0,0,.08);border-radius:.5rem;padding:.75rem;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:.25rem;">
          <span style="font-weight:600;font-size:.85rem;"><?= e($discipline) ?></span>
          <?php if (count($pts) > 1): ?>
          <span style="font-size:.75rem;color:<?= $diff >= 0 ? '#10b981' : '#ef4444' ?>;">
            <?= $diff >= 0 ? '↑' : '↓' ?> <?= abs($diff) ?> pts
          </span>
          <?php endif; ?>
        </div>
        <?= renderSparkline($pts, $maxScore, $color) ?>
        <div style="display:flex;justify-content:space-between;font-size:.72rem;color:#9ca3af;margin-top:.2rem;">
          <span><?= e(date('d.m', strtotime($pts[0]['date']))) ?></span>
          <span><?= count($pts) ?> resultater</span>
          <span><?= e(date('d.m', strtotime(end($pts)['date']))) ?></span>
        </div>
      </div>
      <?php endforeach; ?>
    </div>
  </div>
</div>
<?php endif; ?>

<div class="portal-card">
  <div class="portal-card-header">
    Alle resultater
    <span class="text-muted text-small"><?= $total ?> i alt</span>
  </div>
  <div class="portal-table-wrap">
    <table class="portal-table" data-default-desc>
      <thead>
        <tr>
          <th>Dato</th>
          <th>Disciplin</th>
          <th>Point</th>
          <th>Krydser</th>
          <th>Klasse</th>
        </tr>
      </thead>
      <tbody>
        <?php if (empty($sessions)): ?>
        <tr><td colspan="5" style="text-align:center;color:#6b7280;padding:2rem;">Ingen resultater registreret endnu.</td></tr>
        <?php endif; ?>
        <?php foreach ($sessions as $s): ?>
        <tr>
          <td><?= e(date('d.m.Y', strtotime($s['local_date']))) ?></td>
          <td><?= e($s['practice_type']) ?></td>
          <td><strong><?= (int)$s['points'] ?></strong></td>
          <td><?= $s['krydser'] !== null ? (int)$s['krydser'] : '—' ?></td>
          <td><?= $s['classification'] ? e($s['classification']) : '—' ?></td>
        </tr>
        <?php endforeach; ?>
      </tbody>
    </table>
  </div>
</div>

<?php if ($totalPages > 1): ?>
<nav class="portal-pagination" aria-label="Sider">
  <a href="?page=<?= max(1, $page-1) ?>"
     class="portal-page-link <?= $page <= 1 ? 'disabled' : '' ?>"
     aria-label="Forrige">‹</a>
  <?php for ($i = max(1, $page-3); $i <= min($totalPages, $page+3); $i++): ?>
  <a href="?page=<?= $i ?>"
     class="portal-page-link <?= $i === $page ? 'current' : '' ?>"><?= $i ?></a>
  <?php endfor; ?>
  <a href="?page=<?= min($totalPages, $page+1) ?>"
     class="portal-page-link <?= $page >= $totalPages ? 'disabled' : '' ?>"
     aria-label="Næste">›</a>
</nav>
<?php endif; ?>

<?php layout_end(); ?>
