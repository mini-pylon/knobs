import '../../src/drawer.js';
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { collectErrors, copyFixture, launch, newPage, openDrawer, serve } from './lib/harness.mjs';

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

async function fresh() {
  await page?.context().close();
  page = await newPage(browser);
  errors = collectErrors(page);
  await page.goto(site.url);
  await page.locator('[data-knobs]').waitFor({ state: 'attached' });
}
const tab = name => page.locator('.term-tab', { hasText: new RegExp(`^${name}$`) });
const read = id => page.locator(`#read-${id}`).textContent();

test('the drawer mounts in a shadow DOM and leaves the page alone', async () => {
  await fresh();
  const facts = await page.evaluate(() => {
    const host = document.querySelector('[data-knobs]');
    return { shadow: Boolean(host.shadowRoot), light: document.querySelectorAll('.term').length, inside: host.shadowRoot.querySelectorAll('.term').length, name: host.dataset.knobs };
  });
  assert.deepEqual(facts, { shadow: true, light: 0, inside: 1, name: 'fixture' });
  await openDrawer(page);
  assert.equal(await page.evaluate(() => document.body.className), '');
  assert.deepEqual(errors, []);
});

test('the page\'s global CSS does not change the drawer', async () => {
  await fresh();
  await openDrawer(page);
  await tab('hero').click();
  const style = await page.evaluate(() => {
    const root = document.querySelector('[data-knobs]').shadowRoot;
    const read = selector => getComputedStyle(root.querySelector(selector));
    const host = getComputedStyle(document.querySelector('[data-knobs]'));
    return { tab: read('.term-tab').color, key: read('.term-key').color, keyDisplay: read('.term-key').display, value: read('.term-value').color, size: read('.term-key').fontSize, padding: read('.term-tab').paddingLeft, spacing: read('.term-key').letterSpacing, transform: read('.term-key').textTransform, z: host.zIndex, position: host.position, opacity: host.opacity };
  });
  assert.deepEqual(style, { tab: 'rgb(232, 197, 71)', key: 'rgb(232, 197, 71)', keyDisplay: 'block', value: 'rgb(216, 225, 232)', size: '12px', padding: '0px', spacing: 'normal', transform: 'none', z: '2147483647', position: 'fixed', opacity: '1' });
});

test('the drawer\'s CSS does not reach the page', async () => {
  await fresh();
  await openDrawer(page);
  const style = await page.evaluate(() => ({
    padding: getComputedStyle(document.getElementById('page-button')).paddingLeft,
    display: getComputedStyle(document.getElementById('page-row')).display,
  }));
  assert.deepEqual(style, { padding: '50px', display: 'block' });
});

test('the console tab is named after the project and each group has a tab', async () => {
  await fresh();
  await openDrawer(page);
  const names = await page.locator('.term-tab').allTextContents();
  assert.deepEqual(names.filter(name => name !== 'performance'), ['fixture', 'hero', 'scene']);
  assert.equal(await page.locator('.term-prompt span').textContent(), 'fixture $');
});

test('a number row updates a read', async () => {
  await fresh();
  await openDrawer(page);
  await tab('hero').click();
  await page.locator('[role=slider][aria-label="hero.overlay"]').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await read('hero-overlay'), '0.41');
  await page.keyboard.press('Shift+ArrowLeft');
  assert.equal(await read('hero-overlay'), '0.31');
  await page.keyboard.press('Delete');
  assert.equal(await read('hero-overlay'), '0.4');
});

test('dragging a number row sets the value from the pointer', async () => {
  await fresh();
  await openDrawer(page);
  await tab('hero').click();
  await page.waitForTimeout(300);
  const bar = page.locator('[role=slider][aria-label="hero.overlay"]');
  const box = await bar.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  assert.equal(await read('hero-overlay'), '0.5');
});

test('a toggle row updates a read', async () => {
  await fresh();
  await openDrawer(page);
  await tab('hero').click();
  const toggle = page.locator('button[aria-label="hero.badge"]');
  assert.equal(await toggle.textContent(), 'on');
  await toggle.click();
  assert.equal(await toggle.textContent(), 'off');
  assert.equal(await read('hero-badge'), '0');
});

test('a select row is a native select and updates a read', async () => {
  await fresh();
  await openDrawer(page);
  await tab('hero').click();
  const select = page.locator('select[aria-label="hero.variant"]');
  assert.equal(await select.inputValue(), 'split');
  assert.deepEqual(await select.locator('option').allTextContents(), ['split', 'full', 'stacked']);
  await select.selectOption('stacked');
  assert.equal(await read('hero-variant'), 'stacked');
});

test('a text row is a single-line input and updates a read', async () => {
  await fresh();
  await openDrawer(page);
  await tab('hero').click();
  const field = page.locator('input[aria-label="hero.title"]');
  assert.equal(await field.getAttribute('type'), 'text');
  await field.fill('A new line = 2');
  assert.equal(await read('hero-title'), 'A new line = 2');
});

test('a color row is a native color input with its hex beside it', async () => {
  await fresh();
  await openDrawer(page);
  await tab('hero').click();
  const field = page.locator('input[aria-label="hero.accent"]');
  assert.equal(await field.getAttribute('type'), 'color');
  await field.fill('#112233');
  assert.equal(await read('hero-accent'), '#112233');
  assert.equal(await page.locator('[data-path="hero.accent"] .term-value').textContent(), '#112233');
});

test('a hidden group has no tab', async () => {
  await fresh();
  await openDrawer(page);
  assert.equal(await tab('product').count(), 0);
});

test('backtick toggles the drawer', async () => {
  await fresh();
  await page.keyboard.press('Backquote');
  assert.equal(await page.locator('.term.open').count(), 1);
  await page.waitForTimeout(250);
  await page.locator('.term-prompt input').blur();
  await page.keyboard.press('Backquote');
  assert.equal(await page.locator('.term.open').count(), 0);
});

test('the drawer uses a generic monospace stack', async () => {
  await fresh();
  const family = await page.evaluate(() => getComputedStyle(document.querySelector('[data-knobs]').shadowRoot.querySelector('.term')).fontFamily);
  assert.match(family, /monospace/);
  assert.doesNotMatch(family, /Areal/);
});
