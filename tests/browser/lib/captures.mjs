// A captures folder built from the stand-in checkouts under
// tests/fixtures/captures, as playground:capture writes one: each project's
// capture.json and source/ snapshot, and two shots of wings-vdb's drawer.
// Never the real projects.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { build, snapshot } from '../../../playground/adapters/common.mjs';
import * as miniPylon from '../../../playground/adapters/mini-pylon.mjs';
import * as wingsVdb from '../../../playground/adapters/wings-vdb.mjs';
import { repo } from './harness.mjs';

export const captureFixtures = join(repo, 'tests', 'fixtures', 'captures');
// A 1x1 PNG.
export const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
// The stand-ins' renders are smaller than the preview size, so nothing is downscaled.
const downscale = () => { throw new Error('a stand-in render needs no downscale'); };

export async function writeCaptures(dir) {
  const wings = await build(wingsVdb, join(captureFixtures, 'wings-vdb'), { reports: join(captureFixtures, 'wings-vdb-browsers') });
  mkdirSync(join(dir, 'wings-vdb', 'shots'), { recursive: true });
  writeFileSync(join(dir, 'wings-vdb', 'shots', '01-wings-vdb.png'), PNG);
  writeFileSync(join(dir, 'wings-vdb', 'shots', '02-dispersal.png'), PNG);
  wings.shots = [{ tab: 'wings-vdb', file: 'shots/01-wings-vdb.png' }, { tab: 'dispersal', file: 'shots/02-dispersal.png' }];
  wings.vendored = await snapshot(wingsVdb, join(captureFixtures, 'wings-vdb'), join(dir, 'wings-vdb', 'source'), { downscale });
  writeFileSync(join(dir, 'wings-vdb', 'capture.json'), JSON.stringify(wings));
  const pylon = await build(miniPylon, join(captureFixtures, 'mini-pylon'));
  pylon.shotsSkipped = 'the dev server at http://127.0.0.1:5371/ was not answering';
  pylon.vendored = await snapshot(miniPylon, join(captureFixtures, 'mini-pylon'), join(dir, 'mini-pylon', 'source'), { downscale });
  writeFileSync(join(dir, 'mini-pylon', 'capture.json'), JSON.stringify(pylon));
}

// Console errors and uncaught exceptions on a page and its frames, as
// harness.mjs collects them, less the font loads that fail on purpose: a
// test's fonts folder is empty, so wings-vdb's two faces answer 404.
export function collectPageErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const at = message.location().url ? new URL(message.location().url).pathname : '';
    if (!at.startsWith('/fonts/')) errors.push(`console: ${message.text()}${at ? ` (${at})` : ''}`);
  });
  return errors;
}
