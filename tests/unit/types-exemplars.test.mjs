import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const path = name => fileURLToPath(new URL(`../../${name}`, import.meta.url));

test('the exemplars type-check against the public types', () => {
  const tsc = path('node_modules/typescript/bin/tsc');
  const result = spawnSync(process.execPath, [tsc, '-p', path('tests/types/tsconfig.exemplars.json'), '--listFiles'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /skills\/knobs\/exemplars\/[\w-]+\/(visual|extension)\.js/, 'the check covers the exemplars');
});
