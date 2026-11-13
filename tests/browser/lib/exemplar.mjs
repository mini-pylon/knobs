// What the exemplar tests and the shots script share: where the exemplars
// are, the fixture page, and the fake clock recipe that makes a picture's
// frames the same on every run.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { collectErrors, newPage, openDrawer, repo, type } from './harness.mjs';

export const exemplarsDir = join(repo, 'skills', 'knobs', 'exemplars');

// One fixed epoch, so every trial sees the same fake times.
export const T0 = Date.UTC(2026, 0, 1);

export function folders() {
  if (!existsSync(exemplarsDir)) return [];
  return readdirSync(exemplarsDir, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
}

export function kindOf(name) {
  const dir = join(exemplarsDir, name);
  if (existsSync(join(dir, 'visual.js'))) return 'picture';
  if (existsSync(join(dir, 'extension.js'))) return 'extension';
  return null;
}

export const loadControls = name => import(pathToFileURL(join(exemplarsDir, name, 'controls.js')).href);

// Recipe steps 1 and 2: a 1280x800 page whose clock is paused before it
// loads, the fixture mounted on one exemplar, then the start-up timers.
// `values` is seeded as the drawer's saved values before the page loads.
export async function openExemplar(browser, url, name, { values } = {}) {
  const page = await newPage(browser);
  const errors = collectErrors(page);
  if (values) await page.addInitScript(saved => localStorage.setItem('exemplar:values', saved), JSON.stringify(values));
  await page.clock.install({ time: T0 });
  await page.clock.pauseAt(T0 + 1000);
  await page.goto(`${url}?name=${encodeURIComponent(name)}`);
  await page.locator('[data-knobs], body[data-error]').first().waitFor({ state: 'attached' });
  const failed = await page.evaluate(() => document.body.dataset.error ?? null);
  if (failed) {
    await page.context().close();
    throw new Error(failed);
  }
  await page.clock.runFor(100);
  return { page, errors };
}

// Recipe steps 3 and 4: open the drawer, type any console lines first,
// open the exemplar's group or page, let the drawer's timers and its CSS
// slide finish, then let several frames draw from the same start.
export async function settle(page, lines = []) {
  await openDrawer(page);
  for (const line of lines) {
    await type(page, line);
    await page.clock.runFor(2000);
  }
  const target = await page.evaluate(() => window.__exemplar.target);
  await page.locator('.term-tab', { hasText: new RegExp(`^${target}$`) }).click();
  await page.clock.runFor(100);
  await page.waitForTimeout(300);
  await page.clock.runFor(500);
}

// The picture's canvas, reduced to its size, how many pixels have any
// alpha, and a hash of every byte.
export function readCanvas(page) {
  return page.locator('canvas.viz-chart').evaluate(canvas => {
    const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    let hash = 0x811c9dc5, painted = 0;
    for (let i = 0; i < data.length; i++) {
      hash = Math.imul(hash ^ data[i], 0x01000193) >>> 0;
      if (i % 4 === 3 && data[i] > 0) painted++;
    }
    return { width: canvas.width, height: canvas.height, painted, hash };
  });
}

// One picture trial: a fresh page through the whole recipe, ending with
// the canvas read.
export async function pictureTrial(browser, url, name, values) {
  const { page } = await openExemplar(browser, url, name, { values });
  try {
    await settle(page);
    return await readCanvas(page);
  } finally {
    await page.context().close();
  }
}
