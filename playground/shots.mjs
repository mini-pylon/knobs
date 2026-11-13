// npm run playground:shots [-- --only <what> --out <dir> --scale 2]
// Saves every tab of each scenario as <scenario>-NN-<tab>.png, and the grid
// of them all as grid.png. <what> is a set (exemplars, seeds, drafts, captures, all), or one
// scenario id (stress, random:42, exemplar:curve-trace), or several joined
// with commas. The default is all; the default out is playground/.shots.
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { closeAll, launch, repo } from '../tests/browser/lib/harness.mjs';
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
try {
  const context = await browser.newContext({ viewport, deviceScaleFactor });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  // The set's scenario ids, as the grid lists them.
  const sets = new Set(['exemplars', 'seeds', 'drafts', 'captures', 'all']);
  let ids = values.only.split(',');
  if (ids.length === 1 && sets.has(ids[0])) {
    await page.goto(`${site.url}grid.html?set=${ids[0]}&n=8`);
    await page.locator('body[data-ready]').waitFor({ timeout: 60000 });
    ids = await page.locator('.cell iframe').evaluateAll(frames => frames.map(f => f.title));
  }

  for (const id of ids) {
    errors.length = 0;
    await page.goto(`${site.url}stage.html?s=${encodeURIComponent(id)}`);
    await page.locator('body[data-ready], body[data-error]').waitFor({ timeout: 30000 });
    const failed = await page.locator('body').getAttribute('data-error');
    if (failed) { failures.push(`${id}: ${failed}`); continue; }
    const tabs = page.locator('.term-tab');
    const labels = await tabs.allInnerTexts();
    const stem = id.replace(/[^\w.-]+/g, '-');
    for (let i = 0; i < labels.length; i++) {
      await tabs.nth(i).click();
      await page.waitForTimeout(400);
      const file = join(out, `${stem}-${String(i + 1).padStart(2, '0')}-${labels[i].replace(/[^\w.-]+/g, '_')}.png`);
      await page.screenshot({ path: file });
      console.log(file);
    }
    if (errors.length) failures.push(`${id}: ${errors.join('; ')}`);
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${site.url}grid.html?ids=${ids.map(encodeURIComponent).join(',')}&w=640&h=420`);
  await page.locator('body[data-ready]').waitFor({ timeout: 60000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(out, 'grid.png'), fullPage: true });
  console.log(join(out, 'grid.png'));
  await context.close();
} finally {
  await closeAll(() => browser.close(), () => site.close());
}
if (failures.length) {
  console.error(`failed:\n${failures.join('\n')}`);
  process.exit(1);
}
