<?php
require_once __DIR__ . '/../config.php';

$target = $_GET['target'] ?? '8.8.8.8';
$count = isset($_GET['count']) ? min(max((int)$_GET['count'], 1), 20) : 10;
$timeout = 3;
$useStream = isset($_GET['stream']);

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

if ($useStream) {
    header('Content-Type: application/x-ndjson; charset=utf-8');
    header('X-Accel-Buffering: no');
    ob_implicit_flush(true);
    if (ob_get_level()) ob_end_flush();

    $rtts = [];
    $received = 0;

    $onPing = function ($rtt, $seq) use (&$rtts, &$received) {
        if ($rtt !== null) {
            $rtts[] = $rtt;
            $received++;
        }
        echo json_encode([
            'type' => 'ping',
            'seq'  => $seq,
            'rtt'  => $rtt !== null ? round($rtt, 2) : null,
        ]) . "\n";
        flush();
    };

    if ($useRaw) {
        streamRawSocketPing($ip, $count, $timeout, $onPing);
    } else {
        streamSystemPing($target, $count, $timeout, $isWin, $onPing);
    }

    $lost = $count - $received;
    $pctLost = $count > 0 ? round(($lost / $count) * 100, 1) : 0;

    $summary = [
        'type'         => 'summary',
        'target'       => $target,
        'ip_resuelta'  => $ip,
        'resolucion_dns_ms' => round($resolveTime, 2),
        'paquetes_enviados'  => $count,
        'paquetes_recibidos' => $received,
        'paquetes_perdidos'  => $lost,
        'porcentaje_perdida' => $pctLost,
        'timestamp'    => date('c'),
    ];

    if (!empty($rtts)) {
        sort($rtts);
        $n = count($rtts);
        $summary['rtt_min'] = round(min($rtts), 2);
        $summary['rtt_max'] = round(max($rtts), 2);
        $summary['rtt_promedio'] = round(array_sum($rtts) / $n, 2);
        $summary['rtt_mediana'] = round($n % 2 === 0
            ? ($rtts[$n / 2 - 1] + $rtts[$n / 2]) / 2
            : $rtts[($n - 1) / 2], 2);
        $mean = array_sum($rtts) / $n;
        $variance = array_sum(array_map(fn($v) => ($v - $mean) ** 2, $rtts)) / $n;
        $summary['rtt_desviacion'] = round(sqrt($variance), 2);
        $sorted = $rtts;
        $q1 = $sorted[(int)($n * 0.25)];
        $q3 = $sorted[(int)($n * 0.75)];
        $summary['rtt_jitter'] = round(($q3 - $q1) / 2, 2);
    }

    echo json_encode($summary) . "\n";
    flush();
    exit;
}

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

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

/* ── Raw sockets (Linux) ── */

function streamRawSocketPing($ip, $count, $timeout, $onPing) {
    $socket = @socket_create(AF_INET, SOCK_RAW, getprotobyname('icmp'));
    if (!$socket) {
        streamSystemPing($ip, $count, $timeout, false, $onPing);
        return;
    }
    socket_set_option($socket, SOL_SOCKET, SO_RCVTIMEO, ['sec' => $timeout, 'usec' => 0]);
    $pid = getmypid() & 0xFFFF;

    for ($seq = 1; $seq <= $count; $seq++) {
        $msg = "abcdefghijklmnopqrstuvwabcdefghi";
        $n = strlen($msg);
        $ts = pack('NN', (int)microtime(true), (int)((microtime(true) - floor(microtime(true))) * 1000000));
        $packet = pack('CCnnn', 8, 0, 0, $pid, $seq) . $ts . $msg;
        $checksum = icmpChecksum($packet);
        $packet = pack('CCnnn', 8, 0, $checksum, $pid, $seq) . $ts . $msg;

        $start = microtime(true);
        $rtt = null;
        if (@socket_sendto($socket, $packet, strlen($packet), 0, $ip, 0)) {
            $from = $port = '';
            if (@socket_recvfrom($socket, $reply, 256, 0, $from, $port)) {
                $end = microtime(true);
                if (strlen($reply) >= 20) {
                    $icmpType = ord($reply[20]);
                    $icmpCode = ord($reply[21]);
                    if ($icmpType === 0 && $icmpCode === 0) {
                        $rtt = ($end - $start) * 1000;
                    }
                }
            }
        }
        $onPing($rtt, $seq);
        usleep(100000);
    }
    socket_close($socket);
}

function rawSocketPing($ip, $count, $timeout, $result) {
    $socket = @socket_create(AF_INET, SOCK_RAW, getprotobyname('icmp'));
    if (!$socket) return systemPing($ip, $count, $timeout, false, $result);

    socket_set_option($socket, SOL_SOCKET, SO_RCVTIMEO, ['sec' => $timeout, 'usec' => 0]);
    $pid = getmypid() & 0xFFFF;

    for ($seq = 1; $seq <= $count; $seq++) {
        $msg = "abcdefghijklmnopqrstuvwabcdefghi";
        $n = strlen($msg);
        $ts = pack('NN', (int)microtime(true), (int)((microtime(true) - floor(microtime(true))) * 1000000));
        $packet = pack('CCnnn', 8, 0, 0, $pid, $seq) . $ts . $msg;
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

/* ── System ping (Windows / fallback) ── */

function streamSystemPing($target, $count, $timeout, $isWin, $onPing) {
    for ($i = 1; $i <= $count; $i++) {
        $cmd = $isWin
            ? sprintf('ping -n 1 -w %d %s', $timeout * 1000, escapeshellarg($target))
            : sprintf('ping -c 1 -W %d %s', $timeout, escapeshellarg($target));

        $output = [];
        exec($cmd, $output, $exitCode);

        $rtt = null;
        foreach ($output as $line) {
            if ($isWin) {
                if (preg_match('/respuesta\s+desde\s+\S+.*?tiempo[=<>\s]*(\d+)/i', $line, $m)) {
                    $rtt = (float)$m[1];
                    break;
                }
                if (preg_match('/tiempo\s*[<]\s*(\d+)ms/i', $line, $m)) {
                    $rtt = (float)$m[1] * 0.5;
                    break;
                }
            } else {
                if (preg_match('/time=([0-9.]+)\s*ms/i', $line, $m)) {
                    $rtt = (float)$m[1];
                    break;
                }
            }
        }
        $onPing($rtt, $i);
    }
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
