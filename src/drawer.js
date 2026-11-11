// The control drawer: a shadow host, one tab per group, a console, and
// the instrument side (changed values, pictures, performance).
import { formatNumber, storageCall } from './store.js';
import { coerce, parseLine } from './console.js';
import { performancePage } from './performance.js';
import { css } from './style.js';

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};

const TEXT_INPUT = new Set(['', 'text', 'search', 'url', 'tel', 'email', 'password', 'number']);

// Strings stay as typed. Numbers take their decimals from the step,
// unless that would show a different number than the one stored.
function fmt(control, value) {
  if (control.type === 'toggle') return value ? 'on' : 'off';
  if (typeof value !== 'number') return String(value);
  return formatNumber(control.step, value);
}

// event.target is the host once a key leaves the shadow tree.
function isEditable(event) {
  let node = event.composedPath()[0];
  if (node && node.nodeType === 3) node = node.parentElement;
  if (!node || node.nodeType !== 1) return false;
  if (node.isContentEditable) return true;
  if (node.tagName === 'TEXTAREA') return true;
  if (node.tagName === 'INPUT') return TEXT_INPUT.has(String(node.type || '').toLowerCase());
  return false;
}

export function mountKnobs(store, options = {}) {
  if (typeof window === 'undefined') throw new Error('knobs: mountKnobs needs a browser');
  const {
    name,
    commands = {},
    status = () => '',
    onFocus = () => {},
    extras = { get: () => ({}), set: () => {} },
    pages = [],
    visuals = {},
    stats,
  } = options;
  if (!name) throw new Error('knobs: mountKnobs needs a name');

  const host = document.createElement('div');
  host.dataset.knobs = name;
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = css;
  const root = el('div', 'term');
  root.innerHTML = `
    <section class="term-drawer" aria-label="Controls">
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
          <label class="term-prompt"><span></span><input spellcheck="false" autocomplete="off" autocapitalize="off" aria-label="Command"></label>
        </div>
      </div>
    </section>`;
  shadow.append(style, root);
  document.body.append(host);
  try {
    const tabs = root.querySelector('.term-tabs');
    const varsBox = root.querySelector('.term-vars');
    const log = root.querySelector('.term-log');
    const input = root.querySelector('.term-prompt input');
    const statusEl = root.querySelector('.term-status');
    const fileInput = root.querySelector('.term-file');
    const slash = root.querySelector('.term-slash');
    const body = root.querySelector('.term-body');
    const vizBox = root.querySelector('.term-viz');
    const panes = { console: root.querySelector('.term-console'), params: root.querySelector('.term-params') };
    const mounted = [performancePage({ stats }), ...pages].map(page => {
      const node = document.createElement('div');
      node.className = `term-page term-page-${page.name}`;
      body.append(node);
      panes[page.name] = node;
      return { ...page, node, panel: page.mount(node) };
    });
    root.querySelector('.term-prompt span').textContent = `${name} $`;

    store.attach(storageCall('localStorage'), `${name}:values`);

    const visibleGroups = () => store.groups.filter(group => !group.hidden);
    let active = new Set(visibleGroups()[0] ? [visibleGroups()[0].name] : []);
    try {
      const saved = JSON.parse(storageCall('localStorage', 'getItem', `${name}:groups`));
      const found = Array.isArray(saved) && saved.find(groupName => store.groups.some(group => group.name === groupName && !group.hidden));
      if (found) active = new Set([found]);
    } catch { /* a bad saved group is the same as none */ }
    let view = 'console';
    const rows = new Map();
    const history = [];
    let historyIndex = 0;
    let focusTimer = 0;
    const pendingDownloads = new Map();

    function print(text, cls = '') {
      for (const line of String(text).split('\n')) log.append(el('div', `term-line ${cls}`, line || ' '));
      while (log.childElementCount > 400) log.firstChild.remove();
      log.scrollTop = log.scrollHeight;
    }

    function notify() {
      onFocus({ open: root.classList.contains('open'), groups: view === 'params' ? [...active] : [] });
    }

    function currentPage() {
      return mounted.find(page => page.name === view);
    }

    function showPane() {
      root.dataset.view = view;
      for (const [pane, node] of Object.entries(panes)) node.hidden = pane !== view;
      if (root.classList.contains('open')) currentPage()?.panel?.update?.();
    }

    function setView(next) {
      if (next !== view && root.classList.contains('open')) currentPage()?.hide?.();
      view = next;
      showPane();
      renderTabs();
      notify();
      if (root.classList.contains('open')) currentPage()?.show?.();
      if (view === 'console' && root.classList.contains('open')) input.focus({ preventScroll: true });
      syncViz();
    }

    function renderTabs() {
      const consoleTab = el('button', `term-tab${view === 'console' ? ' active' : ''}`, name);
      consoleTab.type = 'button';
      consoleTab.setAttribute('aria-pressed', String(view === 'console'));
      consoleTab.title = 'console: type help, or / for actions';
      consoleTab.onclick = () => setView('console');
      const pageTabs = mounted.map(page => {
        const button = el('button', `term-tab${view === page.name ? ' active' : ''}`, page.label ?? page.name);
        button.type = 'button';
        button.setAttribute('aria-pressed', String(view === page.name));
        button.title = page.about;
        button.onclick = () => setView(page.name);
        return button;
      });
      const groupTabs = visibleGroups().map(group => {
        const on = view === 'params' && active.has(group.name);
        const button = el('button', `term-tab${on ? ' active' : ''}`, group.name);
        button.type = 'button';
        button.setAttribute('aria-pressed', String(on));
        button.title = group.about;
        button.onclick = () => {
          if (view !== 'params') {
            if (root.classList.contains('open')) currentPage()?.hide?.();
            view = 'params';
            showPane();
          }
          setActive(new Set([group.name]));
        };
        return button;
      });
      tabs.replaceChildren(consoleTab, ...pageTabs, ...groupTabs);
    }

    function setActive(next) {
      active = next;
      storageCall('localStorage', 'setItem', `${name}:groups`, JSON.stringify([...active]));
      renderTabs();
      renderVars();
      notify();
      syncViz();
    }

    // The right side of a params tab: the project's picture, or what changed.
    // Only the showing tab's panel exists, and a picture draws only while it shows.
    const wide = matchMedia('(min-width: 761px)');
    let vizKey = null;
    let vizRaf = 0;
    let stopViz = () => {};
    function destroyViz() {
      cancelAnimationFrame(vizRaf);
      vizRaf = 0;
      stopViz();
      stopViz = () => {};
      vizBox.replaceChildren();
      vizKey = null;
    }
    function mountChanges(group) {
      const stop = store.subscribe((value, path) => {
        if (!path.startsWith(`${group.name}.`)) return;
        render();
      });
      function render() {
        const changed = group.controls.filter(control => !Object.is(store.control(control.path), control.default));
        if (!changed.length) {
          vizBox.textContent = 'nothing changed';
          return;
        }
        vizBox.replaceChildren(...changed.map(control => el(
          'div',
          'term-changes-line',
          `${control.key}  ${fmt(control, control.default)} → ${fmt(control, store.control(control.path))}`,
        )));
      }
      render();
      stopViz = () => stop();
    }
    function mountPicture(group) {
      const visual = visuals[group.name](vizBox);
      let last = 0;
      const loop = now => {
        vizRaf = requestAnimationFrame(loop);
        if (now - last < 66) return;
        last = now;
        visual.frame(now / 1000);
      };
      vizRaf = requestAnimationFrame(loop);
      stopViz = () => { visual.destroy?.(); };
    }
    function syncViz() {
      const group = view === 'params' ? store.groups.find(item => active.has(item.name)) : null;
      const showing = Boolean(root.classList.contains('open') && group && wide.matches);
      const next = !showing ? null : visuals[group.name] ? `visual:${group.name}` : `panel:${group.name}`;
      if (next === vizKey) return;
      destroyViz();
      if (!next) return;
      vizKey = next;
      if (next.startsWith('visual:')) mountPicture(group);
      else mountChanges(group);
    }
    wide.addEventListener('change', syncViz);

    function renderVars() {
      rows.clear();
      const groups = store.groups.filter(group => active.has(group.name));
      if (!groups.length) { varsBox.replaceChildren(el('div', 'term-empty', 'click a tab above')); return; }
      varsBox.replaceChildren(...groups.flatMap(group => group.controls.map(makeRow)));
    }

    function makeRow(control) {
      const row = el('div', 'term-row');
      row.dataset.path = control.path;
      row.setAttribute('role', 'listitem');
      if (control.about) row.title = control.about;
      const label = el('span', 'term-key', control.key);
      label.addEventListener('dblclick', () => { store.reset([control.path]); print(`reset ${control.path}`, 'dim'); });
      if (control.type === 'toggle') {
        const button = el('button', 'term-toggle');
        button.type = 'button';
        button.setAttribute('aria-label', control.path);
        button.onclick = () => {
          store.set(control.path, store.control(control.path) ? 0 : 1);
          print(`${control.path} = ${fmt(control, store.control(control.path))}`, 'dim');
        };
        row.append(label, button, el('span', 'term-value'), el('span', 'term-about', control.about));
        rows.set(control.path, { row, toggle: button, control });
        update(control.path);
        return row;
      }
      if (control.type === 'select' || control.type === 'text' || control.type === 'color') {
        const field = document.createElement(control.type === 'select' ? 'select' : 'input');
        if (control.type !== 'select') field.type = control.type === 'color' ? 'color' : 'text';
        field.setAttribute('aria-label', control.path);
        if (control.type === 'select') {
          for (const option of control.options) {
            const node = el('option', '', option);
            node.value = option;
            field.append(node);
          }
        }
        field.addEventListener('input', () => { store.set(control.path, field.value); });
        field.addEventListener('change', () => { store.set(control.path, field.value); });
        const value = el('span', 'term-value');
        row.append(label, field, value, el('span', 'term-about', control.about));
        rows.set(control.path, { row, field, value, control });
        update(control.path);
        return row;
      }
      const slider = el('span', 'term-bar');
      slider.append(el('span', 'term-fill'));
      slider.tabIndex = 0;
      slider.setAttribute('role', 'slider');
      slider.setAttribute('aria-label', control.path);
      slider.setAttribute('aria-valuemin', String(control.min));
      slider.setAttribute('aria-valuemax', String(control.max));
      const value = el('span', 'term-value');
      row.append(label, slider, value, el('span', 'term-about', control.about));
      rows.set(control.path, { row, slider, value, control });
      update(control.path);
      const fromPointer = event => {
        const rect = slider.getBoundingClientRect();
        const t = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
        store.set(control.path, control.min + t * (control.max - control.min));
      };
      slider.addEventListener('pointerdown', event => {
        slider.setPointerCapture(event.pointerId);
        fromPointer(event);
        slider.focus();
        const move = e => fromPointer(e);
        const up = () => {
          slider.removeEventListener('pointermove', move);
          slider.removeEventListener('pointerup', up);
          print(`set ${control.path} ${fmt(control, store.control(control.path))}`, 'dim');
        };
        slider.addEventListener('pointermove', move);
        slider.addEventListener('pointerup', up);
      });
      slider.addEventListener('keydown', event => {
        const big = event.shiftKey ? 10 : 1;
        const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[event.key];
        if (step) { event.preventDefault(); store.set(control.path, store.control(control.path) + step * control.step * big); }
        if (event.key === 'Backspace' || event.key === 'Delete') { event.preventDefault(); store.reset([control.path]); }
      });
      return row;
    }

    function update(path) {
      const row = rows.get(path);
      if (!row) return;
      const value = store.control(path);
      row.row.classList.toggle('changed', !Object.is(value, row.control.default));
      if (row.toggle) {
        row.toggle.textContent = value ? 'on' : 'off';
        row.toggle.setAttribute('aria-pressed', String(Boolean(value)));
        row.toggle.classList.toggle('off', !value);
        return;
      }
      if (row.field) {
        const shown = String(value);
        if (row.field.value !== shown) row.field.value = shown;
        row.value.textContent = fmt(row.control, value);
        return;
      }
      const span = (value - row.control.min) / (row.control.max - row.control.min) * 100;
      row.slider.firstChild.style.width = `${span}%`;
      row.slider.setAttribute('aria-valuenow', String(value));
      row.value.textContent = fmt(row.control, value);
    }
    const unsubscribe = store.subscribe((value, path) => update(path));

    function resolve(controlName) {
      if (!controlName) return null;
      if (store.byPath.has(controlName)) return store.byPath.get(controlName);
      for (const group of store.groups) {
        if (active.has(group.name) && store.byPath.has(`${group.name}.${controlName}`)) return store.byPath.get(`${group.name}.${controlName}`);
      }
      const matches = [...store.byPath.values()].filter(control => control.key === controlName);
      return matches.length === 1 ? matches[0] : null;
    }

    function listing(groupName) {
      const group = store.groups.find(group => group.name === groupName);
      if (!group) return `no group ${groupName}`;
      const width = Math.max(...group.controls.map(control => control.key.length));
      return [`# ${group.name}: ${group.about}`, ...group.controls.map(control => {
        const value = store.control(control.path);
        const shown = fmt(control, value);
        let range = '';
        if (control.type === 'number') range = `[${control.min}..${control.max}]`;
        else if (control.type === 'select') range = `[${control.options.join(' ')}]`;
        const note = Object.is(value, control.default) ? '' : ` (default ${fmt(control, control.default)})`;
        return `${control.key.padEnd(width)}  ${shown.padStart(6)}  ${range}${note}`;
      })].join('\n');
    }

    function applySet(parsed) {
      const { control, op, raw } = parsed;
      const result = coerce(control, op, raw, store.control(control.path));
      if (!result.ok) return print(result.message, 'err');
      if (!store.set(control.path, result.value)) return print(`${control.path}: invalid value: ${result.value}`, 'err');
      const applied = store.control(control.path);
      const clamped = control.type === 'number' && (result.value < control.min || result.value > control.max);
      print(`${control.path} = ${fmt(control, applied)}${clamped ? `  (clamped to ${control.min}..${control.max})` : ''}`);
    }

    function writeValues(entries) {
      let count = 0;
      for (const [path, value] of entries) {
        if (!store.byPath.has(path)) continue;
        if (store.set(path, value)) count++;
      }
      return count;
    }

    function downloadFile(fileName) {
      const data = { app: name, version: 1, saved: new Date().toISOString(), values: store.changed(), ...extras.get() };
      const stamp = data.saved.slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
      const safe = fileName ? String(fileName).replace(/[^\w.-]+/g, '-') : name;
      const file = `${safe}-${stamp}.json`;
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const link = el('a');
      link.href = url;
      link.download = file;
      shadow.append(link);
      link.click();
      link.remove();
      const timer = setTimeout(() => {
        pendingDownloads.delete(url);
        URL.revokeObjectURL(url);
      }, 1000);
      pendingDownloads.set(url, timer);
      print(`saved ${file}`);
    }

    function applyConfig(data) {
      const values = data?.values ?? data;
      if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('not a knobs config');
      const count = writeValues(Object.entries(values));
      extras.set(data);
      print(`loaded ${count} values${data.agent ? ` · agent ${data.agent}` : ''}${data.portal ? ` · portal ${data.portal}` : ''}`);
    }

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (!file) return;
      try { applyConfig(JSON.parse(await file.text())); }
      catch (error) { print(`load: ${error.message}`, 'err'); }
    });

    async function saveValues() {
      const values = store.changed();
      let response;
      try {
        response = await fetch('/__knobs/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ values }),
        });
      } catch (error) {
        print(String(error.message || error), 'err');
        return;
      }
      if (response.status === 404) {
        print('save needs the knobs Vite plugin; use export', 'err');
        return;
      }
      if (!response.ok) {
        let message = 'save failed';
        try {
          const body = await response.json();
          if (body && body.error) message = String(body.error);
        } catch { /* the failure was not JSON */ }
        print(message, 'err');
        return;
      }
      print(`saved ${Object.keys(values).length} values to knobs.values.json`);
    }

    const builtins = {
      help: () => print([
        'commands',
        '  ls [group]             list controls',
        '  <control> <value>      set a control',
        '  <toggle> [on|off]      flip or set a toggle',
        '  set <control> <value>  same as above; += and -= also work',
        '  get <control>          show a value and what it does',
        '  reset [control|group]  restore defaults',
        '  save                   write changed values to knobs.values.json',
        '  download [name]        download changed values as a JSON file',
        '  load                   load a saved configuration file',
        '  export                 print and copy values as JSON',
        '  import <json>          load values from JSON',
        '  on <group>             open a group\'s tab (or click it)',
        '  clear                  clear this log',
        '  close                  hide the drawer (or Esc)',
        ...Object.entries(commands).map(([command, spec]) => `  ${(command + ' ' + (spec.usage || '')).padEnd(22)} ${spec.about}`),
        'keys: ` toggles the drawer · Esc closes it · drag bars · arrows nudge (shift ×10) · double-click a name to reset',
      ].join('\n')),
      ls: ([groupName]) => {
        if (groupName) return print(listing(groupName));
        const names = [...active];
        print(names.length ? names.map(listing).join('\n') : 'no groups on');
      },
      get: ([controlName]) => {
        const control = resolve(controlName);
        if (!control) return print(`unknown control: ${controlName ?? ''}`, 'err');
        const value = store.control(control.path);
        const about = control.about ? `\n  ${control.about}` : '';
        print(`${control.path} = ${fmt(control, value)}  (default ${fmt(control, control.default)})${about}`);
      },
      reset: ([target]) => {
        if (!target || target === 'all') {
          store.reset();
          return print('reset every control to its default');
        }
        const group = store.groups.find(group => group.name === target);
        if (group) {
          store.reset(group.controls.map(control => control.path));
          return print(`reset ${target}`);
        }
        const control = resolve(target);
        if (!control) return print(`unknown control: ${target}`, 'err');
        store.reset([control.path]);
        print(`reset ${control.path}`);
      },
      save: () => saveValues(),
      download: ([fileName]) => downloadFile(fileName),
      load: () => fileInput.click(),
      export: () => {
        const json = JSON.stringify(store.changed(), null, 2);
        print(json);
        navigator.clipboard?.writeText(json).then(() => print('copied to clipboard', 'dim'), () => {});
      },
      import: (args, rest) => {
        try {
          const data = JSON.parse(rest);
          if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('not a knobs config');
          print(`imported ${writeValues(Object.entries(data))} values`);
        } catch (error) { print(`import: ${error.message}`, 'err'); }
      },
      on: ([groupName]) => {
        const group = store.groups.find(group => group.name === groupName);
        if (!group) return print(`no group ${groupName ?? ''}`, 'err');
        view = 'params';
        showPane();
        setActive(new Set([group.name]));
      },
      clear: () => log.replaceChildren(),
      close: () => toggle(false),
    };

    const slashActions = [
      { name: 'save', usage: '', about: 'write changed values to knobs.values.json' },
      { name: 'download', usage: '[name]', about: 'download changed values as a JSON file' },
      { name: 'load', usage: '', about: 'load a saved configuration file' },
      { name: 'reset', usage: '[control|group]', about: 'restore defaults' },
      ...Object.entries(commands).map(([command, spec]) => ({ name: command, usage: spec.usage || '', about: spec.about || '' })),
    ];
    let slashHits = [];
    let slashIndex = 0;
    function renderSlash() {
      const value = input.value;
      const open = value.startsWith('/') && !/\s/.test(value);
      slashHits = open ? slashActions.filter(action => action.name.startsWith(value.slice(1))) : [];
      slash.hidden = slashHits.length === 0;
      if (slash.hidden) return;
      slashIndex = Math.min(slashIndex, slashHits.length - 1);
      slash.style.bottom = `${root.querySelector('.term-prompt').offsetHeight + 4}px`;
      slash.replaceChildren(...slashHits.map((action, i) => {
        const item = el('div', `term-slash-item${i === slashIndex ? ' active' : ''}`);
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', String(i === slashIndex));
        item.append(el('span', 'term-slash-name', `/${action.name}`), el('span', 'term-slash-usage', action.usage), el('span', 'term-slash-about', action.about));
        item.addEventListener('mousedown', event => { event.preventDefault(); input.value = ''; renderSlash(); run(`/${action.name}`); });
        return item;
      }));
    }
    input.addEventListener('input', () => { slashIndex = 0; renderSlash(); });
    input.addEventListener('blur', () => { slash.hidden = true; });
    input.addEventListener('focus', renderSlash);

    const builtinNames = new Set(Object.keys(builtins));
    const commandNames = new Set(Object.keys(commands));

    function run(line) {
      const text = String(line).trim();
      if (!text) return;
      print(`$ ${text}`, 'cmd');
      history.push(text);
      historyIndex = history.length;
      const parsed = parseLine(line, { resolve, builtins: builtinNames, commands: commandNames });
      try {
        if (parsed.kind === 'empty') return;
        if (parsed.kind === 'error') return print(parsed.message, 'err');
        if (parsed.kind === 'builtin') return builtins[parsed.name](parsed.args, parsed.rest);
        if (parsed.kind === 'command') return print(commands[parsed.name].run(parsed.args) ?? '');
        if (parsed.kind === 'set') return applySet(parsed);
        print(`unknown command: ${parsed.head}  (try help)`, 'err');
      } catch (error) { print(String(error.message || error), 'err'); }
    }

    function complete() {
      const [head, ...rest] = input.value.split(/\s+/);
      const pool = rest.length
        ? [...store.byPath.keys(), ...[...store.byPath.values()].map(control => control.key), ...store.groups.map(group => group.name)]
        : ['set', ...builtinNames, ...commandNames, ...store.groups.flatMap(group => group.controls.map(control => active.has(group.name) ? control.key : control.path))];
      const word = rest.length ? rest[rest.length - 1] : head;
      const hits = [...new Set(pool)].filter(candidate => candidate.startsWith(word));
      if (hits.length === 1) {
        const words = input.value.split(/\s+/);
        words[words.length - 1] = hits[0];
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

    body.addEventListener('click', event => {
      if (view !== 'console' || event.target.closest('button, a, input, select, textarea, [role="option"]')) return;
      const selected = shadow.getSelection?.() ?? getSelection?.();
      if (String(selected ?? '').length) return;
      input.focus({ preventScroll: true });
    });

    function showView(pageName) {
      if (!root.classList.contains('open')) toggle(true);
      setView(pageName);
    }

    function toggle(open = !root.classList.contains('open')) {
      const was = root.classList.contains('open');
      root.classList.toggle('open', open);
      notify();
      storageCall('sessionStorage', 'setItem', `${name}:drawer`, open ? '1' : '0');
      clearTimeout(focusTimer);
      if (open && view === 'console') focusTimer = setTimeout(() => input.focus({ preventScroll: true }), 160);
      else if (shadow.activeElement) shadow.activeElement.blur();
      if (open && !was) currentPage()?.show?.();
      if (!open && was) currentPage()?.hide?.();
      syncViz();
    }
    root.querySelector('.term-close').addEventListener('click', () => toggle(false));

    function onKey(event) {
      if ((event.key === '`' || event.key === '~') && !event.ctrlKey && !event.metaKey) {
        if (isEditable(event)) return;
        event.preventDefault();
        if (event.key === '~') {
          if (root.classList.contains('open') && view === 'performance') toggle(false);
          else showView('performance');
        } else toggle();
      } else if (event.key === 'Escape' && root.classList.contains('open')) toggle(false);
    }
    window.addEventListener('keydown', onKey);

    const statusTimer = setInterval(() => {
      if (!root.classList.contains('open')) return;
      statusEl.textContent = status();
      currentPage()?.panel?.update?.();
    }, 250);

    showPane();
    renderTabs();
    renderVars();
    print(`${name} controls · type help, or / for actions · \` opens this drawer, Esc closes it`, 'dim');
    if (storageCall('sessionStorage', 'getItem', `${name}:drawer`) === '1') toggle(true);

    return function unmount() {
      clearInterval(statusTimer);
      clearTimeout(focusTimer);
      for (const [url, timer] of pendingDownloads) {
        clearTimeout(timer);
        URL.revokeObjectURL(url);
      }
      pendingDownloads.clear();
      window.removeEventListener('keydown', onKey);
      wide.removeEventListener('change', syncViz);
      destroyViz();
      for (const page of mounted) {
        page.hide?.();
        page.destroy?.();
      }
      unsubscribe();
      store.detach();
      host.remove();
    };
  } catch (error) {
    host.remove();
    throw error;
  }
}
