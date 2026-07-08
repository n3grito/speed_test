const SPEEDTEST = {
    state: 'idle',
    gauge: null,
    chart: null,
    results: { ping: null, download: null, upload: null },

    async start() {
        if (this.state !== 'idle') return;
        this.state = 'running';
        this.results = { ping: null, download: null, upload: null };

        show('speedtest-progress');
        hide('speedtest-summary');
        hide('speedtest-error');
        this._setProgress(0, 'Preparando...');

        if (!this.gauge) {
            this.gauge = new SpeedGauge('gauge-canvas');
        }
        if (!this.chart) {
            this.chart = new LiveChart('speed-chart', {
                maxPoints: 160, maxValue: 100, label: 'Mbps',
                color: '#3b82f6', bgColor: 'rgba(59,130,246,0.12)',
            });
        }
        this.gauge.setPhase('ping');
        this.chart.clear();
        this.chart.maxValue = 100;
        this._setProgress(5, 'Midiendo latencia...');

        try {
            await this._runPingPhase();
            this._setProgress(25, 'Descargando...');
            await this._runDownloadPhase();
            this._setProgress(60, 'Subiendo...');
            await this._runUploadPhase();
            this._setProgress(95, 'Generando reporte...');
            this._showSummary();
            this._setProgress(100, 'Completado');
        } catch (e) {
            showError('speedtest-error', 'Error: ' + e.message);
        } finally {
            this.state = 'idle';
        }
    },

    async _runPingPhase() {
        const target = $('#ping-target').value || '8.8.8.8';
        const count = parseInt($('#ping-count').value) || 10;
        const d = await apiFetch(
            `${API_BASE}/icmp.php?target=${encodeURIComponent(target)}&count=${count}`
        );

        this.results.ping = d;
        this.gauge.label = 'ms';
        this.gauge.setPhase('ping');

        if (d.rtt_promedio) {
            this.gauge.maxValue = d.rtt_promedio < 30 ? 50 : d.rtt_promedio < 100 ? 150 : 300;
        }

        if (d.rtts && d.rtts.length) {
            for (const v of d.rtts) {
                this.gauge.setValue(v);
                await this._sleep(30);
            }
            this.gauge.setValue(d.rtt_promedio);
        }

        setText('result-ping-min', formatMs(d.rtt_min));
        setText('result-ping-prom', formatMs(d.rtt_promedio));
        setText('result-ping-max', formatMs(d.rtt_max));
        setText('result-ping-jitter', formatMs(d.rtt_jitter));
        setText('result-ping-perdida', d.porcentaje_perdida + '%',
            d.porcentaje_perdida === 0 ? 'success' : 'danger');
    },

    async _runDownloadPhase() {
        this.gauge.label = 'Mbps ↓';
        this.gauge.setPhase('download');
        this.gauge.maxValue = 100;

        const totalSize = 5 * 1024 * 1024;
        const streams = 4;
        const self = this;

        let completed = 0;
        const streamBytes = new Array(streams).fill(0);
        const start = performance.now();
        let lastSampleTime = start;
        let lastSampleBytes = 0;

        const sampleTimer = setInterval(() => {
            const now = performance.now();
            const total = streamBytes.reduce((a, b) => a + b, 0);
            const dt = (now - lastSampleTime) / 1000;
            if (dt >= 0.15) {
                const instMbps = ((total - lastSampleBytes) * 8) / (dt * 1000000);
                self.chart.addPoint(Math.max(instMbps, 0), (now - start) / 1000);
                self.gauge.setValue(Math.max(instMbps, 0));
                lastSampleBytes = total;
                lastSampleTime = now;
            }
        }, 150);

        const promises = Array.from({ length: streams }, async (_, i) => {
            try {
                const resp = await fetch(
                    `${API_BASE}/download.php?size=${totalSize}&id=${i}&_=${Date.now()}`
                );
                const reader = resp.body.getReader();
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    streamBytes[i] += value.length;
                }
            } finally {
                completed++;
            }
        });

        await Promise.allSettled(promises);
        clearInterval(sampleTimer);

        if (completed < streams) {
            const rate = completed / streams;
            self.gauge.setValue(self.gauge.value * rate);
        }

        const elapsed = (performance.now() - start) / 1000;
        const totalBytes = streamBytes.reduce((a, b) => a + b, 0);
        const mbps = totalBytes > 0 ? (totalBytes * 8) / (elapsed * 1000000) : 0;

        this.results.download = { bytes: totalBytes, tiempo: elapsed, mbps };

        setText('result-dl-velocidad', formatMbps(mbps),
            mbps > 50 ? 'success' : mbps > 10 ? 'warning' : 'danger');
        setText('result-dl-data', formatBytes(totalBytes));
        setText('result-dl-tiempo', elapsed.toFixed(2) + ' s');
    },

    async _runUploadPhase() {
        this.gauge.label = 'Mbps ↑';
        this.gauge.setPhase('upload');
        this.gauge.maxValue = Math.max(this.constructor._lastDlSpeed || 100, 20);

        const totalSize = 3 * 1024 * 1024;
        const start = performance.now();
        const self = this;
        let lastLoaded = 0, lastTime = start;

        const payload = new Uint8Array(totalSize);
        for (let i = 0; i < totalSize; i += 65536) {
            const len = Math.min(65536, totalSize - i);
            const tmp = new Uint8Array(len);
            crypto.getRandomValues(tmp);
            payload.set(tmp, i);
        }

        return new Promise((resolve) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', `${API_BASE}/upload.php`);
            xhr.setRequestHeader('Content-Type', 'application/octet-stream');

            xhr.upload.onprogress = (e) => {
                if (!e.lengthComputable) return;
                const now = performance.now();
                const dt = (now - lastTime) / 1000;
                if (dt >= 0.2) {
                    const instMbps = ((e.loaded - lastLoaded) * 8) / (dt * 1000000);
                    self.chart.addPoint(Math.max(instMbps, 0), (now - start) / 1000);
                    self.gauge.setValue(Math.max(instMbps, 0));
                    lastLoaded = e.loaded;
                    lastTime = now;
                }
            };

            xhr.onload = () => {
                const elapsed = (performance.now() - start) / 1000;
                const mbps = totalSize > 0 ? (totalSize * 8) / (elapsed * 1000000) : 0;
                self.constructor._lastDlSpeed = mbps;
                self.results.upload = { bytes: totalSize, tiempo: elapsed, mbps };

                setText('result-ul-velocidad', formatMbps(mbps),
                    mbps > 30 ? 'success' : mbps > 5 ? 'warning' : 'danger');
                setText('result-ul-data', formatBytes(totalSize));
                setText('result-ul-tiempo', elapsed.toFixed(2) + ' s');
                resolve();
            };
            xhr.onerror = () => resolve();
            xhr.send(payload);
        });
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
            const ratio = 1;
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

        if (d && d.mbps && u && u.mbps) {
            const ratio = d.mbps / Math.max(u.mbps, 0.1);
            setText('dl-ul-ratio', ratio.toFixed(1) + ':1');
        }

        if (d && d.mbps) {
            setText('result-dl-data', d.mbps.toFixed(2) + ' Mbps @ ' + d.tiempo.toFixed(1) + 's');
        }
        if (u && u.mbps) {
            setText('result-ul-data', u.mbps.toFixed(2) + ' Mbps @ ' + u.tiempo.toFixed(1) + 's');
        }
    },

    _setProgress(pct, label) {
        setProgress('speedtest-progress-fill', pct);
        const el = document.getElementById('speedtest-progress-label');
        if (el) el.textContent = label + ' (' + Math.round(pct) + '%)';
    },

    _sleep(ms) {
        return new Promise(r => setTimeout(r, ms));
    },
};
