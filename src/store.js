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

// Show a number with the step's decimals. toFixed past 100 throws, and a
// step coarser than a clamped bound would show a different number, so
// those stay as the stored value.
export function formatNumber(step, value) {
  const decimals = stepDecimals(step);
  if (decimals > 100) return String(value);
  const shown = value.toFixed(decimals);
  if (Number(shown) !== value) return String(value);
  return shown;
}

// Round to a count of decimals. toFixed stops at 100, so past that round by significant digits.
function roundDecimals(n, decimals) {
  if (decimals <= 100) return Number(n.toFixed(decimals));
  if (n === 0) return n;
  const digits = decimals + Number(n.toExponential().split('e')[1]) + 1;
  // More digits than toPrecision takes is more than a double holds, so nothing rounds away.
  if (digits > 100) return n;
  if (digits > 0) return Number(n.toPrecision(digits));
  // Below one unit of the last decimal: round to that unit or to zero, half away from zero.
  const unit = Number(`1e-${decimals}`);
  return Math.abs(n) * 2 >= unit ? Math.sign(n) * unit : 0;
}

export function normalize(control, value) {
  if (control.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return { ok: false };
    // Adding 0 turns -0 into 0, so a value compares equal to itself after another pass.
    const clamp = n => Math.min(control.max, Math.max(control.min, n)) + 0;
    // Rounding can step past a bound that has more decimals than the step, so clamp again.
    return { ok: true, value: clamp(roundDecimals(clamp(value), stepDecimals(control.step))) };
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

// Reading the storage global, and getItem, setItem and removeItem, each
// throw when storage is blocked, full, or in a private window. Callers
// keep going; only the persisted copy is lost.
export function storageCall(area, method, ...args) {
  if (!method) {
    if (typeof area !== 'string') return area ?? null;
    try { return globalThis[area] ?? null; }
    catch { return null; }
  }
  const result = storageTry(area, method, ...args);
  return result.ok ? result.value : null;
}

// The same call, telling a failure ({ ok: false }) from a value that is
// simply absent ({ ok: true, value: null }).
export function storageTry(area, method, ...args) {
  let storage = area;
  if (typeof area === 'string') {
    try { storage = globalThis[area]; }
    catch { return { ok: false }; }
  }
  if (!storage) return { ok: false };
  try { return { ok: true, value: storage[method](...args) }; }
  catch { return { ok: false }; }
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
  // Where the last write was going while it failed: { storage, key }, or null.
  let unsaved = null;

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
    const ok = storageTry(storage, 'setItem', storageKey, JSON.stringify(out)).ok;
    unsaved = ok ? null : { storage, key: storageKey };
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
    // What is in memory is newer than storage when the last write to this
    // same storage and key failed, and storage cannot be read at all when the
    // read fails: either way, keep the values in memory. Only the pending
    // write is tried again, and never under another key or storage.
    const pending = unsaved?.storage === nextStorage && unsaved?.key === key;
    if (!pending) unsaved = null;
    const read = pending ? { ok: false } : storageTry(storage, 'getItem', key);
    if (!read.ok) {
      if (pending) persist();
      return;
    }
    let data = {};
    try {
      const raw = read.value;
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
