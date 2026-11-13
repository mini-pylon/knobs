// npm run playground:capture -- <project> [checkout] [--out dir] [--reports dir] [--dev url] [--scale 1]
// Captures a project's own drawer into <out>/<project>/: capture.json (its
// source, groups in knobs form, value sets, and what does not translate),
// and shots/ of the project's drawer, one PNG per tab, when its dev server
// is already up. It never starts a server and never writes to the checkout.
// <project> is wings-vdb or mini-pylon; out defaults to playground/captures.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { build } from './adapters/common.mjs';
import * as miniPylon from './adapters/mini-pylon.mjs';
import * as wingsVdb from './adapters/wings-vdb.mjs';

const adapters = { [wingsVdb.name]: wingsVdb, [miniPylon.name]: miniPylon };
const here = new URL('.', import.meta.url).pathname;

const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  out: { type: 'string', default: join(here, 'captures') },
  reports: { type: 'string' },
  dev: { type: 'string' },
  scale: { type: 'string', default: '1' },
} });
const [project, checkoutArg] = positionals;
const adapter = adapters[project];
if (!adapter) {
  console.error(`unknown project: ${project ?? '(none)'}; one of ${Object.keys(adapters).join(', ')}`);
  process.exit(2);
}
const checkout = resolve(checkoutArg ?? adapter.defaultCheckout);
const devUrl = values.dev ?? adapter.dev.url;

async function answering(url) {
  try {
    await fetch(url, { signal: AbortSignal.timeout(2000) });
    return true;
  } catch { return false; }
}

// One PNG per tab of the project's own drawer, as { tab, file } relative to dir.
async function shoot(dir) {
  const browser = await chromium.launch({ executablePath: process.env.KNOBS_CHROMIUM || undefined, args: adapter.dev.chromiumArgs });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: Number(values.scale) });
    await page.goto(devUrl, { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    await adapter.dev.open(page);
    const tabs = page.locator(adapter.dev.tabs);
    await tabs.first().waitFor({ timeout: 15000 });
    const labels = (await tabs.allInnerTexts()).map(t => t.trim());
    mkdirSync(join(dir, 'shots'), { recursive: true });
    const shots = [];
    for (let i = 0; i < labels.length; i++) {
      await tabs.nth(i).click();
      await page.waitForTimeout(800);
      const file = `shots/${String(i + 1).padStart(2, '0')}-${labels[i].replace(/[^\w.-]+/g, '_')}.png`;
      await page.screenshot({ path: join(dir, file) });
      shots.push({ tab: labels[i], file });
    }
    return shots;
  } finally { await browser.close(); }
}

const capture = await build(adapter, checkout, values.reports ? { reports: resolve(values.reports) } : {});
const dir = join(resolve(values.out), project);
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
if (await answering(devUrl)) capture.shots = await shoot(dir);
else capture.shotsSkipped = `the dev server at ${devUrl} was not answering`;
writeFileSync(join(dir, 'capture.json'), `${JSON.stringify(capture, null, 2)}\n`);
console.log(join(dir, 'capture.json'));
for (const shot of capture.shots) console.log(join(dir, shot.file));
if (capture.shotsSkipped) console.log(`no shots: ${capture.shotsSkipped}`);
