// What every capture adapter shares: where a checkout stands in git, the
// check of a value set against the groups, the capture.json it builds, and
// the snapshot of the project's own page. Adapters only read their checkout:
// git runs without optional locks, so even `status` leaves the index alone.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { normalize } from '../../src/store.js';

// The knobs checkout. A snapshot imports its stubs from here.
export const repo = fileURLToPath(new URL('../..', import.meta.url));

// The checkout's branch, commit and dirty flag. Null for each only when the
// folder is outside git, or sits inside some other repository. A git call
// that times out or fails for any other reason is thrown, naming the project
// and the call, so a capture does not record a failure as "no repository".
export function source(repo, dir, { timeout = 120000 } = {}) {
  const git = (...args) => {
    try {
      return execFileSync('git', ['--no-optional-locks', '-C', dir, ...args], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout,
      }).trim();
    } catch (error) {
      const stderr = `${error.stderr ?? ''}`.trim();
      if (error.status === 128 && stderr.includes('not a git repository')) {
        const outside = new Error('not a git repository');
        outside.notRepo = true;
        throw outside;
      }
      const why = error.code === 'ETIMEDOUT' ? 'timed out' : (stderr || error.message);
      throw new Error(`${repo}: git ${args.join(' ')}: ${why}`);
    }
  };
  try {
    if (realpathSync(git('rev-parse', '--show-toplevel')) !== realpathSync(dir)) return { repo, branch: null, commit: null, dirty: null };
    return { repo, branch: git('rev-parse', '--abbrev-ref', 'HEAD'), commit: git('rev-parse', 'HEAD'), dirty: git('status', '--porcelain') !== '' };
  } catch (error) {
    if (error.notRepo) return { repo, branch: null, commit: null, dirty: null };
    throw error;
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

// parseDiagnostics is assigned by the parser and is absent from the public typings (typescript 5.9.3).
function refuseParseDiagnostics(sourceFile) {
  const diagnostics = sourceFile.parseDiagnostics;
  if (!diagnostics || diagnostics.length === 0) return;
  const diagnostic = diagnostics[0];
  const line = sourceFile.getLineAndCharacterOfPosition(diagnostic.start).line + 1;
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ');
  throw new Error(`line ${line}: ${message}`);
}

function importedNames(node) {
  const clause = node.importClause;
  if (!clause) return [];
  const names = [];
  if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
    for (const element of clause.namedBindings.elements) names.push((element.propertyName ?? element.name).text);
  }
  if (clause.name) names.push('default');
  return names;
}

function reexportedNames(node) {
  const clause = node.exportClause;
  if (!clause || !ts.isNamedExports(clause)) return [];
  return clause.elements.map(element => (element.propertyName ?? element.name).text);
}

function dynamicImports(sourceFile) {
  const found = [];
  const visit = node => {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const specifier = node.arguments[0];
      if (specifier && (ts.isStringLiteral(specifier) || ts.isNoSubstitutionTemplateLiteral(specifier))) {
        found.push({ specifier: specifier.text, names: [] });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

export function imports(text) {
  const sourceFile = ts.createSourceFile('module.js', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  refuseParseDiagnostics(sourceFile);
  const statics = [];
  const reexports = [];
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      statics.push({ specifier: statement.moduleSpecifier.text, names: importedNames(statement) });
    } else if (ts.isExportDeclaration(statement) && statement.moduleSpecifier) {
      reexports.push({ specifier: statement.moduleSpecifier.text, names: reexportedNames(statement) });
    }
  }
  return [...statics, ...reexports, ...dynamicImports(sourceFile)];
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
    let found;
    try {
      found = imports(file.bytes.toString('utf8'));
    } catch (error) {
      throw new Error(`${name}: ${file.from}: ${error.message}`);
    }
    for (const { specifier, names } of found) {
      if (specifier.startsWith('/')) throw new Error(`${name}: ${file.from} imports ${specifier}, an absolute path; the fixture serves only relative imports`);
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
