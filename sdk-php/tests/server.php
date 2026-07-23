<?php

/**
 * Roteador para o servidor embutido do PHP (`php -S`), usado nos testes.
 * Imita as rotas relevantes da API Maps to Lead.
 */

declare(strict_types=1);

const TEST_TOKEN = 'secret-token';

$uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
$token = str_starts_with(strtolower($authHeader), 'bearer ') ? substr($authHeader, 7) : '';

$sendJson = static function (int $code, array $obj): void {
    http_response_code($code);
    header('Content-Type: application/json');
    echo json_encode($obj);
};

$needAuth = static function () use ($token, $sendJson): bool {
    if ($token !== TEST_TOKEN) {
        $sendJson(401, ['error' => true, 'message' => 'Token inválido.']);

        return false;
    }

    return true;
};

if ($method === 'POST' && $uri === '/api/find') {
    $payload = json_decode(file_get_contents('php://input') ?: '{}', true) ?: [];
    $sendJson(200, [
        'error' => false,
        'message' => 'ok',
        'jobId' => 'job_1',
        'query' => $payload['query'] ?? [],
        'options' => $payload['options'] ?? [],
        'webhook' => $payload['webhook']['url'] ?? '',
    ]);

    return true;
}

if ($method === 'GET' && $uri === '/manager/api/state') {
    if (! $needAuth()) {
        return true;
    }
    $sendJson(200, [
        'now' => 1,
        'uptimeMs' => 1,
        'totals' => ['leads' => 3, 'sent' => 2, 'activeJobs' => 0],
        'jobs' => [],
        'recentLeads' => [],
    ]);

    return true;
}

if ($method === 'GET' && $uri === '/manager/api/leads') {
    if (! $needAuth()) {
        return true;
    }
    $sendJson(200, [
        'leads' => [['name' => 'ACME', 'phone' => '+55']],
        'total' => 1,
        'limit' => 12,
        'offset' => 0,
    ]);

    return true;
}

if ($method === 'GET' && $uri === '/manager/api/leads.xlsx') {
    if (! $needAuth()) {
        return true;
    }
    header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    echo "PK\x03\x04"; // assinatura zip/xlsx

    return true;
}

if ($method === 'GET' && $uri === '/manager/stream') {
    if (! $needAuth()) {
        return true;
    }
    header('Content-Type: text/event-stream');
    header('Cache-Control: no-cache');
    while (ob_get_level() > 0) {
        ob_end_flush();
    }
    echo ": ping\n\n";
    flush();
    echo 'data: {"totals":{"activeJobs":1,"leads":1}}' . "\n\n";
    flush();
    usleep(20000);
    echo 'data: {"totals":{"activeJobs":0,"leads":3}}' . "\n\n";
    flush();
    for ($i = 0; $i < 200; $i++) {
        usleep(20000);
        echo ": ping\n\n";
        flush();
        if (connection_aborted()) {
            break;
        }
    }

    return true;
}

$sendJson(404, ['error' => true, 'message' => 'não encontrado']);

return true;
