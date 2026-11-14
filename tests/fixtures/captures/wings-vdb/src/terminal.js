// Stand-in for wings-vdb's src/terminal.js: the lines the capture adapter
// reads (HIDDEN_TABS and the slash actions), and a drawer with the real one's
// classes and storage keys. Like the real one, it opens on the console and
// restores only its active group: wings-vdb:groups (a JSON array of names) in
// localStorage, and the drawer open when wings-vdb:drawer is '1' in
// sessionStorage.
import * as params from './params.js';

const HIDDEN_TABS = new Set(['hover', 'birds', 'opening']);

export function mountTerminal({ commands = {}, pages = [], visuals = {} } = {}) {
  const slashActions = [
    { name: 'save', usage: '[name]', about: 'download the whole configuration as a JSON file' },
    { name: 'shot', usage: '[width]', about: 'download a high-res PNG of the current frame' },
    { name: 'load', usage: '', about: 'load a saved configuration file' },
  ];
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  };
  const root = el('div', 'term');
  root.innerHTML = '<section class="term-drawer"><nav class="term-tabs"></nav><div class="term-vars"></div><div class="term-viz"></div><div class="term-log"></div><label class="term-prompt"><span>wings-vdb $</span><input></label></section>';
  document.body.append(root);
  const tabs = root.querySelector('.term-tabs');
  const varsBox = root.querySelector('.term-vars');
  const vizBox = root.querySelector('.term-viz');
  const log = root.querySelector('.term-log');
  const input = root.querySelector('.term-prompt input');

  const GROUPS = 'wings-vdb:groups';
  let active = params.groups[0].name;
  try {
    const saved = JSON.parse(localStorage.getItem(GROUPS));
    const name = Array.isArray(saved) && saved.map(params.migrateGroup).find(n => !HIDDEN_TABS.has(n) && params.groups.some(g => g.name === n));
    if (name) active = name;
  } catch {}
  let view = 'console';

  function renderTabs() {
    const tab = (label, on, click) => {
      const button = el('button', `term-tab${on ? ' active' : ''}`, label);
      button.type = 'button';
      button.onclick = click;
      return button;
    };
    tabs.replaceChildren(
      tab('wings-vdb', view === 'console', () => setView('console')),
      ...pages.map(page => tab(page.label ?? page.name, view === page.name, () => setView(page.name))),
      ...params.groups.filter(g => !HIDDEN_TABS.has(g.name)).map(g => tab(g.name, view === 'params' && active === g.name, () => {
        active = g.name;
        try { localStorage.setItem(GROUPS, JSON.stringify([active])); } catch {}
        setView('params');
      })),
    );
  }
  function renderVars() {
    const group = params.groups.find(g => g.name === active);
    varsBox.replaceChildren(...(view === 'params' ? group.vars.map(v => {
      const row = el('div', 'term-row');
      row.dataset.path = v.path;
      row.append(el('span', 'term-key', v.key), el('span', 'term-value', String(params.values[v.path])));
      return row;
    }) : []));
    vizBox.replaceChildren();
    const viz = view === 'params' && root.classList.contains('open') && visuals[active] ? visuals[active](vizBox) : null;
    viz?.frame(0);
  }
  function setView(next) {
    view = next;
    renderTabs();
    renderVars();
  }
  function toggle(open = !root.classList.contains('open')) {
    root.classList.toggle('open', open);
    try { sessionStorage.setItem('wings-vdb:drawer', open ? '1' : '0'); } catch {}
    renderVars();
  }
  function print(text, cls = '') {
    log.append(el('div', `term-line ${cls}`, text));
  }
  function run(line) {
    const [name, ...args] = line.trim().split(/\s+/);
    if (commands[name]) print(String(commands[name].run(args) ?? ''));
    else if (slashActions.some(a => a.name === name)) print(`/${name} is not in the stand-in`);
  }
  addEventListener('keydown', event => {
    if (event.key === '`') { event.preventDefault(); toggle(); }
  });
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') { run(input.value); input.value = ''; }
  });

  renderTabs();
  renderVars();
  try { if (sessionStorage.getItem('wings-vdb:drawer') === '1') toggle(true); } catch {}
  return { print, toggle, run };
}
