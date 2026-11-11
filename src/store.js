const TYPES = new Set(['number', 'toggle', 'select', 'text', 'color']);

// base is a valid file value, otherwise the default.
// saved holds browser values that differ from base, and is all that is persisted.
// live is what control() returns: saved, then base.

// How many decimals a step carries, whether it is written 0.05 or 5e-7.
export function stepDecimals(step) {
  const [digits, exponent = '0'] = String(Math.abs(step)).toLowerCase().split('e');
  const fraction = (digits.split('.')[1] || '').length;
  return Math.max(0, fraction - Number(exponent));
}

export function normalize(control, value) {
  if (control.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return { ok: false };
    const clamp = n => Math.min(control.max, Math.max(control.min, n));
    const decimals = stepDecimals(control.step);
    // toFixed stops at 100 decimals; a finer step already holds every value a double can.
    if (decimals > 100) return { ok: true, value: clamp(value) };
    // Rounding can step past a bound that has more decimals than the step, so clamp again.
    return { ok: true, value: clamp(Number(clamp(value).toFixed(decimals))) };
  }
  if (control.type === 'toggle') {
    if (value === true || value === 1) return { ok: true, value: 1 };
    if (value === false || value === 0) return { ok: true, value: 0 };
    return { ok: false };
  }
  if (control.type === 'select') {
    if (!Array.isArray(control.options) || !control.options.includes(value)) return { ok: false };
    return { ok: true, value };
  }
  if (control.type === 'text') {
    if (typeof value !== 'string') return { ok: false };
    return { ok: true, value };
  }
  if (control.type === 'color') {
    if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) return { ok: false };
    return { ok: true, value: value.toLowerCase() };
  }
  return { ok: false };
}

function browserError() {
  return new Error('knobs: values can only change in a browser');
}

export function defineControls(groups, fileValues = {}) {
  const byPath = new Map();
  const built = [];

  for (const group of groups) {
    const name = group?.name;
    if (typeof name !== 'string' || !/^\w+$/.test(name)) {
      throw new Error(`knobs: bad group name: ${name}`);
    }
    const controls = [];
    for (const raw of group.controls ?? []) {
      const key = raw?.key;
      if (typeof key !== 'string' || !/^\w+$/.test(key)) {
        throw new Error(`knobs: bad control key in ${name}: ${key}`);
      }
      const path = `${name}.${key}`;
      if (byPath.has(path)) throw new Error(`knobs: duplicate control ${path}`);
      if (!TYPES.has(raw.type)) throw new Error(`knobs: ${path} has unknown type ${raw.type}`);
      if (raw.type === 'number') {
        const { min, max, step } = raw;
        if (![min, max, step].every(part => typeof part === 'number' && Number.isFinite(part))) {
          throw new Error(`knobs: ${path} needs min, max and step`);
        }
        if (min > max) throw new Error(`knobs: ${path} needs min at most max`);
        if (step <= 0) throw new Error(`knobs: ${path} needs a positive step`);
      }
      if (raw.type === 'select' && (!Array.isArray(raw.options) || raw.options.length === 0)) {
        throw new Error(`knobs: ${path} needs options`);
      }
      const normalized = normalize({ ...raw, path, group: name }, raw.value);
      if (!normalized.ok) throw new Error(`knobs: ${path} has an invalid default`);
      const control = Object.freeze({ ...raw, path, group: name, default: normalized.value });
      controls.push(control);
      byPath.set(path, control);
    }
    built.push(Object.freeze({
      name,
      about: group.about ?? '',
      hidden: group.hidden === true,
      controls: Object.freeze(controls),
    }));
  }

  const frozenGroups = Object.freeze(built);
  const files = fileValues && typeof fileValues === 'object' ? fileValues : {};
  const base = new Map();
  const live = new Map();
  for (const [path, control] of byPath) {
    let value = control.default;
    if (Object.hasOwn(files, path)) {
      const normalized = normalize(control, files[path]);
      if (normalized.ok) value = normalized.value;
    }
    base.set(path, value);
    live.set(path, value);
  }

  const saved = new Map();
  const perControl = new Map();
  const subscribers = new Set();
  let storage = null;
  let storageKey = null;

  function requirePath(path) {
    if (!byPath.has(path)) throw new Error(`knobs: unknown control: ${path}`);
  }

  function requireBrowser() {
    if (typeof window === 'undefined') throw browserError();
  }

  function emit(path, value) {
    const own = perControl.get(path);
    if (own) for (const fn of [...own]) fn(value, path);
    for (const fn of [...subscribers]) fn(value, path);
  }

  function persist() {
    if (!storage) return;
    const out = {};
    for (const [path] of byPath) {
      if (saved.has(path)) out[path] = saved.get(path);
    }
    storage.setItem(storageKey, JSON.stringify(out));
  }

  function remember(path, value) {
    if (Object.is(value, base.get(path))) saved.delete(path);
    else saved.set(path, value);
  }

  function control(path) {
    requirePath(path);
    return live.get(path);
  }

  function fileValue(path) {
    requirePath(path);
    return base.get(path);
  }

  function onControl(path, fn) {
    requirePath(path);
    let own = perControl.get(path);
    if (!own) perControl.set(path, own = new Set());
    own.add(fn);
    return () => own.delete(fn);
  }

  function subscribe(fn) {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  }

  function set(path, value) {
    requirePath(path);
    requireBrowser();
    const normalized = normalize(byPath.get(path), value);
    if (!normalized.ok) return false;
    const next = normalized.value;
    remember(path, next);
    persist();
    if (Object.is(live.get(path), next)) return true;
    live.set(path, next);
    emit(path, next);
    return true;
  }

  function reset(paths) {
    requireBrowser();
    const list = paths === undefined ? [...byPath.keys()] : paths;
    for (const path of list) requirePath(path);
    const changes = [];
    for (const path of list) {
      const next = byPath.get(path).default;
      remember(path, next);
      if (Object.is(live.get(path), next)) continue;
      live.set(path, next);
      changes.push([path, next]);
    }
    persist();
    for (const [path, value] of changes) emit(path, value);
  }

  function changed() {
    const out = {};
    for (const [path, control] of byPath) {
      const value = live.get(path);
      if (!Object.is(value, control.default)) out[path] = value;
    }
    return out;
  }

  function attach(nextStorage, key) {
    requireBrowser();
    storage = nextStorage;
    storageKey = key;
    let data = {};
    try {
      const raw = storage.getItem(key);
      if (raw != null && raw !== '') {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = parsed;
      }
    } catch {
      data = {};
    }
    const nextSaved = new Map();
    for (const [path, rawValue] of Object.entries(data)) {
      const control = byPath.get(path);
      if (!control) continue;
      const normalized = normalize(control, rawValue);
      if (!normalized.ok) continue;
      if (Object.is(normalized.value, base.get(path))) continue;
      nextSaved.set(path, normalized.value);
    }
    const changes = [];
    for (const [path] of byPath) {
      const next = nextSaved.has(path) ? nextSaved.get(path) : base.get(path);
      if (Object.is(live.get(path), next)) continue;
      live.set(path, next);
      changes.push([path, next]);
    }
    saved.clear();
    for (const [path, value] of nextSaved) saved.set(path, value);
    persist();
    for (const [path, value] of changes) emit(path, value);
  }

  function detach() {
    storage = null;
    storageKey = null;
  }

  return {
    groups: frozenGroups,
    byPath,
    control,
    fileValue,
    onControl,
    subscribe,
    set,
    reset,
    changed,
    attach,
    detach,
  };
}
