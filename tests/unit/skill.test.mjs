// The agent skill shipped in skills/knobs: installable by `npx skills add`,
// and free of anything that only works on one machine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dir = join(root, 'skills', 'knobs');
const skillPath = join(dir, 'SKILL.md');
const exemplarsDir = join(dir, 'exemplars');

const words = text => text.split(/\s+/).filter(Boolean).length;

function exemplarFolders() {
  if (!existsSync(exemplarsDir)) return [];
  return readdirSync(exemplarsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

// Every text file the skill ships: SKILL.md, the templates, the step files
// and the exemplars. Screenshots are left out.
function skillFiles() {
  return readdirSync(dir, { recursive: true })
    .map((f) => join(dir, f))
    .filter((f) => statSync(f).isFile() && !f.endsWith('.png'));
}

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
  const files = skillFiles();
  assert.ok(files.includes(skillPath), 'the scan reads SKILL.md');
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    assert.doesNotMatch(text, /\/home\/|~\/linda|\bJosh\b|wings-home|git-branch|git-commit|file-issue|sharing-dev-servers/, f);
    assert.doesNotMatch(text, /wings-vdb|mini-pylon\/tools|cloud|bird/i, f);
  }
});

test('the skill installs the package from $KNOBS_DIR or a tagged GitHub release', () => {
  const text = readFileSync(skillPath, 'utf8');
  assert.match(text, /file:\$KNOBS_DIR/);
  assert.match(text, /github:mini-pylon\/knobs#semver:\^0\.1\.0/);
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.version, '0.1.0', 'the semver range in the skill matches the package version');
});

test('each exemplar README is at most 250 words', () => {
  for (const name of exemplarFolders()) {
    const text = readFileSync(join(exemplarsDir, name, 'README.md'), 'utf8');
    assert.ok(words(text) <= 250, `${name}/README.md has ${words(text)} words`);
  }
});
