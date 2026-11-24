// serve() must report the error that stopped the start, even when closing
// the server it had already opened rejects.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '../browser/lib/harness.mjs';

const repo = fileURLToPath(new URL('../..', import.meta.url));
mkdirSync(join(repo, 'tests', '.tmp'), { recursive: true });

function failAfterOpen(root, start, closeError) {
  return serve(root, {
    beforeListen(server) {
      const realClose = server.close.bind(server);
      server.close = async () => {
        await realClose();
        throw closeError;
      };
      throw start;
    },
  });
}

test('a rejecting close does not replace the start error', async () => {
  const root = mkdtempSync(join(repo, 'tests', '.tmp', 'serve-close-'));
  const start = new Error('the port is taken');
  const closeError = new Error('close broke');
  try {
    await assert.rejects(failAfterOpen(root, start, closeError), error => {
      assert.equal(error, start);
      assert.equal(error.cause, closeError);
      return true;
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a rejecting close stays beside a start error that already has a cause', async () => {
  const root = mkdtempSync(join(repo, 'tests', '.tmp', 'serve-close-'));
  const start = new Error('the port is taken');
  const earlier = new Error('earlier');
  start.cause = earlier;
  const closeError = new Error('close broke');
  try {
    await assert.rejects(failAfterOpen(root, start, closeError), error => {
      assert.equal(error, start);
      assert.equal(error.cause, earlier);
      assert.equal(error.closeError, closeError);
      return true;
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
