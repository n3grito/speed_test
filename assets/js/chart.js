class LiveChart {
    constructor(canvasId, options = {}) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.dpr = window.devicePixelRatio || 1;

        this.maxPoints = options.maxPoints || 80;
        this.maxValue = options.maxValue || 100;
        this.label = options.label || 'Mbps';
        this.fill = options.fill !== false;

        const seriesConfig = options.series || null;
        if (seriesConfig) {
            this.series = seriesConfig.map(s => ({
                label: s.label || 'Serie',
                color: s.color || '#3b82f6',
                bgColor: s.bgColor || 'rgba(59,130,246,0.1)',
                data: [],
            }));
        } else {
            this.series = [{
                label: this.label,
                color: options.color || '#3b82f6',
                bgColor: options.bgColor || 'rgba(59,130,246,0.1)',
                data: [],
            }];
        }

        this._resize();
        this._bindResize();
        this.draw();
    }

    addPoint(seriesIdx, value, timestamp) {
        if (value == null || isNaN(value)) return;
        if (typeof seriesIdx !== 'number') {
            timestamp = value;
            value = seriesIdx;
            seriesIdx = 0;
        }
        const series = this.series[seriesIdx];
        if (!series) return;
        series.data.push({ value, ts: timestamp || performance.now() });
        if (series.data.length > this.maxPoints) {
            series.data = series.data.slice(-this.maxPoints);
        }
        this.draw();
    }

    clear() {
        for (const s of this.series) {
            s.data = [];
        }
        this.maxValue = 100;
        this.draw();
    }

    _resize() {
        const rect = this.canvas.getBoundingClientRect();
        this.width = rect.width;
        this.height = rect.height;
        this.canvas.width = rect.width * this.dpr;
        this.canvas.height = rect.height * this.dpr;
        this.ctx.scale(this.dpr, this.dpr);
    }

    _bindResize() {
        let timer;
        window.addEventListener('resize', () => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                this._resize();
                this.draw();
            }, 150);
        });
    }

    _getAllValues() {
        const all = [];
        for (const s of this.series) {
            for (const d of s.data) {
                if (d.value != null && !isNaN(d.value)) all.push(d.value);
            }
        }
        return all;
    }

    _recalcMax() {
        const values = this._getAllValues();
        if (values.length === 0) return;
        const peak = Math.max(...values);
        if (peak > this.maxValue * 0.75) {
            this.maxValue = peak * 1.3;
        } else if (peak < this.maxValue * 0.25 && this.maxValue > 5) {
            this.maxValue = Math.max(peak * 1.5, 2);
        }
    }

    draw() {
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;
        const pad = { t: 24, r: 16, b: 28, l: 48 };
        const plotW = w - pad.l - pad.r;
        const plotH = h - pad.t - pad.b;

        ctx.clearRect(0, 0, w, h);

        const allValues = this._getAllValues();
        const hasData = allValues.length > 0;

        if (!hasData) {
            ctx.fillStyle = '#475569';
            ctx.font = '12px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Esperando datos...', w / 2, h / 2);
            return;
        }

        this._recalcMax();
        const currentMax = Math.max(...allValues, 1);
        const yMax = Math.max(this.maxValue, currentMax * 1.1);

        const scaleY = (v) => pad.t + plotH - (v / yMax) * plotH;
        const scaleX = (i, len) => pad.l + (i / Math.max(len - 1, 1)) * plotW;

        for (let si = 0; si < this.series.length; si++) {
            const s = this.series[si];
            const vals = s.data.map(d => d.value);
            if (vals.length === 0) continue;

            ctx.beginPath();
            ctx.strokeStyle = s.color;
            ctx.lineWidth = si === 1 ? 2.5 : 2;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';

            for (let i = 0; i < vals.length; i++) {
                const x = scaleX(i, vals.length);
                const y = scaleY(vals[i]);
                i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            }
            ctx.stroke();

            if (this.fill && si === 0) {
                const lastX = scaleX(vals.length - 1, vals.length);
                ctx.lineTo(lastX, pad.t + plotH);
                ctx.lineTo(scaleX(0, 1), pad.t + plotH);
                ctx.closePath();
                const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + plotH);
                grad.addColorStop(0, s.bgColor);
                grad.addColorStop(1, 'transparent');
                ctx.fillStyle = grad;
                ctx.fill();
            }

            ctx.fillStyle = s.color;
            ctx.font = 'bold 11px system-ui, sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            const last = vals[vals.length - 1];
            const labelY = pad.t + (si * 16);
            ctx.fillText(s.label + ': ' + last.toFixed(2) + ' Mbps', pad.l, labelY);
        }

        ctx.fillStyle = '#64748b';
        ctx.font = '10px system-ui, sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        const steps = 4;
        for (let i = 0; i <= steps; i++) {
            const v = (yMax / steps) * i;
            const y = scaleY(v);
            ctx.fillText(v.toFixed(1), pad.l - 6, y);
            ctx.strokeStyle = 'rgba(255,255,255,0.05)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(pad.l, y);
            ctx.lineTo(w - pad.r, y);
            ctx.stroke();
        }

        const allTs = [];
        for (const s of this.series) {
            for (const d of s.data) {
                if (d.ts != null) allTs.push(d.ts);
            }
        }
        if (allTs.length > 0) {
            ctx.fillStyle = '#64748b';
            ctx.font = '10px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            const labelCount = Math.min(6, Math.max(...this.series.map(s => s.data.length)));
            for (let si = 0; si < this.series.length; si++) {
                const step = Math.max(1, Math.floor(this.series[si].data.length / labelCount));
                for (let i = 0; i < this.series[si].data.length; i += step) {
                    const label = (this.series[si].data[i].ts / 1000).toFixed(1) + 's';
                    ctx.fillText(label, scaleX(i, this.series[si].data.length), pad.t + plotH + 6);
                }
            }
        }
    }
}
