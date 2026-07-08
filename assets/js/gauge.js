class SpeedGauge {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.dpr = window.devicePixelRatio || 1;
        this.value = 0;
        this.maxValue = 200;
        this.label = 'Mbps';
        this.phase = 'idle';
        this._resize();
        this._bindResize();
        this.draw();
    }

    _resize() {
        const rect = this.canvas.getBoundingClientRect();
        this.w = rect.width;
        this.h = rect.height;
        this.cx = this.w / 2;
        this.cy = this.h / 2 + 10;
        this.r = Math.min(this.w, this.h) / 2 - 20;
        this.canvas.width = this.w * this.dpr;
        this.canvas.height = this.h * this.dpr;
        this.ctx.scale(this.dpr, this.dpr);
    }

    _bindResize() {
        let timer;
        window.addEventListener('resize', () => {
            clearTimeout(timer);
            timer = setTimeout(() => { this._resize(); this.draw(); }, 100);
        });
    }

    setValue(v) {
        this.value = Math.max(0, v);
        if (v > this.maxValue * 0.85) this.maxValue = v * 1.2;
        this.draw();
    }

    setPhase(phase) {
        this.phase = phase;
        this.draw();
    }

    draw() {
        const ctx = this.ctx;
        const w = this.w, h = this.h;
        ctx.clearRect(0, 0, w, h);

        const r = this.r;
        const cx = this.cx, cy = this.cy;

        const pct = Math.min(this.value / this.maxValue, 1);
        const startAngle = Math.PI * 0.75;
        const endAngle = Math.PI * 2.25;
        const totalAngle = endAngle - startAngle;
        const filledAngle = startAngle + totalAngle * pct;

        ctx.lineCap = 'round';

        ctx.beginPath();
        ctx.arc(cx, cy, r, startAngle, endAngle);
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 16;
        ctx.stroke();

        const grad = ctx.createLinearGradient(cx - r, cy, cx + r, cy);
        if (this.phase === 'download') {
            grad.addColorStop(0, '#3b82f6');
            grad.addColorStop(1, '#06b6d4');
        } else if (this.phase === 'upload') {
            grad.addColorStop(0, '#22c55e');
            grad.addColorStop(1, '#16a34a');
        } else if (this.phase === 'ping') {
            grad.addColorStop(0, '#f59e0b');
            grad.addColorStop(1, '#eab308');
        } else {
            grad.addColorStop(0, '#64748b');
            grad.addColorStop(1, '#94a3b8');
        }

        if (pct > 0.01) {
            ctx.beginPath();
            ctx.arc(cx, cy, r, startAngle, filledAngle);
            ctx.strokeStyle = grad;
            ctx.lineWidth = 16;
            ctx.stroke();
        }

        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        ctx.beginPath();
        ctx.arc(cx, cy, r - 24, 0, Math.PI * 2);
        ctx.fill();

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (this.phase === 'idle') {
            ctx.fillStyle = '#64748b';
            ctx.font = '14px system-ui, sans-serif';
            ctx.fillText('Listo', cx, cy - 10);
            ctx.fillStyle = '#475569';
            ctx.font = '11px system-ui, sans-serif';
            ctx.fillText('Presiona Iniciar', cx, cy + 14);
        } else {
            ctx.fillStyle = '#f1f5f9';
            ctx.font = 'bold 36px system-ui, sans-serif';
            ctx.fillText(this.value.toFixed(1), cx, cy - 8);

            ctx.fillStyle = '#94a3b8';
            ctx.font = '13px system-ui, sans-serif';
            ctx.fillText(this.label, cx, cy + 24);

            const phaseLabel = { ping: 'PING', download: 'DESCARGA', upload: 'SUBIDA' };
            ctx.fillStyle = '#64748b';
            ctx.font = '11px system-ui, sans-serif';
            ctx.fillText(phaseLabel[this.phase] || '', cx, cy - 42);
        }

        ctx.font = '10px system-ui, sans-serif';
        ctx.fillStyle = '#475569';
        ctx.textAlign = 'center';
        ctx.fillText('0', cx - r + 10, cy + r - 10);
        ctx.fillText(this.maxValue.toFixed(0), cx + r - 10, cy + r - 10);
    }
}
