<?php
/**
 * Portal Layout — shared header, sidebar, and footer
 *
 * Usage:
 *   $portalPageTitle = 'My Page';
 *   $portalNavActive = 'sessions'; // matches nav item key
 *   include __DIR__ . '/../includes/layout.php';
 *
 * Call layout_end() at the bottom of each page.
 */

declare(strict_types=1);

if (!function_exists('e')) {
    function e(string $s): string {
        return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }
}

$_user     = portalUser();
$_role     = $_user['role'];
$_active   = $portalNavActive ?? '';
$_title    = $portalPageTitle ?? 'Portal';
$_baseUrl  = '/portal';

// For TRAINER browsing member pages, remap the active key to the "mine-*" segment
if ($_role === 'TRAINER' && str_contains($_SERVER['SCRIPT_NAME'] ?? '', '/portal/member/')) {
    $_active = match ($_active) {
        'index'    => 'mine-index',
        'sessions' => 'mine-sessions',
        'checkins' => 'mine-checkins',
        default    => $_active,
    };
}

// Nav definitions per role
$_navItems = [];

if ($_role === 'MEMBER') {
    $_navItems = [
        'index'    => ['label' => 'Oversigt',  'href' => $_baseUrl . '/member/',             'icon' => 'home'],
        'sessions' => ['label' => 'Resultater','href' => $_baseUrl . '/member/sessions.php', 'icon' => 'target'],
        'checkins' => ['label' => 'Check-ins', 'href' => $_baseUrl . '/member/checkins.php', 'icon' => 'calendar'],
    ];
}

if ($_role === 'TRAINER') {
    $_navItems = [
        '_section_mine'    => ['section' => 'Min træning'],
        'mine-index'       => ['label' => 'Oversigt',   'href' => $_baseUrl . '/member/',              'icon' => 'home'],
        'mine-sessions'    => ['label' => 'Resultater', 'href' => $_baseUrl . '/member/sessions.php',  'icon' => 'target'],
        'mine-checkins'    => ['label' => 'Check-ins',  'href' => $_baseUrl . '/member/checkins.php',  'icon' => 'calendar'],
        '_section_club'    => ['section' => 'Klub træning'],
        'index'            => ['label' => 'Oversigt',   'href' => $_baseUrl . '/trainer/',             'icon' => 'home'],
        'sessions'         => ['label' => 'Resultater', 'href' => $_baseUrl . '/trainer/sessions.php', 'icon' => 'target'],
        'members'          => ['label' => 'Skytter',    'href' => $_baseUrl . '/trainer/members.php',  'icon' => 'users'],
        'announcements'    => ['label' => 'Skærmbeskeder', 'href' => $_baseUrl . '/announcements.php', 'icon' => 'message'],
    ];
}

if ($_role === 'ADMIN') {
    $_navItems = [
        'index'     => ['label' => 'Oversigt',   'href' => $_baseUrl . '/admin/',               'icon' => 'home'],
        'members'   => ['label' => 'Medlemmer',  'href' => $_baseUrl . '/admin/members.php',    'icon' => 'users'],
        'trainers'  => ['label' => 'Trænere',    'href' => $_baseUrl . '/admin/trainers.php',   'icon' => 'badge'],
        'skv'       => ['label' => 'SKV',         'href' => $_baseUrl . '/admin/skv.php',        'icon' => 'shield'],
        'equipment' => ['label' => 'Udstyr',      'href' => $_baseUrl . '/admin/equipment.php', 'icon' => 'box'],
        'finance'   => ['label' => 'Økonomi',     'href' => $_baseUrl . '/admin/finance.php',   'icon' => 'chart'],
        'announcements' => ['label' => 'Skærmbeskeder', 'href' => $_baseUrl . '/announcements.php', 'icon' => 'message'],
    ];
}

function _navIcon(string $name): string
{
    $icons = [
        'home'     => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
        'target'   => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
        'calendar' => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
        'users'    => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>',
        'badge'    => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>',
        'shield'   => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
        'box'      => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
        'chart'    => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
        'message'  => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a4 4 0 01-4 4H8l-5 3V7a4 4 0 014-4h10a4 4 0 014 4z"/><line x1="8" y1="9" x2="16" y2="9"/><line x1="8" y1="13" x2="14" y2="13"/></svg>',
        'logout'   => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
    ];
    return $icons[$name] ?? '';
}

$_roleLabelMap = ['MEMBER' => 'Skytte', 'TRAINER' => 'Træner', 'ADMIN' => 'Administrator'];
$_roleLabel    = $_roleLabelMap[$_role] ?? $_role;
?>
<!DOCTYPE html>
<html lang="da">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title><?= e($_title) ?> — ISS Sportsskytter Portal</title>
<link rel="stylesheet" href="/assets/css/main.css">
<link rel="stylesheet" href="/portal/assets/portal.css">
<script src="/portal/assets/portal.js" defer></script>
</head>
<body class="portal">

<div class="portal-shell">

  <!-- Sidebar -->
  <nav class="portal-sidebar" aria-label="Portal navigation">
    <div class="portal-sidebar-logo">
      <a href="/">
        <img src="/images/ISS Logo_OnBlack.png" alt="ISS Sportsskytter">
      </a>
    </div>
    <div class="portal-sidebar-role"><?= e($_roleLabel) ?></div>

    <ul class="portal-nav" role="list">
      <?php foreach ($_navItems as $key => $item): ?>
        <?php if (isset($item['section'])): ?>
        <li class="portal-nav-section" aria-hidden="true"><?= e($item['section']) ?></li>
        <?php else: ?>
        <li>
          <a href="<?= e($item['href']) ?>"
             class="<?= $key === $_active ? 'active' : '' ?>"
             <?= $key === $_active ? 'aria-current="page"' : '' ?>>
            <?= _navIcon($item['icon']) ?>
            <?= e($item['label']) ?>
          </a>
        </li>
        <?php endif; ?>
      <?php endforeach; ?>
    </ul>

    <div class="portal-sidebar-footer">
      <a href="/portal/logout.php" class="portal-logout" aria-label="Log ud">
        <?= _navIcon('logout') ?>
        Log ud
      </a>
    </div>
  </nav>

  <!-- Main content -->
  <main class="portal-main" id="main-content">
    <h1 class="portal-page-title"><?= e($_title) ?></h1>
<?php
// Page content follows. Call layout_end() at the bottom.

function layout_end(): void
{
    echo "\n  </main>\n</div>\n</body>\n</html>";
}
