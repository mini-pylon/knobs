// Several stages side by side, each a stage.html in its own frame:
//   set=exemplars          every exemplar (the default)
//   set=seeds&from=1&n=12  a run of random seeds (g sets their group count)
//   set=drafts             every draft in the drafts folder
//   set=captures           one row per visible tab: the source page, the knobs page, and
//                          with fixtures=1 the shot of the original drawer before them
//   set=all                stress, every exemplar, draft and capture, and 8 seeds
//   ids=a,b,c              these scenarios, in place of a set
// tab= opens every stage on that tab; w= and h= size the cells.
// body[data-ready] marks every stage mounted or failed.
import { openSourceTab, seedSource, sourceDocumentError, sourceSeed, sourceUrl } from './fixtures/source-side.js';
import { captureNames, captureOf, draftNames, exemplarNames } from './scenarios.js';

const params = new URLSearchParams(location.search);
const set = params.get('set') ?? 'exemplars';
// The shots of the original drawer are test fixtures, shown only with fixtures=1.
const fixtures = params.get('fixtures') === '1';
const from = Number(params.get('from') ?? 1);
const count = Number(params.get('n') ?? 12);
const seeds = n => Array.from({ length: n }, (_, i) => `random:${from + i}`);
const sets = {
  exemplars: () => exemplarNames.map(n => `exemplar:${n}`),
  seeds: () => seeds(count),
  drafts: () => draftNames.map(n => `draft:${n}`),
  captures: () => captureNames.map(n => `capture:${n}`),
  all: () => ['stress', ...exemplarNames.map(n => `exemplar:${n}`), ...draftNames.map(n => `draft:${n}`), ...captureNames.map(n => `capture:${n}`), ...seeds(8)],
};
if (!sets[set]) throw new Error(`unknown set: ${set}`);

const nav = document.querySelector('.sets');
for (const name of Object.keys(sets)) {
  const link = document.createElement('a');
  const next = new URLSearchParams(location.search);
  next.set('set', name);
  link.href = `?${next}`;
  link.textContent = name;
  link.className = name === set ? 'on' : '';
  nav.append(link, ' ');
}
const tabInput = document.querySelector('.tab');
tabInput.value = params.get('tab') ?? '';
tabInput.addEventListener('change', () => {
  const next = new URLSearchParams(location.search);
  if (tabInput.value) next.set('tab', tabInput.value); else next.delete('tab');
  location.search = next.toString();
});

const width = Number(params.get('w') ?? 640);
const height = Number(params.get('h') ?? 420);
const cells = document.querySelector('.cells');

// A stage cell. options.tab, the row it is added to, the size and the class
// are for a capture row's knobs cell; every other set calls it with the id.
function cell(id, options = {}) {
  const { tab, parent = cells, width: cellWidth = width, height: cellHeight = height, className = 'cell' } = options;
  const query = new URLSearchParams({ s: id });
  if (tab) query.set('tab', tab);
  else if (params.get('tab')) query.set('tab', params.get('tab'));
  if (params.get('g')) query.set('g', params.get('g'));
  const figure = document.createElement('figure');
  figure.className = className;
  const frame = document.createElement('iframe');
  frame.width = String(cellWidth);
  frame.height = String(cellHeight);
  frame.title = id;
  frame.src = `./stage.html?${query}`;
  const caption = document.createElement('figcaption');
  const label = document.createElement('span');
  label.textContent = id;
  const why = document.createElement('span');
  why.className = 'why';
  const open = document.createElement('a');
  open.href = `./?${query}`;
  open.textContent = 'open';
  caption.append(label, why, open);
  figure.append(frame, caption);
  parent.append(figure);
  const started = performance.now();
  return new Promise(resolve => {
    const poll = setInterval(() => {
      const body = frame.contentDocument?.body;
      const giveUp = message => {
        figure.classList.add('failed');
        why.textContent = message;
        clearInterval(poll);
        resolve();
      };
      if (body?.dataset?.error) {
        giveUp(body.dataset.error);
        return;
      }
      if (body?.dataset?.ready) {
        clearInterval(poll);
        resolve();
        return;
      }
      if (performance.now() - started >= 15000) {
        giveUp(`${id}: the stage did not mount within 15000 ms`);
      }
    }, 100);
  });
}

function shotFigure(record, tab, cellWidth) {
  const figure = document.createElement('figure');
  figure.className = 'cell shot';
  figure.style.width = `${cellWidth}px`;
  const shot = (record.shots ?? []).find(item => item.tab === tab && item.url);
  if (shot) {
    const img = document.createElement('img');
    img.src = shot.url;
    img.alt = `${record.name}'s drawer, ${tab} tab`;
    figure.append(img);
  } else {
    const why = document.createElement('p');
    why.className = 'why';
    why.textContent = `no shot of ${tab}`;
    figure.append(why);
  }
  const caption = document.createElement('figcaption');
  caption.textContent = 'shot';
  figure.append(caption);
  return figure;
}

function sourceFigure(name, tab, cellWidth, cellHeight) {
  const figure = document.createElement('figure');
  figure.className = 'cell source';
  const frame = document.createElement('iframe');
  frame.title = `source:${name}:${tab}`;
  frame.width = String(cellWidth);
  frame.height = String(cellHeight);
  const caption = document.createElement('figcaption');
  caption.append('source');
  const why = document.createElement('span');
  why.className = 'why';
  caption.append(why);
  figure.append(frame, caption);
  return figure;
}

// The source frame's load, ignoring the empty document it starts on.
function waitForLoad(frame, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      frame.removeEventListener('load', onLoad);
      reject(new Error(`the source frame did not load within ${ms} ms`));
    }, ms);
    function onLoad() {
      let href = '';
      try { href = frame.contentWindow?.location?.href ?? ''; } catch { href = ''; }
      if (!href || href === 'about:blank') return;
      clearTimeout(timer);
      frame.removeEventListener('load', onLoad);
      resolve();
    }
    frame.addEventListener('load', onLoad);
  });
}

async function loadSource(figure, name, record, tab) {
  figure.dataset.started = String(performance.now());
  const why = figure.querySelector('.why');
  const fail = message => {
    figure.classList.add('failed');
    why.textContent = message;
    figure.dataset.ready = String(performance.now());
  };
  if (!record.vendored) {
    fail(`${name}: ${tab}: no source snapshot`);
    return;
  }
  const frame = figure.querySelector('iframe');
  try {
    seedSource(sourceSeed(name, record, 'defaults', tab));
    const loaded = waitForLoad(frame, 15000);
    frame.setAttribute('src', sourceUrl(name));
    await loaded;
    const problem = sourceDocumentError(frame.contentDocument);
    if (problem) throw new Error(problem);
    await openSourceTab({ tab }, frame.contentDocument);
    figure.dataset.ready = String(performance.now());
  } catch (error) {
    fail(`${name}: ${tab}: ${error.message}`);
  }
}

// One row per visible group. The knobs cells load together; the source cells
// load one at a time, each seeded before its page starts.
async function captureRows() {
  const [rowWidth, rowHeight] = [Number(params.get('w') ?? 960), Number(params.get('h') ?? 600)];
  const knobs = [];
  const sources = [];
  try {
    for (const id of captureNames) {
      const name = id.startsWith('capture:') ? id.slice('capture:'.length) : id;
      try {
        const record = captureOf(name);
        const tabs = (record.groups ?? []).filter(group => !group.hidden).map(group => group.name);
        for (const tab of tabs) {
          const row = document.createElement('section');
          row.className = 'capture-row';
          row.dataset.capture = name;
          row.dataset.tab = tab;
          const heading = document.createElement('h2');
          heading.textContent = `capture:${name} · ${tab}`;
          const source = sourceFigure(name, tab, rowWidth, rowHeight);
          row.append(heading, ...(fixtures ? [shotFigure(record, tab, rowWidth)] : []), source);
          cells.append(row);
          sources.push({ figure: source, name, record, tab });
          knobs.push(cell(`capture:${name}`, { tab, parent: row, width: rowWidth, height: rowHeight, className: 'cell knobs' }));
        }
      } catch (error) {
        const row = document.createElement('section');
        row.className = 'capture-row failed';
        row.dataset.capture = name;
        const heading = document.createElement('h2');
        heading.textContent = `capture:${name}`;
        const why = document.createElement('p');
        why.className = 'why';
        why.textContent = `${name}: ${error.message}`;
        row.append(heading, why);
        cells.append(row);
      }
    }
    await Promise.all([
      Promise.all(knobs),
      (async () => {
        for (const source of sources) await loadSource(source.figure, source.name, source.record, source.tab);
      })(),
    ]);
  } catch (error) {
    document.body.dataset.error = error.message;
  } finally {
    document.body.dataset.ready = '1';
  }
}

const ids = params.get('ids') ? params.get('ids').split(',') : sets[set]();
if (set === 'captures' && !params.get('ids')) void captureRows();
else Promise.all(ids.map(id => cell(id))).then(() => { document.body.dataset.ready = '1'; });
