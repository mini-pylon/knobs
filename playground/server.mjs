// The playground's Vite server: knobs resolved to src/, so an edit to the
// library reloads the playground, @drafts resolved to the drafts folder
// (playground/drafts/, or KNOBS_DRAFTS, or the drafts option), and @captures
// to the captures folder (playground/captures/, or KNOBS_CAPTURES, or the
// captures option). Shared by serve.mjs, shots.mjs and the tests.
//
// POST /__playground/draft { name, files: { 'controls.js', 'visual.js' | 'extension.js' } }
// writes a draft the shell's paste form sends. Same-origin only.
//
// allowedHosts names the hostnames a proxy in front may use (Vite refuses
// any other than localhost); serve.mjs takes them as --allow-host.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { aliases, repo, serve } from '../tests/browser/lib/harness.mjs';

export const DRAFT_ROUTE = '/__playground/draft';
const DRAFT_FILES = ['controls.js', 'visual.js', 'extension.js'];
const NAME = /^[A-Za-z0-9][\w-]{0,63}$/;
const LIMIT = 1_000_000;

// The reason a draft post is refused, or null.
function refusal(body) {
  if (!body || typeof body !== 'object') return 'the body must be a JSON object';
  if (typeof body.name !== 'string' || !NAME.test(body.name)) return 'name: letters, digits, - and _ only';
  const files = body.files;
  if (!files || typeof files !== 'object') return 'files must be an object';
  for (const [file, text] of Object.entries(files)) {
    if (!DRAFT_FILES.includes(file)) return `unknown file: ${file}`;
    if (typeof text !== 'string') return `${file} must be text`;
  }
  if (!files['controls.js']?.trim()) return 'controls.js is required';
  if (files['visual.js']?.trim() && files['extension.js']?.trim()) return 'a draft has a visual.js or an extension.js, not both';
  return null;
}

function draftPlugin(drafts) {
  return {
    name: 'knobs-playground-drafts',
    configureServer(server) {
      // A draft added on disk reaches the scenario list, even outside the root.
      server.watcher.add(drafts);
      server.middlewares.use(DRAFT_ROUTE, (req, res) => {
        const reply = (status, message) => {
          res.statusCode = status;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(status === 200 ? { ok: true, ...message } : { error: message }));
        };
        if (req.method !== 'POST') return reply(405, 'POST only');
        // Same host, either scheme: a proxy in front may serve it over https.
        let originHost = null;
        try { originHost = new URL(req.headers.origin).host; } catch { /* no or bad origin */ }
        if (!originHost || originHost !== req.headers.host) return reply(403, 'same origin only');
        let size = 0;
        const chunks = [];
        req.on('data', chunk => {
          size += chunk.length;
          if (size > LIMIT) req.destroy();
          else chunks.push(chunk);
        });
        req.on('end', () => {
          let body;
          try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return reply(400, 'the body is not JSON'); }
          const why = refusal(body);
          if (why) return reply(400, why);
          const dir = join(drafts, body.name);
          mkdirSync(dir, { recursive: true });
          for (const file of DRAFT_FILES) {
            const text = body.files[file];
            if (text?.trim()) writeFileSync(join(dir, file), text);
            else rmSync(join(dir, file), { force: true });
          }
          // The scenario list globs the drafts folder: re-read it on the next load.
          for (const mod of server.moduleGraph.getModulesByFile(join(repo, 'playground', 'scenarios.js')) ?? []) {
            server.moduleGraph.invalidateModule(mod);
          }
          reply(200, { scenario: `draft:${body.name}` });
        });
      });
    },
  };
}

export function servePlayground({ host = '127.0.0.1', port = 0, drafts, captures, logLevel = 'info', allowedHosts = [] } = {}) {
  const draftsDir = resolve(drafts ?? process.env.KNOBS_DRAFTS ?? join(repo, 'playground', 'drafts'));
  const capturesDir = resolve(captures ?? process.env.KNOBS_CAPTURES ?? join(repo, 'playground', 'captures'));
  mkdirSync(draftsDir, { recursive: true });
  mkdirSync(capturesDir, { recursive: true });
  return serve(join(repo, 'playground'), {
    cacheDir: join(repo, 'tests', '.tmp', 'playground-vite'),
    logLevel,
    // A capture written after the server started reaches the scenario list too.
    plugins: [draftPlugin(draftsDir), { name: 'knobs-playground-captures', configureServer: server => { server.watcher.add(capturesDir); } }],
    resolve: { alias: [...aliases(), { find: '@drafts', replacement: draftsDir }, { find: '@captures', replacement: capturesDir }], dedupe: ['react', 'react-dom'] },
    server: { host, port, strictPort: port !== 0, allowedHosts, fs: { allow: [repo, draftsDir, capturesDir] } },
  });
}
