import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createServer as createHttp } from 'node:http';
import { createServer } from 'vite';
import { collectErrors, copyFixture, launch, newPage, viteConfig } from './lib/harness.mjs';

let fixture, vite, http, url, browser;

before(async () => {
  fixture = await copyFixture('ssr');
  const base = viteConfig(fixture.root);
  vite = await createServer({ ...base, appType: 'custom', server: { ...base.server, middlewareMode: true, hmr: false, ws: false } });
  http = createHttp((req, res) => vite.middlewares(req, res, async () => {
    const path = req.url.split('?')[0];
    if (path !== '/early' && path !== '/early-document') { res.statusCode = 204; return res.end(); }
    const entry = await vite.ssrLoadModule('/entry-early.js');
    res.setHeader('content-type', 'text/html');
    res.end(path === '/early' ? entry.renderEarly() : entry.renderEarlyDocument());
  }));
  await new Promise(done => http.listen(0, '127.0.0.1', done));
  url = `http://127.0.0.1:${http.address().port}`;
  browser = await launch();
});
after(async () => {
  await browser?.close();
  await new Promise(done => http?.close(done));
  await vite?.close();
  await fixture?.remove();
});

for (const [path, what] of [['/early', 'a root element'], ['/early-document', 'the whole document']]) {
  test(`${path}: a saved value attached before hydrating ${what} hydrates with no mismatch`, async () => {
    const page = await newPage(browser);
    const errors = collectErrors(page);
    await page.addInitScript(() => localStorage.setItem('ssr:values', JSON.stringify({ 'hero.title': 'Saved before hydration' })));
    await page.goto(url + path);
    await page.waitForFunction(() => document.getElementById('title').textContent === 'Saved before hydration');
    await page.locator('[data-knobs]').waitFor({ state: 'attached' });
    assert.equal(await page.evaluate(() => window.__beforeHydration), 'Saved before hydration');
    assert.deepEqual(await page.evaluate(() => window.__recoverable), []);
    assert.deepEqual(errors, []);
    await page.context().close();
  });
}
