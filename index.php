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
      <div class="grid-2">
        <div class="stat"><div class="label">IP Router</div><div class="value pending" id="ip-router">Cargando...</div></div>
        <div class="stat"><div class="label">IP Local</div><div class="value pending" id="ip-local">Cargando...</div></div>
        <div class="stat"><div class="label">Proveedor (ISP)</div><div class="value pending" id="proveedor">Cargando...</div></div>
        <div class="stat"><div class="label">Ubicaci&oacute;n</div><div class="value pending" id="ubicacion">Cargando...</div></div>
      </div>
      <div id="network-error" class="error-msg hidden"></div>
    </div>

    <!-- Speed Test Hero -->
    <div class="card">
      <div class="speedtest-hero">
        <div class="gauge-container">
          <canvas id="gauge-canvas"></canvas>
        </div>
        <div style="margin-top: 4px;">
          <button class="btn btn-success btn-lg" id="btn-speedtest">Iniciar Test Completo</button>
        </div>
        <div id="speedtest-progress" class="hidden" style="margin-top:16px;max-width:400px;margin-left:auto;margin-right:auto;">
          <div class="progress-bar lg"><div class="fill" id="speedtest-progress-fill"></div></div>
          <p id="speedtest-progress-label" style="color:var(--text3);font-size:.8rem;margin-top:6px;"></p>
        </div>
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

    <!-- ICMP Ping Profesional -->
    <div class="card">
      <h2>Prueba ICMP Profesional <span class="badge">Jitter &amp; Packet Loss</span></h2>
      <div class="grid-2" style="margin-bottom:14px;">
        <div>
          <label style="font-size:.85rem;color:var(--text2);">Destino</label>
          <input type="text" id="ping-target" value="8.8.8.8">
        </div>
        <div>
          <label style="font-size:.85rem;color:var(--text2);">Paquetes</label>
          <input type="number" id="ping-count" value="10" min="1" max="50">
        </div>
      </div>
      <div class="btn-group">
        <button class="btn btn-primary" id="btn-ping">Ejecutar Ping</button>
      </div>

      <div id="loading-ping" class="loading hidden">
        <div class="spinner"></div>
        <p style="color:var(--text2);font-size:.9rem;">Ejecutando ping ICMP...</p>
      </div>

      <div id="resultado-ping" class="hidden">
        <div class="grid-4">
          <div class="stat"><div class="label">P&eacute;rdida</div><div class="value pending" id="ping-perdida">—</div></div>
          <div class="stat"><div class="label">M&iacute;nimo</div><div class="value pending" id="ping-min">—</div></div>
          <div class="stat"><div class="label">Promedio</div><div class="value pending" id="ping-prom">—</div></div>
          <div class="stat"><div class="label">Mediana</div><div class="value pending" id="ping-mediana">—</div></div>
          <div class="stat"><div class="label">M&aacute;ximo</div><div class="value pending" id="ping-max">—</div></div>
          <div class="stat"><div class="label">Jitter (IQR)</div><div class="value pending" id="ping-jitter">—</div></div>
          <div class="stat"><div class="label">Desviaci&oacute;n</div><div class="value pending" id="ping-desviacion">—</div></div>
          <div class="stat"><div class="label">Resol. DNS</div><div class="value pending" id="ping-resolucion">—</div></div>
        </div>
        <div class="grid-2" style="margin-top:12px;">
          <div class="stat"><div class="label">Recibidos</div><div class="value text2" id="ping-recibidos" style="font-size:1rem;">0</div></div>
          <div class="stat"><div class="label">Enviados</div><div class="value text2" id="ping-enviados" style="font-size:1rem;">0</div></div>
        </div>
        <div id="ping-bar-container" style="margin-top:14px;"></div>
        <div id="ping-chart-container" class="hidden" style="margin-top:10px;">
          <canvas id="ping-chart" class="chart"></canvas>
        </div>
        <div id="ping-error" class="error-msg hidden"></div>
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
            <canvas id="dl-chart" class="chart"></canvas>
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
            <canvas id="ul-chart" class="chart"></canvas>
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

    <footer>
      <p>NetSpeed Analyzer v2.0 &mdash; Multi-stream HTTP | ICMP | Bufferbloat</p>
    </footer>
  </div>

  <script src="assets/js/chart.js"></script>
  <script src="assets/js/gauge.js"></script>
  <script src="assets/js/script.js"></script>
  <script src="assets/js/speedtest.js"></script>
</body>
</html>
