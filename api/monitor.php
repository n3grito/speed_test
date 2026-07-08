<?php
require_once __DIR__ . '/../config.php';

checkRateLimit(getClientIP());

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    errorResponse('Método no permitido', 405);
}

$type   = $_GET['type'] ?? 'ping';
$target = $_GET['target'] ?? '8.8.8.8';

$allowed = ['ping', 'http', 'dns', 'tcp'];
if (!in_array($type, $allowed)) {
    errorResponse('Tipo no válido: ' . $type, 400);
}

$result = [
    'success'   => false,
    'type'      => $type,
    'target'    => $target,
    'timestamp' => date('c'),
    'rtt_ms'    => null,
    'error'     => null,
];

$start = microtime(true);

try {
    if ($type === 'ping') {
        if (IS_WIN) {
            $cmd = sprintf('ping -n 1 -w 3000 %s', escapeshellarg($target));
        } else {
            $cmd = sprintf('ping -c 1 -W 3 %s', escapeshellarg($target));
        }
        $output = [];
        $exitCode = 0;
        exec($cmd, $output, $exitCode);
        $elapsed = (microtime(true) - $start) * 1000;
        $result['success'] = $exitCode === 0;
        $result['rtt_ms']  = round($elapsed, 1);

    } elseif ($type === 'http') {
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL            => $target,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT_MS     => 5000,
            CURLOPT_CONNECTTIMEOUT_MS => 3000,
            CURLOPT_NOBODY         => true,
            CURLOPT_USERAGENT      => APP_NAME . '/' . APP_VERSION,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS      => 2,
        ]);
        curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $totalTime = curl_getinfo($ch, CURLINFO_TOTAL_TIME);
        curl_close($ch);
        $result['success'] = $httpCode > 0 && $httpCode < 500;
        $result['rtt_ms']  = round($totalTime * 1000, 1);

    } elseif ($type === 'dns') {
        $ip = @gethostbyname($target);
        $elapsed = (microtime(true) - $start) * 1000;
        $result['success'] = $ip !== $target && filter_var($ip, FILTER_VALIDATE_IP);
        $result['rtt_ms']  = round($elapsed, 1);
        $result['resolved'] = $ip;

    } elseif ($type === 'tcp') {
        $parts = parse_url($target);
        $host = $parts['host'] ?? $target;
        $port = $parts['port'] ?? 80;
        $errno = 0;
        $errstr = '';
        $sock = @fsockopen($host, $port, $errno, $errstr, 3);
        $elapsed = (microtime(true) - $start) * 1000;
        if ($sock) {
            fclose($sock);
            $result['success'] = true;
        }
        $result['rtt_ms'] = round($elapsed, 1);
        if ($errstr) $result['error'] = $errstr;
    }
} catch (Throwable $e) {
    $result['error'] = $e->getMessage();
}

jsonResponse($result);
