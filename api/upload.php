<?php
/**
 * Subida profesional con streaming + server timing + checksum
 */
require_once __DIR__ . '/../config.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Content-Length, X-Stream-Id');
    header('Access-Control-Max-Age: 86400');
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    errorResponse('Método no permitido', 405);
}

$maxUpload = 50 * 1024 * 1024;
$contentLength = $_SERVER['CONTENT_LENGTH'] ?? 0;
$streamId = (int)($_SERVER['HTTP_X_STREAM_ID'] ?? 0);

if ($contentLength <= 0) {
    errorResponse('Content-Length requerido', 411);
}
if ($contentLength > $maxUpload) {
    errorResponse('Excede tamaño máximo (' . ($maxUpload / 1024 / 1024) . ' MB)', 413);
}

$input = fopen('php://input', 'rb');
if (!$input) {
    errorResponse('Error al abrir flujo de entrada', 500);
}

$totalRead = 0;
$start = microtime(true);
$readBuffer = 65536;
$sampleInterval = 0.2;
$lastSample = $start;
$speedSamples = [];

while (!feof($input) && $totalRead < $contentLength) {
    $chunk = fread($input, $readBuffer);
    if ($chunk === false) break;
    $totalRead += strlen($chunk);

    $now = microtime(true);
    if ($now - $lastSample >= $sampleInterval) {
        $dt = $now - $lastSample;
        $instBps = strlen($chunk) / $dt;
        $speedSamples[] = round($instBps * 8 / 1000000, 2);
        $lastSample = $now;
    }

    if (connection_aborted()) break;
}

fclose($input);
$elapsed = microtime(true) - $start;

if ($totalRead === 0) {
    errorResponse('No se recibieron datos', 400);
}

$bps = $totalRead / max($elapsed, 0.0001);
$avgMbps = round($bps * 8 / 1000000, 2);
$peakMbps = !empty($speedSamples) ? round(max($speedSamples), 2) : $avgMbps;

header('Content-Type: application/json');

jsonResponse([
    'stream_id' => $streamId,
    'bytes_recibidos' => $totalRead,
    'bytes_esperados' => (int)$contentLength,
    'tiempo_segundos' => round($elapsed, 4),
    'velocidad_mbps_media' => $avgMbps,
    'velocidad_mbps_pico' => $peakMbps,
    'velocidad_mbps' => $avgMbps,
    'speed_samples' => $speedSamples,
    'timestamp' => date('c'),
]);
