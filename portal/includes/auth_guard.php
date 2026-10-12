<?php
/**
 * Portal Authentication Guard
 *
 * Include at the top of every portal page BEFORE any output.
 * Call requireRole('MEMBER'|'TRAINER'|'ADMIN') to enforce access.
 *
 * Also provides:
 *   csrfToken()       — get (and generate) the current CSRF token
 *   csrfValidate()    — validate submitted token; dies with 403 on failure
 *   portalUser()      — return cached session user array
 *   logPortalAccess() — write to portal_audit_log
 *   e($str)           — htmlspecialchars shorthand
 */

declare(strict_types=1);

// Never expose errors or stack traces to the browser
ini_set('display_errors', '0');
ini_set('log_errors',     '1');

require_once __DIR__ . '/db.php';

// -----------------------------------------------------------------------
// Session hardening — must run before session_start()
// -----------------------------------------------------------------------
ini_set('session.use_only_cookies',  '1');
ini_set('session.use_trans_sid',     '0');
ini_set('session.use_strict_mode',   '1');
ini_set('session.cookie_httponly',   '1');
ini_set('session.cookie_secure',     '1');
ini_set('session.cookie_samesite',   'Strict');

$_portalConfig = require dirname(__DIR__) . '/config.php';

session_name('ISSPRT');
session_set_cookie_params([
    'lifetime' => 0,
    'path'     => '/',
    'domain'   => $_SERVER['HTTP_HOST'] ?? '',
    'secure'   => true,
    'httponly' => true,
    'samesite' => 'Strict',
]);
session_start();

// -----------------------------------------------------------------------
// Role hierarchy
// -----------------------------------------------------------------------
const PORTAL_ROLES = ['MEMBER' => 1, 'TRAINER' => 2, 'ADMIN' => 3];

function requireRole(string $minRole): void
{
    global $_portalConfig;
    $cfg = $_portalConfig['session'];

    // Cache-control on every protected page
    header('Cache-Control: no-store, no-cache, must-revalidate, private');
    header('Pragma: no-cache');
    header('Expires: 0');

    // Must be logged in
    if (empty($_SESSION['portal_member_id']) || empty($_SESSION['portal_role'])) {
        _portalRedirect('/Skytte/login.php', 'not_logged_in');
    }

    // Idle timeout
    if (!empty($_SESSION['last_activity'])
        && (time() - $_SESSION['last_activity']) > $cfg['idle_timeout']) {
        _destroyAndRedirect('idle');
    }

    // Absolute timeout
    if (!empty($_SESSION['created_at'])
        && (time() - $_SESSION['created_at']) > $cfg['absolute_timeout']) {
        _destroyAndRedirect('expired');
    }

    // Update last activity
    $_SESSION['last_activity'] = time();

    // Role check
    $userLevel = PORTAL_ROLES[$_SESSION['portal_role']] ?? 0;
    $minLevel  = PORTAL_ROLES[$minRole] ?? 99;
    if ($userLevel < $minLevel) {
        http_response_code(403);
        include __DIR__ . '/layout.php';
        _renderError('Adgang nægtet', 'Du har ikke rettigheder til denne side.');
        exit;
    }

    // Re-verify account status from DB every 5 minutes
    if (empty($_SESSION['status_checked_at'])
        || (time() - $_SESSION['status_checked_at']) > $cfg['status_ttl']) {
        _refreshAccountStatus();
    }
}

function _refreshAccountStatus(): void
{
    $row = portalQueryOne(
        portalDb(),
        "SELECT pu.is_active, pu.session_version, m.status
         FROM portal_users pu
         JOIN members m ON m.internal_id = pu.member_id
         WHERE pu.member_id = ?",
        [$_SESSION['portal_member_id']]
    );

    if (!$row) {
        _destroyAndRedirect('account_not_found');
    }

    // Account deactivated
    if (!$row['is_active'] || $row['status'] !== 'ACTIVE') {
        _destroyAndRedirect('disabled');
    }

    // Session invalidated by password reset
    if ((int)$row['session_version'] !== (int)($_SESSION['session_version'] ?? 0)) {
        _destroyAndRedirect('security');
    }

    $_SESSION['status_checked_at'] = time();
}

function _destroyAndRedirect(string $reason): void
{
    session_unset();
    session_destroy();
    setcookie(session_name(), '', time() - 3600, '/', '', true, true);
    _portalRedirect('/Skytte/login.php', $reason);
}

function _portalRedirect(string $url, string $reason = ''): void
{
    $dest = $reason ? $url . '?reason=' . urlencode($reason) : $url;
    header('Location: ' . $dest);
    exit;
}

// -----------------------------------------------------------------------
// CSRF helpers
// -----------------------------------------------------------------------
function csrfToken(): string
{
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

function csrfValidate(): void
{
    $submitted = $_POST['csrf_token'] ?? '';
    if (!hash_equals(csrfToken(), $submitted)) {
        http_response_code(403);
        exit('Ugyldig forespørgsel (CSRF).');
    }
}

// -----------------------------------------------------------------------
// Output escaping
// -----------------------------------------------------------------------
function e(?string $str): string
{
    return htmlspecialchars($str ?? '', ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function feeTypeLabel(?string $type): string
{
    return match ($type) {
        'ADULT'     => 'Voksen',
        'CHILD'     => 'Barn',
        'CHILD_PLUS'=> 'Barn+',
        'HONORARY'  => 'Æresmedlem',
        default     => $type ?? '—',
    };
}

// -----------------------------------------------------------------------
// Return cached session user info
// -----------------------------------------------------------------------
function portalUser(): array
{
    return [
        'member_id' => $_SESSION['portal_member_id'] ?? '',
        'role'      => $_SESSION['portal_role'] ?? '',
        'name'      => $_SESSION['portal_name'] ?? '',
    ];
}

// -----------------------------------------------------------------------
// GDPR audit logging
// -----------------------------------------------------------------------
function logPortalAccess(string $action, ?string $targetMemberId = null): void
{
    try {
        portalExecute(
            portalWriterDb(),
            "INSERT INTO portal_audit_log
                (portal_user_id, action, target_member_id, ip, user_agent, created_at)
             VALUES (?, ?, ?, ?, ?, NOW())",
            [
                $_SESSION['portal_user_id'] ?? '',
                $action,
                $targetMemberId,
                _clientIp(),
                substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 255),
            ]
        );
    } catch (Throwable $e) {
        error_log('[portal_audit] ' . $e->getMessage());
    }
}

function _clientIp(): string
{
    // Only trust proxy headers if the actual TCP connection is from a known proxy
    $trustedProxies = ['127.0.0.1', '::1'];
    $remoteAddr     = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';

    if (in_array($remoteAddr, $trustedProxies, true)
        && !empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
        foreach (array_map('trim', explode(',', $_SERVER['HTTP_X_FORWARDED_FOR'])) as $ip) {
            if (filter_var($ip, FILTER_VALIDATE_IP,
                           FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
                return $ip;
            }
        }
    }
    return $remoteAddr;
}

function _renderError(string $title, string $message): void
{
    echo '<div class="portal-error"><h2>' . e($title) . '</h2><p>' . e($message) . '</p></div>';
}
