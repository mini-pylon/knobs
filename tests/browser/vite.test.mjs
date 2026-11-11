import '../../src/vite.js';
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { join } from 'node:path';
import knobs from '../../src/vite.js';
import { collectErrors, copyFixture, launch, newPage, openDrawer, serve, type } from './lib/harness.mjs';

let fixture, site, browser, page, errors;
const file = name => join(fixture.root, name);

before(async () => { browser = await launch(); });
after(async () => {
  await page?.context().close();
  await site?.close();
  await fixture?.remove();
  await browser?.close();
});

// Each test gets its own copy and server, so one test's file edits cannot
// reach the next test's page as a late reload.
async function fresh() {
  await page?.context().close();
  await site?.close();
  await fixture?.remove();
  fixture = await copyFixture('plain');
  writeFileSync(file('hostile.css'), '');
  site = await serve(fixture.root, { plugins: [knobs({ controls: 'controls.js' })] });
  page = await newPage(browser);
  errors = collectErrors(page);
  await page.goto(site.url);
  await page.locator('[data-knobs]').waitFor({ state: 'attached' });
}
const waitForBoot = n => page.waitForFunction(count => window.__boots === count, n);
const read = id => page.locator(`#read-${id}`).textContent();
const values = () => JSON.parse(readFileSync(file('knobs.values.json'), 'utf8'));

function post(body) {
  return new Promise((done, fail) => {
    const req = request({ host: '127.0.0.1', port: site.port, method: 'POST', path: '/__knobs/save', headers: { origin: site.url.slice(0, -1), 'content-type': 'application/json' } }, res => {
      res.resume();
      res.on('end', () => done(res.statusCode));
    });
    req.on('error', fail);
    req.end(JSON.stringify(body));
  });
}

test('save writes only the changed values and the page reloads with them', async () => {
  await fresh();
  await openDrawer(page);
  await type(page, 'hero.title Saved to the file');
  await type(page, 'hero.overlay 0.4');
  await type(page, 'save');
  await waitForBoot(2);
  assert.deepEqual(values(), { 'hero.title': 'Saved to the file' });
  await page.locator('[data-knobs]').waitFor({ state: 'attached' });
  assert.equal(await read('hero-title'), 'Saved to the file');
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('fixture:values'))), {});
  assert.deepEqual(errors, []);
});

test('editing the values file reloads the page and the new value shows', async () => {
  await fresh();
  writeFileSync(file('knobs.values.json'), '{ "hero.variant": "stacked" }\n');
  await waitForBoot(2);
  await page.waitForFunction(() => document.getElementById('read-hero-variant').textContent === 'stacked');
});

test('editing the controls file reloads the page and the drawer still drives it', async () => {
  await fresh();
  writeFileSync(file('controls.js'), readFileSync(file('controls.js'), 'utf8').replace('The original headline', 'An edited default'));
  await waitForBoot(2);
  await page.waitForFunction(() => document.getElementById('read-hero-title').textContent === 'An edited default');
  await page.locator('[data-knobs]').waitFor({ state: 'attached' });
  await openDrawer(page);
  await type(page, 'hero.title Still driven');
  assert.equal(await read('hero-title'), 'Still driven');
});

test('a save after a schema edit validates against the edited schema', async () => {
  await fresh();
  const original = readFileSync(file('controls.js'), 'utf8');
  assert.equal(await post({ values: { 'hero.variant': 'wide' } }), 422);
  writeFileSync(file('controls.js'), original.replace("'stacked']", "'stacked', 'wide']"));
  await waitForBoot(2);
  assert.equal(await post({ values: { 'hero.variant': 'wide' } }), 200);
  assert.deepEqual(values(), { 'hero.variant': 'wide' });
  await waitForBoot(3);
  writeFileSync(file('controls.js'), original);
  await waitForBoot(4);
  assert.equal(await post({ values: { 'hero.variant': 'wide' } }), 422);
});

test('the browser\'s copy of the schema is not trusted', async () => {
  await fresh();
  assert.equal(await post({ values: { 'made.up': 1 } }), 422);
  assert.deepEqual(values(), {});
});
