// Seeded random schemas for the playground: the same seed always gives the
// same groups, and every schema passes defineControls. Most draws are
// ordinary; a few are the edge cases the drawer has to lay out (long names
// and copy, one-option selects, min equal to max, huge ranges, fine steps,
// hidden and empty groups).

// mulberry32: small, fast, and good enough to vary a layout.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS = ['hero', 'card', 'motion', 'grid', 'type', 'shadow', 'glow', 'cloud', 'trail', 'ease', 'scale', 'blur',
  'speed', 'depth', 'tint', 'edge', 'gap', 'pad', 'fade', 'drift', 'noise', 'wave', 'tilt', 'spin', 'burst', 'focus',
  'light', 'fog', 'grain', 'ink', 'line', 'dot', 'ring', 'arc', 'beam', 'pulse'];
const LONG = ['backgroundOverlayOpacityWhenScrolledPastHero', 'secondaryNavigationCollapsedBreakpoint',
  'particleEmitterTurbulenceFalloffRadius', 'testimonialCarouselAutoAdvanceDelay'];
const SENTENCE = 'The quick brown fox jumps over the lazy dog while the headline wraps onto a second line and keeps going';

const STEPS = [1, 0.5, 0.1, 0.05, 0.01, 0.001, 0.0001, 5, 10, 25];

export function randomSchema(seed, { groups: groupCount } = {}) {
  const r = rng(seed);
  const pick = list => list[Math.floor(r() * list.length)];
  const chance = p => r() < p;
  const int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  const used = new Set();
  const unique = base => {
    let name = base, n = 2;
    while (used.has(name)) name = `${base}${n++}`;
    used.add(name);
    return name;
  };
  const word = () => pick(WORDS);
  const name = () => (chance(0.08) ? pick(LONG) : chance(0.3) ? `${word()}_${word()}` : word());
  const copy = () => (chance(0.1) ? `${SENTENCE}. ${SENTENCE}.` : SENTENCE.slice(0, int(12, 60)).trim());

  function number() {
    const kind = r();
    if (kind < 0.06) {
      const v = int(-5, 5);
      return { min: v, max: v, step: 1, value: v };
    }
    if (kind < 0.14) {
      const max = -int(1, 50);
      return { min: max - int(10, 200), max, step: 1, value: max };
    }
    if (kind < 0.22) return { min: 0, max: 100000 * int(1, 10), step: pick([1, 10, 100]), value: 2500 };
    const step = pick(STEPS);
    const steps = int(4, 400);
    // Rounded to six places: multiplying a step like 0.0001 leaves float noise.
    const round = n => Number(n.toFixed(6));
    const min = chance(0.3) ? round(-step * Math.floor(steps / 2)) : 0;
    const max = round(min + step * steps);
    const value = round(min + step * int(0, steps));
    return { min, max, step, value };
  }

  function control(key) {
    const type = pick(['number', 'number', 'number', 'select', 'text', 'toggle', 'color']);
    const out = { key, type };
    if (type === 'number') Object.assign(out, number());
    if (type === 'toggle') out.value = int(0, 1);
    if (type === 'color') out.value = `#${int(0, 0xffffff).toString(16).padStart(6, '0')}`;
    if (type === 'text') out.value = chance(0.12) ? '' : chance(0.08) ? `${SENTENCE}. `.repeat(3).trim() : copy();
    if (type === 'select') {
      const count = chance(0.08) ? 1 : chance(0.08) ? int(12, 20) : int(2, 6);
      const options = [];
      for (let i = 0; options.length < count; i++) {
        const option = chance(0.1) ? `${word()} ${word()} ${word()} ${i}` : `${word()}-${i}`;
        options.push(option);
      }
      out.options = options;
      out.value = pick(options);
    }
    if (chance(0.6)) out.about = chance(0.08) ? `${SENTENCE}, ${SENTENCE.toLowerCase()}.` : copy();
    return out;
  }

  const total = groupCount ?? int(1, 8);
  const groups = [];
  for (let g = 0; g < total; g++) {
    const group = { name: unique(chance(0.06) ? pick(LONG) : name()) };
    if (chance(0.7)) group.about = copy();
    if (g > 0 && chance(0.1)) group.hidden = true;
    const keys = new Set();
    const size = g > 0 && chance(0.05) ? 0 : chance(0.1) ? int(15, 30) : int(1, 8);
    group.controls = [];
    while (group.controls.length < size) {
      let key = name();
      for (let n = 2; keys.has(key); n++) key = `${name()}${n}`;
      keys.add(key);
      group.controls.push(control(key));
    }
    groups.push(group);
  }
  // The first group is the drawer's default tab: always visible, never empty.
  if (groups[0].controls.length === 0) groups[0].controls.push(control('value'));
  return groups;
}
