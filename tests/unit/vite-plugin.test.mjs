import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import knobs from '../../src/vite.js';

const repo = realpathSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..'));

// A project whose own copy of vite is a stub, so a test can tell whose copy ran.
function project(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'knobs-project-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'node_modules', 'vite'), { recursive: true });
  writeFileSync(join(root, 'package.json'), '{"name":"project"}');
  writeFileSync(join(root, 'node_modules', 'vite', 'package.json'), JSON.stringify({ name: 'vite', type: 'module', exports: { '.': { import: './stub.js' }, './package.json': './package.json' } }));
  writeFileSync(join(root, 'node_modules', 'vite', 'stub.js'), "export const searchForWorkspaceRoot = root => root + '/from-the-project';\nexport const runnerImport = async () => ({ module: {} });\n");
  return root;
}
function fakeServer() {
  const sent = [];
  return { sent, server: { ws: { send: message => sent.push(message) } } };
}

test('the controls path is required', () => {
  assert.throws(() => knobs(), /needs the controls file path/);
});

test('it runs only under the dev server', () => {
  const plugin = knobs({ controls: 'controls.js' });
  assert.equal(plugin.name, 'knobs');
  assert.equal(plugin.apply, 'serve');
});

test('its source never imports vite statically', () => {
  const source = readFileSync(join(repo, 'src', 'vite.js'), 'utf8');
  assert.doesNotMatch(source, /from\s+['"]vite['"]/);
});

test('it uses the project\'s copy of vite and restores workspace detection', async t => {
  const root = project(t);
  const config = await knobs({ controls: 'controls.js' }).config({ root });
  assert.deepEqual(config.server.fs.allow, [`${root}/from-the-project`, repo]);
});

test('it dedupes React', async t => {
  const config = await knobs({ controls: 'controls.js' }).config({ root: project(t) });
  assert.deepEqual(config.resolve.dedupe, ['react', 'react-dom']);
});

test('it adds nothing for server rendering or pre-bundling', async t => {
  const config = await knobs({ controls: 'controls.js' }).config({ root: project(t) });
  assert.equal(config.ssr, undefined);
  assert.equal(config.optimizeDeps, undefined);
});

for (const [name, file] of [
  ['the controls file', root => join(root, 'app', 'controls.ts')],
  ['the values file', root => join(root, 'knobs.values.json')],
  ['a file in the knobs checkout', () => join(repo, 'src', 'drawer.js')],
]) test(`a change to ${name} is a full reload`, async t => {
  const root = project(t);
  const plugin = knobs({ controls: 'app/controls.ts' });
  await plugin.config({ root });
  const { sent, server } = fakeServer();
  assert.deepEqual(plugin.handleHotUpdate({ file: file(root), server }), []);
  assert.deepEqual(sent, [{ type: 'full-reload' }]);
});

test('a change to any other file is left to Vite', async t => {
  const root = project(t);
  const plugin = knobs({ controls: 'controls.js' });
  await plugin.config({ root });
  const { sent, server } = fakeServer();
  assert.equal(plugin.handleHotUpdate({ file: join(root, 'src', 'App.jsx'), server }), undefined);
  assert.deepEqual(sent, []);
});

test('a sibling directory that only shares the knobs prefix is left to Vite', async t => {
  const root = project(t);
  const plugin = knobs({ controls: 'controls.js' });
  await plugin.config({ root });
  const { sent, server } = fakeServer();
  assert.equal(plugin.handleHotUpdate({ file: `${repo}-other/src/a.js`, server }), undefined);
  assert.deepEqual(sent, []);
});
