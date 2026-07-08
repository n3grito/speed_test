<?php
require_once __DIR__ . '/../config.php';

checkRateLimit(getClientIP());

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    errorResponse('Método no permitido', 405);
}

$cached = fetchFromCache('network_info');
if ($cached) {
    jsonResponse($cached);
}

$result = [
    'ip_router' => getGateway(),
    'ip_local'  => getClientIP(),
    'proveedor' => null,
    'ubicacion' => null,
    'timestamp' => date('c'),
];

$ipData = httpGet('https://ipinfo.io/json');
if ($ipData) {
    $data = json_decode($ipData, true);
    if ($data) {
        $result['proveedor'] = $data['org'] ?? null;
        $result['ubicacion'] = ($data['city'] ?? '') . ', ' . ($data['region'] ?? '') . ', ' . ($data['country'] ?? '');
        if ($result['proveedor']) {
            if (preg_match('/^AS(\d+)\s+(.+)/i', $result['proveedor'], $m)) {
                $result['proveedor'] = trim($m[2]);
            }
        }
    }
}

saveToCache('network_info', $result);
jsonResponse($result);
