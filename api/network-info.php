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
    'ip_publica' => null,
    'proveedor' => null,
    'ubicacion' => null,
    'timestamp' => date('c'),
];

// Try primary: ipinfo.io
$ipData = httpGet('https://ipinfo.io/json');
if ($ipData) {
    $data = json_decode($ipData, true);
    if ($data) {
        $result['ip_publica'] = $data['ip'] ?? null;
        $result['proveedor'] = $data['org'] ?? null;
        $result['ubicacion'] = ($data['city'] ?? '') . ', ' . ($data['region'] ?? '') . ', ' . ($data['country'] ?? '');
        if ($result['proveedor']) {
            if (preg_match('/^AS(\d+)\s+(.+)/i', $result['proveedor'], $m)) {
                $result['proveedor'] = trim($m[2]);
            }
        }
    }
}

// Fallback: ip-api.com if ipinfo failed to get ISP
if (!$result['proveedor'] || !$result['ubicacion']) {
    $ipToLookup = $result['ip_publica'] ?: getClientIP();
    $fbData = httpGet('http://ip-api.com/json/' . urlencode($ipToLookup) . '?fields=query,isp,org,as,city,region,country,status');
    if ($fbData) {
        $fb = json_decode($fbData, true);
        if ($fb && ($fb['status'] ?? '') === 'success') {
            if (!$result['proveedor'] && !empty($fb['isp'])) {
                $result['proveedor'] = $fb['isp'];
            }
            if (!$result['ubicacion'] && !empty($fb['city'])) {
                $result['ubicacion'] = ($fb['city'] ?? '') . ', ' . ($fb['region'] ?? '') . ', ' . ($fb['country'] ?? '');
            }
        }
    }
}

// Fallback public IP if still unknown
if (!$result['ip_publica']) {
    $fallbackIp = httpGet('https://api.ipify.org?format=json');
    if ($fallbackIp) {
        $data = json_decode($fallbackIp, true);
        $result['ip_publica'] = $data['ip'] ?? null;
    }
}

// Cache ISP data longer (1 hour) since it rarely changes
saveToCache('network_info', $result, 3600);
jsonResponse($result);
