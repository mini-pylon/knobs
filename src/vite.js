import { createRequire } from 'node:module';
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createSaveHandler, SAVE_ROUTE, VALUES_FILE } from './save-endpoint.js';

const packageDir = realpathSync(join(dirname(fileURLToPath(import.meta.url)), '..'));
const reactStub = join(packageDir, 'src', 'react-stub.js');

// The project's own vite, loaded from its package root. A static import would
// resolve this package's copy instead, or fail when the package is linked.
function projectVite(root) {
  const require = createRequire(join(root, 'package.json'));
  const pkgPath = require.resolve('vite/package.json');
  const dot = JSON.parse(readFileSync(pkgPath, 'utf8')).exports['.'];
  let relative = dot;
  if (typeof dot !== 'string') {
    const imported = dot.import;
    relative = typeof imported === 'string' ? imported : imported.default;
  }
  return import(pathToFileURL(resolve(dirname(pkgPath), relative)).href);
}

function aliasList(alias) {
  if (Array.isArray(alias)) return alias;
  if (alias && typeof alias === 'object') {
    return Object.entries(alias).map(([find, replacement]) => ({ find, replacement }));
  }
  return [];
}

function withSep(dir) {
  return dir.endsWith(sep) ? dir : dir + sep;
}

// String match first, so a missing path still compares. A symlink that lands
// on the same file counts, and a sibling that only shares the prefix does not.
function sameFile(file, target) {
  if (file === target) return true;
  try {
    return realpathSync(file) === realpathSync(target);
  } catch {
    return false;
  }
}

function insideDir(file, dir) {
  if (file === dir || file.startsWith(withSep(dir))) return true;
  try {
    const realFile = realpathSync(file);
    const realDir = realpathSync(dir);
    return realFile === realDir || realFile.startsWith(withSep(realDir));
  } catch {
    return false;
  }
}

export default function knobs({ controls, origins = [] } = {}) {
  if (typeof controls !== 'string' || controls === '') {
    throw new Error('knobs: the Vite plugin needs the controls file path');
  }

  let root;
  let controlsFile;
  let valuesFile;
  let resolvedConfig;

  return {
    name: 'knobs',
    apply: 'serve',
    async config(userConfig = {}) {
      root = resolve(userConfig.root || process.cwd());
      controlsFile = resolve(root, controls);
      valuesFile = join(root, VALUES_FILE);
      const vite = await projectVite(root);
      return {
        server: { fs: { allow: [vite.searchForWorkspaceRoot(root), packageDir] } },
        resolve: { dedupe: ['react', 'react-dom'] },
      };
    },
    configResolved(resolved) {
      resolvedConfig = resolved;
    },
    configureServer(server) {
      const projectRoot = root;
      const controlsPath = controlsFile;
      server.middlewares.use(SAVE_ROUTE, createSaveHandler({
        root: projectRoot,
        origins,
        loadStore: () => loadStore(projectRoot, controlsPath),
      }));
    },
    // hotUpdate runs once per environment and would reload the page twice.
    handleHotUpdate({ file, server }) {
      const watched = sameFile(file, controlsFile)
        || sameFile(file, valuesFile)
        || insideDir(file, packageDir);
      if (!watched) return undefined;
      server.ws.send({ type: 'full-reload' });
      return [];
    },
  };

  async function loadStore(projectRoot, controlsPath) {
    const vite = await projectVite(projectRoot);
    const aliases = aliasList(resolvedConfig?.resolve?.alias);
    // The stub is first so knobs/react does not load the real React binding.
    const loaded = await vite.runnerImport(controlsPath, {
      root: projectRoot,
      configFile: false,
      logLevel: 'silent',
      resolve: {
        alias: [{ find: /^knobs\/react$/, replacement: reactStub }, ...aliases],
      },
    });
    const store = loaded?.module?.knobs;
    if (!store || typeof store.byPath?.get !== 'function') {
      throw new Error('knobs: the controls file exports no knobs store');
    }
    return store;
  }
}
