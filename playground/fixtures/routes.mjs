// Root paths the captured pages ask for outside their own prefix, and the
// wings-vdb routes (the wordmark, the two faces, and the dev endpoints the
// drawer calls). The mini-pylon stand-in is mounted beside them.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { miniPylon } from './mini-pylon/api.mjs';
import { wingsFixture } from './wings-vdb/vite.mjs';

export const ROOT_PATHS = [
  { path: '/wings-wide.svg', owner: 'wings-vdb' },
  { path: '/fonts/', owner: 'wings-vdb' },
  { path: '/__wings/', owner: 'wings-vdb' },
  { path: '/api/', owner: 'mini-pylon' },
];
export const FONTS = ['ABCArealVariable.woff2', 'ABCArealMonoVariable.woff2'];
export const DEFAULTS_REFUSED = 'defaults are not saved in the knobs fixture';

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

export function fixturesPlugin({ captures, fonts, allowedHosts = [], logLevel = 'error' }) {
  let wings = null;
  return {
    name: 'knobs-playground-fixtures',
    async configureServer(server) {
      const wingsSource = join(captures, 'wings-vdb', 'source');
      if (existsSync(join(wingsSource, 'index.html'))) {
        wings = await wingsFixture({ sourceDir: wingsSource, httpServer: server.httpServer, allowedHosts, logLevel });
        server.middlewares.use('/captures/wings-vdb/source', wings.middlewares);
      } else {
        server.middlewares.use('/captures/wings-vdb/source', missingSnapshot('wings-vdb'));
      }
      const routes = wingsRoutes({ sourceDir: wingsSource, fonts });
      server.middlewares.use('/captures/wings-vdb/fonts', routes.fontState);
      server.middlewares.use('/wings-wide.svg', routes.svg);
      server.middlewares.use('/fonts', routes.fonts);
      server.middlewares.use('/__wings', routes.wings);
      const pylonSource = join(captures, 'mini-pylon', 'source');
      if (existsSync(join(pylonSource, 'data', 'schema.json'))) {
        const mini = miniPylon(pylonSource);
        server.middlewares.use('/captures/mini-pylon/source', mini.files);
        server.middlewares.use('/api', mini.api);
      } else {
        const missing = missingSnapshot('mini-pylon');
        server.middlewares.use('/captures/mini-pylon/source', missing);
        server.middlewares.use('/api', missing);
      }
    },
    closeServer() {
      return wings?.close();
    },
  };
}
