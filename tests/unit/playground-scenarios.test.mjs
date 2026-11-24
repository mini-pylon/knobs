// captureOf (playground/scenarios.js) returns the capture a capture:<name>
// stage mounts with its defaults. It is synchronous: capture() already is.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { servePlayground } from '../../playground/server.mjs';

const repo = fileURLToPath(new URL('../..', import.meta.url));
mkdirSync(join(repo, 'tests', '.tmp'), { recursive: true });

test('captureOf returns the defaults capture synchronously', async () => {
  const root = mkdtempSync(join(repo, 'tests', '.tmp', 'scenarios-'));
  const drafts = join(root, 'drafts');
  const captures = join(root, 'captures');
  const fonts = join(root, 'fonts');
  mkdirSync(drafts);
  mkdirSync(join(captures, 'sample'), { recursive: true });
  mkdirSync(fonts);
  writeFileSync(join(captures, 'sample', 'capture.json'), JSON.stringify({
    groups: [{ name: 'one', controls: [] }],
    valueSets: { defaults: { values: { a: 1 }, about: 'defaults' } },
    shots: [],
    source: { repo: 'sample', branch: 'main', commit: '', dirty: false },
    capturedAt: '2026-01-01T00:00:00.000Z',
    untranslated: [],
  }));
  const site = await servePlayground({ drafts, captures, fonts, logLevel: 'error' });
  try {
    const mod = await site.server.ssrLoadModule('/scenarios.js');
    const record = mod.captureOf('sample');
    assert.equal(record instanceof Promise, false);
    assert.equal(record.name, 'sample');
    assert.equal(record.set, 'defaults');
    assert.equal(record.valueSets.defaults.values.a, 1);
    assert.deepEqual(record.groups.map(group => group.name), ['one']);
  } finally {
    await site.close();
    rmSync(root, { recursive: true, force: true });
  }
});
