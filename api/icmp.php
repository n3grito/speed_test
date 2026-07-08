<?php
/**
 * ICMP Ping profesional con raw sockets y fallback a system ping
 */
require_once __DIR__ . '/../config.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

$target = $_GET['target'] ?? '8.8.8.8';
$count = isset($_GET['count']) ? min(max((int)$_GET['count'], 1), 20) : 10;
$timeout = 3;

if (!filter_var($target, FILTER_VALIDATE_IP) &&
    !preg_match('/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/', $target)) {
    jsonResponse(['error' => true, 'message' => 'Destino inválido'], 400);
    exit;
}

$resolveStart = microtime(true);
$ip = gethostbyname($target);
$resolveTime = (microtime(true) - $resolveStart) * 1000;

$isWin = strtoupper(substr(PHP_OS, 0, 3)) === 'WIN';
$useRaw = !$isWin && extension_loaded('sockets');

$result = [
    'target' => $target,
    'ip_resuelta' => $ip,
    'resolucion_dns_ms' => round($resolveTime, 2),
    'paquetes_enviados' => $count,
    'paquetes_recibidos' => 0,
    'paquetes_perdidos' => 0,
    'porcentaje_perdida' => 0,
    'rtts' => [],
    'rtt_min' => null,
    'rtt_max' => null,
    'rtt_promedio' => null,
    'rtt_mediana' => null,
    'rtt_jitter' => null,
    'rtt_desviacion' => null,
    'perdida_racha' => 0,
    'timestamp' => date('c'),
];

if ($useRaw) {
    $result = rawSocketPing($ip, $count, $timeout, $result);
} else {
    $result = systemPing($target, $count, $timeout, $isWin, $result);
}

$result['paquetes_perdidos'] = $count - $result['paquetes_recibidos'];
$result['porcentaje_perdida'] = $count > 0
    ? round(($result['paquetes_perdidos'] / $count) * 100, 1) : 0;

$rtts = $result['rtts'];
if (!empty($rtts)) {
    sort($rtts);
    $n = count($rtts);
    $result['rtt_min'] = round(min($rtts), 2);
    $result['rtt_max'] = round(max($rtts), 2);
    $result['rtt_promedio'] = round(array_sum($rtts) / $n, 2);
    $result['rtt_mediana'] = round($n % 2 === 0
        ? ($rtts[$n / 2 - 1] + $rtts[$n / 2]) / 2
        : $rtts[($n - 1) / 2], 2);

    $mean = array_sum($rtts) / $n;
    $variance = array_sum(array_map(fn($v) => ($v - $mean) ** 2, $rtts)) / $n;
    $result['rtt_desviacion'] = round(sqrt($variance), 2);

    $sorted = $rtts;
    $q1 = $sorted[(int)($n * 0.25)];
    $q3 = $sorted[(int)($n * 0.75)];
    $result['rtt_jitter'] = round(($q3 - $q1) / 2, 2);
}

jsonResponse($result);
exit;

function rawSocketPing($ip, $count, $timeout, $result) {
    $socket = @socket_create(AF_INET, SOCK_RAW, getprotobyname('icmp'));
    if (!$socket) return systemPing($ip, $count, $timeout, false, $result);

    socket_set_option($socket, SOL_SOCKET, SO_RCVTIMEO, ['sec' => $timeout, 'usec' => 0]);
    $pid = getmypid() & 0xFFFF;

    for ($seq = 1; $seq <= $count; $seq++) {
        $msg = "abcdefghijklmnopqrstuvwabcdefghi";
        $n = strlen($msg);

        $header = pack('CCnnn', 8, 0, 0, $pid, $seq);
        $ts = pack('NN', (int)microtime(true), (int)((microtime(true) - floor(microtime(true))) * 1000000));
        $packet = $header . $ts . $msg;
        $checksum = icmpChecksum($packet);
        $packet = pack('CCnnn', 8, 0, $checksum, $pid, $seq) . $ts . $msg;

        $start = microtime(true);
        if (@socket_sendto($socket, $packet, strlen($packet), 0, $ip, 0)) {
            $from = '';
            $port = 0;
            $reply = '';
            if (@socket_recvfrom($socket, $reply, 256, 0, $from, $port)) {
                $end = microtime(true);
                if (strlen($reply) >= 20) {
                    $icmpType = ord($reply[20]);
                    $icmpCode = ord($reply[21]);
                    if ($icmpType === 0 && $icmpCode === 0) {
                        $result['paquetes_recibidos']++;
                        $result['rtts'][] = ($end - $start) * 1000;
                    }
                }
            }
        }
        usleep(100000);
    }

    socket_close($socket);
    return $result;
}

function systemPing($target, $count, $timeout, $isWin, $result) {
    $cmd = $isWin
        ? sprintf('ping -n %d -w %d %s', $count, $timeout * 1000, escapeshellarg($target))
        : sprintf('ping -c %d -W %d %s', $count, $timeout, escapeshellarg($target));

    $output = [];
    exec($cmd, $output, $exitCode);
    $result['exit_code'] = $exitCode;

    foreach ($output as $line) {
        if ($isWin) {
            if (preg_match('/respuesta\s+desde\s+\S+.*?tiempo[=<>\s]*(\d+)/i', $line, $m)) {
                $result['paquetes_recibidos']++;
                $result['rtts'][] = (float)$m[1];
            } elseif (preg_match('/tiempo\s*[<]\s*(\d+)ms/i', $line, $m)) {
                $result['paquetes_recibidos']++;
                $result['rtts'][] = (float)$m[1] * 0.5;
            }
        } else {
            if (preg_match('/time=([0-9.]+)\s*ms/i', $line, $m)) {
                $result['paquetes_recibidos']++;
                $result['rtts'][] = (float)$m[1];
            }
        }
    }

    return $result;
}

function icmpChecksum($data) {
    if (strlen($data) % 2 !== 0) $data .= "\x00";
    $sum = 0;
    for ($i = 0; $i < strlen($data); $i += 2) {
        $sum += (ord($data[$i]) << 8) + ord($data[$i + 1]);
    }
    $sum = ($sum >> 16) + ($sum & 0xFFFF);
    $sum += ($sum >> 16);
    return ~$sum & 0xFFFF;
}
