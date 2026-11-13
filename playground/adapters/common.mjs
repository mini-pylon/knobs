// What every capture adapter shares: where a checkout stands in git, the
// check of a value set against the groups, and the capture.json it builds.
// Adapters only read their checkout: git runs without optional locks, so
// even `status` leaves the index alone.
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { normalize } from '../../src/store.js';

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

// One value set: { about, values, dropped? }, dropped only when something was.
export function valueSet(groups, about, values, dropped = []) {
  const checked = checkValues(groups, values);
  const all = [...dropped, ...checked.dropped];
  return { about, values: checked.values, ...(all.length ? { dropped: all } : {}) };
}

// capture.json, without shots: capture.mjs adds them when the dev server is up.
export async function build(adapter, checkout, { now = new Date(), ...options } = {}) {
  const { groups, valueSets, untranslated } = await adapter.read(checkout, options);
  return { source: source(adapter.name, checkout), capturedAt: now.toISOString(), groups, valueSets, untranslated, shots: [] };
}
