// The playground serving a captured page (playground/server.mjs,
// playground/fixtures/routes.mjs). A snapshot is built under tests/.tmp
// from the stand-in checkout; nothing here reads a real project.
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { createServer } from 'node:http';
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

test('a draft body over 1 MB is answered 400 and writes nothing', async () => {
  const root = mkdtempSync(join(repo, 'tests', '.tmp', 'serve-'));
  const drafts = join(root, 'drafts');
  const captures = join(root, 'captures');
  const fonts = join(root, 'fonts');
  mkdirSync(drafts);
  mkdirSync(captures);
  mkdirSync(fonts);
  const site = await servePlayground({ drafts, captures, fonts, logLevel: 'error' });
  try {
    const origin = site.url.replace(/\/$/, '');
    const body = JSON.stringify({
      name: 'too-big',
      files: { 'controls.js': 'export const groups = [];\n', 'visual.js': 'x'.repeat(2_000_000) },
    });
    const response = await fetch(`${site.url}__playground/draft`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin },
      body,
    });
    assert.equal(response.status, 400);
    assert.equal(await response.text(), '{"error":"the body is over 1 MB"}');
    assert.equal(response.headers.get('connection'), 'close');
    assert.deepEqual(readdirSync(drafts), []);
  } finally {
    await site.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('a draft body with invalid UTF-8 is refused and writes nothing', async () => {
  const root = mkdtempSync(join(repo, 'tests', '.tmp', 'serve-'));
  const drafts = join(root, 'drafts');
  const captures = join(root, 'captures');
  const fonts = join(root, 'fonts');
  mkdirSync(drafts);
  mkdirSync(captures);
  mkdirSync(fonts);
  const site = await servePlayground({ drafts, captures, fonts, logLevel: 'error' });
  try {
    const origin = site.url.replace(/\/$/, '');
    const broken = Buffer.concat([
      Buffer.from('{"name":"bad-utf","files":{"controls.js":"'),
      Buffer.from([0xff]),
      Buffer.from('"}}'),
    ]);
    const refused = await fetch(`${site.url}__playground/draft`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin },
      body: broken,
    });
    assert.equal(refused.status, 400);
    assert.equal(await refused.text(), '{"error":"the body is not JSON"}');
    assert.deepEqual(readdirSync(drafts), []);
    const bom = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from(JSON.stringify({ name: 'with-bom', files: { 'controls.js': 'export const groups = [];\n' } })),
    ]);
    const accepted = await fetch(`${site.url}__playground/draft`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin },
      body: bom,
    });
    assert.equal(accepted.status, 200, await accepted.text());
    assert.deepEqual(readdirSync(drafts), ['with-bom']);
  } finally {
    await site.close();
    rmSync(root, { recursive: true, force: true });
  }
});

describe('source errors stay on the source prefix', { concurrency: 1 }, () => {
  test('an unresolved import in a snapshot module is logged and answered 500 with its cause', async () => {
    const served = await serveWings(source => {
      appendFileSync(join(source, 'src', 'main.js'), '\nimport "./missing-module.js";\n');
    });
    const logged = [];
    const write = console.error;
    console.error = (...args) => {
      logged.push(args.map(arg => typeof arg === 'string' ? arg : String(arg)).join(' '));
      write(...args);
    };
    try {
      const response = await fetch(`${served.site.url}captures/wings-vdb/source/src/main.js`);
      const text = await response.text();
      assert.equal(response.status, 500, text.slice(0, 300));
      assert.match(text, /src\/main\.js/);
      assert.match(text, /missing-module\.js/);
      assert.doesNotMatch(text, /knobs playground/);
      const lines = logged.join('\n');
      // Vite's own error layer logs this line and sends the overlay. The
      // answer also names the request path, which that line does not.
      assert.match(lines, /Internal server error/);
      assert.match(lines, /\/captures\/wings-vdb\/source\/src\/main\.js/);
    } finally {
      console.error = write;
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

  test('a start on a taken port exits by itself with the port error', async () => {
    const root = mkdtempSync(join(repo, 'tests', '.tmp', 'serve-'));
    const captures = join(root, 'captures');
    await snapshot(wingsVdb, checkout, join(captures, 'wings-vdb', 'source'));
    const drafts = join(root, 'drafts');
    const fonts = join(root, 'fonts');
    mkdirSync(drafts);
    mkdirSync(fonts);
    const holder = createServer();
    await new Promise(resolve => holder.listen(0, '127.0.0.1', resolve));
    const port = holder.address().port;
    const script = `
      import { servePlayground } from ${JSON.stringify(join(repo, 'playground', 'server.mjs'))};
      try {
        await servePlayground({
          host: '127.0.0.1',
          port: ${port},
          drafts: ${JSON.stringify(drafts)},
          captures: ${JSON.stringify(captures)},
          fonts: ${JSON.stringify(fonts)},
          logLevel: 'error',
        });
        console.error('STARTED');
      } catch (error) {
        console.error(error.message);
      }
    `;
    try {
      const run = await new Promise(resolve => {
        execFile(process.execPath, ['--input-type=module', '-e', script], { timeout: 12000 }, (error, stdout, stderr) => {
          resolve({ error, stdout, stderr });
        });
      });
      assert.equal(run.error, null, `${run.error?.message}\n${run.stderr}`);
      assert.match(run.stderr, /already in use/);
      assert.doesNotMatch(run.stderr, /STARTED/);
    } finally {
      holder.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('a fixture start that fails inside configureServer closes the wings Vite and closeServer is a no-op', async () => {
    const root = mkdtempSync(join(repo, 'tests', '.tmp', 'serve-'));
    const captures = join(root, 'captures');
    const source = join(captures, 'wings-vdb', 'source');
    await snapshot(wingsVdb, checkout, source);
    assert.equal(existsSync(join(source, 'index.html')), true);
    const fonts = join(root, 'fonts');
    mkdirSync(fonts);
    const script = `
      import assert from 'node:assert/strict';
      import { createServer } from 'node:http';
      import { fixturesPlugin } from ${JSON.stringify(join(repo, 'playground', 'fixtures', 'routes.mjs'))};
      const plugin = fixturesPlugin({
        captures: ${JSON.stringify(captures)},
        fonts: ${JSON.stringify(fonts)},
        logLevel: 'error',
      });
      const httpServer = createServer();
      let calls = 0;
      let thrown = null;
      const server = {
        httpServer,
        middlewares: {
          use() {
            calls += 1;
            if (calls === 2) {
              thrown = new Error('second mount failed');
              throw thrown;
            }
          },
        },
      };
      await plugin.configureServer(server);
      assert.equal(calls, 2);
      assert.equal(plugin.boot.error, thrown);
      assert.equal(plugin.closeServer(), undefined);
      console.error(thrown.message);
      httpServer.close();
    `;
    try {
      const run = await runChild(script);
      assert.equal(run.error, null, `${run.error?.message}\n${run.stderr}`);
      assert.match(run.stderr, /second mount failed/);
      assert.doesNotMatch(run.stderr, /STARTED/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('a playground start that throws inside configureServer rejects and leaves nothing listening', async () => {
    const root = mkdtempSync(join(repo, 'tests', '.tmp', 'serve-'));
    const captures = join(root, 'captures');
    const source = join(captures, 'wings-vdb', 'source');
    await snapshot(wingsVdb, checkout, source);
    assert.equal(existsSync(join(source, 'index.html')), true);
    const drafts = join(root, 'drafts');
    const fonts = join(root, 'fonts');
    mkdirSync(drafts);
    mkdirSync(fonts);
    // servePlayground builds its own middleware stack, so the child makes the
    // second fixture mount throw after the wings Vite is already open.
    const script = `
      import { registerHooks } from 'node:module';
      registerHooks({
        load(url, context, nextLoad) {
          const loaded = nextLoad(url, context);
          if (!String(url).includes('/playground/fixtures/routes.mjs')) return loaded;
          const source = typeof loaded.source === 'string' ? loaded.source : Buffer.from(loaded.source).toString('utf8');
          const needle = [
            'function mount(server, route, handler) {',
            '  server.middlewares.use(route, seal(handler));',
            '}',
          ].join('\\n');
          if (!source.includes(needle)) throw new Error('mount() shape changed');
          const replacement = [
            'let mounts = 0;',
            'function mount(server, route, handler) {',
            '  mounts += 1;',
            "  if (mounts === 2) throw new Error('second mount failed');",
            '  server.middlewares.use(route, seal(handler));',
            '}',
          ].join('\\n');
          return { ...loaded, source: source.replace(needle, replacement) };
        },
      });
      const { servePlayground } = await import(${JSON.stringify(join(repo, 'playground', 'server.mjs'))});
      try {
        await servePlayground({
          host: '127.0.0.1',
          port: 0,
          drafts: ${JSON.stringify(drafts)},
          captures: ${JSON.stringify(captures)},
          fonts: ${JSON.stringify(fonts)},
          logLevel: 'error',
        });
        console.error('STARTED');
      } catch (error) {
        console.error(error?.message ?? String(error));
        if (error?.message !== 'second mount failed') process.exitCode = 1;
      }
    `;
    try {
      const run = await runChild(script);
      assert.equal(run.error, null, `${run.error?.message}\n${run.stderr}`);
      assert.match(run.stderr, /second mount failed/);
      assert.doesNotMatch(run.stderr, /STARTED/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function runChild(script) {
  return new Promise(resolve => {
    execFile(process.execPath, ['--input-type=module', '-e', script], { timeout: 12000 }, (error, stdout, stderr) => {
      resolve({ error, stdout, stderr });
    });
  });
}
