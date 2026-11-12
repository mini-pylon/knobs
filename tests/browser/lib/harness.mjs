import { cp, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

export const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const scratch = join(repo, 'tests', '.tmp');

export function aliases() {
  return [
    { find: /^knobs\/react$/, replacement: join(repo, 'src/react.js') },
    { find: /^knobs\/vite$/, replacement: join(repo, 'src/vite.js') },
    { find: /^knobs$/, replacement: join(repo, 'src/index.js') },
  ];
}

// A private copy of a fixture, inside the repository so bare imports resolve.
export async function copyFixture(name) {
  await mkdir(scratch, { recursive: true });
  const root = await mkdtemp(join(scratch, `${name}-`));
  await cp(join(repo, 'tests', 'fixtures', name), root, { recursive: true });
  return { root, remove: () => rm(root, { recursive: true, force: true }) };
}

export function viteConfig(root, extra = {}) {
  const { plugins = [], ...rest } = extra;
  return {
    configFile: false,
    root,
    cacheDir: join(root, '.vite'),
    logLevel: 'error',
    plugins,
    resolve: { alias: aliases(), dedupe: ['react', 'react-dom'] },
    optimizeDeps: { include: ['react', 'react-dom/client'] },
    server: { host: '127.0.0.1', port: 0, strictPort: false, fs: { allow: [repo] } },
    ...rest,
  };
}

export async function serve(root, extra) {
  const server = await createServer(viteConfig(root, extra));
  await server.listen();
  const { port } = server.httpServer.address();
  return { server, url: `http://127.0.0.1:${port}/`, port, close: () => server.close() };
}

export function launch() {
  return chromium.launch({ executablePath: process.env.KNOBS_CHROMIUM || undefined });
}

export async function newPage(browser, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true, ...options });
  context.setDefaultTimeout(10000);
  return context.newPage();
}

// Console errors and uncaught exceptions on a page, as strings.
export function collectErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  return errors;
}

export async function openDrawer(page) {
  await page.keyboard.press('Backquote');
  await page.locator('.term.open .term-drawer').waitFor();
}

export async function type(page, line) {
  const prompt = page.locator('.term-prompt input');
  await prompt.fill(line);
  await prompt.press('Enter');
}

export const logText = page => page.locator('.term-log').innerText();
