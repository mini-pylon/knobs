// The playground shell: picks a scenario, frames its stage (stage.html) at a
// chosen width, and reads the stage's window.__stage for the system views.
// Everything that picks what is shown lives in the query (s, g, set, w,
// view), so a view can be linked or reloaded.
import { defineControls } from 'knobs';
import { captureNames, draftNames, exemplarNames, JSON_KEY } from './scenarios.js';

const $ = selector => document.querySelector(selector);
const params = new URLSearchParams(location.search);
const scenario = params.get('s') ?? 'stress';
const frame = $('iframe.stage');
const errorBox = $('.source .error');
const textarea = $('.source textarea');

// --- scenario picker -------------------------------------------------------
const choices = [['stress', 'stress'], ['random', 'random (seeded)'], ...exemplarNames.map(n => [`exemplar:${n}`, `exemplar: ${n}`]),
  ...draftNames.map(n => [`draft:${n}`, `draft: ${n}`]), ...captureNames.map(n => [`capture:${n}`, `capture: ${n}`]), ['json', 'edited schema']];
const picker = $('.scenario');
for (const [value, label] of choices) picker.append(new Option(label, value));
const kind = scenario.startsWith('random:') ? 'random' : scenario;
picker.value = kind;
const seed = scenario.startsWith('random:') ? Number(scenario.slice(7)) : 1;
$('.seed').value = String(seed);
$('.count').value = params.get('g') ?? '';
for (const field of document.querySelectorAll('.seed-field')) field.hidden = kind !== 'random';
$('.reroll').hidden = kind !== 'random';

function go(changes) {
  const next = new URLSearchParams(location.search);
  for (const [key, value] of Object.entries(changes)) {
    if (value === '' || value == null) next.delete(key);
    else next.set(key, value);
  }
  location.search = next.toString();
}
// A value set belongs to one capture: another scenario starts without it.
picker.addEventListener('change', () => go({ s: picker.value === 'random' ? `random:${$('.seed').value || 1}` : picker.value, set: '' }));
$('.seed').addEventListener('change', () => go({ s: `random:${$('.seed').value || 1}` }));
$('.count').addEventListener('change', () => go({ g: $('.count').value }));
$('.reroll').addEventListener('click', () => go({ s: `random:${1 + Math.floor(Math.random() * 1e6)}` }));

// --- stage -----------------------------------------------------------------
const stageQuery = new URLSearchParams({ s: scenario });
for (const key of ['g', 'tab', 'set']) if (params.get(key)) stageQuery.set(key, params.get(key));
frame.src = `./stage.html?${stageQuery}`;

function setWidth(w) {
  frame.style.width = w ? `${w}px` : '';
  frame.classList.toggle('sized', Boolean(w));
  for (const b of document.querySelectorAll('.widths button')) b.classList.toggle('on', b.dataset.w === (w ?? ''));
}
setWidth(params.get('w') ?? '');
for (const b of document.querySelectorAll('.widths button')) {
  b.addEventListener('click', () => {
    setWidth(b.dataset.w);
    const next = new URLSearchParams(location.search);
    if (b.dataset.w) next.set('w', b.dataset.w); else next.delete('w');
    history.replaceState(null, '', `?${next}`);
  });
}

const stage = () => frame.contentWindow?.__stage;

// --- source editor ---------------------------------------------------------
// The groups as written: the store's frozen copies carry path, group and
// default, which a schema does not.
function rawGroups(groups) {
  return groups.map(({ name, about, hidden, controls }) => ({
    name, ...(about ? { about } : {}), ...(hidden ? { hidden } : {}),
    controls: controls.map(({ path, group, default: _, ...raw }) => raw),
  }));
}
// Once the editor is typed in, a stage that finishes loading leaves it alone.
let edited = false;
textarea.addEventListener('input', () => { edited = true; });
function showError(message) {
  errorBox.hidden = !message;
  errorBox.textContent = message ?? '';
}
$('.apply').addEventListener('click', () => {
  let groups;
  try {
    groups = JSON.parse(textarea.value);
    defineControls(groups);
  } catch (error) {
    return showError(error.message);
  }
  sessionStorage.setItem(JSON_KEY, JSON.stringify(groups));
  showError(null);
  go({ s: 'json' });
});

// --- paste a draft ---------------------------------------------------------
const pasteForm = $('.paste form');
const pasteError = $('.paste-error');
pasteForm.addEventListener('submit', async event => {
  event.preventDefault();
  const data = new FormData(pasteForm);
  const files = { 'controls.js': data.get('controls'), 'visual.js': data.get('visual'), 'extension.js': data.get('extension') };
  const response = await fetch('./__playground/draft', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: data.get('name'), files }),
  });
  const result = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
  pasteError.hidden = response.ok;
  if (!response.ok) return void (pasteError.textContent = result.error);
  go({ s: result.scenario });
});

// --- system views ----------------------------------------------------------
const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};
const views = Object.fromEntries([...document.querySelectorAll('.view')].map(v => [v.dataset.view, v]));
const isCapture = scenario.startsWith('capture:');
$('.view-tabs button[data-for=capture]').hidden = !isCapture;
let current = params.get('view') ?? 'schema';
if (current === 'capture' && !isCapture) current = 'schema';
function showView(name) {
  current = name;
  for (const [key, node] of Object.entries(views)) node.classList.toggle('on', key === name);
  for (const b of document.querySelectorAll('.view-tabs button')) b.classList.toggle('on', b.dataset.for === name);
  render();
}
for (const b of document.querySelectorAll('.view-tabs button')) {
  b.addEventListener('click', () => {
    showView(b.dataset.for);
    const next = new URLSearchParams(location.search);
    next.set('view', b.dataset.for);
    history.replaceState(null, '', `?${next}`);
  });
}

const describe = control => {
  if (control.type === 'number') return `${control.min}…${control.max} step ${control.step}`;
  if (control.type === 'select') return `[${control.options.join(' ')}]`;
  return '';
};
const show = value => (typeof value === 'string' ? JSON.stringify(value) : String(value));

function renderSchema(s) {
  const out = [];
  for (const group of s.groups) {
    out.push(el('h3', '', group.name));
    if (group.hidden) out.at(-1).append(el('span', 'tag', 'hidden'));
    if (s.options.visuals?.[group.name]) out.at(-1).append(el('span', 'tag', 'picture'));
    if (group.about) out.push(el('p', 'about', group.about));
    const table = el('table');
    for (const control of group.controls) {
      const row = table.insertRow();
      row.insertCell().textContent = control.path;
      row.insertCell().append(el('span', 'type', control.type), ' ', describe(control));
      row.insertCell().textContent = show(control.default);
      if (control.about) row.title = control.about;
    }
    out.push(table);
  }
  return out;
}

function renderState(s) {
  const changed = s.store.changed();
  const out = [el('h3', '', 'changed from default (what save would write)'), el('pre', '', JSON.stringify(changed, null, 2))];
  out.push(el('h3', '', 'live values'));
  const table = el('table');
  for (const [path] of s.store.byPath) {
    const row = table.insertRow();
    row.insertCell().textContent = path;
    const cell = row.insertCell();
    cell.textContent = show(s.store.control(path));
    if (Object.hasOwn(changed, path)) cell.className = 'changed';
  }
  out.push(table);
  return out;
}

function renderEvents(s) {
  if (!s.events.length) return [el('p', 'about', 'No changes yet. Drag a bar or type in the drawer.')];
  const table = el('table');
  for (const event of [...s.events].reverse().slice(0, 200)) {
    const row = table.insertRow();
    row.insertCell().textContent = `${(event.at / 1000).toFixed(2)}s`;
    row.insertCell().textContent = event.path;
    row.insertCell().textContent = show(event.value);
  }
  return [table];
}

function renderCommands(s) {
  const { pages = [], commands = {}, visuals = {} } = s.options;
  const out = [];
  out.push(el('h3', '', 'pages'));
  const pageTable = el('table');
  for (const page of [{ name: 'performance', about: 'built in: frame rate and timings' }, ...pages]) {
    const row = pageTable.insertRow();
    row.insertCell().textContent = page.label ?? page.name;
    row.insertCell().textContent = page.about ?? '';
  }
  out.push(pageTable, el('h3', '', 'commands'));
  const names = Object.keys(commands);
  if (!names.length) out.push(el('p', 'about', 'none besides the built-ins (type help in the console)'));
  else {
    const table = el('table');
    for (const name of names) {
      const row = table.insertRow();
      row.insertCell().textContent = `/${name}${commands[name].usage ? ` ${commands[name].usage}` : ''}`;
      row.insertCell().textContent = commands[name].about ?? '';
    }
    out.push(table);
  }
  out.push(el('h3', '', 'pictures'));
  const pictures = Object.keys(visuals);
  out.push(el('p', 'about', pictures.length ? pictures.join(', ') : 'none'));
  if (s.options.status) out.push(el('h3', '', 'status'), el('pre', '', s.options.status()));
  return out;
}

// A capture: where it came from, its value sets, what has no place in knobs,
// and the project's own drawer as it was shot.
function renderCapture(s) {
  const c = s.capture;
  if (!c) return [el('p', 'about', 'not a capture')];
  const { repo, branch, commit, dirty } = c.source;
  const where = commit ? `${repo} · ${branch} · ${commit.slice(0, 7)}${dirty ? ' · uncommitted changes' : ''}` : `${repo} · not in git`;
  const out = [el('h3', '', 'source'), el('p', '', where), el('p', 'about', `captured ${c.capturedAt}`)];

  out.push(el('h3', '', 'value set'));
  const picker = el('select', 'value-set');
  for (const name of Object.keys(c.valueSets)) picker.append(new Option(name, name));
  picker.value = c.set;
  picker.addEventListener('change', () => go({ set: picker.value === 'defaults' ? '' : picker.value }));
  const set = c.valueSets[c.set];
  out.push(picker, el('p', 'about', `${set.about} · ${Object.keys(set.values).length} off default`));
  if (set.dropped?.length) {
    out.push(el('p', 'about', 'dropped:'));
    const table = el('table');
    for (const { path, value, why } of set.dropped) {
      const row = table.insertRow();
      row.insertCell().textContent = path;
      row.insertCell().textContent = show(value);
      row.insertCell().textContent = why;
    }
    out.push(table);
  }

  out.push(el('h3', '', 'not translated'));
  const list = el('ul', 'untranslated');
  for (const item of c.untranslated) list.append(el('li', '', item));
  out.push(list);

  out.push(el('h3', '', 'original drawer'));
  if (!c.shots.length) out.push(el('p', 'about', `no shots: ${c.shotsSkipped ?? 'none taken'}`));
  for (const shot of c.shots) {
    const figure = el('figure', 'shot');
    const link = el('a');
    link.href = shot.url;
    link.target = '_blank';
    const img = el('img');
    img.src = shot.url;
    img.alt = `${repo}'s drawer, ${shot.tab} tab`;
    link.append(img);
    figure.append(link, el('figcaption', '', shot.tab));
    out.push(figure);
  }
  return out;
}

const renderers = { schema: renderSchema, state: renderState, events: renderEvents, commands: renderCommands, capture: renderCapture };
let lastKey = '';
function render() {
  const s = stage();
  if (!s) return;
  if (s.error) showError(s.error);
  // Re-render only what changed: the capture per mount, the rest per event.
  const key = current === 'capture' ? `capture:${s.id}` : `${current}:${s.id}:${s.events.length}:${s.events.at(-1)?.at ?? 0}`;
  if (key === lastKey && current !== 'commands') return;
  lastKey = key;
  views[current].replaceChildren(...renderers[current](s));
}

frame.addEventListener('load', () => {
  lastKey = '';
  const wait = setInterval(() => {
    const s = stage();
    if (!s) return;
    if (!s.error && !frame.contentDocument.body.dataset.ready) return;
    clearInterval(wait);
    if (s.error) showError(s.error);
    else if (!edited) textarea.value = JSON.stringify(rawGroups(s.groups), null, 2);
    render();
  }, 50);
});
setInterval(render, 300);
showView(current);
