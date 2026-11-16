// The stand-in for mini-pylon's tools/tweak_server.py
// (playground/fixtures/mini-pylon/api.mjs), served over HTTP from a snapshot
// of the stand-in checkout under tests/fixtures/captures, whose swatch.json
// holds what Python drew for each pinned payload.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, request as httpRequest } from 'node:http';
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

test('a failed final whose values are the defaults does not end a defaults preview with no picture', async () => {
  const copy = mkdtempSync(join(repo, 'tests', '.tmp', 'finals-'));
  cpSync(source, copy, { recursive: true });
  const finalsPath = join(copy, 'data', 'finals.json');
  const finals = JSON.parse(readFileSync(finalsPath, 'utf8'));
  finals.unshift({ name: 'failed', file: 'failed.png', state: 'failed', url: null, values: {} });
  writeFileSync(finalsPath, JSON.stringify(finals));
  const api = standIn(copy);
  const local = await mount([['/api', api.api], ['/captures/mini-pylon/source', api.files]]);
  try {
    const job = await (await post(`${local.url}/api/render`, { kind: 'preview', values: {} })).json();
    const done = await getJson(`${local.url}/api/jobs/${job.id}`);
    assert.equal(done.state, 'done');
    assert.equal(typeof done.url, 'string');
    assert.ok(done.url.startsWith('/captures/mini-pylon/source/out/previews/'), done.url);
  } finally {
    local.server.close();
    rmSync(copy, { recursive: true, force: true });
  }
});

async function mountEdited(edit) {
  const copy = mkdtempSync(join(repo, 'tests', '.tmp', 'finals-'));
  cpSync(source, copy, { recursive: true });
  edit(copy);
  const api = standIn(copy);
  const local = await mount([['/api', api.api], ['/captures/mini-pylon/source', api.files]]);
  local.copy = copy;
  return local;
}

function closeEdited(local) {
  local.server.close();
  rmSync(local.copy, { recursive: true, force: true });
}

function writeData(copy, name, value) {
  writeFileSync(join(copy, 'data', name), JSON.stringify(value));
}

test('a final whose values no longer resolve is not a match and the preview goes on', async () => {
  const [recorded] = data('finals.json');
  const local = await mountEdited(copy => {
    const finals = JSON.parse(readFileSync(join(copy, 'data', 'finals.json'), 'utf8'));
    finals.unshift({
      name: 'renamed',
      file: 'renamed.png',
      state: 'done',
      url: '/captures/mini-pylon/source/renders/renamed.png',
      values: { 'renamed.gone': 1 },
    });
    writeData(copy, 'finals.json', finals);
  });
  try {
    const posted = await post(`${local.url}/api/render`, { kind: 'preview', values: {} });
    assert.equal(posted.status, 200);
    const job = await posted.json();
    const done = await getJson(`${local.url}/api/jobs/${job.id}`);
    assert.equal(done.state, 'done');
    assert.ok(done.url.startsWith('/captures/mini-pylon/source/out/previews/'), done.url);
    const matched = await (await post(`${local.url}/api/render`, { kind: 'preview', values: recorded.values })).json();
    const matchedDone = await getJson(`${local.url}/api/jobs/${matched.id}`);
    assert.equal(matchedDone.state, 'done');
    assert.equal(matchedDone.url, recorded.url);
  } finally {
    closeEdited(local);
  }
});

test('a finals.json that is not a list names that file', async () => {
  const local = await mountEdited(copy => writeData(copy, 'finals.json', { not: 'a list' }));
  try {
    const response = await post(`${local.url}/api/render`, { kind: 'preview', values: {} });
    assert.equal(response.status, 500);
    assert.match((await response.json()).error, /finals\.json/);
  } finally {
    closeEdited(local);
  }
});

test('a schema.json that has no groups names that file', async () => {
  const local = await mountEdited(copy => writeData(copy, 'schema.json', { groups: null }));
  try {
    const response = await post(`${local.url}/api/render`, { kind: 'preview', values: {} });
    assert.equal(response.status, 500);
    assert.match((await response.json()).error, /schema\.json/);
  } finally {
    closeEdited(local);
  }
});

test('a schema.json group that is not a list of vars names that file', async () => {
  const local = await mountEdited(copy => {
    const schema = JSON.parse(readFileSync(join(copy, 'data', 'schema.json'), 'utf8'));
    schema.groups[0].vars = null;
    writeData(copy, 'schema.json', schema);
  });
  try {
    const response = await post(`${local.url}/api/render`, { kind: 'preview', values: {} });
    assert.equal(response.status, 500);
    assert.match((await response.json()).error, /schema\.json/);
  } finally {
    closeEdited(local);
  }
});

test('a schema.json var with no key names that file, not types.json', async () => {
  const local = await mountEdited(copy => {
    const schema = JSON.parse(readFileSync(join(copy, 'data', 'schema.json'), 'utf8'));
    schema.groups[0].vars[0] = {};
    writeData(copy, 'schema.json', schema);
  });
  try {
    const response = await post(`${local.url}/api/render`, { kind: 'preview', values: {} });
    assert.equal(response.status, 500);
    const { error } = await response.json();
    assert.match(error, /schema\.json/);
    assert.doesNotMatch(error, /types\.json/);
  } finally {
    closeEdited(local);
  }
});

test('a types.json that is not an object names that file', async () => {
  const local = await mountEdited(copy => writeData(copy, 'types.json', null));
  try {
    const response = await post(`${local.url}/api/render`, { kind: 'preview', values: {} });
    assert.equal(response.status, 500);
    assert.match((await response.json()).error, /types\.json/);
  } finally {
    closeEdited(local);
  }
});

test('a preview of a recorded final\'s values is that final\'s render', async () => {
  const [final] = data('finals.json');
  const { done } = await preview(JSON.stringify({ kind: 'preview', values: { ...final.values, 'render.preview_size': 240 } }));
  assert.equal(done.state, 'done');
  assert.equal(done.url, final.url);
  const response = await fetch(`${pylon.url}${final.url}`);
  assert.equal(response.status, 200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), readFileSync(join(source, 'renders', final.file)));
});

function postRaw(url, chunks) {
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const req = httpRequest({
      hostname: target.hostname,
      port: target.port,
      path: target.pathname,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    }, response => {
      const parts = [];
      response.on('data', part => parts.push(part));
      response.on('end', () => resolve({
        status: response.statusCode,
        connection: response.headers.connection,
        text: Buffer.concat(parts).toString('utf8'),
      }));
    });
    req.on('error', reject);
    for (const chunk of chunks) req.write(chunk);
    req.end();
  });
}

test('a body over 1 MB is answered 400 with the refusal text', async () => {
  const api = standIn(source);
  const local = await mount([['/api', api.api], ['/captures/mini-pylon/source', api.files]]);
  try {
    const response = await fetch(`${local.url}/api/render`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'x'.repeat(2_000_000),
    });
    assert.equal(response.status, 400);
    assert.equal(await response.text(), '{"error":"the body is over 1 MB"}');
    assert.equal(response.headers.get('connection'), 'close');
    // No content-length: the cap is applied while reading, and the rest is not kept.
    const streamed = await postRaw(`${local.url}/api/render`, ['x'.repeat(600_000), 'y'.repeat(600_000)]);
    assert.equal(streamed.status, 400);
    assert.equal(streamed.text, '{"error":"the body is over 1 MB"}');
    assert.equal(streamed.connection, 'close');
  } finally {
    local.server.close();
  }
});

test('a body with invalid UTF-8 is refused as not JSON, and a BOM is still JSON', async () => {
  const api = standIn(source);
  const local = await mount([['/api', api.api], ['/captures/mini-pylon/source', api.files]]);
  try {
    // Valid JSON once U+FFFD replaces the bad byte, so a loose decode would accept it.
    const broken = Buffer.concat([
      Buffer.from('{"kind":"preview","note":"'),
      Buffer.from([0xff]),
      Buffer.from('"}'),
    ]);
    const refused = await fetch(`${local.url}/api/render`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: broken,
    });
    assert.equal(refused.status, 400);
    assert.equal(await refused.text(), '{"error":"the body is not JSON"}');
    const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('{"kind":"preview"}')]);
    const accepted = await fetch(`${local.url}/api/render`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: bom,
    });
    assert.equal(accepted.status, 200);
    assert.equal((await accepted.json()).kind, 'preview');
  } finally {
    local.server.close();
  }
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
