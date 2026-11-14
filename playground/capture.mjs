// npm run playground:capture -- <project> [checkout] [--out dir] [--reports dir] [--dev url] [--scale 1]
// Captures a project's own drawer into <out>/<project>/: capture.json (its
// source, groups in knobs form, value sets, what does not translate, and
// vendored, the snapshot), source/ (that snapshot), and shots/ of the
// project's drawer, one PNG per tab, when its dev server is already up.
// The folder is moved into place only once the snapshot and the shots are
// complete. It never starts a server and never writes to the checkout.
// <project> is wings-vdb or mini-pylon; out defaults to playground/captures.
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { build, snapshot } from './adapters/common.mjs';
import * as miniPylon from './adapters/mini-pylon.mjs';
import * as wingsVdb from './adapters/wings-vdb.mjs';
import { pngSize } from './png.mjs';

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

// One Chromium for every downscale in this run, closed when the run ends.
let browser;
async function downscale(png, width) {
  if (!browser) browser = await chromium.launch({ executablePath: process.env.KNOBS_CHROMIUM || undefined });
  const page = await browser.newPage();
  try {
    const size = pngSize(png);
    const height = Math.round(size.height * width / size.width);
    const dataUrl = `data:image/png;base64,${png.toString('base64')}`;
    const url = await page.evaluate(async ({ dataUrl, width, height }) => {
      const image = new Image();
      image.src = dataUrl;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(image, 0, 0, width, height);
      return canvas.toDataURL('image/png');
    }, { dataUrl, width, height });
    return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
  } finally {
    await page.close();
  }
}

const out = resolve(values.out);
const dest = join(out, project);
let partial = null;
let aside = null;
let published = false;
try {
  mkdirSync(out, { recursive: true });
  // A run that died after moving the last capture aside left it as .<project>-old-….
  if (!existsSync(dest)) {
    const olds = readdirSync(out).filter(name => name.startsWith(`.${project}-old-`));
    if (olds.length) {
      olds.sort((a, b) => statSync(join(out, b)).mtimeMs - statSync(join(out, a)).mtimeMs);
      renameSync(join(out, olds[0]), dest);
    }
  }
  for (const name of readdirSync(out)) {
    if (name.startsWith(`.${project}-`)) rmSync(join(out, name), { recursive: true, force: true });
  }
  partial = mkdtempSync(join(out, `.${project}-new-`));
  const capture = await build(adapter, checkout, values.reports ? { reports: resolve(values.reports) } : {});
  capture.vendored = await snapshot(adapter, checkout, join(partial, 'source'), { downscale });
  if (await answering(devUrl)) capture.shots = await shoot(partial);
  else capture.shotsSkipped = `the dev server at ${devUrl} was not answering`;
  writeFileSync(join(partial, 'capture.json'), `${JSON.stringify(capture, null, 2)}\n`);
  if (existsSync(dest)) {
    aside = join(out, `.${project}-old-${randomBytes(4).toString('hex')}`);
    renameSync(dest, aside);
  }
  renameSync(partial, dest);
  published = true;
  console.log(join(dest, 'capture.json'));
  console.log(join(dest, 'source'));
  for (const shot of capture.shots) console.log(join(dest, shot.file));
  if (capture.shotsSkipped) console.log(`no shots: ${capture.shotsSkipped}`);
} catch (error) {
  if (aside && !existsSync(dest)) renameSync(aside, dest);
  if (partial) rmSync(partial, { recursive: true, force: true });
  console.error(`capture failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
}
if (published && aside) {
  try {
    rmSync(aside, { recursive: true, force: true });
  } catch (error) {
    console.error(`capture: could not remove ${aside}: ${error.message}; the next capture removes it`);
  }
}
