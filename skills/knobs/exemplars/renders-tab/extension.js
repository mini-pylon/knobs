// @ts-check

/**
 * The values one render used. Kept as data, so a later pass can draw the
 * thumbnail again after the page is rebuilt. A canvas is not the record.
 * @typedef {{
 *   'scene.size': import('knobs').Value,
 *   'scene.count': import('knobs').Value,
 *   'scene.tint': import('knobs').Value,
 * }} Snapshot
 */

// The thumbnail's content box. `count` divides this width, not the canvas
// width, and each mark stays inside its slot, so nothing draws in the pad.
const THUMB_W = 200;
const THUMB_H = 56;
const THUMB_PAD = 4;

/**
 * @param {import('knobs').Store} store
 * @returns {Snapshot}
 */
function snapshot(store) {
  return {
    'scene.size': store.control('scene.size'),
    'scene.count': store.control('scene.count'),
    'scene.tint': store.control('scene.tint'),
  };
}

/**
 * @param {Snapshot} values
 * @returns {string}
 */
function valueLine(values) {
  return /** @type {[string, import('knobs').Value][]} */ ([
    ['scene.size', values['scene.size']],
    ['scene.count', values['scene.count']],
    ['scene.tint', values['scene.tint']],
  ]).map(([path, value]) => `${path} ${String(value)}`).join('  ');
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {Snapshot} values
 */
function drawThumbnail(canvas, values) {
  canvas.width = THUMB_W;
  canvas.height = THUMB_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const contentW = THUMB_W - THUMB_PAD * 2;
  const contentH = THUMB_H - THUMB_PAD * 2;
  const count = Math.max(1, Number(values['scene.count']) || 1);
  const size = Number(values['scene.size']);
  const slot = contentW / count;
  const mark = Math.max(1, Math.min(Number.isFinite(size) ? size : 1, slot, contentH));
  ctx.clearRect(0, 0, THUMB_W, THUMB_H);
  ctx.fillStyle = String(values['scene.tint']);
  for (let i = 0; i < count; i++) {
    const x = THUMB_PAD + i * slot + (slot - mark) / 2;
    const y = THUMB_PAD + (contentH - mark) / 2;
    ctx.fillRect(x, y, mark, mark);
  }
}

/**
 * @param {import('knobs').Store} store
 * @returns {{ commands: { render: import('knobs').Command }, pages: import('knobs').Page[], status: () => string }}
 */
export default function rendersTab(store) {
  // Newest first. Each entry is the values that render used.
  /** @type {Snapshot[]} */
  const history = [];
  // The values the last finished render used. The values at mount count
  // as that first render, so a saved value is not a pending change.
  /** @type {Snapshot | null} */
  let finished = null;
  let busy = false;
  /** @type {HTMLElement | null} */
  let list = null;

  function mountValues() {
    if (!finished) finished = snapshot(store);
    return finished;
  }

  // mountKnobs attaches saved values after this function returns. The
  // fixture's first runFor fires this, still before anyone edits.
  setTimeout(() => { mountValues(); }, 0);

  function paint() {
    if (!list) return;
    list.replaceChildren();
    if (history.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'renders-empty';
      empty.textContent = 'There are no renders yet.';
      list.append(empty);
      return;
    }
    for (const values of history) {
      const entry = document.createElement('div');
      entry.className = 'render-entry';
      const canvas = document.createElement('canvas');
      drawThumbnail(canvas, values);
      const text = document.createElement('p');
      text.className = 'renders-values';
      text.textContent = valueLine(values);
      entry.append(canvas, text);
      list.append(entry);
    }
  }

  /** @type {import('knobs').Page} */
  const renders = {
    name: 'renders',
    about: 'Past renders, newest first.',
    mount(el) {
      const style = document.createElement('style');
      style.textContent = [
        '.renders { height: 100%; min-height: 0; overflow: auto; padding: 0 16px; font: 12px/1.4 ui-monospace, Menlo, Consolas, monospace; color: var(--term-fg, #d8e1e8); }',
        '.renders-empty, .renders-values { margin: 0; }',
        '.renders-empty { color: var(--term-dim, #7d8b96); }',
        '.render-entry { display: flex; gap: 12px; align-items: center; margin: 0 0 8px; }',
        '.render-entry canvas { display: block; flex: none; }',
      ].join('\n');
      const host = document.createElement('div');
      host.className = 'renders';
      el.append(style, host);
      list = host;
      paint();
    },
  };

  return {
    commands: {
      render: {
        about: 'Render the scene and add it to the history.',
        run() {
          if (busy) return 'already rendering';
          busy = true;
          const shot = snapshot(store);
          // Stand-in for the project's render. Replace this delay and the
          // drawing with the real one. The real render must not block the
          // page while it runs: return a line at once, and record the
          // snapshot only when the render finishes.
          setTimeout(() => {
            history.unshift(shot);
            finished = shot;
            busy = false;
            paint();
          }, 800);
          return 'rendering…';
        },
      },
    },
    pages: [renders],
    status() {
      const last = mountValues();
      let n = 0;
      if (!Object.is(store.control('scene.size'), last['scene.size'])) n += 1;
      if (!Object.is(store.control('scene.count'), last['scene.count'])) n += 1;
      if (!Object.is(store.control('scene.tint'), last['scene.tint'])) n += 1;
      if (n === 0) return '';
      if (n === 1) return '1 change since last render';
      return `${n} changes since last render`;
    },
  };
}
