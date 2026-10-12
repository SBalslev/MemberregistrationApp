<?php
declare(strict_types=1);
require_once __DIR__ . '/includes/auth_guard.php';
requireRole('MEMBER'); // any authenticated user

$session = session_name();
$params  = session_get_cookie_params();

// Destroy server-side session
$_SESSION = [];
session_destroy();

// Expire the session cookie
setcookie(
    $session, '',
    [
        'expires'  => time() - 3600,
        'path'     => $params['path'],
        'domain'   => $params['domain'],
        'secure'   => $params['secure'],
        'httponly' => $params['httponly'],
        'samesite' => 'Strict',
    ]
);

header('Location: /Skytte/login.php?reason=logout');
exit;
