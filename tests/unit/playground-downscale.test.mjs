// The capture downscale names the file it was scaling. The page is injected
// so the test does not launch a browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { encodePng } from '../../playground/png.mjs';

test('downscale names the file when the picture cannot be decoded', async () => {
  const { downscale } = await import('../../playground/capture.mjs');
  const page = {
    async evaluate() { throw new Error('decode failed'); },
    async close() {},
  };
  const png = encodePng(2, 2, Buffer.alloc(2 * 2 * 3, 1));
  await assert.rejects(
    downscale(png, 1, 'renders/hyperreal/tweaks/wide.png', { page }),
    /renders\/hyperreal\/tweaks\/wide\.png: decode failed/,
  );
});
