// The source side's seed (playground/fixtures/source-side.js): which storage
// keys a project's own page is started with, in its own encoding, and which
// tab survives a switch of side. The captures are built from the stand-in
// checkouts under tests/fixtures/captures.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../../playground/adapters/common.mjs';
import * as miniPylon from '../../playground/adapters/mini-pylon.mjs';
import * as wingsVdb from '../../playground/adapters/wings-vdb.mjs';
import { defaultTab, openSourceTab, otherSideTab, PREFIXES, seedSource, SOURCES, sourceSeed, sourceUrl } from '../../playground/fixtures/source-side.js';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const fixtures = join(repo, 'tests', 'fixtures', 'captures');
const wings = await build(wingsVdb, join(fixtures, 'wings-vdb'), { reports: join(fixtures, 'wings-vdb-browsers') });
const pylon = await build(miniPylon, join(fixtures, 'mini-pylon'));

// A Storage with only what seedSource uses.
class MemoryStorage {
  constructor(entries = {}) { this.map = new Map(Object.entries(entries)); }
  get length() { return this.map.size; }
  key(i) { return [...this.map.keys()][i] ?? null; }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
  entries() { return Object.fromEntries(this.map); }
}

test('wings-vdb is seeded with its params as a JSON object, its tab as a JSON array, and the drawer open as the string 1', () => {
  assert.deepEqual(sourceSeed('wings-vdb', wings, 'defaults', 'scroll'), {
    clear: PREFIXES,
    local: { 'wings-vdb:params': '{}', 'wings-vdb:groups': '["scroll"]' },
    session: { 'wings-vdb:drawer': '1' },
  });
  const report = JSON.parse(readFileSync(join(fixtures, 'wings-vdb-browsers', 'fixture01.json'), 'utf8'));
  const seed = sourceSeed('wings-vdb', wings, 'fixture01', 'dispersal');
  assert.deepEqual(JSON.parse(seed.local['wings-vdb:params']), JSON.parse(report.storage['wings-vdb:params']));
  // The console and perf tabs are not groups: the page keeps its own.
  assert.ok(!('wings-vdb:groups' in sourceSeed('wings-vdb', wings, 'defaults', 'wings-vdb').local));
  assert.ok(!('wings-vdb:groups' in sourceSeed('wings-vdb', wings, 'defaults', 'perf').local));
  assert.equal(sourceSeed('wings-vdb', wings, 'defaults').local['wings-vdb:groups'], '["dispersal"]');
});

test('mini-pylon is seeded with every key as JSON: values, the view, the group, and the drawer open', () => {
  assert.deepEqual(sourceSeed('mini-pylon', pylon, 'dusk', 'light'), {
    clear: PREFIXES,
    local: {
      'mini-pylon-tweak:values': JSON.stringify(pylon.valueSets.dusk.sourceValues),
      'mini-pylon-tweak:view': '"params"',
      'mini-pylon-tweak:drawer': 'true',
      'mini-pylon-tweak:group': '"light"',
    },
    session: {},
  });
  assert.equal(sourceSeed('mini-pylon', pylon, 'defaults', 'renders').local['mini-pylon-tweak:view'], '"renders"');
  assert.equal(sourceSeed('mini-pylon', pylon, 'defaults', 'mini-pylon').local['mini-pylon-tweak:view'], '"console"');
  assert.ok(!('mini-pylon-tweak:group' in sourceSeed('mini-pylon', pylon, 'defaults', 'renders').local));
});

test('a seed refuses an unknown value set, a capture made before sourceValues, and an unknown project', () => {
  assert.throws(() => sourceSeed('wings-vdb', wings, 'nope'), /unknown value set: nope/);
  const old = structuredClone(pylon);
  delete old.valueSets.defaults.sourceValues;
  assert.throws(() => sourceSeed('mini-pylon', old, 'defaults'), /mini-pylon: value set defaults has no sourceValues; run npm run playground:capture -- mini-pylon/);
  assert.throws(() => sourceSeed('other', pylon, 'defaults'), /no source side for other/);
});

test('seedSource clears every key under both prefixes in both storages, and only those, before it writes', () => {
  const local = new MemoryStorage({ 'wings-vdb:flags': '{"waitlist":true}', 'wings-vdb:texture': 'grain', 'mini-pylon-tweak:history': '[]', 'knobs-playground:json': '[]', 'knobs-wings-vdb:groups': '["scroll"]' });
  const session = new MemoryStorage({ 'wings-vdb:defaults-note': 'x', 'knobs-wings-vdb:drawer': '1' });
  seedSource(sourceSeed('wings-vdb', wings, 'defaults', 'scroll'), local, session);
  assert.deepEqual(local.entries(), { 'knobs-playground:json': '[]', 'knobs-wings-vdb:groups': '["scroll"]', 'wings-vdb:params': '{}', 'wings-vdb:groups': '["scroll"]' });
  assert.deepEqual(session.entries(), { 'knobs-wings-vdb:drawer': '1', 'wings-vdb:drawer': '1' });
});

test('seedSource uses nothing outside itself, so page.evaluate can carry it', () => {
  // page.evaluate sends the function's text alone; a free name would break in the page.
  const run = new Function('seed', 'local', 'session', `return (${seedSource.toString()})(seed, local, session);`);
  const local = new MemoryStorage({ 'mini-pylon-tweak:x': '1' });
  run(sourceSeed('mini-pylon', pylon, 'defaults', 'ground'), local, new MemoryStorage());
  assert.equal(local.getItem('mini-pylon-tweak:x'), null);
  assert.equal(local.getItem('mini-pylon-tweak:group'), '"ground"');
});

test('switching side keeps a group tab, swaps the console tab for the other side\'s, and drops the rest', () => {
  assert.equal(otherSideTab('wings-vdb', wings, 'scroll', 'source'), 'scroll');
  assert.equal(otherSideTab('wings-vdb', wings, 'scroll', 'knobs'), 'scroll');
  assert.equal(otherSideTab('wings-vdb', wings, 'knobs-wings-vdb', 'source'), 'wings-vdb');
  assert.equal(otherSideTab('wings-vdb', wings, 'wings-vdb', 'knobs'), 'knobs-wings-vdb');
  assert.equal(otherSideTab('wings-vdb', wings, 'perf', 'knobs'), null);
  assert.equal(otherSideTab('wings-vdb', wings, 'birds', 'knobs'), null, 'a hidden group has no tab');
  assert.equal(otherSideTab('mini-pylon', pylon, 'renders', 'knobs'), null);
  assert.equal(otherSideTab('mini-pylon', pylon, null, 'source'), null);
});

test('each project\'s source page, default tab and fixture facts', () => {
  assert.equal(sourceUrl('wings-vdb'), '/captures/wings-vdb/source/');
  assert.equal(defaultTab(wings), 'dispersal');
  assert.equal(defaultTab(pylon), 'ground');
  assert.deepEqual(SOURCES, {
    'wings-vdb': { console: 'wings-vdb', refuses: ['saving defaults'], fonts: true },
    'mini-pylon': { console: 'mini-pylon', refuses: ['finals'], fonts: false },
  });
  assert.deepEqual(PREFIXES, ['wings-vdb:', 'mini-pylon-tweak:']);
});

test('the source prefix and the fonts path live in one table', async () => {
  const copies = [
    'playground/fixtures/routes.mjs',
    'playground/fixtures/wings-vdb/vite.mjs',
    'playground/fixtures/mini-pylon/api.mjs',
    'playground/adapters/mini-pylon.mjs',
  ];
  for (const file of copies) {
    const text = readFileSync(join(repo, file), 'utf8');
    assert.equal(text.includes('/captures/${'), false, `${file} builds the prefix`);
    assert.equal(text.includes("'/captures/wings-vdb/source/'"), false, file);
    assert.equal(text.includes("'/captures/wings-vdb/source'"), false, file);
    assert.equal(text.includes("'/captures/mini-pylon/source/'"), false, file);
    assert.equal(text.includes("'/captures/mini-pylon/source'"), false, file);
    assert.equal(text.includes("'/captures/wings-vdb/fonts'"), false, file);
    assert.equal(/\.replace\(\s*\/source/.test(text), false, `${file} rewrites the prefix`);
  }
  const home = readFileSync(join(repo, 'playground/fixtures/source-side.js'), 'utf8');
  assert.equal(home.includes('/captures/${'), false, 'source-side.js builds the prefix');
  const side = await import('../../playground/fixtures/source-side.js');
  const mounts = side.SOURCE_MOUNTS;
  assert.equal(side.sourceUrl('wings-vdb'), mounts['wings-vdb'].source);
  assert.equal(side.sourceUrl('mini-pylon'), mounts['mini-pylon'].source);
  assert.equal(mounts['wings-vdb'].source, '/captures/wings-vdb/source/');
  assert.equal(mounts['mini-pylon'].source, '/captures/mini-pylon/source/');
  assert.equal(mounts['wings-vdb'].fonts, '/captures/wings-vdb/fonts');
  assert.equal(side.withoutTrailingSlash(mounts['mini-pylon'].source), '/captures/mini-pylon/source');
  // page.evaluate sends these functions' text alone.
  for (const fn of [seedSource, openSourceTab]) {
    assert.doesNotMatch(fn.toString(), /\bSOURCE_MOUNTS\b|\bsourceUrl\b|\bwithoutTrailingSlash\b/);
  }
});
