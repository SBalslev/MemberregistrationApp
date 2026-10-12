<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/includes/auth_guard.php';
requireRole('MEMBER');

$user = portalUser();
$db   = portalDb();

$limit  = 50;
$page   = max(1, (int)($_GET['page'] ?? 1));
$offset = ($page - 1) * $limit;

$checkins = portalQuery(
    $db,
    "SELECT ci.local_date, ci.first_of_day_flag,
            COUNT(ps.id) AS result_count
     FROM check_ins ci
     LEFT JOIN practice_sessions ps
            ON ps.internal_member_id = ci.internal_member_id
           AND ps.local_date = ci.local_date
     WHERE ci.internal_member_id = ?
     GROUP BY ci.local_date, ci.first_of_day_flag
     ORDER BY ci.local_date DESC
     LIMIT ? OFFSET ?",
    [$user['member_id'], $limit, $offset]
);

$total = (int)(portalQueryOne(
    $db,
    "SELECT COUNT(*) AS cnt FROM check_ins WHERE internal_member_id = ?",
    [$user['member_id']]
)['cnt'] ?? 0);
$totalPages = max(1, (int)ceil($total / $limit));

// Check-ins per month for the last 12 months
$monthly = portalQuery(
    $db,
    "SELECT DATE_FORMAT(local_date, '%Y-%m') AS ym,
            DATE_FORMAT(local_date, '%b %Y') AS label,
            COUNT(*) AS cnt
     FROM check_ins
     WHERE internal_member_id = ?
       AND local_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
     GROUP BY ym
     ORDER BY ym",
    [$user['member_id']]
);
$maxMonth = max(1, ...array_column($monthly, 'cnt'));

$portalPageTitle = 'Check-in historik';
$portalNavActive = 'checkins';
include __DIR__ . '/../includes/layout.php';
?>

<?php if ($monthly): ?>
<div class="portal-card" style="margin-bottom:1.5rem;">
  <div class="portal-card-header">Check-ins pr. måned — seneste 12 måneder</div>
  <div class="portal-card-body">
    <?php foreach ($monthly as $m): ?>
    <div style="margin-bottom:.65rem;">
      <div class="flex-between" style="margin-bottom:.2rem;">
        <span style="font-size:.8rem;color:#6b7280;min-width:80px;"><?= e($m['label']) ?></span>
        <div class="portal-bar-wrap" style="flex:1;margin:0 .75rem;">
          <div class="portal-bar-track">
            <div class="portal-bar-fill"
                 style="width:<?= round($m['cnt'] / $maxMonth * 100) ?>%"></div>
          </div>
        </div>
        <span style="font-size:.85rem;font-weight:600;min-width:24px;text-align:right;"><?= (int)$m['cnt'] ?></span>
      </div>
    </div>
    <?php endforeach; ?>
  </div>
</div>
<?php endif; ?>

<div class="portal-card">
  <div class="portal-card-header">
    Alle check-ins
    <span class="text-muted text-small"><?= $total ?> i alt</span>
  </div>
  <div class="portal-table-wrap">
    <table class="portal-table" data-default-desc>
      <thead>
        <tr>
          <th>Dato</th>
          <th>Dag</th>
          <th>Resultater</th>
        </tr>
      </thead>
      <tbody>
        <?php if (empty($checkins)): ?>
        <tr><td colspan="3" style="text-align:center;color:#6b7280;padding:2rem;">Ingen check-ins registreret endnu.</td></tr>
        <?php endif; ?>
        <?php foreach ($checkins as $c): ?>
        <?php
        $ts    = strtotime($c['local_date']);
        $days  = ['Søndag','Mandag','Tirsdag','Onsdag','Torsdag','Fredag','Lørdag'];
        $dayNm = $days[date('w', $ts)];
        ?>
        <tr>
          <td><?= e(date('d.m.Y', $ts)) ?></td>
          <td><?= e($dayNm) ?></td>
          <td><?= $c['result_count'] > 0 ? (int)$c['result_count'] : '—' ?></td>
        </tr>
        <?php endforeach; ?>
      </tbody>
    </table>
  </div>
</div>

<?php if ($totalPages > 1): ?>
<nav class="portal-pagination" aria-label="Sider">
  <a href="?page=<?= max(1, $page-1) ?>"
     class="portal-page-link <?= $page <= 1 ? 'disabled' : '' ?>">‹</a>
  <?php for ($i = max(1, $page-3); $i <= min($totalPages, $page+3); $i++): ?>
  <a href="?page=<?= $i ?>"
     class="portal-page-link <?= $i === $page ? 'current' : '' ?>"><?= $i ?></a>
  <?php endfor; ?>
  <a href="?page=<?= min($totalPages, $page+1) ?>"
     class="portal-page-link <?= $page >= $totalPages ? 'disabled' : '' ?>">›</a>
</nav>
<?php endif; ?>

<?php layout_end(); ?>
