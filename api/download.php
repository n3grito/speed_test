<?php
/**
 * Descarga profesional con chunk unique + server timing
 * Soporta múltiples streams vía parámetro id
 */
require_once __DIR__ . '/../config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    errorResponse('Método no permitido', 405);
}

$size = isset($_GET['size']) ? min(max((int)$_GET['size'], 65536), 50 * 1024 * 1024) : 5 * 1024 * 1024;
$chunkSize = 65536;
$totalChunks = (int)ceil($size / $chunkSize);
$actualSize = $totalChunks * $chunkSize;
$streamId = (int)($_GET['id'] ?? 0);

ignore_user_abort(false);
while (ob_get_level()) ob_end_clean();
ob_implicit_flush(true);

$seed = random_bytes(32);
$startTime = microtime(true);

header('Content-Type: application/octet-stream');
header('Content-Length: ' . $actualSize);
header('Cache-Control: no-store, no-cache, must-revalidate, no-transform');
header('Pragma: no-cache');
header('Expires: 0');
header('X-Test-Data: bandwidth');
header('X-Stream-Id: ' . $streamId);
header('X-Server-Time: ' . sprintf('%.6f', $startTime));

$timestamps = [];
for ($i = 0; $i < $totalChunks; $i++) {
    $ctx = hash_init('sha256');
    hash_update($ctx, $seed);
    hash_update($ctx, pack('NN', $i, $streamId));
    $hash = hash_final($ctx, true);

    $out = '';
    while (strlen($out) < $chunkSize) {
        $out .= $hash;
        $hash = hash('sha256', $hash, true);
    }
    echo substr($out, 0, $chunkSize);

    if ($i % 16 === 0) {
        $timestamps[] = sprintf('%.6f', microtime(true));
    }

    if (connection_aborted()) break;
}

$endTime = microtime(true);
$elapsed = $endTime - $startTime;

if (!connection_aborted() && $elapsed > 0) {
    $bps = $actualSize / $elapsed;
    header('X-Speed-Bps: ' . round($bps));
    header('X-Speed-Mbps: ' . round($bps * 8 / 1000000, 2));
    header('X-Server-Elapsed: ' . sprintf('%.6f', $elapsed));
    header('X-Timestamps: ' . implode(',', $timestamps));
}
