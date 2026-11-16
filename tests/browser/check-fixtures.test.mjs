// npm run playground:check-fixtures (playground/check-fixtures.mjs): it
// loads each captured project's source side headless and fails on what a
// broken snapshot does. Run here on captures built from the stand-in
// checkouts under tests/fixtures/captures, with the test's own empty fonts
// folder.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { closeAll, repo } from './lib/harness.mjs';
import { writeCaptures } from './lib/captures.mjs';

mkdirSync(join(repo, 'tests', '.tmp'), { recursive: true });
const captures = mkdtempSync(join(repo, 'tests', '.tmp', 'captures-'));
const fonts = mkdtempSync(join(repo, 'tests', '.tmp', 'fonts-'));
const drafts = mkdtempSync(join(repo, 'tests', '.tmp', 'drafts-'));

before(() => writeCaptures(captures));
after(() => closeAll(...[captures, fonts, drafts].map(dir => () => rmSync(dir, { recursive: true, force: true }))));

test('npm run playground:check-fixtures runs check-fixtures.mjs', () => {
  const { scripts } = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8'));
  assert.equal(scripts['playground:check-fixtures'], 'node playground/check-fixtures.mjs');
});

const node = (args, env = {}) => new Promise(resolve => execFile(process.execPath, args, { timeout: 120000, env: { ...process.env, ...env } },
  (error, stdout, stderr) => resolve({ code: error ? (error.code ?? 'killed') : 0, stdout, stderr })));

test('check-fixtures passes on the stand-in snapshots, and fails on a page that asks for a root path outside the table', async () => {
  const good = await node([join(repo, 'playground', 'check-fixtures.mjs'), '--captures', captures], { KNOBS_WINGS_FONTS: fonts, KNOBS_DRAFTS: drafts });
  assert.equal(good.code, 0, `${good.stdout}\n${good.stderr}`);
  assert.match(good.stdout, /mini-pylon: 8 tabs checked/);
  assert.match(good.stdout, /wings-vdb: 7 tabs checked/);
  assert.match(good.stdout, /^ok$/m);
  const broken = mkdtempSync(join(repo, 'tests', '.tmp', 'captures-'));
  try {
    cpSync(captures, broken, { recursive: true });
    appendFileSync(join(broken, 'wings-vdb', 'source', 'src', 'main.js'), "\nfetch('/elsewhere').catch(() => {});\n");
    const bad = await node([join(repo, 'playground', 'check-fixtures.mjs'), '--captures', broken], { KNOBS_WINGS_FONTS: fonts, KNOBS_DRAFTS: drafts });
    assert.notEqual(bad.code, 0);
    assert.match(bad.stderr, /wings-vdb: requested a root path outside the table: \/elsewhere/);
  } finally { rmSync(broken, { recursive: true, force: true }); }
});
