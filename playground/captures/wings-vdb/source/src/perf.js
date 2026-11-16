// The drawer's perf page: live renderer metrics and a 30 second chart of
// frame rate and GPU time. It samples four times a second from load, so the
// history is there when the page opens.
const SAMPLES = 120; // 30 s at 250 ms

export function perfPage({ getCloud, describe }) {
  const history = [];
  setInterval(() => {
    const stats = getCloud()?.getStats();
    if (!stats) return;
    history.push({ fps: stats.fps, gpuMs: stats.gpuMs });
    if (history.length > SAMPLES) history.shift();
  }, 250);

  return {
    name: 'perf',
    label: 'performance',
    about: 'live performance metrics and renderer information',
    mount(el) {
      el.innerHTML = '<div class="perf-stats"></div><canvas class="perf-chart" aria-label="Frame rate and GPU time over the last 30 seconds"></canvas>';
      const list = el.querySelector('.perf-stats'), chart = el.querySelector('.perf-chart');
      const rows = new Map();
      const row = (key, value) => {
        if (!rows.has(key)) {
          const r = document.createElement('div'); r.className = 'perf-row';
          r.innerHTML = '<span class="perf-key"></span><span class="perf-value"></span>';
          r.firstChild.textContent = key;
          list.append(r); rows.set(key, r.lastChild);
        }
        const cell = rows.get(key);
        if (cell.textContent !== value) { cell.textContent = value; cell.title = value; }
      };
      function drawChart() {
        const ratio = devicePixelRatio || 1, w = chart.clientWidth, h = chart.clientHeight;
        if (!w || !h) return;
        if (chart.width !== Math.round(w * ratio) || chart.height !== Math.round(h * ratio)) { chart.width = Math.round(w * ratio); chart.height = Math.round(h * ratio); }
        const ctx = chart.getContext('2d'), style = getComputedStyle(el);
        const fg = style.getPropertyValue('--term-fg').trim(), dim = style.getPropertyValue('--term-dim').trim(), line = style.getPropertyValue('--term-line').trim();
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.clearRect(0, 0, w, h);
        const top = Math.max(60, ...history.map(s => s.fps));
        ctx.strokeStyle = line; ctx.lineWidth = 1;
        for (const v of [30, 60]) { const y = h - v / top * (h - 16); ctx.beginPath(); ctx.moveTo(0, y + .5); ctx.lineTo(w, y + .5); ctx.stroke(); }
        const plot = (pick, color, scale) => {
          ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.beginPath();
          history.forEach((s, i) => {
            const v = pick(s); if (v === null) return;
            const x = w - (history.length - 1 - i) * (w / (SAMPLES - 1)), y = h - Math.min(1, v / scale) * (h - 16);
            i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
          });
          ctx.stroke();
        };
        const gpuTop = Math.max(50, ...history.map(s => s.gpuMs ?? 0));
        plot(s => s.gpuMs, dim, gpuTop);
        plot(s => s.fps, fg, top);
        ctx.font = '11px ' + style.fontFamily; ctx.textBaseline = 'top';
        ctx.fillStyle = fg;
        const key = (text, x, color) => {
          ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, 6); ctx.lineTo(x + 10, 6); ctx.stroke();
          ctx.fillText(text, x + 13, 0);
          return x + 13 + ctx.measureText(text).width + 8;
        };
        key(`gpu ms (0–${Math.round(gpuTop)})`, key('fps', 0, fg), dim);
        const note = '30 s · lines at 30 and 60 fps';
        ctx.fillText(note, w - ctx.measureText(note).width, 0);
      }
      return {
        update() {
          const cloud = getCloud();
          const s = cloud?.getStats();
          if (!s) { row('renderer', 'unavailable'); return; }
          const recent = history.map(h => h.fps).filter(v => v > 0);
          const avg = recent.length ? recent.reduce((a, b) => a + b) / recent.length : 0;
          row('fps', `${s.fps.toFixed(1)}   avg ${avg.toFixed(1)}   low ${(recent.length ? Math.min(...recent) : 0).toFixed(1)}   (30 s)`);
          row('frame', s.frameMs ? `${s.frameMs.toFixed(1)} ms between drawn frames` : '—');
          row('gpu', s.gpuTimer ? (s.gpuMs === null ? 'measuring…' : `${s.gpuMs.toFixed(1)} ms per frame`) : 'no GPU timer in this browser');
          row('renderer', `${s.backend} · ${s.gpu}`);
          row('canvas', `${s.width}×${s.height} · scale ${s.scale.toFixed(2)} · ${s.steps} steps · ${s.quality}`);
          row('screen', `${innerWidth}×${innerHeight} css px · dpr ${(devicePixelRatio || 1).toFixed(2)}`);
          row('scene', `${describe(s.progress)} · progress ${s.progress.toFixed(2)} · chat ${s.install.toFixed(2)}`);
          row('frames', `${s.drawn} drawn · motion ${s.moving ? 'on' : 'off'} · context ${s.contextLost ? 'lost' : 'ok'}`);
          const heap = performance.memory?.usedJSHeapSize;
          row('memory', heap ? `${(heap / 1048576).toFixed(0)} MB JS heap` : 'not reported by this browser');
          drawChart();
        },
      };
    },
  };
}
