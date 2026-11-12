// Generic drawing helpers from the frozen viz.js. Wings-vdb's own pictures stay behind.

const TRACE = 30; // seconds a trace shows

export function makePen(ctx, el) {
  const style = getComputedStyle(el);
  const color = name => style.getPropertyValue(name).trim();
  const pen = {
    ctx, fg: color('--term-fg'), dim: color('--term-dim'), rule: color('--term-line'), bg: color('--term-bg'),
    font: `11px ${style.fontFamily}`,
    width: text => ctx.measureText(text).width,
    text(text, x, y) { ctx.fillStyle = pen.fg; ctx.fillText(text, x, y); },
    line(x0, y0, x1, y1, stroke = pen.rule, width = 1, dash = []) {
      ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.setLineDash(dash);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.setLineDash([]);
    },
    plot(points, stroke = pen.fg, width = 1.5, dash = []) {
      ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.setLineDash(dash); ctx.beginPath();
      points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke(); ctx.setLineDash([]);
    },
    dot(x, y, r = 3, fill = pen.fg) { ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill(); },
    ring(x, y, r, stroke = pen.rule, width = 1) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.stroke(); },
    box(x, y, w, h, stroke = pen.rule) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.strokeRect(Math.round(x) + .5, Math.round(y) + .5, Math.round(w), Math.round(h)); },
    fill(x, y, w, h, fill = pen.rule) { ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); },
    // Side-by-side panels, as widths in proportion to weights.
    panels(total, weights, gap = 16) {
      const unit = (total - gap * (weights.length - 1)) / weights.reduce((a, b) => a + b);
      let x = 0;
      return weights.map(weight => { const panel = { x, w: unit * weight }; x += panel.w + gap; return panel; });
    },
    within(panel, draw) {
      ctx.save(); ctx.translate(panel.x, 0);
      ctx.beginPath(); ctx.rect(0, 0, panel.w, 1e4); ctx.clip();
      draw(); ctx.restore();
    },
    // Text at both ends of a row; the right end gives way when there is no room.
    ends(w, y, left, right) {
      pen.text(left, 0, y);
      if (right && pen.width(left) + pen.width(right) + 8 <= w) pen.text(right, w - pen.width(right), y);
    },
    title(w, left, right) { pen.ends(w, 0, left, right); },
    // Line samples and names along one row, so dashes say which curve is which.
    legend(x, y, items, w) {
      for (const { label, stroke = pen.fg, dash = [] } of items) {
        if (x + 13 + pen.width(label) > w) break;
        pen.plot([[x, y + 6], [x + 10, y + 6]], stroke, 1.5, dash);
        pen.text(label, x + 13, y);
        x += 13 + pen.width(label) + 8;
      }
    },
  };
  return pen;
}

export function canvasVisual(label, make) {
  return el => {
    const canvas = document.createElement('canvas');
    canvas.className = 'viz-chart';
    canvas.setAttribute('aria-label', label);
    el.append(canvas);
    const draw = make();
    let pen;
    return {
      frame(now) {
        const ratio = devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.clientHeight;
        if (!w || !h) return;
        if (canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) { canvas.width = Math.round(w * ratio); canvas.height = Math.round(h * ratio); }
        const ctx = canvas.getContext('2d');
        pen ??= makePen(ctx, el);
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.clearRect(0, 0, w, h);
        ctx.font = pen.font; ctx.textBaseline = 'top';
        draw(pen, w, h, now);
      },
    };
  };
}

// A small offscreen image for per-pixel drawings.
export function pixels(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  return { canvas, ctx, image: ctx.createImageData(w, h) };
}

// The last 30 seconds of some values. A gap (the tab was hidden) breaks the line.
export function trace() {
  const samples = [];
  return {
    add(now, ...values) {
      if (samples.length && now - samples[samples.length - 1].t < .1) return;
      samples.push({ t: now, values });
      while (samples.length && now - samples[0].t > TRACE) samples.shift();
    },
    draw(p, now, w, top, base, index, stroke, width, dash) {
      let run = [], last = null;
      const flush = () => { if (run.length > 1) p.plot(run, stroke, width, dash); run = []; };
      for (const s of samples) {
        if (last !== null && s.t - last > 1) flush();
        run.push([w - (now - s.t) / TRACE * w, base - s.values[index] * (base - top)]);
        last = s.t;
      }
      flush();
    },
  };
}

// A map of a world-unit rectangle fitted into a panel, y up.
export function fit(bounds, w, top, base) {
  const [left, right, bottom, up] = bounds;
  const k = Math.min(w / (right - left), (base - top) / (up - bottom));
  const ox = (w - (right - left) * k) / 2, oy = top + (base - top - (up - bottom) * k) / 2;
  return { k, x: v => ox + (v - left) * k, y: v => oy + (up - v) * k };
}
