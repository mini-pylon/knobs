// The stand-in for mini-pylon's tools/tweak_server.py
// (playground/fixtures/mini-pylon/api.mjs), served over HTTP from a snapshot
// of the stand-in checkout under tests/fixtures/captures, whose swatch.json
// holds what Python drew for each pinned payload.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { snapshot } from '../../playground/adapters/common.mjs';
import * as miniPylon from '../../playground/adapters/mini-pylon.mjs';
import { FINALS_REFUSED, miniPylon as standIn, swatch } from '../../playground/fixtures/mini-pylon/api.mjs';
import { dumps, loads, PyNum, resolve, typedVars } from '../../playground/fixtures/mini-pylon/python.mjs';
import { decodePng, pngSize } from '../../playground/png.mjs';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const fixtures = join(repo, 'tests', 'fixtures', 'captures');
mkdirSync(join(repo, 'tests', '.tmp'), { recursive: true });
const dir = mkdtempSync(join(repo, 'tests', '.tmp', 'fixtures-'));
const source = join(dir, 'mini-pylon-source');
const data = name => JSON.parse(readFileSync(join(source, 'data', name), 'utf8'));
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

let pylon;
before(async () => {
  await snapshot(miniPylon, join(fixtures, 'mini-pylon'), source, { downscale: () => { throw new Error('no downscale'); } });
  const api = standIn(source);
  pylon = await mount([['/api', api.api], ['/captures/mini-pylon/source', api.files]]);
});
after(() => {
  pylon?.server.close();
  rmSync(dir, { recursive: true, force: true });
});
async function preview(payloadText) {
  const job = await (await post(`${pylon.url}/api/render`, payloadText)).json();
  return { job, done: await getJson(`${pylon.url}/api/jobs/${job.id}`) };
}
const swatchPayloads = () => data('swatch.json');
test('the stand-in answers the schema, the finals and the status as recorded', async () => {
  assert.deepEqual(await getJson(`${pylon.url}/api/schema`), data('schema.json'));
  const finals = await getJson(`${pylon.url}/api/finals`);
  assert.deepEqual(finals, data('finals.json'));
  assert.ok(finals[0].url.startsWith('/captures/mini-pylon/source/renders/'));
  assert.deepEqual(await getJson(`${pylon.url}/api/status`), { running: null, waiting: [] });
});

test('a preview is a job in the server\'s public fields, done on its first poll with numeric seconds', async () => {
  const { job, done } = await preview(swatchPayloads()[0].payload);
  const fields = ['id', 'kind', 'state', 'size', 'samples', 'url', 'seconds', 'error', 'name', 'ahead'];
  assert.deepEqual(Object.keys(job), fields);
  assert.deepEqual(Object.keys(done), fields);
  assert.equal(job.kind, 'preview');
  assert.equal(job.ahead, 0);
  assert.equal(done.state, 'done');
  assert.equal(done.seconds, 0);
  assert.equal(done.size, 480);
  assert.equal(done.samples, 24);
  assert.equal(done.error, null);
});

for (const [i, about] of ['the defaults', 'a float-bound clamp', 'an int-bound clamp of a non-integer', 'a lowercase colour and a toggle sent as true'].entries()) {
  test(`a preview of ${about} is the swatch Python draws for it`, async () => {
    const recorded = swatchPayloads()[i];
    const { done } = await preview(recorded.payload);
    assert.ok(done.url.startsWith('/captures/mini-pylon/source/out/previews/'), done.url);
    const response = await fetch(`${pylon.url}${done.url}`);
    assert.equal(response.headers.get('content-type'), 'image/png');
    const png = decodePng(Buffer.from(await response.arrayBuffer()));
    assert.equal(png.width, recorded.size);
    assert.equal(png.height, recorded.size);
    assert.deepEqual([...png.pixels.subarray(0, 3)], recorded.rgb);
    assert.deepEqual([...png.pixels.subarray(png.pixels.length - 3)], recorded.rgb);
    // The digest's input, character for character.
    const vars = typedVars(data('schema.json'), data('types.json'));
    const scene = Object.fromEntries(Object.entries(resolve(vars, loads(recorded.payload).values)).filter(([p]) => !p.startsWith('render.')));
    assert.equal(dumps(scene), recorded.values);
  });
}

test('a preview of a recorded final\'s values is that final\'s render', async () => {
  const [final] = data('finals.json');
  const { done } = await preview(JSON.stringify({ kind: 'preview', values: { ...final.values, 'render.preview_size': 240 } }));
  assert.equal(done.state, 'done');
  assert.equal(done.url, final.url);
  const response = await fetch(`${pylon.url}${final.url}`);
  assert.equal(response.status, 200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), readFileSync(join(source, 'renders', final.file)));
});

test('a final is refused on its first poll, and an unknown parameter or kind answers 400 with the server\'s text', async () => {
  const final = await (await post(`${pylon.url}/api/render`, { kind: 'final', size: 2160, name: 'x', values: {} })).json();
  assert.equal(final.kind, 'final');
  const polled = await getJson(`${pylon.url}/api/jobs/${final.id}`);
  assert.equal(polled.state, 'failed');
  assert.equal(polled.error, FINALS_REFUSED);
  assert.equal(FINALS_REFUSED, 'finals are not made in the knobs fixture');
  const unknown = await post(`${pylon.url}/api/render`, { kind: 'preview', values: { 'nope.x': 1 } });
  assert.equal(unknown.status, 400);
  assert.deepEqual(await unknown.json(), { error: 'unknown parameter: nope.x' });
  const kind = await post(`${pylon.url}/api/render`, { kind: 'other' });
  assert.equal(kind.status, 400);
  assert.deepEqual(await kind.json(), { error: 'kind must be preview or final' });
  const bad = await post(`${pylon.url}/api/render`, { kind: 'preview', values: { 'light.sun_elevation': 'high' } });
  assert.deepEqual(await bad.json(), { error: "light.sun_elevation: not a number: 'high'" });
  const none = await fetch(`${pylon.url}/api/jobs/999-nope`);
  assert.equal(none.status, 404);
  assert.deepEqual(await none.json(), { error: 'no such job' });
});

test('the stand-in serves the page\'s own files and nothing outside them', async () => {
  for (const [path, file, type] of [['/', 'index.html', 'text/html'], ['/tweak.js', 'tweak.js', 'text/javascript'], ['/tweak.css', 'tweak.css', 'text/css']]) {
    const response = await fetch(`${pylon.url}/captures/mini-pylon/source${path}`);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get('content-type'), new RegExp(type));
    assert.equal(await response.text(), readFileSync(join(source, file), 'utf8'));
  }
  for (const path of ['/data/schema.json', '/renders/..%2Fdata%2Fschema.json', '/renders/nope.png', '/out/previews/nope.png']) {
    assert.equal((await fetch(`${pylon.url}/captures/mini-pylon/source${path}`)).status, 404, path);
  }
});

test('swatch draws write_swatch_png\'s flat square, at most 256 px', () => {
  const png = swatch({ 'a.b': new PyNum(1, 'int') }, 480);
  assert.deepEqual(pngSize(png), { width: 256, height: 256 });
  assert.deepEqual(pngSize(swatch({}, 100)), { width: 100, height: 100 });
});
