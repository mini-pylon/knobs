import '../../src/drawer.js';
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { collectErrors, copyFixture, launch, newPage, openDrawer, serve, type } from './lib/harness.mjs';

let fixture, site, browser, page, errors;

before(async () => {
  fixture = await copyFixture('plain');
  site = await serve(fixture.root);
  browser = await launch();
});
after(async () => {
  await browser?.close();
  await site?.close();
  await fixture?.remove();
});

const read = id => page.locator(`#read-${id}`).textContent();

function blockLocalStorage() {
  return page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() { throw new DOMException('blocked', 'SecurityError'); },
    });
  });
}

function fillLocalStorage() {
  return page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        return {
          getItem: () => null,
          setItem() { throw new DOMException('full', 'QuotaExceededError'); },
          removeItem() { throw new DOMException('full', 'QuotaExceededError'); },
          get length() { return 0; },
          key: () => null,
        };
      },
    });
  });
}

async function openBlocked(block) {
  await page?.context().close();
  page = await newPage(browser);
  await block();
  errors = collectErrors(page);
  await page.goto(site.url);
  await page.locator('[data-knobs]').waitFor({ state: 'attached' });
}

test('a blocked localStorage still mounts, and a set still changes the live value', async () => {
  await openBlocked(blockLocalStorage);
  await openDrawer(page);
  await type(page, 'hero.title Kept in memory');
  assert.equal(await read('hero-title'), 'Kept in memory');
  assert.deepEqual(errors, []);
  await page.reload();
  await page.locator('[data-knobs]').waitFor({ state: 'attached' });
  assert.equal(await read('hero-title'), 'The original headline');
  assert.deepEqual(errors, []);
});

test('a full localStorage still mounts, and a set still changes the live value', async () => {
  await openBlocked(fillLocalStorage);
  await openDrawer(page);
  await type(page, 'hero.title Not stored');
  assert.equal(await read('hero-title'), 'Not stored');
  await page.locator('.term-tab', { hasText: /^scene$/ }).click();
  assert.equal(await page.locator('.term-tab.active').textContent(), 'scene');
  assert.deepEqual(errors, []);
  await page.reload();
  await page.locator('[data-knobs]').waitFor({ state: 'attached' });
  assert.equal(await read('hero-title'), 'The original headline');
});

test('a failure while mounting removes the host it appended', async () => {
  await page?.context().close();
  page = await newPage(browser);
  errors = collectErrors(page);
  await page.goto(`${site.url}?broken=1`);
  await page.waitForFunction(() => window.__boots);
  assert.equal(await page.locator('[data-knobs]').count(), 0);
  assert.ok(errors.some(error => error.includes('mount failed')));
});

test('a failure late in mounting releases everything mounting set up', async () => {
  await page?.context().close();
  page = await newPage(browser);
  await page.addInitScript(() => sessionStorage.setItem('fixture:drawer', '1'));
  errors = collectErrors(page);
  await page.goto(`${site.url}?lateFail=1`);
  await page.waitForFunction(() => window.__boots);
  assert.equal(await page.locator('[data-knobs]').count(), 0);
  assert.ok(errors.some(error => error.includes('focus failed')));
  const calls = () => page.evaluate(() => [window.__statusCalls ?? 0, window.__focusCalls ?? 0]);
  const before = await calls();
  await page.keyboard.press('Backquote');
  await page.waitForTimeout(700);
  assert.deepEqual(await calls(), before);
});

async function openFixture(query, init) {
  await page?.context().close();
  page = await newPage(browser);
  if (init) await page.addInitScript(init);
  errors = collectErrors(page);
  await page.goto(`${site.url}?${query}`);
  await page.waitForFunction(() => window.__boots);
}

test('a page saves a value on unmount while the store is still attached', async () => {
  await openFixture('pageSave=1');
  await page.locator('[data-knobs]').waitFor({ state: 'attached' });
  await page.evaluate(() => window.__unmount());
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('fixture:values') ?? '{}'));
  assert.equal(stored['hero.title'], 'Saved on destroy');
});

test('a page whose hide throws does not stop the others being released', async () => {
  await openFixture('hideFail=1');
  await page.locator('[data-knobs]').waitFor({ state: 'attached' });
  const thrown = await page.evaluate(() => { try { window.__unmount(); return null; } catch (error) { return error.message; } });
  assert.equal(thrown, 'hide failed');
  assert.deepEqual((await page.evaluate(() => window.__destroyed)).sort(), ['one', 'two']);
  assert.equal(await page.locator('[data-knobs]').count(), 0);
});

test('a listener that throws while the store attaches leaves the store detached', async () => {
  await openFixture('attachFail=1', () => localStorage.setItem('fixture:values', JSON.stringify({ 'hero.title': 'Stored' })));
  assert.equal(await page.locator('[data-knobs]').count(), 0);
  assert.ok(errors.some(error => error.includes('listener failed')));
  await page.evaluate(() => window.__knobs.set('hero.overlay', 0.9));
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('fixture:values')));
  assert.deepEqual(stored, { 'hero.title': 'Stored' });
});

