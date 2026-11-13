import '../../src/react.js';
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createServer as createHttp } from 'node:http';
import { createServer } from 'vite';
import { closeAll, collectErrors, copyFixture, launch, newPage, openDrawer, reactDeps, type, viteConfig } from './lib/harness.mjs';

let fixture, vite, http, url, browser, page, errors;

before(async () => {
  fixture = await copyFixture('ssr');
  const base = viteConfig(fixture.root, { deps: reactDeps });
  vite = await createServer({ ...base, appType: 'custom', server: { ...base.server, middlewareMode: true, hmr: false, ws: false } });
  http = createHttp((req, res) => vite.middlewares(req, res, async () => {
    const path = req.url.split('?')[0];
    if (path !== '/root' && path !== '/document') { res.statusCode = 204; return res.end(); }
    const entry = await vite.ssrLoadModule('/entry-server.js');
    res.setHeader('content-type', 'text/html');
    res.end(path === '/root' ? entry.renderRoot() : entry.renderDocument());
  }));
  await new Promise(done => http.listen(0, '127.0.0.1', done));
  url = `http://127.0.0.1:${http.address().port}`;
  browser = await launch();
});
after(() => closeAll(
  () => browser?.close(),
  () => new Promise(done => http ? http.close(done) : done()),
  () => vite?.close(),
  () => fixture?.remove(),
));

async function visit(path, saved) {
  await page?.context().close();
  page = await newPage(browser);
  errors = collectErrors(page);
  if (saved) await page.addInitScript(values => localStorage.setItem('ssr:values', JSON.stringify(values)), saved);
  await page.goto(url + path);
  await page.locator('[data-knobs]').waitFor({ state: 'attached' });
}
const title = () => page.locator('#title').textContent();
const appeared = text => page.waitForFunction(value => document.getElementById('title').textContent === value, text);

for (const path of ['/root', '/document']) {
  test(`${path}: the server renders the file value or default`, async () => {
    const html = await (await fetch(url + path)).text();
    assert.match(html, /<h1 id="title">The original headline<\/h1>/);
  });

  test(`${path}: a saved value appears after hydration with no warning`, async () => {
    await visit(path, { 'hero.title': 'Saved in this browser' });
    await appeared('Saved in this browser');
    assert.deepEqual(errors, []);
  });

  test(`${path}: the page stays interactive and the drawer drives a useControl read`, async () => {
    await visit(path);
    await page.locator('#count').click();
    await page.waitForFunction(() => document.getElementById('count').textContent === '1');
    await openDrawer(page);
    await type(page, 'hero.title Driven by the drawer');
    await appeared('Driven by the drawer');
    assert.deepEqual(errors, []);
  });
}

test('/root: strict mode leaves one drawer', async () => {
  await visit('/root');
  assert.equal(await page.locator('[data-knobs]').count(), 1);
});

test('mountKnobs notifies an onControl listener and a useControl consumer already subscribed', async () => {
  await visit('/root', { 'hero.title': 'Restored for both' });
  await appeared('Restored for both');
  assert.equal(await page.evaluate(() => window.__heard), 'Restored for both');
});

test('a saved value survives a reload under hydration', async () => {
  await visit('/root');
  await openDrawer(page);
  await type(page, 'hero.title Across a reload');
  await page.reload();
  await appeared('Across a reload');
  assert.deepEqual(errors, []);
  assert.equal(await title(), 'Across a reload');
});
