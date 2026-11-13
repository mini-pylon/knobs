// Captures (playground/adapters, playground/capture.mjs): a project's own
// drawer schema and saved values, read from its checkout and turned into
// knobs groups and value sets. Every test reads the copies under
// tests/fixtures/captures, never the real projects.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineControls } from '../../src/index.js';
import { build, checkValues, source } from '../../playground/adapters/common.mjs';
import * as wingsVdb from '../../playground/adapters/wings-vdb.mjs';
import * as miniPylon from '../../playground/adapters/mini-pylon.mjs';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const fixtures = join(repo, 'tests', 'fixtures', 'captures');
const scratch = () => {
  mkdirSync(join(repo, 'tests', '.tmp'), { recursive: true });
  return mkdtempSync(join(repo, 'tests', '.tmp', 'capture-'));
};
const reports = join(fixtures, 'wings-vdb-browsers');
const control = (groups, path) => {
  const [group, key] = path.split('.');
  return groups.find(g => g.name === group).controls.find(c => c.key === key);
};

test('wings-vdb: every group and var becomes a knobs control the store accepts', async () => {
  const { groups } = await wingsVdb.read(join(fixtures, 'wings-vdb'), { reports });
  assert.deepEqual(groups.map(g => g.name), ['dispersal', 'scroll', 'presence', 'sunlight', 'birds', 'dive', 'hover', 'opening']);
  assert.doesNotThrow(() => defineControls(groups));
  assert.deepEqual(control(groups, 'dispersal.curve'), {
    key: 'curve', type: 'number', value: 2, min: 0.25, max: 8, step: 0.05,
    about: 'burst falloff; low = disperses early and stays out, high = brief spike',
  });
  assert.deepEqual(control(groups, 'scroll.snap'), {
    key: 'snap', type: 'toggle', value: 1, about: 'when the scroll stops near a shape\'s centre, the page glides there',
  });
  const toggles = groups.flatMap(g => g.controls).filter(c => c.type === 'toggle');
  assert.equal(toggles.length, 8);
  for (const c of groups.flatMap(g => g.controls)) {
    for (const wiring of ['uniform', 'js', 'core', 'path', 'group', 'default']) assert.ok(!(wiring in c), `${c.key} carries ${wiring}`);
  }
});

test('wings-vdb: the tabs its drawer hides are hidden groups', async () => {
  const { groups } = await wingsVdb.read(join(fixtures, 'wings-vdb'), { reports });
  assert.deepEqual(groups.filter(g => g.hidden).map(g => g.name), ['birds', 'hover', 'opening']);
  assert.ok(groups.filter(g => !g.hidden).every(g => !('hidden' in g)));
});

test('wings-vdb: value sets are the defaults and one per browser report, in current names', async () => {
  const { valueSets } = await wingsVdb.read(join(fixtures, 'wings-vdb'), { reports });
  assert.deepEqual(Object.keys(valueSets), ['defaults', 'fixture01']);
  assert.deepEqual(valueSets.defaults.values, {});
  const report = valueSets.fixture01;
  assert.match(report.about, /2026-11-13T18:00:17/);
  assert.ok(!report.about.includes('Mozilla'), 'the user agent stays out of the capture');
  // Old names are migrated; a value equal to its default is left out.
  assert.deepEqual(report.values, { 'scroll.hang': 1.5, 'dispersal.expand': 0.4, 'sunlight.light': 1.2 });
  assert.deepEqual(report.dropped, [
    { path: 'config.retired', value: 1, why: 'retired name' },
    { path: 'dive.in', value: 'fast', why: 'invalid value' },
    { path: 'nowhere.at', value: 3, why: 'no such control' },
  ]);
});

test('wings-vdb: no reports folder still gives the defaults', async () => {
  const { valueSets } = await wingsVdb.read(join(fixtures, 'wings-vdb'), { reports: join(fixtures, 'no-such-folder') });
  assert.deepEqual(Object.keys(valueSets), ['defaults']);
});

test('wings-vdb: untranslated names the pictures, the perf page, the wiring and each drawer command', async () => {
  const { untranslated } = await wingsVdb.read(join(fixtures, 'wings-vdb'), { reports });
  const text = untranslated.join('\n');
  for (const word of ['viz.js', 'perf', 'uniform', '/defaults', '/goto', '/save', '/load']) assert.ok(text.includes(word), `untranslated names ${word}:\n${text}`);
  assert.ok(text.includes("/ui: show or hide the page's UI"), 'escapes are undone');
  // A project command of a built-in's name replaces it: one /shot, the project's.
  assert.deepEqual(untranslated.filter(line => line.startsWith('/shot')), ['/shot: download a high-res PNG of the frame']);
  assert.ok(untranslated.includes('/save (built in): download the whole configuration as a JSON file'));
});

test('mini-pylon: choices become selects, defaults become values, and the store accepts them', async () => {
  const { groups } = await miniPylon.read(join(fixtures, 'mini-pylon'));
  assert.deepEqual(groups.map(g => g.name), ['ground', 'clutter', 'light', 'camera', 'pylon', 'render']);
  assert.doesNotThrow(() => defineControls(groups));
  assert.deepEqual(control(groups, 'ground.surface'), {
    key: 'surface', type: 'select', value: 'asphalt', options: ['asphalt', 'concrete', 'studio'],
    about: 'asphalt road edge, concrete slab, or a seamless studio sweep',
  });
  assert.deepEqual(control(groups, 'clutter.gravel'), { key: 'gravel', type: 'number', value: 520, min: 0, max: 1500, step: 10, about: 'number of loose stones' });
  assert.deepEqual(control(groups, 'ground.puddle'), { key: 'puddle', type: 'toggle', value: 1, about: 'a shallow puddle in front of the pylon' });
  assert.deepEqual(control(groups, 'pylon.body'), { key: 'body', type: 'color', value: '#1F4BFF', about: 'cone colour' });
});

test('mini-pylon: value sets are the defaults, each preset, and each final by its file stem', async () => {
  const { valueSets } = await miniPylon.read(join(fixtures, 'mini-pylon'));
  assert.deepEqual(Object.keys(valueSets), ['defaults', 'afternoon', 'overcast', 'dusk', 'wet-night', 'concrete', 'studio', 'help-20261111-173007-2160']);
  assert.deepEqual(valueSets.afternoon.values, {});
  assert.equal(valueSets.dusk.about, 'sun on the horizon, long amber light');
  assert.equal(valueSets.overcast.values['light.world'], 'studio');
  const final = valueSets['help-20261111-173007-2160'];
  assert.equal(final.about, 'final "help"');
  assert.equal(final.values['ground.line_color'], 'white');
  assert.equal(final.values['clutter.gravel'], 570);
  assert.ok(!('ground.surface' in final.values), 'a value equal to its default is left out');
});

test('mini-pylon: untranslated names the renders tab, /render and the preview pane', async () => {
  const { untranslated } = await miniPylon.read(join(fixtures, 'mini-pylon'));
  const text = untranslated.join('\n');
  for (const word of ['renders tab', '/render', 'preview']) assert.ok(text.includes(word), `untranslated names ${word}`);
});

test('mini-pylon: reading the schema leaves no __pycache__ in the checkout', async () => {
  await miniPylon.read(join(fixtures, 'mini-pylon'));
  assert.ok(!existsSync(join(fixtures, 'mini-pylon', 'tools', '__pycache__')));
});

test('checkValues keeps what differs from the default, normalized, and lists the rest as dropped', () => {
  const groups = [{ name: 'g', controls: [
    { key: 'n', type: 'number', value: 1, min: 0, max: 2, step: 0.1 },
    { key: 'c', type: 'color', value: '#aabbcc' },
  ] }];
  // 1.04 rounds to the step, 1.0, and '#AABBCC' to '#aabbcc': both are the defaults.
  assert.deepEqual(checkValues(groups, { 'g.n': 1.04, 'g.c': '#AABBCC', 'g.x': 1, 'g.n2': 0 }), {
    values: {},
    dropped: [{ path: 'g.x', value: 1, why: 'no such control' }, { path: 'g.n2', value: 0, why: 'no such control' }],
  });
  assert.deepEqual(checkValues(groups, { 'g.n': 1.5, 'g.c': 'red' }), { values: { 'g.n': 1.5 }, dropped: [{ path: 'g.c', value: 'red', why: 'invalid value' }] });
});

test('source reads a git checkout\'s branch, commit and dirty flag, and is null outside git', () => {
  const dir = scratch();
  try {
    const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim();
    git('init', '-q', '-b', 'trunk');
    writeFileSync(join(dir, 'a.txt'), 'a');
    git('add', 'a.txt');
    git('-c', 'user.name=t', '-c', 'user.email=t@example.test', 'commit', '-q', '-m', 'one');
    const commit = git('rev-parse', 'HEAD');
    assert.deepEqual(source('demo', dir), { repo: 'demo', branch: 'trunk', commit, dirty: false });
    writeFileSync(join(dir, 'a.txt'), 'b');
    assert.equal(source('demo', dir).dirty, true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
  assert.deepEqual(source('demo', join(fixtures, 'mini-pylon')).commit, null);
});

test('build gives the capture.json shape', async () => {
  const capture = await build(miniPylon, join(fixtures, 'mini-pylon'), { now: new Date('2026-11-13T12:00:00Z') });
  assert.deepEqual(Object.keys(capture), ['source', 'capturedAt', 'groups', 'valueSets', 'untranslated', 'shots']);
  assert.equal(capture.capturedAt, '2026-11-13T12:00:00.000Z');
  assert.equal(capture.source.repo, 'mini-pylon');
  assert.deepEqual(capture.shots, []);
});

// Every file under a folder with its size and mtime, to show a run wrote nothing there.
const listing = dir => readdirSync(dir, { recursive: true }).sort().map(f => {
  const s = statSync(join(dir, f));
  return `${f} ${s.size} ${s.mtimeMs}`;
});

test('capture.mjs writes capture.json, skips shots when the dev server is down, and writes nothing in the checkout', async () => {
  const out = scratch();
  const checkout = join(out, 'checkout');
  cpSync(join(fixtures, 'mini-pylon'), checkout, { recursive: true });
  const before = listing(checkout);
  try {
    const stdout = await new Promise((resolve, reject) => execFile(process.execPath,
      [join(repo, 'playground', 'capture.mjs'), 'mini-pylon', checkout, '--out', join(out, 'captures'), '--dev', 'http://127.0.0.1:9/'],
      { timeout: 30000 }, (error, so, se) => (error ? reject(new Error(`${error.message}\n${se}`)) : resolve(so))));
    const capture = JSON.parse(readFileSync(join(out, 'captures', 'mini-pylon', 'capture.json'), 'utf8'));
    assert.equal(capture.groups.length, 6);
    assert.deepEqual(capture.shots, []);
    assert.match(capture.shotsSkipped, /not answering/);
    assert.match(stdout, /capture\.json/);
    assert.deepEqual(listing(checkout), before);
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test('capture.mjs refuses an unknown project', async () => {
  const error = await new Promise(resolve => execFile(process.execPath, [join(repo, 'playground', 'capture.mjs'), 'nope'], { timeout: 30000 }, e => resolve(e)));
  assert.ok(error, 'exits non-zero');
  assert.match(error.message, /unknown project: nope/);
});

test('npm run playground:capture runs capture.mjs', () => {
  const { scripts } = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8'));
  assert.equal(scripts['playground:capture'], 'node playground/capture.mjs');
});
