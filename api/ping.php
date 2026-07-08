<?php
require_once __DIR__ . '/../config.php';

checkRateLimit(getClientIP());

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    errorResponse('Método no permitido', 405);
}

$target = $_GET['target'] ?? '8.8.8.8';
$count = isset($_GET['count']) ? min(max((int)$_GET['count'], 1), 20) : PING_COUNT;
$timeout = PING_TIMEOUT;

if (!filter_var($target, FILTER_VALIDATE_IP) && !preg_match('/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/', $target)) {
    errorResponse('Destino inválido. Debe ser una IP o dominio válido.');
}

$isWin = IS_WIN;

$cmd = $isWin
    ? sprintf('ping -n %d -w %d %s', $count, $timeout * 1000, escapeshellarg($target))
    : sprintf('ping -c %d -W %d %s', $count, $timeout, escapeshellarg($target));

$output = [];
$exitCode = 0;
exec($cmd, $output, $exitCode);

$result = [
    'target' => $target,
    'ip_resuelta' => null,
    'paquetes_enviados' => $count,
    'paquetes_recibidos' => 0,
    'paquetes_perdidos' => 0,
    'porcentaje_perdida' => 0,
    'rtt_min' => null,
    'rtt_max' => null,
    'rtt_promedio' => null,
    'rtt_jitter' => null,
    'rtts' => [],
    'exit_code' => $exitCode,
    'timestamp' => date('c'),
    'sistema' => $isWin ? 'Windows' : 'Unix',
];

if ($isWin) {
    foreach ($output as $line) {
        if (preg_match('/respuesta\s+desde\s+([^:]+):\s*bytes=(\d+).*tiempo[<>=](\d+)/i', $line, $m)) {
            $rtt = (int)$m[3];
            $result['paquetes_recibidos']++;
            $result['rtts'][] = $rtt;
            $result['ip_resuelta'] = $result['ip_resuelta'] ?? $m[1];
        }
        if (preg_match('/estadísticas\s+de\s+ping\s+para\s+([^:]+)/i', $line, $m)) {
            $result['ip_resuelta'] = $result['ip_resuelta'] ?? trim($m[1]);
        }
    }
} else {
    foreach ($output as $line) {
        if (preg_match('/^(\d+)\s+bytes\s+from\s+([^:]+):\s*icmp_seq=\d+\s+ttl=\d+\s+time=([0-9.]+)\s*ms/i', $line, $m)) {
            $rtt = (float)$m[3];
            $result['paquetes_recibidos']++;
            $result['rtts'][] = $rtt;
            $result['ip_resuelta'] = $result['ip_resuelta'] ?? $m[2];
        }
        if (preg_match('/^PING\s+\S+\s+\(([^)]+)\)/', $line, $m)) {
            $result['ip_resuelta'] = $m[1];
        }
    }
}

$result['paquetes_perdidos'] = $count - $result['paquetes_recibidos'];
$result['porcentaje_perdida'] = $count > 0 ? round(($result['paquetes_perdidos'] / $count) * 100, 1) : 0;

if (!empty($result['rtts'])) {
    $rtts = $result['rtts'];
    $result['rtt_min'] = round(min($rtts), 2);
    $result['rtt_max'] = round(max($rtts), 2);
    $result['rtt_promedio'] = round(array_sum($rtts) / count($rtts), 2);
    if (count($rtts) > 1) {
        $mean = array_sum($rtts) / count($rtts);
        $variance = array_sum(array_map(fn($v) => ($v - $mean) ** 2, $rtts)) / count($rtts);
        $result['rtt_jitter'] = round(sqrt($variance), 2);
    } else {
        $result['rtt_jitter'] = 0;
    }
}

jsonResponse($result);
