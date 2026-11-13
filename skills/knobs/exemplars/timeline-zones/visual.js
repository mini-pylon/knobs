// @ts-check
import { canvasVisual } from 'knobs';

/**
 * @param {import('knobs').Store} store
 */
export default function visual(store) {
  return canvasVisual('Scroll sections with snap zones and a moving marker', () => {
    return (pen, w, h, now) => {
      const sections = Math.max(1, Math.round(Number(store.control('scroll.sections'))));
      const snap = Number(store.control('scroll.snap')) === 1;
      const snapWidth = Number(store.control('scroll.snapWidth'));
      const glide = Number(store.control('scroll.glide'));

      // Stand-in scroll position. Replace this with the page's own scroll progress.
      // Position is in section units, from 0 to the section count, so a resize redraws it.
      const rest = 400;
      const glideMs = Math.max(0, glide);
      const leg = glideMs + rest;
      const cycle = sections * leg;
      const elapsed = cycle > 0 ? ((now * 1000) % cycle + cycle) % cycle : 0;
      const index = leg > 0 ? Math.min(sections - 1, Math.floor(elapsed / leg)) : 0;
      const into = elapsed - index * leg;
      const from = index === 0 ? 0 : index - 0.5;
      const to = index + 0.5;
      const u = glideMs === 0 ? 1 : Math.min(1, into / glideMs);
      const eased = 1 - (1 - u) ** 3;
      const position = from + (to - from) * eased;

      const markerR = 6;
      const inset = markerR + 2;
      const trackH = Math.min(48, Math.max(28, h - 52));
      const trackTop = Math.max(16, Math.round((h - trackH) / 2) - 4);
      const xOf = (/** @type {number} */ pos) => inset + (pos / sections) * (w - 2 * inset);
      const sectionW = xOf(1) - xOf(0);
      const gap = Math.min(4, sectionW * 0.08);

      for (let i = 0; i < sections; i++) {
        const x0 = xOf(i) + gap / 2;
        pen.ctx.save();
        pen.ctx.globalAlpha = 0.5;
        pen.fill(x0, trackTop, sectionW - gap, trackH, pen.dim);
        pen.ctx.restore();
      }

      if (snap) {
        const blockW = sectionW - gap;
        const bandH = Math.max(6, trackH * 0.36);
        const bandY = trackTop + (trackH - bandH) / 2;
        pen.ctx.save();
        pen.ctx.globalAlpha = 0.85;
        for (let i = 0; i < sections; i++) {
          const zoneW = snapWidth * blockW;
          const x0 = xOf(i + 0.5) - zoneW / 2;
          pen.fill(x0, bandY, zoneW, bandH, pen.fg);
        }
        pen.ctx.restore();
      }

      for (let i = 0; i < sections; i++) {
        const x = xOf(i + 0.5);
        pen.line(x, trackTop - 8, x, trackTop - 2, pen.fg, 1.5);
      }

      const mx = xOf(Math.min(sections, Math.max(0, position)));
      const my = trackTop + trackH / 2;
      pen.ring(mx, my, markerR, pen.fg, 1.5);
      pen.dot(mx, my, 3, pen.fg);

      const labelY = Math.min(h - 12, trackTop + trackH + 8);
      pen.text('0', Math.max(0, xOf(0) - pen.width('0') / 2), labelY);
      const end = String(sections);
      pen.text(end, Math.min(w - pen.width(end), xOf(sections) - pen.width(end) / 2), labelY);
    };
  });
}
