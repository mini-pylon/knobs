// The drawer's layout holds with long names and values: every tab shows
// whole inside the tab row, at desktop, tablet and phone widths, and no
// row's content runs past the row. The schema mounts on the playground's
// stage (its json scenario), framed as a project frames the drawer.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { closeAll, collectErrors, launch, newPage, repo } from './lib/harness.mjs';
import { servePlayground } from '../../playground/server.mjs';

// scenarios.js's JSON_KEY: that module is Vite-only (import.meta.glob).
const JSON_KEY = 'knobs-playground:json';
const LONG = 'The quick brown fox jumps over the lazy dog. '.repeat(7).trim();
const schema = [
  { name: 'scene', controls: [
    { key: 'size', type: 'number', value: 0.0015, min: 0, max: 0.01, step: 0.0001 },
    { key: 'paper', type: 'color', value: '#94385a' },
  ] },
  { name: 'backgroundOverlayOpacityWhenScrolledPastHero', controls: [{ key: 'on', type: 'toggle', value: 1 }] },
  { name: 'motion', controls: [{ key: 'speed', type: 'number', value: 1, min: 0, max: 2, step: 0.1 }] },
  { name: 'motion2', controls: [{ key: 'speed', type: 'number', value: 1, min: 0, max: 2, step: 0.1 }] },
  { name: 'particleEmitterTurbulenceFalloffRadius', controls: [{ key: 'radius', type: 'number', value: 3, min: 0, max: 10, step: 1 }] },
  { name: 'copy', controls: [
    { key: 'headline', type: 'text', value: LONG },
    { key: 'short', type: 'text', value: 'hi' },
    { key: 'layout', type: 'select', value: 'another fairly long option label here', options: ['short', 'another fairly long option label here'] },
    { key: 'aVeryLongControlKeyThatPushesTheNameColumn', type: 'text', value: LONG },
  ] },
];
const WIDTHS = [1280, 640, 390];

mkdirSync(join(repo, 'tests', '.tmp'), { recursive: true });
const drafts = mkdtempSync(join(repo, 'tests', '.tmp', 'drafts-'));
const captures = mkdtempSync(join(repo, 'tests', '.tmp', 'captures-'));
let site, browser;
before(async () => {
  site = await servePlayground({ drafts, captures, logLevel: 'error' });
  browser = await launch();
});
after(() => closeAll(() => browser?.close(), () => site?.close(),
  () => rmSync(drafts, { recursive: true, force: true }), () => rmSync(captures, { recursive: true, force: true })));

async function stage(width, tab) {
  const page = await newPage(browser, { viewport: { width, height: 800 } });
  const errors = collectErrors(page);
  await page.addInitScript(([key, text]) => sessionStorage.setItem(key, text), [JSON_KEY, JSON.stringify(schema)]);
  await page.goto(`${site.url}stage.html?s=json${tab ? `&tab=${tab}` : ''}`);
  await page.locator('body[data-ready], body[data-error]').waitFor();
  return { page, errors };
}

for (const width of WIDTHS) {
  test(`at ${width} px every tab shows whole inside the tab row`, async () => {
    const { page, errors } = await stage(width);
    try {
      assert.deepEqual(errors, []);
      const facts = await page.evaluate(() => {
        const root = document.querySelector('[data-knobs]').shadowRoot;
        const box = e => e.getBoundingClientRect();
        const nav = root.querySelector('.term-tabs');
        const close = box(root.querySelector('.term-close'));
        const row = box(nav);
        return {
          scrolledAway: nav.scrollWidth - nav.clientWidth,
          outside: [...root.querySelectorAll('.term-tab')].filter(t => {
            const b = box(t);
            return b.left < row.left - 0.5 || b.right > row.right + 0.5 || b.right > close.left || t.scrollWidth > t.clientWidth + 0.5;
          }).map(t => t.textContent),
        };
      });
      assert.deepEqual(facts, { scrolledAway: 0, outside: [] });
    } finally { await page.context().close(); }
  });

  test(`at ${width} px no row runs past its edge, and a text or select value shows once`, async () => {
    for (const tab of ['scene', 'copy']) {
      const { page, errors } = await stage(width, tab);
      try {
        assert.deepEqual(errors, []);
        const rows = await page.evaluate(() => {
          const root = document.querySelector('[data-knobs]').shadowRoot;
          return [...root.querySelectorAll('.term-row')].map(row => {
            const right = row.getBoundingClientRect().right;
            const past = [...row.children].filter(c => getComputedStyle(c).display !== 'none' && c.getBoundingClientRect().right > right + 0.5);
            // A text input or a select already shows its value: the value column stays empty.
            const text = row.querySelector('input[type=text], select');
            return {
              key: row.querySelector('.term-key').textContent,
              past: past.map(c => c.className || c.tagName).join(' '),
              overflow: row.scrollWidth > row.clientWidth + 0.5,
              repeated: Boolean(text && row.querySelector('.term-value')?.textContent),
            };
          }).filter(r => r.past || r.overflow || r.repeated);
        });
        assert.deepEqual(rows, [], `tab ${tab}`);
      } finally { await page.context().close(); }
    }
  });
}
