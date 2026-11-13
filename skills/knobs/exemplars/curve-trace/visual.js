// @ts-check
import { canvasVisual } from 'knobs';

// Stand-in easing. Replace this with the function the page animates with.
/**
 * @param {string} kind
 * @param {number} t
 * @param {number} overshoot
 */
function easeProgress(kind, t, overshoot) {
  const u = Math.min(1, Math.max(0, t));
  if (kind === 'linear') return u;
  if (kind === 'ease-out') return 1 - (1 - u) ** 3;
  const peakAt = 0.62;
  const peak = 1 + overshoot;
  if (u <= peakAt) return peak * (1 - (1 - u / peakAt) ** 3);
  const settle = (u - peakAt) / (1 - peakAt);
  return peak + (1 - peak) * (1 - (1 - settle) ** 2);
}

/**
 * @param {import('knobs').Store} store
 */
export default function visual(store) {
  return canvasVisual('Progress over time, with a dot running along the curve', () => {
    // The dot's last few positions as [time, progress], so they redraw at any width.
    /** @type {[number, number][]} */
    const trail = [];
    return (pen, w, h, now) => {
      const duration = Number(store.control('motion.duration'));
      const delay = Number(store.control('motion.delay'));
      const overshoot = Number(store.control('motion.overshoot'));
      const ease = String(store.control('motion.ease'));
      const rest = 400;
      const loop = delay + duration + rest;
      const elapsed = ((now * 1000) % loop + loop) % loop;

      let unit = 1;
      if (elapsed < delay) unit = 0;
      else if (elapsed < delay + duration) unit = (elapsed - delay) / duration;
      const progress = unit === 0 ? 0 : easeProgress(ease, unit, overshoot);

      const plotTop = 8;
      const plotBottom = h - 20;
      const yMax = 1.6;
      // Inset so the marker's ring is not cut off at either end of the loop.
      const inset = 8;
      const xOf = (/** @type {number} */ t) => inset + t * (w - 2 * inset);
      const yOf = (/** @type {number} */ value) => plotBottom - (value / yMax) * (plotBottom - plotTop);

      const y1 = yOf(1);
      pen.line(0, y1, w, y1, pen.dim, 1, [4, 3]);
      pen.text('1.0', 0, Math.max(0, y1 - 12));

      /** @type {[number, number][]} */
      const points = [];
      for (let i = 0; i <= 80; i++) {
        const t = i / 80;
        points.push([xOf(t), yOf(easeProgress(ease, t, overshoot))]);
      }
      pen.plot(points, pen.fg, 1.5);

      const x = xOf(unit);
      const y = yOf(progress);
      // A new loop starts the trail again, so no dots stay behind at the far end.
      const last = trail[trail.length - 1];
      if (last && unit < last[0]) trail.length = 0;
      trail.push([unit, progress]);
      while (trail.length > 8) trail.shift();
      for (let i = 0; i < trail.length - 1; i++) {
        const point = trail[i];
        const fade = (i + 1) / trail.length;
        pen.ctx.save();
        pen.ctx.globalAlpha = fade;
        pen.dot(xOf(point[0]), yOf(point[1]), 2, pen.dim);
        pen.ctx.restore();
      }
      pen.ring(x, y, 6, pen.fg, 1.5);
      pen.dot(x, y, 3.5, pen.fg);
      pen.ends(w, h - 13, '0 ms', `${Math.round(duration)} ms`);
    };
  });
}
