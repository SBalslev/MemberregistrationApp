<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/includes/auth_guard.php';
requireRole('ADMIN');
logPortalAccess('VIEW_FINANCIAL');

$db = portalAdminDb();

$currentYear   = (int)date('Y');
$selectedYear  = (int)($_GET['year'] ?? $currentYear);
$selectedCat   = trim($_GET['cat'] ?? '');

$dbError = null;
$years = []; $totals = ['total_income' => 0, 'total_expense' => 0];
$byCategory = []; $memberFees = []; $transactions = [];
$totalTx = 0; $totalPages = 1; $cats = [];

try {
    $years = portalQuery($db,
        "SELECT DISTINCT fiscal_year FROM financial_transactions WHERE is_deleted = 0 ORDER BY fiscal_year DESC"
    );

    $totals = portalQueryOne($db,
        "SELECT
            COALESCE(SUM(bank_in), 0)  + COALESCE(SUM(cash_in), 0)  AS total_income,
            COALESCE(SUM(bank_out), 0) + COALESCE(SUM(cash_out), 0) AS total_expense
         FROM financial_transactions
         WHERE fiscal_year = ? AND is_deleted = 0",
        [$selectedYear]
    ) ?? ['total_income' => 0, 'total_expense' => 0];

    $where  = ['fiscal_year = ?', 'is_deleted = 0'];
    $params = [$selectedYear];
    if ($selectedCat) { $where[] = 'category = ?'; $params[] = $selectedCat; }
    $whereClause = 'WHERE ' . implode(' AND ', $where);

    $byCategory = portalQuery($db,
        "SELECT category,
                COALESCE(SUM(bank_in),0)  + COALESCE(SUM(cash_in),0)  AS income,
                COALESCE(SUM(bank_out),0) + COALESCE(SUM(cash_out),0) AS expense
         FROM financial_transactions
         {$whereClause}
         GROUP BY category
         ORDER BY income DESC, expense DESC",
        $params
    );

    $memberFees = portalQuery($db,
        "SELECT m.first_name, m.last_name, m.membership_id, m.member_fee_type,
                pfp.amount, pfp.paid_at, pfp.fiscal_year
         FROM pending_fee_payments pfp
         JOIN members m ON m.internal_id = pfp.member_id
         WHERE pfp.fiscal_year = ? AND pfp.is_consolidated = 1
         ORDER BY pfp.paid_at DESC",
        [$selectedYear]
    );

    $limit  = 50;
    $page   = max(1, (int)($_GET['page'] ?? 1));
    $offset = ($page - 1) * $limit;

    $totalTx = (int)(portalQueryOne($db,
        "SELECT COUNT(*) AS cnt FROM financial_transactions {$whereClause}", $params
    )['cnt'] ?? 0);
    $totalPages = max(1, (int)ceil($totalTx / $limit));

    $transactions = portalQuery($db,
        "SELECT id, transaction_date, category, description,
                COALESCE(bank_in,0)  + COALESCE(cash_in,0)  AS income,
                COALESCE(bank_out,0) + COALESCE(cash_out,0) AS expense,
                notes
         FROM financial_transactions
         {$whereClause}
         ORDER BY transaction_date DESC
         LIMIT ? OFFSET ?",
        array_merge($params, [$limit, $offset])
    );

    $cats = portalQuery($db,
        "SELECT DISTINCT category FROM financial_transactions WHERE fiscal_year = ? AND is_deleted = 0 AND category IS NOT NULL ORDER BY category",
        [$selectedYear]
    );
} catch (Throwable $e) {
    error_log('finance.php DB error: ' . $e->getMessage());
    $dbError = 'Økonomidata er ikke tilgængelig endnu. Tabellen mangler måske i databasen.';
}

$limit      = $limit      ?? 50;
$page       = $page       ?? 1;
$whereClause = $whereClause ?? 'WHERE fiscal_year = ? AND is_deleted = 0';
$params     = $params      ?? [$selectedYear];

$net     = (float)$totals['total_income'] - (float)$totals['total_expense'];
$netSign = $net >= 0 ? 'success' : 'danger';

$portalPageTitle = 'Økonomi';
$portalNavActive = 'finance';
include __DIR__ . '/../includes/layout.php';

function fmtKr(float $v): string {
    return number_format($v, 2, ',', '.') . ' kr.';
}
?>

<?php if ($dbError): ?>
<div class="portal-card" style="border-left:4px solid #ef4444;">
  <div class="portal-card-body" style="color:#ef4444;"><?= e($dbError) ?></div>
</div>
<?php layout_end(); ?>
<?php return; endif; ?>

<!-- Year / category filter -->
<div class="portal-card" style="margin-bottom:1.5rem;">
  <div class="portal-card-body">
    <form method="GET" style="display:flex;flex-wrap:wrap;gap:1rem;align-items:flex-end;">
      <div class="portal-form-group" style="margin:0;">
        <label class="portal-label" for="year">Regnskabsår</label>
        <select class="portal-input" id="year" name="year">
          <?php foreach ($years as $y): ?>
          <option value="<?= (int)$y['fiscal_year'] ?>" <?= (int)$y['fiscal_year']===$selectedYear?'selected':'' ?>><?= (int)$y['fiscal_year'] ?></option>
          <?php endforeach; ?>
        </select>
      </div>
      <div class="portal-form-group" style="margin:0;min-width:160px;">
        <label class="portal-label" for="cat">Kategori</label>
        <select class="portal-input" id="cat" name="cat">
          <option value="">Alle kategorier</option>
          <?php foreach ($cats as $c): ?>
          <option value="<?= e($c['category']) ?>" <?= $selectedCat===$c['category']?'selected':'' ?>><?= e($c['category']) ?></option>
          <?php endforeach; ?>
        </select>
      </div>
      <button type="submit" class="portal-btn portal-btn-primary">Vis</button>
    </form>
  </div>
</div>

<!-- Totals -->
<div class="portal-stats-grid" style="margin-bottom:1.5rem;">
  <div class="portal-stat-card">
    <div class="portal-stat-label">Indtægter <?= $selectedYear ?></div>
    <div class="portal-stat-value success"><?= fmtKr((float)$totals['total_income']) ?></div>
  </div>
  <div class="portal-stat-card">
    <div class="portal-stat-label">Udgifter <?= $selectedYear ?></div>
    <div class="portal-stat-value danger"><?= fmtKr((float)$totals['total_expense']) ?></div>
  </div>
  <div class="portal-stat-card">
    <div class="portal-stat-label">Resultat</div>
    <div class="portal-stat-value <?= $netSign ?>"><?= fmtKr($net) ?></div>
  </div>
</div>

<!-- By category -->
<div class="portal-card" style="margin-bottom:1.5rem;">
  <div class="portal-card-header">Pr. kategori</div>
  <div class="portal-table-wrap">
    <table class="portal-table">
      <thead><tr><th>Kategori</th><th class="text-right">Indtægt</th><th class="text-right">Udgift</th><th class="text-right">Netto</th></tr></thead>
      <tbody>
        <?php if (empty($byCategory)): ?>
        <tr><td colspan="4" style="text-align:center;color:#6b7280;padding:2rem;">Ingen data for dette år.</td></tr>
        <?php endif; ?>
        <?php foreach ($byCategory as $cat): ?>
        <?php $catNet = (float)$cat['income'] - (float)$cat['expense']; ?>
        <tr>
          <td><?= e($cat['category'] ?? 'Ukendt') ?></td>
          <td class="text-right text-small"><?= $cat['income'] > 0 ? fmtKr((float)$cat['income']) : '—' ?></td>
          <td class="text-right text-small"><?= $cat['expense'] > 0 ? fmtKr((float)$cat['expense']) : '—' ?></td>
          <td class="text-right text-small <?= $catNet>=0?'text-success':'text-danger' ?>"><?= fmtKr($catNet) ?></td>
        </tr>
        <?php endforeach; ?>
      </tbody>
    </table>
  </div>
</div>

<!-- Membership fee payments -->
<?php if ($memberFees): ?>
<div class="portal-card" style="margin-bottom:1.5rem;">
  <div class="portal-card-header">Indbetalte kontingenter <?= $selectedYear ?> (<?= count($memberFees) ?>)</div>
  <div class="portal-table-wrap">
    <table class="portal-table">
      <thead><tr><th>Navn</th><th>Nr.</th><th>Kontingenttype</th><th class="text-right">Beløb</th><th>Betalt</th></tr></thead>
      <tbody>
        <?php foreach ($memberFees as $f): ?>
        <tr>
          <td><?= e($f['first_name'] . ' ' . $f['last_name']) ?></td>
          <td><?= e($f['membership_id']) ?></td>
          <td><?= e(feeTypeLabel($f['member_fee_type'] ?? null)) ?></td>
          <td class="text-right"><?= fmtKr((float)$f['amount']) ?></td>
          <td class="text-small"><?= $f['paid_at'] ? e(date('d.m.Y', strtotime($f['paid_at']))) : '—' ?></td>
        </tr>
        <?php endforeach; ?>
      </tbody>
    </table>
  </div>
</div>
<?php endif; ?>

<!-- Transaction list -->
<div class="portal-card">
  <div class="portal-card-header">
    Posteringer <?= $selectedYear ?>
    <span class="text-muted text-small"><?= $totalTx ?> i alt</span>
  </div>
  <div class="portal-table-wrap">
    <table class="portal-table">
      <thead><tr><th>Dato</th><th>Kategori</th><th>Beskrivelse</th><th class="text-right">Indtægt</th><th class="text-right">Udgift</th><th>Note</th></tr></thead>
      <tbody>
        <?php if (empty($transactions)): ?>
        <tr><td colspan="6" style="text-align:center;color:#6b7280;padding:2rem;">Ingen posteringer fundet.</td></tr>
        <?php endif; ?>
        <?php foreach ($transactions as $tx): ?>
        <tr>
          <td><?= e(date('d.m.Y', strtotime($tx['transaction_date']))) ?></td>
          <td><?= e($tx['category'] ?? '—') ?></td>
          <td><?= e($tx['description'] ?? '') ?></td>
          <td class="text-right text-small text-success"><?= $tx['income'] > 0 ? fmtKr((float)$tx['income']) : '' ?></td>
          <td class="text-right text-small text-danger"><?= $tx['expense'] > 0 ? fmtKr((float)$tx['expense']) : '' ?></td>
          <td class="text-small text-muted"><?= $tx['notes'] ? e(mb_strimwidth($tx['notes'], 0, 50, '…')) : '' ?></td>
        </tr>
        <?php endforeach; ?>
      </tbody>
    </table>
  </div>
</div>

<?php if ($totalPages > 1): ?>
<nav class="portal-pagination">
  <?php $qBase = http_build_query(array_filter(['year'=>$selectedYear,'cat'=>$selectedCat])); ?>
  <a href="?<?= $qBase ?>&page=<?= max(1,$page-1) ?>" class="portal-page-link <?= $page<=1?'disabled':'' ?>">‹</a>
  <?php for ($i=max(1,$page-3); $i<=min($totalPages,$page+3); $i++): ?>
  <a href="?<?= $qBase ?>&page=<?= $i ?>" class="portal-page-link <?= $i===$page?'current':'' ?>"><?= $i ?></a>
  <?php endfor; ?>
  <a href="?<?= $qBase ?>&page=<?= min($totalPages,$page+1) ?>" class="portal-page-link <?= $page>=$totalPages?'disabled':'' ?>">›</a>
</nav>
<?php endif; ?>

<?php layout_end(); ?>
