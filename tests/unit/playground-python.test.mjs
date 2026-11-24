// The mini-pylon stand-in's Python port (playground/fixtures/mini-pylon/python.mjs):
// json.loads, scene_params._coerce and resolve, and json.dumps(sort_keys=True),
// checked against python3 itself where Python's own text is the answer. The
// schema comes from a snapshot of the stand-in checkout under tests/fixtures/captures.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { snapshot } from '../../playground/adapters/common.mjs';
import * as miniPylon from '../../playground/adapters/mini-pylon.mjs';
import { coerce, dumps, floatRepr, loads, PyNum, resolve, revive, typedVars } from '../../playground/fixtures/mini-pylon/python.mjs';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const fixtures = join(repo, 'tests', 'fixtures', 'captures');
mkdirSync(join(repo, 'tests', '.tmp'), { recursive: true });
const dir = mkdtempSync(join(repo, 'tests', '.tmp', 'fixtures-'));
const source = join(dir, 'mini-pylon-source');
const data = name => JSON.parse(readFileSync(join(source, 'data', name), 'utf8'));
before(() => snapshot(miniPylon, join(fixtures, 'mini-pylon'), source, { downscale: () => { throw new Error('no downscale'); } }));
after(() => rmSync(dir, { recursive: true, force: true }));
test('floatRepr prints every float as Python\'s float.__repr__ does', () => {
  const xs = [0.005, 1e16, 2, 0.00001, 123456789012345680000, 1.5e-7, 0.1 + 0.2, -0, 1e15, 0.0001, 0.52, 2.75, -18.4, 1e22, 5e-324, 1.7976931348623157e308, 100, 12345.678, -1e-7, 9.999999999999999e15];
  const python = execFileSync('python3', ['-B', '-c', 'import sys, json; print("\\n".join(repr(float(x)) for x in json.loads(sys.argv[1])))', JSON.stringify(xs.map(x => (Object.is(x, -0) ? '-0.0' : String(x))))], { encoding: 'utf8' }).trim().split('\n');
  assert.deepEqual(xs.map(floatRepr), python);
});

test('loads tells an int from a float by its text, as json.loads does', () => {
  const parsed = loads('{"a": 1, "b": 1.0, "c": 1e2, "d": -0, "e": 2.50, "f": "x", "g": true, "h": null, "i": [3, 4.5]}');
  assert.deepEqual(Object.fromEntries(['a', 'b', 'c', 'd', 'e'].map(k => [k, [parsed[k].value, parsed[k].type]])), {
    a: [1, 'int'], b: [1, 'float'], c: [100, 'float'], d: [0, 'int'], e: [2.5, 'float'],
  });
  assert.equal(parsed.f, 'x');
  assert.equal(parsed.g, true);
  assert.equal(parsed.h, null);
  assert.deepEqual(parsed.i.map(n => n.type), ['int', 'float']);
});

test('a JSON number with no source text is refused, not read as a float', () => {
  assert.throws(() => revive('n', 1, undefined), { message: 'a JSON number has no source text' });
  assert.throws(() => revive('n', 1, {}), { message: 'a JSON number has no source text' });
  assert.equal(revive('n', 1, { source: '1' }).type, 'int');
  assert.equal(revive('n', 1.5, { source: '1.5' }).type, 'float');
});

function numberSchema(types) {
  return typedVars(
    { groups: [{ name: 'g', vars: [{ key: 'n', type: 'number', default: 1, min: 0, max: 2 }] }] },
    { 'g.n': types },
  );
}

test('typedVars refuses a number type other than int or float, naming the path and the field', () => {
  assert.throws(() => numberSchema({ default: 'str', min: 'int', max: 'int' }), { message: "types.json: g.n default is 'str', not int or float" });
  assert.throws(() => numberSchema({ default: 'int', min: 'bool', max: 'int' }), { message: "types.json: g.n min is 'bool', not int or float" });
  assert.throws(() => numberSchema({ default: 'float', min: 'int', max: 'bytes' }), { message: "types.json: g.n max is 'bytes', not int or float" });
  assert.throws(() => numberSchema({ min: 'int', max: 'float' }), { message: 'types.json: g.n default is missing, not int or float' });
});

test('a choice or colour keeps a str default, and a toggle keeps an int', () => {
  const vars = typedVars({
    groups: [{ name: 'g', vars: [
      { key: 'c', type: 'choice', default: 'sky', choices: ['sky'] },
      { key: 'k', type: 'color', default: '#112233' },
      { key: 't', type: 'toggle', default: 1 },
    ] }],
  }, {
    'g.c': { default: 'str' },
    'g.k': { default: 'str' },
    'g.t': { default: 'int' },
  });
  assert.equal(vars.find(variable => variable.path === 'g.c').default, 'sky');
  assert.equal(vars.find(variable => variable.path === 'g.k').default, '#112233');
  const toggle = vars.find(variable => variable.path === 'g.t').default;
  assert.ok(toggle instanceof PyNum);
  assert.equal(toggle.value, 1);
  assert.equal(toggle.type, 'int');
});

test('dumps writes json.dumps(sort_keys=True): sorted keys, Python separators, Python floats, ASCII only', () => {
  const values = { 'b.c': 'S', 'a.y': new PyNum(2, 'float'), 'a.x': new PyNum(1, 'int'), 'a.z': 'é"\\\n', 'a.w': new PyNum(1e-5, 'float') };
  const python = execFileSync('python3', ['-B', '-c', 'import json; print(json.dumps({"b.c": "S", "a.y": 2.0, "a.x": 1, "a.z": "\\u00e9\\"\\\\\\n", "a.w": 1e-05}, sort_keys=True))'], { encoding: 'utf8' }).trim();
  assert.equal(dumps(values), python);
  assert.equal(dumps(values), '{"a.w": 1e-05, "a.x": 1, "a.y": 2.0, "a.z": "\\u00e9\\"\\\\\\n", "b.c": "S"}');
});

test('coerce follows scene_params._coerce: clamps take the bound\'s type, toggles become ints, colours go upper-case', () => {
  const int = n => new PyNum(n, 'int');
  const float = n => new PyNum(n, 'float');
  const number = { path: 'g.n', type: 'number', min: int(1), max: int(85) };
  const show = v => (v instanceof PyNum ? [v.value, v.type] : v);
  assert.deepEqual(show(coerce(number, float(90.5))), [85, 'int']);
  assert.deepEqual(show(coerce(number, float(40.5))), [40.5, 'float']);
  assert.deepEqual(show(coerce(number, int(40))), [40, 'int']);
  // Equal to a bound: min and max keep the bound, so its type.
  assert.deepEqual(show(coerce(number, float(1))), [1, 'int']);
  assert.deepEqual(show(coerce({ ...number, max: float(1.5) }, int(9))), [1.5, 'float']);
  assert.throws(() => coerce(number, true), { message: 'g.n: not a number: True' });
  assert.throws(() => coerce(number, '3'), { message: "g.n: not a number: '3'" });
  const toggle = { path: 'g.t', type: 'toggle' };
  for (const [value, want] of [[true, 1], [false, 0], [float(1), 1], [int(0), 0]]) assert.deepEqual(show(coerce(toggle, value)), [want, 'int']);
  assert.throws(() => coerce(toggle, float(0.5)), { message: 'g.t: not on or off: 0.5' });
  const choice = { path: 'g.c', type: 'choice', choices: ['sky', 'studio'] };
  assert.equal(coerce(choice, 'sky'), 'sky');
  assert.throws(() => coerce(choice, 'moon'), { message: "g.c: 'moon' is not one of sky, studio" });
  const color = { path: 'g.k', type: 'color' };
  assert.equal(coerce(color, '#1f4bff'), '#1F4BFF');
  // Python's $ also matches before a final newline.
  assert.equal(coerce(color, '#aabbcc\n'), '#AABBCC\n');
  assert.throws(() => coerce(color, 'red'), { message: "g.k: not a #RRGGBB colour: 'red'" });
});

test('resolve gives every value with the defaults\' Python types, and refuses an unknown parameter', () => {
  const vars = typedVars(data('schema.json'), data('types.json'));
  const all = resolve(vars, {});
  assert.deepEqual([all['ground.wetness'].value, all['ground.wetness'].type], [0, 'float']);
  assert.deepEqual([all['light.lamp'].value, all['light.lamp'].type], [0, 'int']);
  assert.equal(all['render.preview_size'].value, 480);
  assert.throws(() => resolve(vars, { 'nope.x': new PyNum(1, 'int') }), { message: 'unknown parameter: nope.x' });
  assert.throws(() => typedVars(data('schema.json'), {}), /types\.json has no ground\.surface/);
});
