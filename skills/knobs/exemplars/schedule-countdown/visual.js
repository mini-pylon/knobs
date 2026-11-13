// @ts-check
import { canvasVisual } from 'knobs';

const WINDOW = 180;

// Fixed seed, indexed by event. Replace this with the project's own seed and spawn rule.
// The fraction stays in [0, 1), and jitter stays below the shortest interval, so order holds.
/**
 * @param {number} index
 */
function unit(index) {
  let h = Math.imul(index + 1, 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 13), 0x45d9f3b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * @param {number} index
 * @param {number} interval
 * @param {number} jitter
 */
function eventTime(index, interval, jitter) {
  return index * interval + jitter * unit(index);
}

/**
 * @param {import('knobs').Store} store
 */
export default function visual(store) {
  return canvasVisual('Spawn times across the next three minutes', () => {
    return (pen, w, h, now) => {
      const interval = Math.max(0.001, Number(store.control('spawn.interval')));
      const jitter = Math.max(0, Number(store.control('spawn.jitter')));
      const burst = Math.max(1, Math.round(Number(store.control('spawn.burst'))));
      const t = now;
      const t1 = t + WINDOW;

      let nextIndex = Math.max(0, Math.floor(t / interval) - 2);
      let nextAt = eventTime(nextIndex, interval, jitter);
      for (let guard = 0; nextAt < t && guard < 10000; guard++) {
        nextIndex += 1;
        nextAt = eventTime(nextIndex, interval, jitter);
      }
      const remain = Math.max(0, Math.ceil(nextAt - t));

      const inset = 8;
      const axisY = Math.max(48, Math.round(h * 0.78));
      pen.ends(w, 0, 'next 3 min', `next in ${remain} s`);
      pen.line(inset, axisY, w - inset, axisY, pen.dim, 1);

      const xOf = (/** @type {number} */ time) => inset + ((time - t) / WINDOW) * (w - 2 * inset);
      const room = Math.max(8, axisY - 20);
      const pitch = Math.min(16, room / burst);
      const mark = Math.max(3, Math.min(8, pitch - 6));
      let index = Math.max(0, Math.floor((t - jitter) / interval) - 1);
      for (let guard = 0; guard < 10000; guard++) {
        const at = eventTime(index, interval, jitter);
        index += 1;
        if (at > t1) break;
        if (at < t) continue;
        const x = xOf(at);
        for (let b = 0; b < burst; b++) {
          const bottom = axisY - b * pitch;
          pen.line(x, bottom, x, bottom - mark, pen.fg, 2);
        }
      }
    };
  });
}
