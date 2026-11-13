// Writes each exemplar's shot.png: the drawer open on its group, or its page,
// under the same fake clock as the tests. `npm run exemplars:shots` writes
// them all; names after it write only those.
import { join } from 'node:path';
import { closeAll, copyFixture, launch, serve } from './lib/harness.mjs';
import { exemplarsDir, folders, openExemplar, settle } from './lib/exemplar.mjs';

// Console lines typed before the shot, so it shows the exemplar in use.
const DEMO = { 'renders-tab': ['render'] };

const names = process.argv.slice(2).length ? process.argv.slice(2) : folders();
const fixture = await copyFixture('exemplar');
const site = await serve(fixture.root);
const browser = await launch();
try {
  for (const name of names) {
    const { page, errors } = await openExemplar(browser, site.url, name);
    try {
      await settle(page, DEMO[name]);
      if (errors.length) throw new Error(`${name}: ${errors.join('\n')}`);
      const path = join(exemplarsDir, name, 'shot.png');
      await page.locator('.term-drawer').screenshot({ path });
      console.log(`wrote ${path}`);
    } finally {
      await page.context().close();
    }
  }
} finally {
  await closeAll(() => browser.close(), () => site.close(), () => fixture.remove());
}
