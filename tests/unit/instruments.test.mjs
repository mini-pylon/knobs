import test from 'node:test';
import assert from 'node:assert/strict';
import { fit, trace } from '../../src/instruments.js';

test('fit centres a rectangle in a panel, y up', () => {
  const map = fit([0, 10, 0, 10], 200, 0, 100);
  assert.equal(map.k, 10);
  assert.equal(map.x(0), 50);
  assert.equal(map.x(10), 150);
  assert.equal(map.y(10), 0);
  assert.equal(map.y(0), 100);
});

test('trace draws one line and breaks it at a gap', () => {
  const history = trace();
  for (const t of [0, 0.2, 0.4, 5, 5.2]) history.add(t, 0.5);
  const lines = [];
  history.draw({ plot: points => lines.push(points) }, 5.2, 300, 0, 100, 0);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].length, 3);
  assert.equal(lines[1].length, 2);
  assert.deepEqual(lines[1][1], [300, 50]);
});

test('trace ignores samples closer than a tenth of a second and forgets after 30 seconds', () => {
  const history = trace();
  history.add(0, 1);
  history.add(0.05, 1);
  history.add(0.2, 1);
  const lines = [];
  history.draw({ plot: points => lines.push(points) }, 0.2, 300, 0, 100, 0);
  assert.equal(lines[0].length, 2);
  history.add(31, 1);
  history.add(31.2, 1);
  lines.length = 0;
  history.draw({ plot: points => lines.push(points) }, 31.2, 300, 0, 100, 0);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].length, 2);
});
