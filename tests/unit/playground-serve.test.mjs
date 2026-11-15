// The playground serving a captured page (playground/server.mjs,
// playground/fixtures/routes.mjs). A snapshot is built under tests/.tmp
// from the stand-in checkout; nothing here reads a real project.
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { snapshot } from '../../playground/adapters/common.mjs';
import * as wingsVdb from '../../playground/adapters/wings-vdb.mjs';
import { servePlayground } from '../../playground/server.mjs';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const checkout = join(repo, 'tests', 'fixtures', 'captures', 'wings-vdb');
mkdirSync(join(repo, 'tests', '.tmp'), { recursive: true });

async function serveWings(mutate) {
  const root = mkdtempSync(join(repo, 'tests', '.tmp', 'serve-'));
  const captures = join(root, 'captures');
  const source = join(captures, 'wings-vdb', 'source');
  await snapshot(wingsVdb, checkout, source);
  if (mutate) mutate(source);
  const drafts = join(root, 'drafts');
  const fonts = join(root, 'fonts');
  mkdirSync(drafts);
  mkdirSync(fonts);
  const site = await servePlayground({ drafts, captures, fonts, logLevel: 'error' });
  return {
    site,
    close: async () => {
      await site.close();
      rmSync(root, { recursive: true, force: true });
    },
  };
}

describe('source errors stay on the source prefix', { concurrency: 1 }, () => {
  test('an unresolved import in a snapshot module is not the playground page', async () => {
    const served = await serveWings(source => {
      appendFileSync(join(source, 'src', 'main.js'), '\nimport "./missing-module.js";\n');
    });
    try {
      const response = await fetch(`${served.site.url}captures/wings-vdb/source/src/main.js`);
      const text = await response.text();
      assert.ok(response.status < 200 || response.status >= 300, `status ${response.status}: ${text.slice(0, 200)}`);
      assert.match(text, /src\/main\.js/);
      assert.match(text, /missing-module\.js/);
      assert.doesNotMatch(text, /knobs playground/);
    } finally {
      await served.close();
    }
  });

  test('a symlinked captures folder serves the chat stub for src/main.js', async () => {
    const root = mkdtempSync(join(repo, 'tests', '.tmp', 'serve-'));
    const real = join(root, 'real');
    const source = join(real, 'wings-vdb', 'source');
    await snapshot(wingsVdb, checkout, source);
    const link = join(root, 'link');
    symlinkSync(real, link);
    const drafts = join(root, 'drafts');
    const fonts = join(root, 'fonts');
    mkdirSync(drafts);
    mkdirSync(fonts);
    const site = await servePlayground({ drafts, captures: link, fonts, logLevel: 'error' });
    try {
      const response = await fetch(`${site.url}captures/wings-vdb/source/src/main.js`);
      const text = await response.text();
      assert.equal(response.status, 200, text.slice(0, 300));
      assert.match(text, /stubs\/chat\.js/);
      assert.doesNotMatch(text, /must not reach the fixture/);
    } finally {
      await site.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
