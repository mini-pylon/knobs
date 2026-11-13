// The agent skill shipped in skills/knobs: installable by `npx skills add`,
// and free of anything that only works on one machine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dir = join(root, 'skills', 'knobs');
const skillPath = join(dir, 'SKILL.md');

function frontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(m, 'SKILL.md starts with a --- frontmatter block');
  return Object.fromEntries(
    m[1].split('\n').map((line) => {
      const i = line.indexOf(':');
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
    }),
  );
}

test('the skill has a name matching its folder and a trigger description', () => {
  const fm = frontmatter(readFileSync(skillPath, 'utf8'));
  assert.equal(fm.name, 'knobs');
  assert.match(fm.description, /^Use when /);
  assert.ok(fm.description.length <= 1024, 'description fits the spec limit');
});

test('every template the skill names exists, and every template is named', () => {
  const text = readFileSync(skillPath, 'utf8');
  const named = [...text.matchAll(/templates\/([\w.-]+)/g)].map((m) => m[1]);
  assert.ok(named.length > 0, 'the skill names its templates');
  for (const f of named) assert.ok(existsSync(join(dir, 'templates', f)), `templates/${f} exists`);
  for (const f of readdirSync(join(dir, 'templates'))) assert.ok(named.includes(f), `templates/${f} is named in SKILL.md`);
});

test('nothing in the skill depends on one machine or one person', () => {
  const files = [skillPath, ...readdirSync(join(dir, 'templates')).map((f) => join(dir, 'templates', f))];
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    assert.doesNotMatch(text, /\/home\/|~\/linda|\bJosh\b|wings-home|git-branch|git-commit|file-issue|sharing-dev-servers/, f);
  }
});

test('the skill installs the package from $KNOBS_DIR or a tagged GitHub release', () => {
  const text = readFileSync(skillPath, 'utf8');
  assert.match(text, /file:\$KNOBS_DIR/);
  assert.match(text, /github:mini-pylon\/knobs#semver:\^0\.1\.0/);
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.version, '0.1.0', 'the semver range in the skill matches the package version');
});
