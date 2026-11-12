import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const path = name => fileURLToPath(new URL(`../../${name}`, import.meta.url));

test('the declarations exist', () => {
  for (const name of ['types/index.d.ts', 'types/react.d.ts', 'types/vite.d.ts']) assert.ok(readFileSync(path(name), 'utf8').length > 0, name);
});

test('a TypeScript consumer compiles and its expected errors are errors', () => {
  const tsc = path('node_modules/typescript/bin/tsc');
  const result = spawnSync(process.execPath, [tsc, '-p', path('tests/types/tsconfig.json')], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
