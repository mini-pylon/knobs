// @ts-check
import { canvasVisual, pixels } from 'knobs';

const SLICE_W = 64;
const SLICE_H = 32;
const MID = 16;

/**
 * @param {number} x
 * @param {number} y
 */
function hash(x, y) {
  let n = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (((n ^ (n >>> 16)) >>> 0) / 4294967295) * 2 - 1;
}

// Stand-in density. Replace this with the project's own density function.
/**
 * @param {number} dist
 * @param {number} y
 * @param {number} radius
 * @param {number} softness
 * @param {number} noise
 */
function density(dist, y, radius, softness, noise) {
  const half = Math.max(softness, 0.0001) / 2;
  const t = Math.min(1, Math.max(0, (dist - (radius - half)) / (half * 2)));
  const step = t * t * (3 - 2 * t);
  return Math.min(1, Math.max(0, 1 - step + noise * hash(dist, y)));
}

/**
 * @param {string} color
 * @returns {[number, number, number]}
 */
function channels(color) {
  const hex = color.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
    const n = Number.parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgb = hex.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  return [216, 225, 232];
}

/**
 * @param {import('knobs').Store} store
 */
export default function visual(store) {
  return canvasVisual('A soft edge in a pixel slice beside its density profile', () => {
    const slice = pixels(SLICE_W, SLICE_H);
    return (pen, w, h, now) => {
      const radius = Number(store.control('edge.radius'));
      const softness = Number(store.control('edge.softness'));
      const noise = Number(store.control('edge.noise'));
      const [cr, cg, cb] = channels(pen.fg);
      const data = slice.image.data;
      for (let y = 0; y < SLICE_H; y++) {
        for (let x = 0; x < SLICE_W; x++) {
          const i = (y * SLICE_W + x) * 4;
          data[i] = cr;
          data[i + 1] = cg;
          data[i + 2] = cb;
          data[i + 3] = Math.round(density(x, y, radius, softness, noise) * 255);
        }
      }
      slice.ctx.putImageData(slice.image, 0, 0);

      const panels = pen.panels(w, [1, 1]);
      const inset = 6;
      const top = 8;
      const bottom = h - 18;
      const roomW = Math.min(panels[0].w, panels[1].w) - inset * 2;
      const roomH = Math.max(1, bottom - top);
      const scale = Math.max(1, Math.min(Math.floor(roomW / SLICE_W), Math.floor(roomH / SLICE_H)));
      const plotW = SLICE_W * scale;
      const sliceHpx = SLICE_H * scale;
      const xOf = (/** @type {number} */ dist) => inset + dist * scale;

      pen.within(panels[0], () => {
        const ctx = pen.ctx;
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(slice.canvas, inset, top, plotW, sliceHpx);
        ctx.restore();
        pen.box(inset, top, plotW, sliceHpx, pen.dim);
        pen.text('0', inset, h - 13);
        const end = '64 px';
        pen.text(end, inset + plotW - pen.width(end), h - 13);
      });

      pen.within(panels[1], () => {
        const yOf = (/** @type {number} */ value) => bottom - value * (bottom - top);
        const y5 = yOf(0.5);
        pen.line(xOf(0), y5, xOf(SLICE_W - 1), y5, pen.dim, 1, [4, 3]);
        const mark = '0.5';
        pen.text(mark, xOf(SLICE_W - 1) - pen.width(mark), Math.max(0, y5 - 12));
        /** @type {[number, number][]} */
        const points = [];
        for (let x = 0; x < SLICE_W; x++) points.push([xOf(x), yOf(density(x, MID, radius, softness, noise))]);
        pen.plot(points, pen.fg, 1.5);
        pen.text('0', inset, h - 13);
        const end = '64 px';
        pen.text(end, inset + plotW - pen.width(end), h - 13);
      });
    };
  });
}
