// The shell on a capture's source side (playground/shell.js, side=source):
// the project's own page in the stage frame, seeded through its own storage
// keys; the capture pane built from the capture's data; the source | knobs
// switch; and the fixture line. The captures are built from the stand-in
// checkouts under tests/fixtures/captures (lib/captures.mjs); the fonts
// folder is the test's own and empty.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { closeAll, launch, newPage, repo } from './lib/harness.mjs';
import { captureFixtures, collectPageErrors, writeCaptures } from './lib/captures.mjs';
import { servePlayground } from '../../playground/server.mjs';

mkdirSync(join(repo, 'tests', '.tmp'), { recursive: true });
const captures = mkdtempSync(join(repo, 'tests', '.tmp', 'captures-'));
const fonts = mkdtempSync(join(repo, 'tests', '.tmp', 'fonts-'));
const drafts = mkdtempSync(join(repo, 'tests', '.tmp', 'drafts-'));

let site, browser;
before(async () => {
  await writeCaptures(captures);
  site = await servePlayground({ drafts, captures, fonts, logLevel: 'error' });
  browser = await launch();
});
after(() => closeAll(() => browser?.close(), () => site?.close(), ...[captures, fonts, drafts].map(dir => () => rmSync(dir, { recursive: true, force: true }))));

const capture = project => JSON.parse(readFileSync(join(captures, project, 'capture.json'), 'utf8'));

// The shell, on a capture's source side.
async function shell(query) {
  const page = await newPage(browser, { viewport: { width: 1600, height: 1000 } });
  const errors = collectPageErrors(page);
  await page.goto(`${site.url}?${query}`);
  return { page, errors };
}
const frame = page => page.frameLocator('iframe.stage');
// The stage frame, once it shows a source page.
const sourceFrame = page => page.frames().find(f => f.url().includes('/source/'));
const view = (page, name) => page.locator(`.views [data-view="${name}"]`);

test('side=source frames the project\'s page and builds the capture pane from the capture\'s data, without __stage', async () => {
  const { page, errors } = await shell('s=capture:wings-vdb&view=capture&side=source&fixtures=1');
  try {
    await page.locator('body[data-source-ready="dispersal"]').waitFor();
    assert.equal(await page.locator('iframe.stage').getAttribute('src'), '/captures/wings-vdb/source/');
    assert.equal(await sourceFrame(page).evaluate(() => typeof window.__stage), 'undefined');
    const pane = view(page, 'capture');
    const text = await pane.innerText();
    for (const words of ['not in git', 'not translated', 'viz.js']) assert.ok(text.includes(words), `capture pane shows ${words}`);
    assert.deepEqual(await pane.locator('select.value-set option').evaluateAll(o => o.map(x => x.value)), ['defaults', 'fixture01']);
    // The editor holds the capture's knobs groups at once.
    const groups = JSON.parse(await page.locator('textarea[aria-label="Schema JSON"]').inputValue());
    assert.deepEqual(groups.map(g => g.name), capture('wings-vdb').groups.map(g => g.name));
    // The other panes say they describe the knobs side.
    await page.locator('.view-tabs button[data-for=schema]').click();
    assert.match(await view(page, 'schema').innerText(), /describes the knobs side/);
    assert.deepEqual(errors, []);
  } finally { await page.context().close(); }
});

test('a value set and a tab reach each source page through its own keys, in its own encoding', async () => {
  {
    const { page, errors } = await shell('s=capture:wings-vdb&set=fixture01&tab=scroll&side=source');
    try {
      await page.locator('body[data-source-ready="scroll"]').waitFor();
      const report = JSON.parse(readFileSync(join(captureFixtures, 'wings-vdb-browsers', 'fixture01.json'), 'utf8'));
      const stored = await sourceFrame(page).evaluate(() => ({ params: localStorage.getItem('wings-vdb:params'), groups: localStorage.getItem('wings-vdb:groups'), drawer: sessionStorage.getItem('wings-vdb:drawer') }));
      assert.deepEqual(JSON.parse(stored.params), JSON.parse(report.storage['wings-vdb:params']));
      assert.equal(stored.groups, '["scroll"]');
      assert.equal(stored.drawer, '1');
      // The page migrated dispersal.hang to scroll.hang itself.
      assert.equal(await frame(page).locator('.term-row[data-path="scroll.hang"] .term-value').innerText(), '1.5');
      assert.deepEqual(errors, []);
    } finally { await page.context().close(); }
  }
  {
    const { page, errors } = await shell('s=capture:mini-pylon&set=dusk&tab=light&side=source');
    try {
      await page.locator('body[data-source-ready="light"]').waitFor();
      assert.equal(await frame(page).locator('.term-row[data-path="light.sun_elevation"] .term-value').innerText(), '4');
      assert.equal(await sourceFrame(page).evaluate(() => localStorage.getItem('mini-pylon-tweak:view')), '"params"');
      assert.deepEqual(errors, []);
    } finally { await page.context().close(); }
  }
});

test('the seed starts a source page without the keys an earlier visit left', async () => {
  const page = await newPage(browser, { viewport: { width: 1600, height: 1000 } });
  try {
    await page.goto(`${site.url}captures/wings-vdb/fonts`);
    await page.evaluate(() => {
      localStorage.setItem('wings-vdb:flags', '{"waitlist":true}');
      localStorage.setItem('wings-vdb:texture', 'grain');
      localStorage.setItem('mini-pylon-tweak:history', '[]');
      sessionStorage.setItem('wings-vdb:defaults-note', 'old');
      localStorage.setItem('knobs-playground:json', '[]');
    });
    await page.goto(`${site.url}?s=capture:wings-vdb&side=source`);
    await page.locator('body[data-source-ready]').waitFor();
    // flags.js read no waitlist flag: it was gone before the page started.
    assert.equal(await page.frameLocator('iframe.stage').locator('body').getAttribute('data-waitlist'), 'false');
    const left = await page.evaluate(() => [...Array(localStorage.length).keys()].map(i => localStorage.key(i)).sort());
    assert.deepEqual(left, ['knobs-playground:json', 'wings-vdb:groups', 'wings-vdb:params']);
    assert.equal(await page.evaluate(() => sessionStorage.getItem('wings-vdb:defaults-note')), null);
  } finally { await page.context().close(); }
});

test('the knobs side of a capture keeps its state under knobs-<project> and leaves the source page\'s keys alone', async () => {
  const { page } = await shell('s=capture:wings-vdb&tab=scroll&side=source');
  try {
    await page.locator('body[data-source-ready="scroll"]').waitFor();
    // Same context, same storage: a stage of the knobs side.
    const knobs = await page.context().newPage();
    await knobs.goto(`${site.url}stage.html?s=capture:wings-vdb&tab=presence`);
    await knobs.locator('body[data-ready]').waitFor();
    assert.equal(await knobs.locator('.term-tab').first().innerText(), 'knobs-wings-vdb');
    const keys = await knobs.evaluate(() => ({
      local: Object.fromEntries([...Array(localStorage.length).keys()].map(i => localStorage.key(i)).map(k => [k, localStorage.getItem(k)])),
      session: Object.fromEntries([...Array(sessionStorage.length).keys()].map(i => sessionStorage.key(i)).map(k => [k, sessionStorage.getItem(k)])),
    }));
    assert.equal(keys.local['wings-vdb:groups'], '["scroll"]');
    assert.equal(keys.local['wings-vdb:params'], '{}');
    assert.equal(keys.local['knobs-wings-vdb:groups'], '["presence"]');
    assert.ok(Object.keys(keys.local).filter(k => k.startsWith('wings-vdb:')).every(k => ['wings-vdb:groups', 'wings-vdb:params'].includes(k)));
  } finally { await page.context().close(); }
});

test('the source | knobs switch keeps set, tab and view, and maps the console tab across', async () => {
  const { page, errors } = await shell('s=capture:wings-vdb&set=fixture01&tab=scroll&view=capture');
  try {
    const switcher = view(page, 'capture').locator('.side-switch');
    await switcher.waitFor();
    assert.equal(await switcher.locator('button.on').innerText(), 'knobs');
    await switcher.locator('button[data-side=source]').click();
    await page.waitForURL(url => new URLSearchParams(url.search).get('side') === 'source');
    const query = new URLSearchParams(new URL(page.url()).search);
    assert.deepEqual(['set', 'tab', 'view'].map(k => query.get(k)), ['fixture01', 'scroll', 'capture']);
    await page.locator('body[data-source-ready="scroll"]').waitFor();
    await view(page, 'capture').locator('.side-switch button[data-side=knobs]').click();
    await page.waitForURL(url => new URLSearchParams(url.search).get('side') === 'knobs');
    await page.frameLocator('iframe.stage').locator('body[data-ready]').waitFor();
    assert.equal(new URLSearchParams(new URL(page.url()).search).get('tab'), 'scroll');
    assert.deepEqual(errors, []);
  } finally { await page.context().close(); }
  const { page: other } = await shell('s=capture:wings-vdb&tab=wings-vdb&view=capture&side=source');
  try {
    await other.locator('body[data-source-ready="wings-vdb"]').waitFor();
    await view(other, 'capture').locator('.side-switch button[data-side=knobs]').click();
    await other.waitForURL(url => new URLSearchParams(url.search).get('side') === 'knobs');
    assert.equal(new URLSearchParams(new URL(other.url()).search).get('tab'), 'knobs-wings-vdb');
    await other.frameLocator('iframe.stage').locator('body[data-ready]').waitFor();
  } finally { await other.context().close(); }
});

test('the fixture line names the snapshot, the stubs, what the stand-in refuses and the fonts', async () => {
  {
    const { page } = await shell('s=capture:wings-vdb&view=capture&side=source');
    try {
      const line = view(page, 'capture').locator('.fixture');
      await line.getByText('fonts: fallback').waitFor();
      const text = await line.innerText();
      for (const words of ['snapshot of wings-vdb', 'stubbed: src/chat.js, src/dev-report.js', 'not in the fixture: saving defaults', 'fonts: fallback (ABC Areal is not in this checkout)']) assert.ok(text.includes(words), `fixture line shows ${words}:\n${text}`);
    } finally { await page.context().close(); }
  }
  {
    const { page } = await shell('s=capture:mini-pylon&view=capture');
    try {
      const text = await view(page, 'capture').locator('.fixture').innerText();
      for (const words of ['snapshot of mini-pylon', 'stubbed: none', 'not in the fixture: finals']) assert.ok(text.includes(words), `fixture line shows ${words}:\n${text}`);
      assert.ok(!text.includes('fonts'));
    } finally { await page.context().close(); }
  }
});
