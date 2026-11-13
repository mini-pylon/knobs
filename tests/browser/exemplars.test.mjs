// Every exemplar the knobs skill ships: its files, and that it mounts clean,
// draws, and reads the store in the drawer. The shipped ones are listed in
// exemplars.json, so a missing folder fails here instead of going untested;
// a folder that is not listed is tested all the same.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { closeAll, copyFixture, launch, logText, openDrawer, serve, type } from './lib/harness.mjs';
import { exemplarsDir, folders, kindOf, loadControls, openExemplar, pictureTrial, settle } from './lib/exemplar.mjs';

const shipped = JSON.parse(readFileSync(new URL('./exemplars.json', import.meta.url), 'utf8'));
const names = [...new Set([...Object.keys(shipped), ...folders()])].sort();

let fixture, site, browser;

before(async () => {
  fixture = await copyFixture('exemplar');
  site = await serve(fixture.root);
  browser = await launch();
});
after(() => closeAll(
  () => browser?.close(),
  () => site?.close(),
  () => fixture?.remove(),
));

// A README's `## ` sections, in order, each with its lines.
function sections(text) {
  const out = new Map();
  let current = null;
  for (const line of text.split('\n')) {
    const heading = line.match(/^## (.+)$/);
    if (heading) out.set(current = heading[1].trim(), []);
    else if (current) out.get(current).push(line);
  }
  return out;
}

const probeControl = (groups, probe) => groups[0].controls.find(control => `${groups[0].name}.${control.key}` === probe);

// The default trial is shared by the checks that compare against it.
const defaults = new Map();
function defaultTrial(name) {
  if (!defaults.has(name)) defaults.set(name, pictureTrial(browser, site.url, name));
  return defaults.get(name);
}

for (const name of names) {
  const dir = join(exemplarsDir, name);
  const kind = shipped[name] ?? kindOf(name);

  test(`${name}: shape`, async () => {
    assert.ok(existsSync(dir), `missing exemplar folder: ${name}`);
    assert.equal(kindOf(name), kind, `${name} is a ${kind}`);
    const code = kind === 'picture' ? 'visual.js' : 'extension.js';
    assert.deepEqual(readdirSync(dir).sort(), ['README.md', 'controls.js', code, 'shot.png'].sort());
    assert.deepEqual([...readFileSync(join(dir, 'shot.png')).subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], 'shot.png is a PNG');

    const parts = sections(readFileSync(join(dir, 'README.md'), 'utf8'));
    assert.deepEqual([...parts.keys()], ['When', 'What makes it good', 'Adapting']);
    const when = parts.get('When').join(' ').trim();
    assert.match(when, /^[^.]+\.$/, 'When is one sentence');
    const points = parts.get('What makes it good').filter(line => line.startsWith('- '));
    assert.ok(points.length >= 3 && points.length <= 5, `three to five points, not ${points.length}`);
    for (const point of points) assert.match(point, /^- \*\*(Look|Behaviour):\*\* \S/);
    if (kind === 'extension') {
      const adapting = parts.get('Adapting').join('\n');
      assert.match(adapting, /https:\/\/github\.com\/mini-pylon\/knobs\/issues\/\d+/, 'Adapting links the knobs issue');
      assert.match(adapting, /`status`/, 'Adapting says how to merge status');
    }

    const source = readFileSync(join(dir, code), 'utf8');
    assert.match(source, /^\/\/ @ts-check\n/);
    const { groups, probe } = await loadControls(name);
    assert.ok(Array.isArray(groups) && groups.length > 0, 'controls.js exports groups');
    if (kind !== 'picture') return;
    assert.equal(groups.length, 1, 'a picture exemplar has one group');
    const control = probeControl(groups, probe);
    assert.ok(control, `probe ${probe} names a control of ${groups[0].name}`);
    assert.equal(control.type, 'number', 'the probe is a number control');
    assert.ok(control.value < control.max, 'the probe starts below its maximum');
    const reads = [...source.matchAll(/store\.control\('([^']+)'\)/g)].map(match => match[1]);
    assert.ok(reads.includes(probe), 'the picture reads its probe');
    for (const path of reads) assert.ok(groups[0].controls.some(item => `${groups[0].name}.${item.key}` === path), `${path} is a control of ${groups[0].name}`);
  });

  test(`${name}: mounts clean`, async () => {
    const { page, errors } = await openExemplar(browser, site.url, name);
    try {
      await settle(page);
      if (kind === 'picture') {
        const label = await page.locator('canvas.viz-chart').getAttribute('aria-label');
        assert.ok(label.trim().split(/\s+/).length >= 3, `the picture has a real label, not "${label}"`);
      }
      assert.deepEqual(errors, []);
    } finally {
      await page.context().close();
    }
  });

  if (kind !== 'picture') continue;

  test(`${name}: not blank`, async () => {
    const { painted } = await defaultTrial(name);
    assert.ok(painted > 0, 'some pixel has alpha above zero');
  });

  test(`${name}: deterministic`, async () => {
    const first = await defaultTrial(name);
    assert.deepEqual(await pictureTrial(browser, site.url, name), first);
  });

  test(`${name}: reads the store`, async () => {
    const { groups, probe } = await loadControls(name);
    const first = await defaultTrial(name);
    const seeded = await pictureTrial(browser, site.url, name, { [probe]: probeControl(groups, probe).max });
    assert.notDeepEqual(seeded, first, `setting ${probe} to its maximum changes the picture`);
  });
}

// presets: `preset` applies part of the look group and keeps the quality group.
async function presetsDrawer() {
  const { page, errors } = await openExemplar(browser, site.url, 'presets');
  await openDrawer(page);
  const presets = await page.evaluate(() => window.__exemplar.module.presets);
  return { page, errors, presets };
}

// Sets each path to a valid value other than its current one, in the page,
// and returns the values the store now holds.
const nudge = (page, paths) => page.evaluate(list => {
  const store = window.__exemplar.store;
  for (const path of list) {
    const control = store.byPath.get(path);
    const value = store.control(path);
    let next = `${value}!`;
    if (control.type === 'number') next = value === control.max ? control.min : control.max;
    if (control.type === 'color') next = value === '#123456' ? '#654321' : '#123456';
    if (control.type === 'toggle') next = value ? 0 : 1;
    if (control.type === 'select') next = control.options.find(option => option !== value) ?? value;
    store.set(path, next);
  }
  return Object.fromEntries(list.map(path => [path, store.control(path)]));
}, paths);

const values = (page, paths) => page.evaluate(list => Object.fromEntries(list.map(path => [path, window.__exemplar.store.control(path)])), paths);

test('presets: preset lists every preset with its about', async () => {
  const { page, errors, presets } = await presetsDrawer();
  try {
    assert.ok(Object.keys(presets).length >= 2, 'at least two presets');
    await type(page, 'preset');
    const log = await logText(page);
    for (const [name, preset] of Object.entries(presets)) {
      assert.ok(log.includes(name), `lists ${name}`);
      assert.ok(log.includes(preset.about), `lists the about of ${name}`);
    }
    assert.deepEqual(errors, []);
  } finally {
    await page.context().close();
  }
});

test('presets: preset <name> sets the look values it names and nothing else', async () => {
  const { page, errors, presets } = await presetsDrawer();
  try {
    const { paths, defaults } = await page.evaluate(() => {
      const controls = [...window.__exemplar.store.byPath.values()];
      return { paths: controls.map(control => control.path), defaults: Object.fromEntries(controls.map(control => [control.path, control.default])) };
    });
    const look = paths.filter(path => path.startsWith('look.'));
    const quality = paths.filter(path => path.startsWith('quality.'));
    assert.ok(quality.length > 0, 'there is a quality group to keep');
    for (const [name, preset] of Object.entries(presets)) {
      for (const path of Object.keys(preset.values)) assert.ok(look.includes(path), `${name} names only look controls, not ${path}`);
    }
    const [name, preset] = Object.entries(presets).find(([, item]) => Object.keys(item.values).length < look.length) ?? [];
    assert.ok(name, 'some preset sets only part of look');
    assert.ok(Object.entries(preset.values).some(([path, value]) => !Object.is(value, defaults[path])), `${name} changes something`);

    const kept = [...look.filter(path => !(path in preset.values)), ...quality];
    const before = await nudge(page, kept);
    await type(page, `preset ${name}`);
    assert.deepEqual(await values(page, Object.keys(preset.values)), preset.values);
    assert.deepEqual(await values(page, kept), before);
    assert.deepEqual(errors, []);
  } finally {
    await page.context().close();
  }
});

test('presets: an unknown preset prints an error', async () => {
  const { page } = await presetsDrawer();
  try {
    await type(page, 'preset nope');
    assert.match(await page.locator('.term-line.err').last().textContent(), /nope/);
  } finally {
    await page.context().close();
  }
});

test('presets: reset still returns every default', async () => {
  const { page, presets } = await presetsDrawer();
  try {
    await type(page, `preset ${Object.keys(presets)[0]}`);
    assert.notDeepEqual(await page.evaluate(() => window.__exemplar.store.changed()), {});
    await type(page, 'reset');
    assert.deepEqual(await page.evaluate(() => window.__exemplar.store.changed()), {});
  } finally {
    await page.context().close();
  }
});
