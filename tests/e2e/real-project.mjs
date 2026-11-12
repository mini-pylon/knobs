// One end-to-end run on a real project through a symlinked install. It copies
// the project's committed tree and this repository's package (with no
// node_modules, as a fresh checkout has none) to a temporary directory, installs
// knobs as a file: dependency, wires it the way the skill will, and drives it.
// Run it both ways: with no flag the linked package has no node_modules at all,
// which proves nothing depends on packages beside it; with --own-react it has its
// own React, as a real checkout does, which proves React is deduped.
// usage: node tests/e2e/real-project.mjs <path to the drop checkout> [--own-react]
import '../../src/vite.js';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, cpSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const project = process.argv[2];
const ownReact = process.argv[3] === '--own-react';
if (!project) { console.error('usage: real-project.mjs <project checkout> [--own-react]'); process.exit(2); }
const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const work = realpathSync(mkdtempSync(join(tmpdir(), 'knobs-e2e-')));
const knobsDir = join(work, 'knobs'), app = join(work, 'app');
const say = text => console.log(`e2e: ${text}`);
const run = (file, args, cwd) => execFileSync(file, args, { cwd, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' });

function freePort() {
  return new Promise(done => {
    const probe = createServer().listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => done(port));
    });
  });
}
async function waitForServer(url) {
  for (let i = 0; i < 240; i++) {
    try { if ((await fetch(url)).ok) return; } catch {}
    await new Promise(done => setTimeout(done, 250));
  }
  throw new Error(`no server at ${url}`);
}

let server, browser;
try {
  mkdirSync(knobsDir);
  for (const name of ['src', 'types', 'package.json']) cpSync(join(repo, name), join(knobsDir, name), { recursive: true });
  if (ownReact) cpSync(join(repo, 'node_modules', 'react'), join(knobsDir, 'node_modules', 'react'), { recursive: true });
  mkdirSync(app);
  const archive = join(work, 'project.tar');
  run('git', ['-C', project, 'archive', '--format=tar', '-o', archive, 'HEAD']);
  run('tar', ['-xf', archive, '-C', app]);
  run('npm', ['ci', '--prefer-offline', '--ignore-scripts', '--no-audit', '--no-fund'], app);
  run('npm', ['install', '--prefer-offline', '--ignore-scripts', '--no-audit', '--no-fund', '--save-dev', 'file:../knobs'], app);
  assert.ok(lstatSync(join(app, 'node_modules', 'knobs')).isSymbolicLink(), 'knobs is a symlink');
  say('installed through a symlink');

  writeFileSync(join(app, 'knobs.values.json'), '{}\n');
  writeFileSync(join(app, 'src', 'controls.ts'), `import { defineControls } from 'knobs';
import { bindReact } from 'knobs/react';
import values from '../knobs.values.json';

export const knobs = defineControls([
  { name: 'hero', about: 'A real project', controls: [
    { key: 'title', type: 'text', value: 'The original headline' },
  ] },
], values);
export const { control, onControl } = knobs;
export const useControl = bindReact(knobs);
`);
  const config = join(app, 'vite.config.ts');
  const before = readFileSync(config, 'utf8');
  const after = before.replace('plugins: [react(), tailwindcss()]', "plugins: [react(), tailwindcss(), knobs({ controls: 'src/controls.ts' })]");
  assert.notEqual(after, before, 'the plugin was registered');
  writeFileSync(config, `import knobs from 'knobs/vite';\n${after}`);
  appendFileSync(join(app, 'src', 'main.tsx'), `
import { createElement as knobsH, useEffect as knobsEffect } from 'react';
import { createRoot as knobsRoot } from 'react-dom/client';
import { mountKnobs } from 'knobs';
import { knobs as knobsStore, useControl } from './controls';
(window as any).__boots = Number(sessionStorage.getItem('boots') ?? 0) + 1;
sessionStorage.setItem('boots', String((window as any).__boots));
function KnobsProbe() {
  const title = useControl('hero.title');
  knobsEffect(() => mountKnobs(knobsStore, { name: 'e2e' }), []);
  return knobsH('output', { id: 'knobs-probe' }, String(title));
}
const knobsHost = document.createElement('div');
document.body.append(knobsHost);
knobsRoot(knobsHost).render(knobsH(KnobsProbe));
`);

  const port = await freePort();
  const url = `http://127.0.0.1:${port}/`;
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: app, stdio: ['ignore', 'inherit', 'inherit'] });
  await waitForServer(url);
  say('dev server is up');

  browser = await chromium.launch({ executablePath: process.env.KNOBS_CHROMIUM || undefined });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.setDefaultTimeout(60000);
  const failures = [];
  page.on('pageerror', error => failures.push(error.message));
  page.on('console', message => { if (/Invalid hook call|more than one copy of React/.test(message.text())) failures.push(message.text()); });
  // Nothing from this run may reach the project's live backend.
  await page.route('**/dufs/**', route => route.abort());
  await page.goto(url);
  await page.locator('#knobs-probe').waitFor({ state: 'attached' });
  await page.locator('[data-knobs]').waitFor({ state: 'attached' });
  assert.equal(await page.locator('#knobs-probe').textContent(), 'The original headline');
  say('the drawer mounted and a useControl read rendered');

  await page.locator('body').press('Backquote');
  await page.locator('.term.open .term-drawer').waitFor();
  const prompt = page.locator('.term-prompt input');
  const style = await page.evaluate(() => getComputedStyle(document.querySelector('[data-knobs]').shadowRoot.querySelector('.term-tab:not(.active)')).color);
  assert.equal(style, 'rgb(232, 197, 71)', 'the project CSS does not reach the drawer');
  await prompt.fill('hero.title Set in a real project');
  await prompt.press('Enter');
  await page.waitForFunction(() => document.getElementById('knobs-probe').textContent === 'Set in a real project');
  say('the drawer drives the read');

  const urls = await page.evaluate(() => performance.getEntriesByType('resource').map(entry => entry.name));
  const paths = urls.map(name => new URL(name).pathname);
  const reacts = paths.filter(path => /\/deps\/react\.js$/.test(path));
  assert.equal(reacts.length, 1, 'one pre-bundled React');
  assert.ok(paths.some(path => path.endsWith('/knobs/src/react.js')), 'knobs/react was served from the linked checkout');
  assert.equal(paths.filter(path => path.includes('/knobs/node_modules/')).length, 0, 'nothing loaded from inside knobs');
  say('one copy of React');

  await prompt.fill('save');
  await prompt.press('Enter');
  await page.waitForFunction(() => window.__boots === 2, undefined, { timeout: 20000 }).catch(async error => {
    throw new Error(`save did not reload the page. The drawer said:\n${await page.locator('.term-log').innerText()}\n${error.message}`);
  });
  assert.deepEqual(JSON.parse(readFileSync(join(app, 'knobs.values.json'), 'utf8')), { 'hero.title': 'Set in a real project' });
  say('save wrote the values file and the page reloaded');

  await page.locator('[data-knobs]').waitFor({ state: 'attached' });
  await new Promise(done => setTimeout(done, 1000));
  appendFileSync(join(knobsDir, 'src', 'style.js'), '\n// edited by the end-to-end run\n');
  await page.waitForFunction(() => window.__boots === 3);
  await page.locator('[data-knobs]').waitFor({ state: 'attached' });
  assert.equal(await page.locator('#knobs-probe').textContent(), 'Set in a real project');
  say('a change in the knobs checkout reloaded the page');

  // In the browser a bare react import always maps to the pre-bundled copy, so
  // only server rendering shows whether the linked package's own React is deduped.
  writeFileSync(join(app, 'src', 'ssr-probe.ts'), `import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { useControl } from './controls';
function Probe() { return createElement('h1', null, String(useControl('hero.title'))); }
export const html = () => renderToString(createElement(Probe));
`);
  writeFileSync(join(app, 'ssr-probe.mjs'), `import { createServer } from 'vite';
const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error', cacheDir: 'node_modules/.vite-ssr-probe' });
const { html } = await vite.ssrLoadModule('/src/ssr-probe.ts');
console.log(html());
await vite.close();
process.exit(0);
`);
  assert.match(run(process.execPath, ['ssr-probe.mjs'], app), /<h1>Set in a real project<\/h1>/);
  say('server rendering used one copy of React');

  assert.deepEqual(failures, []);
  say('ok');
} finally {
  await browser?.close();
  server?.kill();
  rmSync(work, { recursive: true, force: true });
}
