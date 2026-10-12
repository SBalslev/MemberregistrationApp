<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/includes/auth_guard.php';
requireRole('TRAINER');

$db = portalDb();

$limit      = 50;
$page       = max(1, (int)($_GET['page'] ?? 1));
$offset     = ($page - 1) * $limit;
$discipline = $_GET['discipline'] ?? '';
$dateFrom   = $_GET['from'] ?? '';
$dateTo     = $_GET['to'] ?? '';

$validDisciplines = ['Riffel', 'Pistol', 'LuftRiffel', 'LuftPistol', 'Andet'];
if (!in_array($discipline, $validDisciplines, true)) {
    $discipline = '';
}
if ($dateFrom && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateFrom)) $dateFrom = '';
if ($dateTo   && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateTo))   $dateTo   = '';

$where  = [];
$params = [];
if ($discipline) { $where[] = 'ps.practice_type = ?'; $params[] = $discipline; }
if ($dateFrom)   { $where[] = 'ps.local_date >= ?';   $params[] = $dateFrom; }
if ($dateTo)     { $where[] = 'ps.local_date <= ?';   $params[] = $dateTo; }

$whereClause = $where ? 'WHERE ' . implode(' AND ', $where) : '';

$total = (int)(portalQueryOne(
    $db,
    "SELECT COUNT(*) AS cnt FROM practice_sessions ps {$whereClause}",
    $params
)['cnt'] ?? 0);
$totalPages = max(1, (int)ceil($total / $limit));

$sessions = portalQuery(
    $db,
    "SELECT ps.local_date, ps.practice_type, ps.points, ps.krydser, ps.classification,
            m.first_name, m.last_name, m.member_type
     FROM practice_sessions ps
     JOIN members m ON m.internal_id = ps.internal_member_id
     {$whereClause}
     ORDER BY ps.local_date DESC, ps.created_at_utc DESC
     LIMIT ? OFFSET ?",
    array_merge($params, [$limit, $offset])
);

$portalPageTitle = 'Resultater';
$portalNavActive = 'sessions';
include __DIR__ . '/../includes/layout.php';
?>

<!-- Filters -->
<div class="portal-card" style="margin-bottom:1.5rem;">
  <div class="portal-card-header">Filtrer</div>
  <div class="portal-card-body">
    <form method="GET" style="display:flex;flex-wrap:wrap;gap:1rem;align-items:flex-end;">
      <div class="portal-form-group" style="margin:0;flex:1;min-width:150px;">
        <label class="portal-label" for="discipline">Disciplin</label>
        <select class="portal-input" id="discipline" name="discipline">
          <option value="">Alle</option>
          <?php foreach ($validDisciplines as $d): ?>
          <option value="<?= e($d) ?>" <?= $discipline === $d ? 'selected' : '' ?>><?= e($d) ?></option>
          <?php endforeach; ?>
        </select>
      </div>
      <div class="portal-form-group" style="margin:0;flex:1;min-width:140px;">
        <label class="portal-label" for="from">Fra dato</label>
        <input class="portal-input" type="date" id="from" name="from" value="<?= e($dateFrom) ?>">
      </div>
      <div class="portal-form-group" style="margin:0;flex:1;min-width:140px;">
        <label class="portal-label" for="to">Til dato</label>
        <input class="portal-input" type="date" id="to" name="to" value="<?= e($dateTo) ?>">
      </div>
      <button type="submit" class="portal-btn portal-btn-primary">Filtrer</button>
      <a href="sessions.php" class="portal-btn portal-btn-ghost">Nulstil</a>
    </form>
  </div>
</div>

<div class="portal-card">
  <div class="portal-card-header">
    Resultater
    <span class="text-muted text-small"><?= $total ?> resultater</span>
  </div>
  <div class="portal-table-wrap">
    <table class="portal-table" data-default-desc>
      <thead>
        <tr><th>Dato</th><th>Skytte</th><th>Type</th><th>Disciplin</th><th>Point</th><th>Krydser</th><th>Klasse</th></tr>
      </thead>
      <tbody>
        <?php if (empty($sessions)): ?>
        <tr><td colspan="7" style="text-align:center;color:#6b7280;padding:2rem;">Ingen resultater matcher filteret.</td></tr>
        <?php endif; ?>
        <?php foreach ($sessions as $s): ?>
        <tr>
          <?php $ts = $s['local_date'] ? strtotime((string)$s['local_date']) : false; ?>
          <td data-sort-value="<?= $ts !== false ? date('Y-m-d', $ts) : '' ?>"><?= $ts !== false ? e(date('d.m.Y', $ts)) : '—' ?></td>
          <td><?= e($s['first_name'] . ' ' . $s['last_name']) ?></td>
          <td><span class="badge <?= $s['member_type'] === 'FULL' ? 'badge-active' : 'badge-trial' ?>"><?= e($s['member_type']) ?></span></td>
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
  <?php
  $qBase = http_build_query(array_filter(['discipline' => $discipline, 'from' => $dateFrom, 'to' => $dateTo]));
  ?>
  <a href="?<?= $qBase ?>&page=<?= max(1,$page-1) ?>" class="portal-page-link <?= $page<=1?'disabled':'' ?>">‹</a>
  <?php for ($i = max(1,$page-3); $i <= min($totalPages,$page+3); $i++): ?>
  <a href="?<?= $qBase ?>&page=<?= $i ?>" class="portal-page-link <?= $i===$page?'current':'' ?>"><?= $i ?></a>
  <?php endfor; ?>
  <a href="?<?= $qBase ?>&page=<?= min($totalPages,$page+1) ?>" class="portal-page-link <?= $page>=$totalPages?'disabled':'' ?>">›</a>
</nav>
<?php endif; ?>

<?php layout_end(); ?>
