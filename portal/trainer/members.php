<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/includes/auth_guard.php';
requireRole('TRAINER');

$db         = portalDb();
$search     = trim($_GET['q'] ?? '');
$type       = $_GET['type'] ?? '';
$discipline = $_GET['discipline'] ?? '';
$limit      = 50;
$page       = max(1, (int)($_GET['page'] ?? 1));
$offset     = ($page - 1) * $limit;

$validTypes = ['FULL', 'TRIAL'];
if (!in_array($type, $validTypes, true)) $type = '';

// Distinct disciplines from practice_sessions
$validDisciplines = array_column(
    portalQuery($db, "SELECT DISTINCT practice_type FROM practice_sessions WHERE practice_type IS NOT NULL AND practice_type != '' ORDER BY practice_type"),
    'practice_type'
);
if (!in_array($discipline, $validDisciplines, true)) $discipline = '';

$where  = ["m.status = 'ACTIVE'"];
$params = [];
if ($search) {
    $where[]  = "(m.first_name LIKE ? OR m.last_name LIKE ? OR m.membership_id LIKE ?)";
    $like     = '%' . $search . '%';
    $params   = array_merge($params, [$like, $like, $like]);
}
if ($type)       { $where[] = 'm.member_type = ?';      $params[] = $type; }
if ($discipline) {
    // Only show members who have at least one session in this discipline
    $where[] = 'EXISTS (SELECT 1 FROM practice_sessions ps WHERE ps.internal_member_id = m.internal_id AND ps.practice_type = ?)';
    $params[] = $discipline;
}
$whereClause = 'WHERE ' . implode(' AND ', $where);

$total = (int)(portalQueryOne(
    $db,
    "SELECT COUNT(*) AS cnt FROM members m {$whereClause}",
    $params
)['cnt'] ?? 0);
$totalPages = max(1, (int)ceil($total / $limit));

// sessions_30d — scope to discipline when filtered
$sessCountSql = $discipline
    ? "SELECT COUNT(*) FROM practice_sessions WHERE internal_member_id = m.internal_id AND practice_type = '{$discipline}' AND local_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)"
    : "SELECT COUNT(*) FROM practice_sessions WHERE internal_member_id = m.internal_id AND local_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)";

$members = portalQuery(
    $db,
    "SELECT m.membership_id, m.first_name, m.last_name, m.member_type, m.internal_id,
            (SELECT MAX(local_date) FROM check_ins WHERE internal_member_id = m.internal_id) AS last_checkin,
            ({$sessCountSql}) AS sessions_30d
     FROM members m
     {$whereClause}
     ORDER BY m.last_name, m.first_name
     LIMIT ? OFFSET ?",
    array_merge($params, [$limit, $offset])
);

$portalPageTitle = 'Skytter';
$portalNavActive = 'members';
include __DIR__ . '/../includes/layout.php';
?>

<div class="portal-card" style="margin-bottom:1.5rem;">
  <div class="portal-card-body">
    <form method="GET" style="display:flex;flex-wrap:wrap;gap:1rem;align-items:flex-end;">
      <div class="portal-form-group" style="margin:0;flex:2;min-width:180px;">
        <label class="portal-label" for="q">Søg navn / nr.</label>
        <input class="portal-input" type="search" id="q" name="q" value="<?= e($search) ?>" placeholder="Søg...">
      </div>
      <div class="portal-form-group" style="margin:0;flex:1;min-width:130px;">
        <label class="portal-label" for="discipline">Disciplin</label>
        <select class="portal-input" id="discipline" name="discipline">
          <option value="">Alle</option>
          <?php foreach ($validDisciplines as $d): ?>
          <option value="<?= e($d) ?>" <?= $discipline === $d ? 'selected' : '' ?>><?= e($d) ?></option>
          <?php endforeach; ?>
        </select>
      </div>
      <div class="portal-form-group" style="margin:0;flex:1;min-width:130px;">
        <label class="portal-label" for="type">Medlemstype</label>
        <select class="portal-input" id="type" name="type">
          <option value="">Alle</option>
          <option value="FULL"  <?= $type==='FULL'?'selected':'' ?>>Fuldt</option>
          <option value="TRIAL" <?= $type==='TRIAL'?'selected':'' ?>>Prøve</option>
        </select>
      </div>
      <button type="submit" class="portal-btn portal-btn-primary">Søg</button>
      <a href="members.php" class="portal-btn portal-btn-ghost">Nulstil</a>
    </form>
  </div>
</div>

<div class="portal-card">
  <div class="portal-card-header">
    Aktive skytter<?= $discipline ? ' — ' . e($discipline) : '' ?>
    <span class="text-muted text-small"><?= $total ?> fundet</span>
  </div>
  <div class="portal-table-wrap">
    <table class="portal-table">
      <thead>
        <tr>
          <th>Navn</th><th>Nr.</th><th>Type</th>
          <th><?= $discipline ? e($discipline) . ' (30 dage)' : 'Sess. (30 dage)' ?></th>
          <th>Sidst check-in</th>
        </tr>
      </thead>
      <tbody>
        <?php if (empty($members)): ?>
        <tr><td colspan="5" style="text-align:center;color:#6b7280;padding:2rem;">Ingen skytter fundet.</td></tr>
        <?php endif; ?>
        <?php foreach ($members as $m): ?>
        <tr>
          <td data-sort-value="<?= e(($m['last_name'] ?? '') . ' ' . ($m['first_name'] ?? '')) ?>"><strong><?= e(($m['first_name'] ?? '') . ' ' . ($m['last_name'] ?? '')) ?></strong></td>
          <td><?= e((string)($m['membership_id'] ?? '')) ?></td>
          <td><span class="badge <?= ($m['member_type'] ?? '')==='FULL'?'badge-active':'badge-trial' ?>"><?= e((string)($m['member_type'] ?? '')) ?></span></td>
          <td><?= (int)$m['sessions_30d'] ?></td>
          <?php $ts = $m['last_checkin'] ? strtotime((string)$m['last_checkin']) : false; ?>
          <td data-sort-value="<?= $ts !== false ? date('Y-m-d', $ts) : '' ?>"><?= $ts !== false ? e(date('d.m.Y', $ts)) : '—' ?></td>
        </tr>
        <?php endforeach; ?>
      </tbody>
    </table>
  </div>
  <?php if ($totalPages > 1): ?>
  <div style="padding:.75rem 1.5rem; border-top:1px solid rgba(0,0,0,.06);">
    <nav class="portal-pagination" style="margin-top:0;">
      <?php $qBase = http_build_query(array_filter(['q' => $search, 'type' => $type, 'discipline' => $discipline])); ?>
      <a href="?<?= $qBase ?>&page=<?= max(1,$page-1) ?>" class="portal-page-link <?= $page<=1?'disabled':'' ?>">‹</a>
      <?php for ($i=max(1,$page-3); $i<=min($totalPages,$page+3); $i++): ?>
      <a href="?<?= $qBase ?>&page=<?= $i ?>" class="portal-page-link <?= $i===$page?'current':'' ?>"><?= $i ?></a>
      <?php endfor; ?>
      <a href="?<?= $qBase ?>&page=<?= min($totalPages,$page+1) ?>" class="portal-page-link <?= $page>=$totalPages?'disabled':'' ?>">›</a>
    </nav>
  </div>
  <?php endif; ?>
</div>

<?php layout_end(); ?>
