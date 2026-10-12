<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/includes/auth_guard.php';
requireRole('ADMIN');
logPortalAccess('VIEW_EQUIPMENT');

$db = portalDb();

$search = trim($_GET['q'] ?? '');
$status = $_GET['status'] ?? '';
$type   = $_GET['type'] ?? '';
$limit  = 50;
$page   = max(1, (int)($_GET['page'] ?? 1));
$offset = ($page - 1) * $limit;

$where  = [];
$params = [];
if ($status) { $where[] = 'e.status = ?'; $params[] = $status; }
if ($type)   { $where[] = 'e.equipment_type = ?'; $params[] = $type; }
if ($search) {
    $where[] = "(e.name LIKE ? OR e.serial_number LIKE ? OR e.brand LIKE ?)";
    $like    = '%' . $search . '%';
    $params  = array_merge($params, [$like, $like, $like]);
}
$whereClause = $where ? 'WHERE ' . implode(' AND ', $where) : '';

$dbError = null;
$total = 0; $totalPages = 1; $summary = []; $rows = []; $types = []; $statuses = [];

try {
    $total = (int)(portalQueryOne($db,
        "SELECT COUNT(*) AS cnt FROM equipment_items e {$whereClause}", $params
    )['cnt'] ?? 0);
    $totalPages = max(1, (int)ceil($total / $limit));

    $summary = portalQuery($db,
        "SELECT status, COUNT(*) AS cnt FROM equipment_items GROUP BY status ORDER BY status"
    );

    $rows = portalQuery($db,
        "SELECT e.id, e.name, e.brand, e.equipment_type, e.serial_number,
                e.status, e.purchase_date, e.last_service_date, e.notes,
                (SELECT CONCAT(m.first_name, ' ', m.last_name)
                 FROM members m WHERE m.internal_id = e.owner_member_id LIMIT 1) AS owner_name
         FROM equipment_items e
         {$whereClause}
         ORDER BY e.equipment_type, e.name
         LIMIT ? OFFSET ?",
        array_merge($params, [$limit, $offset])
    );

    $types    = portalQuery($db, "SELECT DISTINCT equipment_type FROM equipment_items WHERE equipment_type IS NOT NULL ORDER BY equipment_type");
    $statuses = portalQuery($db, "SELECT DISTINCT status FROM equipment_items WHERE status IS NOT NULL ORDER BY status");
} catch (Throwable $e) {
    error_log('equipment.php DB error: ' . $e->getMessage());
    $dbError = 'Udstyrsdata er ikke tilgængelig endnu. Tabellen mangler måske i databasen.';
}

$statusBadge = [
    'available'  => 'badge-active',
    'in_use'     => 'badge-trial',
    'maintenance'=> 'badge-admin',
    'retired'    => 'badge-inactive',
];

$portalPageTitle = 'Udstyr';
$portalNavActive = 'equipment';
include __DIR__ . '/../includes/layout.php';
?>

<?php if ($dbError): ?>
<div class="portal-card" style="border-left:4px solid #ef4444;">
  <div class="portal-card-body" style="color:#ef4444;"><?= e($dbError) ?></div>
</div>
<?php else: ?>
<div class="portal-stats-grid" style="margin-bottom:1.5rem;">
  <?php foreach ($summary as $s): ?>
  <div class="portal-stat-card">
    <div class="portal-stat-label"><?= e($s['status']) ?></div>
    <div class="portal-stat-value"><?= (int)$s['cnt'] ?></div>
  </div>
  <?php endforeach; ?>
</div>

<!-- Filters -->
<div class="portal-card" style="margin-bottom:1.5rem;">
  <div class="portal-card-body">
    <form method="GET" style="display:flex;flex-wrap:wrap;gap:1rem;align-items:flex-end;">
      <div class="portal-form-group" style="margin:0;flex:2;min-width:160px;">
        <label class="portal-label" for="q">Søg</label>
        <input class="portal-input" type="search" id="q" name="q" value="<?= e($search) ?>" placeholder="Navn, mærke, serienr...">
      </div>
      <div class="portal-form-group" style="margin:0;flex:1;min-width:130px;">
        <label class="portal-label" for="type">Type</label>
        <select class="portal-input" id="type" name="type">
          <option value="">Alle typer</option>
          <?php foreach ($types as $t): ?>
          <option value="<?= e($t['equipment_type']) ?>" <?= $type===$t['equipment_type']?'selected':'' ?>><?= e($t['equipment_type']) ?></option>
          <?php endforeach; ?>
        </select>
      </div>
      <div class="portal-form-group" style="margin:0;flex:1;min-width:130px;">
        <label class="portal-label" for="status">Status</label>
        <select class="portal-input" id="status" name="status">
          <option value="">Alle statuser</option>
          <?php foreach ($statuses as $s): ?>
          <option value="<?= e($s['status']) ?>" <?= $status===$s['status']?'selected':'' ?>><?= e($s['status']) ?></option>
          <?php endforeach; ?>
        </select>
      </div>
      <button type="submit" class="portal-btn portal-btn-primary">Søg</button>
      <a href="equipment.php" class="portal-btn portal-btn-ghost">Nulstil</a>
    </form>
  </div>
</div>

<div class="portal-card">
  <div class="portal-card-header">Udstyrsliste <span class="text-muted text-small"><?= $total ?> enheder</span></div>
  <div class="portal-table-wrap">
    <table class="portal-table">
      <thead>
        <tr>
          <th>Navn</th><th>Mærke</th><th>Type</th><th>Serienr.</th>
          <th>Status</th><th>Ejer</th><th>Købt</th><th>Seneste service</th><th>Bemærk.</th>
        </tr>
      </thead>
      <tbody>
        <?php if (empty($rows)): ?>
        <tr><td colspan="9" style="text-align:center;color:#6b7280;padding:2rem;">Ingen udstyr fundet.</td></tr>
        <?php endif; ?>
        <?php foreach ($rows as $r): ?>
        <tr>
          <td><strong><?= e($r['name']) ?></strong></td>
          <td><?= e($r['brand'] ?? '—') ?></td>
          <td><?= e($r['equipment_type'] ?? '—') ?></td>
          <td><code><?= $r['serial_number'] ? e($r['serial_number']) : '—' ?></code></td>
          <td><span class="badge <?= $statusBadge[$r['status']] ?? 'badge-inactive' ?>"><?= e($r['status']) ?></span></td>
          <td><?= $r['owner_name'] ? e($r['owner_name']) : '<span class="text-muted">Klubs</span>' ?></td>
          <td><?= $r['purchase_date'] ? e(date('d.m.Y', strtotime($r['purchase_date']))) : '—' ?></td>
          <td><?= $r['last_service_date'] ? e(date('d.m.Y', strtotime($r['last_service_date']))) : '—' ?></td>
          <td class="text-small text-muted"><?= $r['notes'] ? e(mb_strimwidth($r['notes'], 0, 60, '…')) : '' ?></td>
        </tr>
        <?php endforeach; ?>
      </tbody>
    </table>
  </div>
</div>

<?php if ($totalPages > 1): ?>
<nav class="portal-pagination">
  <?php $qBase = http_build_query(array_filter(['q'=>$search,'status'=>$status,'type'=>$type])); ?>
  <a href="?<?= $qBase ?>&page=<?= max(1,$page-1) ?>" class="portal-page-link <?= $page<=1?'disabled':'' ?>">‹</a>
  <?php for ($i=max(1,$page-3); $i<=min($totalPages,$page+3); $i++): ?>
  <a href="?<?= $qBase ?>&page=<?= $i ?>" class="portal-page-link <?= $i===$page?'current':'' ?>"><?= $i ?></a>
  <?php endfor; ?>
  <a href="?<?= $qBase ?>&page=<?= min($totalPages,$page+1) ?>" class="portal-page-link <?= $page>=$totalPages?'disabled':'' ?>">›</a>
</nav>
<?php endif; ?>

<?php endif; ?>

<?php layout_end(); ?>
