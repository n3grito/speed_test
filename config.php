<?php
/**
 * Configuración central — compatible Linux / Windows
 */
define('APP_NAME', 'NetSpeed Analyzer');
define('APP_VERSION', '2.0.0');
define('DEBUG', false);

define('PING_COUNT', 4);
define('PING_TIMEOUT', 10);
define('BANDWIDTH_TEST_SIZE', 10 * 1024 * 1024);

define('CACHE_TTL', 300);
define('CACHE_DIR', __DIR__ . DIRECTORY_SEPARATOR . 'cache');
define('RATE_LIMIT', 30);
define('RATE_LIMIT_WINDOW', 60);

define('IS_WIN', strtoupper(substr(PHP_OS, 0, 3)) === 'WIN');

if (!is_dir(CACHE_DIR)) {
    @mkdir(CACHE_DIR, 0755, true);
}

$gitkeep = CACHE_DIR . DIRECTORY_SEPARATOR . '.gitkeep';
if (!is_file($gitkeep)) {
    @touch($gitkeep);
}

function jsonResponse($data, $status = 200) {
    if (!headers_sent()) {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Access-Control-Allow-Origin: *');
        header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type');
    }
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function errorResponse($message, $code = 400) {
    jsonResponse(['error' => true, 'message' => $message], $code);
}

function getClientIP() {
    $headers = ['HTTP_X_FORWARDED_FOR', 'HTTP_X_REAL_IP', 'HTTP_CLIENT_IP', 'REMOTE_ADDR'];
    foreach ($headers as $h) {
        if (!empty($_SERVER[$h])) {
            $ip = explode(',', $_SERVER[$h])[0];
            if (filter_var(trim($ip), FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
                return trim($ip);
            }
        }
    }
    foreach ($headers as $h) {
        if (!empty($_SERVER[$h])) {
            $ip = explode(',', $_SERVER[$h])[0];
            if (filter_var(trim($ip), FILTER_VALIDATE_IP)) return trim($ip);
        }
    }
    return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
}

function checkRateLimit($ip) {
    $file = CACHE_DIR . DIRECTORY_SEPARATOR . 'rate_' . md5($ip);
    $data = @file_get_contents($file);
    $requests = $data ? (array)json_decode($data, true) : [];
    $now = time();
    $requests = array_filter($requests, fn($t) => $t > $now - RATE_LIMIT_WINDOW);
    if (count($requests) >= RATE_LIMIT) {
        $retry = RATE_LIMIT_WINDOW - ($now - min($requests));
        errorResponse('Límite de peticiones excedido. Espere ' . max($retry, 1) . ' segundos.', 429);
    }
    $requests[] = $now;
    @file_put_contents($file, json_encode($requests), LOCK_EX);
}

function fetchFromCache($key) {
    $file = CACHE_DIR . DIRECTORY_SEPARATOR . md5($key) . '.cache';
    if (!is_file($file)) return null;
    $raw = json_decode(file_get_contents($file), true);
    if (!$raw) return null;
    // New format with metadata
    if (isset($raw['_expires']) && isset($raw['data'])) {
        if (time() < $raw['_expires']) return $raw['data'];
        @unlink($file);
        return null;
    }
    // Legacy format (no metadata)
    if ((time() - filemtime($file)) < CACHE_TTL) return $raw;
    return null;
}

function saveToCache($key, $data, $ttl = null) {
    if ($ttl === null) $ttl = CACHE_TTL;
    $meta = ['_expires' => time() + $ttl, 'data' => $data];
    $file = CACHE_DIR . DIRECTORY_SEPARATOR . md5($key) . '.cache';
    @file_put_contents($file, json_encode($meta), LOCK_EX);
}

function getGateway() {
    if (IS_WIN) {
        $out = shell_exec('ipconfig 2>nul');
        if ($out && preg_match('/Puerta de enlace.*?:\s*(\d+\.\d+\.\d+\.\d+)/i', $out, $m)) {
            return $m[1];
        }
        if ($out && preg_match('/Default Gateway.*?:\s*(\d+\.\d+\.\d+\.\d+)/i', $out, $m)) {
            return $m[1];
        }
    } else {
        $out = shell_exec('ip route 2>/dev/null');
        if ($out && preg_match('/^default via\s+(\S+)/m', $out, $m)) {
            return $m[1];
        }
        $out = shell_exec('route -n 2>/dev/null');
        if ($out && preg_match('/^0\.0\.0\.0\s+(\d+\.\d+\.\d+\.\d+)/m', $out, $m)) {
            return $m[1];
        }
    }
    return null;
}

function httpGet($url, $timeout = 5) {
    if (!function_exists('curl_init')) {
        $ctx = stream_context_create(['http' => ['timeout' => $timeout, 'user_agent' => APP_NAME . '/' . APP_VERSION]]);
        $data = @file_get_contents($url, false, $ctx);
        return $data !== false ? $data : false;
    }
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => $timeout,
        CURLOPT_CONNECTTIMEOUT => 3,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_USERAGENT => APP_NAME . '/' . APP_VERSION,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 3,
    ]);
    $data = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return $httpCode === 200 ? $data : false;
}
