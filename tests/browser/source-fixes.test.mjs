// Pins for the Milestone 3 review findings the unit tests cannot reach:
// a source document that is not the page (F1), the shot cell's width (F2),
// a failure that must not stop the next tab or capture (F3), a stalled
// source shot's error text (F4), an unknown side (F5), and a stage that
// never mounts (F12). Each stand-in lives under tests/.tmp.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { closeAll, launch, newPage, repo } from './lib/harness.mjs';
import { writeCaptures } from './lib/captures.mjs';
import { servePlayground } from '../../playground/server.mjs';

mkdirSync(join(repo, 'tests', '.tmp'), { recursive: true });
const captures = mkdtempSync(join(repo, 'tests', '.tmp', 'captures-'));
const fonts = mkdtempSync(join(repo, 'tests', '.tmp', 'fonts-'));
const drafts = mkdtempSync(join(repo, 'tests', '.tmp', 'drafts-'));
const scratch = [];

let browser;
before(async () => {
  await writeCaptures(captures);
  browser = await launch();
});
after(() => closeAll(
  () => browser?.close(),
  ...[captures, fonts, drafts, ...scratch].map(dir => () => rmSync(dir, { recursive: true, force: true })),
));

function temp(prefix) {
  const dir = mkdtempSync(join(repo, 'tests', '.tmp', prefix));
  scratch.push(dir);
  return dir;
}

function minimalCapture(extra = {}) {
  return {
    source: { repo: 'example', branch: 'main', commit: 'abc1234', dirty: false },
    capturedAt: '2026-01-01T00:00:00Z',
    groups: [{ name: 'only', controls: [{ key: 'n', type: 'number', value: 1, min: 0, max: 2, step: 1 }] }],
    valueSets: { defaults: { about: 'defaults', values: {}, sourceValues: {} } },
    untranslated: [],
    shots: [],
    ...extra,
  };
}

function writeCapture(dir, name, data) {
  const project = join(dir, name);
  mkdirSync(project, { recursive: true });
  writeFileSync(join(project, 'capture.json'), JSON.stringify(data));
}

async function withSite(options, fn) {
  const site = await servePlayground({ fonts, drafts, logLevel: 'error', ...options });
  try {
    await fn(site);
  } finally {
    await site.close();
  }
}

async function withPage(fn, viewport = { width: 1440, height: 900 }) {
  const page = await newPage(browser, { viewport });
  try {
    await fn(page);
  } finally {
    await page.context().close();
  }
}

const runNode = (args, env, timeout = 50000) => new Promise(resolve => {
  execFile(process.execPath, args, { timeout, env: { ...process.env, ...env } }, (error, stdout, stderr) => {
    resolve({ code: error ? (error.code ?? 'killed') : 0, stdout: stdout ?? '', stderr: stderr ?? '' });
  });
});

const shotEnv = dir => ({ KNOBS_CAPTURES: dir, KNOBS_DRAFTS: drafts, KNOBS_WINGS_FONTS: fonts });

test('the shell refuses a source document that is not the page', async () => {
  const dir = temp('unmounted-');
  writeCapture(dir, 'wings-vdb', minimalCapture({ vendored: { files: [], stubs: [], recorded: [] } }));
  await withSite({ captures: dir }, async site => {
    await withPage(async page => {
      await page.goto(`${site.url}?s=capture:wings-vdb&view=capture&side=source`);
      const button = page.locator('.side-switch button[data-side=source]');
      await button.waitFor();
      assert.equal(await button.isDisabled(), false);
      await page.locator('pre.error', { hasText: 'was mounted when the server started' }).waitFor({ timeout: 2000 });
      const text = await page.locator('pre.error').innerText();
      assert.match(text, /wings-vdb/);
      assert.match(text, /no wings-vdb snapshot was mounted when the server started/);
    });
  });
});

test('the grid refuses a source document that is not the page', async () => {
  const dir = temp('unmounted-');
  writeCapture(dir, 'wings-vdb', minimalCapture({ vendored: { files: [], stubs: [], recorded: [] } }));
  await withSite({ captures: dir }, async site => {
    await withPage(async page => {
      await page.goto(`${site.url}grid.html?set=captures`);
      const why = page.locator('.cell.source .why', { hasText: 'was mounted when the server started' });
      await why.waitFor({ timeout: 2000 });
      const text = await why.innerText();
      assert.match(text, /wings-vdb: only:/);
      assert.match(text, /no wings-vdb snapshot was mounted when the server started/);
    });
  });
});

test('an unknown side is refused with its name', async () => {
  await withSite({ captures }, async site => {
    await withPage(async page => {
      await page.goto(`${site.url}?s=stress&side=banana`);
      await page.locator('pre.error', { hasText: 'unknown side: banana' }).waitFor({ timeout: 2000 });
      assert.equal(await page.locator('iframe.stage').getAttribute('src'), null);
    });
  });
});

test('side=source on a scenario that is not a capture is refused', async () => {
  await withSite({ captures }, async site => {
    await withPage(async page => {
      await page.goto(`${site.url}?s=stress&side=source`);
      await page.locator('pre.error', { hasText: 'stress is not a capture' }).waitFor({ timeout: 2000 });
      assert.equal(await page.locator('iframe.stage').getAttribute('src'), null);
    });
  });
});

test('a capture row keeps the shot cell the same width as the source and knobs cells', async () => {
  await withSite({ captures }, async site => {
    await withPage(async page => {
      await page.goto(`${site.url}grid.html?set=captures&w=320`);
      const row = page.locator('.capture-row[data-capture="wings-vdb"][data-tab="dispersal"]');
      await row.waitFor({ timeout: 20000 });
      await row.locator('.shot img').waitFor();
      const widths = await row.locator('> figure').evaluateAll(nodes => nodes.map(node => ({
        kind: [...node.classList].find(name => name !== 'cell'),
        width: Math.round(node.getBoundingClientRect().width),
      })));
      const byKind = Object.fromEntries(widths.map(item => [item.kind, item.width]));
      assert.ok(byKind.knobs > 100, `knobs cell has no width: ${JSON.stringify(widths)}`);
      assert.equal(byKind.shot, byKind.source, `cell widths ${JSON.stringify(widths)}`);
      assert.equal(byKind.source, byKind.knobs, `cell widths ${JSON.stringify(widths)}`);
      const imgWidth = await row.locator('.shot img').evaluate(img => Math.round(img.getBoundingClientRect().width));
      assert.equal(imgWidth, byKind.shot);
    }, { width: 1600, height: 1000 });
  });
});

test('the grid goes on after a capture fails', async () => {
  const dir = temp('partial-');
  writeCapture(dir, 'broken', minimalCapture({ valueSets: {} }));
  writeCapture(dir, 'whole', minimalCapture());
  await withSite({ captures: dir }, async site => {
    await withPage(async page => {
      await page.goto(`${site.url}grid.html?set=captures&w=200&h=120`);
      await page.locator('body[data-ready]').waitFor({ timeout: 8000 });
      assert.equal(await page.locator('body').getAttribute('data-error'), null);
      assert.match(await page.locator('body').innerText(), /broken: unknown value set: defaults/);
      assert.equal(await page.locator('.capture-row[data-capture="whole"]').count(), 1);
    });
  });
});

test('check-fixtures goes on after a tab fails', async () => {
  const dir = temp('tabs-');
  cpSync(captures, dir, { recursive: true });
  appendFileSync(join(dir, 'wings-vdb', 'source', 'src', 'main.js'), `
;(() => {
  const arm = () => {
    for (const tab of document.querySelectorAll('.term-tab')) {
      const name = tab.textContent.trim();
      if (name !== 'scroll' && name !== 'sunlight') continue;
      if (tab.dataset.broke) continue;
      tab.dataset.broke = '1';
      tab.click = () => { throw new Error(name + ' broke'); };
    }
  };
  new MutationObserver(arm).observe(document.documentElement, { childList: true, subtree: true });
  arm();
})();
`);
  const result = await runNode(
    [join(repo, 'playground', 'check-fixtures.mjs'), '--captures', dir],
    { KNOBS_WINGS_FONTS: fonts, KNOBS_DRAFTS: drafts },
  );
  assert.match(result.stderr, /scroll broke/);
  assert.match(result.stderr, /sunlight broke/);
  assert.match(result.stdout, /wings-vdb: \d+ tabs checked/);
  assert.match(result.stdout, /mini-pylon: \d+ tabs checked/);
  assert.notEqual(result.code, 0);
});

test('shots goes on after a source tab fails', async () => {
  const dir = temp('shots-');
  cpSync(captures, dir, { recursive: true });
  const capturePath = join(dir, 'wings-vdb', 'capture.json');
  const capture = JSON.parse(readFileSync(capturePath, 'utf8'));
  const visible = capture.groups.filter(group => !group.hidden).map(group => group.name);
  assert.deepEqual(visible, ['dispersal', 'scroll', 'presence', 'sunlight', 'dive']);
  for (const group of capture.groups) {
    if (group.name === 'sunlight' || group.name === 'dive') group.hidden = true;
  }
  writeFileSync(capturePath, JSON.stringify(capture));
  appendFileSync(join(dir, 'wings-vdb', 'source', 'src', 'main.js'), `
;(() => {
  const arm = () => {
    for (const tab of document.querySelectorAll('.term-tab')) {
      if (tab.textContent.trim() !== 'scroll' || tab.dataset.broke) continue;
      tab.dataset.broke = '1';
      tab.click = () => { throw new Error('scroll broke'); };
    }
  };
  new MutationObserver(arm).observe(document.documentElement, { childList: true, subtree: true });
  arm();
})();
`);
  const out = temp('shot-out-');
  const result = await runNode(
    [join(repo, 'playground', 'shots.mjs'), '--only', 'capture:wings-vdb', '--out', out, '--scale', '1'],
    shotEnv(dir),
  );
  assert.ok(readdirSync(out).includes('capture-wings-vdb-source-presence.png'), `stderr:\n${result.stderr}\nstdout:\n${result.stdout}`);
  assert.match(result.stderr, /scroll broke/);
  assert.notEqual(result.code, 0);
});

test('a stalled source shot names the capture, the tab and the url', async () => {
  const dir = temp('stall-');
  cpSync(captures, dir, { recursive: true });
  const capturePath = join(dir, 'wings-vdb', 'capture.json');
  const capture = JSON.parse(readFileSync(capturePath, 'utf8'));
  const visible = capture.groups.filter(group => !group.hidden);
  const tab = visible[0].name;
  for (const group of capture.groups) if (group.name !== tab) group.hidden = true;
  writeFileSync(capturePath, JSON.stringify(capture));
  appendFileSync(join(dir, 'wings-vdb', 'source', 'src', 'main.js'), `
;(() => {
  const shut = () => { document.querySelector('.term')?.classList.remove('open'); };
  shut();
  new MutationObserver(shut).observe(document.documentElement, { attributes: true, subtree: true, attributeFilter: ['class'] });
})();
`);
  const out = temp('stall-out-');
  const result = await runNode(
    [join(repo, 'playground', 'shots.mjs'), '--only', 'capture:wings-vdb', '--out', out, '--scale', '1'],
    shotEnv(dir),
  );
  assert.match(result.stderr, /capture:wings-vdb/);
  assert.match(result.stderr, new RegExp(tab));
  assert.match(result.stderr, /\/captures\/wings-vdb\/source\//);
  assert.notEqual(result.code, 0);
});

test('the grid marks a stage that never mounts and still finishes', async () => {
  const dir = temp('hang-drafts-');
  mkdirSync(join(dir, 'hang'), { recursive: true });
  writeFileSync(join(dir, 'hang', 'controls.js'), 'await new Promise(() => {});\nexport const groups = [];\n');
  await withSite({ drafts: dir, captures: temp('hang-captures-') }, async site => {
    await withPage(async page => {
      await page.goto(`${site.url}grid.html?ids=draft:hang&w=200&h=120`);
      const why = page.locator('.cell.failed .why', { hasText: 'draft:hang: the stage did not mount within 15000 ms' });
      await why.waitFor({ timeout: 20000 });
      assert.equal(await page.locator('body').getAttribute('data-ready'), '1');
    });
  });
});

test('a capture with no snapshot disables source and says so', async () => {
  const dir = temp('nosnap-');
  writeCapture(dir, 'wings-vdb', minimalCapture());
  await withSite({ captures: dir }, async site => {
    await withPage(async page => {
      await page.goto(`${site.url}?s=capture:wings-vdb&view=capture&side=source`);
      const button = page.locator('.side-switch button[data-side=source]');
      await button.waitFor({ timeout: 15000 });
      assert.equal(await button.isDisabled(), true);
      const text = await page.locator('.view[data-view=capture]').innerText();
      assert.match(text, /no source snapshot: run npm run playground:capture -- wings-vdb/);
    });
  });
});

test('the grid fails a source cell that has no snapshot and still builds the next capture', async () => {
  const dir = temp('nosnap-');
  writeCapture(dir, 'ahead', minimalCapture());
  writeCapture(dir, 'behind', minimalCapture());
  await withSite({ captures: dir }, async site => {
    await withPage(async page => {
      await page.goto(`${site.url}grid.html?set=captures&w=200&h=120`);
      await page.locator('body[data-ready]').waitFor({ timeout: 15000 });
      assert.equal(await page.locator('body').getAttribute('data-error'), null);
      assert.match(await page.locator('.capture-row[data-capture="ahead"] .source .why').innerText(), /ahead: only: no source snapshot/);
      assert.match(await page.locator('.capture-row[data-capture="behind"] .source .why').innerText(), /behind: only: no source snapshot/);
    });
  });
});

test('shots and check-fixtures skip a capture with no snapshot', async () => {
  const dir = temp('nosnap-');
  writeCapture(dir, 'wings-vdb', minimalCapture());
  writeCapture(dir, 'mini-pylon', minimalCapture());
  const shotsOut = temp('nosnap-shots-');
  const shots = await runNode(
    [join(repo, 'playground', 'shots.mjs'), '--only', 'capture:wings-vdb', '--out', shotsOut, '--scale', '1'],
    shotEnv(dir),
  );
  assert.match(shots.stdout, /no source side for capture:wings-vdb: no snapshot/);
  assert.equal(shots.code, 0, `${shots.stdout}\n${shots.stderr}`);
  const checked = await runNode(
    [join(repo, 'playground', 'check-fixtures.mjs'), '--captures', dir],
    { KNOBS_WINGS_FONTS: fonts, KNOBS_DRAFTS: drafts },
  );
  assert.match(checked.stdout, /skip wings-vdb: no snapshot/);
  assert.match(checked.stdout, /skip mini-pylon: no snapshot/);
  assert.equal(checked.code, 0, `${checked.stdout}\n${checked.stderr}`);
});

test('check-fixtures lists a console error, an uncaught exception and a blank picture, and does not stop', async () => {
  const dir = temp('kinds-');
  cpSync(captures, dir, { recursive: true });
  appendFileSync(join(dir, 'wings-vdb', 'source', 'src', 'main.js'), `
;(() => {
  console.error('pin-console');
  setTimeout(() => { throw new Error('pin-uncaught'); }, 0);
  const keep = () => {
    const box = document.querySelector('.term-viz');
    if (!box || box.querySelector('canvas.blank-pin')) return;
    const canvas = document.createElement('canvas');
    canvas.className = 'blank-pin';
    canvas.width = 8;
    canvas.height = 8;
    box.append(canvas);
  };
  new MutationObserver(keep).observe(document.documentElement, { childList: true, subtree: true });
  keep();
})();
`);
  const result = await runNode(
    [join(repo, 'playground', 'check-fixtures.mjs'), '--captures', dir],
    { KNOBS_WINGS_FONTS: fonts, KNOBS_DRAFTS: drafts },
  );
  assert.match(result.stderr, /console error: pin-console/);
  assert.match(result.stderr, /uncaught: pin-uncaught/);
  assert.match(result.stderr, /is blank/);
  const listed = result.stderr.split('\n').filter(line => /pin-console|pin-uncaught|is blank/.test(line));
  assert.ok(listed.length >= 2, result.stderr);
  assert.match(result.stdout, /wings-vdb: \d+ tabs checked/);
  assert.notEqual(result.code, 0);
});

test('check-fixtures exempts a missing font face when the fonts are a fallback', async () => {
  const result = await runNode(
    [join(repo, 'playground', 'check-fixtures.mjs'), '--captures', captures],
    { KNOBS_WINGS_FONTS: fonts, KNOBS_DRAFTS: drafts },
  );
  assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /fonts: fallback/);
  assert.doesNotMatch(result.stderr, /console error:.*\/fonts\//);
});

test('check-fixtures reports a same-host request on another scheme as another origin', async () => {
  const dir = temp('scheme-');
  cpSync(captures, dir, { recursive: true });
  appendFileSync(join(dir, 'wings-vdb', 'source', 'src', 'main.js'), `
;fetch('https://127.0.0.1:' + location.port + '/probe').catch(() => {});
`);
  const result = await runNode(
    [join(repo, 'playground', 'check-fixtures.mjs'), '--captures', dir],
    { KNOBS_WINGS_FONTS: fonts, KNOBS_DRAFTS: drafts },
  );
  assert.match(result.stderr, /requested another origin: https:\/\/127\.0\.0\.1:\d+\/probe/);
  assert.notEqual(result.code, 0);
});

test('check-fixtures reports a preview that never loads', { timeout: 90000 }, async () => {
  const dir = temp('preview-');
  cpSync(captures, dir, { recursive: true });
  appendFileSync(join(dir, 'mini-pylon', 'source', 'tweak.js'), `
;(() => {
  const stop = () => {
    const img = document.querySelector('img.render');
    if (img && img.getAttribute('src')) img.removeAttribute('src');
  };
  new MutationObserver(stop).observe(document.documentElement, { attributes: true, subtree: true, attributeFilter: ['src'] });
  stop();
})();
`);
  const result = await runNode(
    [join(repo, 'playground', 'check-fixtures.mjs'), '--captures', dir],
    { KNOBS_WINGS_FONTS: fonts, KNOBS_DRAFTS: drafts },
    90000,
  );
  assert.match(result.stderr, /the preview image never loaded/);
  assert.notEqual(result.code, 0);
});

test('the shell marks a stage that never mounts', async () => {
  const dir = temp('hang-drafts-');
  mkdirSync(join(dir, 'hang'), { recursive: true });
  writeFileSync(join(dir, 'hang', 'controls.js'), 'await new Promise(() => {});\nexport const groups = [];\n');
  await withSite({ drafts: dir, captures: temp('hang-captures-') }, async site => {
    await withPage(async page => {
      await page.goto(`${site.url}?s=draft:hang`);
      await page.locator('pre.error', { hasText: 'draft:hang: the stage did not mount within 15000 ms' }).waitFor({ timeout: 20000 });
    });
  });
});
