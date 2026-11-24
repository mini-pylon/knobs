import './style.css';
import { mountCloudMorph } from './cloud-morph.js';
import { mountTerminal } from './terminal.js';
import { perfPage } from './perf.js';
import { paramVisuals } from './viz.js';
import * as params from './params.js';
import { vertexSource, fragmentSource, skyUniforms, skyLayout } from './shader.js';
import { postSource, textures, animatedTextures } from './post.js';
import { createFlocks, flockKinds } from './birds.js';
import { mountChatThread } from './chat.js';
import { details, renderDetail } from './detail.js';
import { reportSettings } from './dev-report.js';
import { flags, WAITLIST_URL } from './flags.js';

reportSettings();

const canvas = document.querySelector('#cloud');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
// Scroll order. id is the shader's shape id (0 wordmark, 1 loop, 2 agent,
// 3 portal, 5 machine, 6 kits; 4 is the sky, scattered fair-weather clouds, for the
// first slot only). Any order works, up to six slots, but the wordmark stays
// last. text is the footer's centre line for that object; pose its base yaw,
// pitch and roll (radians), around which each visit varies (rollSlot). hit,
// for the objects that open a detail view on click: the box the shape fills,
// [left, right, bottom, top] in world units at scale 1 (measured on screen).
const models = [
  { name: 'sky', id: 4, label: 'Wings', text: '' },
  { name: 'loop', id: 1, label: 'Wings Loupe', text: 'npx install wings/loupe', pose: [0.08, -0.06, 0.04], hit: [-1.6, 1.7, -1.85, 1.75] },
  { name: 'kits', id: 6, label: 'Wings Kits', text: 'wings kit add', pose: [-0.12, 0.05, -0.04], hit: [-1.95, 2, -1.65, 1.55] },
  { name: 'portal', id: 3, label: 'Wings Portal', text: 'wings portal here', pose: [0.05, -0.04, 0.02], hit: [-2.2, 1.65, -1.8, 1.55] },
  { name: 'machine', id: 5, label: 'Wings Machine', text: 'wings machine up', pose: [0.15, 0.04, 0.03], hit: [-2.15, 2.15, -1.7, 1.35] },
  { name: 'wings', id: 0, label: 'Wings', text: '', pose: [-0.06, 0.05, -0.02], spread: 0.45, scale: 0.8 },
  // Hidden for now:
  // { name: 'agent', id: 2, label: 'Agent' },
];
// Opening slide candidates: the sky (shape 4; sky-full is the same clouds,
// bigger and closer, skyLayout) or one cloud volume (shape 7, the shader's
// openingVariant: 0 raw block, 1 cloud planet, 2 fog wall).
const openings = ['sky', 'sky-full', 'block', 'planet', 'fog'];
const volumes = ['block', 'planet', 'fog'];
function opening() {
  try { const v = localStorage.getItem('wings-vdb:opening'); if (openings.includes(v)) return v; } catch {}
  return 'sky-full';
}
let openingName = opening();
models[0].id = volumes.includes(openingName) ? 7 : 4;
// Each object's pose (yaw, pitch, roll, scale) and look (density, puff,
// dispersal, softness multipliers) vary a little: re-rolled at random once it
// is fully out of view, so every morph to it lands differently. The opening
// sky stays put. The shader blends them through each morph. A model's spread
// narrows its random angles (1: the full range) and scale sets its base size.
const SLOTS = 6; // the shader's slotPose/slotLook size
const vary = amount => (Math.random() * 2 - 1) * amount;
const slotPose = models.map(() => [0, 0, 0, 1]), slotLook = models.map(() => [1, 1, 1, 1]);
function rollSlot(i) {
  if (i === 0) return; // the opening stays put
  const [yaw, pitch, roll] = models[i].pose ?? [0, 0, 0];
  const spread = models[i].spread ?? 1, scale = models[i].scale ?? 1;
  slotPose[i] = [yaw + vary(0.22 * spread), pitch + vary(0.14 * spread), roll + vary(0.08 * spread), scale * (1 + vary(0.06))];
  slotLook[i] = [1 + vary(0.1), 1 + vary(0.12), 1 + vary(0.15), 1 + vary(0.1)];
}
models.forEach((_, i) => rollSlot(i));
const packSlots = rows => new Float32Array(Array.from({ length: SLOTS }, (_, i) => rows[Math.min(i, rows.length - 1)]).flat());
const slotVectors = () => ({ slotPose: packSlots(slotPose), slotLook: packSlots(slotLook) });
const slotUsed = models.map(() => false);
setInterval(() => {
  if (!cloud) return;
  const p = cloud.getProgress();
  let changed = false;
  models.forEach((_, i) => {
    const inUse = Math.abs(p - i) < 1;
    if (slotUsed[i] && !inUse) { rollSlot(i); changed = true; }
    slotUsed[i] = inUse;
  });
  if (changed) for (const [name, values] of Object.entries(slotVectors())) cloud.setUniformVec4s(name, values);
}, 100);
const shapeUniforms = () => Object.fromEntries([...models.map((m, i) => [`shape${i}`, m.id]), ['shapeCount', models.length]]);
const nameLabel = document.querySelector('#model-name');
const textLabel = document.querySelector('#model-text');
let cloud;
let capturing = false;
// Wings Portal candidates, in the shader's portalVariant order.
const portalVariants = ['tunnel', 'gyro', 'atom', 'ripple', 'infinity', 'coil', 'arch', 'oval', 'reflection', 'disc'];
const agentVariants = ['smooth', 'orbit', 'halo', 'pulse', 'thinking', 'typing', 'caret', 'breath', 'surface', 'ellipsis', 'gyro', 'relay',
  'harp', 'halo-ring', 'lantern', 'gate', 'dove', 'trumpet',
  'birdcage', 'nest', 'egg', 'birdhouse', 'feather', 'perch',
  'hourglass', 'magnet', 'flask', 'tuning-fork', 'prism', 'metronome', 'sprite', 'swan',
  'kiwi', 'puffin', 'toucan', 'pelican', 'shoebill', 'dodo', 'peacock', 'flamingo'];
function agentVariant() {
  try { const v = localStorage.getItem('wings-vdb:agentVariant'); if (agentVariants.includes(v)) return v; } catch {}
  return 'smooth';
}
// Bird flocks (birds.js): random flocks cross the scene, of the kind the
// flock command picks (saved); the birds tab turns them on (off by default)
// and sets how often, size, count and speed. Off in the debug views
// and with reduced motion.
const flocks = createFlocks();
function flockKind() {
  try { const v = localStorage.getItem('wings-vdb:flock'); if (flockKinds.includes(v)) return v; } catch {}
  return 'mixed';
}
function applyBirds() {
  const v = params.values;
  flocks.setOptions({ enabled: v['birds.birds'] === 1 && viewMode === 0 && !reduced.matches, often: v['birds.often'], size: v['birds.size'], count: v['birds.count'], speed: v['birds.speed'], kind: flockKind() });
}
// Scene views: the cloud, or the bare geometry under it. Not saved, so a
// reload always returns to the cloud. v cycles forward, Shift+V back.
const viewModes = ['cloud', 'solid', 'normals', 'xray', 'cost'];
const VIEW_NOTES = { solid: 'solid view', normals: 'normals view', xray: 'x-ray view', cost: 'cost view: blue cheap, red costly' };
const viewTag = document.querySelector('#view-tag');
let viewMode = 0;
function setViewMode(index) {
  viewMode = (index + viewModes.length) % viewModes.length;
  cloud?.setUniform('viewMode', viewMode);
  applyBeams();
  applyBirds();
  const name = viewModes[viewMode];
  viewTag.hidden = name === 'cloud';
  viewTag.textContent = `${VIEW_NOTES[name]} · v to cycle`;
  return name;
}
// Wings Kits candidates, in the shader's kitsVariant order.
const kitsVariants = ['nut', 'links', 'plus', 'blocks', 'wingnut'];
function kitsVariant() {
  try { const v = localStorage.getItem('wings-vdb:kitsVariant'); if (kitsVariants.includes(v)) return v; } catch {}
  return 'links';
}
// Wings Machine candidates, in the shader's machineVariant order.
const machineVariants = ['crt', 'gear', 'gears', 'flywheel', 'belt', 'turbine', 'screen', 'crank', 'platters', 'clock', 'ripple'];
function machineVariant() {
  try { const v = localStorage.getItem('wings-vdb:machineVariant'); if (machineVariants.includes(v)) return v; } catch {}
  return 'ripple';
}
// Global texture over sky and shape (post.js); amount 0..2, 1 as designed.
// By default a light linen (0.25); a texture picked without an amount gets 1.
function textureName() {
  try { const v = localStorage.getItem('wings-vdb:texture'); if (textures.includes(v)) return v; } catch {}
  return 'linen';
}
function textureAmount() {
  try { const raw = localStorage.getItem('wings-vdb:textureAmount'), v = Number(raw); if (raw !== null && Number.isFinite(v)) return Math.max(0, Math.min(2, v)); } catch {}
  try { if (localStorage.getItem('wings-vdb:texture') !== null) return 1; } catch {}
  return 0.25;
}
function applyTexture() {
  const name = textureName();
  cloud?.setTexture(textures.indexOf(name), animatedTextures.includes(name));
  cloud?.setTextureStrength(textureAmount());
}
function portalVariant() {
  try { const v = localStorage.getItem('wings-vdb:portalVariant'); if (portalVariants.includes(v)) return v; } catch {}
  return 'tunnel';
}

function updateLabels(progress) {
  const model = models[Math.max(0, Math.min(models.length - 1, Math.round(progress)))];
  const label = model.label ?? model.name;
  if (nameLabel.textContent !== label) nameLabel.textContent = label;
  // The description, not the command (model.text), for now.
  const text = details[model.name]?.blurb ?? '';
  if (textLabel.textContent !== text) textLabel.textContent = text;
}

// Scroll track, in screen heights: each shape holds still for scroll.hang,
// then scroll.morph screen heights morph it into the next. The first shape
// has no hang, so the opening starts morphing as soon as you scroll. Both add
// page length, so each keeps its own pace.
const hang = () => params.values['scroll.hang'];
const morph = () => params.values['scroll.morph'];
const hangAt = i => (i === 0 ? 0 : hang());
const slotStart = i => { let s = 0; for (let j = 0; j < i; j++) s += hangAt(j) + morph(); return s; };
const trackLength = () => slotStart(models.length - 1) + hangAt(models.length - 1);
const scrollMain = document.querySelector('main');
function sizeTrack() { scrollMain.style.height = `${(trackLength() + 1) * 100}svh`; }

function progressAt(s) {
  for (let i = 0; i < models.length - 1; i++) {
    const h = hangAt(i);
    if (s < h) return i;
    s -= h;
    if (s < morph()) return i + s / morph();
    s -= morph();
  }
  return models.length - 1;
}

function scrollProgress() {
  const span = document.documentElement.scrollHeight - innerHeight;
  return progressAt(span > 0 ? Math.min(1, Math.max(0, scrollY / span)) * trackLength() : 0);
}
function onScroll() {
  const progress = scrollProgress();
  cloud?.setProgress(reduced.matches ? Math.round(progress) : progress);
  updateLabels(progress);
  updateHover();
}

// A whole number lands mid-hang on that shape; a fraction lands mid-morph.
function scrollFor(progress) {
  const p = Math.max(0, Math.min(models.length - 1, progress));
  const i = Math.floor(p), f = p - i;
  const s = slotStart(i) + (f === 0 ? hangAt(i) / 2 : hangAt(i) + f * morph());
  return s / trackLength() * (document.documentElement.scrollHeight - innerHeight);
}
function goto(progress) { scrollTo({ top: scrollFor(progress), behavior: 'smooth' }); }

// Snap: when the scroll comes to rest (scroll.snapDelay seconds with no
// scrolling) within scroll.snapRange screen heights of a shape's centre,
// mid-hang where the shape is whole, the page glides there over
// scroll.snapTime seconds. Any input during the glide hands control back.
// Not while the chat or a dive holds the page, nor with reduced motion.
let snapTimer = 0, snapRaf = 0, snapping = false;
function trackPosition() {
  const span = document.documentElement.scrollHeight - innerHeight;
  return span > 0 ? Math.min(1, Math.max(0, scrollY / span)) * trackLength() : 0;
}
function snapSlot() {
  const s = trackPosition();
  let best = null;
  for (let i = 0; i < models.length; i++) {
    const d = Math.abs(s - (slotStart(i) + hangAt(i) / 2));
    if (!best || d < best.d) best = { i, d };
  }
  return best && best.d <= params.values['scroll.snapRange'] ? best.i : null;
}
function cancelSnap() {
  clearTimeout(snapTimer);
  snapTimer = 0;
  if (snapRaf) cancelAnimationFrame(snapRaf);
  snapRaf = 0;
  snapping = false;
}
function glideTo(top, seconds) {
  const from = scrollY, start = performance.now(), ms = seconds * 1000;
  let set = from;
  snapping = true;
  const step = now => {
    // Something else moved the page (the scrollbar, goto, the chat): let go,
    // and judge the new resting place afresh.
    if (Math.abs(scrollY - set) > 2) { snapRaf = 0; snapping = false; scheduleSnap(); return; }
    const t = Math.min(1, (now - start) / ms);
    const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(2 - 2 * t, 3) / 2;
    scrollTo({ top: from + (top - from) * e, behavior: 'instant' });
    set = scrollY;
    if (t < 1) snapRaf = requestAnimationFrame(step);
    else { snapRaf = 0; snapping = false; }
  };
  snapRaf = requestAnimationFrame(step);
}
function trySnap() {
  snapTimer = 0;
  const body = document.body.classList;
  if (params.values['scroll.snap'] !== 1 || reduced.matches || body.contains('panel-open') || body.contains('dive-open')) return;
  const slot = snapSlot();
  if (slot === null) return;
  const top = scrollFor(slot);
  if (Math.abs(top - scrollY) >= 1) glideTo(top, params.values['scroll.snapTime']);
}
function scheduleSnap() {
  if (snapping) return;
  clearTimeout(snapTimer);
  snapTimer = setTimeout(trySnap, params.values['scroll.snapDelay'] * 1000);
}
// Closing the chat lands on the nearest object, mid-hang, never mid-morph: the
// page jumps there and the pill morphs straight into that object.
function settleOnNearest() {
  const span = document.documentElement.scrollHeight - innerHeight;
  const nearest = Math.round(progressAt(span > 0 ? Math.min(1, Math.max(0, scrollY / span)) * trackLength() : 0));
  scrollTo({ top: scrollFor(nearest), behavior: 'instant' });
  cloud?.setProgress(nearest, true);
  updateLabels(nearest);
}

// Sun beams (texture pass) follow the sunlight sliders; off in the debug views.
function applyBeams() {
  const v = params.values;
  cloud?.setBeams({ amount: viewMode === 0 ? v['sunlight.beams'] : 0, length: v['sunlight.beamLength'], streaks: v['sunlight.beamStreaks'], azimuth: v['sunlight.sunAzimuth'], elevation: v['sunlight.sunElevation'] });
}
function applyParams() {
  if (!cloud) return;
  for (const [name, value] of Object.entries(params.uniforms())) cloud.setUniform(name, value);
  applyBeams();
  applyBirds();
  cloud.setEase(params.values['scroll.scrollEase']);
  sizeTrack();
  onScroll();
}
params.onChange(applyParams);

// While the drawer is open on the dispersal tab, hold the current shape at full
// dispersal so changes are visible anywhere; closing returns to scroll values.
// Toggled by dispersal.preview.
let dispersalFocused = false;
let diveFocused = false; // the dive tab is open (dive.preview; see setDive)
let hoverFocused = false; // the hover tab is open (hover.preview; see pushHover)
const previewOn = () => dispersalFocused && params.values['dispersal.preview'] === 1;
params.onChange(path => { if (path === 'dispersal.preview') cloud?.setForceBurst(previewOn() ? 1 : 0); });
// What the drawer's param-tab pictures read (viz.js). Only called while one
// draws, by when everything below is declared.
function frameBounds(perPixel) {
  const rect = canvas.getBoundingClientRect(), top = (rect.height - insetPx()) / 2 * perPixel;
  return { left: -rect.width / 2 * perPixel, right: rect.width / 2 * perPixel, top, bottom: top - rect.height * perPixel };
}
const vizScene = {
  flocks, slotStart, hangAt, morph, trackLength,
  snap: () => (params.values['scroll.snap'] === 1 ? params.values['scroll.snapRange'] : null),
  slots: () => models.map(m => m.name),
  skyFirst: () => models[0].id === 4,
  scroll() { const span = document.documentElement.scrollHeight - innerHeight; return span > 0 ? Math.min(1, Math.max(0, scrollY / span)) * trackLength() : 0; },
  progress: () => cloud?.getProgress() ?? 0,
  time: () => cloud?.getTime() ?? 0,
  burstHeld: previewOn,
  birdsOn: () => params.values['birds.birds'] === 1 && viewMode === 0 && !reduced.matches,
  dive: () => (diveHeld() ? { value: params.values['dive.hold'], held: true, falling: false } : { value: diveValue, held: false, falling: diveTarget < diveValue }),
  frame: (scale = 1) => frameBounds(worldPerPixel(canvas.getBoundingClientRect()) / scale),
  opening: () => openingName,
  sky: () => (openingName === 'sky-full' ? fullLayout() : { skyCloud: skyUniforms.skyCloud, skyMeta: skyUniforms.skyMeta }),
  trail: () => wipe,
};
const terminal = mountTerminal({
  pages: [perfPage({ getCloud: () => cloud, describe: p => models[Math.max(0, Math.min(models.length - 1, Math.round(p)))].label })],
  visuals: paramVisuals(vizScene),
  extras: {
    get: () => ({ agent: agentVariant(), portal: portalVariant() }),
    set(data) {
      if (agentVariants.includes(data.agent)) { try { localStorage.setItem('wings-vdb:agentVariant', data.agent); } catch {} cloud?.setAgentVariant(agentVariants.indexOf(data.agent)); }
      if (portalVariants.includes(data.portal)) { try { localStorage.setItem('wings-vdb:portalVariant', data.portal); } catch {} cloud?.setPortalVariant(portalVariants.indexOf(data.portal)); }
    },
  },
  onFocus({ open, groups }) {
    dispersalFocused = open && groups.includes('dispersal');
    diveFocused = open && groups.includes('dive');
    hoverFocused = open && groups.includes('hover');
    if (cloud) { pushDive(); pushHover(); updateHover(); } // not while mounting: their state is set up further down
    cloud?.setForceBurst(previewOn() ? 1 : 0);
  },
  status: () => cloud ? `${cloud.backend} · ${cloud.getQuality()} · ${cloud.getFps().toFixed(0)} fps · p ${cloud.getProgress().toFixed(2)}` : 'renderer unavailable',
  commands: {
    goto: { usage: '<progress|name>', about: 'scroll to a progress value or shape (0.5 = midway from the first shape to the second)', run([arg]) {
      const index = models.findIndex(m => m.name === arg);
      const p = index >= 0 ? index : Number(arg);
      if (!Number.isFinite(p)) return `goto: expected 0-${models.length - 1} or one of ${models.map(m => m.name).join(', ')}`;
      goto(p); return `→ ${p}`;
    } },
    mid: { usage: '', about: 'jump to the nearest dispersal midpoint', run() {
      const p = Math.min(models.length - 2, Math.floor(cloud?.getProgress() ?? 0)) + 0.5; goto(p); return `→ ${p}`;
    } },
    portal: { usage: portalVariants.join('|'), about: 'switch the Wings Portal shape', run([arg]) {
      if (arg) {
        if (!portalVariants.includes(arg)) return `portal: expected ${portalVariants.join(', ')}`;
        try { localStorage.setItem('wings-vdb:portalVariant', arg); } catch {}
        cloud?.setPortalVariant(portalVariants.indexOf(arg));
      }
      return `portal ${portalVariant()}`;
    } },
    view: { usage: viewModes.join('|'), about: 'show the cloud, or the bare geometry: solid, normals, xray (faint cloud over the solid), cost (field evaluations per pixel); v cycles', run([arg]) {
      if (arg) {
        if (!viewModes.includes(arg)) return `view: expected ${viewModes.join(', ')}`;
        setViewMode(viewModes.indexOf(arg));
      }
      return `view ${viewModes[viewMode]}`;
    } },
    kits: { usage: kitsVariants.join('|'), about: 'switch the Wings Kits shape', run([arg]) {
      if (arg) {
        if (!kitsVariants.includes(arg)) return `kits: expected ${kitsVariants.join(', ')}`;
        try { localStorage.setItem('wings-vdb:kitsVariant', arg); } catch {}
        cloud?.setUniform('kitsVariant', kitsVariants.indexOf(arg));
      }
      return `kits ${kitsVariant()}`;
    } },
    machine: { usage: machineVariants.join('|'), about: 'switch the Wings Machine shape', run([arg]) {
      if (arg) {
        if (!machineVariants.includes(arg)) return `machine: expected ${machineVariants.join(', ')}`;
        try { localStorage.setItem('wings-vdb:machineVariant', arg); } catch {}
        cloud?.setUniform('machineVariant', machineVariants.indexOf(arg));
      }
      return `machine ${machineVariant()}`;
    } },
    opening: { usage: openings.join('|'), about: 'switch the first slide: the sky, sky-full (bigger, closer clouds), or a raw block, cloud planet or fog wall (opening tab)', run([arg]) {
      if (arg) {
        if (!openings.includes(arg)) return `opening: expected ${openings.join(', ')}`;
        try { localStorage.setItem('wings-vdb:opening', arg); } catch {}
        applyOpening();
      }
      return `opening ${openingName}`;
    } },
    texture: { usage: '<name> [amount 0-2]', about: `a global texture over sky and shape: ${textures.join(', ')}`, run([arg, amount]) {
      if (arg) {
        if (!textures.includes(arg)) return `texture: expected ${textures.join(', ')}`;
        if (amount !== undefined && !(Number.isFinite(Number(amount)) && Number(amount) >= 0 && Number(amount) <= 2)) return 'texture: amount must be 0-2';
        try {
          localStorage.setItem('wings-vdb:texture', arg);
          if (amount !== undefined) localStorage.setItem('wings-vdb:textureAmount', String(Number(amount)));
        } catch {}
        applyTexture();
      }
      return `texture ${textureName()} ${textureAmount()}`;
    } },
    flock: { usage: `${flockKinds.join('|')}|now [kind]`, about: 'which flocks fly by (mixed: songbirds and geese), or send one now', run([arg, kind]) {
      if (arg === 'now') {
        if (kind !== undefined && !flockKinds.includes(kind)) return `flock: expected ${flockKinds.join(', ')}`;
        if (params.values['birds.birds'] !== 1) return 'flock: birds are off (birds on)';
        if (viewMode !== 0) return 'flock: birds show only in the cloud view';
        return flocks.spawn(kind) ? `flock of ${kind ?? flockKind()} on its way` : 'flock: the sky is full; try again shortly';
      }
      if (arg) {
        if (!flockKinds.includes(arg)) return `flock: expected ${flockKinds.join(', ')}, or now [kind]`;
        try { localStorage.setItem('wings-vdb:flock', arg); } catch {}
        applyBirds();
      }
      return `flock ${flockKind()}`;
    } },
    inset: { usage: 'on|off', about: 'fit the object to the space above the footer (on), or to the whole window', run([arg]) {
      if (arg) {
        if (arg !== 'on' && arg !== 'off') return 'inset: expected on, off';
        try { localStorage.setItem('wings-vdb:frameInset', arg); } catch {}
        applyInset();
        if (openPanel) placePanel();
      }
      return `inset ${insetOn() ? 'on' : 'off'}`;
    } },
    agent: { usage: '<name>', about: `switch the agent shape: ${agentVariants.join(', ')}`, run([arg]) {
      if (arg) {
        if (!agentVariants.includes(arg)) return `agent: expected ${agentVariants.join(', ')}`;
        try { localStorage.setItem('wings-vdb:agentVariant', arg); } catch {}
        cloud?.setAgentVariant(agentVariants.indexOf(arg));
      }
      return `agent ${agentVariant()}`;
    } },
    shot: { usage: '[width]', about: 'download a high-res PNG of the current frame, sky and shape (default 3840 wide, full-window aspect)', run([arg]) {
      if (!cloud) return 'shot: renderer unavailable';
      if (capturing) return 'shot: already capturing';
      const width = arg === undefined ? 3840 : Math.round(Number(arg));
      if (!Number.isFinite(width) || width < 320 || width > 8192) return 'shot: width must be 320-8192';
      const height = Math.round(width * innerHeight / innerWidth);
      const slot = Math.max(0, Math.min(models.length - 1, Math.round(cloud.getProgress())));
      const model = models[slot].id === 2 ? agentVariant() : models[slot].id === 3 ? `portal-${portalVariant()}` : models[slot].id === 5 ? `machine-${machineVariant()}` : models[slot].name;
      capturing = true;
      cloud.capture(width, height).then(({ blob, width: w, height: h }) => {
        const name = `wings-${model}-${w}x${h}.png`;
        const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 10000);
        terminal.print(`saved ${name}${w !== width ? ` (GPU limit; asked for ${width} wide)` : ''}`, 'dim');
      }).catch(error => terminal.print(error.message, 'err')).finally(() => { capturing = false; });
      return `capturing ${width}×${height}…`;
    } },
    ui: { usage: 'on|off', about: 'show or hide the page\'s UI, this drawer included; h toggles it', run([arg]) {
      if (arg !== 'on' && arg !== 'off') return 'usage: ui on|off';
      setUiHidden(arg === 'off');
      return arg === 'off' ? 'ui hidden; press h to bring it back' : 'ui shown';
    } },
    motion: { usage: 'on|off', about: 'billowing animation', run([arg]) {
      if (arg) cloud?.setMotion(arg === 'on'); return `motion ${cloud?.getMotion() ? 'on' : 'off'}`;
    } },
    quality: { usage: 'low|balanced|high', about: 'resolution and raymarch steps', run([arg]) {
      if (arg) cloud?.setQuality(arg); return `quality ${cloud?.getQuality()}`;
    } },
    defaults: { usage: '[dry] [group|group.key ...]', about: 'make the current values the defaults in src/params.js (dev server only); with no names, every group; dry: list the changes, write nothing', run(args) {
      const dryRun = args[0] === 'dry', wants = dryRun ? args.slice(1) : args;
      fetch('/__wings/defaults', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ values: params.values, wants, dryRun }) })
        .then(r => r.ok ? r.json() : Promise.reject(new Error(`server said ${r.status}`)))
        .then(({ changes, errors }) => {
          for (const e of errors) terminal.print(`defaults: ${e}`, 'err');
          if (!changes.length) return terminal.print('defaults: nothing to change', 'dim');
          const note = [...changes.map(c => `  ${c.path} ${c.from} → ${c.to}`), dryRun ? `${changes.length} would change (dry run)` : `${changes.length} saved as defaults in src/params.js`].join('\n');
          terminal.print(note, 'dim');
          // Writing params.js reloads the page; the drawer shows the note again after.
          if (!dryRun) try { sessionStorage.setItem('wings-vdb:defaults-note', note); } catch {}
        })
        .catch(error => terminal.print(`defaults: only on the dev server (${error.message})`, 'err'));
      return dryRun ? 'checking…' : 'saving…';
    } },
  },
});
try {
  const note = sessionStorage.getItem('wings-vdb:defaults-note');
  if (note) { sessionStorage.removeItem('wings-vdb:defaults-note'); terminal.print(note, 'dim'); }
} catch {}

// Chat panel: ⌘K (Ctrl K elsewhere) or the footer button morphs the cloud into
// a pill holding an agent input, which appears once the pill has formed. A
// click outside, Escape, or the shortcut again closes it and the cloud returns
// to the scroll shape.
const chatButton = document.querySelector('#chat-toggle');
const panels = { chat: document.querySelector('#chat') };
const chatInput = panels.chat.querySelector('input');
// Chrome reports "macOS", Safari and Firefox "MacIntel", hence the case-blind match.
const isMac = /mac|iphone|ipad/i.test(navigator.userAgentData?.platform || navigator.platform);
chatButton.textContent = matchMedia('(hover: none)').matches ? 'Ask' : isMac ? '⌘K' : 'Ctrl K';
chatButton.setAttribute('aria-keyshortcuts', isMac ? 'Meta+K' : 'Control+K');
// The waitlist flag (flags.js): before launch the footer offers the waitlist
// in the toggle's place, and the chat stays closed.
if (flags.waitlist) {
  const waitlist = document.createElement('a');
  waitlist.id = 'waitlist-link';
  waitlist.href = WAITLIST_URL;
  waitlist.textContent = 'Join the waitlist';
  chatButton.replaceWith(waitlist);
}
let openPanel = null, panelTimer = 0;
const MORPH_MS = { chat: 450 }; // full morph into (or out of) each panel
// From the opening sky the clouds gather into the pill, which takes longer.
const morphMs = name => (cloud && cloud.getProgress() < 1 ? 1100 : MORPH_MS[name]);
// The view fits the canvas above the footer (the shader's frameInset), so the
// shape centres in the space above it; `inset off` fits the whole canvas.
const footerEl = document.querySelector('footer');
function insetOn() { try { return localStorage.getItem('wings-vdb:frameInset') !== 'off'; } catch { return true; } }
const insetPx = () => (insetOn() ? footerEl.offsetHeight : 0);
function applyInset() {
  const h = canvas.getBoundingClientRect().height;
  cloud?.setUniform('frameInset', h > 0 ? Math.min(0.5, insetPx() / h) : 0);
  document.documentElement.style.setProperty('--inset', `${insetPx()}px`);
}
// World units per CSS pixel, from the shader's view fit.
function worldPerPixel(rect) {
  const aspect = rect.width / (rect.height - insetPx());
  return Math.max((aspect < 0.7 ? 6.8 : 8) / 1.25, 4.2 * aspect) / rect.width;
}
// Slash commands: while chat is open they all sit along the bottom, where the
// object's note normally is. Typing a "/" lights up the ones that match;
// Tab completes the first, and Enter on part of a name runs the first match.
// A command is sent to the agent (chat.js).
const COMMANDS = ['help', 'sessions', 'clear', 'auth'];
const chatHints = document.querySelector('#chat-hints');
function runCommand(name) {
  chatInput.value = '';
  showMatches();
  thread.send(`/${name}`);
}
chatHints.replaceChildren(...COMMANDS.map(name => {
  const b = Object.assign(document.createElement('button'), { type: 'button', textContent: `/${name}` });
  b.dataset.name = name;
  b.addEventListener('click', () => runCommand(name));
  return b;
}));
// The commands a "/word" being typed could be: names starting with it first.
function commandMatches(value) {
  if (!value.startsWith('/') || /\s/.test(value)) return [];
  const q = value.slice(1).toLowerCase();
  return [...COMMANDS.filter(n => n.startsWith(q)), ...COMMANDS.filter(n => !n.startsWith(q) && n.includes(q))];
}
function showMatches() {
  const matches = commandMatches(chatInput.value);
  chatHints.classList.toggle('typing', matches.length > 0);
  for (const b of chatHints.children) b.classList.toggle('match', matches.includes(b.dataset.name));
}
chatInput.addEventListener('input', showMatches);
chatInput.addEventListener('keydown', event => {
  if (event.key !== 'Tab' || event.isComposing) return;
  const [first] = commandMatches(chatInput.value);
  if (!first) return;
  event.preventDefault();
  chatInput.value = `/${first}`;
  showMatches();
});
// The reply thread (chat.js): a scripted agent answering in UI. Once it has
// replied the input row hides and the pill holds the reply, its options in
// pills of their own below; the pill grows to hold it whenever its size changes.
const chatThread = panels.chat.querySelector('.chat-thread');
const chatPills = panels.chat.querySelector('.chat-pills');
const thread = mountChatThread({ thread: chatThread, pills: chatPills, input: chatInput, reduced: () => reduced.matches, changed: () => { if (openPanel === 'chat') placePanel(); } });
new ResizeObserver(() => { if (openPanel === 'chat') placePanel(); }).observe(chatThread);
// Pills are sized to their labels, so lay them out again once the font arrives.
document.fonts?.addEventListener('loadingdone', () => { if (openPanel === 'chat') placePanel(); });

// The pill's extra height eases toward the reply's; it also eases up (shift)
// when a tall reply and its options need the room.
let grow = 0, growTarget = 0, shift = 0, shiftTarget = 0, growFrame = 0, growLast = 0, chatWorldPerPixel = 0;
function growStep(now) {
  const dt = Math.min(0.05, (now - growLast) / 1000); growLast = now;
  const f = reduced.matches ? 1 : 1 - Math.exp(-dt * 14);
  grow += (growTarget - grow) * f;
  shift += (shiftTarget - shift) * f;
  if (Math.abs(growTarget - grow) < 0.5) grow = growTarget;
  if (Math.abs(shiftTarget - shift) < 0.5) shift = shiftTarget;
  cloud?.setUniform('chatGrow', grow * chatWorldPerPixel);
  cloud?.setUniform('chatShift', shift * chatWorldPerPixel);
  growFrame = grow === growTarget && shift === shiftTarget ? 0 : requestAnimationFrame(growStep);
}
function setGrow(px, up = 0) {
  growTarget = px; shiftTarget = up;
  if (!growFrame) { growLast = performance.now(); growFrame = requestAnimationFrame(growStep); }
}
// The option pills' cloud (the shader's chatChips, chatChipLook). A pill's
// cloud is placed whole where it belongs and appears as density, never
// growing or sliding in; it fades the same way. Its label's opacity is the
// same value (--appear), so label and cloud show together. Only an open
// "something else" or a puff on hover changes size, easing. Boxes are
// world-unit [cx, cy, half width, half height].
const MAX_CHIPS = 8;
let chips = [], chipFrame = 0, chipLast = 0;
function setChips(targets) {
  const keys = new Set(targets.map(t => t.key));
  for (const c of chips) if (!keys.has(c.key)) { c.show = false; c.gone = true; }
  for (const t of targets) {
    const c = chips.find(c => c.key === t.key);
    if (c) Object.assign(c, { to: t.box, show: t.show });
    else chips.push({ key: t.key, at: [...t.box], to: t.box, show: t.show, fade: 0 });
  }
  if (!chipFrame) { chipLast = performance.now(); chipFrame = requestAnimationFrame(chipStep); }
}
function chipStep(now) {
  const dt = Math.min(0.05, (now - chipLast) / 1000); chipLast = now;
  const f = reduced.matches ? 1 : 1 - Math.exp(-dt * 12), g = reduced.matches ? 1 : 1 - Math.exp(-dt * 11);
  let moving = false;
  for (const c of chips) {
    for (let i = 0; i < 4; i++) {
      c.at[i] += (c.to[i] - c.at[i]) * f;
      if (Math.abs(c.to[i] - c.at[i]) < 1e-3) c.at[i] = c.to[i]; else moving = true;
    }
    const want = c.show ? 1 : 0;
    c.fade += (want - c.fade) * g;
    if (Math.abs(want - c.fade) < 0.01) c.fade = want; else moving = true;
    c.key.style.setProperty('--appear', c.fade.toFixed(3));
  }
  chips = chips.filter(c => !(c.gone && c.fade === 0));
  // Pills showing come first, so ones fading out are the first dropped.
  const live = chips.filter(c => c.fade > 0);
  const shown = [...live.filter(c => c.show), ...live.filter(c => !c.show)].slice(0, MAX_CHIPS);
  const boxes = new Float32Array(MAX_CHIPS * 4), looks = new Float32Array(MAX_CHIPS * 4);
  shown.forEach((c, i) => { boxes.set(c.at, i * 4); looks[i * 4] = c.fade; });
  cloud?.setUniformVec4s('chatChips', boxes);
  cloud?.setUniformVec4s('chatChipLook', looks);
  cloud?.setUniform('chatChipCount', shown.length);
  chipFrame = moving ? requestAnimationFrame(chipStep) : 0;
}

function placePanel() {
  const rect = canvas.getBoundingClientRect(), k = worldPerPixel(rect);
  const x = rect.left + rect.width / 2, y = rect.top + (rect.height - insetPx()) / 2;
  if (openPanel === 'chat') {
    // The pill is centred on the canvas; the input covers it, inset from the
    // rounded ends.
    const half = Math.round(Math.min(340, (innerWidth - 32) / 2)), halfH = innerWidth < 600 ? 32 : 40;
    panels.chat.style.setProperty('--row', `${2 * halfH}px`);
    cloud?.setUniform('chatHalfW', half * k);
    cloud?.setUniform('chatHalfH', halfH * k);
    chatWorldPerPixel = k;
    const replying = !thread.empty, composing = replying && thread.expanded;
    panels.chat.classList.toggle('replying', replying);
    panels.chat.classList.toggle('composing', composing);
    if (!replying) {
      // Before the first message: the input row alone.
      Object.assign(panels.chat.style, { width: `${2 * half - halfH}px`, height: `${2 * halfH}px`, left: `${x}px`, top: `${y - halfH}px` });
      thread.layoutPills({ width: 2 * half, height: 0, gap: 0, inputH: 0 });
      setChips([]);
      setGrow(0);
      return;
    }
    // After it: the pill holds the reply alone, from where the input row was,
    // with the option pills in rows under it ("something else", while open, is
    // the input row). The reply scrolls when
    // there is no more room above the footer.
    const limit = rect.bottom - 72, pillH = innerWidth < 600 ? 50 : 54, gap = 18, below = 30; // below: between the reply and the first row
    const pills = thread.layoutPills({ width: 2 * half, height: pillH, gap, inputH: 2 * halfH });
    const pillsH = pills.height ? pills.height + below : 0;
    // Move up, no higher than the top margin, when it all does not fit below.
    const natural = Math.max(2 * halfH, thread.fit(Math.max(0, limit - (rect.top + 24) - pillsH)));
    const top = Math.max(rect.top + 24, Math.min(y - halfH, limit - natural - pillsH));
    const mainH = Math.max(2 * halfH, thread.fit(Math.max(0, limit - top - pillsH)));
    const pillsTop = top + mainH + below;
    Object.assign(panels.chat.style, { width: `${2 * half - halfH}px`, height: `${mainH}px`, left: `${x}px`, top: `${top}px` });
    panels.chat.style.setProperty('--pills-top', `${mainH + below}px`);
    setChips(pills.boxes.map(({ key, cx, cy, hw, hh, show }) => ({ key, show, box: [cx * k, -(pillsTop + cy - y) * k, hw * k, hh * k] })));
    setGrow(mainH - 2 * halfH, y - halfH - top);
  } else setGrow(0);
}
function setPanel(name) {
  if (name === openPanel) return;
  const was = openPanel;
  openPanel = name;
  clearTimeout(panelTimer);
  for (const [key, panel] of Object.entries(panels)) { panel.inert = key !== name; panel.classList.remove('ready'); }
  chatHints.inert = name !== 'chat';
  chatButton.setAttribute('aria-expanded', String(name === 'chat'));
  document.body.classList.toggle('panel-open', Boolean(name));
  if (openPanel === 'chat') placePanel();
  if (name) {
    cloud?.setPointer(null);
    cloud?.setInstall(true, { instant: reduced.matches, duration: morphMs(name) });
    // The HTML fades in as the shape settles; without a renderer it shows at once.
    panelTimer = setTimeout(() => {
      panels[name].classList.add('ready');
      if (name === 'chat') thread.focus();
    }, cloud && !reduced.matches ? morphMs(name) * 0.75 : 0);
  } else {
    if (document.activeElement?.closest('.chat')) document.activeElement.blur();
    settleOnNearest();
    cloud?.setInstall(false, { instant: reduced.matches, duration: morphMs(was) });
  }
  updateHover(); // chat open: the object lets go of its hover as it morphs

}
chatButton.addEventListener('click', () => { if (diveSlot === null) setPanel(openPanel === 'chat' ? null : 'chat'); });
// The path is taken at dispatch, so a click on a pill that re-rendering has
// since removed still counts as inside the chat.
document.addEventListener('click', event => {
  if (openPanel) { if (!event.composedPath().some(el => el === panels.chat || el === chatButton || el === chatHints)) setPanel(null); return; }
  if (event.target instanceof Element && event.target.closest('footer, button, a, input, [class*="term"]')) return;
  const slot = objectAt(event.clientX, event.clientY);
  if (slot !== null) setDive(slot);
});

// Object detail view ("dive"). At rest on an object that has a hit box, a
// click frays its cloud into wisps that scatter outward, leaving the bare sky
// for that program's detail (#detail, from detail.js; the footer keeps its name and description); Escape or the footer's
// "esc to return" gathers it back. The shader's dive (0..1) runs the
// dispersal, with a short fade at the end; the drawer's dive tab sets its
// look and timing. Scrolling is locked meanwhile; the footer stays.
const detail = document.querySelector('#detail');
const diveReturn = document.querySelector('#dive-return');
if (matchMedia('(hover: none)').matches) diveReturn.textContent = 'return';
const diveMs = key => params.values[`dive.${key}`] * 1000;
let diveSlot = null, diveValue = 0, diveTarget = 0, diveFrame = 0, diveLast = 0, lastPointer = null, detailTimer = 0;
// While the drawer's dive tab is open the current object holds mid-dive, at
// dive.hold, so the sliders show their effect (like the dispersal tab's
// preview); dive.preview turns it off.
const diveHeld = () => diveFocused && params.values['dive.preview'] === 1;
function pushDive() { cloud?.setUniform('dive', diveHeld() ? params.values['dive.hold'] : diveValue); }
params.onChange(path => { if (path === 'dive.hold' || path === 'dive.preview') pushDive(); });
diveReturn.addEventListener('click', () => setDive(null));
// The slot whose object is under the pointer, or null. Mid-morph both
// neighbouring objects count, the nearer first, so an object is always
// clickable; the sky and the wordmark have no hit box, and nothing is
// clickable once the cloud has (all but) settled on one of them. Never with
// chat, the drawer, a debug view or the detail view open.
function objectAt(clientX, clientY) {
  if (!cloud || openPanel || diveSlot !== null || viewMode !== 0 || document.body.classList.contains('term-open')) return null;
  const p = cloud.getProgress(), lo = Math.floor(p), hi = Math.ceil(p);
  const near = p - lo <= hi - p ? [lo, hi] : [hi, lo];
  const rect = canvas.getBoundingClientRect(), k = worldPerPixel(rect);
  for (const slot of near) {
    const hit = models[slot]?.hit;
    if (!hit) { if (Math.abs(p - slot) < 0.05) return null; continue; }
    const s = params.values['presence.scale'] * slotPose[slot][3];
    const x = (clientX - rect.left - rect.width / 2) * k / s, y = -(clientY - rect.top - (rect.height - insetPx()) / 2) * k / s;
    if (x > hit[0] && x < hit[1] && y > hit[2] && y < hit[3]) return slot;
  }
  return null;
}
// Hover: the object under the pointer fluffs up (the shader's objHover, 0..1,
// eased over hover.in / hover.out seconds; the drawer's hover tab sets the look).
// While that tab is open the current object holds at hover.hold (hover.preview
// turns it off).
let hoverValue = 0, hoverTarget = 0, hoverFrame = 0, hoverLast = 0;
const hoverHeld = () => hoverFocused && params.values['hover.preview'] === 1;
function pushHover() { cloud?.setUniform('objHover', hoverHeld() ? params.values['hover.hold'] : hoverValue); }
params.onChange(path => { if (path === 'hover.hold' || path === 'hover.preview') pushHover(); });
function hoverStep(now) {
  const dt = Math.max(0, Math.min(0.25, (now - hoverLast) / 1000)); hoverLast = now;
  const step = dt / params.values[hoverTarget > hoverValue ? 'hover.in' : 'hover.out'];
  hoverValue = reduced.matches ? hoverTarget : hoverTarget > hoverValue ? Math.min(hoverTarget, hoverValue + step) : Math.max(hoverTarget, hoverValue - step);
  pushHover();
  hoverFrame = hoverValue === hoverTarget ? 0 : requestAnimationFrame(hoverStep);
}
function updateHover() {
  const on = Boolean(lastPointer) && objectAt(...lastPointer) !== null;
  document.body.classList.toggle('object-hover', on);
  // A click keeps the hover through the dive, so the object disperses from its
  // hovered state instead of first settling back; it is let go on return.
  if (diveSlot !== null) return;
  hoverTarget = on ? 1 : 0;
  if (!hoverFrame && hoverValue !== hoverTarget) { hoverLast = performance.now(); hoverFrame = requestAnimationFrame(hoverStep); }
}
// The cloud keeps easing after the scroll stops (onto the wordmark, say), so
// what is under a still pointer is checked again as it goes.
setInterval(() => { if (lastPointer) updateHover(); }, 100);
function diveStep(now) {
  // Wall-clock paced, so a slow GPU still finishes on time.
  const dt = Math.max(0, Math.min(0.25, (now - diveLast) / 1000)); diveLast = now;
  const step = dt * 1000 / diveMs(diveTarget > diveValue ? 'in' : 'out');
  diveValue = reduced.matches ? diveTarget : diveTarget > diveValue ? Math.min(diveTarget, diveValue + step) : Math.max(diveTarget, diveValue - step);
  pushDive();
  diveFrame = diveValue === diveTarget ? 0 : requestAnimationFrame(diveStep);
}
function setDive(slot) {
  if (slot === diveSlot) return;
  diveSlot = slot;
  const open = slot !== null;
  document.body.classList.toggle('dive-open', open);
  document.body.dataset.dive = open ? models[slot].name : '';
  diveReturn.tabIndex = open ? 0 : -1;
  clearTimeout(detailTimer);
  if (open) {
    // A click mid-morph lands on that object first: the page jumps to it,
    // mid-hang, and the cloud gathers there while it disperses.
    if (scrollProgress() !== slot) {
      scrollTo({ top: scrollFor(slot), behavior: 'instant' });
      cloud?.setProgress(slot);
      updateLabels(slot);
    }
    renderDetail(detail, models[slot].name);
    detail.dataset.program = models[slot].name;
    detail.setAttribute('aria-label', models[slot].label);
    detail.hidden = false;
    cloud?.setPointer(null);
    // Detail content shows as the last of the cloud goes.
    detailTimer = setTimeout(() => detail.classList.add('shown'), reduced.matches ? 0 : diveMs('in') * 0.7);
  } else {
    detail.classList.remove('shown');
    detailTimer = setTimeout(() => { detail.hidden = true; detail.replaceChildren(); }, reduced.matches ? 0 : 250);
  }
  updateHover();
  diveTarget = open ? 1 : 0;
  if (!diveFrame) { diveLast = performance.now(); diveFrame = requestAnimationFrame(diveStep); }
}
addEventListener('keydown', event => {
  if (diveSlot !== null) { if (event.key === 'Escape') setDive(null); return; }
  if (event.key === 'Escape' && openPanel) return setPanel(null);
  if (!flags.waitlist && event.key.toLowerCase() === 'k' && (isMac ? event.metaKey : event.ctrlKey) && !event.altKey && !event.shiftKey) {
    event.preventDefault();
    setPanel(openPanel === 'chat' ? null : 'chat');
  }
});
addEventListener('resize', () => { applyInset(); if (openPanel) placePanel(); });
// h hides the page's UI (footer, chat, detail, view tag, drawer) for a clean
// view of the sky and shape, and shows it again; the drawer's ui command too.
// Hiding closes the drawer, so the cloud is not left shifted up for it.
function setUiHidden(hidden) {
  if (hidden) terminal.toggle(false);
  document.body.classList.toggle('ui-hidden', hidden);
}
addEventListener('keydown', event => {
  if (event.key.toLowerCase() !== 'h' || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
  if (event.target instanceof Element && event.target.closest('input, textarea, [contenteditable]')) return;
  setUiHidden(!document.body.classList.contains('ui-hidden'));
});
addEventListener('keydown', event => {
  if (event.key.toLowerCase() !== 'v' || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.target instanceof Element && event.target.closest('input, textarea, [contenteditable]')) return;
  setViewMode(viewMode + (event.shiftKey ? -1 : 1));
  terminal.print(`view ${viewModes[viewMode]}`, 'dim');
});
// Enter sends the message to the scripted agent (chat.js), which answers
// under the input; a command, or the start of one, runs it. Hidden commands:
// run on Enter but never listed; /clouds opens the control drawer (the only
// way to on a phone, while its handle is hidden).
const HIDDEN = {
  '/clouds': () => { chatInput.value = ''; showMatches(); setPanel(null); terminal.toggle(true); },
  '/perf': () => { chatInput.value = ''; setPanel(null); terminal.showView('perf'); },
};
panels.chat.querySelector('form').addEventListener('submit', event => {
  event.preventDefault();
  const value = chatInput.value.trim();
  if (HIDDEN[value.toLowerCase()]) return HIDDEN[value.toLowerCase()]();
  if (!value) return;
  const [command] = commandMatches(value);
  if (command && command.startsWith(value.slice(1).toLowerCase())) return runCommand(command);
  chatInput.value = '';
  showMatches();
  thread.send(value);
});

reduced.addEventListener('change', () => { cloud?.setMotion(!reduced.matches); applyBirds(); onScroll(); });
addEventListener('scroll', onScroll, { passive: true });
addEventListener('scroll', scheduleSnap, { passive: true });
for (const type of ['wheel', 'touchstart', 'pointerdown', 'keydown']) addEventListener(type, () => { if (snapping) cancelSnap(); }, { passive: true });
addEventListener('resize', onScroll);
// The pointer's trail over the block or fog opening (the shader's wipeTrail):
// it carves the block and wipes the fog, whether or not hover.displace is on.
// 24 points, a brush's width apart; the oldest is replaced first.
const wipe = new Float32Array(96);
let wipeNext = 0, wipeLast = null;
function trackWipe(x, y) {
  if (!cloud || (openingName !== 'block' && openingName !== 'fog') || cloud.getProgress() > 0.5) return;
  if (wipeLast && Math.hypot(x - wipeLast[0], y - wipeLast[1]) < params.values['opening.brush'] * 0.5) return;
  wipeLast = [x, y];
  const now = cloud.getTime();
  wipe.set([x, y, now, 1], wipeNext * 4);
  cloud.setUniform('wipeLatest', now);
  wipeNext = (wipeNext + 1) % 24;
  cloud.setUniformVec4s('wipeTrail', wipe);
}
// The opening's shape, live: slot 0's id and the shader's openingVariant.
function applyOpening() {
  openingName = opening();
  models[0].id = volumes.includes(openingName) ? 7 : 4;
  wipe.fill(0); wipeLast = null;
  if (!cloud) return;
  applySky();
  cloud.setUniform('shape0', models[0].id);
  cloud.setUniform('openingVariant', Math.max(0, volumes.indexOf(openingName)));
  cloud.setUniformVec4s('wipeTrail', wipe);
  cloud.setUniform('wipeLatest', -1e4);
}
// The sky's clouds: as laid out in shader.js, or for sky-full bigger and
// closer (the opening tab's full* sliders). layout is replaced on a shader
// hot swap.
let layout = skyLayout;
// Top to bottom the clouds fill the canvas, footer strip included: the lowest
// at opening.fullBottom screen heights above the bottom edge, the highest
// just over the top edge.
function fullLayout() {
  const rect = canvas.getBoundingClientRect(), k = worldPerPixel(rect) / params.values['presence.scale'];
  const top = (rect.height - insetPx()) / 2 * k, bottom = top - rect.height * k;
  return layout({ size: params.values['opening.fullSize'], spread: params.values['opening.fullSpread'], depth: params.values['opening.fullDepth'], low: bottom + params.values['opening.fullBottom'] * rect.height * k, high: top + 0.1 });
}
function applySky() {
  if (!cloud) return;
  const sky = openingName === 'sky-full' ? fullLayout() : { skyCloud: skyUniforms.skyCloud, skyMeta: skyUniforms.skyMeta };
  for (const [name, values] of Object.entries(sky)) cloud.setUniformVec4s(name, values);
  cloud.setUniform('skyClear', openingName === 'sky-full' ? 1 - params.values['opening.fullHaze'] : 0);
}
params.onChange(path => { if ((path.startsWith('opening.full') || path === 'presence.scale') && openingName === 'sky-full') applySky(); });
addEventListener('resize', () => { if (openingName === 'sky-full') applySky(); });
// The cursor disturbs the cloud material rather than turning the view, when
// hover.displace is on. Maps the pointer into the shader's camera-plane units
// with the same view fit.
const hoverOn = () => params.values['hover.displace'] === 1;
params.onChange(path => { if (path === 'hover.displace' && !hoverOn()) cloud?.setPointer(null); });
addEventListener('pointermove', event => {
  lastPointer = event.pointerType === 'touch' ? null : [event.clientX, event.clientY];
  updateHover();
  if (reduced.matches || !cloud) return;
  const rect = canvas.getBoundingClientRect();
  const frameH = rect.height - insetPx();
  const u = (event.clientX - rect.left) / rect.width * 2 - 1, v = 1 - (event.clientY - rect.top) / frameH * 2;
  if (!openPanel && diveSlot === null && Math.abs(u) <= 1 && Math.abs(v) <= 1) {
    const w = worldPerPixel(rect) * rect.width;
    trackWipe(u * w / 2, v * (w * frameH / rect.width) / 2);
  }
  if (!hoverOn() || openPanel || diveSlot !== null || document.body.classList.contains('term-open') || Math.abs(u) > 1 || Math.abs(v) > 1) return cloud.setPointer(null);
  const width = worldPerPixel(rect) * rect.width, height = width * frameH / rect.width;
  cloud.setPointer(u * width / 2, v * height / 2);
}, { passive: true });
document.documentElement.addEventListener('pointerleave', () => { cloud?.setPointer(null); lastPointer = null; updateHover(); });
canvas.addEventListener('webglcontextlost', () => { document.body.classList.add('unavailable'); terminal.print('WebGL context lost', 'err'); });
canvas.addEventListener('cloud-context-restored', () => location.reload());

try {
  cloud = await mountCloudMorph(canvas, { vertexSource, fragmentSource, postSource, quality: innerWidth < 600 ? 'low' : 'balanced', last: models.length - 1, uniforms: { ...params.uniforms(), ...shapeUniforms() }, vectors: { ...skyUniforms, ...slotVectors(), chatChips: new Float32Array(32), chatChipLook: new Float32Array(32) } });
  document.body.classList.add('renderer-ready');
  document.body.dataset.renderer = cloud.backend;
  cloud.setMotion(!reduced.matches);
  cloud.setPortalVariant(portalVariants.indexOf(portalVariant()));
  cloud.setAgentVariant(agentVariants.indexOf(agentVariant()));
  cloud.setUniform('kitsVariant', kitsVariants.indexOf(kitsVariant()));
  cloud.setUniform('machineVariant', machineVariants.indexOf(machineVariant()));
  applyOpening();
  applyInset();
  applyTexture();
  if (!cloud.setBirds(flocks)) terminal.print('birds need WebGL 2', 'dim');
  cloud.setForceBurst(previewOn() ? 1 : 0);
  applyParams();
  pushDive();
  window.cloudMorph = cloud;
  window.cloudFlocks = flocks;
} catch (error) {
  console.warn('Live cloud unavailable; showing static preview.', error);
  document.body.classList.add('unavailable');
  terminal.print(`renderer: ${error.message}`, 'err');
}

// Live shader editing: save src/shader.js and the new program swaps in place.
if (import.meta.hot) {
  import.meta.hot.accept('./post.js', mod => {
    if (!mod || !cloud) return;
    try { cloud.setPostSource(mod.postSource); terminal.print('texture pass reloaded', 'dim'); }
    catch (error) { terminal.print(error.message, 'err'); }
  });
  import.meta.hot.accept('./shader.js', mod => {
    if (!mod || !cloud) return;
    try {
      cloud.setFragment(mod.fragmentSource);
      for (const [name, values] of Object.entries(mod.skyUniforms ?? {})) cloud.setUniformVec4s(name, values);
      if (mod.skyLayout) layout = mod.skyLayout;
      if (openingName === 'sky-full') for (const [name, values] of Object.entries(fullLayout())) cloud.setUniformVec4s(name, values);
      terminal.print('shader reloaded', 'dim');
    }
    catch (error) { terminal.print(error.message, 'err'); }
  });
}
