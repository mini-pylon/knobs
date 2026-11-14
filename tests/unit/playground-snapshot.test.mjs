// Snapshots (playground/adapters, snapshot in common.mjs): a dated copy of a
// project's own page in <capture>/source/, which the playground serves as
// the capture's source side. Every test reads the stand-in checkouts under
// tests/fixtures/captures, never the real projects.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { imports, snapshot } from '../../playground/adapters/common.mjs';
import * as miniPylon from '../../playground/adapters/mini-pylon.mjs';
import * as wingsVdb from '../../playground/adapters/wings-vdb.mjs';
import { decodePng, encodePng, pngSize } from '../../playground/png.mjs';
import * as chat from '../../playground/fixtures/wings-vdb/stubs/chat.js';
import * as devReport from '../../playground/fixtures/wings-vdb/stubs/dev-report.js';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const fixtures = join(repo, 'tests', 'fixtures', 'captures');
const scratch = () => {
  mkdirSync(join(repo, 'tests', '.tmp'), { recursive: true });
  return mkdtempSync(join(repo, 'tests', '.tmp', 'snapshot-'));
};
// A private copy of a stand-in checkout, to break on purpose.
const copy = (dir, name) => {
  cpSync(join(fixtures, name), join(dir, name), { recursive: true });
  return join(dir, name);
};
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const files = dir => readdirSync(dir, { recursive: true }).filter(f => statSync(join(dir, f)).isFile()).sort();
const never = () => { throw new Error('downscale was not expected'); };

test('wings-vdb: the snapshot is the listed files byte for byte, each with its source path and sha256, and the stubs', async () => {
  const dir = scratch();
  try {
    const source = join(dir, 'source');
    const vendored = await snapshot(wingsVdb, join(fixtures, 'wings-vdb'), source, { downscale: never });
    const listed = ['index.html', ...['main', 'terminal', 'viz', 'perf', 'params', 'birds', 'cloud-morph', 'shader', 'post', 'detail', 'flags'].map(n => `src/${n}.js`), 'src/style.css', 'public/cloud-fallback.svg', 'public/wings-wide.svg'];
    assert.deepEqual(vendored.files.map(f => f.path), listed);
    assert.deepEqual(files(source), [...listed].sort());
    for (const file of vendored.files) {
      const original = readFileSync(join(fixtures, 'wings-vdb', file.from));
      assert.equal(file.from, file.path, 'every wings-vdb file keeps its path');
      assert.deepEqual(readFileSync(join(source, file.path)), original, file.path);
      assert.equal(file.sha256, sha256(original), file.path);
    }
    assert.deepEqual(vendored.stubs, [
      { module: 'src/chat.js', by: 'playground/fixtures/wings-vdb/stubs/chat.js' },
      { module: 'src/dev-report.js', by: 'playground/fixtures/wings-vdb/stubs/dev-report.js' },
    ]);
    assert.deepEqual(vendored.recorded, []);
    // No font, no chat.js, no dev-report.js.
    assert.ok(!existsSync(join(source, 'public', 'fonts')));
    assert.ok(!existsSync(join(source, 'src', 'chat.js')) && !existsSync(join(source, 'src', 'dev-report.js')));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('imports: each static, re-exported and dynamic import with the names it takes', () => {
  const text = [
    "import './style.css';",
    "import * as params from './params.js';",
    "import def, { a, b as c } from './x.js';",
    'import {\n  d,\n  e,\n} from "./y.js";',
    "export { f } from './z.js';",
    "export * from './w.js';",
    "const late = await import('./late.js');",
    "// import nope from './comment.js';",
    'if (import.meta.hot) import.meta.hot.accept();',
  ].join('\n');
  assert.deepEqual(imports(text), [
    { specifier: './style.css', names: [] },
    { specifier: './params.js', names: [] },
    { specifier: './x.js', names: ['a', 'b', 'default'] },
    { specifier: './y.js', names: ['d', 'e'] },
    { specifier: './z.js', names: ['f'] },
    { specifier: './w.js', names: [] },
    { specifier: './late.js', names: [] },
  ]);
});

test('stub: the chat.js stub is a thread that stays empty, with what main.js reads from it', () => {
  const thread = chat.mountChatThread({ thread: null, pills: null, input: null });
  for (const name of ['empty', 'expanded']) assert.equal(typeof Object.getOwnPropertyDescriptor(thread, name).get, 'function', `${name} is a getter`);
  assert.equal(thread.empty, true);
  assert.equal(thread.expanded, false);
  assert.equal(thread.fit(120), 0);
  assert.equal(Math.max(0, thread.fit()), 0);
  assert.deepEqual(thread.layoutPills({ width: 300 }), { height: 0, boxes: [] });
  for (const name of ['send', 'clear', 'focus']) assert.equal(thread[name]('x'), undefined, name);
  assert.deepEqual(chat.respond('/clouds'), { blocks: [] });
  assert.deepEqual(Object.keys(chat).sort(), ['mountChatThread', 'respond']);
});

test('stub: the dev-report.js stub reports nothing', () => {
  assert.deepEqual(Object.keys(devReport), ['reportSettings']);
  assert.equal(devReport.reportSettings(), undefined);
});

test('png: decodePng reads back what encodePng writes, and an RGBA file', () => {
  const rgb = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  const decoded = decodePng(encodePng(2, 2, rgb));
  assert.deepEqual([decoded.width, decoded.height, decoded.channels], [2, 2, 3]);
  assert.deepEqual(decoded.pixels, rgb);
  // A 1x1 RGBA PNG.
  const rgba = decodePng(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
  assert.deepEqual([rgba.width, rgba.height, rgba.channels], [1, 1, 4]);
  assert.throws(() => pngSize(Buffer.from('not a png at all, not at all')), /not a PNG/);
});

for (const [why, line, message] of [
  ['a relative import that is neither copied nor stubbed', "import './nope.js';", /wings-vdb: src\/main\.js imports \.\/nope\.js, which is neither copied nor stubbed/],
  ['a name the stub does not export', "import { bogus } from './chat.js';", /wings-vdb: src\/main\.js imports bogus from \.\/chat\.js, which its stub playground\/fixtures\/wings-vdb\/stubs\/chat\.js does not export/],
  ['a package import', "import * as three from 'three';", /wings-vdb: src\/main\.js imports three, a package; the fixture serves no packages/],
]) {
  test(`wings-vdb: the snapshot fails on ${why}, and writes nothing`, async () => {
    const dir = scratch();
    try {
      const checkout = copy(dir, 'wings-vdb');
      appendFileSync(join(checkout, 'src', 'main.js'), `\n${line}\n`);
      await assert.rejects(snapshot(wingsVdb, checkout, join(dir, 'source'), { downscale: never }), message);
      assert.ok(!existsSync(join(dir, 'source')));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}

test('wings-vdb: the snapshot fails on a listed file missing from the checkout', async () => {
  const dir = scratch();
  try {
    const checkout = copy(dir, 'wings-vdb');
    rmSync(join(checkout, 'src', 'perf.js'));
    await assert.rejects(snapshot(wingsVdb, checkout, join(dir, 'source'), { downscale: never }), /wings-vdb: src\/perf\.js is missing from the checkout/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('mini-pylon: the snapshot copies the tweak page and records what its server would answer', async () => {
  const dir = scratch();
  try {
    const source = join(dir, 'source');
    const vendored = await snapshot(miniPylon, join(fixtures, 'mini-pylon'), source, { downscale: never });
    assert.deepEqual(vendored.files.map(f => [f.path, f.from]), [['index.html', 'tools/tweak/index.html'], ['tweak.js', 'tools/tweak/tweak.js'], ['tweak.css', 'tools/tweak/tweak.css']]);
    for (const file of vendored.files) assert.deepEqual(readFileSync(join(source, file.path)), readFileSync(join(fixtures, 'mini-pylon', file.from)));
    assert.deepEqual(vendored.stubs, []);
    assert.deepEqual([...vendored.recorded].sort(), ['data/defaults.json', 'data/finals.json', 'data/schema.json', 'data/swatch.json', 'data/types.json', 'renders/help-20261111-173007-2160.png']);
    const data = name => JSON.parse(readFileSync(join(source, 'data', name), 'utf8'));
    // schema.json is what /api/schema answers: scene_params.schema(), as Python wrote it.
    const schema = data('schema.json');
    assert.deepEqual(Object.keys(schema), ['groups', 'presets']);
    assert.deepEqual(schema.groups.map(g => g.name), ['ground', 'clutter', 'light', 'camera', 'pylon', 'render']);
    // Python's types, which JSON alone loses: 0.0 is a float, 0 an int.
    const types = data('types.json');
    assert.deepEqual(types['ground.wetness'], { default: 'float', min: 'int', max: 'int' });
    assert.deepEqual(types['ground.wear'], { default: 'float', min: 'int', max: 'float' });
    assert.deepEqual(types['light.sun_elevation'], { default: 'int', min: 'int', max: 'int' });
    assert.deepEqual(types['light.lamp'], { default: 'int', min: 'int', max: 'int' });
    assert.deepEqual(types['pylon.body'], { default: 'str' });
    assert.deepEqual(types['ground.puddle'], { default: 'int' });
    assert.equal(Object.keys(types).length, schema.groups.flatMap(g => g.vars).length);
    const defaults = data('defaults.json');
    assert.equal(defaults['render.preview_size'], 480);
    assert.equal(defaults['pylon.body'], '#1F4BFF');
    // finals.json is what /api/finals answers, with the url pointing into the fixture.
    const finals = data('finals.json');
    assert.equal(finals.length, 1);
    assert.deepEqual(Object.keys(finals[0]), ['name', 'file', 'state', 'url', 'size', 'queued', 'rendered', 'error', 'values']);
    assert.equal(finals[0].url, '/captures/mini-pylon/source/renders/help-20261111-173007-2160.png');
    assert.equal(finals[0].state, 'done');
    // A render no wider than the preview is copied as it is.
    assert.deepEqual(readFileSync(join(source, 'renders', 'help-20261111-173007-2160.png')), readFileSync(join(fixtures, 'mini-pylon', 'renders', 'hyperreal', 'tweaks', 'help-20261111-173007-2160.png')));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('mini-pylon: swatch.json holds Python\'s own swatch for four payloads, as the page writes them', async () => {
  const dir = scratch();
  try {
    await snapshot(miniPylon, join(fixtures, 'mini-pylon'), join(dir, 'source'), { downscale: never });
    const swatches = JSON.parse(readFileSync(join(dir, 'source', 'data', 'swatch.json'), 'utf8'));
    assert.deepEqual(swatches.map(s => s.about), [
      'the defaults as the page sends them',
      'ground.wear past its float maximum',
      'ground.wetness past its int maximum by a non-integer',
      'pylon.body in lowercase and ground.puddle sent as true',
    ]);
    for (const s of swatches) {
      assert.deepEqual(Object.keys(s), ['about', 'payload', 'values', 'rgb', 'size']);
      assert.equal(s.size, 256);
      assert.equal(s.rgb.length, 3);
      for (const c of s.rgb) assert.ok(c >= 64 && c <= 191, `${s.about}: ${c}`);
      // The payload is the page's JSON text; the values are json.dumps of the scene, render.* left out.
      assert.equal(JSON.parse(s.payload).kind, 'preview');
      assert.ok(!s.values.includes('render.'), s.about);
    }
    const [defaults, floatClamp, intClamp, lower] = swatches;
    // JavaScript writes the default 0.0 as 0: Python reads an int and keeps it.
    assert.match(defaults.payload, /"ground\.wetness":0,/);
    assert.match(defaults.values, /"ground\.wetness": 0,/);
    assert.match(floatClamp.payload, /"ground\.wear":2\.75,/);
    assert.match(floatClamp.values, /"ground\.wear": 1\.5,/);
    // A non-integer past an int bound takes the bound's type.
    assert.match(intClamp.payload, /"ground\.wetness":6\.5,/);
    assert.match(intClamp.values, /"ground\.wetness": 1,/);
    assert.match(lower.payload, /"pylon\.body":"#1f4bff"/);
    assert.match(lower.payload, /"ground\.puddle":true,/);
    // Upper-cased and int(True): the same scene as the defaults.
    assert.equal(lower.values, defaults.values);
    assert.deepEqual(lower.rgb, defaults.rgb);
    assert.notDeepEqual(floatClamp.rgb, defaults.rgb);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('mini-pylon: a final wider than the preview size is downscaled to it, and the result is what is written', async () => {
  const dir = scratch();
  try {
    const checkout = copy(dir, 'mini-pylon');
    const wide = encodePng(960, 960, Buffer.alloc(960 * 960 * 3, 0x80));
    writeFileSync(join(checkout, 'renders', 'hyperreal', 'tweaks', 'help-20261111-173007-2160.png'), wide);
    const calls = [];
    const small = encodePng(480, 480, Buffer.alloc(480 * 480 * 3, 0x80));
    await snapshot(miniPylon, checkout, join(dir, 'source'), { downscale: async (png, width) => { calls.push([pngSize(png).width, width]); return small; } });
    assert.deepEqual(calls, [[960, 480]]);
    assert.deepEqual(readFileSync(join(dir, 'source', 'renders', 'help-20261111-173007-2160.png')), small);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

for (const input of ['tools/tweak_server.py', 'tools/scene_params.py', 'renders/hyperreal/tweaks', 'tools/tweak/tweak.js']) {
  test(`mini-pylon: the snapshot fails, naming it, when ${input} is missing`, async () => {
    const dir = scratch();
    try {
      const checkout = copy(dir, 'mini-pylon');
      rmSync(join(checkout, input), { recursive: true });
      await assert.rejects(snapshot(miniPylon, checkout, join(dir, 'source'), { downscale: never }), new RegExp(`mini-pylon: ${input.replace(/[./]/g, '\\$&')} is missing from the checkout`));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}

test('mini-pylon: recording runs Python without leaving bytecode in the checkout', async () => {
  const dir = scratch();
  try {
    const checkout = copy(dir, 'mini-pylon');
    await snapshot(miniPylon, checkout, join(dir, 'source'), { downscale: never });
    assert.ok(!existsSync(join(checkout, 'tools', '__pycache__')));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// Every file under a folder with its size and mtime, to show a run wrote nothing there.
const listing = dir => readdirSync(dir, { recursive: true }).sort().map(f => {
  const s = statSync(join(dir, f));
  return `${f} ${s.size} ${s.mtimeMs}`;
});
const capture = args => new Promise(resolve => execFile(process.execPath, [join(repo, 'playground', 'capture.mjs'), ...args], { timeout: 60000 },
  (error, stdout, stderr) => resolve({ code: error?.code ?? 0, stdout, stderr })));

test('capture.mjs writes source/ and records it as vendored in capture.json, leaving no partial folder, an old one removed, and nothing in the checkout', async () => {
  const dir = scratch();
  try {
    const checkout = copy(dir, 'wings-vdb');
    const before = listing(checkout);
    const out = join(dir, 'captures');
    // What a run that died would have left.
    mkdirSync(join(out, '.wings-vdb-died'), { recursive: true });
    const run = await capture(['wings-vdb', checkout, '--out', out, '--dev', 'http://127.0.0.1:9/', '--reports', join(fixtures, 'wings-vdb-browsers')]);
    assert.equal(run.code, 0, run.stderr);
    const written = JSON.parse(readFileSync(join(out, 'wings-vdb', 'capture.json'), 'utf8'));
    assert.deepEqual(Object.keys(written.vendored), ['files', 'stubs', 'recorded']);
    assert.equal(written.vendored.files.length, 15);
    assert.ok(existsSync(join(out, 'wings-vdb', 'source', 'src', 'main.js')));
    assert.deepEqual(written.valueSets.fixture01.sourceValues['dispersal.hang'], 1.5);
    assert.deepEqual(readdirSync(out), ['wings-vdb']);
    assert.deepEqual(listing(checkout), before);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('capture.mjs that fails leaves the last capture as it was, says why, and leaves no partial folder', async () => {
  const dir = scratch();
  try {
    const out = join(dir, 'captures');
    const good = await capture(['mini-pylon', join(fixtures, 'mini-pylon'), '--out', out, '--dev', 'http://127.0.0.1:9/']);
    assert.equal(good.code, 0, good.stderr);
    const last = listing(join(out, 'mini-pylon'));
    const checkout = copy(dir, 'mini-pylon');
    rmSync(join(checkout, 'tools', 'tweak_server.py'));
    const bad = await capture(['mini-pylon', checkout, '--out', out, '--dev', 'http://127.0.0.1:9/']);
    assert.notEqual(bad.code, 0);
    assert.match(bad.stderr, /capture failed: mini-pylon: tools\/tweak_server\.py is missing from the checkout/);
    assert.deepEqual(listing(join(out, 'mini-pylon')), last);
    assert.deepEqual(readdirSync(out), ['mini-pylon']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('capture.mjs after a run that died between its two renames puts the last capture back', async () => {
  const dir = scratch();
  try {
    const out = join(dir, 'captures');
    const good = await capture(['mini-pylon', join(fixtures, 'mini-pylon'), '--out', out, '--dev', 'http://127.0.0.1:9/']);
    assert.equal(good.code, 0, good.stderr);
    const last = listing(join(out, 'mini-pylon'));
    // What a run that died after moving the last capture aside would have left.
    renameSync(join(out, 'mini-pylon'), join(out, '.mini-pylon-old-died'));
    mkdirSync(join(out, '.mini-pylon-new-died'));
    const checkout = copy(dir, 'mini-pylon');
    rmSync(join(checkout, 'tools', 'tweak_server.py'));
    const bad = await capture(['mini-pylon', checkout, '--out', out, '--dev', 'http://127.0.0.1:9/']);
    assert.notEqual(bad.code, 0);
    assert.deepEqual(readdirSync(out), ['mini-pylon']);
    assert.deepEqual(listing(join(out, 'mini-pylon')), last);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
