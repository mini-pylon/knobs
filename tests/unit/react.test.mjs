import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bindReact } from '../../src/react.js';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { defineControls } from '../../src/store.js';

const schema = [{ name: 'hero', controls: [{ key: 'title', type: 'text', value: 'Default' }] }];

test('useControl renders the default on the server', () => {
  const useControl = bindReact(defineControls(schema));
  const Title = () => h('h1', null, useControl('hero.title'));
  assert.equal(renderToString(h(Title)), '<h1>Default</h1>');
});

test('useControl renders the file value on the server', () => {
  const useControl = bindReact(defineControls(schema, { 'hero.title': 'From the file' }));
  const Title = () => h('h1', null, useControl('hero.title'));
  assert.equal(renderToString(h(Title)), '<h1>From the file</h1>');
});

test('the server snapshot ignores a saved value, whenever it arrived', t => {
  globalThis.window = {};
  t.after(() => { delete globalThis.window; });
  const store = defineControls(schema, { 'hero.title': 'From the file' });
  store.attach({ getItem: () => JSON.stringify({ 'hero.title': 'Saved' }), setItem() {} }, 'k');
  assert.equal(store.control('hero.title'), 'Saved');
  const useControl = bindReact(store);
  const Title = () => h('h1', null, useControl('hero.title'));
  assert.equal(renderToString(h(Title)), '<h1>From the file</h1>');
});

test('useControl throws on an unknown path', () => {
  const useControl = bindReact(defineControls(schema));
  const Title = () => h('h1', null, useControl('hero.nope'));
  assert.throws(() => renderToString(h(Title)), /unknown control: hero\.nope/);
});

test('only knobs/react imports React', () => {
  for (const name of ['index', 'store', 'console', 'drawer', 'instruments', 'performance', 'style', 'save-endpoint', 'vite', 'react-stub']) {
    const source = readFileSync(new URL(`../../src/${name}.js`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /from\s+['"]react/, name);
  }
});

test('the stub that stands in while the schema loads binds without React', async () => {
  const { bindReact: stub } = await import('../../src/react-stub.js');
  assert.throws(() => stub({})('hero.title'), /cannot run while the Vite plugin loads the schema/);
});
