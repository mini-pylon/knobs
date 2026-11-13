// wings-vdb's drawer, from its checkout. The schema is src/params.js
// (`groups`, each with `vars`; a var with no type is a number). Importing it
// is safe in node: its one localStorage read sits in a try. The tabs the
// drawer hides are HIDDEN_TABS in src/terminal.js. Saved values come from
// the browser reports in ~/.cache/wings-vdb/browsers/<id>.json, under the
// `wings-vdb:params` key of their storage, in old names that params.js
// migrates.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { valueSet } from './common.mjs';

export const name = 'wings-vdb';
export const defaultCheckout = join(homedir(), 'linda', 'repos', 'wings-vdb');
export const defaultReports = join(homedir(), '.cache', 'wings-vdb', 'browsers');

export const dev = {
  url: 'http://127.0.0.1:5350/',
  // Headless Chromium draws WebGL only on the GPU through Vulkan.
  chromiumArgs: ['--use-angle=vulkan', '--enable-features=Vulkan', '--ignore-gpu-blocklist', '--enable-gpu'],
  open: page => page.keyboard.press('Backquote'),
  tabs: '.term-tabs .term-tab',
};

function control(v) {
  const type = v.type ?? 'number';
  const out = { key: v.key, type, value: v.value };
  if (type === 'number') Object.assign(out, { min: v.min, max: v.max, step: v.step });
  if (type === 'select') out.options = v.options;
  if (v.about) out.about = v.about;
  return out;
}

// [name, about] for each command a drawer source lists, escapes undone.
function commands(text, pattern) {
  return [...text.matchAll(pattern)].map(m => [m[1], m[2]?.replace(/\\(.)/g, '$1') ?? '']);
}
const line = (name, about, tag = '') => `/${name}${tag}${about ? `: ${about}` : ''}`;

export async function read(checkout, { reports = defaultReports } = {}) {
  const params = await import(pathToFileURL(join(checkout, 'src', 'params.js')).href);
  const terminal = readFileSync(join(checkout, 'src', 'terminal.js'), 'utf8');
  const hiddenList = terminal.match(/HIDDEN_TABS = new Set\(\[([^\]]*)\]\)/)?.[1] ?? '';
  const hidden = new Set([...hiddenList.matchAll(/'(\w+)'/g)].map(m => m[1]));

  const groups = params.groups.map(g => ({
    name: g.name,
    ...(g.about ? { about: g.about } : {}),
    ...(hidden.has(g.name) ? { hidden: true } : {}),
    controls: g.vars.map(control),
  }));

  const valueSets = { defaults: valueSet(groups, 'the defaults in src/params.js', {}) };
  const files = existsSync(reports) ? readdirSync(reports).filter(f => f.endsWith('.json')).sort() : [];
  for (const file of files) {
    const report = JSON.parse(readFileSync(join(reports, file), 'utf8'));
    const saved = JSON.parse(report.storage?.['wings-vdb:params'] ?? '{}');
    // A name migrate() maps to nothing is retired.
    const retired = Object.keys(saved).filter(path => Object.keys(params.migrate({ [path]: saved[path] })).length === 0)
      .map(path => ({ path, value: saved[path], why: 'retired name' }));
    valueSets[basename(file, '.json')] = valueSet(groups, `browser report from ${report.at}`, params.migrate(saved), retired);
  }

  const main = readFileSync(join(checkout, 'src', 'main.js'), 'utf8');
  // An about written as a template literal is listed without it.
  const own = commands(main, /^\s+(\w+): \{ usage: (?:'[^']*'|`[^`]*`|[^,]+), about: (?:'((?:[^'\\]|\\.)*)'|`)/gm);
  // The drawer's built-ins, less any the project replaces with its own.
  const builtIn = commands(terminal, /\{ name: '(\w+)', usage: '[^']*', about: '((?:[^'\\]|\\.)*)'/g)
    .filter(([name]) => !own.some(([mine]) => mine === name));
  const untranslated = [
    'pictures: src/viz.js draws one per group beside its controls, from the live WebGL scene; knobs pictures are drawn from the store alone',
    'the perf page: frame rate and shader cost for each shape (src/perf.js); knobs has its own performance page',
    'wiring on each var: uniform (the shader uniform it feeds), js (read by page code) and core (one of the main controls); knobs controls carry no wiring',
    ...own.map(([name, about]) => line(name, about)),
    ...builtIn.map(([name, about]) => line(name, about, ' (built in)')),
  ];
  return { groups, valueSets, untranslated };
}
