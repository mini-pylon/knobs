// One scenario in a real page: the drawer mounted as a project mounts it,
// opened on the tab named by `tab` (a group, a page, or the console). The
// shell and the grid frame this page and read window.__stage:
//   { id, groups, store, options, events, error, capture }
// body[data-ready] marks a mount, body[data-error] a failure.
import { defineControls, mountKnobs } from 'knobs';
import { resolveScenario } from './scenarios.js';

const params = new URLSearchParams(location.search);
const id = params.get('s') ?? 'stress';
// The drawer's title, its console tab and prompt: an exemplar's, a draft's or
// a capture's own name, and 'playground' for everything else.
const NAME = /^(exemplar|draft|capture):/.test(id) ? id.slice(id.indexOf(':') + 1) : 'playground';
document.querySelector('.label').textContent = id;

async function start() {
  // A fresh drawer each time: no values or open tab carried over from the
  // last scenario, and the drawer opens on load.
  for (const key of [`${NAME}:values`, `${NAME}:groups`]) localStorage.removeItem(key);
  sessionStorage.setItem(`${NAME}:drawer`, '1');

  const scenario = await resolveScenario(params);
  const store = defineControls(scenario.groups, scenario.values ?? {});
  const events = [];
  const stageState = { id, groups: store.groups, store, options: {}, events, error: null, capture: scenario.capture ?? null };
  window.__stage = stageState;
  store.subscribe((value, path) => {
    events.push({ at: performance.now(), path, value });
    if (events.length > 500) events.shift();
  });
  stageState.options = (await scenario.options?.(store)) ?? {};
  mountKnobs(store, { name: NAME, ...stageState.options });
  openTab(params.get('tab'));
  document.body.dataset.ready = '1';
}

// The named tab, or else an extension's first page, or the first visible group.
function openTab(name) {
  const host = document.querySelector(`[data-knobs="${NAME}"]`);
  const buttons = [...host.shadowRoot.querySelectorAll('.term-tab')];
  const firstPage = window.__stage.options.pages?.[0];
  const fallback = firstPage ? (firstPage.label ?? firstPage.name) : window.__stage.groups.find(g => !g.hidden)?.name;
  const want = name ?? fallback;
  const button = buttons.find(b => b.textContent === want);
  if (!button) throw new Error(`no tab: ${want}`);
  button.click();
}

start().catch(error => {
  if (window.__stage) window.__stage.error = error.message;
  document.body.dataset.error = error.message;
  document.querySelector('.label').textContent = `${id}: ${error.message}`;
  throw error;
});
