// Stand-in for wings-vdb's src/viz.js: one picture, for the dispersal tab, a
// line on a canvas that follows dispersal.curve.
import * as params from './params.js';

export function paramVisuals() {
  return {
    dispersal(box) {
      const canvas = document.createElement('canvas');
      canvas.width = 160;
      canvas.height = 90;
      box.append(canvas);
      const ctx = canvas.getContext('2d');
      return {
        frame() {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.strokeStyle = '#334';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(0, 80);
          ctx.lineTo(160, 80 - 70 * params.values['dispersal.curve'] / 8);
          ctx.stroke();
        },
      };
    },
  };
}
