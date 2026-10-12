<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/includes/auth_guard.php';
requireRole('MEMBER');

$user   = portalUser();
$db     = portalDb();
$member = portalQueryOne(
    $db,
    "SELECT m.first_name, m.last_name, m.membership_id, m.member_type, m.status,
            m.expires_on, m.member_fee_type, m.email, m.phone,
            m.birth_date,
            (SELECT COUNT(*) FROM check_ins WHERE internal_member_id = m.internal_id) AS total_checkins,
            (SELECT COUNT(*) FROM practice_sessions WHERE internal_member_id = m.internal_id) AS total_sessions,
            (SELECT MAX(local_date) FROM check_ins WHERE internal_member_id = m.internal_id) AS last_checkin
     FROM members m
     WHERE m.internal_id = ?",
    [$user['member_id']]
);

// Initials for avatar
$initials = strtoupper(
    mb_substr($member['first_name'] ?? '', 0, 1) .
    mb_substr($member['last_name']  ?? '', 0, 1)
);

$statusLabel = ['ACTIVE' => 'Aktiv', 'INACTIVE' => 'Inaktiv'];
$typeLabel   = ['FULL' => 'Fuldt medlem', 'TRIAL' => 'Prøvemedlem'];
$badgeClass  = $member['member_type'] === 'FULL' ? 'badge-active' : 'badge-trial';

$portalPageTitle = 'Min oversigt';
$portalNavActive = 'index';
include __DIR__ . '/../includes/layout.php';
?>

<div class="portal-profile-card">
  <div class="portal-avatar"><?= e($initials) ?></div>
  <div class="portal-profile-info">
    <h2><a href="#medlemsoplysninger" class="portal-profile-toggle" onclick="document.getElementById('medlemsoplysninger').open=true"><?= e($member['first_name'] . ' ' . $member['last_name']) ?></a></h2>
    <p>Medlemsnr. <?= e($member['membership_id']) ?></p>
    <p style="margin-top:.35rem;">
      <span class="badge <?= e($badgeClass) ?>"><?= e($typeLabel[$member['member_type']] ?? $member['member_type']) ?></span>
    </p>
  </div>
</div>

<div class="portal-stats-grid">
  <a href="checkins.php" class="portal-stat-card portal-stat-link">
    <div class="portal-stat-label">Check-ins i alt</div>
    <div class="portal-stat-value"><?= (int)$member['total_checkins'] ?></div>
  </a>
  <a href="sessions.php" class="portal-stat-card portal-stat-link">
    <div class="portal-stat-label">Resultater i alt</div>
    <div class="portal-stat-value"><?= (int)$member['total_sessions'] ?></div>
  </a>
  <a href="checkins.php" class="portal-stat-card portal-stat-link">
    <div class="portal-stat-label">Seneste check-in</div>
    <div class="portal-stat-value" style="font-size:1.1rem;">
      <?= $member['last_checkin'] ? e(date('d.m.Y', strtotime($member['last_checkin']))) : '—' ?>
    </div>
  </a>
  <div class="portal-stat-card">
    <div class="portal-stat-label">Kontingenttype</div>
    <div class="portal-stat-value" style="font-size:1rem;"><?= e(feeTypeLabel($member['member_fee_type'] ?? null)) ?></div>
  </div>
</div>

<details id="medlemsoplysninger" class="portal-card portal-details">
  <summary class="portal-card-header portal-details-summary">Medlemsoplysninger</summary>
  <div class="portal-card-body">
    <table style="width:100%;border-collapse:collapse;font-size:.9rem;">
      <?php
      $rows = [
          'Udløbsdato'   => $member['expires_on'] ? date('d.m.Y', strtotime($member['expires_on'])) : 'Løbende',
          'E-mail'       => $member['email'] ?: '—',
          'Telefon'      => $member['phone'] ?: '—',
          'Fødselsdato'  => $member['birth_date'] ? date('d.m.Y', strtotime($member['birth_date'])) : '—',
      ];
      foreach ($rows as $label => $value): ?>
      <tr>
        <td style="padding:.5rem 0;color:#6b7280;width:40%;"><?= e($label) ?></td>
        <td style="padding:.5rem 0;font-weight:500;"><?= e($value) ?></td>
      </tr>
      <?php endforeach; ?>
    </table>
  </div>
</details>

<div class="flex-between mt-2 mb-2">
  <a href="sessions.php" class="portal-btn portal-btn-primary">Se mine resultater →</a>
  <a href="checkins.php" class="portal-btn portal-btn-ghost">Check-in historik</a>
</div>

<?php layout_end(); ?>
