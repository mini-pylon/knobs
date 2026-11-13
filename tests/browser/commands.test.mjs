import '../../src/drawer.js';
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { closeAll, collectErrors, copyFixture, launch, logText, newPage, openDrawer, serve, type } from './lib/harness.mjs';

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

async function fresh() {
  await page?.context().close();
  page = await newPage(browser);
  errors = collectErrors(page);
  await page.goto(site.url);
  await page.locator('[data-knobs]').waitFor({ state: 'attached' });
}
const isOpen = () => page.locator('.term.open').count().then(Boolean);
const read = id => page.locator(`#read-${id}`).textContent();
const tab = name => page.locator('.term-tab', { hasText: new RegExp(`^${name}$`) });

for (const id of ['page-input', 'page-textarea', 'page-editable']) {
  test(`backtick and tilde are ignored while typing in #${id}`, async () => {
    await fresh();
    await page.locator(`#${id}`).click();
    await page.keyboard.press('Backquote');
    await page.keyboard.press('Shift+Backquote');
    assert.equal(await isOpen(), false);
    const text = await page.locator(`#${id}`).evaluate(node => node.value ?? node.textContent);
    assert.match(text, /`~/);
  });
}

test('backtick is ignored while typing in a text control and at the prompt', async () => {
  await fresh();
  await openDrawer(page);
  await page.locator('.term-tab', { hasText: /^hero$/ }).click();
  const field = page.locator('input[aria-label="hero.title"]');
  await field.fill('');
  await field.press('Backquote');
  assert.equal(await isOpen(), true);
  assert.equal(await field.inputValue(), '`');
  await page.locator('.term-tab', { hasText: /^fixture$/ }).click();
  const prompt = page.locator('.term-prompt input');
  await prompt.press('Backquote');
  assert.equal(await isOpen(), true);
  assert.equal(await prompt.inputValue(), '`');
});

test('Escape closes the drawer from the prompt', async () => {
  await fresh();
  await openDrawer(page);
  await page.locator('.term-prompt input').press('Escape');
  assert.equal(await isOpen(), false);
});

test('Escape with the / menu open closes only the menu, then the drawer', async () => {
  await fresh();
  await openDrawer(page);
  const input = page.locator('.term-prompt input');
  await input.fill('/');
  assert.equal(await page.locator('.term-slash-name').first().isVisible(), true);
  await input.press('Escape');
  assert.equal(await page.locator('.term-slash-name').first().isVisible(), false);
  assert.equal(await isOpen(), true);
  await input.press('Escape');
  assert.equal(await isOpen(), false);
});

test('onFocus reports the drawer and the showing group', async () => {
  await fresh();
  await openDrawer(page);
  assert.deepEqual(await page.evaluate(() => window.__focus), { open: true, groups: [] });
  await page.locator('.term-tab', { hasText: /^hero$/ }).click();
  assert.deepEqual(await page.evaluate(() => window.__focus), { open: true, groups: ['hero'] });
});

test('saved values survive a reload, under the project\'s name', async () => {
  await fresh();
  await openDrawer(page);
  await type(page, 'hero.title Kept across reloads');
  await type(page, 'hero.variant full');
  await page.reload();
  await page.locator('[data-knobs]').waitFor({ state: 'attached' });
  assert.equal(await read('hero-title'), 'Kept across reloads');
  assert.equal(await read('hero-variant'), 'full');
  const keys = await page.evaluate(() => Object.keys(localStorage));
  assert.deepEqual(keys, ['fixture:values']);
});

test('the open drawer and tab survive a reload', async () => {
  await fresh();
  await openDrawer(page);
  await page.locator('.term-tab', { hasText: /^scene$/ }).click();
  await page.reload();
  await page.locator('.term.open .term-drawer').waitFor();
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('fixture:groups'))), ['scene']);
  assert.equal(await page.locator('.term-tab.active').textContent(), 'fixture');
});

test('mountKnobs restores saved values and notifies a listener already subscribed', async () => {
  await fresh();
  await openDrawer(page);
  await type(page, 'hero.title Restored');
  await page.reload();
  await page.locator('[data-knobs]').waitFor({ state: 'attached' });
  assert.equal(await page.locator('#read-listener').textContent(), 'Restored');
});

test('unmounting removes the drawer and its key listener', async () => {
  await fresh();
  await page.evaluate(() => { window.__unmount(); window.__focus = 'untouched'; });
  assert.equal(await page.locator('[data-knobs]').count(), 0);
  await page.keyboard.press('Backquote');
  assert.equal(await page.evaluate(() => window.__focus), 'untouched');
  assert.deepEqual(errors, []);
});

test('mount, unmount, mount leaves one working drawer', async () => {
  await fresh();
  await page.evaluate(() => { window.__unmount(); window.__mount(); });
  assert.equal(await page.locator('[data-knobs]').count(), 1);
  await page.keyboard.press('Backquote');
  assert.equal(await isOpen(), true);
  await type(page, 'hero.title Second mount');
  assert.equal(await read('hero-title'), 'Second mount');
});

test('help names the built-ins and project commands, and not wings-vdb', async () => {
  await fresh();
  await openDrawer(page);
  await type(page, 'help');
  const text = await logText(page);
  for (const word of ['ls [group]', 'get <control>', 'set <control>', 'reset [control|group]', 'on <group>', 'save', 'download [name]', 'load', 'export', 'import <json>', 'clear', 'close', 'ping [word]']) assert.ok(text.includes(word), word);
  assert.doesNotMatch(text, /wings-vdb|\/shot|cycles the view/);
});

test('ls and get describe every type', async () => {
  await fresh();
  await openDrawer(page);
  await type(page, 'ls hero');
  await type(page, 'get hero.title');
  const text = await logText(page);
  assert.match(text, /# hero: Homepage hero/);
  assert.match(text, /variant +split +\[split full stacked\]/);
  assert.match(text, /overlay +0\.40 +\[0\.\.1\]/);
  assert.match(text, /hero\.title = The original headline {2}\(default The original headline\)/);
});

test('reset takes a control, a group or nothing', async () => {
  await fresh();
  await openDrawer(page);
  await type(page, 'hero.title Changed');
  assert.equal(await read('hero-title'), 'Changed');
  await type(page, 'reset hero.title');
  assert.equal(await read('hero-title'), 'The original headline');
  await type(page, 'hero.overlay 0.9');
  assert.equal(await read('hero-overlay'), '0.9');
  await type(page, 'reset hero');
  assert.equal(await read('hero-overlay'), '0.4');
  await type(page, 'hero.badge off');
  assert.equal(await read('hero-badge'), '0');
  await type(page, 'reset');
  assert.equal(await read('hero-badge'), '1');
});

test('export prints only what changed, and import keeps text exactly', async () => {
  await fresh();
  await openDrawer(page);
  await type(page, 'hero.overlay 0.9');
  await type(page, 'export');
  assert.match(await logText(page), /\{\s+"hero\.overlay": 0\.9\s+\}/);
  await type(page, 'import {"hero.title":"a   b"}');
  assert.equal(await read('hero-title'), 'a   b');
});

test('the / menu lists the built-in actions and project commands', async () => {
  await fresh();
  await openDrawer(page);
  await page.locator('.term-prompt input').fill('/');
  assert.deepEqual(await page.locator('.term-slash-name').allTextContents(), ['/save', '/download', '/load', '/reset', '/ping']);
});

test('a project command runs at the prompt', async () => {
  await fresh();
  await openDrawer(page);
  await type(page, 'ping there');
  assert.match(await logText(page), /pong there/);
});

test('the status line shows the project\'s status', async () => {
  await fresh();
  await openDrawer(page);
  await page.waitForFunction(() => document.querySelector('[data-knobs]').shadowRoot.querySelector('.term-status').textContent === 'status-ok');
});

test('download saves a JSON file, and load reads it back', async () => {
  await fresh();
  await openDrawer(page);
  await type(page, 'hero.title Downloaded');
  const [download] = await Promise.all([page.waitForEvent('download'), type(page, 'download my file')]);
  assert.match(download.suggestedFilename(), /^my-\d{8}-\d{4}\.json$/);
  const data = JSON.parse(await readFile(await download.path(), 'utf8'));
  assert.equal(data.app, 'fixture');
  assert.deepEqual(data.values, { 'hero.title': 'Downloaded' });
  assert.equal(data.extra, 'kept');
  await type(page, 'reset');
  await page.locator('.term-file').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
  await page.waitForFunction(() => document.getElementById('read-hero-title').textContent === 'Downloaded');
  assert.equal(await page.evaluate(() => window.__extras), 'kept');
});

test('save without the plugin says so', async () => {
  await fresh();
  await openDrawer(page);
  await type(page, 'save');
  await page.waitForFunction(() => document.querySelector('[data-knobs]').shadowRoot.querySelector('.term-log').textContent.includes('save needs the knobs Vite plugin'));
});

test('a value set at the prompt shows in its row', async () => {
  await fresh();
  await openDrawer(page);
  await type(page, 'hero.title Typed at the prompt');
  await tab('hero').click();
  assert.equal(await page.locator('input[aria-label="hero.title"]').inputValue(), 'Typed at the prompt');
});

test('a text value at the prompt is the rest of the line', async () => {
  await fresh();
  await openDrawer(page);
  await type(page, 'hero.title a = b  12');
  assert.equal(await read('hero-title'), 'a = b  12');
});

test('a value that does not validate is refused at the prompt', async () => {
  await fresh();
  await openDrawer(page);
  await type(page, 'hero.variant nope');
  assert.match(await logText(page), /hero\.variant: invalid value: nope/);
  await type(page, 'hero.accent red');
  assert.match(await logText(page), /hero\.accent: invalid value: red/);
  assert.equal(await read('hero-variant'), 'split');
});

test('numbers clamp and += works at the prompt', async () => {
  await fresh();
  await openDrawer(page);
  await type(page, 'hero.overlay 3');
  assert.match(await logText(page), /hero\.overlay = 1\.00 {2}\(clamped to 0\.\.1\)/);
  await type(page, 'hero.overlay -= .5');
  assert.equal(await read('hero-overlay'), '0.5');
});

test('a hidden group opens with on, and still has no tab', async () => {
  await fresh();
  await openDrawer(page);
  await type(page, 'on product');
  assert.equal(await page.locator('[role=slider][aria-label="product.price"]').count(), 1);
  assert.equal(await tab('product').count(), 0);
});

test('clear empties the log and close hides the drawer', async () => {
  await fresh();
  await openDrawer(page);
  await type(page, 'help');
  await type(page, 'clear');
  assert.equal((await logText(page)).trim(), '');
  await type(page, 'close');
  assert.equal(await isOpen(), false);
});

test('a stored number keeps decimals the step would round away', async () => {
  await fresh();
  await openDrawer(page);
  await type(page, 'ls edge');
  await type(page, 'get edge.bound');
  const listed = await logText(page);
  assert.match(listed, /bound +0\.25 +\[0\.25\.\.0\.75\]/);
  assert.match(listed, /edge\.bound = 0\.25 {2}\(default 0\.25\)/);
  await type(page, 'on edge');
  assert.equal(await page.locator('[data-path="edge.bound"] .term-value').textContent(), '0.25');
  await tab('fixture').click();
  await type(page, 'edge.bound 0.75');
  assert.match(await logText(page), /edge\.bound = 0\.75/);
  await type(page, 'on edge');
  assert.equal(await page.locator('[data-path="edge.bound"] .term-value').textContent(), '0.75');
  assert.deepEqual(await page.locator('.term-changes-line').allTextContents(), ['bound  0.25 → 0.75']);
});

test('no timer survives unmounting', async () => {
  await fresh();
  await openDrawer(page);
  await page.waitForFunction(() => window.__statusCalls > 0);
  await page.evaluate(() => window.__unmount());
  await page.waitForTimeout(50);
  await page.evaluate(() => { window.__statusCalls = 0; });
  await page.waitForTimeout(700);
  assert.equal(await page.evaluate(() => window.__statusCalls), 0);
});

async function trackObjectUrls() {
  await page.evaluate(() => {
    const created = [];
    const revoked = [];
    const create = URL.createObjectURL;
    const revoke = URL.revokeObjectURL;
    URL.createObjectURL = blob => {
      const url = create.call(URL, blob);
      created.push(url);
      return url;
    };
    URL.revokeObjectURL = url => {
      revoked.push(url);
      return revoke.call(URL, url);
    };
    window.__urls = { created, revoked };
  });
}

test('a second download still revokes the first object URL', async () => {
  await fresh();
  await openDrawer(page);
  await trackObjectUrls();
  const first = page.waitForEvent('download');
  await type(page, 'download one');
  await first;
  const second = page.waitForEvent('download');
  await type(page, 'download two');
  await second;
  await page.waitForTimeout(1200);
  const urls = await page.evaluate(() => window.__urls);
  assert.deepEqual([...urls.revoked].sort(), [...urls.created].sort());
  assert.equal(urls.created.length, 2);
});

test('unmount revokes a download object URL that is still pending', async () => {
  await fresh();
  await openDrawer(page);
  await trackObjectUrls();
  const download = page.waitForEvent('download');
  await type(page, 'download now');
  await download;
  await page.waitForFunction(() => window.__urls.created.length === 1);
  await page.evaluate(() => window.__unmount());
  const urls = await page.evaluate(() => window.__urls);
  assert.deepEqual(urls.revoked, urls.created);
});

test('up and down walk command history', async () => {
  await fresh();
  await openDrawer(page);
  const prompt = page.locator('.term-prompt input');
  await type(page, 'hero.overlay 0.5');
  await type(page, 'hero.title Hello');
  await prompt.press('ArrowUp');
  assert.equal(await prompt.inputValue(), 'hero.title Hello');
  await prompt.press('ArrowUp');
  assert.equal(await prompt.inputValue(), 'hero.overlay 0.5');
  await prompt.press('ArrowUp');
  assert.equal(await prompt.inputValue(), 'hero.overlay 0.5');
  await prompt.press('ArrowDown');
  assert.equal(await prompt.inputValue(), 'hero.title Hello');
  await prompt.press('ArrowDown');
  assert.equal(await prompt.inputValue(), '');
});

test('tab completes one match and lists several', async () => {
  await fresh();
  await openDrawer(page);
  const prompt = page.locator('.term-prompt input');
  await prompt.fill('over');
  await prompt.press('Tab');
  assert.equal(await prompt.inputValue(), 'overlay ');
  await prompt.fill('s');
  await prompt.press('Tab');
  assert.equal(await prompt.inputValue(), 's');
  assert.match(await logText(page), /set {2}save {2}scene\.speed/);
  await prompt.fill('reset hero.t');
  await prompt.press('Tab');
  assert.equal(await prompt.inputValue(), 'reset hero.title ');
});

test('the slash menu moves with the arrows, completes on Tab, and runs on Enter', async () => {
  await fresh();
  await openDrawer(page);
  const prompt = page.locator('.term-prompt input');
  await prompt.fill('/');
  await page.locator('.term-slash').waitFor({ state: 'visible' });
  assert.equal(await page.locator('.term-slash-item.active .term-slash-name').textContent(), '/save');
  await prompt.press('ArrowDown');
  assert.equal(await page.locator('.term-slash-item.active .term-slash-name').textContent(), '/download');
  await prompt.press('ArrowUp');
  assert.equal(await page.locator('.term-slash-item.active .term-slash-name').textContent(), '/save');
  await prompt.press('ArrowUp');
  assert.equal(await page.locator('.term-slash-item.active .term-slash-name').textContent(), '/ping');
  await prompt.press('Tab');
  assert.equal(await prompt.inputValue(), '/ping ');
  assert.equal(await page.locator('.term-slash').isHidden(), true);
  await prompt.fill('/');
  await prompt.press('Enter');
  await page.waitForFunction(() => document.querySelector('[data-knobs]').shadowRoot.querySelector('.term-log').textContent.includes('save needs the knobs Vite plugin'));
  assert.equal(await prompt.inputValue(), '');
});

test('double-clicking a control name resets it', async () => {
  await fresh();
  await openDrawer(page);
  await type(page, 'hero.title Changed');
  await tab('hero').click();
  await page.locator('[data-path="hero.title"] .term-key').dblclick();
  assert.equal(await read('hero-title'), 'The original headline');
  assert.match(await page.locator('.term-log').evaluate(node => node.textContent), /reset hero\.title/);
});

test('a click in the console focuses the prompt, except on a control or a text selection', async () => {
  await fresh();
  await openDrawer(page);
  const prompt = page.locator('.term-prompt input');
  const focused = () => prompt.evaluate(node => node === node.getRootNode().activeElement);
  await page.locator('#page-input').click();
  await page.locator('.term-log').click();
  assert.equal(await focused(), true);
  await page.locator('#page-input').click();
  await page.evaluate(() => {
    const button = document.createElement('button');
    button.className = 'test-control';
    button.textContent = 'a control';
    document.querySelector('[data-knobs]').shadowRoot.querySelector('.term-log').append(button);
  });
  await page.locator('.term-log .test-control').click();
  assert.equal(await focused(), false);
  await tab('fixture').click();
  await prompt.evaluate(node => node.blur());
  const stayedBlurred = await page.evaluate(() => {
    const root = document.querySelector('[data-knobs]').shadowRoot;
    const line = root.querySelector('.term-line');
    const range = new Range();
    range.selectNodeContents(line);
    const selection = root.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    root.querySelector('.term-log').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return root.activeElement !== root.querySelector('.term-prompt input');
  });
  assert.equal(stayedBlurred, true);
});
