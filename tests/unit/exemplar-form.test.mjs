// The issue form a user shares an exemplar through, and the link share.md
// tells the agent to build for it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const path = name => fileURLToPath(new URL(`../../${name}`, import.meta.url));

test('the exemplar form has the fixed fields in order and the exemplar label', () => {
  const form = readFileSync(path('.github/ISSUE_TEMPLATE/exemplar.yml'), 'utf8');
  assert.match(form, /^labels: \[exemplar\]$/m);
  const fields = form.split(/^ {2}- type: /m).slice(1).map(block => ({
    type: block.split('\n')[0].trim(),
    id: block.match(/^ {4}id: (\S+)$/m)?.[1],
    block,
  }));
  assert.deepEqual(fields.map(field => [field.id, field.type]), [
    ['kind', 'dropdown'],
    ['when', 'input'],
    ['good', 'textarea'],
    ['controls', 'textarea'],
    ['code', 'textarea'],
    ['screenshot', 'textarea'],
    ['license', 'checkboxes'],
  ]);
  const byId = Object.fromEntries(fields.map(field => [field.id, field.block]));
  assert.match(byId.kind, /- picture/);
  assert.match(byId.kind, /- extension/);
  assert.match(byId.good, /What makes it good/);
  assert.match(byId.controls, /render: js/);
  assert.match(byId.code, /render: js/);
  assert.match(byId.license, /This is my code and I can share it under the MIT license/);
  assert.match(byId.license, /required: true/);
});

test('share.md prefills the form by its text field ids', () => {
  const share = readFileSync(path('skills/knobs/share.md'), 'utf8');
  assert.match(share, /template=exemplar\.yml/);
  for (const id of ['when', 'good', 'controls', 'code']) assert.ok(share.includes(`\`${id}\``), `share.md names the ${id} field`);
});

test('the kind dropdown offers exactly picture and extension, and only the license tick is required', () => {
  const form = readFileSync(path('.github/ISSUE_TEMPLATE/exemplar.yml'), 'utf8');
  const kind = form.split(/^ {2}- type: /m).find(block => /^ {4}id: kind$/m.test(block));
  assert.deepEqual([...kind.matchAll(/^ {8}- (.+)$/gm)].map(m => m[1]), ['picture', 'extension']);
  assert.equal(form.match(/required: true/g)?.length, 1, 'one required setting in the form');
  assert.match(form, /^ {8}- label: This is my code and I can share it under the MIT license\n {10}required: true$/m, 'the license option is the required one');
});
