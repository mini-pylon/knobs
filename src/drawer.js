// The control drawer. Task 4 is the shell and the rows. The prompt, keys
// beyond backtick, storage and the instrument side come in later tasks.
import { stepDecimals } from './store.js';
import { css } from './style.js';

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};

// Strings stay as typed. Numbers take their decimals from the step, and
// toFixed throws past 100 so a finer step is shown as the stored number.
function fmt(control, value) {
  if (control.type === 'toggle') return value ? 'on' : 'off';
  if (typeof value !== 'number') return String(value);
  const decimals = stepDecimals(control.step);
  if (decimals > 100) return String(value);
  return value.toFixed(decimals);
}

export function mountKnobs(store, options = {}) {
  if (typeof window === 'undefined') throw new Error('knobs: mountKnobs needs a browser');
  const { name } = options;
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

  const tabs = root.querySelector('.term-tabs');
  const varsBox = root.querySelector('.term-vars');
  const log = root.querySelector('.term-log');
  const body = root.querySelector('.term-body');
  const panes = { console: root.querySelector('.term-console'), params: root.querySelector('.term-params') };
  root.querySelector('.term-prompt span').textContent = `${name} $`;

  const visibleGroups = () => store.groups.filter(group => !group.hidden);
  let active = new Set(visibleGroups()[0] ? [visibleGroups()[0].name] : []);
  let view = 'console';
  const rows = new Map();

  function print(text, cls = '') {
    for (const line of String(text).split('\n')) log.append(el('div', `term-line ${cls}`, line || ' '));
    while (log.childElementCount > 400) log.firstChild.remove();
    log.scrollTop = log.scrollHeight;
  }

  function showPane() {
    root.dataset.view = view;
    for (const [pane, node] of Object.entries(panes)) node.hidden = pane !== view;
  }

  function renderTabs() {
    const consoleTab = el('button', `term-tab${view === 'console' ? ' active' : ''}`, name);
    consoleTab.type = 'button';
    consoleTab.setAttribute('aria-pressed', String(view === 'console'));
    consoleTab.title = 'console: type help, or / for actions';
    consoleTab.onclick = () => { view = 'console'; showPane(); renderTabs(); };
    const groupTabs = visibleGroups().map(group => {
      const on = view === 'params' && active.has(group.name);
      const button = el('button', `term-tab${on ? ' active' : ''}`, group.name);
      button.type = 'button';
      button.setAttribute('aria-pressed', String(on));
      button.title = group.about;
      button.onclick = () => {
        view = 'params';
        active = new Set([group.name]);
        showPane();
        renderTabs();
        renderVars();
      };
      return button;
    });
    tabs.replaceChildren(consoleTab, ...groupTabs);
  }

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
  store.subscribe((value, path) => update(path));

  function toggle(open = !root.classList.contains('open')) {
    root.classList.toggle('open', open);
  }
  root.querySelector('.term-close').addEventListener('click', () => toggle(false));
  window.addEventListener('keydown', event => {
    if (event.key === '`') { event.preventDefault(); toggle(); }
  });

  showPane();
  renderTabs();
  renderVars();
  // Task 5 replaces this with real teardown.
  return () => {};
}
