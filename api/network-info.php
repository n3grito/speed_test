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
    'ip_local' => getClientIP(),
    'ip_publica' => null,
    'proveedor' => null,
    'asn' => null,
    'ubicacion' => null,
    'pais' => null,
    'region' => null,
    'ciudad' => null,
    'hostname' => null,
    'timestamp' => date('c'),
];

$ipData = httpGet('https://ipinfo.io/json');
if ($ipData) {
    $data = json_decode($ipData, true);
    if ($data) {
        $result['ip_publica'] = $data['ip'] ?? null;
        $result['proveedor'] = $data['org'] ?? null;
        $result['ubicacion'] = ($data['city'] ?? '') . ', ' . ($data['region'] ?? '') . ', ' . ($data['country'] ?? '');
        $result['pais'] = $data['country'] ?? null;
        $result['region'] = $data['region'] ?? null;
        $result['ciudad'] = $data['city'] ?? null;
        $result['hostname'] = $data['hostname'] ?? null;

        if ($result['proveedor']) {
            if (preg_match('/^AS(\d+)\s+(.+)/i', $result['proveedor'], $m)) {
                $result['asn'] = 'AS' . $m[1];
                $result['proveedor'] = trim($m[2]);
            }
        }
    }
}

$fallbackIp = httpGet('https://api.ipify.org?format=json');
if ($fallbackIp && !$result['ip_publica']) {
    $data = json_decode($fallbackIp, true);
    $result['ip_publica'] = $data['ip'] ?? null;
}

saveToCache('network_info', $result);
jsonResponse($result);
