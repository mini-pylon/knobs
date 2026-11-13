import '../../src/instruments.js';
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { closeAll, collectErrors, copyFixture, launch, newPage, openDrawer, serve, type } from './lib/harness.mjs';

let fixture, site, browser, page, errors;

before(async () => {
  fixture = await copyFixture('plain');
  site = await serve(fixture.root);
  browser = await launch();
});
after(() => closeAll(
  () => browser?.close(),
  () => site?.close(),
  () => fixture?.remove(),
));

async function fresh(query = '') {
  await page?.context().close();
  page = await newPage(browser);
  errors = collectErrors(page);
  await page.goto(site.url + query);
  await page.locator('[data-knobs]').waitFor({ state: 'attached' });
}
const tab = name => page.locator('.term-tab', { hasText: new RegExp(`^${name}$`) });

test('a tab with no picture shows what changed, live', async () => {
  await fresh();
  await openDrawer(page);
  await tab('hero').click();
  assert.equal(await page.locator('.term-viz').innerText(), 'nothing changed');
  await page.locator('button[aria-label="hero.badge"]').click();
  await page.locator('input[aria-label="hero.title"]').fill('New');
  const lines = await page.locator('.term-changes-line').allTextContents();
  assert.deepEqual(lines, ['title  The original headline → New', 'badge  on → off']);
  await page.locator('input[aria-label="hero.title"]').fill('The original headline');
  assert.deepEqual(await page.locator('.term-changes-line').allTextContents(), ['badge  on → off']);
});

test('the changed list ignores other groups', async () => {
  await fresh();
  await openDrawer(page);
  await type(page, 'product.price 50');
  await tab('hero').click();
  assert.equal(await page.locator('.term-viz').innerText(), 'nothing changed');
});

test('a custom picture draws only while its tab shows, inside the shadow root', async () => {
  await fresh();
  assert.equal(await page.evaluate(() => window.__frames), 0);
  await openDrawer(page);
  await tab('scene').click();
  await page.waitForFunction(() => window.__frames > 2);
  assert.equal(await page.locator('canvas.viz-chart').count(), 1);
  assert.deepEqual(await page.evaluate(() => window.__pen), { fg: '#d8e1e8', dim: '#7d8b96' });
  await tab('hero').click();
  await page.waitForTimeout(200);
  const before = await page.evaluate(() => window.__frames);
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => window.__frames), before);
  assert.equal(await page.locator('canvas.viz-chart').count(), 0);
});

test('performance shows frame rate and memory, and no renderer rows by default', async () => {
  await fresh();
  await page.keyboard.press('Shift+Backquote');
  await page.waitForFunction(() => Number(document.querySelector('[data-knobs]').shadowRoot.querySelector('.perf-value')?.textContent) > 0);
  assert.deepEqual(await page.locator('.perf-key').allTextContents(), ['fps', 'memory']);
  assert.deepEqual(errors, []);
});

test('performance adds rows the project supplies through stats', async () => {
  await fresh('?stats=1');
  await page.keyboard.press('Shift+Backquote');
  await page.locator('.perf-key', { hasText: 'renderer' }).waitFor();
  assert.deepEqual(await page.locator('.perf-key').allTextContents(), ['fps', 'memory', 'renderer', 'scene']);
  assert.equal(await page.locator('.perf-value').nth(2).textContent(), 'test renderer');
});

test('labels you can act on are yellow and instrument labels are light grey', async () => {
  await fresh();
  await openDrawer(page);
  await page.locator('.term-tab').nth(1).click();
  await page.locator('.perf-key').first().waitFor();
  const colors = await page.evaluate(() => {
    const root = document.querySelector('[data-knobs]').shadowRoot;
    return { tab: getComputedStyle(root.querySelectorAll('.term-tab')[2]).color, perf: getComputedStyle(root.querySelector('.perf-key')).color };
  });
  assert.deepEqual(colors, { tab: 'rgb(232, 197, 71)', perf: 'rgb(216, 225, 232)' });
  assert.deepEqual(errors, []);
});

test('tilde opens the performance tab, and closes it again', async () => {
  await fresh();
  await page.keyboard.press('Shift+Backquote');
  assert.equal(await page.locator('.term.open').count(), 1);
  assert.equal(await page.locator('.term').getAttribute('data-view'), 'performance');
  await page.keyboard.press('Shift+Backquote');
  assert.equal(await page.locator('.term.open').count(), 0);
});

test('the performance page has two columns when wide and one below 761 px', async () => {
  await fresh();
  await page.keyboard.press('Shift+Backquote');
  const columns = () => page.locator('.term-page-performance').evaluate(node => getComputedStyle(node).gridTemplateColumns.split(' ').length);
  assert.equal(await columns(), 2);
  await page.setViewportSize({ width: 700, height: 800 });
  assert.equal(await columns(), 1);
});

const countFrames = () => page.evaluate(() => {
  window.__raf = 0;
  const real = window.requestAnimationFrame;
  window.requestAnimationFrame = fn => { window.__raf++; return real(fn); };
});

test('performance samples only while it shows', async () => {
  await fresh();
  await countFrames();
  await page.keyboard.press('Shift+Backquote');
  await page.waitForFunction(() => window.__raf > 2, undefined, { polling: 100 });
  await page.keyboard.press('Shift+Backquote');
  await page.waitForTimeout(100);
  await page.evaluate(() => { window.__raf = 0; });
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.__raf), 0);
});

test('no frame loop survives unmounting', async () => {
  await fresh();
  await countFrames();
  await page.keyboard.press('Shift+Backquote');
  await page.waitForFunction(() => window.__raf > 2, undefined, { polling: 100 });
  await page.evaluate(() => window.__unmount());
  await page.waitForTimeout(100);
  await page.evaluate(() => { window.__raf = 0; });
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.__raf), 0);
});

test('project pages get tabs after performance and before the groups', async () => {
  await fresh('?pages=1');
  await openDrawer(page);
  assert.deepEqual(await page.locator('.term-tab').allTextContents(), ['fixture', 'performance', 'my notes', 'hero', 'scene']);
  await tab('my notes').click();
  assert.equal(await page.locator('.term-page-notes').textContent(), 'page body');
  await page.waitForFunction(() => window.__pageUpdates > 0);
});
