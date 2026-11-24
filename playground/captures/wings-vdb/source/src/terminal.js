// Terminal-style control drawer docked in the bottom strip of the viewport.
// Open with the ` key (or /clouds in the chat). The first tab is the console;
// each other tab lists every variable of one group as a draggable bar row, and
// every change can also be typed at the prompt.
import * as params from './params.js';

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};
// Groups with no tab; `on <group>` at the prompt still opens one.
const HIDDEN_TABS = new Set(['hover', 'birds', 'opening']);
const fmt = (v, value) => v.type === 'toggle' ? (value ? 'on' : 'off') : value.toFixed((String(v.step).split('.')[1] || '').length);

// pages: extra tabs after the console, each { name, label?, about, mount(el) } where
// mount returns { update() }, called four times a second while it shows.
// visuals: a picture for the right of a params tab, by group name: mount(el)
// returns { frame(seconds) }, called about 15 times a second while it shows.
export function mountTerminal({ commands = {}, status = () => '', onFocus = () => {}, extras = { get: () => ({}), set: () => {} }, pages = [], visuals = {} } = {}) {
  const root = el('div', 'term');
  root.innerHTML = `
    <button class="term-strip" type="button" aria-expanded="false" aria-controls="term-drawer">
      <span class="term-grip" aria-hidden="true"></span><span class="term-hint">controls</span>
    </button>
    <section class="term-drawer" id="term-drawer" aria-label="Controls">
      <header class="term-head">
        <nav class="term-tabs"></nav>
        <span class="term-status"></span>
        <button class="term-close" type="button" aria-label="Close controls">×</button>
      </header>
      <div class="term-body">
        <div class="term-params"><div class="term-vars" role="list"></div><div class="term-viz"></div></div>
        <div class="term-console">
          <div class="term-log" aria-live="polite"></div>
          <div class="term-slash" role="listbox" aria-label="Actions" hidden></div>
          <input class="term-file" type="file" accept="application/json,.json" hidden>
          <label class="term-prompt"><span>wings-vdb $</span><input spellcheck="false" autocomplete="off" autocapitalize="off" aria-label="Command"></label>
        </div>
      </div>
    </section>`;
  document.body.append(root);

  const strip = root.querySelector('.term-strip');
  const drawer = root.querySelector('.term-drawer');
  const tabs = root.querySelector('.term-tabs');
  const varsBox = root.querySelector('.term-vars');
  const log = root.querySelector('.term-log');
  const input = root.querySelector('.term-prompt input');
  const statusEl = root.querySelector('.term-status');
  // Each group is its own page; active holds the one that shows (a set, as
  // the page's onFocus reports groups).
  const GROUPS = 'wings-vdb:groups';
  let active = new Set([params.groups[0].name]);
  try {
    const saved = JSON.parse(localStorage.getItem(GROUPS));
    const name = Array.isArray(saved) && saved.map(params.migrateGroup).find(n => !HIDDEN_TABS.has(n) && params.groups.some(g => g.name === n));
    if (name) active = new Set([name]);
  } catch {}
  const activeGroups = () => params.groups.filter(g => active.has(g.name));
  function setActive(next) {
    active = next;
    try { localStorage.setItem(GROUPS, JSON.stringify([...active])); } catch {}
    renderTabs(); renderVars(); notify(); syncViz();
  }
  // Which pane shows: the console (the first tab, open on load), one of the
  // extra pages, or the params of the active groups.
  const CONSOLE = 'wings-vdb';
  const body = root.querySelector('.term-body');
  const panes = { console: root.querySelector('.term-console'), params: root.querySelector('.term-params') };
  const mounted = pages.map(page => {
    const el = document.createElement('div');
    el.className = `term-page term-page-${page.name}`;
    body.append(el);
    panes[page.name] = el;
    return { ...page, el, view: page.mount(el) };
  });
  let view = 'console';
  // The picture beside a params tab. Only the showing tab's exists, and it
  // draws only while the drawer is open on it: the cloud has the GPU to itself
  // otherwise. Phones have no room for it.
  const vizBox = root.querySelector('.term-viz');
  const wide = matchMedia('(min-width: 761px)');
  let viz = null, vizName = null, vizRaf = 0, vizLast = 0;
  function vizTick(now) {
    vizRaf = requestAnimationFrame(vizTick);
    if (now - vizLast < 66) return;
    vizLast = now;
    viz.frame(now / 1000);
  }
  function syncViz() {
    const showing = root.classList.contains('open') && view === 'params' && wide.matches;
    const name = showing ? [...active].find(n => visuals[n]) ?? null : vizName;
    if (name !== vizName) { vizBox.replaceChildren(); viz = name ? visuals[name](vizBox) : null; vizName = name; }
    if (showing && viz && !vizRaf) vizRaf = requestAnimationFrame(vizTick);
    else if ((!showing || !viz) && vizRaf) { cancelAnimationFrame(vizRaf); vizRaf = 0; }
  }
  wide.addEventListener('change', syncViz);
  function showPane() {
    root.dataset.view = view;
    for (const [name, el] of Object.entries(panes)) el.hidden = name !== view;
    mounted.find(p => p.name === view)?.view.update?.();
    syncViz();
  }
  function setView(next) {
    view = next;
    showPane(); renderTabs(); notify();
    if (view === 'console' && root.classList.contains('open')) input.focus({ preventScroll: true });
  }
  // On the console, a click anywhere in the body puts the cursor in the
  // prompt, unless it lands on a control or ends a text selection in the log.
  body.addEventListener('click', event => {
    if (view !== 'console' || event.target.closest('button, a, input, select, textarea, [role="option"]')) return;
    if (String(getSelection?.() ?? '').length) return;
    input.focus({ preventScroll: true });
  });
  const rows = new Map();
  const history = [];
  let historyIndex = 0;

  function print(text, cls = '') {
    for (const line of String(text).split('\n')) log.append(el('div', `term-line ${cls}`, line || ' '));
    while (log.childElementCount > 400) log.firstChild.remove();
    log.scrollTop = log.scrollHeight;
  }


  function renderTabs() {
    const consoleTab = el('button', `term-tab${view === 'console' ? ' active' : ''}`, CONSOLE);
    consoleTab.type = 'button';
    consoleTab.setAttribute('aria-pressed', view === 'console');
    consoleTab.title = 'console: type help, or / for actions';
    consoleTab.onclick = () => setView('console');
    const pageTabs = mounted.map(page => {
      const b = el('button', `term-tab${view === page.name ? ' active' : ''}`, page.label ?? page.name);
      b.type = 'button';
      b.setAttribute('aria-pressed', view === page.name);
      b.title = page.about;
      b.onclick = () => setView(page.name);
      return b;
    });
    tabs.replaceChildren(consoleTab, ...pageTabs, ...params.groups.filter(g => !HIDDEN_TABS.has(g.name)).map(g => {
      const on = view === 'params' && active.has(g.name);
      const b = el('button', `term-tab${on ? ' active' : ''}`, g.name);
      b.type = 'button';
      b.setAttribute('aria-pressed', on);
      b.title = g.about;
      b.onclick = () => {
        if (view !== 'params') { view = 'params'; showPane(); }
        setActive(new Set([g.name]));
      };
      return b;
    }));
  }

  function renderVars() {
    rows.clear();
    const groups = activeGroups();
    if (!groups.length) { varsBox.replaceChildren(el('div', 'term-empty', 'click a tab above')); return; }
    varsBox.replaceChildren(...groups.flatMap(group => group.vars.map(makeRow)));
  }

  function makeRow(v) {
      const row = el('div', 'term-row');
      row.setAttribute('role', 'listitem');
      row.title = v.about;
      const name = el('span', 'term-key', v.key);
      if (v.type === 'toggle') {
        const button = el('button', 'term-toggle');
        button.type = 'button';
        button.setAttribute('aria-label', v.path);
        button.onclick = () => { params.set(v.path, params.values[v.path] ? 0 : 1); print(`${v.path} = ${fmt(v, params.values[v.path])}`, 'dim'); };
        row.append(name, button, el('span', 'term-value'), el('span', 'term-about', v.about));
        rows.set(v.path, { row, toggle: button, v });
        update(v.path);
        name.addEventListener('dblclick', () => { params.reset([v.path]); print(`reset ${v.path}`, 'dim'); });
        return row;
      }
      const slider = el('span', 'term-bar');
      slider.append(el('span', 'term-fill'));
      slider.tabIndex = 0;
      slider.setAttribute('role', 'slider');
      slider.setAttribute('aria-label', v.path);
      slider.setAttribute('aria-valuemin', v.min);
      slider.setAttribute('aria-valuemax', v.max);
      const value = el('span', 'term-value');
      const about = el('span', 'term-about', v.about);
      row.append(name, slider, value, about);
      rows.set(v.path, { row, slider, value, v });
      update(v.path);

      const fromPointer = event => {
        const rect = slider.getBoundingClientRect();
        const t = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
        params.set(v.path, v.min + t * (v.max - v.min));
      };
      slider.addEventListener('pointerdown', event => {
        slider.setPointerCapture(event.pointerId); fromPointer(event); slider.focus();
        const move = e => fromPointer(e);
        const up = () => { slider.removeEventListener('pointermove', move); slider.removeEventListener('pointerup', up); print(`set ${v.path} ${fmt(v, params.values[v.path])}`, 'dim'); };
        slider.addEventListener('pointermove', move);
        slider.addEventListener('pointerup', up);
      });
      slider.addEventListener('keydown', event => {
        const big = event.shiftKey ? 10 : 1;
        const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[event.key];
        if (step) { event.preventDefault(); params.set(v.path, params.values[v.path] + step * v.step * big); }
        if (event.key === 'Backspace' || event.key === 'Delete') { event.preventDefault(); params.reset([v.path]); }
      });
      name.addEventListener('dblclick', () => { params.reset([v.path]); print(`reset ${v.path}`, 'dim'); });
      return row;
  }

  // Actions: global reset, and save/load of the whole configuration as a local
  // file. They run from the prompt and are listed in the / menu.
  const fileInput = root.querySelector('.term-file');
  function resetAll() {
    params.reset();
    print('reset every variable to its default');
  }
  function saveConfig(name) {
    const data = { app: 'wings-vdb', version: 1, saved: new Date().toISOString(), values: { ...params.values }, ...extras.get() };
    const stamp = data.saved.slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
    const file = `${name ? name.replace(/[^\w.-]+/g, '-') : 'wings-vdb'}-${stamp}.json`;
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = el('a'); a.href = url; a.download = file; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    print(`saved ${file}`);
  }
  function applyConfig(data) {
    const values = data?.values ?? data;
    if (!values || typeof values !== 'object') throw new Error('not a wings-vdb config');
    let n = 0;
    for (const [path, value] of Object.entries(params.migrate(values))) if (params.set(path, Number(value))) n++;
    extras.set(data);
    print(`loaded ${n} values${data.agent ? ` · agent ${data.agent}` : ''}${data.portal ? ` · portal ${data.portal}` : ''}`);
  }
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    try { applyConfig(JSON.parse(await file.text())); }
    catch (error) { print(`load: ${error.message}`, 'err'); }
  });


  function update(path) {
    const r = rows.get(path);
    if (!r) return;
    const value = params.values[path];
    r.row.classList.toggle('changed', value !== r.v.default);
    if (r.toggle) { r.toggle.textContent = value ? 'on' : 'off'; r.toggle.setAttribute('aria-pressed', Boolean(value)); r.toggle.classList.toggle('off', !value); return; }
    r.slider.firstChild.style.width = `${(value - r.v.min) / (r.v.max - r.v.min) * 100}%`;
    r.slider.setAttribute('aria-valuenow', value);
    r.value.textContent = fmt(r.v, value);
    r.row.classList.toggle('changed', value !== r.v.default);
  }
  params.onChange(update);

  function resolve(name) {
    if (!name) return null;
    if (params.byPath.has(name)) return params.byPath.get(name);
    for (const g of activeGroups()) if (params.byPath.has(`${g.name}.${name}`)) return params.byPath.get(`${g.name}.${name}`);
    const matches = [...params.byPath.values()].filter(v => v.key === name);
    return matches.length === 1 ? matches[0] : null;
  }

  function listing(groupName) {
    const group = params.groups.find(g => g.name === groupName);
    if (!group) return `no group ${groupName}`;
    const width = Math.max(...group.vars.map(v => v.key.length));
    return [`# ${group.name}: ${group.about}`, ...group.vars.map(v => {
      const value = params.values[v.path];
      return `${v.key.padEnd(width)}  ${fmt(v, value).padStart(6)}  ${v.type === 'toggle' ? '' : `[${v.min}..${v.max}]`}${value !== v.default ? ` (default ${fmt(v, v.default)})` : ''}`;
    })].join('\n');
  }

  const builtins = {
    help: () => print([
      'commands',
      '  ls [group]             list variables',
      '  <var> <value>          set a variable (e.g. expand 1.4, dispersal.drift 2)',
      '  <toggle> [on|off]      flip or set a toggle (e.g. dive.preview off)',
      '  set <var> <value>      same as above; += and -= also work: drift += .2',
      '  get <var>              show a value and what it does',
      '  reset [var|group|all]  restore defaults',
      '  /                      type / first to list actions: /save [name], /load, /reset, /shot',
      '  save [name]            download the whole configuration as a JSON file',
      '  load                   load a saved configuration file',
      '  export                 print and copy values as JSON',
      '  import <json>          load values from JSON',
      '  on <group>             open a group\'s tab (or click it)',
      '  clear                  clear this log',
      '  close                  hide the drawer (or Esc)',
      ...Object.entries(commands).map(([name, c]) => `  ${(name + ' ' + (c.usage || '')).padEnd(22)} ${c.about}`),
      'keys: ` toggles the drawer · v cycles the view · drag bars · arrows nudge (shift ×10) · double-click a name to reset',
    ].join('\n')),
    ls: ([g]) => print(g ? listing(g) : activeGroups().map(x => listing(x.name)).join('\n') || 'no groups on'),
    get: ([name]) => {
      const v = resolve(name);
      if (!v) return print(`unknown variable: ${name ?? ''}`, 'err');
      print(`${v.path} = ${fmt(v, params.values[v.path])}  (default ${v.default}, range ${v.min}..${v.max})\n  ${v.about}`);
    },
    set: args => setCommand(args),
    reset: ([target]) => {
      if (!target || target === 'all') return resetAll();
      const group = params.groups.find(g => g.name === target);
      if (group) { params.reset(group.vars.map(v => v.path)); return print(`reset ${target}`); }
      const v = resolve(target);
      if (!v) return print(`unknown: ${target}`, 'err');
      params.reset([v.path]); print(`reset ${v.path} → ${v.default}`);
    },
    save: ([name]) => saveConfig(name),
    load: () => fileInput.click(),
    export: () => {
      const json = JSON.stringify(params.values, null, 2);
      print(json);
      navigator.clipboard?.writeText(json).then(() => print('copied to clipboard', 'dim'), () => {});
    },
    import: args => {
      try {
        const data = params.migrate(JSON.parse(args.join(' ')));
        let n = 0;
        for (const [path, value] of Object.entries(data)) if (params.set(path, Number(value))) n++;
        print(`imported ${n} values`);
      } catch (error) { print(`import: ${error.message}`, 'err'); }
    },
    on: ([name]) => {
      if (!params.groups.some(g => g.name === name)) return print(`no group ${name ?? ''}`, 'err');
      view = 'params'; showPane(); setActive(new Set([name]));
    },
    clear: () => log.replaceChildren(),
    close: () => toggle(false),
    exit: () => toggle(false),
  };

  function setCommand(args) {
    let [name, op, raw] = args;
    if (raw === undefined) { raw = op; op = '='; }
    if (name?.includes('=') && op === '=' && raw === undefined) [name, raw] = name.split('=');
    const v = resolve(name);
    if (!v) return print(`unknown variable: ${name ?? ''}  (try ls)`, 'err');
    const words = { on: 1, off: 0, true: 1, false: 0, yes: 1, no: 0 };
    if (v.type === 'toggle' && raw === undefined) raw = params.values[v.path] ? 'off' : 'on';
    const number = raw in words ? words[raw] : Number(raw);
    if (!Number.isFinite(number)) return print(`not a number: ${raw}`, 'err');
    const now = params.values[v.path];
    const next = op === '+=' ? now + number : op === '-=' ? now - number : number;
    params.set(v.path, next);
    const applied = params.values[v.path];
    print(`${v.path} = ${fmt(v, applied)}${applied !== next ? `  (clamped to ${v.min}..${v.max})` : ''}`);
  }

  // The / menu lists these. Add future actions here and to builtins.
  const slashActions = [
    { name: 'save', usage: '[name]', about: 'download the whole configuration as a JSON file' },
    { name: 'load', usage: '', about: 'load a saved configuration file' },
    { name: 'reset', usage: '[var|group]', about: 'reset every variable to its default, or just one var or group' },
    { name: 'shot', usage: '[width]', about: 'download a high-res PNG of the current frame' },
  ];
  const slash = root.querySelector('.term-slash');
  let slashHits = [], slashIndex = 0;
  function renderSlash() {
    const v = input.value;
    const open = v.startsWith('/') && !/\s/.test(v);
    slashHits = open ? slashActions.filter(a => a.name.startsWith(v.slice(1))) : [];
    slash.hidden = !slashHits.length;
    if (slash.hidden) return;
    slashIndex = Math.min(slashIndex, slashHits.length - 1);
    slash.style.bottom = `${root.querySelector('.term-prompt').offsetHeight + 4}px`;
    slash.replaceChildren(...slashHits.map((a, i) => {
      const item = el('div', `term-slash-item${i === slashIndex ? ' active' : ''}`);
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', i === slashIndex);
      item.append(el('span', 'term-slash-name', `/${a.name}`), el('span', 'term-slash-usage', a.usage), el('span', 'term-slash-about', a.about));
      item.addEventListener('mousedown', event => { event.preventDefault(); input.value = ''; renderSlash(); run(`/${a.name}`); });
      return item;
    }));
  }
  input.addEventListener('input', () => { slashIndex = 0; renderSlash(); });
  input.addEventListener('blur', () => { slash.hidden = true; });
  input.addEventListener('focus', renderSlash);

  function run(line) {
    const text = line.trim();
    if (!text) return;
    print(`$ ${text}`, 'cmd');
    history.push(text); historyIndex = history.length;
    const normalized = text.replace(/^\//, '').replace(/\s*(\+=|-=|=)\s*/, ' $1 ');
    const [head, ...rest] = normalized.split(/\s+/);
    try {
      if (builtins[head]) return builtins[head](rest);
      if (commands[head]) return print(commands[head].run(rest) ?? '');
      if (resolve(head)) return setCommand([head, ...rest]);
      print(`unknown command: ${head}  (try help)`, 'err');
    } catch (error) { print(String(error.message || error), 'err'); }
  }

  function complete() {
    const [head, ...rest] = input.value.split(/\s+/);
    const pool = rest.length
      ? [...params.byPath.keys(), ...[...params.byPath.values()].map(v => v.key), ...params.groups.map(g => g.name)]
      : [...Object.keys(builtins), ...Object.keys(commands), ...params.groups.flatMap(g => g.vars.map(v => active.has(g.name) ? v.key : v.path))];
    const word = rest.length ? rest[rest.length - 1] : head;
    const hits = [...new Set(pool)].filter(c => c.startsWith(word));
    if (hits.length === 1) {
      const words = input.value.split(/\s+/); words[words.length - 1] = hits[0];
      input.value = words.join(' ') + ' ';
    } else if (hits.length > 1) print(hits.join('  '), 'dim');
  }

  input.addEventListener('keydown', event => {
    if (!slash.hidden) {
      const pick = slashHits[slashIndex];
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        slashIndex = (slashIndex + (event.key === 'ArrowDown' ? 1 : -1) + slashHits.length) % slashHits.length;
        return renderSlash();
      }
      if (event.key === 'Tab') { event.preventDefault(); input.value = `/${pick.name} `; return renderSlash(); }
      if (event.key === 'Enter') { event.preventDefault(); input.value = ''; renderSlash(); return run(`/${pick.name}`); }
      if (event.key === 'Escape') { event.stopPropagation(); input.value = ''; return renderSlash(); }
    }
    if (event.key === 'Enter') { run(input.value); input.value = ''; renderSlash(); }
    else if (event.key === 'Tab') { event.preventDefault(); complete(); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); historyIndex = Math.max(0, historyIndex - 1); input.value = history[historyIndex] ?? ''; }
    else if (event.key === 'ArrowDown') { event.preventDefault(); historyIndex = Math.min(history.length, historyIndex + 1); input.value = history[historyIndex] ?? ''; }
    else if (event.key === 'l' && event.ctrlKey) { event.preventDefault(); log.replaceChildren(); }
  });

  const notify = () => onFocus({ open: root.classList.contains('open'), groups: view === 'params' ? [...active] : [] });
  function toggle(open = !root.classList.contains('open')) {
    root.classList.toggle('open', open);
    strip.setAttribute('aria-expanded', open);
    document.body.classList.toggle('term-open', open);
    notify(); // after term-open, which the page's hover check reads
    syncViz();
    try { sessionStorage.setItem('wings-vdb:drawer', open ? '1' : '0'); } catch {}
    if (open && view === 'console') setTimeout(() => input.focus({ preventScroll: true }), 160);
    else if (root.contains(document.activeElement)) document.activeElement.blur();
  }
  strip.addEventListener('click', () => toggle());
  root.querySelector('.term-close').addEventListener('click', () => toggle(false));
  addEventListener('keydown', event => {
    if (event.key === '`' && !event.ctrlKey && !event.metaKey) {
      event.preventDefault(); toggle();
    } else if (event.key === '~' && !event.ctrlKey && !event.metaKey && mounted.some(p => p.name === 'perf')) {
      // Shift+` (~): straight to the perf page, or closed again from it.
      event.preventDefault();
      root.classList.contains('open') && view === 'perf' ? toggle(false) : showView('perf');
    } else if (event.key === 'Escape' && root.classList.contains('open')) toggle(false);
  });

  setInterval(() => {
    if (!root.classList.contains('open')) return;
    statusEl.textContent = status();
    mounted.find(p => p.name === view)?.view.update?.();
  }, 250);

  showPane();
  renderTabs();
  renderVars();
  print('wings-vdb controls · type help, or / for actions · ` toggles this drawer', 'dim');
  try { if (sessionStorage.getItem('wings-vdb:drawer') === '1') toggle(true); } catch {}

  // Open the drawer on a given tab: 'console', a page name, or 'params'.
  function showView(name) { toggle(true); setView(name); }
  return { print, toggle, run, showView };
}
