const API_BASE = 'api';
const STATE = {
    networkInfo: null,
    testing: { ping: false, dl: false, ul: false },
    controllers: [],
};

const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];

function formatBytes(b) {
    if (!b || b === 0) return '0 B';
    const u = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(Math.floor(Math.log(b) / Math.log(1024)), u.length - 1);
    return (b / Math.pow(1024, i)).toFixed(1) + ' ' + u[i];
}

function formatMbps(m) {
    return (m == null || isNaN(m)) ? '—' : m.toFixed(2) + ' Mbps';
}

function formatMs(m) {
    return (m == null || isNaN(m)) ? '—' : m.toFixed(1) + ' ms';
}

function show(id) { const e = document.getElementById(id); if (e) e.classList.remove('hidden'); }
function hide(id) { const e = document.getElementById(id); if (e) e.classList.add('hidden'); }

function setText(id, val, cls = '') {
    const e = document.getElementById(id);
    if (!e) return;
    e.textContent = val ?? '—';
    e.className = 'value' + (cls ? ' ' + cls : '');
}

function setProgress(id, pct) {
    const bar = document.getElementById(id);
    if (bar) bar.style.width = Math.min(pct, 100) + '%';
}

function showError(id, msg) {
    const e = document.getElementById(id);
    if (e) { e.textContent = msg; e.classList.remove('hidden'); }
}

async function apiFetch(url, opts = {}) {
    const res = await fetch(url, opts);
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `HTTP ${res.status}`);
    }
    const ct = res.headers.get('content-type') || '';
    if (opts.method === 'POST' || ct.includes('json')) return res.json();
    return res;
}

async function loadNetworkInfo() {
    try {
        const d = await apiFetch(`${API_BASE}/network-info.php`);
        STATE.networkInfo = d;
        setText('ip-router', d.ip_router || 'N/A', 'primary');
        setText('ip-local', d.ip_local, 'text2');
        setText('proveedor', d.proveedor || 'N/A', 'success');
        setText('ubicacion', d.ubicacion || 'N/A', 'text2');
    } catch (e) {
        showError('network-error', 'Error de red: ' + e.message);
    }
}

async function runDownload() {
    if (STATE.testing.dl) return;
    STATE.testing.dl = true;
    hide('dl-error');
    setProgress('dl-progress', 0);

    show('resultado-download');
    show('loading-download');

    const size = 10 * 1024 * 1024;
    const ac = new AbortController();
    STATE.controllers.push(ac);

    const start = performance.now();
    let received = 0;
    let lastSample = { time: start, bytes: 0 };

    try {
        const resp = await fetch(`${API_BASE}/download.php?size=${size}&id=0`, { signal: ac.signal });
        const reader = resp.body.getReader();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            received += value.length;
            setProgress('dl-progress', Math.min((received / size) * 100, 100));

            const now = performance.now();
            const dt = (now - lastSample.time) / 1000;
            if (dt >= 0.15) {
                lastSample = { time: now, bytes: received };
            }
        }

        const elapsed = (performance.now() - start) / 1000;
        const mbps = (received * 8) / (elapsed * 1000000);
        renderBandwidthResult('dl', received, elapsed, mbps);
    } catch (e) {
        if (e.name !== 'AbortError')
            showError('dl-error', 'Error descarga: ' + e.message);
    } finally {
        hide('loading-download');
        STATE.testing.dl = false;
        const idx = STATE.controllers.indexOf(ac);
        if (idx >= 0) STATE.controllers.splice(idx, 1);
    }
}

function runUpload() {
    if (STATE.testing.ul) return;
    STATE.testing.ul = true;
    hide('ul-error');
    setProgress('ul-progress', 0);

    show('resultado-upload');
    show('loading-upload');

    const totalSize = 3 * 1024 * 1024;
    const payload = new Uint8Array(totalSize);
    const chunks = Math.ceil(totalSize / 65536);
    for (let i = 0; i < chunks; i++) {
        const len = Math.min(65536, totalSize - i * 65536);
        const tmp = new Uint8Array(len);
        crypto.getRandomValues(tmp);
        payload.set(tmp, i * 65536);
    }

    return new Promise((resolve) => {
        const ac = new AbortController();
        STATE.controllers.push(ac);
        const start = performance.now();
        const xhr = new XMLHttpRequest();

        xhr.upload.onprogress = (e) => {
            if (!e.lengthComputable) return;
            setProgress('ul-progress', Math.min((e.loaded / e.total) * 100, 100));
        };

        function _ulDone() {
            STATE.testing.ul = false;
            hide('loading-upload');
            const idx = STATE.controllers.indexOf(ac);
            if (idx >= 0) STATE.controllers.splice(idx, 1);
        }

        xhr.onload = () => {
            const elapsed = (performance.now() - start) / 1000;
            const mbps = (totalSize * 8) / (elapsed * 1000000);
            _ulDone();
            renderBandwidthResult('ul', totalSize, elapsed, mbps);
            resolve();
        };
        xhr.onerror = () => { _ulDone(); showError('ul-error', 'Error subida'); resolve(); };
        xhr.onabort = () => { _ulDone(); resolve(); };
        ac.signal.addEventListener('abort', () => xhr.abort());

        xhr.open('POST', `${API_BASE}/upload.php`);
        xhr.setRequestHeader('Content-Type', 'application/octet-stream');
        xhr.send(payload);
    });
}

function renderBandwidthResult(prefix, bytes, elapsed, mbps) {
    hide(prefix + '-error');
    show('resultado-' + prefix);
    setText(prefix + '-velocidad', formatMbps(mbps),
        mbps > 50 ? 'success' : mbps > 10 ? 'warning' : 'danger');
    setText(prefix + '-data', formatBytes(bytes), 'text2');
    setText(prefix + '-tiempo', elapsed.toFixed(2) + ' s', 'text2');
}

function cancelTests() {
    STATE.controllers.forEach(ac => ac.abort());
    STATE.controllers = [];
    STATE.testing = { ping: false, dl: false, ul: false };
    $$('.loading').forEach(e => e.classList.add('hidden'));
    if (SPEEDTEST._ac && !SPEEDTEST._ac.signal.aborted) {
        SPEEDTEST._ac.abort();
    }
    hide('speedtest-summary');
}

async function runQuickTest() {
    STATE.testing = { ping: false, dl: false, ul: false };
    hide('resultado-download');
    hide('resultado-upload');
    $$('.error-msg').forEach(e => e.classList.add('hidden'));

    show('loading-download');
    show('loading-upload');

    await Promise.allSettled([runDownload(), runUpload()]);
}

function initMonitor() {
    const grid = document.getElementById('monitor-grid');
    if (!grid) return;
    grid.innerHTML = '';
    MONITOR.protocols.forEach(p => {
        const cfg = MONITOR.config.find(c => c.id === p.id);
        const card = document.createElement('div');
        card.className = 'protocol-card' + (cfg.enabled ? ' active' : '');
        card.id = 'pcard-' + p.id;
        card.innerHTML = `
          <h4>${p.label}</h4>
          <p>${p.desc}</p>
          <div class="pcfg">
            <label><input type="checkbox" class="pcheck" data-id="${p.id}" ${cfg.enabled ? 'checked' : ''}> Activo</label>
            <input type="number" class="pinterval" data-id="${p.id}" value="${cfg.interval}" min="2" max="300"> s
            <input type="text" class="ptarget" data-id="${p.id}" value="${cfg.target}" placeholder="Destino">
          </div>
          <div class="pstat" id="pstat-${p.id}">${cfg.enabled ? 'Listo' : 'Inactivo'}</div>`;
        grid.appendChild(card);
    });

    grid.addEventListener('change', e => {
        const el = e.target;
        const id = el.dataset.id;
        if (!id) return;
        if (el.classList.contains('pcheck')) {
            MONITOR.saveConfig(id, 'enabled', el.checked);
            document.getElementById('pcard-' + id).className = 'protocol-card' + (el.checked ? ' active' : '');
            document.getElementById('pstat-' + id).textContent = el.checked ? 'Listo' : 'Inactivo';
        }
    });
    grid.addEventListener('input', e => {
        const el = e.target;
        const id = el.dataset.id;
        if (!id) return;
        if (el.classList.contains('pinterval')) MONITOR.saveConfig(id, 'interval', parseInt(el.value) || 5);
        if (el.classList.contains('ptarget')) MONITOR.saveConfig(id, 'target', el.value);
    });

    const startBtn = document.getElementById('btn-monitor-start');
    const stopBtn = document.getElementById('btn-monitor-stop');
    const clearBtn = document.getElementById('btn-monitor-clear');
    const badge = document.getElementById('monitor-badge');

    function updateMonitorUI() {
        const running = MONITOR.running;
        startBtn.classList.toggle('hidden', running);
        stopBtn.classList.toggle('hidden', !running);
        badge.textContent = running ? 'Monitoreando' : 'Detenido';
        badge.className = 'badge' + (running ? ' success' : '');
        document.getElementById('monitor-status').classList.toggle('hidden', !running && !MONITOR.history.length);
    }

    function formatUptime(sec) {
        const h = String(Math.floor(sec / 3600)).padStart(2, '0');
        const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
        const s = String(sec % 60).padStart(2, '0');
        return h + ':' + m + ':' + s;
    }

    function updateMonitorStats() {
        const uptime = MONITOR.uptimeSeconds;
        setText('mon-uptime', formatUptime(uptime));
        setText('mon-outages', String(MONITOR.outageCount));

        const pingStats = MONITOR.stats['ping'];
        if (pingStats && pingStats.checks > 0) {
            const isUp = pingStats.lastSuccess > (pingStats.lastFailure || 0);
            setText('mon-state', isUp ? 'Conectado' : 'Desconectado', isUp ? 'success' : 'danger');
        }
    }

    let uptimeInterval;
    MONITOR.onEvent((event, data) => {
        if (event === 'start' || event === 'stop') {
            updateMonitorUI();
            if (event === 'start') {
                uptimeInterval = setInterval(updateMonitorStats, 1000);
                updateMonitorStats();
            } else {
                clearInterval(uptimeInterval);
            }
            if (event === 'stop') updateMonitorStats();
        }
        if (event === 'result') {
            const { protocol, entry, stats } = data;
            const st = document.getElementById('pstat-' + protocol);
            if (st) {
                const pct = stats.uptime.toFixed(1);
                st.textContent = entry.success
                    ? `OK ${entry.rtt}ms — ${pct}% uptime`
                    : `Falló — ${pct}% uptime` + (entry.error ? ' (' + entry.error + ')' : '');
            }
            updateMonitorStats();

            const log = document.getElementById('monitor-log');
            if (log) {
                const d = new Date(entry.ts);
                const time = d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0') + ':' + d.getSeconds().toString().padStart(2,'0');
                const row = document.createElement('div');
                row.className = 'mon-log-entry';
                row.innerHTML = `<span class="ml-time">${time}</span>
                  <span class="ml-protocol">${protocol}</span>
                  <span class="ml-status">${entry.success ? '✓' : '✗'}</span>
                  <span class="ml-rtt">${entry.rtt != null ? entry.rtt + 'ms' : '—'}</span>`;
                log.insertBefore(row, log.firstChild);
                while (log.children.length > 100) log.removeChild(log.lastChild);
            }

            const lastEl = document.getElementById('mon-last');
            if (lastEl && entry.ts) {
                const secsAgo = Math.floor((Date.now() - entry.ts) / 1000);
                lastEl.textContent = secsAgo + 's';
            }
        }
        if (event === 'disconnect') {
            setText('mon-state', 'Desconectado', 'danger');
        }
        if (event === 'reconnect') {
            setText('mon-state', 'Conectado', 'success');
        }
        if (event === 'clear') {
            document.getElementById('monitor-log').innerHTML = '';
            setText('mon-uptime', '00:00:00');
            setText('mon-outages', '0');
            setText('mon-state', 'Conectado', 'success');
            setText('mon-last', '—');
            updateMonitorUI();
            MONITOR.protocols.forEach(p => {
                const st = document.getElementById('pstat-' + p.id);
                if (st) st.textContent = 'Inactivo';
            });
        }
    });

    startBtn.addEventListener('click', () => {
        MONITOR.start();
        updateMonitorUI();
    });
    stopBtn.addEventListener('click', () => {
        MONITOR.stop();
        updateMonitorUI();
    });
    clearBtn.addEventListener('click', () => MONITOR.clearHistory());
    updateMonitorUI();
}

document.addEventListener('DOMContentLoaded', () => {
    loadNetworkInfo();
    initMonitor();

    $('#btn-download').addEventListener('click', runDownload);
    $('#btn-upload').addEventListener('click', runUpload);
    $('#btn-quick').addEventListener('click', runQuickTest);
    $('#btn-cancel').addEventListener('click', cancelTests);
    $('#btn-speedtest').addEventListener('click', () => SPEEDTEST.start());
});
