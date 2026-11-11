import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { request, createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSaveHandler, SAVE_ROUTE, VALUES_FILE } from '../../src/save-endpoint.js';
import { defineControls } from '../../src/store.js';

const store = defineControls([{ name: 'hero', controls: [
  { key: 'variant', type: 'select', value: 'split', options: ['split', 'full'] },
  { key: 'title', type: 'text', value: 'Original' },
  { key: 'overlay', type: 'number', value: 0.4, min: 0, max: 1, step: 0.01 },
] }]);
const PUBLIC = 'https://proto.example.test';
const BEFORE = '{"untouched":true}\n';
let root, server, port, file;

before(async () => {
  root = mkdtempSync(join(tmpdir(), 'knobs-endpoint-'));
  file = join(root, VALUES_FILE);
  const handle = createSaveHandler({ root, loadStore: async () => store, origins: [PUBLIC], limit: 2000 });
  server = createServer(handle);
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  port = server.address().port;
});
after(async () => {
  await new Promise(done => server.close(done));
  rmSync(root, { recursive: true, force: true });
});
beforeEach(() => writeFileSync(file, BEFORE));

function post({ body = JSON.stringify({ values: {} }), headers = {}, method = 'POST' } = {}) {
  const host = `127.0.0.1:${port}`;
  const all = { host, origin: `http://${host}`, 'content-type': 'application/json', ...headers };
  for (const key of Object.keys(all)) if (all[key] === null) delete all[key];
  return new Promise((done, fail) => {
    const req = request({ host: '127.0.0.1', port, method, path: SAVE_ROUTE, headers: all }, res => {
      let text = '';
      res.on('data', chunk => { text += chunk; });
      res.on('end', () => done({ status: res.statusCode, json: JSON.parse(text) }));
    });
    req.on('error', fail);
    req.end(method === 'POST' ? body : undefined);
  });
}
const values = v => JSON.stringify({ values: v });
const unchanged = () => assert.equal(readFileSync(file, 'utf8'), BEFORE);

test('the route and file name are fixed', () => {
  assert.equal(SAVE_ROUTE, '/__knobs/save');
  assert.equal(VALUES_FILE, 'knobs.values.json');
});

test('it keeps only values that differ from the defaults', async () => {
  const res = await post({ body: values({ 'hero.title': 'New words', 'hero.variant': 'split', 'hero.overlay': 0.5 }) });
  assert.deepEqual(res, { status: 200, json: { saved: 2 } });
  assert.equal(readFileSync(file, 'utf8'), '{\n  "hero.overlay": 0.5,\n  "hero.title": "New words"\n}\n');
});

test('nothing changed writes an empty object', async () => {
  const res = await post({ body: values({}) });
  assert.equal(res.status, 200);
  assert.equal(readFileSync(file, 'utf8'), '{}\n');
});

test('it writes only the fixed path, whatever the body says', async () => {
  await post({ body: JSON.stringify({ values: {}, path: '../evil.json', file: '../evil.json' }) });
  assert.equal(existsSync(join(root, '..', 'evil.json')), false);
});

test('it leaves no temporary file behind', async () => {
  await post({ body: values({ 'hero.title': 'x' }) });
  assert.deepEqual(readdirSync(root), [VALUES_FILE]);
});

for (const [name, options, status] of [
  ['a GET', { method: 'GET' }, 405],
  ['a wrong content type', { headers: { 'content-type': 'text/plain' } }, 415],
  ['a form content type', { headers: { 'content-type': 'application/x-www-form-urlencoded' } }, 415],
  ['no content type', { headers: { 'content-type': null } }, 415],
  ['an unrelated origin', { headers: { origin: 'https://evil.example.test' } }, 403],
  ['no origin', { headers: { origin: null } }, 403],
  ['a null origin', { headers: { origin: 'null' } }, 403],
  ['a forwarded host that matches the origin', { headers: { origin: 'https://evil.example.test', 'x-forwarded-host': 'evil.example.test' } }, 403],
  ['an unknown path', { body: values({ 'hero.nope': 1 }) }, 422],
  ['a select value not in its options', { body: values({ 'hero.variant': 'gone' }) }, 422],
  ['a number out of range', { body: values({ 'hero.overlay': 2 }) }, 422],
  ['a number off its step', { body: values({ 'hero.overlay': 0.123 }) }, 422],
  ['a string for a number', { body: values({ 'hero.overlay': '0.5' }) }, 422],
  ['one bad value among good ones', { body: values({ 'hero.title': 'fine', 'hero.nope': 1 }) }, 422],
  ['a body that is not JSON', { body: '{nope' }, 400],
  ['a body with no values', { body: '{}' }, 400],
  ['values that are an array', { body: JSON.stringify({ values: [] }) }, 400],
  ['values that are null', { body: JSON.stringify({ values: null }) }, 400],
  ['an oversized body', { body: values({ 'hero.title': 'x'.repeat(3000) }) }, 413],
]) test(`it refuses ${name} and leaves the file unchanged`, async () => {
  const res = await post(options);
  assert.equal(res.status, status);
  assert.equal(typeof res.json.error, 'string');
  unchanged();
});

test('overlapping saves all succeed and leave one whole file', async () => {
  for (let round = 0; round < 20; round++) {
    const results = await Promise.all(['a', 'b', 'c'].map(title => post({ body: values({ 'hero.title': title }) })));
    assert.deepEqual(results.map(r => r.status), [200, 200, 200]);
    assert.match(JSON.parse(readFileSync(file, 'utf8'))['hero.title'], /^[abc]$/);
    assert.deepEqual(readdirSync(root), [VALUES_FILE]);
  }
});

test('it accepts a charset on the content type', async () => {
  const res = await post({ headers: { 'content-type': 'application/json; charset=utf-8' } });
  assert.equal(res.status, 200);
});

test('it accepts a listed public origin when Host differs', async () => {
  const res = await post({ headers: { origin: PUBLIC, host: 'internal.local:9999' }, body: values({ 'hero.title': 'Proxied' }) });
  assert.equal(res.status, 200);
  assert.match(readFileSync(file, 'utf8'), /Proxied/);
});

test('an origin whose host matches Host is allowed on any scheme', async () => {
  const res = await post({ headers: { origin: `https://127.0.0.1:${port}` } });
  assert.equal(res.status, 200);
});

test('a schema that cannot be loaded is a 500 and leaves the file unchanged', async () => {
  const broken = createServer(createSaveHandler({ root, loadStore: async () => { throw new Error('broken controls'); } }));
  await new Promise(done => broken.listen(0, '127.0.0.1', done));
  const p = broken.address().port;
  const status = await new Promise((done, fail) => {
    const req = request({ host: '127.0.0.1', port: p, method: 'POST', path: SAVE_ROUTE, headers: { origin: `http://127.0.0.1:${p}`, 'content-type': 'application/json' } }, res => { res.resume(); res.on('end', () => done(res.statusCode)); });
    req.on('error', fail);
    req.end(values({}));
  });
  await new Promise(done => broken.close(done));
  assert.equal(status, 500);
  unchanged();
});
