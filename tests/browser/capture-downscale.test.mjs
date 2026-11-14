// playground:capture (playground/capture.mjs) downscales a mini-pylon final
// wider than the preview size on a canvas in Chromium. Run on a copy of the
// stand-in checkout under tests/fixtures/captures.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { repo } from './lib/harness.mjs';
import { captureFixtures } from './lib/captures.mjs';
import { encodePng, pngSize } from '../../playground/png.mjs';

mkdirSync(join(repo, 'tests', '.tmp'), { recursive: true });

const node = (args, env = {}) => new Promise(resolve => execFile(process.execPath, args, { timeout: 120000, env: { ...process.env, ...env } },
  (error, stdout, stderr) => resolve({ code: error ? (error.code ?? 'killed') : 0, stdout, stderr })));

test('capture.mjs downscales a final wider than the preview size in Chromium', async () => {
  const dir = mkdtempSync(join(repo, 'tests', '.tmp', 'capture-'));
  try {
    const checkout = join(dir, 'mini-pylon');
    cpSync(join(captureFixtures, 'mini-pylon'), checkout, { recursive: true });
    const rgb = Buffer.alloc(960 * 960 * 3);
    for (let i = 0; i < rgb.length; i += 3) rgb.set([200, 120, 40], i);
    writeFileSync(join(checkout, 'renders', 'hyperreal', 'tweaks', 'help-20261111-173007-2160.png'), encodePng(960, 960, rgb));
    const run = await node([join(repo, 'playground', 'capture.mjs'), 'mini-pylon', checkout, '--out', join(dir, 'out'), '--dev', 'http://127.0.0.1:9/']);
    assert.equal(run.code, 0, run.stderr);
    assert.deepEqual(pngSize(readFileSync(join(dir, 'out', 'mini-pylon', 'source', 'renders', 'help-20261111-173007-2160.png'))), { width: 480, height: 480 });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
