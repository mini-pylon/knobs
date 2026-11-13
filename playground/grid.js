// Several stages side by side, each a stage.html in its own frame:
//   set=exemplars          every exemplar (the default)
//   set=seeds&from=1&n=12  a run of random seeds (g sets their group count)
//   set=drafts             every draft in the drafts folder
//   set=captures           every capture in the captures folder, with its defaults
//   set=all                stress, every exemplar, draft and capture, and 8 seeds
//   ids=a,b,c              these scenarios, in place of a set
// tab= opens every stage on that tab; w= and h= size the cells.
// body[data-ready] marks every stage mounted or failed.
import { captureNames, draftNames, exemplarNames } from './scenarios.js';

const params = new URLSearchParams(location.search);
const set = params.get('set') ?? 'exemplars';
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

function cell(id) {
  const query = new URLSearchParams({ s: id });
  for (const key of ['tab', 'g']) if (params.get(key)) query.set(key, params.get(key));
  const figure = document.createElement('figure');
  figure.className = 'cell';
  const frame = document.createElement('iframe');
  frame.width = String(width);
  frame.height = String(height);
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
  cells.append(figure);
  return new Promise(resolve => {
    const poll = setInterval(() => {
      const body = frame.contentDocument?.body;
      if (!body) return;
      if (body.dataset.error) {
        figure.classList.add('failed');
        why.textContent = body.dataset.error;
      } else if (!body.dataset.ready) return;
      clearInterval(poll);
      resolve();
    }, 100);
  });
}

const ids = params.get('ids') ? params.get('ids').split(',') : sets[set]();
Promise.all(ids.map(cell)).then(() => { document.body.dataset.ready = '1'; });
