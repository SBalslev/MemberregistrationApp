<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/includes/auth_guard.php';
requireRole('ADMIN');

$db     = portalDb();
$writer = portalWriterDb();
$user   = portalUser();

$msg = '';

// -----------------------------------------------------------------------
// POST — role elevation
// -----------------------------------------------------------------------
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrfValidate();
    $action   = $_POST['action'] ?? '';
    $targetId = $_POST['member_id'] ?? '';
    $newRole  = $_POST['new_role'] ?? '';
    $reason   = trim($_POST['reason'] ?? '');
    $validRoles = ['MEMBER', 'TRAINER', 'ADMIN'];

    if ($action === 'set_role' && $targetId && in_array($newRole, $validRoles, true)) {
        $target = portalQueryOne($db,
            "SELECT pu.id AS portal_id, pu.role AS current_role, m.first_name, m.last_name
             FROM portal_users pu
             JOIN members m ON m.internal_id = pu.member_id
             WHERE pu.member_id = ?",
            [$targetId]
        );
        if ($target && $target['current_role'] !== $newRole) {
            portalExecute($writer,
                "UPDATE portal_users SET role = ? WHERE member_id = ?",
                [$newRole, $targetId]
            );
            portalExecute($writer,
                "INSERT INTO portal_role_audit (member_id, old_role, new_role, changed_by, ip, reason, changed_at)
                 VALUES (?, ?, ?, ?, ?, ?, NOW())",
                [$targetId, $target['current_role'], $newRole, $user['member_id'], _trainerClientIp(), $reason]
            );
            logPortalAccess('ELEVATE_ROLE', $targetId);
            $name = htmlspecialchars($target['first_name'] . ' ' . $target['last_name'], ENT_QUOTES, 'UTF-8');
            $msg  = "Rolle for {$name} ændret til {$newRole}.";
        }
    }
}

// All members with portal accounts and trainer_info
$trainers = portalQuery($db,
    "SELECT m.internal_id, m.membership_id, m.first_name, m.last_name,
            ti.is_trainer, ti.has_skydeleder_certificate, ti.certified_date,
            pu.role AS portal_role
     FROM trainer_info ti
     JOIN members m ON m.internal_id = ti.internal_member_id
     LEFT JOIN portal_users pu ON pu.member_id = m.internal_id
     WHERE ti.is_trainer = 1
     ORDER BY m.last_name, m.first_name"
);

// Their disciplines
$trainerIds  = array_column($trainers, 'internal_id');
$disciplines = [];
if ($trainerIds) {
    $placeholders = implode(',', array_fill(0, count($trainerIds), '?'));
    $discRows     = portalQuery($db,
        "SELECT internal_member_id, discipline, level, certified_date
         FROM trainer_disciplines WHERE internal_member_id IN ({$placeholders})",
        $trainerIds
    );
    foreach ($discRows as $d) {
        $disciplines[$d['internal_member_id']][] = $d;
    }
}

// Portal users with TRAINER or ADMIN role (for role management)
$portalUsers = portalQuery($db,
    "SELECT pu.member_id, pu.role, m.first_name, m.last_name, m.membership_id
     FROM portal_users pu
     JOIN members m ON m.internal_id = pu.member_id
     WHERE pu.role IN ('TRAINER','ADMIN') AND pu.is_active = 1
     ORDER BY pu.role, m.last_name"
);

function _trainerClientIp(): string {
    $trusted = ['127.0.0.1','::1'];
    $addr    = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    if (in_array($addr, $trusted, true) && !empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
        foreach (array_map('trim', explode(',', $_SERVER['HTTP_X_FORWARDED_FOR'])) as $ip) {
            if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE|FILTER_FLAG_NO_RES_RANGE)) return $ip;
        }
    }
    return $addr;
}

$portalPageTitle = 'Trænere &amp; roller';
$portalNavActive = 'trainers';
include __DIR__ . '/../includes/layout.php';
?>

<?php if ($msg): ?>
<div class="portal-alert portal-alert-success"><?= $msg ?></div>
<?php endif; ?>

<!-- Trainer list -->
<div class="portal-card" style="margin-bottom:1.5rem;">
  <div class="portal-card-header">Registrerede trænere</div>
  <div class="portal-table-wrap">
    <table class="portal-table">
      <thead><tr><th>Navn</th><th>Nr.</th><th>Skydeleder</th><th>Cert. dato</th><th>Discipliner</th><th>Portal-rolle</th></tr></thead>
      <tbody>
        <?php if (empty($trainers)): ?>
        <tr><td colspan="6" style="text-align:center;color:#6b7280;padding:2rem;">Ingen trænere registreret.</td></tr>
        <?php endif; ?>
        <?php foreach ($trainers as $t): ?>
        <tr>
          <td data-sort-value="<?= e($t['last_name'] . ' ' . $t['first_name']) ?>"><strong><?= e($t['first_name'] . ' ' . $t['last_name']) ?></strong></td>
          <td><?= $t['certified_date'] ? e(date('d.m.Y', strtotime($t['certified_date']))) : '—' ?></td>
          <td>
            <?php foreach ($disciplines[$t['internal_id']] ?? [] as $d): ?>
            <span class="badge badge-member" style="margin-right:.2rem;"><?= e($d['discipline']) ?><?= $d['level'] ? ' · '.e($d['level']) : '' ?></span>
            <?php endforeach; ?>
          </td>
          <td>
            <?php if ($t['portal_role']): ?>
            <span class="badge badge-<?= strtolower(e($t['portal_role'])) ?>"><?= e($t['portal_role']) ?></span>
            <?php else: ?>
            <span class="text-muted text-small">Ingen konto</span>
            <?php endif; ?>
          </td>
        </tr>
        <?php endforeach; ?>
      </tbody>
    </table>
  </div>
</div>

<!-- Role management -->
<div class="portal-card">
  <div class="portal-card-header">Portalroller (TRAINER / ADMIN)</div>
  <div class="portal-table-wrap">
    <table class="portal-table">
      <thead><tr><th>Navn</th><th>Nr.</th><th>Nuværende rolle</th><th data-no-sort>Skift rolle</th></tr></thead>
      <tbody>
        <?php if (empty($portalUsers)): ?>
        <tr><td colspan="4" style="text-align:center;color:#6b7280;padding:2rem;">Ingen TRAINER/ADMIN roller tildelt endnu.</td></tr>
        <?php endif; ?>
        <?php foreach ($portalUsers as $pu): ?>
        <tr>
          <td data-sort-value="<?= e($pu['last_name'] . ' ' . $pu['first_name']) ?>"><?= e($pu['first_name'] . ' ' . $pu['last_name']) ?></td>
          <td><?= e($pu['membership_id']) ?></td>
          <td><span class="badge badge-<?= strtolower(e($pu['role'])) ?>"><?= e($pu['role']) ?></span></td>
          <td>
            <form method="POST" style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;"
                  onsubmit="return confirm('Skift rolle?')">
              <input type="hidden" name="csrf_token" value="<?= e(csrfToken()) ?>">
              <input type="hidden" name="action"    value="set_role">
              <input type="hidden" name="member_id" value="<?= e($pu['member_id']) ?>">
              <select name="new_role" class="portal-input" style="width:auto;padding:.3rem .5rem;">
                <option value="MEMBER">MEMBER</option>
                <option value="TRAINER" <?= $pu['role']==='TRAINER'?'selected':'' ?>>TRAINER</option>
                <option value="ADMIN"   <?= $pu['role']==='ADMIN'?'selected':'' ?>>ADMIN</option>
              </select>
              <input type="text" name="reason" class="portal-input" style="width:140px;padding:.3rem .5rem;" placeholder="Begrundelse">
              <button type="submit" class="portal-btn portal-btn-accent portal-btn-sm">Gem</button>
            </form>
          </td>
        </tr>
        <?php endforeach; ?>
      </tbody>
    </table>
  </div>
</div>

<?php layout_end(); ?>
