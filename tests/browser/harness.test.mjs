import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { closeAll, copyFixture, serve } from './lib/harness.mjs';

// The dependency optimizer writes .vite/deps_temp_* in the background; a
// fixture removed while it writes fails with ENOTEMPTY. The plain fixture has
// no dependency to prebundle, so its server must never start the optimizer.
test('a plain fixture server writes no dependency cache', async () => {
  const fixture = await copyFixture('plain');
  const site = await serve(fixture.root);
  try {
    for (const path of ['', 'main.js']) assert.equal((await fetch(site.url + path)).status, 200, path);
  } finally {
    await site.close();
  }
  try {
    assert.equal(existsSync(join(fixture.root, '.vite')), false);
  } finally {
    await fixture.remove();
  }
});

test('removing a fixture survives files appearing while it runs', async () => {
  const fixture = await copyFixture('plain');
  const dir = join(fixture.root, '.vite', 'deps_temp_race');
  mkdirSync(dir, { recursive: true });
  let writing = true, n = 0;
  const writer = (async () => {
    while (writing) {
      try { mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, `chunk-${n++}.js`), 'x'); } catch {}
      await new Promise(done => setImmediate(done));
    }
  })();
  setTimeout(() => { writing = false; }, 300);
  try {
    await fixture.remove();
  } finally {
    writing = false;
    await writer;
  }
  await fixture.remove();
  assert.equal(existsSync(fixture.root), false);
});

test('closeAll runs every step even when one throws, then throws', async () => {
  const ran = [];
  await assert.rejects(
    closeAll(() => ran.push('page'), () => { throw new Error('remove failed'); }, () => ran.push('browser')),
    /remove failed/,
  );
  assert.deepEqual(ran, ['page', 'browser']);
});

test('closeAll skips steps whose resource never opened', async () => {
  let browser;
  await closeAll(() => browser?.close());
});
