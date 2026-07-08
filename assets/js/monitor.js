const MONITOR_PROTOCOLS = [
    { id: 'ping', label: 'ICMP Ping', desc: 'Verifica conectividad por ICMP', defTarget: '8.8.8.8', defInterval: 5 },
    { id: 'http',  label: 'HTTP Latencia', desc: 'Mide tiempo de respuesta HTTP', defTarget: 'http://google.com', defInterval: 10 },
    { id: 'dns',   label: 'Resolución DNS', desc: 'Mide tiempo de resolución de dominio', defTarget: 'google.com', defInterval: 30 },
    { id: 'tcp',   label: 'TCP Handshake', desc: 'Verifica puerto abierto vía TCP', defTarget: 'google.com:80', defInterval: 15 },
];

class MonitorEngine {
    constructor() {
        this._timers = {};
        this._stats = {};
        this._history = [];
        this._maxLog = 200;
        this._running = false;
        this._startTime = null;
        this._listeners = [];
        this._loadHistory();
        this._loadConfig();
    }

    get protocols() { return MONITOR_PROTOCOLS; }

    get config() {
        return MONITOR_PROTOCOLS.map(p => ({
            id: p.id,
            enabled: localStorage.getItem('mon_enabled_' + p.id) !== 'false',
            interval: parseInt(localStorage.getItem('mon_interval_' + p.id)) || p.defInterval,
            target: localStorage.getItem('mon_target_' + p.id) || p.defTarget,
        }));
    }

    _loadConfig() {
        MONITOR_PROTOCOLS.forEach(p => {
            if (localStorage.getItem('mon_interval_' + p.id) === null) {
                localStorage.setItem('mon_interval_' + p.id, String(p.defInterval));
            }
            if (localStorage.getItem('mon_target_' + p.id) === null) {
                localStorage.setItem('mon_target_' + p.id, p.defTarget);
            }
            if (localStorage.getItem('mon_enabled_' + p.id) === null) {
                localStorage.setItem('mon_enabled_' + p.id, 'true');
            }
        });
    }

    saveConfig(protocolId, key, value) {
        localStorage.setItem('mon_' + key + '_' + protocolId, String(value));
        if (this._running && this._timers[protocolId]) {
            this.stopProtocol(protocolId);
            if (this.config.find(p => p.id === protocolId).enabled) {
                this.startProtocol(protocolId);
            }
        }
    }

    get running() { return this._running; }
    get startTime() { return this._startTime; }
    get history() { return this._history.slice(-this._maxLog); }
    get stats() { return this._stats; }

    onEvent(fn) {
        this._listeners.push(fn);
        return () => {
            this._listeners = this._listeners.filter(f => f !== fn);
        };
    }

    _emit(event, data) {
        this._listeners.forEach(fn => {
            try { fn(event, data); } catch (e) { /* ignore */ }
        });
    }

    start() {
        if (this._running) return;
        this._running = true;
        this._startTime = Date.now();
        this._outageCount = 0;
        this._wasDown = false;

        MONITOR_PROTOCOLS.forEach(p => {
            const cfg = this.config.find(c => c.id === p.id);
            if (cfg && cfg.enabled) this.startProtocol(p.id);
        });

        this._emit('start', { time: this._startTime });
    }

    stop() {
        if (!this._running) return;
        this._running = false;
        MONITOR_PROTOCOLS.forEach(p => {
            if (this._timers[p.id]) this.stopProtocol(p.id);
        });
        this._emit('stop', { time: Date.now() });
    }

    startProtocol(protocolId) {
        if (this._timers[protocolId]) clearInterval(this._timers[protocolId]);
        const cfg = this.config.find(c => c.id === protocolId);
        if (!cfg) return;
        this._runCheck(protocolId);
        this._timers[protocolId] = setInterval(() => this._runCheck(protocolId), cfg.interval * 1000);
    }

    stopProtocol(protocolId) {
        if (this._timers[protocolId]) {
            clearInterval(this._timers[protocolId]);
            delete this._timers[protocolId];
        }
    }

    async _runCheck(protocolId) {
        const cfg = this.config.find(c => c.id === protocolId);
        if (!cfg) return;
        try {
            const resp = await fetch(
                `${API_BASE}/monitor.php?type=${encodeURIComponent(protocolId)}&target=${encodeURIComponent(cfg.target)}&_=${Date.now()}`
            );
            const data = await resp.json();
            this._onResult(protocolId, data);
        } catch (e) {
            this._onResult(protocolId, {
                success: false, type: protocolId, target: cfg.target,
                rtt_ms: null, error: e.message, timestamp: new Date().toISOString(),
            });
        }
    }

    _onResult(protocolId, data) {
        const ts = Date.now();
        const entry = {
            ts, protocol: protocolId, success: data.success,
            rtt: data.rtt_ms, error: data.error,
        };
        this._history.push(entry);
        if (this._history.length > this._maxLog * 2) {
            this._history = this._history.slice(-this._maxLog);
        }

        if (!this._stats[protocolId]) {
            this._stats[protocolId] = {
                checks: 0, failures: 0, lastRtt: null, minRtt: null,
                maxRtt: null, avgRtt: 0, uptime: 0, lastSuccess: null,
                lastFailure: null, consecutive: 0, maxConsecutive: 0,
            };
        }
        const s = this._stats[protocolId];
        s.checks++;
        if (data.success) {
            s.lastSuccess = ts;
            s.consecutive = Math.max(s.consecutive + 1, 1);
            s.maxConsecutive = Math.max(s.maxConsecutive, s.consecutive);
            s.lastRtt = data.rtt;
            if (s.minRtt === null || data.rtt < s.minRtt) s.minRtt = data.rtt;
            if (s.maxRtt === null || data.rtt > s.maxRtt) s.maxRtt = data.rtt;
            s.avgRtt = ((s.avgRtt * (s.checks - s.failures - 1)) + data.rtt) / Math.max(s.checks - s.failures, 1);

            if (this._wasDown && protocolId === 'ping') {
                this._wasDown = false;
                this._emit('reconnect', { ts, protocol: protocolId, downtime: this._outageStarted ? ts - this._outageStarted : 0 });
            }
        } else {
            s.failures++;
            s.lastFailure = ts;
            s.consecutive = Math.min(s.consecutive - 1, 0);
            s.maxConsecutive = Math.max(s.maxConsecutive, Math.abs(s.consecutive));

            if (!this._wasDown && protocolId === 'ping') {
                this._wasDown = true;
                this._outageStarted = ts;
                this._outageCount++;
                this._emit('disconnect', { ts, protocol: protocolId, error: data.error });
            }
        }
        s.uptime = s.checks > 0 ? ((s.checks - s.failures) / s.checks) * 100 : 100;

        this._saveHistory();
        this._emit('result', { protocol: protocolId, entry, stats: s });
    }

    get uptimeSeconds() {
        if (!this._startTime) return 0;
        return Math.floor((Date.now() - this._startTime) / 1000);
    }

    get outageCount() { return this._outageCount || 0; }

    _saveHistory() {
        try {
            const recent = this._history.slice(-50);
            localStorage.setItem('mon_history', JSON.stringify(recent));
            localStorage.setItem('mon_stats', JSON.stringify(this._stats));
            localStorage.setItem('mon_uptime', String(this.uptimeSeconds));
            localStorage.setItem('mon_outages', String(this.outageCount));
        } catch (e) { /* storage full, ignore */ }
    }

    _loadHistory() {
        try {
            const h = localStorage.getItem('mon_history');
            if (h) {
                const parsed = JSON.parse(h);
                if (Array.isArray(parsed)) this._history = parsed;
            }
            const s = localStorage.getItem('mon_stats');
            if (s) {
                const parsed = JSON.parse(s);
                if (typeof parsed === 'object') this._stats = parsed;
            }
        } catch (e) { /* ignore */ }
    }

    clearHistory() {
        this._history = [];
        this._stats = {};
        this._outageCount = 0;
        this._wasDown = false;
        this._outageStarted = null;
        localStorage.removeItem('mon_history');
        localStorage.removeItem('mon_stats');
        localStorage.removeItem('mon_uptime');
        localStorage.removeItem('mon_outages');
        this._emit('clear', {});
    }
}

const MONITOR = new MonitorEngine();
