<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/includes/auth_guard.php';
requireRole('ADMIN');
logPortalAccess('VIEW_SKV');

$db = portalAdminDb();

$search = trim($_GET['q'] ?? '');
$limit  = 50;
$page   = max(1, (int)($_GET['page'] ?? 1));
$offset = ($page - 1) * $limit;

$where  = [];
$params = [];
if ($search) {
    $where[] = "(m.first_name LIKE ? OR m.last_name LIKE ? OR m.membership_id LIKE ?)";
    $like    = '%' . $search . '%';
    $params  = [$like, $like, $like];
}
$whereClause = $where ? 'WHERE ' . implode(' AND ', $where) : '';

$total = (int)(portalQueryOne($db,
    "SELECT COUNT(DISTINCT sr.id) AS cnt
     FROM skv_registrations sr
     JOIN members m ON m.internal_id = sr.member_id
     {$whereClause}", $params
)['cnt'] ?? 0);
$totalPages = max(1, (int)ceil($total / $limit));

$rows = portalQuery($db,
    "SELECT sr.id AS skv_id, sr.skv_level, sr.status AS skv_status,
            sr.last_approved_date,
            m.first_name, m.last_name, m.membership_id
     FROM skv_registrations sr
     JOIN members m ON m.internal_id = sr.member_id
     {$whereClause}
     ORDER BY m.last_name, m.first_name
     LIMIT ? OFFSET ?",
    array_merge($params, [$limit, $offset])
);

// Load weapons for displayed registrations
$skvIds  = array_column($rows, 'skv_id');
$weapons = [];
if ($skvIds) {
    $placeholders = implode(',', array_fill(0, count($skvIds), '?'));
    $weaponRows   = portalQuery($db,
        "SELECT skv_registration_id, model, serial, type, caliber, last_reviewed_date
         FROM skv_weapons WHERE skv_registration_id IN ({$placeholders})",
        $skvIds
    );
    foreach ($weaponRows as $w) {
        $weapons[$w['skv_registration_id']][] = $w;
    }
}

$statusBadge = ['approved' => 'badge-active', 'requested' => 'badge-trial', 'not_started' => 'badge-inactive'];

$portalPageTitle = 'SKV Registreringer';
$portalNavActive = 'skv';
include __DIR__ . '/../includes/layout.php';
?>

<div class="portal-alert portal-alert-warning">
  SKV-data er fortroligt og underlagt Våbenloven. Al adgang logges automatisk.
</div>

<div class="portal-card" style="margin-bottom:1.5rem;">
  <div class="portal-card-body">
    <form method="GET" style="display:flex;gap:1rem;align-items:flex-end;flex-wrap:wrap;">
      <div class="portal-form-group" style="margin:0;flex:1;min-width:200px;">
        <label class="portal-label" for="q">Søg navn / nr.</label>
        <input class="portal-input" type="search" id="q" name="q" value="<?= e($search) ?>">
      </div>
      <button type="submit" class="portal-btn portal-btn-primary">Søg</button>
      <a href="skv.php" class="portal-btn portal-btn-ghost">Nulstil</a>
    </form>
  </div>
</div>

<?php foreach ($rows as $row): ?>
<div class="portal-card" style="margin-bottom:1rem;">
  <div class="portal-card-header">
    <span>
      <?= e($row['first_name'] . ' ' . $row['last_name']) ?>
      <span class="text-muted text-small" style="font-weight:400;">nr. <?= e($row['membership_id']) ?></span>
    </span>
    <div style="display:flex;gap:.5rem;align-items:center;">
      <span class="badge <?= $statusBadge[$row['skv_status']] ?? 'badge-inactive' ?>"><?= e($row['skv_status']) ?></span>
      <span class="text-muted text-small">Niveau <?= (int)$row['skv_level'] ?></span>
      <?php if ($row['last_approved_date']): ?>
      <span class="text-muted text-small">Godkendt: <?= e(date('d.m.Y', strtotime($row['last_approved_date']))) ?></span>
      <?php endif; ?>
    </div>
  </div>
  <?php if (!empty($weapons[$row['skv_id']])): ?>
  <div class="portal-table-wrap">
    <table class="portal-table">
      <thead><tr><th>Model</th><th>Type</th><th>Serienr.</th><th>Kaliber</th><th>Sidst kontrolleret</th></tr></thead>
      <tbody>
        <?php foreach ($weapons[$row['skv_id']] as $w): ?>
        <tr>
          <td><?= e($w['model']) ?></td>
          <td><?= e($w['type']) ?></td>
          <td><code><?= e($w['serial']) ?></code></td>
          <td><?= $w['caliber'] ? e($w['caliber']) : '—' ?></td>
          <td><?= $w['last_reviewed_date'] ? e(date('d.m.Y', strtotime($w['last_reviewed_date']))) : '—' ?></td>
        </tr>
        <?php endforeach; ?>
      </tbody>
    </table>
  </div>
  <?php else: ?>
  <div class="portal-card-body text-muted text-small">Ingen registrerede våben.</div>
  <?php endif; ?>
</div>
<?php endforeach; ?>

<?php if (empty($rows)): ?>
<div class="portal-card">
  <div class="portal-card-body" style="text-align:center;color:#6b7280;padding:2rem;">Ingen SKV-registreringer fundet.</div>
</div>
<?php endif; ?>

<?php if ($totalPages > 1): ?>
<nav class="portal-pagination">
  <?php $qBase = http_build_query(array_filter(['q' => $search])); ?>
  <a href="?<?= $qBase ?>&page=<?= max(1,$page-1) ?>" class="portal-page-link <?= $page<=1?'disabled':'' ?>">‹</a>
  <?php for ($i=max(1,$page-3); $i<=min($totalPages,$page+3); $i++): ?>
  <a href="?<?= $qBase ?>&page=<?= $i ?>" class="portal-page-link <?= $i===$page?'current':'' ?>"><?= $i ?></a>
  <?php endfor; ?>
  <a href="?<?= $qBase ?>&page=<?= min($totalPages,$page+1) ?>" class="portal-page-link <?= $page>=$totalPages?'disabled':'' ?>">›</a>
</nav>
<?php endif; ?>

<?php layout_end(); ?>
