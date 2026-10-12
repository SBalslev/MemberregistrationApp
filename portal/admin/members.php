<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/includes/auth_guard.php';
requireRole('ADMIN');
logPortalAccess('VIEW_MEMBERS_LIST');

$db     = portalDb();
$writer = portalWriterDb();
$user   = portalUser();

$search = trim($_GET['q'] ?? '');
$status = $_GET['status'] ?? '';
$type   = $_GET['type'] ?? '';
$limit  = 25;
$page   = max(1, (int)($_GET['page'] ?? 1));
$offset = ($page - 1) * $limit;

// Load actual distinct values from DB for dropdowns — avoids hardcoded enum mismatches
$distinctStatuses = array_column(
    portalQuery($db, "SELECT DISTINCT status FROM members WHERE status IS NOT NULL AND status != '' ORDER BY status"),
    'status'
);
$distinctTypes = array_column(
    portalQuery($db, "SELECT DISTINCT member_type FROM members WHERE member_type IS NOT NULL AND member_type != '' ORDER BY member_type"),
    'member_type'
);

// Validate against real DB values (empty string = no filter, always valid)
$validStatuses = array_merge([''], $distinctStatuses);
$validTypes    = array_merge([''], $distinctTypes);
if (!in_array($status, $validStatuses, true)) $status = 'ACTIVE';
if (!in_array($type,   $validTypes,   true)) $type   = '';

// -----------------------------------------------------------------------
// POST — admin reset password action
// -----------------------------------------------------------------------
$resetMsg = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrfValidate();
    $action   = $_POST['action'] ?? '';
    $targetId = $_POST['member_id'] ?? '';

    if ($action === 'reset_password' && $targetId) {
        // Verify target member exists
        $target = portalQueryOne($db,
            "SELECT internal_id, first_name, last_name FROM members WHERE internal_id = ?",
            [$targetId]
        );
        if ($target) {
            portalExecute($writer,
                "UPDATE portal_users
                 SET password_hash = NULL, session_version = session_version + 1
                 WHERE member_id = ?",
                [$targetId]
            );
            logPortalAccess('RESET_PASSWORD', $targetId);
            $resetMsg = 'Adgangskode nulstillet for ' .
                htmlspecialchars($target['first_name'] . ' ' . $target['last_name'], ENT_QUOTES, 'UTF-8') .
                '. Medlemmet skal sætte ny kode ved næste login.';
        }
    }

    // Email export — returns JSON for JS clipboard copy
    if ($action === 'export_emails') {
        $exportWhere  = [];
        $exportParams = [];
        $exportStatus = $_POST['filter_status'] ?? '';
        $exportType   = $_POST['filter_type']   ?? '';
        $exportSearch = trim($_POST['filter_q']  ?? '');
        if ($exportStatus && in_array($exportStatus, $validStatuses, true)) {
            $exportWhere[] = 'm.status = ?'; $exportParams[] = $exportStatus;
        }
        if ($exportType && in_array($exportType, $validTypes, true)) {
            $exportWhere[] = 'm.member_type = ?'; $exportParams[] = $exportType;
        }
        if ($exportSearch) {
            $exportWhere[] = "(m.first_name LIKE ? OR m.last_name LIKE ? OR m.membership_id LIKE ? OR m.email LIKE ?)";
            $like = '%' . $exportSearch . '%';
            $exportParams = array_merge($exportParams, [$like, $like, $like, $like]);
        }
        $exportWhere[] = "m.email IS NOT NULL AND m.email != ''";
        $wc = $exportWhere ? 'WHERE ' . implode(' AND ', $exportWhere) : '';
        $rows = portalQuery($db,
            "SELECT m.email, m.first_name, m.last_name FROM members m {$wc} ORDER BY m.first_name, m.last_name",
            $exportParams
        );
        logPortalAccess('EXPORT_EMAILS');
        header('Content-Type: application/json; charset=UTF-8');
        echo json_encode(array_map(fn($r) => $r['email'], $rows));
        exit;
    }
}

$where  = [];
$params = [];
if ($status) { $where[] = 'm.status = ?';       $params[] = $status; }
if ($type)   { $where[] = 'm.member_type = ?';  $params[] = $type; }
if ($search) {
    $where[] = "(m.first_name LIKE ? OR m.last_name LIKE ? OR m.membership_id LIKE ? OR m.email LIKE ?)";
    $like    = '%' . $search . '%';
    $params  = array_merge($params, [$like, $like, $like, $like]);
}
$whereClause = $where ? 'WHERE ' . implode(' AND ', $where) : '';

$total = (int)(portalQueryOne($db,
    "SELECT COUNT(*) AS cnt FROM members m {$whereClause}", $params
)['cnt'] ?? 0);
$totalPages = max(1, (int)ceil($total / $limit));

$members = portalQuery($db,
    "SELECT m.internal_id, m.membership_id, m.first_name, m.last_name,
            m.email, m.phone, m.member_type, m.status,
            m.member_fee_type, m.expires_on,
            pu.role AS portal_role, pu.password_hash,
            (m.email IS NULL OR m.email = '') AS no_email
     FROM members m
     LEFT JOIN portal_users pu ON pu.member_id = m.internal_id
     {$whereClause}
     ORDER BY m.first_name, m.last_name
     LIMIT ? OFFSET ?",
    array_merge($params, [$limit, $offset])
);


// Email export — all matching members (no pagination), only those with an email
$emailWhere  = $where;
$emailParams = $params;
$emailWhere[] = "m.email IS NOT NULL AND m.email != ''";
$emailWhereClause = 'WHERE ' . implode(' AND ', $emailWhere);
$exportEmails = portalQuery($db,
    "SELECT m.email, m.first_name, m.last_name
     FROM members m {$emailWhereClause}
     ORDER BY m.first_name, m.last_name",
    $emailParams
);
$portalPageTitle = 'Medlemmer';
$portalNavActive = 'members';
include __DIR__ . '/../includes/layout.php';
?>

<?php if ($resetMsg): ?>
<div class="portal-alert portal-alert-success"><?= $resetMsg ?></div>
<?php endif; ?>

<!-- Filters -->
<div class="portal-card" style="margin-bottom:1.5rem;">
  <div class="portal-card-body">
    <form method="GET" style="display:flex;flex-wrap:wrap;gap:1rem;align-items:flex-end;">
      <div class="portal-form-group" style="margin:0;flex:2;min-width:180px;">
        <label class="portal-label" for="q">Søg</label>
        <input class="portal-input" type="search" id="q" name="q" value="<?= e($search) ?>" placeholder="Navn, nr., e-mail...">
      </div>
      <div class="portal-form-group" style="margin:0;flex:1;min-width:120px;">
        <label class="portal-label" for="status">Status</label>
        <select class="portal-input" id="status" name="status">
          <option value="">Alle</option>
          <?php foreach ($distinctStatuses as $s): ?>
          <option value="<?= e($s) ?>" <?= $status===$s?'selected':'' ?>><?= e(ucfirst(strtolower($s))) ?></option>
          <?php endforeach; ?>
        </select>
      </div>
      <div class="portal-form-group" style="margin:0;flex:1;min-width:120px;">
        <label class="portal-label" for="type">Type</label>
        <select class="portal-input" id="type" name="type">
          <option value="">Alle</option>
          <?php foreach ($distinctTypes as $t): ?>
          <option value="<?= e($t) ?>" <?= $type===$t?'selected':'' ?>><?= e(ucfirst(strtolower($t))) ?></option>
          <?php endforeach; ?>
        </select>
      </div>
      <button type="submit" class="portal-btn portal-btn-primary">Søg</button>
      <a href="members.php" class="portal-btn portal-btn-ghost">Nulstil</a>
    </form>
  </div>
</div>

<div class="portal-card">
  <div class="portal-card-header">
    Medlemsliste
    <span class="text-muted text-small"><?= $total ?> fundet</span>
    <button type="button" id="exportEmailsBtn" class="portal-btn portal-btn-ghost portal-btn-sm"
            style="margin-left:.5rem;"
            title="Kopier alle e-mails fra nuværende filter til udklipsholderen">
      📋 Kopier e-mails
    </button>
    <button type="button" id="toggleContactBtn" class="portal-btn portal-btn-ghost portal-btn-sm"
            style="margin-left:.25rem;">
      👁 Vis kontakt
    </button>
  </div>
  <div class="portal-table-wrap">
    <table class="portal-table" id="membersTable">
      <thead>
        <tr>
          <th>Navn</th><th>Nr.</th>
          <th class="contact-col">E-mail</th><th class="contact-col">Telefon</th>
          <th>Type</th><th>Status</th><th>Kontingent</th><th>Udløber</th><th>Portal</th><th data-no-sort>Handling</th>
        </tr>
      </thead>
      <tbody>
        <?php if (empty($members)): ?>
        <tr><td colspan="10" style="text-align:center;color:#6b7280;padding:2rem;">Ingen medlemmer fundet.</td></tr>
        <?php endif; ?>
        <?php foreach ($members as $m): ?>
        <tr>
          <td data-sort-value="<?= e($m['first_name'] . ' ' . $m['last_name']) ?>">
            <strong><?= e($m['first_name'] . ' ' . $m['last_name']) ?></strong>
            <?php if ($m['no_email']): ?>
            <span class="no-email-flag" title="Ingen e-mail — kan ikke nulstille kode">⚠</span>
            <?php endif; ?>
          </td>
          <td><?= e($m['membership_id']) ?></td>
          <td class="contact-col contact-masked"><?= $m['email'] ? e($m['email']) : '<span class="text-muted">—</span>' ?></td>
          <td class="contact-col contact-masked"><?= $m['phone'] ? e($m['phone']) : '<span class="text-muted">—</span>' ?></td>
          <td><span class="badge <?= ($m['member_type'] ?? '')==='FULL'?'badge-active':'badge-trial' ?>"><?= e((string)($m['member_type'] ?? '')) ?></span></td>
          <td><span class="badge <?= ($m['status'] ?? '')==='ACTIVE'?'badge-active':'badge-inactive' ?>"><?= e((string)($m['status'] ?? '')) ?></span></td>
          <td><?= e(feeTypeLabel($m['member_fee_type'] ?? null)) ?></td>
          <?php $ts = $m['expires_on'] ? strtotime((string)$m['expires_on']) : false; ?>
          <td><?= ($ts !== false) ? e(date('d.m.Y', $ts)) : '—' ?></td>
          <td>
            <?php if ($m['portal_role']): ?>
            <span class="badge badge-<?= strtolower(e($m['portal_role'])) ?>"><?= e($m['portal_role']) ?></span>
            <?php else: ?>
            <span class="text-muted text-small">Ingen</span>
            <?php endif; ?>
          </td>
          <td>
            <form method="POST" class="js-confirm-reset" data-member-name="<?= e($m['first_name'] . ' ' . $m['last_name']) ?>" style="display:inline;">
              <input type="hidden" name="csrf_token" value="<?= e(csrfToken()) ?>">
              <input type="hidden" name="action"    value="reset_password">
              <input type="hidden" name="member_id" value="<?= e($m['internal_id']) ?>">
              <button type="submit" class="portal-btn portal-btn-ghost portal-btn-sm"
                      title="Nulstil adgangskode">
                Nulstil kode
              </button>
            </form>
          </td>
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

<?php layout_end(); ?>
