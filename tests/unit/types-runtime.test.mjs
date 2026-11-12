import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const path = name => fileURLToPath(new URL(`../../${name}`, import.meta.url));

test('the declarations match what the runtime builds and calls', () => {
  const tsc = path('node_modules/typescript/bin/tsc');
  const result = spawnSync(process.execPath, [tsc, '-p', path('tests/types/tsconfig.runtime.json')], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
