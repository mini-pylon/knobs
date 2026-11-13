import test from 'node:test';
import assert from 'node:assert/strict';
import { defineControls } from '../../src/store.js';
import { randomSchema } from '../../playground/random.js';

const SEEDS = Array.from({ length: 500 }, (_, i) => i + 1);

test('a seed always gives the same schema', () => {
  for (const seed of [1, 42, 9999]) assert.deepEqual(randomSchema(seed), randomSchema(seed));
  assert.notDeepEqual(randomSchema(1), randomSchema(2));
});

test('every seed gives a schema the store accepts', () => {
  for (const seed of SEEDS) {
    assert.doesNotThrow(() => defineControls(randomSchema(seed)), `seed ${seed}`);
  }
});

test('every seed has at least one visible group with a control', () => {
  for (const seed of SEEDS) {
    const groups = randomSchema(seed);
    assert.ok(groups.some(g => !g.hidden && g.controls.length > 0), `seed ${seed}`);
  }
});

test('the seeds cover every control type and the edge cases the drawer must lay out', () => {
  const all = SEEDS.flatMap(seed => randomSchema(seed));
  const controls = all.flatMap(g => g.controls);
  for (const type of ['number', 'select', 'text', 'toggle', 'color']) {
    assert.ok(controls.some(c => c.type === type), `type ${type}`);
  }
  const seen = {
    'a hidden group': all.some(g => g.hidden),
    'a group with no controls': all.some(g => g.controls.length === 0),
    'a group with no about': all.some(g => g.about === undefined),
    'a long group name': all.some(g => g.name.length > 20),
    'a long control key': controls.some(c => c.key.length > 24),
    'a long about': controls.some(c => (c.about ?? '').length > 120),
    'an empty text default': controls.some(c => c.type === 'text' && c.value === ''),
    'a long text default': controls.some(c => c.type === 'text' && c.value.length > 200),
    'a select with one option': controls.some(c => c.type === 'select' && c.options.length === 1),
    'a select with many options': controls.some(c => c.type === 'select' && c.options.length >= 12),
    'a number with min equal to max': controls.some(c => c.type === 'number' && c.min === c.max),
    'a negative range': controls.some(c => c.type === 'number' && c.max < 0),
    'a huge range': controls.some(c => c.type === 'number' && c.max - c.min >= 100000),
    'a fine step': controls.some(c => c.type === 'number' && c.step <= 0.001),
  };
  for (const [name, ok] of Object.entries(seen)) assert.ok(ok, name);
});

test('the groups option sets how many groups there are', () => {
  for (const seed of SEEDS.slice(0, 50)) {
    const groups = randomSchema(seed, { groups: 2 });
    assert.equal(groups.length, 2, `seed ${seed}`);
  }
});

test('number bounds carry no float noise', () => {
  const noisy = n => String(n).replace(/^-/, '').split('.')[1]?.length > 6;
  for (const seed of SEEDS) {
    for (const c of randomSchema(seed).flatMap(g => g.controls).filter(c => c.type === 'number')) {
      for (const field of ['min', 'max', 'step', 'value']) assert.ok(!noisy(c[field]), `seed ${seed} ${c.key}.${field} = ${c[field]}`);
    }
  }
});
