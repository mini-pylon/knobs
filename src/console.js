const COMPACT = /^(.+?)(\+=|-=|=)(.*)$/;
const LEADING_OP = /^(\+=|-=|=)(.*)$/;
const TOGGLE_WORDS = { on: 1, off: 0, true: 1, false: 0, yes: 1, no: 0 };

function splitHead(line) {
  const match = /^(\S+)(?:(\s)([\s\S]*))?$/.exec(line);
  if (!match) return null;
  return { head: match[1], separated: match[2] !== undefined, rest: match[3] ?? '' };
}

function argsOf(rest) {
  const trimmed = rest.trim();
  return trimmed === '' ? [] : trimmed.split(/\s+/);
}

function rawOrNone(text) {
  const trimmed = text.trim();
  return trimmed === '' ? undefined : trimmed;
}

// Text and select keep the rest of the line, including spaces and =.
// Other types treat a leading =, += or -= as an operator.
function assignment(body, resolve, fromSet) {
  const parts = splitHead(body);
  if (!parts) return { kind: 'error', message: 'expected a control' };
  const { head, separated, rest } = parts;
  const named = resolve(head);
  if (!named) {
    const compact = COMPACT.exec(head);
    if (compact) {
      const found = resolve(compact[1]);
      if (found && found.type !== 'text' && found.type !== 'select') {
        return { kind: 'set', control: found, op: compact[2], raw: rawOrNone(compact[3]) };
      }
    }
    if (fromSet) return { kind: 'error', message: `unknown control: ${head}  (try ls)` };
    return null;
  }
  if (named.type === 'text' || named.type === 'select') {
    if (!separated) return { kind: 'error', message: `${named.path}: expected a value` };
    return { kind: 'set', control: named, op: '=', raw: rest };
  }
  const trimmed = rest.trim();
  const opMatch = LEADING_OP.exec(trimmed);
  if (!opMatch) return { kind: 'set', control: named, op: '=', raw: rawOrNone(trimmed) };
  return { kind: 'set', control: named, op: opMatch[1], raw: rawOrNone(opMatch[2]) };
}

export function parseLine(line, { resolve, builtins, commands }) {
  let text = String(line).replace(/^\s+/, '');
  if (text.startsWith('/')) text = text.slice(1);
  text = text.replace(/^\s+/, '');
  if (text === '') return { kind: 'empty' };

  const parts = splitHead(text);
  const { head, separated, rest } = parts;
  if (head === 'set') {
    if (!separated || rest.trim() === '') return { kind: 'error', message: 'expected a control' };
    return assignment(rest.replace(/^\s+/, ''), resolve, true);
  }
  if (builtins.has(head)) return { kind: 'builtin', name: head, args: argsOf(rest), rest };
  if (commands.has(head)) return { kind: 'command', name: head, args: argsOf(rest), rest };
  return assignment(text, resolve, false) ?? { kind: 'unknown', head };
}

export function coerce(control, op, raw, current) {
  if (control.type === 'text' || control.type === 'select' || control.type === 'color') {
    if (raw === undefined) return { ok: false, message: `${control.path}: expected a value` };
    return { ok: true, value: raw };
  }
  if (control.type === 'toggle' && raw === undefined) {
    return { ok: true, value: current ? 0 : 1 };
  }
  const number = typeof raw === 'string' && Object.hasOwn(TOGGLE_WORDS, raw) ? TOGGLE_WORDS[raw] : Number(raw);
  if (!Number.isFinite(number)) return { ok: false, message: `not a number: ${raw ?? ''}` };
  if (op === '+=') return { ok: true, value: current + number };
  if (op === '-=') return { ok: true, value: current - number };
  return { ok: true, value: number };
}
