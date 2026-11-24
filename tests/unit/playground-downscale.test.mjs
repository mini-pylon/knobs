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

test('a page that does not close does not hide the decode error', async () => {
  const { downscale } = await import('../../playground/capture.mjs');
  const lines = [];
  const original = console.error;
  console.error = line => lines.push(line);
  try {
    const page = {
      async evaluate() { throw new Error('decode failed'); },
      async close() { throw new Error('close broke'); },
    };
    const png = encodePng(2, 2, Buffer.alloc(2 * 2 * 3, 1));
    await assert.rejects(
      downscale(png, 1, 'renders/hyperreal/tweaks/wide.png', { page }),
      /renders\/hyperreal\/tweaks\/wide\.png: decode failed/,
    );
    assert.match(lines.join('\n'), /close broke/);
  } finally {
    console.error = original;
  }
});

test('a downscale that does not finish names the file and closes the page', { timeout: 1000 }, async () => {
  const { downscale } = await import('../../playground/capture.mjs');
  let closed = 0;
  const page = {
    evaluate() { return new Promise(() => {}); },
    async close() { closed += 1; },
  };
  const png = encodePng(2, 2, Buffer.alloc(2 * 2 * 3, 1));
  await assert.rejects(
    downscale(png, 1, 'renders/hyperreal/tweaks/wide.png', { page, deadline: 50 }),
    /renders\/hyperreal\/tweaks\/wide\.png: timed out/,
  );
  assert.ok(closed >= 1);
});
