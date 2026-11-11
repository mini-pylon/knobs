import test from 'node:test';
import assert from 'node:assert/strict';
import { storageCall } from '../../src/store.js';

test('removeItem that throws does not escape', () => {
  const storage = {
    removeItem() { throw new Error('blocked'); },
  };
  assert.equal(storageCall(storage, 'removeItem', 'k'), null);
});

test('removeItem deletes the key when storage allows it', () => {
  const map = new Map([['k', '1']]);
  const storage = { removeItem: key => map.delete(key) };
  storageCall(storage, 'removeItem', 'k');
  assert.equal(map.has('k'), false);
});

test('a blocked storage area reads and writes as nothing', () => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() { throw new Error('blocked'); },
  });
  try {
    assert.equal(storageCall('localStorage'), null);
    assert.equal(storageCall('localStorage', 'getItem', 'k'), null);
    assert.equal(storageCall('localStorage', 'setItem', 'k', 'v'), null);
    assert.equal(storageCall('localStorage', 'removeItem', 'k'), null);
  } finally {
    delete globalThis.localStorage;
  }
});
