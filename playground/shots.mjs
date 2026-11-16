// npm run playground:shots [-- --only <what> --out <dir> --scale 2]
// Saves every tab of each scenario as <scenario>-NN-<tab>.png, and the grid
// of them all as grid.png. A capture also saves each visible tab of its
// source page as capture-<project>-source-<tab>.png. <what> is a set
// (exemplars, seeds, drafts, captures, all), or one scenario id (stress,
// random:42, exemplar:curve-trace), or several joined with commas. The
// default is all; the default out is playground/.shots.
import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { closeAll, launch, repo } from '../tests/browser/lib/harness.mjs';
import * as wingsVdb from './adapters/wings-vdb.mjs';
import { openSourceTab, seedSource, SOURCE_MOUNTS, SOURCES, sourceDocumentError, sourceSeed, sourceUrl } from './fixtures/source-side.js';
import { servePlayground } from './server.mjs';

const { values } = parseArgs({ options: {
  only: { type: 'string', default: 'all' },
  out: { type: 'string', default: join(repo, 'playground', '.shots') },
  scale: { type: 'string', default: '2' },
  width: { type: 'string', default: '1440' },
  height: { type: 'string', default: '900' },
} });
const out = resolve(values.out);
await mkdir(out, { recursive: true });
const viewport = { width: Number(values.width), height: Number(values.height) };
const deviceScaleFactor = Number(values.scale);

const site = await servePlayground();
const browser = await launch();
const failures = [];

// One capture's source page, one tab at a time, in a browser of its own.
// The fonts page is only a document on this origin, so the seed is written
// before the source page starts. Its path is the wings-vdb mount.
async function shootSource(id) {
  const project = id.slice('capture:'.length);
  if (!SOURCES[project]) {
    failures.push(`${id}: no source side for ${project}`);
    return;
  }
  const capturePath = join(site.captures, project, 'capture.json');
  let capture;
  try {
    capture = JSON.parse(await readFile(capturePath, 'utf8'));
  } catch (error) {
    failures.push(`${id}: ${capturePath}: ${error.message}`);
    return;
  }
  if (!capture.vendored) {
    console.log(`no source side for ${id}: no snapshot`);
    return;
  }
  const fontsPath = SOURCE_MOUNTS['wings-vdb']?.fonts;
  if (!fontsPath) {
    failures.push(`${id}: no fonts path for wings-vdb`);
    return;
  }
  if (!Array.isArray(capture.groups)) {
    failures.push(`${id}: the capture lists no groups`);
    return;
  }
  const tabs = capture.groups.filter(group => !group.hidden).map(group => group.name);
  const args = project === wingsVdb.name ? wingsVdb.dev.chromiumArgs : [];
  const pageUrl = new URL(sourceUrl(project), site.url).href;
  let sourceBrowser;
  try {
    sourceBrowser = await chromium.launch({
      executablePath: process.env.KNOBS_CHROMIUM || undefined,
      args,
    });
    const context = await sourceBrowser.newContext({ viewport, deviceScaleFactor });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    for (const tab of tabs) {
      try {
        pageErrors.length = 0;
        await page.goto(new URL(fontsPath, site.url).href);
        await page.evaluate(seedSource, sourceSeed(project, capture, 'defaults', tab));
        await page.goto(pageUrl);
        const problem = await page.evaluate(sourceDocumentError);
        if (problem) throw new Error(problem);
        await page.evaluate(openSourceTab, { tab });
        await page.waitForTimeout(800);
        const file = join(out, `capture-${project}-source-${tab.replace(/[^\w.-]+/g, '_')}.png`);
        await page.screenshot({ path: file });
        console.log(file);
        if (pageErrors.length) failures.push(`${id}: ${tab}: ${pageUrl}: ${pageErrors.join('; ')}`);
      } catch (error) {
        failures.push(`${id}: ${tab}: ${pageUrl}: ${error.message}`);
      }
    }
  } catch (error) {
    failures.push(`${id}: ${pageUrl}: ${error.message}`);
  } finally {
    if (!sourceBrowser) return;
    try {
      await sourceBrowser.close();
    } catch (error) {
      failures.push(`${id}: close: ${error.message}`);
    }
  }
}

try {
  const context = await browser.newContext({ viewport, deviceScaleFactor });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  // The set's scenario ids. Captures come from the scenario list, not from a
  // grid of source cells: that grid would run every source page just to name them.
  const sets = new Set(['exemplars', 'seeds', 'drafts', 'captures', 'all']);
  // A set that cannot be listed is one failure naming the page that lists it,
  // with any page error seen there; nothing is shot after it.
  let ids = values.only.split(',');
  let listed = true;
  let listUrl = site.url;
  try {
    if (ids.length === 1 && ids[0] === 'captures') {
      await page.goto(listUrl);
      const names = await page.evaluate(async () => {
        const { captureNames } = await import('./scenarios.js');
        return captureNames;
      });
      ids = names.map(name => name.startsWith('capture:') ? name : `capture:${name}`);
    } else if (ids.length === 1 && sets.has(ids[0])) {
      listUrl = `${site.url}grid.html?set=${ids[0]}&n=8`;
      await page.goto(listUrl);
      await page.locator('body[data-ready]').waitFor({ timeout: 60000 });
      // Knobs cells only: a capture row's source and shot cells are not scenarios.
      const titles = await page.locator('.cell:not(.source):not(.shot) iframe').evaluateAll(frames => frames.map(f => f.title));
      ids = [...new Set(titles)];
    }
  } catch (error) {
    const seen = errors.length ? `; page errors: ${errors.join('; ')}` : '';
    failures.push(`${values.only}: ${listUrl}: ${error.message}${seen}`);
    listed = false;
    ids = [];
  }

  for (const id of ids) {
    const stageUrl = `${site.url}stage.html?s=${encodeURIComponent(id)}`;
    try {
      errors.length = 0;
      await page.goto(stageUrl);
      await page.locator('body[data-ready], body[data-error]').waitFor({ timeout: 30000 });
      const failed = await page.locator('body').getAttribute('data-error');
      if (failed) {
        failures.push(`${id}: ${stageUrl}: ${failed}`);
        continue;
      }
      const tabs = page.locator('.term-tab');
      const labels = await tabs.allInnerTexts();
      const stem = id.replace(/[^\w.-]+/g, '-');
      for (let i = 0; i < labels.length; i++) {
        const tab = labels[i];
        try {
          await tabs.nth(i).click();
          await page.waitForTimeout(400);
          const file = join(out, `${stem}-${String(i + 1).padStart(2, '0')}-${tab.replace(/[^\w.-]+/g, '_')}.png`);
          await page.screenshot({ path: file });
          console.log(file);
        } catch (error) {
          failures.push(`${id}: ${tab}: ${stageUrl}: ${error.message}`);
        }
      }
      if (errors.length) failures.push(`${id}: ${stageUrl}: ${errors.join('; ')}`);
    } catch (error) {
      failures.push(`${id}: ${stageUrl}: ${error.message}`);
    }
  }

  for (const id of ids) {
    if (id.startsWith('capture:')) await shootSource(id);
  }

  // The grid's source cells are live frames of the real pages, so its
  // screenshot can stall as theirs can; the failure names the grid page.
  const gridUrl = `${site.url}grid.html?ids=${ids.map(encodeURIComponent).join(',')}&w=640&h=420`;
  if (listed) {
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(gridUrl);
      await page.locator('body[data-ready]').waitFor({ timeout: 60000 });
      await page.waitForTimeout(400);
      await page.screenshot({ path: join(out, 'grid.png'), fullPage: true });
      console.log(join(out, 'grid.png'));
    } catch (error) {
      failures.push(`grid: ${gridUrl}: ${error.message}`);
    }
  }
  await context.close();
} finally {
  await closeAll(() => browser.close(), () => site.close());
}
if (failures.length) {
  console.error(`failed:\n${failures.join('\n')}`);
  process.exit(1);
}
