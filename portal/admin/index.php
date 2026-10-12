<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/includes/auth_guard.php';
requireRole('ADMIN');

$db      = portalDb();
$adminDb = portalAdminDb();

$stats = portalQueryOne($db,
    "SELECT
        SUM(status = 'ACTIVE')   AS active,
        SUM(status = 'INACTIVE') AS inactive,
        SUM(member_type = 'TRIAL' AND status = 'ACTIVE') AS trial_active,
        SUM(email IS NULL OR email = '') AS no_email
     FROM members"
);

$trainers = (int)(portalQueryOne($db,
    "SELECT COUNT(*) AS cnt FROM trainer_info WHERE is_trainer = 1"
)['cnt'] ?? 0);

$checkinToday = (int)(portalQueryOne($db,
    "SELECT COUNT(DISTINCT internal_member_id) AS cnt FROM check_ins WHERE local_date = CURDATE()"
)['cnt'] ?? 0);

$sessionsTodayCount = (int)(portalQueryOne($db,
    "SELECT COUNT(*) AS cnt FROM practice_sessions WHERE local_date = CURDATE()"
)['cnt'] ?? 0);

// Pending fee payments
$unpaidFees = (int)(portalQueryOne($adminDb,
    "SELECT COUNT(*) AS cnt FROM pending_fee_payments WHERE is_consolidated = 0"
)['cnt'] ?? 0);

// This year's income/expense summary
$currentYear = (int)date('Y');
$financeSummary = portalQueryOne($adminDb,
    "SELECT
        COALESCE(SUM(bank_in), 0)  + COALESCE(SUM(cash_in), 0)  AS total_income,
        COALESCE(SUM(bank_out), 0) + COALESCE(SUM(cash_out), 0) AS total_expense
     FROM financial_transactions
     WHERE fiscal_year = ? AND is_deleted = 0",
    [$currentYear]
);

$portalPageTitle = 'Admin — Oversigt';
$portalNavActive = 'index';
include __DIR__ . '/../includes/layout.php';
?>

<div class="portal-stats-grid">
  <div class="portal-stat-card">
    <div class="portal-stat-label">Aktive medlemmer</div>
    <div class="portal-stat-value"><?= (int)$stats['active'] ?></div>
    <div class="portal-stat-sub"><?= (int)$stats['trial_active'] ?> prøvemedlemmer</div>
  </div>
  <div class="portal-stat-card">
    <div class="portal-stat-label">Inaktive medlemmer</div>
    <div class="portal-stat-value danger"><?= (int)$stats['inactive'] ?></div>
  </div>
  <div class="portal-stat-card">
    <div class="portal-stat-label">Skytter i dag</div>
    <div class="portal-stat-value accent"><?= $checkinToday ?></div>
    <div class="portal-stat-sub"><?= $sessionsTodayCount ?> sessioner</div>
  </div>
  <div class="portal-stat-card">
    <div class="portal-stat-label">Aktive trænere</div>
    <div class="portal-stat-value success"><?= $trainers ?></div>
  </div>
  <div class="portal-stat-card">
    <div class="portal-stat-label">Ubetalt kontingent</div>
    <div class="portal-stat-value <?= $unpaidFees > 0 ? 'danger' : 'success' ?>"><?= $unpaidFees ?></div>
  </div>
  <div class="portal-stat-card">
    <div class="portal-stat-label">Uden e-mail</div>
    <div class="portal-stat-value <?= $stats['no_email'] > 0 ? 'accent' : '' ?>"><?= (int)$stats['no_email'] ?></div>
    <div class="portal-stat-sub no-email-flag">⚠ Kan ikke nulstille kode</div>
  </div>
</div>

<?php if ($financeSummary): ?>
<div class="portal-card" style="margin-bottom:1.5rem;">
  <div class="portal-card-header">Økonomi <?= $currentYear ?></div>
  <div class="portal-card-body" style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;">
    <div>
      <div class="portal-stat-label">Indtægter</div>
      <div class="portal-stat-value success"><?= number_format((float)$financeSummary['total_income'], 2, ',', '.') ?> kr.</div>
    </div>
    <div>
      <div class="portal-stat-label">Udgifter</div>
      <div class="portal-stat-value danger"><?= number_format((float)$financeSummary['total_expense'], 2, ',', '.') ?> kr.</div>
    </div>
  </div>
</div>
<?php endif; ?>

<div style="display:flex;flex-wrap:wrap;gap:.75rem;">
  <a href="members.php"  class="portal-btn portal-btn-primary">Vis alle medlemmer</a>
  <a href="trainers.php" class="portal-btn portal-btn-ghost">Trænere &amp; roller</a>
  <a href="skv.php"      class="portal-btn portal-btn-ghost">SKV registreringer</a>
  <a href="finance.php"  class="portal-btn portal-btn-ghost">Økonomi detaljer</a>
  <a href="equipment.php"class="portal-btn portal-btn-ghost">Udstyr</a>
</div>

<?php layout_end(); ?>
