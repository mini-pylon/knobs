// Root paths the captured pages ask for outside their own prefix, and the
// wings-vdb routes (the wordmark, the two faces, and the dev endpoints the
// drawer calls). The mini-pylon stand-in is mounted beside them.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { miniPylon, PREFIX } from './mini-pylon/api.mjs';
import { BASE, wingsFixture } from './wings-vdb/vite.mjs';

export const ROOT_PATHS = [
  { path: '/wings-wide.svg', owner: 'wings-vdb' },
  { path: '/fonts/', owner: 'wings-vdb' },
  { path: '/__wings/', owner: 'wings-vdb' },
  { path: '/api/', owner: 'mini-pylon' },
];
export const FONTS = ['ABCArealVariable.woff2', 'ABCArealMonoVariable.woff2'];
export const DEFAULTS_REFUSED = 'defaults are not saved in the knobs fixture';

// One handler per ROOT_PATHS entry. A new entry with none fails at start.
export function rootMounts(entries, handlers) {
  return entries.map(entry => {
    const handler = handlers[entry.path];
    if (typeof handler !== 'function') throw new Error(`ROOT_PATHS has no handler for ${entry.path}`);
    return [entry.path, handler];
  });
}

export function allowedRequest(pathname, project) {
  const source = `/captures/${project}/source/`;
  if (pathname === source.slice(0, -1) || pathname.startsWith(source)) return true;
  return ROOT_PATHS.some(entry => {
    if (entry.owner !== project) return false;
    if (entry.path.endsWith('/')) return pathname.startsWith(entry.path);
    return pathname === entry.path;
  });
}

export function fontState(fonts) {
  return FONTS.every(name => existsSync(join(fonts, name))) ? 'local' : 'fallback';
}

function pathname(url) {
  const path = String(url ?? '').split('?')[0];
  try {
    return decodeURIComponent(path);
  } catch {
    return null;
  }
}

function send(res, status, body, type) {
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body);
  res.statusCode = status;
  if (type) res.setHeader('content-type', type);
  res.setHeader('content-length', String(bytes.length));
  res.end(bytes);
}

function sendJson(res, status, value) {
  send(res, status, JSON.stringify(value), 'application/json');
}

function notFound(res) {
  send(res, 404, 'not found', 'text/plain');
}

function readWhole(req) {
  return new Promise((resolve, reject) => {
    req.on('data', () => {});
    req.on('end', resolve);
    req.on('error', reject);
  });
}

function fileBytes(file) {
  try {
    if (!statSync(file).isFile()) return null;
  } catch {
    return null;
  }
  return readFileSync(file);
}

export function wingsRoutes({ sourceDir, fonts }) {
  const svg = (req, res) => {
    const bytes = fileBytes(join(sourceDir, 'public', 'wings-wide.svg'));
    if (!bytes) return notFound(res);
    send(res, 200, bytes, 'image/svg+xml');
  };
  const fontsHandler = (req, res) => {
    const path = pathname(req.url);
    const name = path?.startsWith('/') ? path.slice(1) : '';
    if (!FONTS.includes(name) || dirname(join(fonts, name)) !== fonts) return notFound(res);
    const bytes = fileBytes(join(fonts, name));
    if (!bytes) return notFound(res);
    send(res, 200, bytes, 'font/woff2');
  };
  const fontStateHandler = (req, res) => {
    sendJson(res, 200, { fonts: fontState(fonts) });
  };
  const wings = (req, res) => {
    readWhole(req).then(() => {
      if (res.writableEnded) return;
      const path = pathname(req.url);
      if (path !== '/defaults' && path !== '/report') return notFound(res);
      if (req.method !== 'POST') return send(res, 405, 'POST only', 'text/plain');
      if (path === '/report') {
        res.statusCode = 204;
        res.end();
        return;
      }
      sendJson(res, 200, { changes: [], errors: [DEFAULTS_REFUSED] });
    }).catch(error => {
      if (res.writableEnded) return;
      send(res, 400, error.message, 'text/plain');
    });
  };
  return { svg, fonts: fontsHandler, fontState: fontStateHandler, wings };
}

function missingSnapshot(project) {
  return (req, res) => {
    sendJson(res, 404, { error: `no ${project} snapshot: run npm run playground:capture -- ${project}` });
  };
}

function requestPath(req) {
  return String(req.originalUrl || req.url || '').split('?')[0];
}

// A request a mounted handler hands back. The body names the path and, when
// the handler passed an error on, that error's message. An error is logged
// here too: the answer must not be the only place the cause survives.
function handedBack(req, res, err) {
  if (res.writableEnded || res.headersSent) return;
  const path = requestPath(req);
  const message = err?.message ? String(err.message) : '';
  if (err) console.error(message ? `${path}: ${message}` : `${path}: ${err}`);
  sendJson(res, err ? 500 : 404, { error: message ? `${path}: ${message}` : path });
}

// Nothing mounted here may fall through to the playground's own pages.
function seal(handler) {
  return (req, res) => {
    let settled = false;
    const finish = err => {
      if (settled) return;
      settled = true;
      handedBack(req, res, err);
    };
    try {
      const result = handler(req, res, finish);
      if (result && typeof result.catch === 'function') result.catch(finish);
    } catch (error) {
      finish(error);
    }
  };
}

function mount(server, route, handler) {
  server.middlewares.use(route, seal(handler));
}

// Vite's middleware-mode error handler logs the error, sends the overlay, and
// calls next() with nothing attached. Keep that layer, and answer from its
// next so the cause does not fall through to the playground.
function keepSourceError(middlewares) {
  const layer = middlewares.stack.find(entry => entry.handle?.name === 'viteErrorMiddleware')
    ?? middlewares.stack.find(entry => entry.handle?.length === 4);
  if (!layer) throw new Error('the wings-vdb fixture has no error handler');
  const original = layer.handle;
  layer.handle = function sourceError(err, req, res, next) {
    original.call(this, err, req, res, () => {
      if (res.writableEnded || res.headersSent) {
        next(err);
        return;
      }
      handedBack(req, res, err);
    });
  };
}

export function fixturesPlugin({ captures, fonts, allowedHosts = [], logLevel = 'error' }) {
  let wings = null;
  // A throw inside configureServer never reaches serve()'s close: Vite does not
  // return the server. Keep the error and let the caller close before listen.
  const boot = { error: null };
  return {
    name: 'knobs-playground-fixtures',
    boot,
    async configureServer(server) {
      try {
        const wingsSource = join(captures, 'wings-vdb', 'source');
        if (existsSync(join(wingsSource, 'index.html'))) {
          wings = await wingsFixture({ sourceDir: wingsSource, httpServer: server.httpServer, allowedHosts, logLevel });
          keepSourceError(wings.middlewares);
          mount(server, BASE, wings.middlewares);
        } else {
          mount(server, BASE, missingSnapshot('wings-vdb'));
        }
        const routes = wingsRoutes({ sourceDir: wingsSource, fonts });
        mount(server, BASE.replace(/source\/$/, 'fonts'), routes.fontState);
        const pylonSource = join(captures, 'mini-pylon', 'source');
        const mini = existsSync(join(pylonSource, 'data', 'schema.json')) ? miniPylon(pylonSource) : null;
        if (mini) mount(server, PREFIX, mini.files);
        else mount(server, PREFIX, missingSnapshot('mini-pylon'));
        const api = mini ? mini.api : missingSnapshot('mini-pylon');
        for (const [path, handler] of rootMounts(ROOT_PATHS, {
          '/wings-wide.svg': routes.svg,
          '/fonts/': routes.fonts,
          '/__wings/': routes.wings,
          '/api/': api,
        })) mount(server, path, handler);
      } catch (error) {
        const opened = wings;
        wings = null;
        if (opened) await opened.close().catch(() => {});
        boot.error = error;
      }
    },
    closeServer() {
      return wings?.close();
    },
  };
}
