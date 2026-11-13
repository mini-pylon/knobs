// The playground (playground/): its stage mounts every scenario clean and
// opens the drawer on the tab it is asked for; its shell shows the system
// views; its grid lays several stages side by side; its drafts mount what an
// agent wrote, from disk or pasted into the shell; its captures mount another
// project's own drawer with its saved values beside shots of the original.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { closeAll, collectErrors, launch, newPage, repo } from './lib/harness.mjs';
import { randomSchema } from '../../playground/random.js';
import { servePlayground } from '../../playground/server.mjs';
import { build } from '../../playground/adapters/common.mjs';
import * as miniPylon from '../../playground/adapters/mini-pylon.mjs';
import * as wingsVdb from '../../playground/adapters/wings-vdb.mjs';

const exemplars = Object.keys(JSON.parse(readFileSync(new URL('./exemplars.json', import.meta.url), 'utf8')));
const exemplarDir = name => join(repo, 'skills', 'knobs', 'exemplars', name);

// A drafts folder of the test's own, holding one draft copied from an exemplar.
mkdirSync(join(repo, 'tests', '.tmp'), { recursive: true });
const drafts = mkdtempSync(join(repo, 'tests', '.tmp', 'drafts-'));
mkdirSync(join(drafts, 'curve-copy'));
for (const file of ['controls.js', 'visual.js']) cpSync(join(exemplarDir('curve-trace'), file), join(drafts, 'curve-copy', file));

// A captures folder of the test's own, built from the fixture copies of both
// projects; wings-vdb's has one shot of its drawer.
const captures = mkdtempSync(join(repo, 'tests', '.tmp', 'captures-'));
const captureFixtures = join(repo, 'tests', 'fixtures', 'captures');
// A 1x1 PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
async function writeCaptures() {
  const wings = await build(wingsVdb, join(captureFixtures, 'wings-vdb'), { reports: join(captureFixtures, 'wings-vdb-browsers') });
  mkdirSync(join(captures, 'wings-vdb', 'shots'), { recursive: true });
  writeFileSync(join(captures, 'wings-vdb', 'shots', '01-wings-vdb.png'), PNG);
  wings.shots = [{ tab: 'wings-vdb', file: 'shots/01-wings-vdb.png' }];
  writeFileSync(join(captures, 'wings-vdb', 'capture.json'), JSON.stringify(wings));
  const pylon = await build(miniPylon, join(captureFixtures, 'mini-pylon'));
  pylon.shotsSkipped = 'the dev server at http://127.0.0.1:5371/ was not answering';
  mkdirSync(join(captures, 'mini-pylon'));
  writeFileSync(join(captures, 'mini-pylon', 'capture.json'), JSON.stringify(pylon));
}

let site, browser;
before(async () => {
  await writeCaptures();
  site = await servePlayground({ drafts, captures, logLevel: 'error' });
  browser = await launch();
});
after(() => closeAll(() => browser?.close(), () => site?.close(), () => rmSync(drafts, { recursive: true, force: true }), () => rmSync(captures, { recursive: true, force: true })));

// Opens one stage and waits until it has mounted or failed.
async function stage(query) {
  const page = await newPage(browser);
  const errors = collectErrors(page);
  await page.goto(`${site.url}stage.html?${query}`);
  await page.locator('body[data-ready], body[data-error]').waitFor();
  const failed = await page.locator('body').getAttribute('data-error');
  return { page, errors: failed ? [...errors, `data-error: ${failed}`] : errors };
}
const tabs = page => page.locator('.term-tab').allInnerTexts();
const activeTab = page => page.locator('.term-tab.active').innerText();

for (const name of exemplars) {
  test(`the stage mounts the ${name} exemplar with the drawer open`, async () => {
    const { page, errors } = await stage(`s=exemplar:${name}`);
    try {
      assert.deepEqual(errors, []);
      await page.locator('.term.open .term-drawer').waitFor();
      const groups = await page.evaluate(() => window.__stage.groups.filter(g => !g.hidden).map(g => g.name));
      const labels = await tabs(page);
      for (const group of groups) assert.ok(labels.includes(group), `tab ${group} in ${labels}`);
    } finally { await page.context().close(); }
  });
}

test('the stage mounts the stress scenario, every control type in it', async () => {
  const { page, errors } = await stage('s=stress');
  try {
    assert.deepEqual(errors, []);
    const types = await page.evaluate(() => [...new Set(window.__stage.groups.flatMap(g => g.controls.map(c => c.type)))].sort());
    assert.deepEqual(types, ['color', 'number', 'select', 'text', 'toggle']);
  } finally { await page.context().close(); }
});

for (let seed = 1; seed <= 20; seed++) {
  test(`the stage mounts random seed ${seed} and opens its last visible group`, async () => {
    const visible = randomSchema(seed).filter(g => !g.hidden).map(g => g.name);
    const last = visible[visible.length - 1];
    const { page, errors } = await stage(`s=random:${seed}&tab=${last}`);
    try {
      assert.deepEqual(errors, []);
      const labels = await tabs(page);
      assert.deepEqual(labels.slice(-visible.length), visible);
      assert.equal(await activeTab(page), last);
    } finally { await page.context().close(); }
  });
}

test('a stage asked for an unknown scenario reports it instead of mounting', async () => {
  const { page, errors } = await stage('s=nope');
  try {
    assert.match(errors.join('\n'), /data-error: unknown scenario: nope/);
  } finally { await page.context().close(); }
});

// The shell: index.html frames one stage and reads it for the system views.
async function shell(query) {
  const page = await newPage(browser, { viewport: { width: 1600, height: 1000 } });
  const errors = collectErrors(page);
  await page.goto(`${site.url}?${query}`);
  const frame = page.frameLocator('iframe.stage');
  await frame.locator('body[data-ready]').waitFor();
  return { page, errors, frame };
}
const view = (page, name) => page.locator(`.views [data-view="${name}"]`);

test('the shell frames the scenario in its query and lists its schema', async () => {
  const { page, errors } = await shell('s=random:7');
  try {
    const paths = randomSchema(7).flatMap(g => g.controls.map(c => `${g.name}.${c.key}`));
    await page.locator('.view-tabs button', { hasText: 'schema' }).click();
    const text = await view(page, 'schema').innerText();
    for (const path of paths) assert.ok(text.includes(path), `schema lists ${path}`);
    assert.deepEqual(errors, []);
  } finally { await page.context().close(); }
});

test('a value changed on the stage shows in the state diff and the event log', async () => {
  const { page, errors } = await shell('s=stress');
  try {
    await page.evaluate(() => document.querySelector('iframe.stage').contentWindow.__stage.store.set('numbers.plain', 0.9));
    await page.locator('.view-tabs button', { hasText: 'state' }).click();
    await assert.doesNotReject(view(page, 'state').getByText('"numbers.plain": 0.9').waitFor());
    await page.locator('.view-tabs button', { hasText: 'events' }).click();
    await assert.doesNotReject(view(page, 'events').getByText('numbers.plain').first().waitFor());
    assert.deepEqual(errors, []);
  } finally { await page.context().close(); }
});

test('the commands view lists an extension\'s pages and commands', async () => {
  const { page, errors } = await shell('s=exemplar:renders-tab');
  try {
    await page.locator('.view-tabs button', { hasText: 'commands' }).click();
    const names = await page.evaluate(() => {
      const { options } = document.querySelector('iframe.stage').contentWindow.__stage;
      return [...(options.pages ?? []).map(p => p.label ?? p.name), ...Object.keys(options.commands ?? {})];
    });
    assert.ok(names.length > 0);
    const text = await view(page, 'commands').innerText();
    for (const name of names) assert.ok(text.includes(name), `commands lists ${name}`);
    assert.deepEqual(errors, []);
  } finally { await page.context().close(); }
});

test('an edited schema remounts the stage with it', async () => {
  const { page, errors } = await shell('s=stress');
  try {
    const schema = [{ name: 'edited', controls: [{ key: 'size', type: 'number', value: 2, min: 0, max: 4, step: 1 }] }];
    await page.locator('.source > textarea').fill(JSON.stringify(schema));
    await page.locator('.source button', { hasText: 'apply' }).click();
    const frame = page.frameLocator('iframe.stage');
    await frame.locator('.term-tab', { hasText: 'edited' }).waitFor();
    assert.deepEqual(errors, []);
  } finally { await page.context().close(); }
});

test('a schema the store refuses shows its error in the shell', async () => {
  const { page } = await shell('s=stress');
  try {
    await page.locator('.source > textarea').fill('[{"name": "bad group"}]');
    await page.locator('.source button', { hasText: 'apply' }).click();
    await assert.doesNotReject(page.locator('.source .error', { hasText: 'bad group name' }).waitFor());
  } finally { await page.context().close(); }
});

test('a width preset resizes the stage frame', async () => {
  const { page } = await shell('s=stress');
  try {
    await page.locator('.widths button', { hasText: '390' }).click();
    const width = await page.locator('iframe.stage').evaluate(f => f.getBoundingClientRect().width);
    assert.equal(Math.round(width), 390);
  } finally { await page.context().close(); }
});

test('reroll moves a random scenario to another seed', async () => {
  const { page } = await shell('s=random:3');
  try {
    await page.locator('.source button', { hasText: 'reroll' }).click();
    await page.waitForURL(url => new URLSearchParams(url.search).get('s') !== 'random:3');
    await page.frameLocator('iframe.stage').locator('body[data-ready]').waitFor();
    assert.match(new URLSearchParams(new URL(page.url()).search).get('s'), /^random:\d+$/);
  } finally { await page.context().close(); }
});

// The grid: several stages side by side, each captioned with its scenario.
async function grid(query) {
  const page = await newPage(browser, { viewport: { width: 1600, height: 1000 } });
  const errors = collectErrors(page);
  await page.goto(`${site.url}grid.html?${query}`);
  await page.locator('body[data-ready]').waitFor({ timeout: 30000 });
  return { page, errors };
}
const captions = page => page.locator('.cell figcaption').allInnerTexts();

test('the grid shows every exemplar, each mounted', async () => {
  const { page, errors } = await grid('set=exemplars');
  try {
    assert.deepEqual((await captions(page)).map(c => c.split(/\s/)[0]), exemplars.map(n => `exemplar:${n}`).sort());
    assert.equal(await page.locator('.cell.failed').count(), 0);
    assert.deepEqual(errors, []);
  } finally { await page.context().close(); }
});

test('the grid shows a run of seeds', async () => {
  const { page, errors } = await grid('set=seeds&from=5&n=4');
  try {
    assert.deepEqual((await captions(page)).map(c => c.split(/\s/)[0]), ['random:5', 'random:6', 'random:7', 'random:8']);
    assert.deepEqual(errors, []);
  } finally { await page.context().close(); }
});

test('the grid opens every stage on the tab it is given', async () => {
  const { page } = await grid('set=seeds&from=1&n=3&tab=performance');
  try {
    const active = await page.locator('.cell iframe').evaluateAll(frames => frames.map(f => {
      const host = f.contentDocument.querySelector('[data-knobs]');
      return host.shadowRoot.querySelector('.term-tab.active').textContent;
    }));
    assert.deepEqual(active, ['performance', 'performance', 'performance']);
  } finally { await page.context().close(); }
});

test('a stage that fails in the grid is marked and captioned with its error', async () => {
  const { page } = await grid('set=seeds&from=1&n=2&tab=nosuchtab');
  try {
    assert.equal(await page.locator('.cell.failed').count(), 2);
    assert.match((await captions(page)).join('\n'), /no tab: nosuchtab/);
  } finally { await page.context().close(); }
});

test('playground:shots saves every tab of a scenario and the grid', async () => {
  const { execFile } = await import('node:child_process');
  const { mkdir, mkdtemp, readdir, rm } = await import('node:fs/promises');
  await mkdir(join(repo, 'tests', '.tmp'), { recursive: true });
  const out = await mkdtemp(join(repo, 'tests', '.tmp', 'shots-'));
  try {
    await new Promise((resolve, reject) => execFile(process.execPath, [join(repo, 'playground', 'shots.mjs'), '--only', 'stress', '--out', out],
      { timeout: 90000 }, (error, stdout, stderr) => (error ? reject(new Error(`${error.message}\n${stderr}`)) : resolve(stdout))));
    const files = (await readdir(out)).sort();
    // console, performance, then the five visible groups; hidden stays hidden.
    assert.deepEqual(files, [
      'grid.png',
      'stress-01-playground.png', 'stress-02-performance.png', 'stress-03-numbers.png', 'stress-04-choices.png',
      'stress-05-copy.png', 'stress-06-colors.png', 'stress-07-aGroupNameLongEnoughToCrowdTheTabRow.png',
    ]);
  } finally { await rm(out, { recursive: true, force: true }); }
});

// Drafts: what an agent wrote, shaped like an exemplar.
test('the stage mounts a draft from the drafts folder, with its picture', async () => {
  const { page, errors } = await stage('s=draft:curve-copy');
  try {
    assert.deepEqual(errors, []);
    assert.ok(await page.evaluate(() => Object.keys(window.__stage.options.visuals ?? {}).length === 1));
  } finally { await page.context().close(); }
});

test('the shell lists drafts in its scenario picker', async () => {
  const { page } = await shell('s=stress');
  try {
    const values = await page.locator('select.scenario option').evaluateAll(options => options.map(o => o.value));
    assert.ok(values.includes('draft:curve-copy'), values.join(' '));
  } finally { await page.context().close(); }
});

test('a draft pasted into the shell is written to the drafts folder and mounted', async () => {
  const { page, errors } = await shell('s=stress');
  try {
    await page.locator('.paste summary').click();
    await page.locator('.paste input[name=name]').fill('pasted-one');
    await page.locator('.paste textarea[name=controls]').fill(readFileSync(join(exemplarDir('angle-dial'), 'controls.js'), 'utf8'));
    await page.locator('.paste textarea[name=visual]').fill(readFileSync(join(exemplarDir('angle-dial'), 'visual.js'), 'utf8'));
    await page.locator('.paste button[type=submit]').click();
    await page.waitForURL(url => new URLSearchParams(url.search).get('s') === 'draft:pasted-one');
    await page.frameLocator('iframe.stage').locator('body[data-ready]').waitFor({ timeout: 20000 });
    assert.ok(existsSync(join(drafts, 'pasted-one', 'controls.js')));
    assert.ok(existsSync(join(drafts, 'pasted-one', 'visual.js')));
    assert.ok(!existsSync(join(drafts, 'pasted-one', 'extension.js')));
    assert.deepEqual(errors, []);
  } finally { await page.context().close(); }
});

test('the draft endpoint refuses a bad name or file, and writes nothing', async () => {
  const post = body => fetch(`${site.url}__playground/draft`, { method: 'POST', headers: { 'content-type': 'application/json', origin: site.url.replace(/\/$/, '') }, body: JSON.stringify(body) });
  for (const body of [
    { name: '../escape', files: { 'controls.js': 'export const groups = []' } },
    { name: 'ok-name', files: { '../controls.js': 'x' } },
    { name: 'ok-name', files: { 'notes.txt': 'x' } },
    { name: 'ok-name', files: { 'visual.js': 'x' } },
  ]) {
    const response = await post(body);
    assert.equal(response.status, 400, JSON.stringify(body));
  }
  assert.ok(!existsSync(join(drafts, 'ok-name')));
  assert.ok(!existsSync(join(drafts, '..', 'escape')));
});

test('the draft endpoint refuses a cross-origin post', async () => {
  const response = await fetch(`${site.url}__playground/draft`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://evil.example' }, body: JSON.stringify({ name: 'x', files: { 'controls.js': 'export const groups = []' } }) });
  assert.equal(response.status, 403);
  assert.ok(!existsSync(join(drafts, 'x')));
});

test('the grid shows the drafts set', async () => {
  const { page, errors } = await grid('set=drafts');
  try {
    assert.ok((await captions(page)).some(c => c.startsWith('draft:curve-copy')));
    assert.equal(await page.locator('.cell.failed').count(), 0);
    assert.deepEqual(errors, []);
  } finally { await page.context().close(); }
});

// Behind a proxy (portal maps https://<name>.<domain> to the local port).
test('the playground answers a host it is told to allow, and takes a same-host https draft post', async () => {
  // A drafts folder of its own: a draft written into the shared one makes the
  // main server reload its open pages, in the middle of the next test.
  const proxiedDrafts = mkdtempSync(join(repo, 'tests', '.tmp', 'drafts-'));
  const proxied = await servePlayground({ drafts: proxiedDrafts, captures, logLevel: 'error', allowedHosts: ['knobs.example.test'] });
  try {
    const { request } = await import('node:http');
    const call = (method, path, headers, body) => new Promise((resolve, reject) => {
      const req = request(`${proxied.url.replace(/\/$/, '')}${path}`, { method, headers }, res => {
        let text = '';
        res.on('data', chunk => { text += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, text }));
      });
      req.on('error', reject);
      req.end(body);
    });
    const page = await call('GET', '/', { host: 'knobs.example.test' });
    assert.equal(page.status, 200);
    assert.match(page.text, /knobs playground/);
    const post = await call('POST', '/__playground/draft', { host: 'knobs.example.test', origin: 'https://knobs.example.test', 'content-type': 'application/json' },
      JSON.stringify({ name: 'via-proxy', files: { 'controls.js': 'export const groups = [];' } }));
    assert.equal(post.status, 200, post.text);
    assert.ok(existsSync(join(proxiedDrafts, 'via-proxy', 'controls.js')));
    const other = await call('POST', '/__playground/draft', { host: 'knobs.example.test', origin: 'https://evil.example', 'content-type': 'application/json' },
      JSON.stringify({ name: 'via-evil', files: { 'controls.js': 'x' } }));
    assert.equal(other.status, 403);
  } finally { await closeAll(() => proxied.close(), () => rmSync(proxiedDrafts, { recursive: true, force: true })); }
});

// The drawer's title (its console tab) names what is mounted.
test('the drawer is titled with the exemplar or draft it mounts', async () => {
  for (const [query, title] of [['s=exemplar:curve-trace', 'curve-trace'], ['s=exemplar:renders-tab', 'renders-tab'], ['s=draft:curve-copy', 'curve-copy'], ['s=stress', 'playground'], ['s=random:4', 'playground']]) {
    const { page, errors } = await stage(query);
    try {
      assert.deepEqual(errors, []);
      assert.equal((await tabs(page))[0], title, query);
      assert.match(await page.locator('.term-prompt span').innerText(), new RegExp(`^${title} \\$`));
    } finally { await page.context().close(); }
  }
});

// Captures: a project's own drawer, as capture.mjs wrote it.
test('the stage mounts a capture titled with its project, its hidden groups without tabs', async () => {
  const { page, errors } = await stage('s=capture:wings-vdb');
  try {
    assert.deepEqual(errors, []);
    const labels = await tabs(page);
    assert.equal(labels[0], 'wings-vdb');
    for (const group of ['dispersal', 'scroll', 'presence', 'sunlight', 'dive']) assert.ok(labels.includes(group), `tab ${group}`);
    for (const group of ['birds', 'hover', 'opening']) assert.ok(!labels.includes(group), `no tab ${group}`);
    assert.equal(await page.evaluate(() => window.__stage.store.control('scroll.hang')), 1.18);
    assert.equal(await page.evaluate(() => window.__stage.capture.set), 'defaults');
  } finally { await page.context().close(); }
});

test('set= mounts a capture with that value set as its file values', async () => {
  const { page, errors } = await stage('s=capture:wings-vdb&set=fixture01');
  try {
    assert.deepEqual(errors, []);
    const live = await page.evaluate(() => ['scroll.hang', 'dispersal.expand', 'sunlight.light'].map(p => window.__stage.store.control(p)));
    assert.deepEqual(live, [1.5, 0.4, 1.2]);
    assert.equal(await page.evaluate(() => window.__stage.capture.set), 'fixture01');
  } finally { await page.context().close(); }
});

test('a capture asked for an unknown value set reports it instead of mounting', async () => {
  const { page, errors } = await stage('s=capture:mini-pylon&set=nope');
  try {
    assert.match(errors.join('\n'), /data-error: unknown value set: nope/);
  } finally { await page.context().close(); }
});

test('the shell lists captures in its picker and shows the capture view only for a capture', async () => {
  const { page } = await shell('s=stress');
  try {
    const values = await page.locator('select.scenario option').evaluateAll(options => options.map(o => o.value));
    assert.ok(values.includes('capture:wings-vdb') && values.includes('capture:mini-pylon'), values.join(' '));
    assert.equal(await page.locator('.view-tabs button[data-for=capture]').isVisible(), false);
  } finally { await page.context().close(); }
});

test('the capture view shows the source, value sets, what did not translate, and the original shots', async () => {
  const { page, errors } = await shell('s=capture:wings-vdb&view=capture');
  try {
    const capture = view(page, 'capture');
    await capture.locator('select.value-set').waitFor();
    const text = await capture.innerText();
    for (const words of ['wings-vdb', 'captured 20', 'not in git', '/defaults', 'viz.js']) assert.ok(text.includes(words), `capture view shows ${words}:\n${text}`);
    assert.deepEqual(await capture.locator('select.value-set option').evaluateAll(o => o.map(x => x.value)), ['defaults', 'fixture01']);
    const shot = capture.locator('figure.shot img');
    await shot.waitFor();
    assert.ok(await shot.evaluate(img => img.complete && img.naturalWidth === 1), 'the shot loads');
    assert.match(await capture.locator('figure.shot figcaption').innerText(), /wings-vdb/);
    // Picking a value set reloads with set= and shows what it dropped.
    await capture.locator('select.value-set').selectOption('fixture01');
    await page.waitForURL(url => new URLSearchParams(url.search).get('set') === 'fixture01');
    await page.frameLocator('iframe.stage').locator('body[data-ready]').waitFor();
    await view(page, 'capture').getByText('nowhere.at').waitFor();
    assert.equal(await page.evaluate(() => document.querySelector('iframe.stage').contentWindow.__stage.store.control('scroll.hang')), 1.5);
    assert.deepEqual(errors, []);
  } finally { await page.context().close(); }
});

test('the capture view says why a capture has no shots', async () => {
  const { page } = await shell('s=capture:mini-pylon&view=capture');
  try {
    await assert.doesNotReject(view(page, 'capture').getByText('was not answering').waitFor());
  } finally { await page.context().close(); }
});

test('the grid shows the captures set', async () => {
  const { page, errors } = await grid('set=captures');
  try {
    assert.deepEqual((await captions(page)).map(c => c.split(/\s/)[0]), ['capture:mini-pylon', 'capture:wings-vdb']);
    assert.equal(await page.locator('.cell.failed').count(), 0);
    assert.deepEqual(errors, []);
  } finally { await page.context().close(); }
});

test('playground:shots takes the captures set', async () => {
  const { execFile } = await import('node:child_process');
  const out = mkdtempSync(join(repo, 'tests', '.tmp', 'shots-'));
  try {
    await new Promise((resolve, reject) => execFile(process.execPath, [join(repo, 'playground', 'shots.mjs'), '--only', 'captures', '--out', out, '--scale', '1'],
      { timeout: 120000, env: { ...process.env, KNOBS_CAPTURES: captures, KNOBS_DRAFTS: drafts } },
      (error, stdout, stderr) => (error ? reject(new Error(`${error.message}\n${stderr}`)) : resolve(stdout))));
    const files = readdirSync(out);
    assert.ok(files.includes('grid.png'));
    assert.ok(files.some(f => f.startsWith('capture-mini-pylon-')) && files.some(f => f.startsWith('capture-wings-vdb-')), files.join(' '));
    assert.deepEqual(files.filter(f => f !== 'grid.png' && !f.startsWith('capture-')), []);
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test('capture.mjs shoots each tab of the project\'s own drawer when its dev server is up', async () => {
  const { createServer } = await import('node:http');
  const { execFile } = await import('node:child_process');
  // A stand-in for the project's page: its drawer's tabs show on the backtick key.
  const html = `<!doctype html><nav class="term-tabs" hidden><button class="term-tab">mini-pylon</button><button class="term-tab">ground</button></nav>
<script>addEventListener('keydown', e => { if (e.key === '\`') document.querySelector('.term-tabs').hidden = false; });</script>`;
  const dev = createServer((req, res) => { res.setHeader('content-type', 'text/html'); res.end(html); });
  await new Promise(resolve => dev.listen(0, '127.0.0.1', resolve));
  const out = mkdtempSync(join(repo, 'tests', '.tmp', 'capture-'));
  try {
    await new Promise((resolve, reject) => execFile(process.execPath,
      [join(repo, 'playground', 'capture.mjs'), 'mini-pylon', join(captureFixtures, 'mini-pylon'), '--out', out, '--dev', `http://127.0.0.1:${dev.address().port}/`],
      { timeout: 60000 }, (error, stdout, stderr) => (error ? reject(new Error(`${error.message}\n${stderr}`)) : resolve(stdout))));
    const capture = JSON.parse(readFileSync(join(out, 'mini-pylon', 'capture.json'), 'utf8'));
    assert.deepEqual(capture.shots, [{ tab: 'mini-pylon', file: 'shots/01-mini-pylon.png' }, { tab: 'ground', file: 'shots/02-ground.png' }]);
    assert.ok(!('shotsSkipped' in capture));
    for (const shot of capture.shots) assert.ok(existsSync(join(out, 'mini-pylon', shot.file)), shot.file);
  } finally {
    dev.close();
    rmSync(out, { recursive: true, force: true });
  }
});
