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

// A `## ` section of a markdown file, as its lines, or null.
function section(text, heading) {
  const lines = text.split('\n');
  const start = lines.indexOf(`## ${heading}`);
  if (start < 0) return null;
  const end = lines.findIndex((line, i) => i > start && line.startsWith('## '));
  return lines.slice(start + 1, end < 0 ? undefined : end);
}

// The text of numbered step n of SKILL.md, up to the next step or section.
function step(text, n) {
  const m = text.match(new RegExp(`^${n}\\. ([\\s\\S]*?)(?=^\\d+\\. |^## )`, 'm'));
  return m ? m[1].replace(/\s+/g, ' ').trim() : null;
}

test('SKILL.md is at most 1,000 words and names pictures.md and share.md, which exist', () => {
  const text = readFileSync(skillPath, 'utf8');
  assert.ok(words(text) <= 1000, `SKILL.md has ${words(text)} words`);
  for (const f of ['pictures.md', 'share.md']) {
    assert.ok(text.includes(f), `SKILL.md names ${f}`);
    assert.ok(existsSync(join(dir, f)), `${f} exists`);
  }
});

test('the description fires on pictures and drawer commands', () => {
  const fm = frontmatter(readFileSync(skillPath, 'utf8'));
  assert.match(fm.description, /or when a control group needs a picture or a drawer command/);
});

test('the exemplar index ends SKILL.md and names every exemplar folder and nothing else', () => {
  const text = readFileSync(skillPath, 'utf8');
  const lines = section(text, 'Exemplars');
  assert.ok(lines, 'SKILL.md has an ## Exemplars section');
  assert.equal([...text.matchAll(/^## (.+)$/gm)].pop()[1], 'Exemplars', 'the index is the last section');
  const entries = lines.filter((line) => line.startsWith('- ')).map((line) => {
    const m = line.match(/^- `([\w-]+)` \((picture|extension)\): (.+)$/);
    assert.ok(m, `an index line is "- \`name\` (kind): When sentence", not: ${line}`);
    return { name: m[1], kind: m[2], when: m[3] };
  });
  assert.deepEqual(entries.map((entry) => entry.name).sort(), exemplarFolders());
  for (const entry of entries) {
    const folder = join(exemplarsDir, entry.name);
    assert.equal(entry.kind, existsSync(join(folder, 'visual.js')) ? 'picture' : 'extension', `${entry.name} is listed as its kind`);
    const when = section(readFileSync(join(folder, 'README.md'), 'utf8'), 'When').join(' ').replace(/\s+/g, ' ').trim();
    assert.equal(entry.when, when, `${entry.name}: the index line is its README's When sentence`);
  }
});

test('the skill has the Pictures and Share steps and the two new Never lines', () => {
  const text = readFileSync(skillPath, 'utf8');
  assert.match(step(text, 8) ?? '', /^\*\*Pictures\.\*\* .*pictures\.md/);
  assert.match(step(text, 9) ?? '', /^\*\*Hand over\.\*\*/);
  assert.match(step(text, 12) ?? '', /^\*\*Decisions note\.\*\*/);
  assert.match(step(text, 13) ?? '', /^\*\*Share\.\*\* .*share\.md/);
  const never = (section(text, 'Never') ?? []).join(' ').replace(/\s+/g, ' ');
  assert.ok(never.includes('- Hand over a picture that has not been checked against its exemplar.'), 'Never: an unchecked picture');
  assert.ok(never.includes("- Send anything about the user's project anywhere without their yes."), 'Never: sending without a yes');
});

test('pictures.md and share.md carry the facts their steps rely on', () => {
  const pictures = readFileSync(join(dir, 'pictures.md'), 'utf8');
  assert.match(pictures, /761/, 'pictures.md names the narrowest width that shows pictures');
  assert.match(pictures, /\.agents\/skills\/knobs/, 'pictures.md warns about the installed copy');
  const share = readFileSync(join(dir, 'share.md'), 'utf8');
  assert.match(share, /https:\/\/github\.com\/mini-pylon\/knobs\/issues\/new\?template=exemplar\.yml/);
  assert.match(share, /6,000/, 'share.md caps the link length');
});
