import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

test('the package is private and an ES module', () => {
  assert.equal(pkg.name, 'knobs');
  assert.equal(pkg.private, true);
  assert.equal(pkg.type, 'module');
});

test('it has exactly the three entry points, each with types', () => {
  assert.deepEqual(Object.keys(pkg.exports).sort(), ['.', './react', './vite']);
  assert.deepEqual(pkg.exports['.'], { types: './types/index.d.ts', default: './src/index.js' });
  assert.deepEqual(pkg.exports['./react'], { types: './types/react.d.ts', default: './src/react.js' });
  assert.deepEqual(pkg.exports['./vite'], { types: './types/vite.d.ts', default: './src/vite.js' });
});

test('it has no runtime dependencies, and react and vite are optional peers', () => {
  assert.equal(pkg.dependencies, undefined);
  assert.deepEqual(Object.keys(pkg.peerDependencies).sort(), ['react', 'vite']);
  assert.deepEqual(pkg.peerDependenciesMeta, { react: { optional: true }, vite: { optional: true } });
});

test('it has no build step', () => {
  assert.equal(pkg.scripts.build, undefined);
  assert.equal(pkg.scripts.prepare, undefined);
  assert.deepEqual(pkg.files, ['src', 'types']);
});

test('the test tools are pinned exactly', () => {
  for (const name of ['vite', 'react', 'react-dom', 'playwright', 'typescript']) {
    assert.match(pkg.devDependencies[name], /^\d+\.\d+\.\d+$/, name);
  }
});
