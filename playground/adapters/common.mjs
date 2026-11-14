// What every capture adapter shares: where a checkout stands in git, the
// check of a value set against the groups, the capture.json it builds, and
// the snapshot of the project's own page. Adapters only read their checkout:
// git runs without optional locks, so even `status` leaves the index alone.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { normalize } from '../../src/store.js';

// The knobs checkout. A snapshot imports its stubs from here.
export const repo = fileURLToPath(new URL('../..', import.meta.url));

// The checkout's branch, commit and dirty flag; null for each outside git,
// or when the folder sits inside some other repository.
export function source(repo, dir) {
  const git = (...args) => execFileSync('git', ['--no-optional-locks', '-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  try {
    if (realpathSync(git('rev-parse', '--show-toplevel')) !== realpathSync(dir)) throw new Error('not its own repository');
    return { repo, branch: git('rev-parse', '--abbrev-ref', 'HEAD'), commit: git('rev-parse', 'HEAD'), dirty: git('status', '--porcelain') !== '' };
  } catch {
    return { repo, branch: null, commit: null, dirty: null };
  }
}

// A value map checked against knobs groups: values the store would take,
// normalized, and only where they differ from the default; everything else
// listed as dropped with why.
export function checkValues(groups, values) {
  const controls = new Map(groups.flatMap(g => g.controls.map(c => [`${g.name}.${c.key}`, c])));
  const out = { values: {}, dropped: [] };
  for (const [path, value] of Object.entries(values)) {
    const control = controls.get(path);
    if (!control) { out.dropped.push({ path, value, why: 'no such control' }); continue; }
    const checked = normalize(control, value);
    if (!checked.ok) { out.dropped.push({ path, value, why: 'invalid value' }); continue; }
    if (checked.value !== normalize(control, control.value).value) out.values[path] = checked.value;
  }
  return out;
}

// One value set: { about, values, sourceValues, dropped? }. sourceValues is
// the project's own form, unchecked; dropped only when something was.
export function valueSet(groups, about, values, dropped = [], sourceValues = values) {
  const checked = checkValues(groups, values);
  const all = [...dropped, ...checked.dropped];
  return { about, values: checked.values, sourceValues, ...(all.length ? { dropped: all } : {}) };
}

// capture.json, without shots: capture.mjs adds them when the dev server is up.
export async function build(adapter, checkout, { now = new Date(), ...options } = {}) {
  const { groups, valueSets, untranslated } = await adapter.read(checkout, options);
  return { source: source(adapter.name, checkout), capturedAt: now.toISOString(), groups, valueSets, untranslated, shots: [] };
}

// Names bound by an import or export clause: each name before `as`, then
// `default` when the clause has a default binding. A namespace binds nothing.
function bindingNames(clause, { defaultBinding = false } = {}) {
  const names = [];
  const brace = clause.match(/\{([\s\S]*)\}/);
  if (brace) {
    for (const part of brace[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0].trim();
      if (name) names.push(name);
    }
  }
  if (defaultBinding) {
    const head = clause.replace(/\{[\s\S]*\}/, '').replace(/,/g, ' ').trim();
    if (head && !head.startsWith('*')) names.push('default');
  }
  return names;
}

function readImport(chunk) {
  const side = chunk.match(/^[ \t]*import\s+(['"])([^'"]+)\1/);
  if (side) return { specifier: side[2], names: [] };
  const from = chunk.match(/\bfrom\s+(['"])([^'"]+)\1/);
  if (!from) throw new Error('import has no specifier');
  const clause = chunk.slice(chunk.indexOf('import') + 'import'.length, from.index);
  return { specifier: from[2], names: bindingNames(clause, { defaultBinding: true }) };
}

function readExport(chunk) {
  const from = chunk.match(/\bfrom\s+(['"])([^'"]+)\1/);
  if (!from) return null;
  if (/^[ \t]*export\s+\*/.test(chunk)) return { specifier: from[2], names: [] };
  const brace = chunk.match(/\{([\s\S]*)\}/);
  const clause = brace ? brace[1] : '';
  return { specifier: from[2], names: bindingNames(`{${clause}}`) };
}

// Static imports whose line starts with `import`, then `export … from`,
// then dynamic `import('…')`. A comment and `import.meta` are not imports.
export function imports(text) {
  const statics = [];
  const reexports = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^[ \t]*import\s/.test(line)) {
      let chunk = line;
      if (!/^[ \t]*import\s+['"]/.test(line)) {
        while (!/\bfrom\s+['"][^'"]+['"]/.test(chunk) && i + 1 < lines.length) chunk += `\n${lines[++i]}`;
      }
      statics.push(readImport(chunk));
      continue;
    }
    if (/^[ \t]*export\s+(\*|\{)/.test(line)) {
      let chunk = line;
      while (!/\bfrom\s+['"][^'"]+['"]/.test(chunk) && i + 1 < lines.length) chunk += `\n${lines[++i]}`;
      const read = readExport(chunk);
      if (read) reexports.push(read);
    }
  }
  const dynamic = [...text.matchAll(/\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g)].map(match => ({ specifier: match[2], names: [] }));
  return [...statics, ...reexports, ...dynamic];
}

// Copy adapter.vendor into sourceDir after checking every relative import.
// An adapter with no vendor list throws before anything is written.
export async function snapshot(adapter, checkout, sourceDir, { downscale } = {}) {
  const name = adapter.name;
  if (!adapter.vendor) throw new Error(`${name}: the adapter lists no files to vendor`);
  const stubs = adapter.stubs ?? [];
  for (const path of [...(adapter.inputs ?? []), ...adapter.vendor.map(file => file.from)]) {
    if (!existsSync(join(checkout, path))) throw new Error(`${name}: ${path} is missing from the checkout`);
  }
  const files = adapter.vendor.map(({ from, to }) => {
    const bytes = readFileSync(join(checkout, from));
    return { path: to, from, sha256: createHash('sha256').update(bytes).digest('hex'), bytes };
  });
  for (const file of files) {
    if (!file.from.endsWith('.js')) continue;
    for (const { specifier, names } of imports(file.bytes.toString('utf8'))) {
      if (!specifier.startsWith('.')) throw new Error(`${name}: ${file.from} imports ${specifier}, a package; the fixture serves no packages`);
      const resolved = posix.normalize(posix.join(posix.dirname(file.from), specifier));
      if (adapter.vendor.some(entry => entry.from === resolved)) continue;
      const stub = stubs.find(entry => entry.module === resolved);
      if (!stub) throw new Error(`${name}: ${file.from} imports ${specifier}, which is neither copied nor stubbed`);
      const mod = await import(pathToFileURL(join(repo, stub.by)).href);
      for (const imported of names) {
        if (!Object.hasOwn(mod, imported)) {
          throw new Error(`${name}: ${file.from} imports ${imported} from ${specifier}, which its stub ${stub.by} does not export`);
        }
      }
    }
  }
  for (const file of files) {
    const dest = join(sourceDir, file.path);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, file.bytes);
  }
  const recorded = adapter.record ? await adapter.record(checkout, sourceDir, { downscale }) : [];
  return {
    files: files.map(({ path, from, sha256 }) => ({ path, from, sha256 })),
    stubs: stubs.map(({ module, by }) => ({ module, by })),
    recorded,
  };
}
