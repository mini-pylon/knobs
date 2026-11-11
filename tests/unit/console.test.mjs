import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLine, coerce } from '../../src/console.js';

const controls = {
  'hero.title': { path: 'hero.title', key: 'title', type: 'text' },
  'hero.variant': { path: 'hero.variant', key: 'variant', type: 'select' },
  'hero.overlay': { path: 'hero.overlay', key: 'overlay', type: 'number' },
  'hero.badge': { path: 'hero.badge', key: 'badge', type: 'toggle' },
  'hero.accent': { path: 'hero.accent', key: 'accent', type: 'color' },
};
const resolve = name => controls[name] ?? Object.values(controls).find(c => c.key === name) ?? null;
const context = { resolve, builtins: new Set(['help', 'ls', 'get', 'reset', 'on', 'save', 'download', 'load', 'export', 'import', 'clear', 'close']), commands: new Set(['shot']) };
const parse = line => parseLine(line, context);
const setOf = (control, op, raw) => ({ kind: 'set', control: controls[control], op, raw });

test('an empty line', () => {
  assert.deepEqual(parse(''), { kind: 'empty' });
  assert.deepEqual(parse('   '), { kind: 'empty' });
  assert.deepEqual(parse('/'), { kind: 'empty' });
});

for (const [name, line, raw] of [
  ['spaces', 'hero.title Two words here', 'Two words here'],
  ['an equals sign', 'hero.title a = b', 'a = b'],
  ['a leading equals sign', 'hero.title = b', '= b'],
  ['a plus-equals', 'hero.title += 2', '+= 2'],
  ['digits', 'hero.title 12345', '12345'],
  ['repeated spaces', 'hero.title a   b', 'a   b'],
  ['extra leading spaces after the one separator', 'hero.title   a', '  a'],
  ['trailing spaces', 'hero.title a  ', 'a  '],
  ['nothing after the separator', 'hero.title ', ''],
  ['the key alone', 'title Two words', 'Two words'],
]) test(`a text value keeps ${name}`, () => assert.deepEqual(parse(line), setOf('hero.title', '=', raw)));

test('set takes a text value the same way', () => {
  assert.deepEqual(parse('set hero.title a = 2  b'), setOf('hero.title', '=', 'a = 2  b'));
});

test('a text control with no separator asks for a value', () => {
  assert.deepEqual(parse('hero.title'), { kind: 'error', message: 'hero.title: expected a value' });
});

test('compact = does not apply to a text control', () => {
  assert.deepEqual(parse('hero.title=x'), { kind: 'unknown', head: 'hero.title=x' });
});

test('a select value is the rest of the line', () => {
  assert.deepEqual(parse('hero.variant split view'), setOf('hero.variant', '=', 'split view'));
});

for (const [line, op, raw] of [
  ['hero.overlay 0.5', '=', '0.5'],
  ['overlay 0.5', '=', '0.5'],
  ['hero.overlay = 0.5', '=', '0.5'],
  ['hero.overlay=0.5', '=', '0.5'],
  ['hero.overlay += .2', '+=', '.2'],
  ['hero.overlay+=.2', '+=', '.2'],
  ['hero.overlay -= .2', '-=', '.2'],
  ['hero.overlay-=.2', '-=', '.2'],
  ['set overlay 0.5', '=', '0.5'],
  ['set hero.overlay += 1', '+=', '1'],
]) test(`number: ${line}`, () => assert.deepEqual(parse(line), setOf('hero.overlay', op, raw)));

test('a toggle with no value', () => assert.deepEqual(parse('hero.badge'), setOf('hero.badge', '=', undefined)));
test('a toggle with a word', () => assert.deepEqual(parse('badge off'), setOf('hero.badge', '=', 'off')));
test('a colour', () => assert.deepEqual(parse('accent #112233'), setOf('hero.accent', '=', '#112233')));

test('a builtin, with and without a slash', () => {
  assert.deepEqual(parse('reset hero'), { kind: 'builtin', name: 'reset', args: ['hero'], rest: 'hero' });
  assert.deepEqual(parse('/save'), { kind: 'builtin', name: 'save', args: [], rest: '' });
});

test('import keeps its JSON exactly', () => {
  const json = '{"hero.title":"a   b"}';
  assert.equal(parse(`import ${json}`).rest, json);
});

test('a project command', () => {
  assert.deepEqual(parse('shot 1200 wide'), { kind: 'command', name: 'shot', args: ['1200', 'wide'], rest: '1200 wide' });
});

test('an unknown word', () => assert.deepEqual(parse('nonsense 1'), { kind: 'unknown', head: 'nonsense' }));
test('set with nothing', () => assert.equal(parse('set').kind, 'error'));
test('set with an unknown control', () => assert.deepEqual(parse('set nope 1'), { kind: 'error', message: 'unknown control: nope  (try ls)' }));

const number = controls['hero.overlay'], toggle = controls['hero.badge'], text = controls['hero.title'], color = controls['hero.accent'];
for (const [name, args, expected] of [
  ['a number', [number, '=', '0.5', 0], { ok: true, value: 0.5 }],
  ['plus-equals', [number, '+=', '.25', 0.5], { ok: true, value: 0.75 }],
  ['minus-equals', [number, '-=', '.25', 0.5], { ok: true, value: 0.25 }],
  ['not a number', [number, '=', 'abc', 0], { ok: false, message: 'not a number: abc' }],
  ['a missing number', [number, '=', undefined, 0], { ok: false, message: 'not a number: ' }],
  ['a toggle flips with no value', [toggle, '=', undefined, 1], { ok: true, value: 0 }],
  ['toggle on', [toggle, '=', 'on', 0], { ok: true, value: 1 }],
  ['toggle no', [toggle, '=', 'no', 1], { ok: true, value: 0 }],
  ['text stays a string', [text, '=', '12', 'x'], { ok: true, value: '12' }],
  ['empty text', [text, '=', '', 'x'], { ok: true, value: '' }],
  ['a colour stays a string', [color, '=', '#112233', '#000000'], { ok: true, value: '#112233' }],
  ['a missing colour', [color, '=', undefined, '#000000'], { ok: false, message: 'hero.accent: expected a value' }],
]) test(`coerce: ${name}`, () => assert.deepEqual(coerce(...args), expected));
