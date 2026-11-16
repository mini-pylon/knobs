// Stand-in for mini-pylon's tools/tweak_server.py. It answers from the
// snapshot's recorded JSON and draws previews as flat swatches in memory.
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { encodePng } from '../../png.mjs';
import { dumps, loads, PyNum, resolve, typedVars } from './python.mjs';

export const PREFIX = '/captures/mini-pylon/source';
export const FINALS_REFUSED = 'finals are not made in the knobs fixture';

const BODY_LIMIT = 1_000_000;
const JOB_FIELDS = ['id', 'kind', 'state', 'size', 'samples', 'url', 'seconds', 'error', 'name', 'ahead'];
const PAGE_TYPES = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/tweak.js': ['tweak.js', 'text/javascript; charset=utf-8'],
  '/tweak.css': ['tweak.css', 'text/css; charset=utf-8'],
};
const PNG_NAME = /^[\w.-]+\.png$/;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function swatch(values, size) {
  const side = Math.min(size, 256);
  const digest = createHash('sha1').update(dumps(values)).digest();
  const rgb = Buffer.from(digest.subarray(0, 3).map(byte => 64 + (byte >> 1)));
  const pixels = Buffer.alloc(side * side * 3);
  for (let i = 0; i < side * side; i++) rgb.copy(pixels, i * 3);
  return encodePng(side, side, pixels);
}

function readData(sourceDir, name) {
  const file = join(sourceDir, 'data', name);
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch (error) {
    throw new Error(`${name}: ${error.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${name}: ${error.message}`);
  }
}

function pathname(url) {
  const path = url.split('?')[0];
  try {
    return decodeURIComponent(path);
  } catch {
    return null;
  }
}

function reply(req, res, status, body, type, cache) {
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body);
  res.statusCode = status;
  res.setHeader('content-type', type);
  res.setHeader('cache-control', cache);
  res.setHeader('content-length', String(bytes.length));
  if (req.method === 'HEAD') res.end();
  else res.end(bytes);
}

function json(req, res, status, value) {
  reply(req, res, status, JSON.stringify(value), 'application/json', 'no-store');
}

function jobView(job) {
  const out = {};
  for (const key of JOB_FIELDS) out[key] = job[key];
  return out;
}

function remember(map, key, value, max) {
  map.set(key, value);
  while (map.size > max) map.delete(map.keys().next().value);
}

function numberValue(value) {
  return value instanceof PyNum ? value.value : value;
}

function sameValue(left, right) {
  if (left instanceof PyNum || right instanceof PyNum) {
    return left instanceof PyNum && right instanceof PyNum && left.value === right.value;
  }
  return left === right;
}

function sameScene(left, right) {
  const paths = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const path of paths) {
    if (path.startsWith('render.')) continue;
    if (!sameValue(left[path], right[path])) return false;
  }
  return true;
}

function sceneOf(resolved) {
  const scene = {};
  for (const [path, value] of Object.entries(resolved)) {
    if (!path.startsWith('render.')) scene[path] = value;
  }
  return scene;
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && !(value instanceof PyNum);
}

async function readBody(req) {
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > BODY_LIMIT) {
    req.destroy();
    throw new HttpError(400, 'the body is over 1 MB');
  }
  const chunks = [];
  let size = 0;
  try {
    for await (const chunk of req) {
      size += chunk.length;
      if (size > BODY_LIMIT) {
        req.destroy();
        throw new HttpError(400, 'the body is over 1 MB');
      }
      chunks.push(chunk);
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (size > BODY_LIMIT) throw new HttpError(400, 'the body is over 1 MB');
    throw error;
  }
  return Buffer.concat(chunks);
}

function servePng(req, res, bytes) {
  reply(req, res, 200, bytes, 'image/png', 'max-age=86400');
}

function renderFile(sourceDir, name) {
  if (!PNG_NAME.test(name)) return null;
  const renders = join(sourceDir, 'renders');
  const file = join(renders, name);
  if (dirname(file) !== renders) return null;
  let root;
  let full;
  try {
    root = realpathSync(renders);
    full = realpathSync(file);
  } catch {
    return null;
  }
  if (full !== join(root, name)) return null;
  try {
    if (!statSync(full).isFile()) return null;
  } catch {
    return null;
  }
  return readFileSync(full);
}

export function miniPylon(sourceDir) {
  const jobs = new Map();
  const swatches = new Map();
  let nextId = 1;

  function submit(payload) {
    const kind = Object.hasOwn(payload, 'kind') ? payload.kind : 'preview';
    if (kind !== 'preview' && kind !== 'final') throw new HttpError(400, 'kind must be preview or final');
    const values = Object.hasOwn(payload, 'values') ? payload.values : {};
    if (!isRecord(values)) throw new HttpError(400, 'values must be an object');
    const vars = typedVars(readData(sourceDir, 'schema.json'), readData(sourceDir, 'types.json'));
    let resolved;
    try {
      resolved = resolve(vars, values);
    } catch (error) {
      throw new HttpError(400, error.message);
    }
    const id = `${nextId++}-fixture`;
    const name = typeof payload.name === 'string' ? payload.name : '';
    const scene = sceneOf(resolved);
    let size;
    let samples;
    let url = null;
    let endState;
    let endError = null;
    if (kind === 'preview') {
      size = numberValue(resolved['render.preview_size']);
      samples = numberValue(resolved['render.preview_samples']);
      const finals = readData(sourceDir, 'finals.json');
      const match = finals.find(final => {
        if (typeof final?.url !== 'string') return false;
        const recorded = resolve(vars, loads(JSON.stringify(final.values ?? {})));
        return sameScene(scene, sceneOf(recorded));
      });
      if (match) url = match.url;
      else {
        const path = `/out/previews/preview-${id}.png`;
        url = `${PREFIX}${path}`;
        remember(swatches, path, swatch(scene, size), 40);
      }
      endState = 'done';
    } else {
      size = payload.size instanceof PyNum ? payload.size.value : 1080;
      samples = 160;
      endState = 'failed';
      endError = FINALS_REFUSED;
    }
    const base = { id, kind, size, samples, url, seconds: 0, name, ahead: 0 };
    const record = {
      queued: jobView({ ...base, state: 'queued', error: null }),
      done: jobView({ ...base, state: endState, error: endError }),
    };
    remember(jobs, id, record, 100);
    return record;
  }

  const api = (req, res) => {
    handleApi(req, res).catch(error => {
      if (res.headersSent) return;
      const status = error instanceof HttpError ? error.status : 500;
      json(req, res, status, { error: error.message });
    });
  };

  async function handleApi(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'POST') {
      json(req, res, 405, { error: 'method not allowed' });
      return;
    }
    const path = pathname(req.url);
    if (path === null) {
      json(req, res, 404, { error: 'not found' });
      return;
    }
    if (req.method === 'POST') {
      if (path !== '/render') {
        json(req, res, 404, { error: 'not found' });
        return;
      }
      const text = (await readBody(req)).toString('utf8');
      let payload;
      try {
        payload = loads(text);
      } catch {
        throw new HttpError(400, 'the body is not JSON');
      }
      if (!isRecord(payload)) throw new HttpError(400, 'the body must be a JSON object');
      json(req, res, 200, submit(payload).queued);
      return;
    }
    if (path === '/schema') {
      json(req, res, 200, readData(sourceDir, 'schema.json'));
      return;
    }
    if (path === '/finals') {
      json(req, res, 200, readData(sourceDir, 'finals.json'));
      return;
    }
    if (path === '/status') {
      json(req, res, 200, { running: null, waiting: [] });
      return;
    }
    const job = /^\/jobs\/([\w-]+)$/.exec(path);
    if (job) {
      const record = jobs.get(job[1]);
      if (!record) {
        json(req, res, 404, { error: 'no such job' });
        return;
      }
      json(req, res, 200, record.done);
      return;
    }
    json(req, res, 404, { error: 'not found' });
  }

  const files = (req, res) => {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        json(req, res, 405, { error: 'method not allowed' });
        return;
      }
      const path = pathname(req.url);
      if (path === null) {
        json(req, res, 404, { error: 'not found' });
        return;
      }
      const page = PAGE_TYPES[path];
      if (page) {
        let bytes;
        try {
          bytes = readFileSync(join(sourceDir, page[0]));
        } catch (error) {
          if (error.code === 'ENOENT') {
            json(req, res, 404, { error: 'not found' });
            return;
          }
          throw error;
        }
        reply(req, res, 200, bytes, page[1], 'no-store');
        return;
      }
      if (swatches.has(path)) {
        servePng(req, res, swatches.get(path));
        return;
      }
      const render = /^\/renders\/([^/]+)$/.exec(path);
      if (render) {
        const bytes = renderFile(sourceDir, render[1]);
        if (bytes) {
          servePng(req, res, bytes);
          return;
        }
      }
      json(req, res, 404, { error: 'not found' });
    } catch (error) {
      if (res.headersSent) return;
      json(req, res, 500, { error: error.message });
    }
  };

  return { api, files };
}
