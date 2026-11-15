// A middleware-mode Vite for one wings-vdb snapshot. It shares the
// playground's HTTP server, and serves the two stubbed modules in place of
// the files the snapshot does not copy.
import { mkdirSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { stubs } from '../../adapters/wings-vdb.mjs';

export const BASE = '/captures/wings-vdb/source/';
const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function bare(id) {
  return id.split('?')[0];
}

export function wingsFixture({ sourceDir, httpServer, allowedHosts = [], logLevel = 'error' }) {
  const cacheDir = join(repo, 'tests', '.tmp', 'fixture-vite', 'wings-vdb');
  mkdirSync(dirname(cacheDir), { recursive: true });
  return createServer({
    configFile: false,
    root: sourceDir,
    base: BASE,
    appType: 'mpa',
    cacheDir,
    logLevel,
    optimizeDeps: { noDiscovery: true, include: [] },
    server: {
      middlewareMode: true,
      ws: { server: httpServer },
      allowedHosts,
      fs: { allow: [repo, sourceDir] },
    },
    plugins: [{
      name: 'knobs-wings-vdb-stubs',
      enforce: 'pre',
      resolveId(id, importer) {
        if (!importer || !id.startsWith('.')) return null;
        const target = normalize(join(dirname(bare(importer)), bare(id)));
        const rel = normalize(relative(sourceDir, target));
        if (!rel || rel.startsWith('..')) return null;
        const stub = stubs.find(entry => entry.module === rel);
        return stub ? join(repo, stub.by) : null;
      },
    }],
  });
}
