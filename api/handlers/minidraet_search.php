<?php
/**
 * MinIdraet Search Handler
 *
 * Proxies search requests to https://minidraet.dgi.dk/Search.ashx
 *
 * GET/POST /minidraet/search
 */

declare(strict_types=1);

// File version - increment when making changes
const MINIDRAET_SEARCH_VERSION = '1.0.0';

const MINIDRAET_SEARCH_ENDPOINT = 'https://minidraet.dgi.dk/Search.ashx';
const MINIDRAET_BASE_URL = 'https://minidraet.dgi.dk';
const MINIDRAET_MAX_ROWS = 50;

/**
 * Handle GET/POST /minidraet/search
 */
function handleMinIdraetSearch(): void
{
    $input = json_decode(file_get_contents('php://input'), true);
    if (!is_array($input)) {
        $input = [];
    }

    $query = $input['query']
        ?? $input['q']
        ?? ($_GET['query'] ?? ($_GET['q'] ?? ''));
    $type = $input['type'] ?? ($_GET['type'] ?? '');
    $maxRows = $input['max_rows']
        ?? $input['maxRows']
        ?? ($_GET['max_rows'] ?? ($_GET['maxRows'] ?? 10));

    if (!is_string($query) || trim($query) === '') {
        errorResponse('Query is required', 400);
    }

    $query = trim($query);
    $normalizedType = normalizeMinIdraetType($type);

    if ($normalizedType === null) {
        errorResponse('Invalid search type', 400, [
            'allowed' => ['forening', 'spillested', 'udover']
        ]);
    }

    if (mb_strlen($query) < 3) {
        jsonResponse([
            'query' => $query,
            'type' => $normalizedType,
            'results' => [],
            'fetched_at' => gmdate('Y-m-d\TH:i:s\Z'),
        ]);
    }

    $maxRows = (int)$maxRows;
    if ($maxRows <= 0) {
        $maxRows = 10;
    }
    if ($maxRows > MINIDRAET_MAX_ROWS) {
        $maxRows = MINIDRAET_MAX_ROWS;
    }

    switch ($normalizedType) {
        case 'forening':
            $results = minidraetQuery('queryForening', [$query, $maxRows]);
            break;
        case 'spillested':
            $results = minidraetQuery('querySpillested', [$query, $maxRows]);
            break;
        case 'udover':
            $nameResults = minidraetQuery('querySpiller', [$query, $maxRows]);
            $numberResults = minidraetQuery('querySpillerByNumber', [$query]);
            $results = mergeMinIdraetResults($nameResults, $numberResults);
            break;
        default:
            $results = [];
            break;
    }

    jsonResponse([
        'query' => $query,
        'type' => $normalizedType,
        'results' => $results,
        'fetched_at' => gmdate('Y-m-d\TH:i:s\Z'),
        'base_url' => MINIDRAET_BASE_URL,
    ]);
}

/**
 * Normalize the search type to a known value.
 */
function normalizeMinIdraetType($type): ?string
{
    if (!is_string($type)) {
        return null;
    }

    $value = mb_strtolower(trim($type));

    return match ($value) {
        'forening' => 'forening',
        'spillested' => 'spillested',
        'udover', 'udøver', 'skytte' => 'udover',
        default => null,
    };
}

/**
 * Execute a JSON-RPC call to MinIdraet Search.ashx.
 */
function minidraetQuery(string $method, array $params): array
{
    $payload = json_encode([
        'jsonrpc' => '2.0',
        'method' => $method,
        'params' => $params,
        'id' => 1,
    ], JSON_UNESCAPED_UNICODE);

    if ($payload === false) {
        errorResponse('Failed to build request', 500);
    }

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, MINIDRAET_SEARCH_ENDPOINT);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
        'Accept: application/json',
        'User-Agent: Medlemscheckin/1.0'
    ]);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
    curl_setopt($ch, CURLOPT_TIMEOUT, 10);

    $response = curl_exec($ch);
    if ($response === false) {
        $error = curl_error($ch);
        curl_close($ch);
        errorResponse('MinIdraet request failed', 502, ['details' => $error]);
    }

    $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($status < 200 || $status >= 300) {
        errorResponse('MinIdraet request failed', 502, ['status' => $status]);
    }

    $data = json_decode($response, true);
    if (!is_array($data)) {
        errorResponse('Invalid response from MinIdraet', 502);
    }

    $result = $data['result'] ?? [];
    if (!is_array($result)) {
        return [];
    }

    return $result;
}

/**
 * Merge results and remove duplicates based on text+url.
 */
function mergeMinIdraetResults(array $primary, array $secondary): array
{
    $merged = [];
    $seen = [];

    $all = array_merge($primary, $secondary);
    foreach ($all as $item) {
        if (!is_array($item)) {
            continue;
        }
        $text = (string)($item['text'] ?? '');
        $url = (string)($item['url'] ?? '');
        $key = $text . '|' . $url;
        if ($text === '' && $url === '') {
            continue;
        }
        if (isset($seen[$key])) {
            continue;
        }
        $seen[$key] = true;
        $merged[] = $item;
    }

    return $merged;
}
