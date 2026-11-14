// Publish (playground/publish.mjs): the recovery and the two renames a
// capture uses to put a finished folder in place. The fs calls are injected
// so a test can make one throw.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const scratch = () => {
  mkdirSync(join(repo, 'tests', '.tmp'), { recursive: true });
  return mkdtempSync(join(repo, 'tests', '.tmp', 'publish-'));
};

// Every file under dir, path then bytes, so a restore can be checked byte for byte.
const tree = dir => readdirSync(dir, { recursive: true }).sort().map(rel => {
  const path = join(dir, rel);
  if (statSync(path).isDirectory()) return `${rel}/`;
  return `${rel} ${readFileSync(path).toString('hex')}`;
});

test('the second rename throwing puts the last capture back byte for byte and rethrows', async () => {
  const { placeCapture } = await import('../../playground/publish.mjs');
  const out = scratch();
  try {
    const dest = join(out, 'p');
    mkdirSync(join(dest, 'shots'), { recursive: true });
    writeFileSync(join(dest, 'capture.json'), '{"last":true}\n');
    writeFileSync(join(dest, 'shots', 'a.png'), Buffer.from([1, 2, 3, 4]));
    const before = tree(dest);
    const partial = join(out, '.p-new-test');
    mkdirSync(partial);
    writeFileSync(join(partial, 'capture.json'), '{"new":true}\n');
    let renames = 0;
    const fs = {
      renameSync(from, to) {
        renames += 1;
        if (renames === 2) throw new Error('disk full');
        renameSync(from, to);
      },
    };
    let thrown = null;
    try {
      placeCapture({ out, project: 'p', partial, dest, fs });
    } catch (error) {
      thrown = error;
    }
    assert.ok(thrown);
    assert.equal(thrown.message, 'disk full');
    assert.deepEqual(tree(dest), before);
    assert.equal(readFileSync(join(partial, 'capture.json'), 'utf8'), '{"new":true}\n');
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('a rename-back that throws keeps the original error and the last capture aside', async () => {
  const { placeCapture } = await import('../../playground/publish.mjs');
  const out = scratch();
  try {
    const dest = join(out, 'p');
    mkdirSync(dest);
    writeFileSync(join(dest, 'capture.json'), 'last');
    const partial = join(out, '.p-new-test');
    mkdirSync(partial);
    writeFileSync(join(partial, 'capture.json'), 'new');
    let renames = 0;
    const fs = {
      renameSync(from, to) {
        renames += 1;
        if (renames === 2) throw new Error('the snapshot broke');
        if (renames === 3) throw new Error('disk full');
        renameSync(from, to);
      },
    };
    let thrown = null;
    try {
      placeCapture({ out, project: 'p', partial, dest, fs });
    } catch (error) {
      thrown = error;
    }
    assert.ok(thrown);
    assert.equal(thrown.message, 'the snapshot broke');
    assert.equal(thrown.renameBack.message, 'disk full');
    assert.equal(existsSync(dest), false);
    assert.equal(readFileSync(join(thrown.aside, 'capture.json'), 'utf8'), 'last');
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('removing the previous folder after publishing warns and leaves the new capture', async () => {
  const { removeAside } = await import('../../playground/publish.mjs');
  const out = scratch();
  try {
    const dest = join(out, 'p');
    const aside = join(out, '.p-old-kept');
    mkdirSync(dest);
    writeFileSync(join(dest, 'capture.json'), 'new');
    mkdirSync(aside);
    writeFileSync(join(aside, 'capture.json'), 'old');
    const warning = removeAside(aside, { rmSync() { throw new Error('busy'); } });
    assert.equal(warning, `capture: could not remove ${aside}: busy; the next capture removes it`);
    assert.equal(readFileSync(join(dest, 'capture.json'), 'utf8'), 'new');
    assert.equal(readFileSync(join(aside, 'capture.json'), 'utf8'), 'old');
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('recover restores the newest old folder and removes the rest', async () => {
  const { recover } = await import('../../playground/publish.mjs');
  const out = scratch();
  try {
    const older = join(out, '.p-old-aaa');
    const newer = join(out, '.p-old-bbb');
    const other = join(out, '.p-old-ccc');
    const leftover = join(out, '.p-new-died');
    for (const dir of [older, newer, other, leftover]) mkdirSync(dir);
    writeFileSync(join(older, 'marker'), 'old');
    writeFileSync(join(newer, 'marker'), 'new');
    writeFileSync(join(other, 'marker'), 'other');
    writeFileSync(join(leftover, 'marker'), 'partial');
    const now = Date.now();
    utimesSync(older, new Date(now - 30000), new Date(now - 30000));
    utimesSync(other, new Date(now - 20000), new Date(now - 20000));
    utimesSync(newer, new Date(now - 10000), new Date(now - 10000));
    recover(out, 'p');
    assert.equal(readFileSync(join(out, 'p', 'marker'), 'utf8'), 'new');
    assert.deepEqual(readdirSync(out).sort(), ['p']);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
