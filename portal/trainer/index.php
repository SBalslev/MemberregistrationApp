<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/includes/auth_guard.php';
requireRole('TRAINER');

$db = portalDb();

// Active members today
$activeToday = (int)(portalQueryOne(
    $db,
    "SELECT COUNT(DISTINCT internal_member_id) AS cnt
     FROM check_ins WHERE local_date = CURDATE()"
)['cnt'] ?? 0);

// Sessions this week per discipline
$weekStats = portalQuery(
    $db,
    "SELECT practice_type, COUNT(*) AS cnt, ROUND(AVG(points),1) AS avg_points
     FROM practice_sessions
     WHERE local_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
     GROUP BY practice_type ORDER BY cnt DESC"
);

// Sessions this month per discipline
$monthStats = portalQuery(
    $db,
    "SELECT practice_type, COUNT(*) AS cnt, ROUND(AVG(points),1) AS avg_points
     FROM practice_sessions
     WHERE DATE_FORMAT(local_date,'%Y-%m') = DATE_FORMAT(CURDATE(),'%Y-%m')
     GROUP BY practice_type ORDER BY cnt DESC"
);

// Recent sessions (last 10)
$recentSessions = portalQuery(
    $db,
    "SELECT ps.local_date, ps.practice_type, ps.points, ps.krydser,
            m.first_name, m.last_name
     FROM practice_sessions ps
     JOIN members m ON m.internal_id = ps.internal_member_id
     ORDER BY ps.local_date DESC, ps.created_at_utc DESC
     LIMIT 10"
);

// Total active members
$totalActive = (int)(portalQueryOne(
    $db, "SELECT COUNT(*) AS cnt FROM members WHERE status = 'ACTIVE'"
)['cnt'] ?? 0);

$portalPageTitle = 'Træner — Oversigt';
$portalNavActive = 'index';
include __DIR__ . '/../includes/layout.php';
?>

<div class="portal-stats-grid">
  <div class="portal-stat-card">
    <div class="portal-stat-label">Aktive skytter i dag</div>
    <div class="portal-stat-value accent"><?= $activeToday ?></div>
  </div>
  <div class="portal-stat-card">
    <div class="portal-stat-label">Aktive medlemmer</div>
    <div class="portal-stat-value"><?= $totalActive ?></div>
  </div>
  <div class="portal-stat-card">
    <div class="portal-stat-label">Sessioner denne uge</div>
    <div class="portal-stat-value success"><?= array_sum(array_column($weekStats, 'cnt')) ?></div>
  </div>
  <div class="portal-stat-card">
    <div class="portal-stat-label">Sessioner denne måned</div>
    <div class="portal-stat-value"><?= array_sum(array_column($monthStats, 'cnt')) ?></div>
  </div>
</div>

<div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1.5rem;">

  <div class="portal-card">
    <div class="portal-card-header">Denne uge — pr. disciplin</div>
    <div class="portal-card-body">
      <?php if (empty($weekStats)): ?>
      <p class="text-muted text-small">Ingen sessioner denne uge.</p>
      <?php endif; ?>
      <?php foreach ($weekStats as $s): ?>
      <div style="margin-bottom:.75rem;">
        <div class="flex-between" style="margin-bottom:.25rem;">
          <span style="font-weight:600;font-size:.875rem;"><?= e($s['practice_type']) ?></span>
          <span class="text-muted text-small"><?= (int)$s['cnt'] ?> sess. · gns. <?= e($s['avg_points']) ?></span>
        </div>
      </div>
      <?php endforeach; ?>
    </div>
  </div>

  <div class="portal-card">
    <div class="portal-card-header">Denne måned — pr. disciplin</div>
    <div class="portal-card-body">
      <?php if (empty($monthStats)): ?>
      <p class="text-muted text-small">Ingen sessioner denne måned.</p>
      <?php endif; ?>
      <?php foreach ($monthStats as $s): ?>
      <div style="margin-bottom:.75rem;">
        <div class="flex-between" style="margin-bottom:.25rem;">
          <span style="font-weight:600;font-size:.875rem;"><?= e($s['practice_type']) ?></span>
          <span class="text-muted text-small"><?= (int)$s['cnt'] ?> sess. · gns. <?= e($s['avg_points']) ?></span>
        </div>
      </div>
      <?php endforeach; ?>
    </div>
  </div>
</div>

<div class="portal-card">
  <div class="portal-card-header">Seneste resultater</div>
  <div class="portal-table-wrap">
    <table class="portal-table" data-default-desc>
      <thead>
        <tr><th>Dato</th><th>Skytte</th><th>Disciplin</th><th>Point</th><th>Krydser</th></tr>
      </thead>
      <tbody>
        <?php foreach ($recentSessions as $s): ?>
        <tr>
          <?php $ts = $s['local_date'] ? strtotime((string)$s['local_date']) : false; ?>
          <td data-sort-value="<?= $ts !== false ? date('Y-m-d', $ts) : '' ?>"><?= $ts !== false ? e(date('d.m.Y', $ts)) : '—' ?></td>
          <td><?= e($s['first_name'] . ' ' . $s['last_name']) ?></td>
          <td><?= e($s['practice_type']) ?></td>
          <td><strong><?= (int)$s['points'] ?></strong></td>
          <td><?= $s['krydser'] !== null ? (int)$s['krydser'] : '—' ?></td>
        </tr>
        <?php endforeach; ?>
      </tbody>
    </table>
  </div>
</div>

<?php layout_end(); ?>
