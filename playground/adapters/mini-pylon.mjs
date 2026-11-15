// mini-pylon's tweak drawer, from its checkout. The schema is
// tools/scene_params.py: schema() returns { groups, presets }, each group's
// `vars` with `type` number, toggle, choice or color and a `default`.
// Python runs with -B so no bytecode lands in the checkout. Saved values are
// the presets and each final in renders/hyperreal/tweaks/*.json
// ({ name, values }), named by its file stem. The snapshot records what the
// tweak server would answer, by running that same Python.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
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

const SCHEMA = `
import sys, json
sys.path.insert(0, sys.argv[1])
import scene_params
print(json.dumps(scene_params.schema()))
`;

// The program goes in a temp file, never on the command line, so a failure
// names the step and Python's own stderr instead of the program text.
function runPython(program, args, { input, what, cwd, timeout = 120000 }) {
  const dir = mkdtempSync(join(tmpdir(), 'knobs-py-'));
  try {
    const file = join(dir, 'run.py');
    writeFileSync(file, program);
    try {
      return execFileSync('python3', ['-B', file, ...args], {
        cwd,
        encoding: 'utf8',
        input,
        timeout,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
      });
    } catch (error) {
      if (error.code === 'ETIMEDOUT') throw new Error(`mini-pylon: ${what}: timed out`);
      const lines = `${error.stderr ?? ''}`.trim().split(/\r?\n/).filter(line => line.trim() !== '').slice(-20);
      const why = error.code ? String(error.code)
        : error.status != null ? `exit ${error.status}`
        : error.signal ? `signal ${error.signal}`
        : error.message;
      throw new Error(`mini-pylon: ${what}: ${lines.join('\n') || why}`);
    }
  } finally {
    // Removing the temp program must not replace Python's result or its error.
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch (error) {
      console.error(`mini-pylon: could not remove ${dir}: ${error.message}`);
    }
  }
}

function pythonJson(text, what) {
  try {
    return JSON.parse(text);
  } catch {
    const first = `${text}`.split(/\r?\n/)[0] ?? '';
    throw new Error(`mini-pylon: ${what}: Python printed no JSON: ${first}`);
  }
}

function explain(error, place) {
  const message = `${error.message ?? error}`;
  if (message.startsWith('mini-pylon:')) return error;
  if (place && message.includes(place)) return new Error(`mini-pylon: ${message}`);
  return new Error(`mini-pylon: ${place}: ${message}`);
}

function control(v) {
  const type = v.type === 'choice' ? 'select' : v.type;
  const out = { key: v.key, type, value: v.default };
  if (type === 'number') Object.assign(out, { min: v.min, max: v.max, step: v.step });
  if (type === 'select') out.options = v.choices;
  if (v.about) out.about = v.about;
  return out;
}

export async function read(checkout, { timeout } = {}) {
  const text = runPython(SCHEMA, [join(checkout, 'tools')], { what: 'reading the schema', cwd: checkout, timeout });
  const schema = pythonJson(text, 'reading the schema');
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
    let final;
    try {
      final = JSON.parse(readFileSync(join(tweaks, file), 'utf8'));
    } catch (error) {
      throw new Error(`mini-pylon: renders/hyperreal/tweaks/${file}: ${error.message}`);
    }
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

function ask(checkout, payloads, what, timeout) {
  const text = runPython(PROGRAM, [join(checkout, 'tools'), join(checkout, 'renders', 'hyperreal', 'tweaks')], {
    input: JSON.stringify(payloads),
    what,
    cwd: checkout,
    timeout,
  });
  return pythonJson(text, what);
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
export async function record(checkout, sourceDir, { downscale, timeout } = {}) {
  const root = resolve(checkout);
  const learned = ask(root, [], 'reading what the server would answer', timeout);
  const built = swatchPayloads(learned.schema, learned.types);
  const recorded = ask(root, built.map(item => item.payload), 'recording the swatches', timeout);
  const preview = recorded.defaults['render.preview_size'];
  const written = [];
  const finals = recorded.finals.map(final => ({ ...final }));
  for (const final of finals) {
    if (!final.url) continue;
    if (!/^[\w.-]+\.png$/.test(final.file)) throw new Error(`mini-pylon: a final's file is not a plain PNG name: ${final.file}`);
    const png = readFileSync(join(root, 'renders', 'hyperreal', 'tweaks', final.file));
    const place = `renders/hyperreal/tweaks/${final.file}`;
    let size;
    try {
      size = pngSize(png);
    } catch (error) {
      throw explain(error, place);
    }
    let bytes = png;
    if (size.width > preview) {
      if (!downscale) throw new Error(`mini-pylon: ${final.file} is wider than ${preview} px and there is nothing to downscale it with`);
      try {
        bytes = await downscale(png, preview, place);
      } catch (error) {
        throw explain(error, place);
      }
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
