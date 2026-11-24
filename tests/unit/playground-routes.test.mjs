// wings-vdb's root routes and the root-path table (playground/fixtures/routes.mjs),
// served over HTTP with a fonts folder of the test's own.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allowedRequest, DEFAULTS_REFUSED, fixturesPlugin, fontState, ROOT_PATHS, rootMounts, wingsRoutes } from '../../playground/fixtures/routes.mjs';
import { BASE } from '../../playground/fixtures/wings-vdb/vite.mjs';
import { PREFIX } from '../../playground/fixtures/mini-pylon/api.mjs';

const repo = fileURLToPath(new URL('../..', import.meta.url));
mkdirSync(join(repo, 'tests', '.tmp'), { recursive: true });
const dir = mkdtempSync(join(repo, 'tests', '.tmp', 'routes-'));
// A plain HTTP server with handlers mounted at prefixes, as connect mounts them: the prefix is stripped.
function mount(routes) {
  const server = createServer((req, res) => {
    for (const [prefix, handler] of routes) {
      if (req.url === prefix || req.url.startsWith(`${prefix}/`) || req.url.startsWith(`${prefix}?`)) {
        req.url = req.url.slice(prefix.length) || '/';
        if (!req.url.startsWith('/')) req.url = `/${req.url}`;
        return handler(req, res, () => { res.statusCode = 404; res.end('next'); });
      }
    }
    res.statusCode = 404;
    res.end('no route');
  });
  return new Promise(resolveServer => server.listen(0, '127.0.0.1', () => resolveServer({ server, url: `http://127.0.0.1:${server.address().port}` })));
}
const post = (url, body) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const getJson = async url => (await fetch(url)).json();

let wings;
const fonts = join(dir, 'fonts');
const noFonts = join(dir, 'no-fonts');
before(async () => {
  mkdirSync(fonts);
  mkdirSync(noFonts);
  writeFileSync(join(fonts, 'ABCArealVariable.woff2'), 'areal');
  writeFileSync(join(fonts, 'ABCArealMonoVariable.woff2'), 'mono');
  const wingsSource = join(dir, 'wings-source');
  mkdirSync(join(wingsSource, 'public'), { recursive: true });
  writeFileSync(join(wingsSource, 'public', 'wings-wide.svg'), '<svg/>');
  const local = wingsRoutes({ sourceDir: wingsSource, fonts });
  const fallback = wingsRoutes({ sourceDir: wingsSource, fonts: noFonts });
  wings = await mount([
    ['/local/captures/wings-vdb/fonts', local.fontState], ['/local/fonts', local.fonts],
    ['/fallback/captures/wings-vdb/fonts', fallback.fontState], ['/fallback/fonts', fallback.fonts],
    ['/wings-wide.svg', local.svg], ['/__wings', local.wings],
  ]);
});
after(() => {
  wings?.server.close();
  rmSync(dir, { recursive: true, force: true });
});
test('POST /__wings/defaults answers what the drawer prints as a refusal, and /__wings/report takes a report', async () => {
  const defaults = await post(`${wings.url}/__wings/defaults`, { values: {}, wants: [], dryRun: false });
  assert.equal(defaults.status, 200);
  assert.deepEqual(await defaults.json(), { changes: [], errors: [DEFAULTS_REFUSED] });
  assert.equal(DEFAULTS_REFUSED, 'defaults are not saved in the knobs fixture');
  assert.equal((await post(`${wings.url}/__wings/report`, { storage: {} })).status, 204);
  assert.equal((await fetch(`${wings.url}/__wings/defaults`)).status, 405);
  const other = await post(`${wings.url}/__wings/other`, {});
  assert.equal(other.status, 404);
  assert.equal(await other.text(), 'not found');
});

test('the fonts route serves the two faces from the fonts folder, and says local or fallback', async () => {
  assert.deepEqual(await getJson(`${wings.url}/local/captures/wings-vdb/fonts`), { fonts: 'local' });
  const face = await fetch(`${wings.url}/local/fonts/ABCArealVariable.woff2`);
  assert.equal(face.status, 200);
  assert.equal(face.headers.get('content-type'), 'font/woff2');
  assert.equal(await face.text(), 'areal');
  assert.deepEqual(await getJson(`${wings.url}/fallback/captures/wings-vdb/fonts`), { fonts: 'fallback' });
  assert.equal((await fetch(`${wings.url}/fallback/fonts/ABCArealVariable.woff2`)).status, 404);
  for (const path of ['/local/fonts/other.woff2', '/local/fonts/..%2Fsecret', '/local/fonts/']) {
    const response = await fetch(`${wings.url}${path}`);
    assert.equal(response.status, 404, path);
    const text = await response.text();
    if (path === '/local/fonts/..%2Fsecret') assert.equal(text, 'not found');
  }
  assert.equal(fontState(fonts), 'local');
  assert.equal(fontState(noFonts), 'fallback');
  assert.equal((await fetch(`${wings.url}/wings-wide.svg`)).headers.get('content-type'), 'image/svg+xml');
});

test('a root path with no handler is refused, and the fixture mounts each root path and source prefix', async () => {
  assert.throws(() => rootMounts([{ path: '/extra', owner: 'wings-vdb' }], {}), /ROOT_PATHS has no handler for \/extra/);
  const root = mkdtempSync(join(repo, 'tests', '.tmp', 'routes-'));
  const captures = join(root, 'captures');
  const fontsDir = join(root, 'fonts');
  mkdirSync(captures);
  mkdirSync(fontsDir);
  const mounted = [];
  const server = { httpServer: null, middlewares: { use(route) { mounted.push(route); } } };
  const plugin = fixturesPlugin({ captures, fonts: fontsDir, logLevel: 'error' });
  try {
    await plugin.configureServer(server);
    assert.equal(plugin.boot.error, null);
    for (const entry of ROOT_PATHS) assert.ok(mounted.includes(entry.path), `${entry.path} not in ${mounted.join(', ')}`);
    assert.ok(mounted.includes(BASE), `wings source not mounted from BASE: ${mounted.join(', ')}`);
    assert.ok(mounted.includes(PREFIX), `mini-pylon source not mounted from PREFIX: ${mounted.join(', ')}`);
    assert.ok(mounted.includes(BASE.replace(/source\/$/, 'fonts')));
  } finally {
    await plugin.closeServer();
    rmSync(root, { recursive: true, force: true });
  }
});

test('the root-path table names each path a page asks for outside its prefix, and whose it is', () => {
  assert.deepEqual(ROOT_PATHS, [
    { path: '/wings-wide.svg', owner: 'wings-vdb' },
    { path: '/fonts/', owner: 'wings-vdb' },
    { path: '/__wings/', owner: 'wings-vdb' },
    { path: '/api/', owner: 'mini-pylon' },
  ]);
  for (const path of ['/captures/wings-vdb/source/src/main.js', '/wings-wide.svg', '/fonts/ABCArealVariable.woff2', '/__wings/defaults']) assert.ok(allowedRequest(path, 'wings-vdb'), path);
  for (const path of ['/wings-wide.svgz', '/api/schema', '/captures/mini-pylon/source/', '/src/main.js', '/fonts', '/@vite/client']) assert.ok(!allowedRequest(path, 'wings-vdb'), path);
  for (const path of ['/api/schema', '/captures/mini-pylon/source/out/previews/p.png']) assert.ok(allowedRequest(path, 'mini-pylon'), path);
  for (const path of ['/fonts/ABCArealVariable.woff2', '/tweak.js', '/out/previews/p.png']) assert.ok(!allowedRequest(path, 'mini-pylon'), path);
});

test('a same-host request on another scheme or port is another origin', async () => {
  const { anotherOrigin } = await import('../../playground/fixtures/routes.mjs');
  assert.equal(typeof anotherOrigin, 'function');
  const site = 'http://127.0.0.1:9/';
  assert.equal(anotherOrigin(site, 'https://127.0.0.1:9/probe'), true);
  assert.equal(anotherOrigin(site, 'http://127.0.0.1:10/probe'), true);
  assert.equal(anotherOrigin(site, 'http://127.0.0.1:9/probe'), false);
  assert.equal(anotherOrigin('http://localhost/', 'https://localhost/probe'), true);
});
