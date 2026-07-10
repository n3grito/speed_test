<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NetSpeed Analyzer Pro</title>
  <link rel="stylesheet" href="assets/css/style.css">
</head>
<body>
  <div class="container">
    <header>
      <h1>NetSpeed Analyzer</h1>
      <p>Diagn&oacute;stico profesional de conexi&oacute;n &mdash; ICMP, ancho de banda multi-stream, bufferbloat</p>
    </header>

    <!-- Network Info -->
    <div class="card">
      <h2>Informaci&oacute;n de Red</h2>
      <div class="grid-3">
        <div class="stat"><div class="label">IP P&uacute;blica</div><div class="value pending" id="ip-router">Cargando...</div></div>
        <div class="stat"><div class="label">Proveedor (ISP)</div><div class="value pending" id="proveedor">Cargando...</div></div>
        <div class="stat"><div class="label">Ubicaci&oacute;n</div><div class="value pending" id="ubicacion">Cargando...</div></div>
      </div>
      <div id="network-error" class="error-msg hidden"></div>
    </div>

    <!-- Speed Test Hero -->
    <div class="card">
      <div class="speedtest-hero">
        <div class="gauge-row">
          <div class="gauge-box">
            <div class="gauge-container">
              <canvas id="gauge-dl" width="240" height="200"></canvas>
            </div>
            <div id="progress-dl" style="margin-top:8px;">
              <div class="progress-bar lg"><div class="fill" id="progress-dl-fill" style="width:0%"></div></div>
              <p id="progress-dl-label" style="color:var(--text3);font-size:.75rem;margin-top:4px;">Descarga</p>
            </div>
          </div>
          <div class="gauge-box">
            <div class="gauge-container">
              <canvas id="gauge-ul" width="240" height="200"></canvas>
            </div>
            <div id="progress-ul" style="margin-top:8px;">
              <div class="progress-bar lg"><div class="fill" id="progress-ul-fill" style="width:0%"></div></div>
              <p id="progress-ul-label" style="color:var(--text3);font-size:.75rem;margin-top:4px;">Subida</p>
            </div>
          </div>
        </div>
        <div style="margin-top: 10px;">
          <button class="btn btn-success btn-lg" id="btn-speedtest">Iniciar Test Completo</button>
          <button class="btn btn-danger btn-lg hidden" id="btn-stop-test">Detener</button>
        </div>
        <p id="speedtest-status" style="color:var(--text3);font-size:.8rem;margin-top:8px;min-height:1.2em;"></p>
        <div id="speedtest-error" class="error-msg hidden" style="margin-top:12px;"></div>
      </div>

      <!-- Live chart -->
      <canvas id="speed-chart" class="chart"></canvas>

      <!-- Summary -->
      <div id="speedtest-summary" class="hidden" style="margin-top:16px;">
        <div class="grid-3">
          <div class="stat"><div class="label">Ping Promedio</div><div class="value pending" id="result-ping-prom">—</div></div>
          <div class="stat"><div class="label">Jitter</div><div class="value pending" id="result-ping-jitter">—</div></div>
          <div class="stat"><div class="label">P&eacute;rdida</div><div class="value pending" id="result-ping-perdida">—</div></div>
        </div>
        <div class="grid-3" style="margin-top:12px;">
          <div class="stat"><div class="label">Descarga</div><div class="value pending" id="result-dl-velocidad">—</div>
            <div class="sub" style="font-size:.75rem;color:var(--text3);" id="result-dl-data"></div>
          </div>
          <div class="stat"><div class="label">Subida</div><div class="value pending" id="result-ul-velocidad">—</div>
            <div class="sub" style="font-size:.75rem;color:var(--text3);" id="result-ul-data"></div>
          </div>
          <div class="stat"><div class="label">Bufferbloat</div><div class="value pending" id="bufferbloat">—</div></div>
        </div>
        <div class="btn-group" style="margin-top:12px;">
          <button class="btn btn-outline" onclick="SPEEDTEST.start()">Repetir Test</button>
        </div>
      </div>
    </div>

    <!-- Download / Upload Tests -->
    <div class="card">
      <h2>Pruebas Individuales</h2>
      <div class="grid-2">
        <div>
          <h3 style="font-size:.95rem;color:var(--text2);margin-bottom:10px;">Descarga</h3>
          <div class="btn-group">
            <button class="btn btn-primary" id="btn-download">Probar Descarga</button>
          </div>
          <div id="loading-download" class="loading hidden">
            <div class="spinner"></div>
            <p style="color:var(--text2);font-size:.85rem;">Midiendo velocidad...</p>
            <div class="progress-bar" style="margin-top:10px;"><div class="fill" id="dl-progress"></div></div>
          </div>
          <div id="resultado-download" class="hidden" style="margin-top:12px;">
            <div class="grid-3">
              <div class="stat"><div class="label">Velocidad</div><div class="value pending" id="dl-velocidad">—</div></div>
              <div class="stat"><div class="label">Datos</div><div class="value pending" id="dl-data">—</div></div>
              <div class="stat"><div class="label">Tiempo</div><div class="value pending" id="dl-tiempo">—</div></div>
            </div>
            <div id="dl-error" class="error-msg hidden"></div>
          </div>
        </div>
        <div>
          <h3 style="font-size:.95rem;color:var(--text2);margin-bottom:10px;">Subida</h3>
          <div class="btn-group">
            <button class="btn btn-primary" id="btn-upload">Probar Subida</button>
          </div>
          <div id="loading-upload" class="loading hidden">
            <div class="spinner"></div>
            <p style="color:var(--text2);font-size:.85rem;">Midiendo velocidad...</p>
            <div class="progress-bar" style="margin-top:10px;"><div class="fill" id="ul-progress"></div></div>
          </div>
          <div id="resultado-upload" class="hidden" style="margin-top:12px;">
            <div class="grid-3">
              <div class="stat"><div class="label">Velocidad</div><div class="value pending" id="ul-velocidad">—</div></div>
              <div class="stat"><div class="label">Datos</div><div class="value pending" id="ul-data">—</div></div>
              <div class="stat"><div class="label">Tiempo</div><div class="value pending" id="ul-tiempo">—</div></div>
            </div>
            <div id="ul-error" class="error-msg hidden"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Quick Test + Controls -->
    <div class="card" style="text-align:center;">
      <h2>Controles</h2>
      <div class="btn-group">
        <button class="btn btn-outline" id="btn-quick">Ejecutar Todo (individual)</button>
        <button class="btn btn-danger" id="btn-cancel">Cancelar</button>
      </div>
    </div>

    <!-- Network Monitor -->
    <div class="card" id="monitor-card">
      <h2>Monitor de Red <span class="badge" id="monitor-badge">Detenido</span></h2>
      <p style="color:var(--text2);font-size:.85rem;margin-bottom:14px;">
        Monitoreo peri&oacute;dico de conectividad. Seleccion&aacute; los protocolos, configur&aacute; el intervalo y el destino.
      </p>
      <div class="monitor-grid" id="monitor-grid"></div>
      <div class="btn-group" style="margin-top:14px;">
        <button class="btn btn-success" id="btn-monitor-start">Iniciar Monitoreo</button>
        <button class="btn btn-danger hidden" id="btn-monitor-stop">Detener</button>
        <button class="btn btn-outline" id="btn-monitor-clear">Limpiar Historial</button>
        <label style="display:inline-flex;align-items:center;gap:4px;color:var(--text2);font-size:.85rem;margin-left:8px;">
          Duraci&oacute;n: <input type="number" id="mon-duration" value="60" min="10" max="3600" style="width:60px;padding:4px;border:1px solid var(--border);border-radius:4px;background:var(--bg2);color:var(--text);"> s
        </label>
      </div>
      <div id="monitor-status" class="hidden" style="margin-top:14px;">
        <div class="grid-4" style="margin-bottom:12px;">
          <div class="stat"><div class="label">Tiempo activo</div><div class="value text2" id="mon-uptime">00:00:00</div></div>
          <div class="stat"><div class="label">Desconexiones</div><div class="value text2" id="mon-outages">0</div></div>
          <div class="stat"><div class="label">Estado</div><div class="value success" id="mon-state">Conectado</div></div>
          <div class="stat"><div class="label">&Uacute;ltimo evento</div><div class="value text2" id="mon-last">—</div></div>
        </div>
        <div id="monitor-log" style="max-height:200px;overflow-y:auto;"></div>
      </div>
    </div>

    <footer>
      <p>NetSpeed Analyzer v2.0 &mdash; Multi-stream HTTP | ICMP | Bufferbloat | Monitor</p>
    </footer>
  </div>

  <script src="assets/js/chart.js"></script>
  <script src="assets/js/gauge.js"></script>
  <script src="assets/js/monitor.js"></script>
  <script src="assets/js/script.js"></script>
  <script src="assets/js/speedtest.js"></script>
</body>
</html>
