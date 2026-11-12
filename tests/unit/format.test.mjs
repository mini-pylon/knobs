import test from 'node:test';
import assert from 'node:assert/strict';
import { formatNumber } from '../../src/store.js';

test('a stored bound finer than the step is shown unchanged', () => {
  assert.equal(formatNumber(1, 0.25), '0.25');
  assert.equal(formatNumber(1, 0.75), '0.75');
});

test('step decimals stay when they do not change the stored number', () => {
  assert.equal(formatNumber(0.01, 0.4), '0.40');
  assert.equal(formatNumber(0.5, 1), '1.0');
  assert.equal(formatNumber(1, 2), '2');
});

test('a step finer than toFixed can show is the stored number', () => {
  assert.equal(formatNumber(1e-101, 3e-101), String(3e-101));
});
