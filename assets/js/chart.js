class LiveChart {
    constructor(canvasId, options = {}) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.dpr = window.devicePixelRatio || 1;

        this.data = [];
        this.maxPoints = options.maxPoints || 80;
        this.maxValue = options.maxValue || 100;
        this.label = options.label || 'Mbps';
        this.color = options.color || '#3b82f6';
        this.bgColor = options.bgColor || 'rgba(59,130,246,0.1)';
        this.fill = options.fill !== false;

        this._resize();
        this._bindResize();
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

    addPoint(value, timestamp) {
        if (value == null || isNaN(value)) return;
        this.data.push({ value, ts: timestamp || performance.now() });
        if (this.data.length > this.maxPoints) {
            this.data = this.data.slice(-this.maxPoints);
        }
        if (value > this.maxValue * 0.8) {
            this.maxValue = value * 1.25;
        }
        this.draw();
    }

    clear() {
        this.data = [];
        this.maxValue = 100;
        this.draw();
    }

    draw() {
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;
        const pad = { t: 16, r: 16, b: 28, l: 48 };
        const plotW = w - pad.l - pad.r;
        const plotH = h - pad.t - pad.b;

        ctx.clearRect(0, 0, w, h);

        if (this.data.length === 0) {
            ctx.fillStyle = '#475569';
            ctx.font = '12px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Esperando datos...', w / 2, h / 2);
            return;
        }

        const values = this.data.map(d => d.value);
        const currentMax = Math.max(...values, 1);
        const yMax = Math.max(this.maxValue, currentMax * 1.1);

        const scaleY = (v) => pad.t + plotH - (v / yMax) * plotH;
        const scaleX = (i) => pad.l + (i / Math.max(this.data.length - 1, 1)) * plotW;

        ctx.beginPath();
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        for (let i = 0; i < this.data.length; i++) {
            const x = scaleX(i);
            const y = scaleY(values[i]);
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();

        if (this.fill) {
            const lastX = scaleX(this.data.length - 1);
            ctx.lineTo(lastX, pad.t + plotH);
            ctx.lineTo(scaleX(0), pad.t + plotH);
            ctx.closePath();
            const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + plotH);
            grad.addColorStop(0, this.bgColor);
            grad.addColorStop(1, 'transparent');
            ctx.fillStyle = grad;
            ctx.fill();
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

        ctx.fillStyle = '#64748b';
        ctx.font = '10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        const labelCount = Math.min(6, this.data.length);
        const step = Math.max(1, Math.floor(this.data.length / labelCount));
        for (let i = 0; i < this.data.length; i += step) {
            const label = (this.data[i].ts / 1000).toFixed(1) + 's';
            ctx.fillText(label, scaleX(i), pad.t + plotH + 6);
        }

        ctx.fillStyle = '#94a3b8';
        ctx.font = '11px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(this.label, pad.l, 2);

        if (values.length > 0) {
            const lastVal = values[values.length - 1];
            ctx.fillStyle = this.color;
            ctx.font = 'bold 13px system-ui, sans-serif';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'top';
            ctx.fillText(lastVal.toFixed(2) + ' ' + this.label, w - pad.r, 2);
        }
    }
}
