// wings-vdb's root routes and the root-path table (playground/fixtures/routes.mjs),
// served over HTTP with a fonts folder of the test's own.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allowedRequest, DEFAULTS_REFUSED, fontState, ROOT_PATHS, wingsRoutes } from '../../playground/fixtures/routes.mjs';

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
  assert.equal((await post(`${wings.url}/__wings/other`, {})).status, 404);
});

test('the fonts route serves the two faces from the fonts folder, and says local or fallback', async () => {
  assert.deepEqual(await getJson(`${wings.url}/local/captures/wings-vdb/fonts`), { fonts: 'local' });
  const face = await fetch(`${wings.url}/local/fonts/ABCArealVariable.woff2`);
  assert.equal(face.status, 200);
  assert.equal(face.headers.get('content-type'), 'font/woff2');
  assert.equal(await face.text(), 'areal');
  assert.deepEqual(await getJson(`${wings.url}/fallback/captures/wings-vdb/fonts`), { fonts: 'fallback' });
  assert.equal((await fetch(`${wings.url}/fallback/fonts/ABCArealVariable.woff2`)).status, 404);
  for (const path of ['/local/fonts/other.woff2', '/local/fonts/..%2Fsecret', '/local/fonts/']) assert.equal((await fetch(`${wings.url}${path}`)).status, 404, path);
  assert.equal(fontState(fonts), 'local');
  assert.equal(fontState(noFonts), 'fallback');
  assert.equal((await fetch(`${wings.url}/wings-wide.svg`)).headers.get('content-type'), 'image/svg+xml');
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
