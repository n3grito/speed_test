const SPEEDTEST = {
    state: 'idle',
    gaugeDl: null,
    gaugeUl: null,
    chart: null,
    results: { ping: null, download: null, upload: null },
    _ac: null,
    _sampleTimer: null,

    async start() {
        if (this.state !== 'idle') return;
        this.state = 'running';
        this._ac = new AbortController();
        this.results = { ping: null, download: null, upload: null };

        hide('speedtest-summary');
        hide('speedtest-error');
        hide('btn-speedtest');
        show('btn-stop-test');

        if (!this.gaugeDl) {
            this.gaugeDl = new SpeedGauge('gauge-dl');
            this.gaugeUl = new SpeedGauge('gauge-ul');
        }
        if (!this.chart) {
            this.chart = new LiveChart('speed-chart', {
                maxPoints: 160, maxValue: 100,
                series: [
                    { label: 'Descarga ↓', color: '#3b82f6', bgColor: 'rgba(59,130,246,0.12)' },
                    { label: 'Subida ↑', color: '#22c55e', bgColor: 'rgba(34,197,94,0.12)' },
                ],
            });
        }
        this.gaugeDl.setPhase('ping');
        this.gaugeUl.setPhase('ping');
        this.chart.clear();
        this._setDlProgress(0, '');
        this._setUlProgress(0, '');
        this._setProgress(5, 'Midiendo latencia...');

        try {
            if (this._ac.signal.aborted) throw new DOMException('Abortado', 'AbortError');
            await this._runPingPhase();

            if (this._ac.signal.aborted) throw new DOMException('Abortado', 'AbortError');
            this._setProgress(25, 'Descargando...');
            await this._runDownloadPhase();

            if (this._ac.signal.aborted) throw new DOMException('Abortado', 'AbortError');
            this._setProgress(60, 'Subiendo...');
            await this._runUploadPhase();

            this._setProgress(95, 'Generando reporte...');
            this._freezeResults();
            this._showSummary();
            this._setProgress(100, 'Completado');
        } catch (e) {
            if (e.name !== 'AbortError')
                showError('speedtest-error', 'Error: ' + e.message);
        } finally {
            this.state = 'idle';
            this._ac = null;
            hide('btn-stop-test');
            show('btn-speedtest');
        }
    },

    async _runPingPhase() {
        const count = 10;
        const rtts = [];

        this.gaugeDl.label = 'ms';
        this.gaugeUl.label = 'ms';
        this.gaugeDl.setPhase('ping');
        this.gaugeUl.setPhase('ping');

        const _acPing = new AbortController();
        const _pingTimeout = setTimeout(() => _acPing.abort(), 15000);
        const _onAbort = () => { clearTimeout(_pingTimeout); _acPing.abort(); };
        this._ac.signal.addEventListener('abort', _onAbort, { once: true });

        const signal = _acPing.signal;

        try {
            for (let i = 1; i <= count; i++) {
                if (signal.aborted) return;

                const _pc = new AbortController();
                const _pt = setTimeout(() => _pc.abort(), 3000);
                const onParentAbort = () => { clearTimeout(_pt); _pc.abort(); };
                signal.addEventListener('abort', onParentAbort, { once: true });

                const start = performance.now();
                let rtt = null;
                try {
                    await fetch(`${API_BASE}/latency.php?_=${Date.now()}${Math.random()}`, {
                        cache: 'no-store',
                        signal: _pc.signal,
                    });
                    rtt = performance.now() - start;
                    rtts.push(rtt);
                } catch (_) {
                    // packet loss or timeout
                } finally {
                    clearTimeout(_pt);
                    signal.removeEventListener('abort', onParentAbort);
                }

                if (rtt != null) {
                    this.gaugeDl.setValue(rtt);
                    this.gaugeUl.setValue(rtt);
                }
                const pct = 5 + (i / count) * 18;
                this._setProgress(pct, `Ping ${i}/${count} — ${rtt != null ? rtt.toFixed(1) + ' ms' : 'timeout'}`);
                await this._sleep(30);
            }
        } finally {
            clearTimeout(_pingTimeout);
            this._ac.signal.removeEventListener('abort', _onAbort);
        }

        const received = rtts.length;
        const lost = count - received;
        const pctLost = count > 0 ? (lost / count) * 100 : 0;

        let prom, jitter, min, max;
        if (received > 0) {
            const sorted = [...rtts].sort((a, b) => a - b);
            min = sorted[0];
            max = sorted[received - 1];
            prom = rtts.reduce((a, b) => a + b, 0) / received;
            const q1 = sorted[Math.floor(received * 0.25)];
            const q3 = sorted[Math.floor(received * 0.75)];
            jitter = (q3 - q1) / 2;

            const mv = prom < 30 ? 50 : prom < 100 ? 150 : 300;
            this.gaugeDl.maxValue = mv;
            this.gaugeUl.maxValue = mv;
            this.gaugeDl.setValue(prom);
            this.gaugeUl.setValue(prom);
        }

        this.results.ping = {
            rtt_promedio: prom ?? null,
            rtt_jitter: jitter ?? null,
            rtt_min: min ?? null,
            rtt_max: max ?? null,
            rtts,
            paquetes_enviados: count,
            paquetes_recibidos: received,
            paquetes_perdidos: lost,
            porcentaje_perdida: pctLost,
        };

        setText('result-ping-prom', formatMs(prom));
        setText('result-ping-jitter', formatMs(jitter));
        setText('result-ping-perdida', pctLost.toFixed(1) + '%',
            pctLost === 0 ? 'success' : 'danger');
    },

    async _runDownloadPhase() {
        this.gaugeDl.label = 'Mbps ↓';
        this.gaugeUl.label = 'Mbps ↓';
        this.gaugeDl.setPhase('download');
        this.gaugeUl.setPhase('download');
        this.gaugeDl.maxValue = 100;
        this.gaugeUl.maxValue = 100;

        const totalSize = 5 * 1024 * 1024;
        const streams = 4;
        const signal = this._ac.signal;
        const self = this;

        let completed = 0;
        const streamBytes = new Array(streams).fill(0);
        const start = performance.now();
        let lastSampleTime = start;
        let lastSampleBytes = 0;

        this._setDlProgress(5, 'Conectando...');

        this._sampleTimer = setInterval(() => {
            const now = performance.now();
            const total = streamBytes.reduce((a, b) => a + b, 0);
            const dt = (now - lastSampleTime) / 1000;
            if (dt >= 0.15) {
                const instMbps = ((total - lastSampleBytes) * 8) / (dt * 1000000);
                self.chart.addPoint(0, Math.max(instMbps, 0), (now - start) / 1000);
                self.gaugeDl.setValue(Math.max(instMbps, 0));
                self.gaugeUl.setValue(Math.max(instMbps, 0));
                const pct = 25 + Math.min((total / totalSize) * 30, 30);
                self._setProgress(pct, `Descargando... ${formatMbps(instMbps)}`);
                self._setDlProgress((total / totalSize) * 100, `${formatMbps(instMbps)}`);
                lastSampleBytes = total;
                lastSampleTime = now;
            }
        }, 150);

        const promises = Array.from({ length: streams }, async (_, i) => {
            try {
                const resp = await fetch(
                    `${API_BASE}/download.php?size=${totalSize}&id=${i}&_=${Date.now()}`,
                    { signal }
                );
                const reader = resp.body.getReader();
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    if (signal.aborted) {
                        reader.cancel().catch(() => {});
                        throw new DOMException('Abortado', 'AbortError');
                    }
                    streamBytes[i] += value.length;
                }
            } finally {
                completed++;
            }
        });

        try {
            await Promise.allSettled(promises);
        } finally {
            clearInterval(this._sampleTimer);
            this._sampleTimer = null;
        }

        if (completed < streams) {
            const rate = completed / streams;
            self.gaugeDl.setValue(self.gaugeDl.value * rate);
        }

        const elapsed = (performance.now() - start) / 1000;
        const totalBytes = streamBytes.reduce((a, b) => a + b, 0);
        const mbps = totalBytes > 0 ? (totalBytes * 8) / (elapsed * 1000000) : 0;

        this.results.download = { bytes: totalBytes, tiempo: elapsed, mbps };
        this._setDlProgress(100, `${formatMbps(mbps)}`);

        setText('result-dl-velocidad', formatMbps(mbps),
            mbps > 50 ? 'success' : mbps > 10 ? 'warning' : 'danger');
        setText('result-dl-data', formatBytes(totalBytes));
        setText('result-dl-tiempo', elapsed.toFixed(2) + ' s');
    },

    async _runUploadPhase() {
        this.gaugeUl.label = 'Mbps ↑';
        this.gaugeDl.label = 'Mbps ↑';
        this.gaugeUl.setPhase('upload');
        this.gaugeDl.setPhase('upload');
        this.gaugeUl.maxValue = Math.max(this.constructor._lastDlSpeed || 100, 20);
        this.gaugeDl.maxValue = Math.max(this.constructor._lastDlSpeed || 100, 20);

        const totalSize = 3 * 1024 * 1024;
        const start = performance.now();
        const self = this;
        const signal = this._ac.signal;
        let cancelled = false;
        let prevLoaded = 0, prevTime = start;

        this._setUlProgress(5, 'Preparando...');

        const payload = new Uint8Array(totalSize);
        for (let i = 0; i < totalSize; i += 65536) {
            const len = Math.min(65536, totalSize - i);
            const tmp = new Uint8Array(len);
            crypto.getRandomValues(tmp);
            payload.set(tmp, i);
        }

        return new Promise((resolve) => {
            const xhr = new XMLHttpRequest();

            signal.addEventListener('abort', () => {
                cancelled = true;
                xhr.abort();
            }, { once: true });

            xhr.upload.onprogress = (e) => {
                if (!e.lengthComputable || cancelled) return;
                const now = performance.now();
                const dt = (now - prevTime) / 1000;
                if (dt >= 0.2) {
                    const instMbps = ((e.loaded - prevLoaded) * 8) / (dt * 1000000);
                    self.chart.addPoint(1, Math.max(instMbps, 0), (now - start) / 1000);
                    self.gaugeUl.setValue(Math.max(instMbps, 0));
                    self.gaugeDl.setValue(Math.max(instMbps, 0));
                    const pct = 60 + Math.min((e.loaded / e.total) * 30, 30);
                    self._setProgress(pct, `Subiendo... ${formatMbps(instMbps)}`);
                    self._setUlProgress((e.loaded / e.total) * 100, `${formatMbps(instMbps)}`);
                    prevLoaded = e.loaded;
                    prevTime = now;
                }
            };

            xhr.onload = () => {
                if (cancelled) { resolve(); return; }
                const elapsed = (performance.now() - start) / 1000;
                const mbps = totalSize > 0 ? (totalSize * 8) / (elapsed * 1000000) : 0;
                self.constructor._lastDlSpeed = mbps;
                self.results.upload = { bytes: totalSize, tiempo: elapsed, mbps };
                self._setUlProgress(100, `${formatMbps(mbps)}`);

                setText('result-ul-velocidad', formatMbps(mbps),
                    mbps > 30 ? 'success' : mbps > 5 ? 'warning' : 'danger');
                setText('result-ul-data', formatBytes(totalSize));
                setText('result-ul-tiempo', elapsed.toFixed(2) + ' s');
                resolve();
            };
            xhr.onerror = () => {
                if (cancelled) { resolve(); return; }
                showError('speedtest-error', 'Error en prueba de subida');
                resolve();
            };
            xhr.onabort = () => { resolve(); };

            xhr.open('POST', `${API_BASE}/upload.php`);
            xhr.setRequestHeader('Content-Type', 'application/octet-stream');
            xhr.send(payload);
        });
    },

    _freezeResults() {
        const d = this.results.download;
        const u = this.results.upload;
        if (d && d.mbps) {
            this.gaugeDl.label = 'Mbps ↓';
            this.gaugeDl.setPhase('download');
            this.gaugeDl.maxValue = Math.max(d.mbps * 1.3, 50);
            this.gaugeDl.setValue(d.mbps);
            this._setDlProgress(100, formatMbps(d.mbps));
        }
        if (u && u.mbps) {
            this.gaugeUl.label = 'Mbps ↑';
            this.gaugeUl.setPhase('upload');
            this.gaugeUl.maxValue = Math.max(u.mbps * 1.3, 50);
            this.gaugeUl.setValue(u.mbps);
            this._setUlProgress(100, formatMbps(u.mbps));
        }
    },

    _showSummary() {
        show('speedtest-summary');

        const p = this.results.ping;
        const d = this.results.download;
        const u = this.results.upload;

        let bloat = '—';
        let bloatClass = 'text2';
        if (p && p.rtt_promedio) {
            const baseline = p.rtt_promedio;
            if (baseline < 5) {
                bloat = 'A (Latencia excelente)';
                bloatClass = 'success';
            } else if (baseline < 20) {
                bloat = 'B (Latencia baja)';
                bloatClass = 'success';
            } else if (baseline < 50) {
                bloat = 'C (Latencia moderada)';
                bloatClass = 'warning';
            } else if (baseline < 150) {
                bloat = 'D (Latencia alta)';
                bloatClass = 'warning';
            } else {
                bloat = 'F (Latencia muy alta)';
                bloatClass = 'danger';
            }
        }
        setText('bufferbloat', bloat, bloatClass);

        if (d && d.mbps) {
            setText('result-dl-data', d.mbps.toFixed(2) + ' Mbps @ ' + d.tiempo.toFixed(1) + 's');
        }
        if (u && u.mbps) {
            setText('result-ul-data', u.mbps.toFixed(2) + ' Mbps @ ' + u.tiempo.toFixed(1) + 's');
        }
    },

    _setProgress(pct, label) {
        const el = document.getElementById('speedtest-status');
        if (el) el.textContent = label + ' (' + Math.round(pct) + '%)';
    },

    _setDlProgress(pct, label) {
        const bar = document.getElementById('progress-dl-fill');
        if (bar) bar.style.width = Math.min(pct, 100) + '%';
        const el = document.getElementById('progress-dl-label');
        if (el) el.textContent = label || 'Descarga';
    },

    _setUlProgress(pct, label) {
        const bar = document.getElementById('progress-ul-fill');
        if (bar) bar.style.width = Math.min(pct, 100) + '%';
        const el = document.getElementById('progress-ul-label');
        if (el) el.textContent = label || 'Subida';
    },

    _sleep(ms) {
        return new Promise(r => setTimeout(r, ms));
    },
};
