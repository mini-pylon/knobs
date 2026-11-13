// @ts-check
import { canvasVisual } from 'knobs';

// The view is sized for the largest lift, scale and shadow, so a change of
// any of them moves only the hover card.
const CARD_W = 112;
const CARD_H = 64;
const LIFT_MAX = 16;
const SCALE_MAX = 1.2;
// The shadow control's maximum blur, kept clear on both sides of the hover card.
const SHADOW_MAX = 40;

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
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {number} r
 */
function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/**
 * Stand-in card. Replace this shape with the project's component.
 * @param {import('knobs').Pen} pen
 * @param {number} cx
 * @param {number} baseY
 * @param {number} k
 * @param {number} scale
 * @param {number} lift
 * @param {number} shadow
 * @param {string} tint
 * @param {boolean} hovered
 */
function drawCard(pen, cx, baseY, k, scale, lift, shadow, tint, hovered) {
  const s = hovered ? scale : 1;
  const up = (hovered ? lift : 0) * k;
  const cw = CARD_W * k * s;
  const ch = CARD_H * k * s;
  const x = cx - cw / 2;
  const y = baseY - up - ch;
  const ctx = pen.ctx;
  ctx.save();
  if (hovered && shadow > 0) {
    const [r, g, b] = channels(tint);
    ctx.shadowColor = `rgba(${r}, ${g}, ${b}, 0.55)`;
    ctx.shadowBlur = shadow * k;
    ctx.shadowOffsetY = Math.max(1, 2 * k);
  }
  roundRect(ctx, x, y, cw, ch, 8 * k * s);
  if (hovered) ctx.fillStyle = tint;
  else {
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = pen.dim;
  }
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.globalAlpha = hovered ? 0.4 : 0.85;
  ctx.fillStyle = hovered ? '#13191f' : pen.fg;
  const barH = Math.max(3, 6 * k * s);
  const gap = Math.max(3, 5 * k * s);
  const barX = x + cw * 0.16;
  const barW = cw * 0.62;
  const barY = y + ch * 0.3;
  ctx.fillRect(barX, barY, barW, barH);
  ctx.fillRect(barX, barY + barH + gap, barW * 0.7, barH);
  ctx.restore();
}

/**
 * @param {import('knobs').Store} store
 */
export default function visual(store) {
  return canvasVisual('The same card at rest and fully hovered', () => {
    return (pen, w, h, now) => {
      const lift = Number(store.control('hover.lift'));
      const scale = Number(store.control('hover.scale'));
      const shadow = Number(store.control('hover.shadow'));
      const tint = String(store.control('hover.tint'));

      const panels = pen.panels(w, [1, 1]);
      const baseY = h - 26;
      const plotH = Math.max(1, baseY - 18);
      const roomW = Math.min(panels[0].w, panels[1].w) - 24;
      const k = Math.min(1, roomW / (CARD_W * SCALE_MAX + 2 * SHADOW_MAX), plotH / (LIFT_MAX + CARD_H * SCALE_MAX));

      pen.line(8, baseY, w - 8, baseY, pen.dim, 1);
      pen.within(panels[0], () => {
        pen.text('rest', 0, 0);
        drawCard(pen, panels[0].w / 2, baseY, k, scale, lift, shadow, tint, false);
      });
      pen.within(panels[1], () => {
        pen.text('hover', 0, 0);
        drawCard(pen, panels[1].w / 2, baseY, k, scale, lift, shadow, tint, true);
      });
    };
  });
}
