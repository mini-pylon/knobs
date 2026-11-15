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
  // A local export ends at its own semicolon and is not a re-export.
  assert.deepEqual(imports("export { a };\nimport './nope.js';"), [
    { specifier: './nope.js', names: [] },
  ]);
  assert.deepEqual(imports("export {};\nimport { bogus } from './chat.js';"), [
    { specifier: './chat.js', names: ['bogus'] },
  ]);
  // A comment inside a brace list is not a name, and one inside a block is not an import.
  assert.deepEqual(imports("import {\n  real,\n  // not a name\n  also,\n} from './m.js';"), [
    { specifier: './m.js', names: ['real', 'also'] },
  ]);
  assert.deepEqual(imports("/*\nimport './nope.js';\nimport { a } from './gone.js';\n*/"), []);
  // A line that only looks like an import is not one, and does not fail the file.
  assert.deepEqual(imports("import ('./side.js');"), [
    { specifier: './side.js', names: [] },
  ]);
  assert.deepEqual(imports("const s = `\nimport './nope.js';\n`;"), []);
  assert.doesNotThrow(() => imports("import (\n"));
  // A quote, a comment marker or a slash inside a regex literal is not a string or a comment.
  assert.deepEqual(imports("const q = /['\"]/;\nimport { b } from './b.js';\nconst m = import('./dyn.js');"), [
    { specifier: './b.js', names: ['b'] },
    { specifier: './dyn.js', names: [] },
  ]);
  assert.deepEqual(imports("s.replace(/'/g, '');\nimport { b } from './b.js';"), [
    { specifier: './b.js', names: ['b'] },
  ]);
  assert.deepEqual(imports("const r = /a\\/*/;\nimport { b } from './b.js';"), [
    { specifier: './b.js', names: ['b'] },
  ]);
  assert.deepEqual(imports("const r = /\\/\\//; import('./dyn.js');"), [
    { specifier: './dyn.js', names: [] },
  ]);
  // Division is not a regex, so the import after it stays.
  assert.deepEqual(imports("const x = a / b; const y = c / d;\nimport { b } from './b.js';"), [
    { specifier: './b.js', names: ['b'] },
  ]);
  assert.throws(() => imports("const s = 'oops\nimport { b } from './b.js';"), /unterminated string on line 1/);
  // `from` is a binding name unless a quoted specifier follows it.
  assert.deepEqual(imports("import from from './f.js';"), [
    { specifier: './f.js', names: ['default'] },
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

test('wings-vdb: an absolute import names an absolute path, not a package', async () => {
  const dir = scratch();
  try {
    const checkout = copy(dir, 'wings-vdb');
    appendFileSync(join(checkout, 'src', 'main.js'), "\nimport '/etc/passwd';\n");
    await assert.rejects(
      snapshot(wingsVdb, checkout, join(dir, 'source'), { downscale: never }),
      /wings-vdb: src\/main\.js imports \/etc\/passwd, an absolute path; the fixture serves only relative imports/,
    );
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('wings-vdb: an import that cannot be read names the project and the file', async () => {
  const dir = scratch();
  try {
    const checkout = copy(dir, 'wings-vdb');
    appendFileSync(join(checkout, 'src', 'main.js'), '\nimport { a };\n');
    await assert.rejects(
      snapshot(wingsVdb, checkout, join(dir, 'source'), { downscale: never }),
      /wings-vdb: src\/main\.js: import has no specifier/,
    );
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('wings-vdb: a report that is not JSON names the project and the file', async () => {
  const dir = scratch();
  try {
    const reports = join(dir, 'reports');
    mkdirSync(reports);
    writeFileSync(join(reports, 'broken.json'), '{');
    await assert.rejects(wingsVdb.read(join(fixtures, 'wings-vdb'), { reports }), /wings-vdb: broken\.json:/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('wings-vdb: saved params that are not JSON name the project and the file', async () => {
  const dir = scratch();
  try {
    const reports = join(dir, 'reports');
    mkdirSync(reports);
    writeFileSync(join(reports, 'broken.json'), JSON.stringify({ at: 't', storage: { 'wings-vdb:params': '{' } }));
    await assert.rejects(wingsVdb.read(join(fixtures, 'wings-vdb'), { reports }), /wings-vdb: broken\.json: wings-vdb:params:/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('wings-vdb: a params module that cannot be loaded names the project and the file', async () => {
  const dir = scratch();
  try {
    const checkout = copy(dir, 'wings-vdb');
    writeFileSync(join(checkout, 'src', 'params.js'), 'this is not javascript\n');
    await assert.rejects(wingsVdb.read(checkout, { reports: join(dir, 'no-reports') }), /wings-vdb: src\/params\.js:/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('mini-pylon: Python that cannot start names the reason', async () => {
  const dir = scratch();
  const saved = process.env.PATH;
  process.env.PATH = dir;
  try {
    await assert.rejects(miniPylon.read(join(dir, 'missing')), /mini-pylon: reading the schema: ENOENT$/);
  } finally {
    process.env.PATH = saved;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('mini-pylon: Python that exits with no output names the status', async () => {
  const dir = scratch();
  try {
    const checkout = copy(dir, 'mini-pylon');
    writeFileSync(join(checkout, 'tools', 'scene_params.py'), 'import sys\nsys.exit(3)\n');
    await assert.rejects(miniPylon.read(checkout), /mini-pylon: reading the schema: exit 3$/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('mini-pylon: a Python failure while reading the schema names the step and leaves the program out', async () => {
  const dir = scratch();
  try {
    const checkout = copy(dir, 'mini-pylon');
    writeFileSync(join(checkout, 'tools', 'scene_params.py'), 'def (\n');
    await assert.rejects(miniPylon.read(checkout), error => {
      assert.match(error.message, /^mini-pylon: reading the schema:/);
      assert.match(error.message, /SyntaxError/);
      assert.doesNotMatch(error.message, /json\.dumps/);
      assert.doesNotMatch(error.message, /python3 -B -c/);
      return true;
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('mini-pylon: a Python failure while recording names the step and leaves the program out', async () => {
  const dir = scratch();
  try {
    const checkout = copy(dir, 'mini-pylon');
    writeFileSync(join(checkout, 'tools', 'scene_params.py'), 'def (\n');
    await assert.rejects(miniPylon.record(checkout, join(dir, 'source')), error => {
      assert.match(error.message, /^mini-pylon: reading what the server would answer:/);
      assert.match(error.message, /SyntaxError/);
      assert.doesNotMatch(error.message, /def first_pixel/);
      assert.doesNotMatch(error.message, /python3 -B -c/);
      return true;
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('mini-pylon: Python that prints no JSON names the step and the first line', async () => {
  const dir = scratch();
  try {
    const checkout = copy(dir, 'mini-pylon');
    const file = join(checkout, 'tools', 'scene_params.py');
    writeFileSync(file, `print("not-json-line")\n${readFileSync(file, 'utf8')}`);
    await assert.rejects(miniPylon.read(checkout), /mini-pylon: reading the schema: Python printed no JSON: not-json-line/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('mini-pylon: recording that prints no JSON names the step and the first line', async () => {
  const dir = scratch();
  try {
    const checkout = copy(dir, 'mini-pylon');
    const file = join(checkout, 'tools', 'scene_params.py');
    writeFileSync(file, `print("not-json-line")\n${readFileSync(file, 'utf8')}`);
    await assert.rejects(
      miniPylon.record(checkout, join(dir, 'source')),
      /mini-pylon: reading what the server would answer: Python printed no JSON: not-json-line/,
    );
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('mini-pylon: a final that is not JSON names the file', async () => {
  const dir = scratch();
  try {
    const checkout = copy(dir, 'mini-pylon');
    writeFileSync(join(checkout, 'renders', 'hyperreal', 'tweaks', 'help-20261111-173007-2160.json'), '{');
    await assert.rejects(
      miniPylon.read(checkout),
      /mini-pylon: renders\/hyperreal\/tweaks\/help-20261111-173007-2160\.json:/,
    );
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('mini-pylon: a final that is not a PNG names the file', async () => {
  const dir = scratch();
  try {
    const checkout = copy(dir, 'mini-pylon');
    writeFileSync(join(checkout, 'renders', 'hyperreal', 'tweaks', 'help-20261111-173007-2160.png'), Buffer.from('not a png'));
    await assert.rejects(
      miniPylon.record(checkout, join(dir, 'source'), { downscale: never }),
      /mini-pylon: renders\/hyperreal\/tweaks\/help-20261111-173007-2160\.png: not a PNG/,
    );
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('mini-pylon: a Python step that does not finish names the step', { timeout: 10000 }, async () => {
  const dir = scratch();
  try {
    const checkout = copy(dir, 'mini-pylon');
    writeFileSync(join(checkout, 'tools', 'scene_params.py'), 'import time\ntime.sleep(5)\n');
    await assert.rejects(miniPylon.read(checkout, { timeout: 200 }), error => {
      assert.match(error.message, /^mini-pylon: reading the schema: timed out$/);
      assert.doesNotMatch(error.message, /time\.sleep/);
      assert.doesNotMatch(error.message, /python3 -B -c/);
      return true;
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('mini-pylon: Python leaves no temp folder after success, an error, or a timeout', { timeout: 20000 }, async () => {
  const dir = scratch();
  const tmp = join(dir, 'tmp');
  mkdirSync(tmp);
  const saved = process.env.TMPDIR;
  process.env.TMPDIR = tmp;
  const fresh = name => {
    const dest = join(dir, name);
    cpSync(join(fixtures, 'mini-pylon'), dest, { recursive: true });
    return dest;
  };
  try {
    await miniPylon.record(fresh('ok'), join(dir, 'ok-out'), { downscale: never });
    assert.deepEqual(readdirSync(tmp), []);

    const broken = fresh('broken');
    writeFileSync(join(broken, 'tools', 'scene_params.py'), 'raise RuntimeError("boom")\n');
    await assert.rejects(miniPylon.record(broken, join(dir, 'broken-out')));
    assert.deepEqual(readdirSync(tmp), []);

    const sleeper = fresh('sleeper');
    const swatch = join(sleeper, 'tools', 'tweak_server.py');
    const body = readFileSync(swatch, 'utf8').replace(
      'def write_swatch_png(path, size, values):\n',
      'def write_swatch_png(path, size, values):\n    import time\n    time.sleep(30)\n',
    );
    writeFileSync(swatch, body);
    await assert.rejects(
      miniPylon.record(sleeper, join(dir, 'sleeper-out'), { downscale: never, timeout: 400 }),
      /timed out/,
    );
    assert.deepEqual(readdirSync(tmp), []);
  } finally {
    if (saved === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = saved;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('mini-pylon: recording that does not finish names the step', { timeout: 10000 }, async () => {
  const dir = scratch();
  try {
    const checkout = copy(dir, 'mini-pylon');
    writeFileSync(join(checkout, 'tools', 'scene_params.py'), 'import time\ntime.sleep(5)\n');
    await assert.rejects(miniPylon.record(checkout, join(dir, 'source'), { timeout: 200 }), error => {
      assert.match(error.message, /^mini-pylon: reading what the server would answer: timed out$/);
      assert.doesNotMatch(error.message, /time\.sleep/);
      assert.doesNotMatch(error.message, /python3 -B -c/);
      return true;
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('mini-pylon: a failed downscale names the final', async () => {
  const dir = scratch();
  try {
    const checkout = copy(dir, 'mini-pylon');
    const wide = encodePng(960, 960, Buffer.alloc(960 * 960 * 3, 0x80));
    writeFileSync(join(checkout, 'renders', 'hyperreal', 'tweaks', 'help-20261111-173007-2160.png'), wide);
    await assert.rejects(
      miniPylon.record(checkout, join(dir, 'source'), { downscale: async () => { throw new Error('decode failed'); } }),
      /mini-pylon: renders\/hyperreal\/tweaks\/help-20261111-173007-2160\.png: decode failed/,
    );
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
