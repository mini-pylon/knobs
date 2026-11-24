// Pictures on the right of the drawer's param tabs, in the perf page's style.
// Each is a function of the live values and the scene, drawn on a 2D canvas.
// The drawer mounts only the showing tab's picture and calls frame() about 15
// times a second while it shows; mount touches no scene state, since it can
// run before main.js has finished declaring it. Traces start when the tab
// opens. The formulas mirror the shader's; where one is only approximated (the
// ball's shading, the swatch's noise) that is said below.
import * as params from './params.js';
import { flockDelay } from './birds.js';

const TOP = 18; // each panel's plot starts below its title row
const TRACE = 30; // seconds a trace shows
const val = path => params.values[path];
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));

// Value noise, the shader's shape (not its exact values).
function hash(x, y, z) {
  let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1440662683);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
function noise(x, y, z) {
  const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z);
  const ease = t => t * t * (3 - 2 * t), u = ease(x - i), v = ease(y - j), w = ease(z - k);
  const mix = (a, b, t) => a + (b - a) * t;
  const face = c => mix(mix(hash(i, j, c), hash(i + 1, j, c), u), mix(hash(i, j + 1, c), hash(i + 1, j + 1, c), u), v);
  return mix(face(k), face(k + 1), w);
}
const fbm = (x, y, z) => noise(x, y, z) * .65 + noise(x * 2.04 + 5, y * 2.04 + 5, z * 2.04 + 5) * .25 + noise(x * 4.13, y * 4.13, z * 4.13) * .1;

function makePen(ctx, el) {
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

function canvasVisual(label, make) {
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
function pixels(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  return { canvas, ctx, image: ctx.createImageData(w, h) };
}

// The last 30 seconds of some values. A gap (the tab was hidden) breaks the line.
function trace() {
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
function fit(bounds, w, top, base) {
  const [left, right, bottom, up] = bounds;
  const k = Math.min(w / (right - left), (base - top) / (up - bottom));
  const ox = (w - (right - left) * k) / 2, oy = top + (base - top - (up - bottom) * k) / 2;
  return { k, x: v => ox + (v - left) * k, y: v => oy + (up - v) * k };
}

const burstOf = () => { const curve = val('dispersal.curve'); return t => Math.pow(Math.max(Math.sin(t * Math.PI), 0), curve); };

// The scroll track: each shape's hang as a block, the burst over each morph,
// the scroll as a line and the cloud as a dot. With snap (a range, or null),
// a bar marks each shape's snap zone and a tick its centre.
function drawTrack(p, s, strip, h, snap) {
  const burst = burstOf();
  const names = s.slots(), last = names.length - 1, m = s.morph(), raw = s.progress();
  // The cloud eases toward a shape and only approaches the whole number.
  const progress = Math.abs(raw - Math.round(raw)) < .004 ? Math.round(raw) : raw;
  const i = clamp(Math.floor(progress), 0, last), f = progress - i;
  const flatAt = n => n === 0 && s.skyFirst(); // the first morph off the sky has no burst
  p.within(strip, () => {
    const W = strip.w, len = s.trackLength(), X = v => v / len * W, base = h - 16, H = base - TOP;
    p.title(W, 'scroll track', snap === null ? 'line: scroll · dot: cloud' : 'line: scroll · dot: cloud · bar: snap');
    let right = -Infinity;
    names.forEach((name, n) => {
      const a = s.slotStart(n), b = a + s.hangAt(n);
      if (b > a) p.fill(X(a), TOP, X(b) - X(a), H);
      const tw = p.width(name), x = clamp(X((a + b) / 2) - tw / 2, 0, W - tw);
      if (x > right + 4) { p.text(name, x, base + 5); right = x + tw; }
      if (n < last) p.plot(Array.from({ length: 33 }, (_, q) => [X(b + q / 32 * m), base - (flatAt(n) ? 0 : burst(q / 32)) * H]), p.dim, 1.5);
      // The snap zone: a bar either side of the shape's centre, a tick at it.
      if (snap !== null) {
        const mid = (a + b) / 2;
        p.line(X(clamp(mid - snap, 0, len)), TOP + 3.5, X(clamp(mid + snap, 0, len)), TOP + 3.5, p.fg, 2);
        p.line(X(mid), TOP, X(mid), TOP + 8, p.fg, 1);
      }
    });
    p.line(0, base + .5, W, base + .5);
    const scroll = s.scroll(), xs = X(scroll);
    p.line(xs, TOP, xs, base, p.fg, 1);
    const start = s.slotStart(i), where = f > 0 ? start + s.hangAt(i) + f * m : clamp(scroll, start, start + s.hangAt(i));
    p.dot(X(where), f > 0 && !flatAt(i) ? base - burst(f) * H : base, 3.5);
  });
  return { i, f, flatAt };
}

function dispersal(s) {
  return canvasVisual('Scroll track with hang and morph segments, scroll and cloud markers, and the burst curve', () => (p, w, h) => {
    const [strip, side] = p.panels(w, [3, 1]);
    const curve = val('dispersal.curve'), burst = burstOf(), held = s.burstHeld();
    const { i, f, flatAt } = drawTrack(p, s, strip, h, null);
    p.within(side, () => {
      const W = side.w, base = h - 16, H = base - TOP;
      const now = held ? 1 : flatAt(i) ? 0 : burst(f);
      p.title(W, `burst ${now.toFixed(2)}`, `curve ${curve.toFixed(2)}`);
      p.line(0, base + .5, W, base + .5);
      p.plot(Array.from({ length: 49 }, (_, q) => [q / 48 * W, base - burst(q / 48) * H]));
      if (held) p.line(0, TOP + .5, W, TOP + .5, p.dim, 1, [3, 3]);
      else p.dot(f * W, base - burst(f) * H, 3.5);
      p.text(held ? 'held at 1 by preview' : 'one morph', 0, base + 5);
    });
  });
}

// The scroll tab: the track with each snap zone, and the snap's timing: the
// rest before it moves, then the glide's ease (main.js glideTo).
function scroll(s) {
  return canvasVisual('Scroll track with hang and morph segments and snap zones, and the snap rest and glide', () => (p, w, h) => {
    const [strip, side] = p.panels(w, [3, 1]);
    const snap = s.snap();
    drawTrack(p, s, strip, h, snap);
    p.within(side, () => {
      const W = side.w, base = h - 16, H = base - TOP;
      const rest = val('scroll.snapDelay'), glide = val('scroll.snapTime'), total = rest + glide;
      p.title(W, snap === null ? 'snap off' : `glide ${glide.toFixed(2)} s`, snap === null ? '' : `rest ${rest.toFixed(2)} s`);
      p.line(0, base + .5, W, base + .5);
      if (snap === null) return;
      const ease = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(2 - 2 * t, 3) / 2), X = sec => sec / total * W;
      p.plot([[0, base], ...Array.from({ length: 33 }, (_, q) => [X(rest + q / 32 * glide), base - ease(q / 32) * H])]);
      if (rest > 0) p.line(X(rest), TOP, X(rest), base, p.dim, 1, [3, 3]);
      p.text('rest, then glide', 0, base + 5);
    });
  });
}

// A slice of the cloud material at some amount of hover, 0 to 1: density()'s
// formulas, with hover's terms zero at rest. view is the slice's half height.
function materialSlice() {
  const SW = 88, SH = 60, img = pixels(SW, SH);
  let key = '';
  function render(p, time, hv, view) {
    const density = val('presence.density'), scale = val('presence.scale'), texture = val('presence.texture') * (1 + hv * val('hover.grain'));
    const soft = val('presence.softness') * (1 + hv * val('hover.soft')), puff = val('presence.puff') * (1 + hv * val('hover.puff'));
    const coarseLumps = val('presence.lumps'), amount = 1 + hv * val('hover.lumps'), swell = hv * val('hover.swell');
    const contrast = val('presence.contrast'), billow = val('presence.billow'), bt = time * billow;
    const next = [density, soft, puff, scale, texture, coarseLumps, amount, swell, contrast, billow, view, bt.toFixed(3), p.fg].join();
    if (next === key) return;
    key = next;
    const [r, g, b] = rgb(p.fg), data = img.image.data, radius = .78 * scale, reach = soft + (.105 + .065 * amount) * puff;
    for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
      const px = (x / (SW - 1) * 2 - 1) * view * SW / SH, py = (y / (SH - 1) * 2 - 1) * view, o = (y * SW + x) * 4;
      let d = Math.hypot(px, py) - radius - swell, a = 0;
      if (d <= reach) {
        const n = fbm(px * texture + bt * .09, py * texture + bt * .025, 0), coarse = noise(px * coarseLumps, py * coarseLumps + bt * .04, 3);
        d += ((n - .5) * .21 + (coarse - .5) * .13 * amount) * puff;
        const den = (1 - smooth(-soft, soft, d)) * (1 - .5 * contrast + n * contrast);
        a = 1 - Math.exp(-den * density * .16);
      }
      data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = a * 255;
    }
    img.ctx.putImageData(img.image, 0, 0);
  }
  return {
    draw(p, panel, h, time, hv = 0, view = .95) {
      render(p, time, hv, view);
      const H = h - TOP, dw = Math.min(panel.w, H * SW / SH), dh = dw * SH / SW;
      p.ctx.imageSmoothingEnabled = true;
      p.ctx.drawImage(img.canvas, (panel.w - dw) / 2, TOP + (H - dh) / 2, dw, dh);
    },
  };
}
const billowLabel = () => (val('presence.billow') > 0 ? `billow ${val('presence.billow').toFixed(2)}` : 'frozen');

function presence(s) {
  return canvasVisual('A slice of the cloud material, and the density profile across its edge', () => {
    const slice = materialSlice();
    return (p, w, h) => {
      const [swatch, edge] = p.panels(w, [1, 1.2]);
      p.within(swatch, () => {
        p.title(swatch.w, 'material', billowLabel());
        slice.draw(p, swatch, h, s.time());
      });
      p.within(edge, () => {
        const W = edge.w, base = h - 16, H = base - TOP;
        const soft = val('presence.softness'), puff = val('presence.puff'), contrast = val('presence.contrast'), wobble = .17 * puff;
        const span = .6, X = d => (d + span) / (2 * span) * W, Y = v => base - v / 1.75 * H;
        const profile = (d, k = 1) => (1 - smooth(-soft, soft, d)) * k;
        const at = (fn) => Array.from({ length: 61 }, (_, q) => { const d = -span + q / 60 * 2 * span; return [X(d), Y(fn(d))]; });
        p.title(W, 'edge', `soft ±${soft.toFixed(2)} · bumps ±${wobble.toFixed(2)}`);
        const hi = at(d => profile(d, 1 + .5 * contrast)), lo = at(d => profile(d, 1 - .5 * contrast)).reverse();
        p.ctx.fillStyle = p.rule; p.ctx.beginPath();
        [...hi, ...lo].forEach(([x, y], q) => (q ? p.ctx.lineTo(x, y) : p.ctx.moveTo(x, y)));
        p.ctx.fill();
        p.plot(at(d => profile(d + wobble)), p.dim, 1, [3, 3]);
        p.plot(at(d => profile(d - wobble)), p.dim, 1, [3, 3]);
        p.plot(at(d => profile(d)));
        p.line(X(0), TOP, X(0), base);
        p.line(0, base + .5, W, base + .5);
        p.ends(W, base + 5, 'inside', 'outside');
      });
    };
  });
}

function sunlight(s) {
  return canvasVisual('A sky dome with the sun, a ball lit by it, and the sun beams on screen', () => {
    const BS = 72, ball = pixels(BS, BS), RW = 120, RH = 66, rays = pixels(RW, RH);
    let key = '', raysKey = '';
    // As the texture pass: each pixel looks toward the sun for beamLength
    // screens, and is in shadow if the shape is in the way. Stronger than on
    // screen, so it reads at this size.
    function renderBeams(dx, dy, amount, length, streaks, clock) {
      const next = [dx, dy, amount, length, streaks, clock.toFixed(1)].join();
      if (next === raysKey) return;
      raysKey = next;
      const data = rays.image.data, R = .2;
      for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) {
        const u = (x + .5 - RW / 2) / RH, v = (RH / 2 - y - .5) / RH, o = (y * RW + x) * 4;
        const along = u * dx + v * dy, across = u * -dy + v * dx;
        const pattern = noise(across * 16 + 40, clock * .05, 1);
        const streak = 1 + (smooth(.3, .85, pattern) * 1.6 - 1) * streaks;
        const blocked = along < 0 && -along < length + R ? 1 - smooth(R * .8, R * 1.1, Math.abs(across)) : 0;
        const glow = clamp(amount * .45 * streak * (1 - blocked), 0, 1);
        data[o] = 255; data[o + 1] = 209; data[o + 2] = 148; data[o + 3] = glow * 255;
      }
      rays.ctx.putImageData(rays.image, 0, 0);
    }
    // Not the raymarch: the same light mix, with the optical depth taken as
    // the chord through a sphere toward the sun.
    function render() {
      const az = val('sunlight.sunAzimuth') * Math.PI / 180, el = val('sunlight.sunElevation') * Math.PI / 180;
      const light = val('sunlight.light'), shade = val('sunlight.shade'), absorb = val('sunlight.absorption');
      const next = [az, el, light, shade, absorb].join();
      if (next === key) return;
      key = next;
      const sun = [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)], data = ball.image.data;
      const lit = [1, .7, .42], dark = [.44, .46, .55];
      for (let y = 0; y < BS; y++) for (let x = 0; x < BS; x++) {
        const u = (x + .5) / BS * 2 - 1, v = 1 - (y + .5) / BS * 2, rr = u * u + v * v, o = (y * BS + x) * 4;
        if (rr > 1) { data[o + 3] = 0; continue; }
        const z = Math.sqrt(1 - rr), P = [u * .92, v * .92, z * .92];
        const dotPS = P[0] * sun[0] + P[1] * sun[1] + P[2] * sun[2];
        const chord = -dotPS + Math.sqrt(Math.max(0, dotPS * dotPS - (.92 * .92 - 1)));
        const direct = Math.exp(-chord * absorb * .35);
        for (let c = 0; c < 3; c++) data[o + c] = clamp(dark[c] * shade + (lit[c] * light - dark[c] * shade) * direct, 0, 1) * 255;
        data[o + 3] = clamp((1 - Math.sqrt(rr)) * BS / 2, 0, 1) * 255;
      }
      ball.ctx.putImageData(ball.image, 0, 0);
    }
    return (p, w, h, now) => {
      const [dome, lit, shaft] = p.panels(w, [1, 1, 1.5]);
      const el = val('sunlight.sunElevation'), azDeg = val('sunlight.sunAzimuth'), az = azDeg * Math.PI / 180;
      p.within(dome, () => {
        p.title(dome.w, 'dome', `el ${el} az ${azDeg}`);
        const cx = dome.w / 2, cy = TOP + (h - TOP) / 2, R = Math.min(dome.w, h - TOP) / 2 - 5, r = e => (90 - e) / 100 * R;
        for (const e of [60, 30]) p.ring(cx, cy, r(e));
        p.ring(cx, cy, r(0), p.dim);
        const sx = cx + Math.sin(az) * r(el), sy = cy + Math.cos(az) * r(el); // toward the camera is down
        p.line(cx, cy, sx, sy, p.dim);
        p.dot(cx, cy, 2, p.dim);
        p.dot(sx, sy, 4.5);
        const cam = 'cam'; p.text(cam, cx - p.width(cam) / 2, h - 11);
      });
      render();
      p.within(lit, () => {
        p.title(lit.w, 'ball', `absorb ${val('sunlight.absorption').toFixed(1)}`);
        const H = h - TOP, d = Math.min(lit.w, H) - 8;
        p.ctx.imageSmoothingEnabled = true;
        p.ctx.drawImage(ball.canvas, (lit.w - d) / 2, TOP + (H - d) / 2, d, d);
      });
      p.within(shaft, () => {
        const W = shaft.w, H = h - TOP, amount = val('sunlight.beams'), length = val('sunlight.beamLength'), streaks = val('sunlight.beamStreaks');
        p.title(W, 'beams', `${amount.toFixed(2)} · ${length.toFixed(2)} screens`);
        // The screen direction, as cloud-morph's setBeams has it.
        const e = el * Math.PI / 180;
        let dx = Math.cos(e) * Math.sin(az), dy = Math.sin(e), n = Math.hypot(dx, dy);
        if (n < .05) { dx = -Math.SQRT1_2; dy = Math.SQRT1_2; } else { dx /= n; dy /= n; }
        renderBeams(dx, dy, amount, length, streaks, s.time());
        const dh = Math.min(H, W * RH / RW), dw = dh * RW / RH, ox = (W - dw) / 2, oy = TOP + (H - dh) / 2;
        p.ctx.imageSmoothingEnabled = true;
        p.ctx.drawImage(rays.canvas, ox, oy, dw, dh);
        p.dot(ox + dw / 2, oy + dh / 2, dh * .2, p.dim);
        p.box(ox, oy, dw - 1, dh - 1);
      });
    };
  });
}

function birds(s) {
  return canvasVisual('A top-down radar of the flocks, five minutes of spawns, and the time until the next flock', () => {
    // Fixed draws, so the sampled strip stretches with the slider, not at random.
    const draws = Array.from({ length: 160 }, (_, i) => hash(i, 11, 7));
    return (p, w, h, now) => {
      const [radar, side] = p.panels(w, [1.2, 1.8]);
      const on = s.birdsOn(), snap = s.flocks.snapshot();
      p.within(radar, () => {
        const W = radar.w, D = 8, zFar = -14, base = h - 2, half = snap.halfWidth ?? 6;
        const k = Math.min((base - TOP) / (D - zFar), W / (2 * half * (D - zFar) / D));
        const X = x => W / 2 + x * k, Z = z => base - (D - z) * k;
        p.title(W, 'radar', 'dot: song · square: geese');
        const xFar = half * (D - zFar) / D;
        p.plot([[X(-xFar), Z(zFar)], [X(0), Z(D)], [X(xFar), Z(zFar)]], p.dim, 1);
        p.line(X(-half), Z(0), X(half), Z(0), p.dim);
        p.text('shapes', X(half) + 5, Z(0) - 6);
        for (const b of snap.birds) {
          if (b.geese) p.fill(X(b.x) - 1.5, Z(b.z) - 1.5, 3, 3, p.fg);
          else p.dot(X(b.x), Z(b.z), 1.5);
        }
      });
      p.within(side, () => {
        const W = side.w, often = val('birds.often'), clock = performance.now() / 1000;
        p.title(W, on ? `next flock in ${snap.until.toFixed(1)} s` : 'birds off', `${snap.birds.length} birds`);
        const strip = (top, label, ticks, stroke) => {
          p.text(label, 0, top);
          const y0 = top + 15, y1 = Math.min(y0 + 22, h - 2);
          p.fill(0, y0, W, y1 - y0);
          for (const t of ticks) { const x = Math.round(t / 300 * W) + .5; p.line(x, y0, x, y1, stroke, 1); }
        };
        const past = snap.spawned.map(t => 300 - (clock - t / 1000));
        const ahead = [];
        for (let t = 0, i = 0; i < draws.length; i++) { t += flockDelay(draws[i], often); if (t > 300) break; ahead.push(t); }
        const room = Math.max(40, (h - TOP) / 2);
        strip(TOP + 4, 'last 5 min', past, p.fg);
        strip(TOP + 4 + room, `5 min at ${often.toFixed(1)}/min (a sample)`, ahead, p.dim);
      });
    };
  });
}

function dive(s) {
  return canvasVisual('The dive over time, its fray, erosion and wear by progress, and a live trace', () => {
    const history = trace();
    return (p, w, h, now) => {
      const [line, curves, live] = p.panels(w, [1.05, 1.3, 1]);
      const din = val('dive.in'), out = val('dive.out'), fadeAt = val('dive.fadeAt'), hold = val('dive.hold');
      const state = s.dive(), base = h - 16, H = base - TOP;
      history.add(now, state.value);
      p.within(line, () => {
        const W = line.w, T = din + out, X = t => t / T * W, Y = v => base - v * H;
        p.title(W, 'timeline', `fade ${fadeAt.toFixed(2)}`);
        p.line(0, base + .5, W, base + .5);
        p.line(X(din), TOP, X(din), base);
        p.line(0, Y(hold), W, Y(hold), p.dim, 1, [3, 3]);
        for (const t of [din * fadeAt, din + out * (1 - fadeAt)]) p.line(X(t), Y(fadeAt), X(t), base, p.dim);
        p.plot([[0, base], [X(din), TOP], [W, base]]);
        p.dot(state.falling ? X(din + out * (1 - state.value)) : X(din * state.value), Y(state.value), 3.5);
        p.ends(W, base + 5, `in ${din.toFixed(2)} s`, `out ${out.toFixed(2)} s`);
      });
      p.within(curves, () => {
        const W = curves.w, fray = val('dive.fray'), erode = val('dive.erode'), wear = val('dive.wear');
        const spread = d => d * d * (3 - 2 * d), frayAt = d => smooth(0, .45, d);
        const series = [
          { label: 'fray', fn: d => frayAt(d) * fray },
          { label: 'erode', fn: d => frayAt(d) * erode, dash: [4, 3] },
          { label: 'wear', fn: d => spread(d) ** 3 * wear, dash: [1.5, 2.5] },
          { label: 'fade', fn: d => 1 - smooth(Math.min(fadeAt, .98), 1, d), stroke: p.dim },
        ];
        const top = Math.max(1, fray, erode, wear), Y = v => base - v / top * H;
        p.title(W, 'by progress', `0–${top.toFixed(1)}`);
        p.line(0, base + .5, W, base + .5);
        for (const { fn, stroke, dash } of series) p.plot(Array.from({ length: 41 }, (_, q) => [q / 40 * W, Y(fn(q / 40))]), stroke, 1.5, dash);
        p.line(state.value * W, TOP, state.value * W, base, p.fg, 1);
        p.legend(0, base + 4, series, W);
      });
      p.within(live, () => {
        const W = live.w;
        p.title(W, `now ${state.value.toFixed(2)}`, state.held ? 'held' : '30 s');
        p.line(0, base + .5, W, base + .5);
        p.line(0, TOP + .5, W, TOP + .5);
        history.draw(p, now, W, TOP, base, 0, p.fg, 1.5);
        p.text('from when this tab opened', 0, base + 5);
      });
    };
  });
}

function hover(s) {
  return canvasVisual('The cloud material at rest, and the same material fully hovered', () => {
    const rest = materialSlice(), full = materialSlice();
    return (p, w, h) => {
      const [before, after] = p.panels(w, [1, 1]), time = s.time();
      // One view for both, wide enough for the swollen edge, so they compare.
      const edge = .78 * val('presence.scale') + val('hover.swell') + val('presence.softness') * (1 + val('hover.soft'));
      const view = Math.max(.95, edge * 1.03);
      p.within(before, () => {
        p.title(before.w, 'material', billowLabel());
        rest.draw(p, before, h, time, 0, view);
      });
      p.within(after, () => {
        p.title(after.w, 'fully hovered', `in ${val('hover.in').toFixed(2)} s`);
        full.draw(p, after, h, time, 1, view);
      });
    };
  });
}

function opening(s) {
  return canvasVisual('The sky clouds from the front and from above, the block and fog trail, and the planet', () => (p, w, h) => {
    const [front, top, trailPanel, planet] = p.panels(w, [1.25, 1.25, 1, 1]);
    const name = s.opening(), isSky = name === 'sky' || name === 'sky-full', { skyCloud, skyMeta } = s.sky(), base = h - 2;
    const count = skyCloud.length / 4, frame = s.frame(val('presence.scale'));
    const clouds = Array.from({ length: count }, (_, i) => ({ x: skyCloud[i * 4], y: skyCloud[i * 4 + 1], z: skyCloud[i * 4 + 2], r: skyCloud[i * 4 + 3], aspect: skyMeta[i * 4] }));
    const stroke = c => (isSky && c.z >= -1 ? p.fg : p.dim);
    const ellipse = (x, y, rx, ry, color) => { p.ctx.strokeStyle = color; p.ctx.lineWidth = 1; p.ctx.beginPath(); p.ctx.ellipse(x, y, Math.max(rx, .5), Math.max(ry, .5), 0, 0, 6.2832); p.ctx.stroke(); };
    p.within(front, () => {
      const bounds = [frame.left, frame.right, frame.bottom, frame.top], f = fit(bounds, front.w, TOP, base);
      p.title(front.w, 'front', name === 'sky-full' ? 'sky-full' : 'sky');
      p.box(f.x(frame.left), f.y(frame.top), (frame.right - frame.left) * f.k - 1, (frame.top - frame.bottom) * f.k - 1);
      for (const c of clouds) ellipse(f.x(c.x), f.y(c.y), c.r * c.aspect * .95 * f.k, c.r * .5 * f.k, stroke(c));
    });
    p.within(top, () => {
      const bounds = [frame.left, frame.right, -2.2, 2.2], f = fit(bounds, top.w, TOP, base);
      p.title(top.w, 'top', 'depth');
      p.box(f.x(frame.left), f.y(2.2), (frame.right - frame.left) * f.k - 1, 4.4 * f.k - 1);
      p.line(f.x(frame.left), f.y(0), f.x(frame.right), f.y(0));
      for (const c of clouds) ellipse(f.x(c.x), f.y(-c.z), c.r * c.aspect * .95 * f.k, c.r * .8 * f.k, stroke(c));
    });
    p.within(trailPanel, () => {
      const world = s.frame(1), f = fit([world.left, world.right, world.bottom, world.top], trailPanel.w, TOP, base);
      const heal = Math.max(val(name === 'fog' ? 'opening.fogHeal' : 'opening.carveHeal'), .1);
      p.title(trailPanel.w, 'trail', `heal ${heal.toFixed(1)} s`);
      p.box(f.x(world.left), f.y(world.top), (world.right - world.left) * f.k - 1, (world.top - world.bottom) * f.k - 1);
      const scale = val('presence.scale'), size = val('opening.blockSize');
      if (name === 'block') p.box(f.x(-2.3 * size * scale), f.y(1.85 * size * scale), 4.6 * size * scale * f.k, 3.7 * size * scale * f.k, p.dim);
      if (name === 'fog') p.fill(f.x(world.left), f.y(world.top), (world.right - world.left) * f.k, (world.top - world.bottom) * f.k);
      const wipe = s.trail(), time = s.time(), brush = val('opening.brush') * f.k;
      for (let i = 0; i < wipe.length; i += 4) {
        if (wipe[i + 3] <= 0) continue;
        const left = wipe[i + 3] * (1 - smooth(0, heal, time - wipe[i + 2]));
        if (left <= .01) continue;
        p.ctx.globalAlpha = left; p.dot(f.x(wipe[i]), f.y(wipe[i + 1]), brush, p.dim); p.ctx.globalAlpha = 1;
      }
    });
    p.within(planet, () => {
      const W = planet.w, on = name === 'planet', ink = on ? p.fg : p.dim, cx = W / 2, cy = TOP + (base - TOP) / 2;
      const size = val('opening.planetSize'), tilt = val('opening.tilt') * Math.PI / 180, bands = val('opening.bands'), count = val('opening.bandCount');
      const k = Math.min(W, base - TOP) / 2 / 2.7, R = size * k;
      p.title(W, 'planet', `tilt ${val('opening.tilt')}`);
      p.ring(cx, cy, R, ink, 1.5);
      // The axis in view: rotate(tilt) takes it to +y, so it leans left at +tilt.
      const ax = -Math.sin(tilt), ay = -Math.cos(tilt); // canvas y runs down
      p.line(cx - ax * R * 1.25, cy - ay * R * 1.25, cx + ax * R * 1.25, cy + ay * R * 1.25, p.dim);
      p.ctx.globalAlpha = clamp(.25 + bands * .4, 0, 1);
      for (let n = -Math.floor(count / 2); n <= Math.floor(count / 2); n++) {
        const lat = 2 * n / count;
        if (Math.abs(lat) >= 1) continue;
        const half = R * Math.sqrt(1 - lat * lat);
        p.ctx.strokeStyle = ink; p.ctx.lineWidth = 1; p.ctx.beginPath();
        p.ctx.ellipse(cx + ax * lat * R, cy + ay * lat * R, half, half * .2, -tilt, 0, Math.PI);
        p.ctx.stroke();
      }
      p.ctx.globalAlpha = 1;
      const a = s.time() * val('opening.spin') * .10472, facing = Math.cos(a) > 0;
      const mx = Math.sin(a) * R, my = Math.cos(a) * R * .2;
      p.dot(cx + mx * Math.cos(tilt) + my * Math.sin(tilt), cy - mx * Math.sin(tilt) + my * Math.cos(tilt), 3, facing ? ink : p.rule);
    });
  });
}

// Each group's picture, keyed by group name; scene is main.js's read-only view
// of the page.
export function paramVisuals(scene) {
  return { dispersal: dispersal(scene), scroll: scroll(scene), presence: presence(scene), sunlight: sunlight(scene), birds: birds(scene), dive: dive(scene), hover: hover(scene), opening: opening(scene) };
}
