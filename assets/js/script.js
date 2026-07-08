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

async function runPing() {
    if (STATE.testing.ping) return;
    STATE.testing.ping = true;
    hide('ping-error');

    show('resultado-ping');
    show('loading-ping');

    const target = $('#ping-target').value || '8.8.8.8';
    const count = parseInt($('#ping-count').value) || 10;

    try {
        const d = await apiFetch(`${API_BASE}/icmp.php?target=${encodeURIComponent(target)}&count=${count}`);
        renderPingResult(d);
    } catch (e) {
        showError('ping-error', 'Error ICMP: ' + e.message);
    } finally {
        hide('loading-ping');
        STATE.testing.ping = false;
    }
}

function renderPingResult(d) {
    hide('ping-error');
    show('resultado-ping');

    setText('ping-enviados', d.paquetes_enviados, 'text2');
    setText('ping-recibidos', d.paquetes_recibidos, 'text2');
    setText('ping-perdida', d.porcentaje_perdida + '%',
        d.porcentaje_perdida === 0 ? 'success' : d.porcentaje_perdida < 10 ? 'warning' : 'danger');
    setText('ping-min', formatMs(d.rtt_min), 'success');
    setText('ping-prom', formatMs(d.rtt_promedio), 'primary');
    setText('ping-mediana', formatMs(d.rtt_mediana), 'text2');
    setText('ping-max', formatMs(d.rtt_max), 'warning');
    setText('ping-jitter', formatMs(d.rtt_jitter), 'accent');
    setText('ping-desviacion', formatMs(d.rtt_desviacion), 'text2');
    setText('ping-resolucion', d.resolucion_dns_ms ? d.resolucion_dns_ms + ' ms' : '—', 'text2');

    const barC = document.getElementById('ping-bar-container');
    barC.innerHTML = '';
    if (d.rtts && d.rtts.length) {
        const mx = Math.max(...d.rtts, 1);
        d.rtts.forEach((rtt, i) => {
            const pct = (rtt / mx) * 100;
            const color = rtt < 30 ? 'var(--success)' : rtt < 100 ? 'var(--warning)' : 'var(--danger)';
            barC.innerHTML += `
                <div class="ping-bar">
                    <span style="width:32px;font-size:.75rem;color:var(--text2);">#${i + 1}</span>
                    <div class="bar-fill" style="width:${pct}%;background:${color};"></div>
                    <span style="font-size:.8rem;font-weight:600;">${rtt.toFixed(1)}ms</span>
                </div>`;
        });

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
    hide('speedtest-progress');
    hide('speedtest-summary');
}

async function runQuickTest() {
    STATE.testing = { ping: false, dl: false, ul: false };
    hide('resultado-ping');
    hide('resultado-download');
    hide('resultado-upload');
    $$('.error-msg').forEach(e => e.classList.add('hidden'));

    show('loading-ping');
    show('loading-download');
    show('loading-upload');

    await Promise.allSettled([runPing(), runDownload(), runUpload()]);
}

document.addEventListener('DOMContentLoaded', () => {
    loadNetworkInfo();

    $('#btn-ping').addEventListener('click', runPing);
    $('#btn-download').addEventListener('click', runDownload);
    $('#btn-upload').addEventListener('click', runUpload);
    $('#btn-quick').addEventListener('click', runQuickTest);
    $('#btn-cancel').addEventListener('click', cancelTests);
    $('#btn-speedtest').addEventListener('click', () => SPEEDTEST.start());
});
