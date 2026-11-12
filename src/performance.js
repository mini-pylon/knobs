// Frame rate and memory for the drawer's performance tab. The frame loop
// runs only while the tab is showing; destroy cancels it.
const SAMPLES = 120;

function blank(value) {
  return value == null ? '—' : String(value);
}

export function performancePage({ stats } = {}) {
  let running = false;
  let rafId = 0;
  let frames = 0;
  let windowStart = 0;
  let fps = null;
  const history = [];

  function tick(now) {
    if (!running) return;
    if (!windowStart) windowStart = now;
    frames += 1;
    const span = now - windowStart;
    if (span >= 250) {
      fps = frames * 1000 / span;
      history.push(fps);
      if (history.length > SAMPLES) history.shift();
      frames = 0;
      windowStart = now;
    }
    if (running) rafId = requestAnimationFrame(tick);
  }

  function memoryText() {
    try {
      const heap = performance.memory?.usedJSHeapSize;
      if (heap == null) return null;
      return `${Math.round(heap / 1048576)} MB`;
    } catch {
      return null;
    }
  }

  function extraRows() {
    if (typeof stats !== 'function') return [];
    let data;
    try { data = stats(); } catch { return []; }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
    return Object.entries(data);
  }

  return {
    name: 'performance',
    label: 'performance',
    about: 'frame rate and memory',
    show() {
      if (running) return;
      running = true;
      frames = 0;
      windowStart = 0;
      rafId = requestAnimationFrame(tick);
    },
    hide() {
      running = false;
      cancelAnimationFrame(rafId);
      rafId = 0;
    },
    destroy() { this.hide(); },
    mount(el) {
      el.innerHTML = '<div class="perf-stats"></div><canvas class="perf-chart" aria-label="Frame rate over the last 30 seconds"></canvas>';
      const list = el.querySelector('.perf-stats');
      const chart = el.querySelector('.perf-chart');
      function drawChart() {
        const ratio = devicePixelRatio || 1;
        const w = chart.clientWidth;
        const h = chart.clientHeight;
        if (!w || !h || history.length === 0) return;
        const width = Math.round(w * ratio);
        const height = Math.round(h * ratio);
        if (chart.width !== width || chart.height !== height) {
          chart.width = width;
          chart.height = height;
        }
        const ctx = chart.getContext('2d');
        const style = getComputedStyle(el);
        const fg = style.getPropertyValue('--term-fg').trim();
        const line = style.getPropertyValue('--term-line').trim();
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.clearRect(0, 0, w, h);
        const top = Math.max(60, ...history);
        ctx.strokeStyle = line;
        ctx.lineWidth = 1;
        for (const mark of [30, 60]) {
          const y = h - mark / top * (h - 16);
          ctx.beginPath();
          ctx.moveTo(0, y + 0.5);
          ctx.lineTo(w, y + 0.5);
          ctx.stroke();
        }
        ctx.strokeStyle = fg;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        history.forEach((sample, i) => {
          const x = history.length === 1 ? w : w - (history.length - 1 - i) * (w / (SAMPLES - 1));
          const y = h - Math.min(1, sample / top) * (h - 16);
          if (i) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        });
        ctx.stroke();
      }
      return {
        update() {
          const rows = [
            ['fps', fps == null ? null : fps.toFixed(1)],
            ['memory', memoryText()],
            ...extraRows(),
          ];
          list.replaceChildren(...rows.map(([key, value]) => {
            const row = document.createElement('div');
            row.className = 'perf-row';
            const label = document.createElement('span');
            label.className = 'perf-key';
            label.textContent = key;
            const cell = document.createElement('span');
            cell.className = 'perf-value';
            cell.textContent = blank(value);
            cell.title = cell.textContent;
            row.append(label, cell);
            return row;
          }));
          drawChart();
        },
      };
    },
  };
}
