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

// A statement keyword at `i`, not the word as a prefix of a longer name.
const STATEMENT = new Set(['import', 'export', 'const', 'let', 'var', 'function', 'class', 'if', 'for', 'while', 'return', 'throw', 'try', 'switch', 'do', 'else']);

function isIdentStart(ch) {
  return ch !== undefined && /[A-Za-z_$]/.test(ch);
}

function isIdentChar(ch) {
  return ch !== undefined && /[A-Za-z0-9_$]/.test(ch);
}

function keywordAt(code, i, word) {
  if (!code.startsWith(word, i)) return false;
  if (isIdentChar(code[i - 1]) || isIdentChar(code[i + word.length])) return false;
  return true;
}

function skipSpaces(code, i) {
  while (code[i] === ' ' || code[i] === '\t') i++;
  return i;
}

function skipWhitespace(code, i) {
  while (code[i] === ' ' || code[i] === '\t' || code[i] === '\n') i++;
  return i;
}

function readWord(code, i) {
  let j = i + 1;
  while (isIdentChar(code[j])) j++;
  return code.slice(i, j);
}

function nextLine(code, i) {
  const nl = code.indexOf('\n', i);
  return nl === -1 ? code.length : nl + 1;
}

// Comments, string contents and template contents become spaces, so a match
// never sees them. Quote marks stay, and the specifier text is read from
// the original at the same index. `${…}` is code again.
function maskNonCode(text) {
  let out = '';
  let i = 0;
  let mode = 'code';
  const exprDepth = [];
  const blank = () => { out += text[i] === '\n' ? '\n' : ' '; i++; };
  const keep = () => { out += text[i]; i++; };
  while (i < text.length) {
    const c = text[i];
    const n = text[i + 1];
    if (mode === 'line') {
      if (c === '\n') { keep(); mode = 'code'; } else blank();
      continue;
    }
    if (mode === 'block') {
      if (c === '*' && n === '/') { blank(); blank(); mode = 'code'; continue; }
      blank();
      continue;
    }
    if (mode === 's' || mode === 'd') {
      const q = mode === 's' ? "'" : '"';
      if (c === '\\') { blank(); if (i < text.length) blank(); continue; }
      if (c === q) { keep(); mode = 'code'; continue; }
      blank();
      continue;
    }
    if (mode === 't') {
      if (c === '\\') { blank(); if (i < text.length) blank(); continue; }
      if (c === '`') { keep(); mode = 'code'; continue; }
      if (c === '$' && n === '{') { blank(); blank(); mode = 'code'; exprDepth.push(0); continue; }
      blank();
      continue;
    }
    if (exprDepth.length && c === '{') { exprDepth[exprDepth.length - 1]++; keep(); continue; }
    if (exprDepth.length && c === '}') {
      if (exprDepth[exprDepth.length - 1] === 0) { exprDepth.pop(); blank(); mode = 't'; continue; }
      exprDepth[exprDepth.length - 1]--;
      keep();
      continue;
    }
    if (c === '/' && n === '/') { blank(); blank(); mode = 'line'; continue; }
    if (c === '/' && n === '*') { blank(); blank(); mode = 'block'; continue; }
    if (c === "'") { keep(); mode = 's'; continue; }
    if (c === '"') { keep(); mode = 'd'; continue; }
    if (c === '`') { keep(); mode = 't'; continue; }
    keep();
  }
  return out;
}

function readQuoted(text, i) {
  const q = text[i];
  if (q !== "'" && q !== '"') return null;
  let j = i + 1;
  let value = '';
  while (j < text.length && text[j] !== q && text[j] !== '\n') {
    if (text[j] === '\\' && j + 1 < text.length) { value += text[j + 1]; j += 2; continue; }
    value += text[j];
    j++;
  }
  if (text[j] !== q) return null;
  return { value, end: j + 1 };
}

// A static import, or null when the line only starts with the word.
// The statement ends at its specifier or at `;`, and never takes the next one.
function readStaticImport(code, text, i) {
  const after = i + 'import'.length;
  const k = skipWhitespace(code, after);
  const ch = code[k];
  if (ch === undefined || ch === '(' || ch === '.' || ch === ';') return { item: null, end: after };
  if (ch === "'" || ch === '"') {
    const spec = readQuoted(text, k);
    if (!spec) throw new Error('import has no specifier');
    let end = spec.end;
    if (code[end] === ';') end++;
    return { item: { specifier: spec.value, names: [] }, end };
  }
  if (ch !== '{' && ch !== '*' && !isIdentStart(ch)) return { item: null, end: after };
  let depth = 0;
  let sawBinding = false;
  let j = after;
  while (j < code.length) {
    const c = code[j];
    if (c === '{') { depth++; sawBinding = true; j++; continue; }
    if (c === '}') { depth = Math.max(0, depth - 1); j++; continue; }
    if (depth === 0 && c === '*') { sawBinding = true; j++; continue; }
    if (depth === 0 && isIdentStart(c)) {
      const word = readWord(code, j);
      if (word === 'from') {
        const spec = readQuoted(text, skipWhitespace(code, j + 4));
        if (!spec) throw new Error('import has no specifier');
        let end = spec.end;
        if (code[end] === ';') end++;
        const clause = code.slice(after, j);
        return { item: { specifier: spec.value, names: bindingNames(clause, { defaultBinding: true }) }, end };
      }
      sawBinding = true;
      j += word.length;
      continue;
    }
    if (depth === 0 && (c === ';' || c === '\n')) {
      const stops = c === ';' || statementAt(code, skipWhitespace(code, j + 1));
      if (stops) {
        if (sawBinding) throw new Error('import has no specifier');
        return { item: null, end: c === ';' ? j + 1 : after };
      }
    }
    j++;
  }
  if (sawBinding) throw new Error('import has no specifier');
  return { item: null, end: after };
}

function statementAt(code, i) {
  if (i >= code.length) return true;
  for (const word of STATEMENT) if (keywordAt(code, i, word)) return true;
  return false;
}

// `export { … } from` and `export * from` only. A local `export { … };`
// ends at `;` and contributes nothing.
function readReexport(code, text, i) {
  const k = skipWhitespace(code, i + 'export'.length);
  if (code[k] === '*') return readExportStar(code, text, k);
  if (code[k] === '{') return readExportList(code, text, k);
  return null;
}

function readExportStar(code, text, starAt) {
  let k = skipWhitespace(code, starAt + 1);
  if (keywordAt(code, k, 'as')) {
    k = skipWhitespace(code, k + 2);
    while (isIdentChar(code[k])) k++;
    k = skipWhitespace(code, k);
  }
  if (!keywordAt(code, k, 'from')) return { item: null, end: starAt + 1 };
  const spec = readQuoted(text, skipWhitespace(code, k + 4));
  if (!spec) return { item: null, end: starAt + 1 };
  let end = spec.end;
  if (code[end] === ';') end++;
  return { item: { specifier: spec.value, names: [] }, end };
}

function readExportList(code, text, braceAt) {
  let depth = 0;
  let close = -1;
  for (let j = braceAt; j < code.length; j++) {
    if (code[j] === '{') depth++;
    else if (code[j] === '}') {
      depth--;
      if (depth === 0) { close = j; break; }
    }
  }
  if (close === -1) return { item: null, end: code.length };
  const after = skipWhitespace(code, close + 1);
  if (keywordAt(code, after, 'from')) {
    const spec = readQuoted(text, skipWhitespace(code, after + 4));
    if (spec) {
      let end = spec.end;
      if (code[end] === ';') end++;
      return { item: { specifier: spec.value, names: bindingNames(code.slice(braceAt, close + 1)) }, end };
    }
  }
  let end = close + 1;
  while (code[end] === ' ' || code[end] === '\t') end++;
  if (code[end] === ';') end++;
  return { item: null, end };
}

// Static imports whose statement starts with `import`, then `export … from`,
// then dynamic `import(…)`. Comments, strings and template text are not code,
// and each statement ends at its own specifier or `;`.
export function imports(text) {
  const code = maskNonCode(text);
  const statics = [];
  const reexports = [];
  let i = 0;
  while (i < code.length) {
    const line = i === 0 || code[i - 1] === '\n';
    if (!line) { i++; continue; }
    const j = skipSpaces(code, i);
    if (keywordAt(code, j, 'import')) {
      const read = readStaticImport(code, text, j);
      if (read.item) statics.push(read.item);
      i = nextLine(code, read.end);
      continue;
    }
    if (keywordAt(code, j, 'export')) {
      const read = readReexport(code, text, j);
      if (read) {
        if (read.item) reexports.push(read.item);
        i = nextLine(code, read.end);
        continue;
      }
    }
    i = nextLine(code, i);
  }
  const dynamic = [];
  for (const match of text.matchAll(/\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g)) {
    if (code[match.index] !== 'i') continue;
    dynamic.push({ specifier: match[2], names: [] });
  }
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
