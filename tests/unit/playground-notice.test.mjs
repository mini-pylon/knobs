// The captures' licence notice and the playground README's account of the
// source side: the vendored source folders are not MIT, and the README says
// so, links the notice, and names what a reader needs to use the source side.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const read = path => readFileSync(join(repo, path), 'utf8');

test('the captures NOTICE says each source folder belongs to its project and is not under the MIT licence', () => {
  const notice = read('playground/captures/NOTICE.md');
  for (const words of ['wings-vdb/source/', 'mini-pylon/source/', 'All rights reserved', 'not covered', 'MIT', 'No font file']) assert.ok(notice.includes(words), `NOTICE says ${words}`);
});

test('the README\'s Captures section links the NOTICE and describes the source side', () => {
  const readme = read('playground/README.md');
  const captures = readme.slice(readme.indexOf('## Captures'));
  assert.ok(readme.includes('## Captures'));
  for (const words of ['](captures/NOTICE.md)', 'source/', 'side=source', 'sourceValues', 'vendored', 'KNOBS_WINGS_FONTS', 'npm run playground:check-fixtures', 'restart']) {
    assert.ok(captures.includes(words), `the Captures section names ${words}`);
  }
  // The knobs translation's drawer is named knobs-<project>.
  assert.match(readme, /knobs-<project>/);
  assert.doesNotMatch(readme, /titled with the exemplar's, draft's or capture's name/);
});
