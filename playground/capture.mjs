// npm run playground:capture -- <project> [checkout] [--out dir] [--reports dir] [--dev url] [--scale 1]
// Captures a project's own drawer into <out>/<project>/: capture.json (its
// source, groups in knobs form, value sets, what does not translate, and
// vendored, the snapshot), source/ (that snapshot), and shots/ of the
// project's drawer, one PNG per tab, when its dev server is already up.
// The folder is moved into place only once the snapshot and the shots are
// complete. It never starts a server and never writes to the checkout.
// <project> is wings-vdb or mini-pylon; out defaults to playground/captures.
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { build, snapshot } from './adapters/common.mjs';
import * as miniPylon from './adapters/mini-pylon.mjs';
import * as wingsVdb from './adapters/wings-vdb.mjs';
import { pngSize } from './png.mjs';
import { placeCapture, recover, removeAside, restoreAside } from './publish.mjs';

const adapters = { [wingsVdb.name]: wingsVdb, [miniPylon.name]: miniPylon };
const here = new URL('.', import.meta.url).pathname;

async function answering(url) {
  try {
    await fetch(url, { signal: AbortSignal.timeout(2000) });
    return true;
  } catch { return false; }
}

// One Chromium for every downscale in this run, closed when the run ends.
let browser;

function named(file, error) {
  const message = `${error.message ?? error}`;
  if (!file || message.includes(file)) return error instanceof Error ? error : new Error(message);
  return new Error(`${file}: ${message}`);
}

async function openPage() {
  if (!browser) browser = await chromium.launch({ executablePath: process.env.KNOBS_CHROMIUM || undefined });
  return browser.newPage();
}

// `file` is the picture being scaled, so a decode failure names it.
// `options.page` injects the page a test decodes with.
export async function downscale(png, width, file, options = {}) {
  const page = options.page ?? await openPage();
  try {
    let size;
    try {
      size = pngSize(png);
    } catch (error) {
      throw named(file, error);
    }
    const height = Math.round(size.height * width / size.width);
    const dataUrl = `data:image/png;base64,${png.toString('base64')}`;
    let url;
    let timer;
    try {
      const deadline = options.deadline ?? 30000;
      const pending = page.evaluate(async ({ dataUrl, width, height }) => {
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
      }, { dataUrl, width, height }).then(
        value => ({ ok: true, value }),
        error => ({ ok: false, error }),
      );
      const expired = new Promise(resolve => {
        timer = setTimeout(() => resolve({ ok: false, timedOut: true }), deadline);
      });
      const result = await Promise.race([pending, expired]);
      if (!result.ok) {
        if (result.timedOut) {
          await closeQuietly(() => page.close(), line => console.error(line), 'page');
          throw named(file, new Error('timed out'));
        }
        throw named(file, result.error);
      }
      url = result.value;
    } catch (error) {
      throw named(file, error);
    } finally {
      clearTimeout(timer);
    }
    return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
  } finally {
    await closeQuietly(() => page.close(), line => console.error(line), 'page');
  }
}

// A close that rejects is a warning. It must not replace the error already
// in flight, and it must not decide the exit code.
async function closeQuietly(closer, warn, what = 'browser') {
  try {
    await closer();
  } catch (error) {
    warn(`capture: could not close the ${what}: ${error.message ?? error}`);
  }
}

// Prints the capture's outcome, then cleans up. A cleanup failure is another
// line, never a replacement for that outcome. The exit code is 1 only when
// the capture was not published.
export async function unwindCapture({
  error = null,
  published = false,
  aside = null,
  dest = null,
  partial = null,
  browser = null,
  fs = null,
  warn = line => console.error(line),
} = {}) {
  if (!published && error) {
    warn(`capture failed: ${error.message}`);
    if (aside && dest) {
      const renameError = restoreAside(aside, dest, fs);
      if (renameError) warn(`capture: could not put the last capture back: ${renameError.message}`);
    }
    if (partial) {
      try {
        const files = fs ?? { rmSync };
        files.rmSync(partial, { recursive: true, force: true });
      } catch (rmError) {
        warn(`capture: could not remove ${partial}: ${rmError.message}`);
      }
    }
  }
  if (browser) await closeQuietly(() => browser.close(), warn);
  if (published && aside) {
    const warning = removeAside(aside, fs);
    if (warning) warn(warning);
  }
  return published || !error ? 0 : 1;
}

function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

async function main() {
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

  // One PNG per tab of the project's own drawer, as { tab, file } relative to dir.
  async function shoot(dir) {
    const shotBrowser = await chromium.launch({ executablePath: process.env.KNOBS_CHROMIUM || undefined, args: adapter.dev.chromiumArgs });
    try {
      const page = await shotBrowser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: Number(values.scale) });
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
    } finally {
      await closeQuietly(() => shotBrowser.close(), line => console.error(line));
    }
  }

  const out = resolve(values.out);
  const dest = join(out, project);
  let partial = null;
  let aside = null;
  let published = false;
  let failed = null;
  try {
    mkdirSync(out, { recursive: true });
    recover(out, project);
    partial = mkdtempSync(join(out, `.${project}-new-`));
    const capture = await build(adapter, checkout, values.reports ? { reports: resolve(values.reports) } : {});
    capture.vendored = await snapshot(adapter, checkout, join(partial, 'source'), { downscale });
    if (await answering(devUrl)) capture.shots = await shoot(partial);
    else capture.shotsSkipped = `the dev server at ${devUrl} was not answering`;
    writeFileSync(join(partial, 'capture.json'), `${JSON.stringify(capture, null, 2)}\n`);
    aside = placeCapture({ out, project, partial, dest }).aside;
    published = true;
    console.log(join(dest, 'capture.json'));
    console.log(join(dest, 'source'));
    for (const shot of capture.shots) console.log(join(dest, shot.file));
    if (capture.shotsSkipped) console.log(`no shots: ${capture.shotsSkipped}`);
  } catch (error) {
    if (error.aside) aside = error.aside;
    failed = error;
  }
  const code = await unwindCapture({ error: failed, published, aside, dest, partial, browser });
  if (code) process.exitCode = code;
}

if (invokedDirectly()) {
  await main();
}
