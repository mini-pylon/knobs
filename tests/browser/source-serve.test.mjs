// The source fixtures as the playground serves them (playground/fixtures):
// each project's own page under /captures/<project>/source/, the root paths
// its page asks for, the wings-vdb fixture's Vite and its HMR on the
// playground's port, and the server's close. The captures are built from the
// stand-in checkouts under tests/fixtures/captures (lib/captures.mjs); the
// fonts folder is the test's own and empty.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { join } from 'node:path';
import { closeAll, launch, newPage, repo } from './lib/harness.mjs';
import { writeCaptures } from './lib/captures.mjs';
import { servePlayground } from '../../playground/server.mjs';
import { allowedRequest, ROOT_PATHS } from '../../playground/fixtures/routes.mjs';
import { BASE } from '../../playground/fixtures/wings-vdb/vite.mjs';
import { PREFIX } from '../../playground/fixtures/mini-pylon/api.mjs';
import { openSourceTab, seedSource, sourceSeed } from '../../playground/fixtures/source-side.js';

mkdirSync(join(repo, 'tests', '.tmp'), { recursive: true });
const captures = mkdtempSync(join(repo, 'tests', '.tmp', 'captures-'));
const fonts = mkdtempSync(join(repo, 'tests', '.tmp', 'fonts-'));
const drafts = mkdtempSync(join(repo, 'tests', '.tmp', 'drafts-'));
// Every file under a folder with its size and mtime, to show a run wrote nothing there.
const listing = dir => readdirSync(dir, { recursive: true }).sort().map(f => {
  const s = statSync(join(dir, f));
  return `${f} ${s.size} ${s.mtimeMs}`;
});

let site, browser, written;
before(async () => {
  await writeCaptures(captures);
  written = listing(captures);
  site = await servePlayground({ drafts, captures, fonts, logLevel: 'error' });
  browser = await launch();
});
after(() => closeAll(() => browser?.close(), () => site?.close(), ...[captures, fonts, drafts].map(dir => () => rmSync(dir, { recursive: true, force: true }))));

const capture = project => JSON.parse(readFileSync(join(captures, project, 'capture.json'), 'utf8'));

// A project's own page, seeded as the shell seeds it and open on a tab, with
// what it requested and the console errors it logged (each with where from).
async function sourcePage(project, set, tab) {
  const page = await newPage(browser);
  const requests = [];
  const errors = [];
  page.on('request', r => requests.push(new URL(r.url())));
  page.on('pageerror', e => errors.push({ text: `pageerror: ${e.message}`, at: '' }));
  page.on('console', m => { if (m.type() === 'error') errors.push({ text: m.text(), at: m.location().url ? new URL(m.location().url).pathname : '' }); });
  const responses = new Map();
  page.on('response', r => responses.set(new URL(r.url()).pathname, r.status()));
  // Any page of the playground's origin will do to write the seed.
  await page.goto(`${site.url}captures/wings-vdb/fonts`);
  await page.evaluate(seedSource, sourceSeed(project, capture(project), set, tab));
  requests.length = 0;
  await page.goto(`${site.url}captures/${project}/source/`);
  await page.evaluate(openSourceTab, { tab });
  return { page, requests, errors, responses };
}
const origin = () => new URL(site.url).origin;
const outsideTable = (requests, project) => requests.filter(u => u.origin === origin() && !allowedRequest(u.pathname, project)).map(u => u.pathname);

test('the wings-vdb page loads under its prefix with its stubs, and each root path it asks for reaches its owner', async () => {
  const { page, requests, errors, responses } = await sourcePage('wings-vdb', 'defaults', 'dispersal');
  try {
    await page.locator('body[data-wordmark="loaded"]').waitFor();
    await page.locator('.term-log', { hasText: 'defaults: nothing to change' }).waitFor();
    const log = await page.locator('.term-log').innerText();
    assert.match(log, /defaults: defaults are not saved in the knobs fixture/);
    // The stub thread: empty, a panel, nothing to lay out.
    assert.equal(await page.locator('body').getAttribute('data-chat'), 'empty panel 0 0');
    assert.equal(await page.locator('.detail').innerText(), 'Wings, the stand-in.');
    assert.equal(await page.locator('.term-viz canvas').count(), 1);
    const paths = requests.filter(u => u.origin === origin()).map(u => u.pathname);
    const wingsRoots = ROOT_PATHS.filter(entry => entry.owner === 'wings-vdb');
    for (const path of [`${BASE}src/main.js`, `${BASE}cloud-fallback.svg`]) assert.ok(paths.includes(path), `requested ${path}:\n${paths.join('\n')}`);
    for (const entry of wingsRoots) assert.ok(paths.some(path => path === entry.path || path.startsWith(entry.path)), `requested ${entry.path}:\n${paths.join('\n')}`);
    assert.ok(paths.some(p => p.startsWith('/captures/wings-vdb/source/playground/fixtures/wings-vdb/stubs/chat.js') || p.endsWith('/stubs/chat.js')), `the chat stub is served:\n${paths.join('\n')}`);
    assert.ok(!paths.some(p => p.endsWith('/src/chat.js') || p.endsWith('/src/dev-report.js')), 'the real chat.js and dev-report.js are never asked for');
    assert.equal(responses.get('/wings-wide.svg'), 200);
    assert.equal(responses.get('/__wings/defaults'), 200);
    assert.equal(responses.get('/captures/wings-vdb/source/cloud-fallback.svg'), 200);
    // The test's fonts folder is empty: the faces fall back, and nothing else fails.
    assert.equal(responses.get('/fonts/ABCArealVariable.woff2'), 404);
    assert.deepEqual(errors.filter(e => !e.at.startsWith('/fonts/')).map(e => e.text), []);
    assert.deepEqual(outsideTable(requests, 'wings-vdb'), []);
  } finally { await page.context().close(); }
});

test('the mini-pylon page loads under its prefix, its /api calls reach the stand-in, and its preview shows', async () => {
  const { page, requests, errors } = await sourcePage('mini-pylon', 'defaults', 'ground');
  try {
    await page.locator('body[data-preview]').waitFor();
    assert.equal(await page.locator('body').getAttribute('data-preview'), 'done 480 0');
    assert.ok(await page.locator('img.render').evaluate(img => img.complete && img.naturalWidth === 256), 'the swatch loads');
    const paths = requests.filter(u => u.origin === origin()).map(u => u.pathname);
    const apiRoot = ROOT_PATHS.find(entry => entry.owner === 'mini-pylon').path;
    for (const path of [`${PREFIX}/tweak.js`, `${PREFIX}/tweak.css`, `${apiRoot}schema`, `${apiRoot}render`]) assert.ok(paths.includes(path), `requested ${path}`);
    assert.ok(paths.some(p => p.startsWith('/api/jobs/')));
    assert.ok(paths.some(p => p.startsWith('/captures/mini-pylon/source/out/previews/')));
    assert.deepEqual(errors.map(e => e.text), []);
    assert.deepEqual(outsideTable(requests, 'mini-pylon'), []);
  } finally { await page.context().close(); }
});

test('the renders tab of the mini-pylon page shows each final from the fixture', async () => {
  const { page, errors } = await sourcePage('mini-pylon', 'defaults', 'renders');
  try {
    const img = page.locator('.finals img');
    await img.waitFor();
    assert.ok(await img.evaluate(i => i.src.includes('/captures/mini-pylon/source/renders/help-')));
    await page.waitForFunction(() => document.querySelector('.finals img').complete);
    assert.ok(await img.evaluate(i => i.naturalWidth === 2));
    assert.deepEqual(errors.map(e => e.text), []);
  } finally { await page.context().close(); }
});

test('the wings-vdb fixture\'s HMR client connects on the playground\'s own port, at the fixture\'s base', async () => {
  const page = await newPage(browser);
  try {
    const sockets = [];
    page.on('websocket', ws => sockets.push(new URL(ws.url())));
    await page.goto(`${site.url}captures/wings-vdb/source/`);
    await page.waitForFunction(() => document.querySelector('.term'));
    await page.waitForTimeout(500);
    assert.ok(sockets.length >= 1, 'an HMR socket opened');
    for (const url of sockets) {
      assert.equal(url.port, String(site.port), url.href);
      assert.equal(url.pathname, BASE, url.href);
    }
  } finally { await page.context().close(); }
});

test('every root path is answered by its fixture, not by the playground page', async () => {
  for (const entry of ROOT_PATHS) {
    const response = await fetch(`${site.url}${entry.path.slice(1)}`);
    const text = await response.text();
    assert.doesNotMatch(text, /<title>knobs playground<\/title>/, `${entry.path} ${response.status} ${text.slice(0, 120)}`);
  }
});

test('the playground\'s own pages are still the playground\'s while the fixtures are mounted', async () => {
  for (const [path, title] of [['', 'knobs playground'], ['grid.html', 'knobs grid'], ['stage.html', 'knobs stage']]) {
    const text = await (await fetch(`${site.url}${path}`)).text();
    assert.match(text, new RegExp(`<title>${title}</title>`), path || '/');
  }
  assert.equal((await fetch(`${site.url}shell.js`)).status, 200);
});

test('the source pages and their root paths answer a proxy\'s allowed host, and refuse any other', async () => {
  const proxied = await servePlayground({ drafts, captures, fonts, logLevel: 'error', allowedHosts: ['knobs.example.test'] });
  const call = (path, host) => new Promise((resolve, reject) => {
    const req = request(`${proxied.url.replace(/\/$/, '')}${path}`, { headers: { host } }, res => {
      let text = '';
      res.on('data', chunk => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, text }));
    });
    req.on('error', reject);
    req.end();
  });
  try {
    const page = await call(BASE, 'knobs.example.test');
    assert.equal(page.status, 200);
    assert.match(page.text, new RegExp(`src="${BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}src/main\\.js"`));
    const apiRoot = ROOT_PATHS.find(entry => entry.owner === 'mini-pylon').path;
    const svg = ROOT_PATHS.find(entry => entry.owner === 'wings-vdb' && !entry.path.endsWith('/'));
    for (const path of [`${BASE}src/main.js`, svg.path, `${apiRoot}schema`, `${PREFIX}/`]) {
      assert.equal((await call(path, 'knobs.example.test')).status, 200, path);
    }
    for (const entry of ROOT_PATHS) {
      const response = await call(entry.path, 'knobs.example.test');
      assert.doesNotMatch(response.text, /knobs playground/, entry.path);
    }
    const refused = await call('/captures/wings-vdb/source/', 'evil.example');
    assert.equal(refused.status, 403);
    assert.equal(refused.text, 'Blocked request. This host ("evil.example") is not allowed.\nTo allow this host, add "evil.example" to `server.allowedHosts` in vite.config.js.');
  } finally { await proxied.close(); }
});

test('the fonts route says local when the fonts folder holds both faces', async () => {
  const local = mkdtempSync(join(repo, 'tests', '.tmp', 'fonts-'));
  for (const face of ['ABCArealVariable.woff2', 'ABCArealMonoVariable.woff2']) writeFileSync(join(local, face), 'x');
  const served = await servePlayground({ drafts, captures, fonts: local, logLevel: 'error' });
  try {
    assert.deepEqual(await (await fetch(`${served.url}captures/wings-vdb/fonts`)).json(), { fonts: 'local' });
    assert.equal((await fetch(`${served.url}fonts/ABCArealVariable.woff2`)).status, 200);
  } finally { await closeAll(() => served.close(), () => rmSync(local, { recursive: true, force: true })); }
});

test('closing the playground closes the wings-vdb fixture too: the process exits on its own', async () => {
  const script = `
    import { servePlayground } from ${JSON.stringify(join(repo, 'playground', 'server.mjs'))};
    const site = await servePlayground({ captures: ${JSON.stringify(captures)}, drafts: ${JSON.stringify(drafts)}, fonts: ${JSON.stringify(fonts)}, logLevel: 'error' });
    await (await fetch(site.url + 'captures/wings-vdb/source/src/main.js')).text();
    await site.close();
    console.log('closed');
  `;
  const started = Date.now();
  const run = await new Promise(resolve => execFile(process.execPath, ['--input-type=module', '-e', script], { timeout: 20000 }, (error, stdout, stderr) => resolve({ error, stdout, stderr })));
  assert.equal(run.error, null, `the process did not exit by itself: ${run.error?.message}\n${run.stderr}`);
  assert.match(run.stdout, /closed/);
  assert.ok(Date.now() - started < 20000);
});

test('nothing a source page does writes under the captures folder', () => {
  assert.deepEqual(listing(captures), written);
});
