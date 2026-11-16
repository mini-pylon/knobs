// Python's json.loads, json.dumps(sort_keys=True) and scene_params._coerce,
// as the mini-pylon stand-in applies them. A number keeps the int or float
// Python gave it: JSON text has no types of its own.
export class PyNum {
  constructor(value, type) {
    this.value = value;
    this.type = type;
  }
}

// Python's float.__repr__: fixed when -4 <= exponent < 16, else scientific
// with a sign and two exponent digits. Zero keeps its sign.
export function floatRepr(x) {
  if (Number.isNaN(x)) return 'NaN';
  if (x === Infinity) return 'Infinity';
  if (x === -Infinity) return '-Infinity';
  if (Object.is(x, -0)) return '-0.0';
  if (x === 0) return '0.0';
  const text = Math.abs(x).toExponential();
  const match = /^(\d+(?:\.\d+)?)e([+-]?\d+)$/.exec(text);
  if (!match) throw new Error(`cannot format ${x} (${text})`);
  const mantissa = match[1];
  const exponent = Number(match[2]);
  const body = exponent >= -4 && exponent < 16 ? fixed(mantissa, exponent) : scientific(mantissa, exponent);
  return x < 0 ? `-${body}` : body;
}

function fixed(mantissa, exponent) {
  const digits = mantissa.replace('.', '');
  if (exponent < 0) return `0.${'0'.repeat(-exponent - 1)}${digits}`;
  const point = exponent + 1;
  if (digits.length <= point) return `${digits}${'0'.repeat(point - digits.length)}.0`;
  return `${digits.slice(0, point)}.${digits.slice(point)}`;
}

function scientific(mantissa, exponent) {
  const sign = exponent < 0 ? '-' : '+';
  return `${mantissa}e${sign}${String(Math.abs(exponent)).padStart(2, '0')}`;
}

export function loads(text) {
  return JSON.parse(text, (_key, value, context) => {
    if (typeof value !== 'number') return value;
    const source = context?.source ?? '';
    if (!/^-?\d+$/.test(source)) return new PyNum(value, 'float');
    return new PyNum(Object.is(value, -0) ? 0 : value, 'int');
  });
}

function dumpString(text) {
  let out = '"';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const ch = text[i];
    if (ch === '"') out += '\\"';
    else if (ch === '\\') out += '\\\\';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else if (ch === '\b') out += '\\b';
    else if (ch === '\f') out += '\\f';
    else if (code < 0x20 || code > 0x7e) out += `\\u${code.toString(16).padStart(4, '0')}`;
    else out += ch;
  }
  return `${out}"`;
}

function intDigits(n) {
  return Object.is(n, -0) ? '0' : String(n);
}

export function dumps(value) {
  if (value instanceof PyNum) return value.type === 'int' ? intDigits(value.value) : floatRepr(value.value);
  if (typeof value === 'string') return dumpString(value);
  if (value === true) return 'true';
  if (value === false) return 'false';
  if (value === null) return 'null';
  if (Array.isArray(value)) return `[${value.map(dumps).join(', ')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map(key => `${dumpString(key)}: ${dumps(value[key])}`).join(', ')}}`;
  }
  throw new Error(`cannot dump ${value === undefined ? 'undefined' : typeof value}`);
}

// Python's repr of a value loads produced, for the server's error texts.
export function repr(value) {
  if (value instanceof PyNum) return value.type === 'int' ? intDigits(value.value) : floatRepr(value.value);
  if (typeof value === 'string') return reprString(value);
  if (value === true) return 'True';
  if (value === false) return 'False';
  if (value === null || value === undefined) return 'None';
  if (Array.isArray(value)) return `[${value.map(repr).join(', ')}]`;
  if (typeof value === 'object') {
    const parts = Object.entries(value).map(([key, item]) => `${reprString(key)}: ${repr(item)}`);
    return `{${parts.join(', ')}}`;
  }
  return reprString(String(value));
}

function reprString(text) {
  const quote = text.includes("'") && !text.includes('"') ? '"' : "'";
  let out = quote;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const ch = text[i];
    if (ch === '\\') out += '\\\\';
    else if (ch === quote) out += `\\${quote}`;
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else if (code < 0x20 || code === 0x7f) out += `\\x${code.toString(16).padStart(2, '0')}`;
    else out += ch;
  }
  return out + quote;
}

// Python's max and min keep the first argument unless the second is strictly
// greater or strictly less, so a value on a bound becomes that bound.
function pyMax(first, second) {
  return second.value > first.value ? second : first;
}

function pyMin(first, second) {
  return second.value < first.value ? second : first;
}

export function coerce(v, value) {
  const path = v.path;
  if (v.type === 'number') {
    if (!(value instanceof PyNum)) throw new Error(`${path}: not a number: ${repr(value)}`);
    return pyMin(v.max, pyMax(v.min, value));
  }
  if (v.type === 'toggle') {
    const bit = toggleBit(value);
    if (bit === null) throw new Error(`${path}: not on or off: ${repr(value)}`);
    return new PyNum(bit, 'int');
  }
  if (v.type === 'choice') {
    if (!v.choices.includes(value)) throw new Error(`${path}: ${repr(value)} is not one of ${v.choices.join(', ')}`);
    return value;
  }
  if (typeof value !== 'string' || !/^#[0-9A-Fa-f]{6}\n?$/.test(value)) {
    throw new Error(`${path}: not a #RRGGBB colour: ${repr(value)}`);
  }
  return value.toUpperCase();
}

function toggleBit(value) {
  if (value === true) return 1;
  if (value === false) return 0;
  if (value instanceof PyNum && (value.value === 0 || value.value === 1)) return value.value === 0 ? 0 : 1;
  return null;
}

function asPy(value, typeName) {
  if (typeName === 'int') return new PyNum(Object.is(value, -0) ? 0 : value, 'int');
  if (typeName === 'float') return new PyNum(value, 'float');
  return value;
}

export function typedVars(schema, types) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema) || !Array.isArray(schema.groups)) {
    throw new Error('schema.json has no groups');
  }
  if (!types || typeof types !== 'object' || Array.isArray(types)) {
    throw new Error('types.json is not an object');
  }
  const vars = [];
  for (const group of schema.groups) {
    if (!group || typeof group !== 'object' || Array.isArray(group) || typeof group.name !== 'string' || !Array.isArray(group.vars)) {
      throw new Error('schema.json has a group that is not a named list of vars');
    }
    for (const variable of group.vars) {
      if (!variable || typeof variable !== 'object' || Array.isArray(variable) || typeof variable.key !== 'string') {
        throw new Error(`schema.json group ${group.name} has a var with no key`);
      }
      const path = `${group.name}.${variable.key}`;
      const info = types[path];
      if (!info) throw new Error(`types.json has no ${path}`);
      const out = { path, type: variable.type, default: asPy(variable.default, info.default) };
      if (variable.type === 'number') {
        out.min = asPy(variable.min, info.min);
        out.max = asPy(variable.max, info.max);
      }
      if (variable.choices) out.choices = variable.choices;
      vars.push(out);
    }
  }
  return vars;
}

export function resolve(vars, overrides) {
  const byPath = new Map(vars.map(variable => [variable.path, variable]));
  const out = {};
  for (const variable of vars) out[variable.path] = variable.default;
  for (const [path, value] of Object.entries(overrides ?? {})) {
    const variable = byPath.get(path);
    if (!variable) throw new Error(`unknown parameter: ${path}`);
    out[path] = coerce(variable, value);
  }
  return out;
}
