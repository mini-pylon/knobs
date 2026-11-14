// mini-pylon's tweak drawer, from its checkout. The schema is
// tools/scene_params.py: schema() returns { groups, presets }, each group's
// `vars` with `type` number, toggle, choice or color and a `default`.
// Python runs with -B so no bytecode lands in the checkout. Saved values are
// the presets and each final in renders/hyperreal/tweaks/*.json
// ({ name, values }), named by its file stem. The snapshot records what the
// tweak server would answer, by running that same Python.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { valueSet } from './common.mjs';
import { pngSize } from '../png.mjs';

export const name = 'mini-pylon';
export const defaultCheckout = join(homedir(), 'linda', 'repos', 'mini-pylon');

export const dev = {
  url: 'http://127.0.0.1:5371/',
  chromiumArgs: [],
  open: page => page.keyboard.press('Backquote'),
  tabs: '.term-tabs .term-tab',
};

// Where a captured final's picture is served from.
export const RENDERS_URL = '/captures/mini-pylon/source/renders/';

// The tweak page, at the source root. tweak.js is a classic script: no imports.
export const vendor = [
  { from: 'tools/tweak/index.html', to: 'index.html' },
  { from: 'tools/tweak/tweak.js', to: 'tweak.js' },
  { from: 'tools/tweak/tweak.css', to: 'tweak.css' },
];

export const stubs = [];

// Read, never copied. A missing one fails the snapshot before it writes.
export const inputs = ['tools/tweak_server.py', 'tools/scene_params.py', 'renders/hyperreal/tweaks'];

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

  const valueSets = { defaults: valueSet(groups, 'the defaults in tools/scene_params.py', {}, [], {}) };
  const add = (key, set) => {
    if (Object.hasOwn(valueSets, key)) throw new Error(`mini-pylon: two value sets named ${key}`);
    valueSets[key] = set;
  };
  for (const [key, preset] of Object.entries(schema.presets ?? {})) add(key, valueSet(groups, preset.about ?? `preset ${key}`, preset.values ?? {}, [], preset.values ?? {}));
  const tweaks = join(checkout, 'renders', 'hyperreal', 'tweaks');
  const files = existsSync(tweaks) ? readdirSync(tweaks).filter(f => f.endsWith('.json')).sort() : [];
  for (const file of files) {
    const final = JSON.parse(readFileSync(join(tweaks, file), 'utf8'));
    add(basename(file, '.json'), valueSet(groups, `final "${final.name}"`, final.values ?? {}, [], final.values ?? {}));
  }

  const untranslated = [
    'the renders tab: a card for each final made with /render (tools/tweak/tweak.js)',
    '/render [1080|2160] [name]: queues a full-quality Blender final',
    'render (or r): renders a preview of every change at once',
    'the preview pane: the last Blender preview, beside the drawer',
  ];
  return { groups, valueSets, untranslated };
}

// schema(), the Python type of each bound, resolve({}, include_render=True),
// Renders.finals, and one swatch per payload text. Payloads arrive on stdin
// as a JSON array of the page's own texts. Nothing is written into the checkout.
const PROGRAM = `
import json, shutil, struct, sys, tempfile, zlib
from pathlib import Path

tools, tweaks = sys.argv[1], sys.argv[2]
sys.path.insert(0, tools)
import scene_params
import tweak_server

payloads = json.loads(sys.stdin.read() or "[]")

def bound_types(var):
    out = {"default": type(var["default"]).__name__}
    if var["type"] == "number":
        out["min"] = type(var["min"]).__name__
        out["max"] = type(var["max"]).__name__
    return out

def first_pixel(data):
    pos = 8
    idat = b""
    while pos + 8 <= len(data):
        length = struct.unpack(">I", data[pos:pos + 4])[0]
        kind = data[pos + 4:pos + 8]
        chunk = data[pos + 8:pos + 8 + length]
        pos += 12 + length
        if kind == b"IDAT":
            idat += chunk
        elif kind == b"IEND":
            break
    raw = zlib.decompress(idat)
    return list(raw[1:4])

types = {var["path"]: bound_types(var) for var in scene_params.variables(True)}
holder = type("Holder", (), {})()
holder.finals_dir = Path(tweaks)
finals = tweak_server.Renders.finals(holder)

swatches = []
folder = tempfile.mkdtemp()
try:
    for text in payloads:
        payload = json.loads(text)
        resolved = scene_params.resolve(payload.get("values") or {}, True)
        scene = {key: value for key, value in resolved.items() if not key.startswith("render.")}
        size = min(int(resolved["render.preview_size"]), 256)
        png = Path(folder) / "swatch.png"
        tweak_server.write_swatch_png(png, size, scene)
        data = png.read_bytes()
        png.unlink()
        swatches.append({
            "payload": text,
            "values": json.dumps(scene, sort_keys=True),
            "rgb": first_pixel(data),
            "size": size,
        })
finally:
    shutil.rmtree(folder)

print(json.dumps({
    "schema": scene_params.schema(),
    "types": types,
    "defaults": scene_params.resolve({}, True),
    "finals": finals,
    "swatches": swatches,
}))
`;

function ask(checkout, payloads) {
  const text = execFileSync('python3', ['-B', '-c', PROGRAM, join(checkout, 'tools'), join(checkout, 'renders', 'hyperreal', 'tweaks')], {
    cwd: checkout,
    encoding: 'utf8',
    input: JSON.stringify(payloads),
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
  });
  return JSON.parse(text);
}

// The four preview bodies the page would post: every default as JavaScript
// parsed it, then one change past a float bound, one past an int bound, and
// a lower-case colour with a toggle sent as true.
export function swatchPayloads(schema, types) {
  const vars = schema.groups.flatMap(group => group.vars.map(v => ({ ...v, path: `${group.name}.${v.key}` })));
  const values = Object.fromEntries(vars.map(v => [v.path, v.default]));
  const floatVar = vars.find(v => v.type === 'number' && types[v.path]?.max === 'float');
  const intVar = vars.find(v => v.type === 'number' && types[v.path]?.max === 'int');
  const colour = vars.find(v => v.type === 'color');
  const toggle = vars.find(v => v.type === 'toggle');
  if (!floatVar) throw new Error('mini-pylon: the schema has no float maximum');
  if (!intVar) throw new Error('mini-pylon: the schema has no int maximum');
  if (!colour) throw new Error('mini-pylon: the schema has no colour');
  if (!toggle) throw new Error('mini-pylon: the schema has no toggle');
  const body = (about, change) => ({ about, payload: JSON.stringify({ kind: 'preview', values: { ...values, ...change } }) });
  return [
    body('the defaults as the page sends them', {}),
    body(`${floatVar.path} past its float maximum`, { [floatVar.path]: floatVar.max + 1.25 }),
    body(`${intVar.path} past its int maximum by a non-integer`, { [intVar.path]: intVar.max + 5.5 }),
    body(`${colour.path} in lowercase and ${toggle.path} sent as true`, {
      [colour.path]: String(colour.default).toLowerCase(),
      [toggle.path]: true,
    }),
  ];
}

function writeJson(sourceDir, rel, value, written) {
  const dest = join(sourceDir, rel);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, `${JSON.stringify(value, null, 2)}\n`);
  written.push(rel);
}

// Run the checkout's own Python twice: once to learn the schema, then again
// with the payloads that schema's defaults produce. Finals wider than the
// preview size are downscaled; the rest are copied. Returns the paths written.
export async function record(checkout, sourceDir, { downscale } = {}) {
  const root = resolve(checkout);
  const learned = ask(root, []);
  const built = swatchPayloads(learned.schema, learned.types);
  const recorded = ask(root, built.map(item => item.payload));
  const preview = recorded.defaults['render.preview_size'];
  const written = [];
  const finals = recorded.finals.map(final => ({ ...final }));
  for (const final of finals) {
    if (!final.url) continue;
    if (!/^[\w.-]+\.png$/.test(final.file)) throw new Error(`mini-pylon: a final's file is not a plain PNG name: ${final.file}`);
    const png = readFileSync(join(root, 'renders', 'hyperreal', 'tweaks', final.file));
    let bytes = png;
    if (pngSize(png).width > preview) {
      if (!downscale) throw new Error(`mini-pylon: ${final.file} is wider than ${preview} px and there is nothing to downscale it with`);
      bytes = await downscale(png, preview);
    }
    const rel = `renders/${final.file}`;
    const dest = join(sourceDir, rel);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, bytes);
    written.push(rel);
    final.url = RENDERS_URL + final.file;
  }
  const swatches = built.map((item, i) => ({
    about: item.about,
    payload: recorded.swatches[i].payload,
    values: recorded.swatches[i].values,
    rgb: recorded.swatches[i].rgb,
    size: recorded.swatches[i].size,
  }));
  writeJson(sourceDir, 'data/schema.json', recorded.schema, written);
  writeJson(sourceDir, 'data/types.json', recorded.types, written);
  writeJson(sourceDir, 'data/defaults.json', recorded.defaults, written);
  writeJson(sourceDir, 'data/finals.json', finals, written);
  writeJson(sourceDir, 'data/swatch.json', swatches, written);
  return written;
}
