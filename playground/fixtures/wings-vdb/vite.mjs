// A middleware-mode Vite for one wings-vdb snapshot. It shares the
// playground's HTTP server, and serves the two stubbed modules in place of
// the files the snapshot does not copy.
import { mkdirSync, realpathSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { stubs } from '../../adapters/wings-vdb.mjs';
import { sourceUrl } from '../source-side.js';

export const BASE = sourceUrl('wings-vdb');
const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function bare(id) {
  return id.split('?')[0];
}

export function wingsFixture({ sourceDir, httpServer, allowedHosts = [], logLevel = 'error' }) {
  // Vite's importer is a real path. sourceDir and fs.allow must be too, or a
  // symlinked captures folder never matches the stubs.
  const root = realpathSync(sourceDir);
  const allowed = realpathSync(repo);
  const cacheDir = join(allowed, 'tests', '.tmp', 'fixture-vite', 'wings-vdb');
  mkdirSync(dirname(cacheDir), { recursive: true });
  return createServer({
    configFile: false,
    root,
    base: BASE,
    appType: 'mpa',
    cacheDir,
    logLevel,
    optimizeDeps: { noDiscovery: true, include: [] },
    server: {
      middlewareMode: true,
      ws: { server: httpServer },
      allowedHosts,
      fs: { allow: [allowed, root] },
    },
    plugins: [{
      name: 'knobs-wings-vdb-stubs',
      enforce: 'pre',
      resolveId(id, importer) {
        if (!importer || !id.startsWith('.')) return null;
        const target = normalize(join(dirname(bare(importer)), bare(id)));
        const rel = normalize(relative(root, target));
        if (!rel || rel.startsWith('..')) return null;
        const stub = stubs.find(entry => entry.module === rel);
        return stub ? join(allowed, stub.by) : null;
      },
    }],
  });
}
