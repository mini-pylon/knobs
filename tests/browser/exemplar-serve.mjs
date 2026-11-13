// Serves the exemplar fixture for a look by hand, the way the tests serve it,
// until Ctrl-C. `npm run exemplars:serve`, then open the printed URL.
import { rmSync } from 'node:fs';
import { copyFixture, serve } from './lib/harness.mjs';

const fixture = await copyFixture('exemplar');
// Vite handles SIGTERM itself, closing the server and calling process.exit(),
// so the copy is removed on exit, whatever ends the process.
process.on('exit', () => rmSync(fixture.root, { recursive: true, force: true }));
const site = await serve(fixture.root);
console.log(`${site.url}?name=<exemplar>  (Ctrl-C to stop)`);
process.once('SIGINT', async () => {
  try {
    await site.close();
  } finally {
    process.exit(0);
  }
});
