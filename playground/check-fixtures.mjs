// npm run playground:check-fixtures [-- --captures dir]
// Loads each captured project's source page headless and fails when the
// snapshot asks for something it must not, or a picture does not draw.
// Run it after a capture, as a check job. It is not part of test:browser.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import * as miniPylon from './adapters/mini-pylon.mjs';
import * as wingsVdb from './adapters/wings-vdb.mjs';
import { allowedRequest, anotherOrigin } from './fixtures/routes.mjs';
import { defaultTab, openSourceTab, seedSource, SOURCE_MOUNTS, sourceDocumentError, sourceSeed, sourceUrl } from './fixtures/source-side.js';
import { servePlayground } from './server.mjs';

const { values } = parseArgs({ options: { captures: { type: 'string' } } });
const projects = [miniPylon, wingsVdb];
const failures = [];
let site;

try {
  site = await servePlayground({ captures: values.captures, logLevel: 'error' });
  for (const adapter of projects) {
    try {
      await checkProject(adapter);
    } catch (error) {
      const where = SOURCE_MOUNTS[adapter.name]?.source ?? '';
      failures.push(where ? `${adapter.name}: ${where}: ${error.message}` : `${adapter.name}: ${error.message}`);
    }
  }
} catch (error) {
  failures.push(error.message);
} finally {
  if (site) {
    try {
      await site.close();
    } catch (error) {
      failures.push(`close: ${error.message}`);
    }
  }
}

if (failures.length) {
  console.error(`failed:\n${failures.join('\n')}`);
  process.exit(1);
}
console.log('ok');

async function fontsState() {
  const path = SOURCE_MOUNTS['wings-vdb']?.fonts;
  if (!path) throw new Error('no fonts path for wings-vdb');
  const response = await fetch(new URL(path, site.url));
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  if (body?.fonts !== 'local' && body?.fonts !== 'fallback') {
    throw new Error(`${path}: unknown fonts state: ${JSON.stringify(body?.fonts)}`);
  }
  return body.fonts;
}

async function checkProject(adapter) {
  const project = adapter.name;
  const capturePath = join(site.captures, project, 'capture.json');
  const capture = JSON.parse(await readFile(capturePath, 'utf8'));
  if (!capture.vendored) {
    console.log(`skip ${project}: no snapshot`);
    return;
  }
  const state = await fontsState();
  if (!Array.isArray(adapter.dev?.chromiumArgs)) throw new Error('no dev.chromiumArgs');
  const pageUrl = new URL(sourceUrl(project), site.url).href;
  const tab = defaultTab(capture);
  let currentTab = tab;
  // The project stays directly in front of the message: the plan's check
  // matches that wording. The tab and the page URL follow it.
  const note = message => failures.push(`${project}: ${message} (${currentTab}, ${pageUrl})`);
  const browser = await chromium.launch({
    executablePath: process.env.KNOBS_CHROMIUM || undefined,
    args: adapter.dev.chromiumArgs,
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const fontsPath = SOURCE_MOUNTS['wings-vdb'].fonts;
    try {
      await page.goto(new URL(fontsPath, site.url).href);
      await page.evaluate(seedSource, sourceSeed(project, capture, 'defaults', tab));
      watch(page, project, state, note);
      await page.goto(pageUrl);
      const problem = await page.evaluate(sourceDocumentError);
      if (problem) throw new Error(problem);
      await page.evaluate(openSourceTab, { tab });
      if (project === miniPylon.name) {
        const late = await preview(page);
        if (late) note(late);
      }
      const labels = await page.locator('.term-tabs .term-tab').allInnerTexts();
      for (const label of labels) {
        currentTab = label;
        try {
          await page.evaluate(openSourceTab, { tab: label });
          await page.waitForTimeout(600);
          if (project === wingsVdb.name) {
            for (const found of await pictures(page, label)) note(found);
          }
        } catch (error) {
          note(error.message);
        }
      }
      console.log(`${project}: ${labels.length} tabs checked (${labels.join(', ')}; fonts: ${state})`);
    } catch (error) {
      note(error.message);
    }
  } finally {
    try {
      await browser.close();
    } catch (error) {
      failures.push(`${project}: close: ${error.message}`);
    }
  }
}

function watch(page, project, state, note) {
  page.on('request', request => {
    const url = request.url();
    if (url.startsWith('data:') || url.startsWith('blob:')) return;
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      note(`requested another origin: ${url}`);
      return;
    }
    if (anotherOrigin(site.url, url)) {
      note(`requested another origin: ${url}`);
      return;
    }
    if (parsed.pathname === '/favicon.ico') return;
    if (!allowedRequest(parsed.pathname, project)) {
      note(`requested a root path outside the table: ${parsed.pathname}`);
    }
  });
  page.on('pageerror', error => note(`uncaught: ${error.message}`));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const where = message.location()?.url ?? '';
    let path = '';
    try { path = where ? new URL(where).pathname : ''; } catch { path = ''; }
    if (state === 'fallback' && path.startsWith('/fonts/')) return;
    note(`console error: ${message.text()} (${path})`);
  });
}

async function preview(page) {
  try {
    await page.waitForFunction(() => {
      const img = document.querySelector('img.render');
      return Boolean(img && img.complete && img.naturalWidth > 0);
    }, null, { timeout: 15000 });
    return null;
  } catch {
    return 'the preview image never loaded';
  }
}

function pictures(page, tab) {
  return page.evaluate(name => {
    const problems = [];
    for (const canvas of document.querySelectorAll('.term-viz canvas')) {
      const box = canvas.getBoundingClientRect();
      const style = getComputedStyle(canvas);
      if (box.width === 0 || box.height === 0 || style.display === 'none' || style.visibility === 'hidden') continue;
      const context = canvas.getContext('2d');
      if (!context) {
        problems.push(`the picture on the ${name} tab is unreadable`);
        continue;
      }
      let pixels;
      try {
        pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      } catch (error) {
        problems.push(`the picture on the ${name} tab is unreadable: ${error.message}`);
        continue;
      }
      let same = pixels.length >= 4;
      for (let i = 4; same && i < pixels.length; i++) same = pixels[i] === pixels[i % 4];
      if (same) problems.push(`the picture on the ${name} tab is blank`);
    }
    return problems;
  }, tab);
}
