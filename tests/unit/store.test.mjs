import test from 'node:test';
import assert from 'node:assert/strict';
import { defineControls, normalize } from '../../src/store.js';

const schema = () => [
  { name: 'hero', about: 'Homepage hero', controls: [
    { key: 'variant', type: 'select', value: 'split', options: ['split', 'full', 'stacked'] },
    { key: 'title', type: 'text', value: 'The original headline' },
    { key: 'overlay', type: 'number', value: 0.4, min: 0, max: 1, step: 0.01 },
    { key: 'badge', type: 'toggle', value: 1 },
    { key: 'accent', type: 'color', value: '#e8c547' },
  ] },
  { name: 'product', hidden: true, controls: [
    { key: 'price', type: 'number', value: 10, min: 0, max: 100, step: 1 },
  ] },
];

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
  };
}

function inBrowser(t) {
  globalThis.window = {};
  t.after(() => { delete globalThis.window; });
}

test('defineControls touches no browser API', () => {
  const trap = new Proxy({}, { get() { throw new Error('touched a browser API'); } });
  for (const name of ['document', 'localStorage', 'sessionStorage']) globalThis[name] = trap;
  try {
    const knobs = defineControls(schema(), {});
    assert.equal(knobs.control('hero.title'), 'The original headline');
  } finally {
    for (const name of ['document', 'localStorage', 'sessionStorage']) delete globalThis[name];
  }
});

test('reads work when destructured from the store', () => {
  const { control, onControl } = defineControls(schema());
  assert.equal(control('hero.variant'), 'split');
  assert.equal(typeof onControl('hero.variant', () => {}), 'function');
});

test('a read of an unknown path throws', () => {
  const knobs = defineControls(schema());
  assert.throws(() => knobs.control('hero.nope'), /unknown control: hero\.nope/);
  assert.throws(() => knobs.onControl('nope.nope', () => {}), /unknown control: nope\.nope/);
  assert.throws(() => knobs.fileValue('hero.nope'), /unknown control: hero\.nope/);
});

test('every control gets its path, group and default, and the schema is frozen', () => {
  const knobs = defineControls(schema());
  const c = knobs.byPath.get('product.price');
  assert.equal(c.path, 'product.price');
  assert.equal(c.group, 'product');
  assert.equal(c.default, 10);
  assert.ok(Object.isFrozen(c));
  assert.ok(Object.isFrozen(knobs.groups));
  assert.equal(knobs.groups[1].hidden, true);
  assert.equal(knobs.groups[0].hidden, false);
  assert.equal(knobs.groups[0].about, 'Homepage hero');
  assert.equal(knobs.groups[1].about, '');
});

for (const [name, bad, pattern] of [
  ['a duplicate control', [{ name: 'a', controls: [{ key: 'x', type: 'text', value: '' }, { key: 'x', type: 'text', value: '' }] }], /duplicate control a\.x/],
  ['an unknown type', [{ name: 'a', controls: [{ key: 'x', type: 'range', value: 1 }] }], /a\.x has unknown type range/],
  ['a number without a range', [{ name: 'a', controls: [{ key: 'x', type: 'number', value: 1 }] }], /a\.x needs min, max and step/],
  ['a number whose min is above its max', [{ name: 'a', controls: [{ key: 'x', type: 'number', value: 1, min: 5, max: 0, step: 1 }] }], /a\.x needs min at most max/],
  ['a number with a step of zero', [{ name: 'a', controls: [{ key: 'x', type: 'number', value: 1, min: 0, max: 5, step: 0 }] }], /a\.x needs a positive step/],
  ['a number with a negative step', [{ name: 'a', controls: [{ key: 'x', type: 'number', value: 1, min: 0, max: 5, step: -1 }] }], /a\.x needs a positive step/],
  ['a select without options', [{ name: 'a', controls: [{ key: 'x', type: 'select', value: 'y' }] }], /a\.x needs options/],
  ['a default that does not validate', [{ name: 'a', controls: [{ key: 'x', type: 'select', value: 'y', options: ['z'] }] }], /a\.x has an invalid default/],
  ['a group name with a space', [{ name: 'a b', controls: [] }], /bad group name: a b/],
  ['a key with a dot', [{ name: 'a', controls: [{ key: 'x.y', type: 'text', value: '' }] }], /bad control key in a: x\.y/],
]) test(`defineControls refuses ${name}`, () => assert.throws(() => defineControls(bad), pattern));

const number = { type: 'number', min: 0, max: 1, step: 0.01 };
for (const [name, control, input, expected] of [
  ['a number in range', number, 0.5, { ok: true, value: 0.5 }],
  ['a number above its range clamps', number, 3, { ok: true, value: 1 }],
  ['a number below its range clamps', number, -3, { ok: true, value: 0 }],
  ['a number rounds to its step\'s decimals', number, 0.123, { ok: true, value: 0.12 }],
  ['a step sets decimals, not a grid', { type: 'number', min: 0.25, max: 5, step: 0.5 }, 1.23, { ok: true, value: 1.2 }],
  ['a step written with an exponent keeps its decimals', { type: 'number', min: 0, max: 1, step: 1e-7 }, 0.1234567, { ok: true, value: 0.1234567 }],
  ['a step with digits and an exponent keeps its decimals', { type: 'number', min: 0, max: 1, step: 2.5e-7 }, 0.123456789, { ok: true, value: 0.12345679 }],
  ['a step finer than toFixed can round keeps the value', { type: 'number', min: 0, max: 1, step: 1e-101 }, 3e-101, { ok: true, value: 3e-101 }],
  ['a step finer than toFixed can round still rounds to its decimals', { type: 'number', min: 0, max: 1, step: 1e-101 }, 1.234e-101, { ok: true, value: 1e-101 }],
  ['a value under half the finest decimal rounds to zero', { type: 'number', min: 0, max: 1, step: 1e-101 }, 4e-102, { ok: true, value: 0 }],
  ['a value over half the finest decimal rounds up to it', { type: 'number', min: 0, max: 1, step: 1e-101 }, 6e-102, { ok: true, value: 1e-101 }],
  ['a fine step keeps a value with fewer digits than its decimals', { type: 'number', min: 0, max: 1, step: 1e-101 }, 0.123456789, { ok: true, value: 0.123456789 }],
  ['a fine step clamps above max', { type: 'number', min: 0, max: 1, step: 1e-101 }, 3, { ok: true, value: 1 }],
  ['a fine step clamps below min', { type: 'number', min: 0, max: 1, step: 1e-101 }, -3, { ok: true, value: 0 }],
  ['a step of exactly 100 decimals rounds through toFixed', { type: 'number', min: 0, max: 1, step: 1e-100 }, 1.234e-100, { ok: true, value: 1e-100 }],
  ['a negative value that rounds to zero gives zero, not minus zero', { type: 'number', min: -1, max: 1, step: 0.1 }, -0.001, { ok: true, value: 0 }],
  ['minus zero gives zero', { type: 'number', min: -1, max: 1, step: 0.1 }, -0, { ok: true, value: 0 }],
  ['minus zero gives zero with a step finer than toFixed can round', { type: 'number', min: -1, max: 1, step: 1e-101 }, -0, { ok: true, value: 0 }],
  ['rounding up never passes max',{ type: 'number', min: 0.25, max: 0.75, step: 1 }, 0.75, { ok: true, value: 0.75 }],
  ['rounding down never passes min', { type: 'number', min: 0.25, max: 0.75, step: 1 }, 0.3, { ok: true, value: 0.25 }],
  ['NaN', number, NaN, { ok: false }],
  ['Infinity', number, Infinity, { ok: false }],
  ['a numeric string', number, '0.5', { ok: false }],
  ['toggle 1', { type: 'toggle' }, 1, { ok: true, value: 1 }],
  ['toggle true', { type: 'toggle' }, true, { ok: true, value: 1 }],
  ['toggle false', { type: 'toggle' }, false, { ok: true, value: 0 }],
  ['toggle 2', { type: 'toggle' }, 2, { ok: false }],
  ['an option', { type: 'select', options: ['a', 'b'] }, 'b', { ok: true, value: 'b' }],
  ['a value not in the options', { type: 'select', options: ['a', 'b'] }, 'c', { ok: false }],
  ['text', { type: 'text' }, 'a b = 2', { ok: true, value: 'a b = 2' }],
  ['empty text', { type: 'text' }, '', { ok: true, value: '' }],
  ['a number for text', { type: 'text' }, 2, { ok: false }],
  ['a colour', { type: 'color' }, '#a1b2c3', { ok: true, value: '#a1b2c3' }],
  ['an upper-case colour lowers', { type: 'color' }, '#A1B2C3', { ok: true, value: '#a1b2c3' }],
  ['a short colour', { type: 'color' }, '#abc', { ok: false }],
  ['a named colour', { type: 'color' }, 'red', { ok: false }],
]) test(`normalize: ${name}`, () => assert.deepEqual(normalize(control, input), expected));

test('a file value beats the default, and an invalid one is ignored', () => {
  const knobs = defineControls(schema(), { 'hero.title': 'From the file', 'hero.variant': 'gone', 'hero.overlay': 9, 'no.such': 1 });
  assert.equal(knobs.control('hero.title'), 'From the file');
  assert.equal(knobs.control('hero.variant'), 'split');
  assert.equal(knobs.control('hero.overlay'), 1);
});

test('a saved value beats the file value, which beats the default', t => {
  inBrowser(t);
  const knobs = defineControls(schema(), { 'hero.title': 'File', 'hero.accent': '#111111' });
  knobs.attach(memoryStorage({ k: JSON.stringify({ 'hero.title': 'Saved' }) }), 'k');
  assert.equal(knobs.control('hero.title'), 'Saved');
  assert.equal(knobs.control('hero.accent'), '#111111');
  assert.equal(knobs.control('hero.variant'), 'split');
  assert.equal(knobs.fileValue('hero.title'), 'File');
});

for (const [name, saved] of [
  ['a select value not in its options', { 'hero.variant': 'gone' }],
  ['a number that is not finite', { 'hero.overlay': null }],
  ['a color that is not #rrggbb', { 'hero.accent': 'red' }],
  ['a path not in the schema', { 'hero.gone': 'x' }],
]) test(`a saved value is ignored: ${name}`, t => {
  inBrowser(t);
  const knobs = defineControls(schema());
  let calls = 0;
  knobs.subscribe(() => calls++);
  knobs.attach(memoryStorage({ k: JSON.stringify(saved) }), 'k');
  assert.deepEqual(knobs.changed(), {});
  assert.equal(calls, 0);
});

test('a saved number clamps to its range', t => {
  inBrowser(t);
  const knobs = defineControls(schema());
  knobs.attach(memoryStorage({ k: JSON.stringify({ 'hero.overlay': 7 }) }), 'k');
  assert.equal(knobs.control('hero.overlay'), 1);
});

test('corrupt storage is treated as empty', t => {
  inBrowser(t);
  const knobs = defineControls(schema());
  knobs.attach(memoryStorage({ k: '{not json' }), 'k');
  assert.deepEqual(knobs.changed(), {});
});

test('attach notifies once per value that changed', t => {
  inBrowser(t);
  const knobs = defineControls(schema());
  const seen = [];
  knobs.onControl('hero.title', value => seen.push(['one', value]));
  knobs.subscribe((value, path) => seen.push(['all', path, value]));
  knobs.attach(memoryStorage({ k: JSON.stringify({ 'hero.title': 'New', 'hero.variant': 'split' }) }), 'k');
  assert.deepEqual(seen, [['one', 'New'], ['all', 'hero.title', 'New']]);
});

test('a set notifies with the value and path, and a stopped listener hears nothing', t => {
  inBrowser(t);
  const knobs = defineControls(schema());
  const seen = [];
  const stop = knobs.onControl('hero.badge', (value, path) => seen.push([path, value]));
  assert.equal(knobs.set('hero.badge', 0), true);
  stop();
  knobs.set('hero.badge', 1);
  assert.deepEqual(seen, [['hero.badge', 0]]);
});

test('a set to the same value does not notify', t => {
  inBrowser(t);
  const knobs = defineControls(schema());
  let calls = 0;
  knobs.onControl('hero.overlay', () => calls++);
  knobs.set('hero.overlay', 0.4);
  assert.equal(calls, 0);
});

test('a listener that stops itself does not break the others', t => {
  inBrowser(t);
  const knobs = defineControls(schema());
  const seen = [];
  const stop = knobs.onControl('hero.badge', () => { seen.push('first'); stop(); });
  knobs.onControl('hero.badge', () => seen.push('second'));
  knobs.set('hero.badge', 0);
  assert.deepEqual(seen, ['first', 'second']);
});

test('an invalid set returns false and changes nothing', t => {
  inBrowser(t);
  const knobs = defineControls(schema());
  assert.equal(knobs.set('hero.variant', 'gone'), false);
  assert.equal(knobs.control('hero.variant'), 'split');
});

test('a set of an unknown path throws', t => {
  inBrowser(t);
  assert.throws(() => defineControls(schema()).set('hero.nope', 1), /unknown control: hero\.nope/);
});

test('setting, resetting or attaching with no window throws', () => {
  const knobs = defineControls(schema());
  assert.throws(() => knobs.set('hero.badge', 0), /only change in a browser/);
  assert.throws(() => knobs.reset(), /only change in a browser/);
  assert.throws(() => knobs.attach(memoryStorage(), 'k'), /only change in a browser/);
  assert.equal(knobs.control('hero.badge'), 1);
});

test('reset restores the default in the controls file, even over a file value', t => {
  inBrowser(t);
  const storage = memoryStorage();
  const knobs = defineControls(schema(), { 'hero.title': 'File' });
  knobs.attach(storage, 'k');
  knobs.reset(['hero.title']);
  assert.equal(knobs.control('hero.title'), 'The original headline');
  const again = defineControls(schema(), { 'hero.title': 'File' });
  again.attach(storage, 'k');
  assert.equal(again.control('hero.title'), 'The original headline');
});

test('reset with no argument restores everything', t => {
  inBrowser(t);
  const knobs = defineControls(schema());
  knobs.set('hero.overlay', 0.9);
  knobs.set('product.price', 50);
  knobs.reset();
  assert.deepEqual(knobs.changed(), {});
});

test('changed lists only values that differ from the defaults', t => {
  inBrowser(t);
  const knobs = defineControls(schema(), { 'hero.title': 'File' });
  knobs.set('hero.overlay', 0.9);
  knobs.set('hero.badge', 1);
  assert.deepEqual(knobs.changed(), { 'hero.title': 'File', 'hero.overlay': 0.9 });
});

test('storage holds only what differs from the file, so a later file edit shows', t => {
  inBrowser(t);
  const storage = memoryStorage();
  const knobs = defineControls(schema(), { 'hero.title': 'File' });
  knobs.attach(storage, 'k');
  knobs.set('hero.overlay', 0.9);
  knobs.set('hero.title', 'File');
  assert.deepEqual(JSON.parse(storage.map.get('k')), { 'hero.overlay': 0.9 });
  const edited = defineControls(schema(), { 'hero.title': 'Edited file' });
  edited.attach(storage, 'k');
  assert.equal(edited.control('hero.title'), 'Edited file');
});

test('a saved value equal to the file value is pruned on attach', t => {
  inBrowser(t);
  const storage = memoryStorage({ k: JSON.stringify({ 'hero.title': 'File' }) });
  defineControls(schema(), { 'hero.title': 'File' }).attach(storage, 'k');
  assert.deepEqual(JSON.parse(storage.map.get('k')), {});
});
