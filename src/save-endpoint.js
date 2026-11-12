import { randomBytes } from 'node:crypto';
import { rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { normalize } from './store.js';

export const SAVE_ROUTE = '/__knobs/save';
export const VALUES_FILE = 'knobs.values.json';

// One chain per handler, for this handler's file only. Overlapping saves then
// run one at a time and the later arrival replaces the whole file.
function writeQueue() {
  let tail = Promise.resolve();
  return function enqueue(task) {
    const run = tail.then(task);
    tail = run.then(() => {}, () => {});
    return run;
  };
}

function send(res, status, body) {
  if (res.headersSent || res.writableEnded) return;
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function headerValue(header) {
  const raw = Array.isArray(header) ? header[0] : header;
  return typeof raw === 'string' ? raw : '';
}

// Parameters and case are not part of the media type.
function isJsonContent(header) {
  const media = headerValue(header).split(';')[0].trim().toLowerCase();
  return media === 'application/json';
}

// Host is the request's own Host. Forwarded headers are never read: a proxy
// that rewrites Host lists its public origin in `origins` instead.
function originAllowed(originHeader, hostHeader, origins) {
  const origin = headerValue(originHeader);
  if (origin === '') return false;
  let url;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  const host = headerValue(hostHeader).trim().toLowerCase();
  if (host !== '' && url.host.toLowerCase() === host) return true;
  return origins.includes(origin);
}

function discard(req) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    req.on('error', finish);
    req.on('end', finish);
    req.resume();
  });
}

// Keep at most `limit` bytes. Answer only after the request has ended, so an
// oversized body is still a response rather than a dropped connection.
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let over = false;
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };
    req.on('data', (chunk) => {
      if (over) return;
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > limit) {
        over = true;
        chunks.length = 0;
        return;
      }
      chunks.push(bytes);
    });
    req.on('error', (error) => finish(reject, error));
    req.on('end', () => {
      if (over) finish(resolve, { over: true, text: '' });
      else finish(resolve, { over: false, text: Buffer.concat(chunks).toString('utf8') });
    });
  });
}

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// A unique name beside this file, so a partial write never is the target and
// never belongs to another save.
async function writeAtomic(file, text) {
  const tmp = `${file}.${process.pid}.${randomBytes(8).toString('hex')}`;
  try {
    await writeFile(tmp, text, { flag: 'wx' });
    await rename(tmp, file);
  } catch (error) {
    await unlink(tmp).catch(() => {});
    throw error;
  }
}

export function createSaveHandler({ root, loadStore, origins = [], limit = 1000000 }) {
  const file = join(root, VALUES_FILE);
  const enqueue = writeQueue();

  return (req, res) => {
    serve(req, res).catch(() => {
      send(res, 500, { error: 'knobs: the save failed' });
    });
  };

  async function serve(req, res) {
    if (req.method !== 'POST') {
      await discard(req);
      send(res, 405, { error: 'knobs: only POST is accepted' });
      return;
    }
    if (!isJsonContent(req.headers['content-type'])) {
      await discard(req);
      send(res, 415, { error: 'knobs: content type must be application/json' });
      return;
    }
    if (!originAllowed(req.headers.origin, req.headers.host, origins)) {
      await discard(req);
      send(res, 403, { error: 'knobs: origin is not allowed' });
      return;
    }

    const body = await readBody(req, limit);
    if (body.over) {
      send(res, 413, { error: 'knobs: body is too large' });
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(body.text);
    } catch {
      send(res, 400, { error: 'knobs: body is not JSON' });
      return;
    }
    if (!plainObject(parsed) || !plainObject(parsed.values)) {
      send(res, 400, { error: 'knobs: body needs a values object' });
      return;
    }

    let store;
    try {
      store = await loadStore();
    } catch {
      send(res, 500, { error: 'knobs: the controls could not be loaded' });
      return;
    }
    if (!store || typeof store.byPath?.get !== 'function') {
      send(res, 500, { error: 'knobs: the controls could not be loaded' });
      return;
    }

    // Build on a null prototype so a path cannot set this object's prototype.
    const kept = Object.create(null);
    const paths = [];
    for (const [path, value] of Object.entries(parsed.values)) {
      const control = store.byPath.get(path);
      if (!control) {
        send(res, 422, { error: `knobs: unknown control ${path}` });
        return;
      }
      const normalized = normalize(control, value);
      // Object.is, not ===: normalize turns -0 into 0, and the sent value must already be that result.
      if (!normalized.ok || !Object.is(normalized.value, value)) {
        send(res, 422, { error: `knobs: ${path} does not match its control` });
        return;
      }
      if (!Object.is(value, control.default)) paths.push(path);
    }
    paths.sort();
    for (const path of paths) kept[path] = parsed.values[path];

    try {
      await enqueue(() => writeAtomic(file, `${JSON.stringify(kept, null, 2)}\n`));
    } catch {
      send(res, 500, { error: 'knobs: the values file could not be written' });
      return;
    }
    send(res, 200, { saved: paths.length });
  }
}
