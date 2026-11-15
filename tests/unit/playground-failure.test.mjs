// Cleanup after a capture must not hide the outcome. The fs and the browser
// are injected so a test can make one throw.
import test from 'node:test';
import assert from 'node:assert/strict';

test('a failed rename-back still prints the original error first, removes the partial, and exits 1', async () => {
  const { unwindCapture } = await import('../../playground/capture.mjs');
  const removed = [];
  const lines = [];
  const code = await unwindCapture({
    error: new Error('the snapshot broke'),
    published: false,
    aside: '/out/.p-old',
    dest: '/out/p',
    partial: '/out/.p-new',
    fs: {
      existsSync: () => false,
      renameSync() { throw new Error('disk full'); },
      rmSync(path) { removed.push(path); },
    },
    warn: line => lines.push(line),
  });
  assert.equal(code, 1);
  assert.match(lines[0], /^capture failed: the snapshot broke$/);
  assert.match(lines[1], /disk full/);
  assert.deepEqual(removed, ['/out/.p-new']);
});

test('removing the partial cannot hide the original error', async () => {
  const { unwindCapture } = await import('../../playground/capture.mjs');
  const lines = [];
  const code = await unwindCapture({
    error: new Error('the snapshot broke'),
    published: false,
    partial: '/out/.p-new',
    fs: {
      existsSync: () => true,
      rmSync() { throw new Error('busy'); },
    },
    warn: line => lines.push(line),
  });
  assert.equal(code, 1);
  assert.match(lines[0], /^capture failed: the snapshot broke$/);
  assert.match(lines.join('\n'), /busy/);
});

test('a browser that rejects after a published capture warns and still removes the previous folder', async () => {
  const { unwindCapture } = await import('../../playground/capture.mjs');
  const removed = [];
  const lines = [];
  const code = await unwindCapture({
    published: true,
    aside: '/out/.p-old',
    browser: { async close() { throw new Error('browser broke'); } },
    fs: { rmSync(path) { removed.push(path); } },
    warn: line => lines.push(line),
  });
  assert.equal(code, 0);
  assert.match(lines[0], /browser broke/);
  assert.deepEqual(removed, ['/out/.p-old']);
});

test('an error after the capture was published is printed and the exit code stays 0', async () => {
  const { unwindCapture } = await import('../../playground/capture.mjs');
  const lines = [];
  const code = await unwindCapture({
    published: true,
    error: new Error('the log broke'),
    warn: line => lines.push(line),
  });
  assert.equal(code, 0);
  assert.deepEqual(lines, ['capture: published, then: the log broke']);
});

test('a browser that rejects after a failed capture does not change the exit code', async () => {
  const { unwindCapture } = await import('../../playground/capture.mjs');
  const lines = [];
  const code = await unwindCapture({
    error: new Error('the snapshot broke'),
    published: false,
    partial: '/out/.p-new',
    browser: { async close() { throw new Error('browser broke'); } },
    fs: {
      existsSync: () => true,
      rmSync() {},
    },
    warn: line => lines.push(line),
  });
  assert.equal(code, 1);
  assert.match(lines[0], /^capture failed: the snapshot broke$/);
  assert.match(lines.join('\n'), /browser broke/);
});
