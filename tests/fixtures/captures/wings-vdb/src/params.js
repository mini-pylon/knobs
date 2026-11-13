// Control schema and live values. Values persist in localStorage so they
// survive reloads.
export const groups = [
  {
    name: 'dispersal',
    about: 'how the cloud breaks apart between shapes as you scroll',
    vars: [
      { key: 'preview', type: 'toggle', js: true, value: 1, min: 0, max: 1, step: 1, about: 'hold the current shape at full dispersal while this tab is open' },
      { key: 'expand', core: true, uniform: 'dExpand', value: 0, min: 0, max: 3, step: 0.01, about: 'how far the volume swells at the midpoint' },
      { key: 'curve', uniform: 'dCurve', value: 2, min: 0.25, max: 8, step: 0.05, about: 'burst falloff; low = disperses early and stays out, high = brief spike' },
      { key: 'drift', core: true, uniform: 'dDrift', value: 0, min: 0, max: 4, step: 0.01, about: 'noise displacement of the volume' },
      { key: 'driftScale', uniform: 'dDriftScale', value: 1.45, min: 0.1, max: 6, step: 0.01, about: 'drift noise frequency; high = finer, busier warping' },
      { key: 'driftSpeed', uniform: 'dDriftSpeed', value: 1, min: 0, max: 10, step: 0.05, about: 'how fast the drift field animates' },
      { key: 'fracture', core: true, uniform: 'dFracture', value: 0.31, min: 0, max: 2, step: 0.01, about: 'noise cut into the surface distance' },
      { key: 'fractureScale', uniform: 'dFractureScale', value: 3.1, min: 0.5, max: 12, step: 0.05, about: 'fracture noise frequency' },
      { key: 'fractureBias', uniform: 'dFractureBias', value: 0.4, min: 0, max: 1, step: 0.01, about: 'low = erodes more, high = grows more' },
      { key: 'fragments', core: true, uniform: 'dFragments', value: 0.08, min: 0, max: 1, step: 0.01, about: 'how much the volume splits into separate wisps' },
      { key: 'fragmentCut', uniform: 'dFragmentCut', value: 0.3, min: 0, max: 1, step: 0.01, about: 'wisp threshold; high = fewer, smaller wisps' },
      { key: 'fragmentSoft', uniform: 'dFragmentSoft', value: 0.38, min: 0, max: 1, step: 0.01, about: 'wisp edge softness' },
      { key: 'thinning', uniform: 'dThinning', value: 0.36, min: 0, max: 1, step: 0.01, about: 'density lost at the midpoint' },
      { key: 'swirl', uniform: 'dSwirl', value: 0, min: -4, max: 4, step: 0.01, about: 'twist around the view axis during dispersal' },
      { key: 'lift', uniform: 'dLift', value: 0, min: -2, max: 2, step: 0.01, about: 'vertical drift during dispersal (+ sinks, - rises)' },
    ],
  },
  {
    name: 'scroll',
    about: 'how scrolling moves through the shapes: the pace, the easing and the snap to each shape',
    vars: [
      { key: 'hang', core: true, js: true, value: 1.18, min: 0, max: 2, step: 0.05, about: 'screen heights of scroll each shape holds still before morphing (not the first)' },
      { key: 'morph', core: true, js: true, value: 1, min: 0.3, max: 3, step: 0.05, about: 'screen heights of scroll each morph between shapes takes; higher = a longer cross-fade' },
      { key: 'scrollEase', js: true, value: 9, min: 0.5, max: 40, step: 0.1, about: 'how quickly the cloud catches up to the scroll position' },
      { key: 'snap', type: 'toggle', js: true, value: 1, min: 0, max: 1, step: 1, about: 'when the scroll stops near a shape\'s centre, the page glides there' },
      { key: 'snapRange', js: true, value: 1.05, min: 0, max: 2, step: 0.05, about: 'screen heights either side of a shape\'s centre that snap to it' },
      { key: 'snapDelay', js: true, value: 0, min: 0, max: 2, step: 0.05, about: 'seconds the scroll must rest before it snaps' },
      { key: 'snapTime', js: true, value: 1.9, min: 0.1, max: 3, step: 0.05, about: 'seconds the glide to the centre takes' },
    ],
  },
  {
    name: 'presence',
    about: 'how the cloud looks at rest: density, texture, size',
    vars: [
      { key: 'density', core: true, uniform: 'cDensity', value: 8.6, min: 0.5, max: 20, step: 0.1, about: 'opacity of the volume; low = thin haze, high = solid' },
      { key: 'softness', core: true, uniform: 'cSoftness', value: 0.1, min: 0.01, max: 0.4, step: 0.005, about: 'edge falloff; low = crisp outline, high = blurry halo' },
      { key: 'puff', core: true, uniform: 'cPuff', value: 0.87, min: 0, max: 3, step: 0.01, about: 'how much noise bulges the surface; 0 = clean shape' },
      { key: 'scale', core: true, uniform: 'cScale', value: 0.97, min: 0.4, max: 2, step: 0.01, about: 'overall size of the shape' },
      { key: 'texture', uniform: 'cTexture', value: 5.9, min: 1, max: 20, step: 0.1, about: 'fine noise frequency; high = smaller, busier billows' },
      { key: 'lumps', uniform: 'cLumps', value: 2.8, min: 0.5, max: 8, step: 0.05, about: 'large noise frequency; low = big lobes, high = small lumps' },
      { key: 'contrast', uniform: 'cContrast', value: 0.7, min: 0, max: 1.5, step: 0.01, about: 'density variation inside the cloud; 0 = even fill' },
      { key: 'billow', uniform: 'cBillow', value: 0.53, min: 0, max: 5, step: 0.05, about: 'speed of the surface animation; 0 = frozen texture' },
    ],
  },
  {
    name: 'sunlight',
    about: 'where the light comes from and how it shades the cloud',
    vars: [
      { key: 'sunElevation', core: true, uniform: 'cSunEl', value: 44, min: -10, max: 90, step: 1, about: 'sun height above the horizon, degrees' },
      { key: 'sunAzimuth', core: true, uniform: 'cSunAz', value: -62, min: -180, max: 180, step: 1, about: 'sun direction around the cloud, degrees' },
      { key: 'light', core: true, uniform: 'cLight', value: 1.04, min: 0, max: 2, step: 0.01, about: 'brightness of the sunlit side' },
      { key: 'shade', core: true, uniform: 'cShade', value: 1, min: 0, max: 2, step: 0.01, about: 'brightness of the shadowed side' },
      { key: 'absorption', core: true, uniform: 'cAbsorb', value: 3.3, min: 0, max: 10, step: 0.05, about: 'how dark self-shadowing gets; 0 = flat, high = deep shadow' },
      { key: 'beams', core: true, js: true, value: 0.55, min: 0, max: 2, step: 0.01, about: 'sun beams streaming past the shapes, with shadow shafts behind them; 0 = none' },
      { key: 'beamLength', js: true, value: 0.49, min: 0.1, max: 1.2, step: 0.01, about: 'how far beams and shadow shafts reach, in screen heights' },
      { key: 'beamStreaks', js: true, value: 0.09, min: 0, max: 1, step: 0.01, about: 'how much the light splits into separate shafts; 0 = an even wash' },
    ],
  },
  {
    name: 'birds',
    about: 'flocks flying through the scene now and then',
    vars: [
      { key: 'birds', core: true, type: 'toggle', js: true, value: 0, min: 0, max: 1, step: 1, about: 'random flocks cross the scene; the flock command picks the kind or sends one now' },
      { key: 'often', core: true, js: true, value: 17.1, min: 0.5, max: 20, step: 0.5, about: 'flocks per minute, on average' },
      { key: 'size', js: true, value: 1, min: 0.4, max: 2.5, step: 0.05, about: 'bird size' },
      { key: 'count', js: true, value: 1, min: 0.3, max: 3, step: 0.05, about: 'birds per flock, as a multiple of the usual' },
      { key: 'speed', js: true, value: 1, min: 0.3, max: 2.5, step: 0.05, about: 'flying speed' },
    ],
  },
  {
    name: 'dive',
    about: 'clicking an object: its cloud frays into wisps that drift apart, then fades',
    vars: [
      { key: 'preview', type: 'toggle', js: true, value: 1, min: 0, max: 1, step: 1, about: 'hold the current object mid-dive, at hold, while this tab is open' },
      { key: 'hold', js: true, value: 0, min: 0, max: 1, step: 0.01, about: 'the point of the dive the object holds at while preview is on' },
      { key: 'drift', core: true, uniform: 'dvDrift', value: 0, min: 0, max: 4, step: 0.01, about: 'how far slow eddies carry the wisps apart, each region its own way, with no centre' },
      { key: 'driftScale', core: true, uniform: 'dvDriftScale', value: 0.35, min: 0.1, max: 3, step: 0.01, about: 'eddy size; low = broad masses drift as one, high = small wisps scatter' },
      { key: 'lift', uniform: 'dvLift', value: 0, min: -3, max: 3, step: 0.01, about: 'the wisps rise (+) or sink (-) on the way' },
      { key: 'reach', core: true, uniform: 'dvReach', value: 0, min: 0, max: 8, step: 0.05, about: 'push outward from the centre, so the object expands as it goes; 0 = none' },
      { key: 'fray', core: true, uniform: 'dvFray', value: 0.35, min: 0, max: 3, step: 0.01, about: 'turbulence that tears the shape into wisps' },
      { key: 'erode', core: true, uniform: 'dvErode', value: 0.18, min: 0, max: 2, step: 0.01, about: 'carves the material into thin sheets and filaments' },
      { key: 'wear', core: true, uniform: 'dvWear', value: 0.23, min: 0, max: 1.5, step: 0.01, about: 'erosion that grows toward the end, wearing the wisps away' },
      { key: 'fadeAt', uniform: 'dvFade', value: 0.06, min: 0, max: 0.98, step: 0.01, about: 'how far into the dive what is left starts to fade out' },
      { key: 'in', js: true, value: 1, min: 0.2, max: 6, step: 0.05, about: 'seconds to disperse after a click' },
      { key: 'out', js: true, value: 1.22, min: 0.2, max: 6, step: 0.05, about: 'seconds to gather back on Escape' },
      { key: 'link', type: 'toggle', js: true, value: 0, min: 0, max: 1, step: 1, about: 'in and out move together: changing one scales the other by the same ratio' },
    ],
  },
  {
    name: 'hover',
    about: 'the pointer over a clickable object: it fluffs up a little',
    vars: [
      { key: 'preview', type: 'toggle', js: true, value: 1, min: 0, max: 1, step: 1, about: 'hold the current object fluffed up, at hold, while this tab is open' },
      { key: 'hold', js: true, value: 0, min: 0, max: 1, step: 0.01, about: 'how fluffed up the object holds while preview is on' },
      { key: 'puff', core: true, uniform: 'hvPuff', value: 0, min: 0, max: 3, step: 0.01, about: 'extra billow on the surface' },
      { key: 'lumps', core: true, uniform: 'hvLumps', value: 0, min: 0, max: 3, step: 0.01, about: 'bigger lumps, cauliflower-like' },
      { key: 'swell', core: true, uniform: 'hvSwell', value: 0.033, min: 0, max: 0.3, step: 0.005, about: 'the surface grows outward, world units' },
      { key: 'soft', core: true, uniform: 'hvSoft', value: 0.23, min: 0, max: 2, step: 0.01, about: 'softer, wispier edges' },
      { key: 'grain', uniform: 'hvGrain', value: -0.33, min: -0.5, max: 1, step: 0.01, about: 'billow size on hover: - bigger, + finer' },
      { key: 'in', js: true, value: 0.5, min: 0.05, max: 3, step: 0.05, about: 'seconds to fluff up' },
      { key: 'out', js: true, value: 0.25, min: 0.05, max: 3, step: 0.05, about: 'seconds to settle back' },
      { key: 'link', type: 'toggle', js: true, value: 1, min: 0, max: 1, step: 1, about: 'in and out move together: changing one scales the other by the same ratio' },
      { key: 'displace', type: 'toggle', js: true, value: 0, min: 0, max: 1, step: 1, about: 'displace on hover: the cursor pushes the cloud material aside as it moves over it, anywhere on the shape' },
    ],
  },
  {
    name: 'opening',
    about: 'the first slide: the opening command picks sky, sky-full, block, planet or fog',
    vars: [
      { key: 'fullSize', core: true, js: true, value: 1.5, min: 0.8, max: 3, step: 0.01, about: 'sky-full: how much bigger each cloud is' },
      { key: 'fullSpread', core: true, js: true, value: 0.7, min: 0.3, max: 1.2, step: 0.01, about: 'sky-full: how far apart the clouds sit across the view; low = packed toward the middle' },
      { key: 'fullBottom', core: true, js: true, value: 0, min: -0.3, max: 0.4, step: 0.01, about: 'sky-full: where the lowest clouds sit, in screen heights above the bottom edge; 0 = straddling it' },
      { key: 'fullDepth', core: true, js: true, value: 0.45, min: 0, max: 1, step: 0.01, about: 'sky-full: how much depth they spread over; low = all near, little haze' },
      { key: 'fullHaze', core: true, js: true, value: 0.35, min: 0, max: 1, step: 0.01, about: 'sky-full: the low haze that pales clouds near the bottom, as a share of the sky\'s; 0 = none' },
      { key: 'blockSize', core: true, uniform: 'oBlockSize', value: 1, min: 0.6, max: 1.5, step: 0.01, about: 'block: size of the slab' },
      { key: 'rough', core: true, uniform: 'oRough', value: 0.6, min: 0, max: 2, step: 0.01, about: 'block: how uneven its faces are, like uncut stone' },
      { key: 'carve', core: true, uniform: 'oCarve', value: 0.6, min: 0, max: 2.5, step: 0.01, about: 'block: how deep the pointer carves, world units' },
      { key: 'carveHeal', uniform: 'oCarveHeal', value: 14, min: 1, max: 60, step: 0.5, about: 'block: seconds a carved groove takes to fill back in' },
      { key: 'planetSize', core: true, uniform: 'oPlanetR', value: 1.25, min: 0.6, max: 2.4, step: 0.01, about: 'planet: radius' },
      { key: 'bands', core: true, uniform: 'oBands', value: 0.8, min: 0, max: 2, step: 0.01, about: 'planet: how deep the weather bands cut' },
      { key: 'bandCount', uniform: 'oBandCount', value: 9, min: 2, max: 16, step: 1, about: 'planet: bands from pole to pole' },
      { key: 'spin', core: true, uniform: 'oSpin', value: 1, min: 0, max: 10, step: 0.1, about: 'planet: turns per minute' },
      { key: 'tilt', uniform: 'oTilt', value: 23, min: -60, max: 60, step: 1, about: 'planet: axial tilt, degrees' },
      { key: 'fogDepth', core: true, uniform: 'oFogDepth', value: 1.1, min: 0.3, max: 2.5, step: 0.01, about: 'fog: thickness of the wall (half), shape units' },
      { key: 'wipe', core: true, uniform: 'oWipe', value: 1, min: 0, max: 1, step: 0.01, about: 'fog: how cleanly the pointer wipes it; 1 = through to the sky' },
      { key: 'fogHeal', uniform: 'oFogHeal', value: 5, min: 0.5, max: 30, step: 0.5, about: 'fog: seconds a wiped patch takes to fog back over' },
      { key: 'brush', core: true, uniform: 'oBrush', value: 0.5, min: 0.15, max: 1.5, step: 0.01, about: 'block and fog: the pointer radius, world units' },
    ],
  },
];

const STORAGE = 'wings-vdb:params';
const listeners = new Set();
export const values = {};
export const byPath = new Map();

for (const group of groups) for (const v of group.vars) {
  v.path = `${group.name}.${v.key}`;
  v.group = group.name;
  v.default = v.value;
  byPath.set(v.path, v);
  values[v.path] = v.value;
}

// Old saved names -> current names ('cloud' became 'presence' and 'sunlight';
// the scroll pacing and snap left dispersal for their own group).
const SCROLL_MOVES = new Set(['hang', 'morph', 'scrollEase', 'snap', 'snapRange', 'snapDelay', 'snapTime']);
export function migratePath(path) {
  if (path.startsWith('dispersal.') && SCROLL_MOVES.has(path.slice(10))) return `scroll.${path.slice(10)}`;
  if (!path.startsWith('cloud.')) return path;
  const key = path.slice(6);
  return byPath.has(`sunlight.${key}`) ? `sunlight.${key}` : `presence.${key}`;
}
export const migrateGroup = name => name === 'cloud' ? 'presence' : name;
// A whole saved set of values in current names. Sets saved while the config
// group existed (any config.* key) used dive.preview and hover.preview for the
// held amount, now hold; the config toggles moved into their tabs.
const CONFIG_MOVES = { 'config.previewDispersal': 'dispersal.preview', 'config.previewDive': 'dive.preview', 'config.previewHover': 'hover.preview', 'config.hover': 'hover.displace' };
export function migrate(saved) {
  const old = Object.keys(saved).some(path => path.startsWith('config.'));
  const out = {};
  for (const [path, value] of Object.entries(saved)) {
    if (path.startsWith('config.') && !CONFIG_MOVES[path]) continue;
    const next = CONFIG_MOVES[path] ?? (old && (path === 'dive.preview' || path === 'hover.preview') ? path.replace('preview', 'hold') : migratePath(path));
    out[next] = value;
  }
  return out;
}

try {
  const saved = migrate(JSON.parse(localStorage.getItem(STORAGE) || '{}'));
  for (const [path, value] of Object.entries(saved)) {
    if (byPath.has(path) && Number.isFinite(value)) values[path] = value;
  }
} catch {}

function save() {
  try { localStorage.setItem(STORAGE, JSON.stringify(values)); } catch {}
}

export function clamp(v, value) {
  const n = Math.min(v.max, Math.max(v.min, value));
  const decimals = (String(v.step).split('.')[1] || '').length;
  return Number(n.toFixed(decimals));
}

export function set(path, value) {
  const v = byPath.get(path);
  if (!v || !Number.isFinite(value)) return false;
  const before = values[path];
  values[path] = clamp(v, value);
  // A group's link toggle ties its in and out: changing one scales the other
  // by the same ratio, so equal times stay equal.
  const other = v.key === 'in' ? 'out' : v.key === 'out' ? 'in' : null;
  const partner = other && values[`${v.group}.link`] === 1 ? byPath.get(`${v.group}.${other}`) : null;
  if (partner && before > 0) values[partner.path] = clamp(partner, values[partner.path] * values[path] / before);
  save();
  for (const fn of listeners) {
    fn(path, values[path]);
    if (partner) fn(partner.path, values[partner.path]);
  }
  return true;
}

export function reset(paths = [...byPath.keys()]) {
  for (const path of paths) set(path, byPath.get(path).default);
}

export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// Uniform name -> value, for the renderer.
export function uniforms() {
  const out = {};
  for (const v of byPath.values()) if (v.uniform) out[v.uniform] = values[v.path];
  return out;
}
