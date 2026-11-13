// @ts-check
import { canvasVisual } from 'knobs';

// 0° is up. Angles increase clockwise.
/**
 * @param {number} azimuth
 * @param {number} elevation
 */
function lightOffset(azimuth, elevation) {
  const az = (azimuth * Math.PI) / 180;
  const reach = 1 - Math.min(90, Math.max(0, elevation)) / 90;
  return { x: Math.sin(az) * reach, y: -Math.cos(az) * reach };
}

/**
 * @param {string} hex
 * @returns {[number, number, number]}
 */
function channels(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  if (!Number.isFinite(n)) return [216, 225, 232];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * @param {import('knobs').Store} store
 */
export default function visual(store) {
  return canvasVisual('A dial for a light and a ball lit from that direction', () => {
    return (pen, w, h, now) => {
      const azimuth = Number(store.control('light.azimuth'));
      const elevation = Number(store.control('light.elevation'));
      const intensity = Number(store.control('light.intensity'));
      const color = String(store.control('light.color'));
      const off = lightOffset(azimuth, elevation);
      const [r, g, b] = channels(color);
      const panels = pen.panels(w, [1, 1]);

      pen.within(panels[0], () => {
        const pw = panels[0].w;
        pen.text(`az ${Math.round(azimuth)}°  el ${Math.round(elevation)}°`, 0, 0);
        const top = 18;
        const side = 38;
        const below = 16;
        const cx = pw / 2;
        const cy = top + (h - top - below) / 2;
        const dialR = Math.max(16, Math.min(cx - side, pw - cx - side, cy - top - 14, h - below - cy - 2, 72));
        pen.line(cx - dialR, cy, cx + dialR, cy, pen.dim, 1);
        pen.line(cx, cy - dialR, cx, cy + dialR, pen.dim, 1);
        pen.ring(cx, cy, dialR, pen.fg, 1.25);
        pen.text('0°', cx - pen.width('0°') / 2, cy - dialR - 13);
        pen.text('90°', cx + dialR + 4, cy - 6);
        const south = '180°';
        pen.text(south, cx - pen.width(south) / 2, cy + dialR + 3);
        const west = '270°';
        pen.text(west, Math.max(0, cx - dialR - 4 - pen.width(west)), cy - 6);
        // Keep the dot and its ring inside the panel even at the rim.
        const dotR = 5;
        const dx = cx + off.x * (dialR - dotR);
        const dy = cy + off.y * (dialR - dotR);
        pen.dot(dx, dy, dotR, color);
        pen.ring(dx, dy, dotR + 2, pen.fg, 1.25);
      });

      pen.within(panels[1], () => {
        const pw = panels[1].w;
        const ballR = Math.max(18, Math.min(pw / 2 - 14, h / 2 - 10, 62));
        const cx = pw / 2;
        const cy = h / 2 + 4;
        const hx = cx + off.x * ballR * 0.92;
        const hy = cy + off.y * ballR * 0.92;
        const bright = Math.min(1, Math.max(0, intensity));
        const ctx = pen.ctx;
        // Stand-in ball. Replace this with the shape the project's light falls on.
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, ballR, 0, Math.PI * 2);
        ctx.clip();
        ctx.beginPath();
        ctx.arc(cx, cy, ballR, 0, Math.PI * 2);
        ctx.fillStyle = `rgb(${Math.round(r * 0.18)}, ${Math.round(g * 0.18)}, ${Math.round(b * 0.18)})`;
        ctx.fill();
        const glow = ctx.createRadialGradient(hx, hy, ballR * 0.02, hx, hy, ballR * 0.85);
        glow.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${0.55 + 0.45 * bright})`);
        glow.addColorStop(0.4, `rgba(${r}, ${g}, ${b}, ${0.15 + 0.35 * bright})`);
        glow.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
        ctx.fillStyle = glow;
        ctx.fillRect(cx - ballR, cy - ballR, ballR * 2, ballR * 2);
        ctx.beginPath();
        ctx.arc(hx, hy, Math.max(2.5, ballR * 0.1), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.45 + 0.5 * bright})`;
        ctx.fill();
        ctx.restore();
        pen.ring(cx, cy, ballR, pen.dim, 1);
      });
    };
  });
}
