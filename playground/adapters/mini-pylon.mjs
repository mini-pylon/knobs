// mini-pylon's tweak drawer, from its checkout. The schema is
// tools/scene_params.py: schema() returns { groups, presets }, each group's
// `vars` with `type` number, toggle, choice or color and a `default`.
// Python runs with -B so no bytecode lands in the checkout. Saved values are
// the presets and each final in renders/hyperreal/tweaks/*.json
// ({ name, values }), named by its file stem.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { valueSet } from './common.mjs';

export const name = 'mini-pylon';
export const defaultCheckout = join(homedir(), 'linda', 'repos', 'mini-pylon');

export const dev = {
  url: 'http://127.0.0.1:5371/',
  chromiumArgs: [],
  open: page => page.keyboard.press('Backquote'),
  tabs: '.term-tabs .term-tab',
};

const SCHEMA = 'import sys, json; sys.path.insert(0, sys.argv[1]); import scene_params; print(json.dumps(scene_params.schema()))';

function control(v) {
  const type = v.type === 'choice' ? 'select' : v.type;
  const out = { key: v.key, type, value: v.default };
  if (type === 'number') Object.assign(out, { min: v.min, max: v.max, step: v.step });
  if (type === 'select') out.options = v.choices;
  if (v.about) out.about = v.about;
  return out;
}

export async function read(checkout) {
  const text = execFileSync('python3', ['-B', '-c', SCHEMA, join(checkout, 'tools')], {
    cwd: checkout, encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
  });
  const schema = JSON.parse(text);
  const groups = schema.groups.map(g => ({ name: g.name, ...(g.about ? { about: g.about } : {}), controls: g.vars.map(control) }));

  const valueSets = { defaults: valueSet(groups, 'the defaults in tools/scene_params.py', {}) };
  const add = (key, set) => {
    if (Object.hasOwn(valueSets, key)) throw new Error(`mini-pylon: two value sets named ${key}`);
    valueSets[key] = set;
  };
  for (const [key, preset] of Object.entries(schema.presets ?? {})) add(key, valueSet(groups, preset.about ?? `preset ${key}`, preset.values ?? {}));
  const tweaks = join(checkout, 'renders', 'hyperreal', 'tweaks');
  const files = existsSync(tweaks) ? readdirSync(tweaks).filter(f => f.endsWith('.json')).sort() : [];
  for (const file of files) {
    const final = JSON.parse(readFileSync(join(tweaks, file), 'utf8'));
    add(basename(file, '.json'), valueSet(groups, `final "${final.name}"`, final.values ?? {}));
  }

  const untranslated = [
    'the renders tab: a card for each final made with /render (tools/tweak/tweak.js)',
    '/render [1080|2160] [name]: queues a full-quality Blender final',
    'render (or r): renders a preview of every change at once',
    'the preview pane: the last Blender preview, beside the drawer',
  ];
  return { groups, valueSets, untranslated };
}
