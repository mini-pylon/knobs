import test from 'node:test';
import assert from 'node:assert/strict';
import * as knobs from '../../src/index.js';

test('the main entry exports exactly the public names', () => {
  assert.deepEqual(Object.keys(knobs).sort(), ['canvasVisual', 'defineControls', 'fit', 'makePen', 'mountKnobs', 'pixels', 'trace']);
});

test('mountKnobs with no window is an error', () => {
  const store = knobs.defineControls([]);
  assert.throws(() => knobs.mountKnobs(store, { name: 'x' }), /needs a browser/);
});

test('mountKnobs needs a name', t => {
  globalThis.window = {};
  t.after(() => { delete globalThis.window; });
  assert.throws(() => knobs.mountKnobs(knobs.defineControls([]), {}), /needs a name/);
});
