// Mini Pylon tweak page: change any number of scene parameters, then render them all at
// once in Blender (tools/tweak_server.py). The drawer follows wings-vdb's terminal drawer.
(() => {
  'use strict';
  const STORE = 'mini-pylon-tweak:';
  const load = (key, fallback) => { try { const v = JSON.parse(localStorage.getItem(STORE + key)); return v ?? fallback; } catch { return fallback; } };
  const save = (key, value) => { try { localStorage.setItem(STORE + key, JSON.stringify(value)); } catch {} };
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const decimals = v => (String(v.step).split('.')[1] || '').length;
  const fmt = (v, value) => v.type === 'number' ? Number(value).toFixed(decimals(v)) : v.type === 'toggle' ? (value ? 'on' : 'off') : String(value);
  const same = (a, b) => a === b || (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 1e-9);

  const img = document.querySelector('#view img.render');
  const stateEl = document.getElementById('state');
  const renderBtn = document.getElementById('render-now');
  const finalBtn = document.getElementById('final-now');
  const historyEl = document.getElementById('history');

  let schema, vars = [], byPath = new Map(), defaults = {};
  let values = {};          // what the controls say now
  let rendered = null;      // the values of the last preview asked for
  let auto = load('auto', false);
  let autoTimer = 0;
  let previewJob = null;    // id of the newest preview in flight
  let history = load('history', []); // [{url, values, at}]
  let term;

  // --- values -----------------------------------------------------------------------
  function clamp(v, x) {
    if (v.type !== 'number') return x;
    const snapped = Math.round((x - v.min) / v.step) * v.step + v.min;
    return Number(Math.min(v.max, Math.max(v.min, snapped)).toFixed(decimals(v) + 2));
  }
  function setValue(path, x, quiet) {
    const v = byPath.get(path);
    if (!v) return false;
    let next = x;
    if (v.type === 'number') { next = Number(x); if (!Number.isFinite(next)) return false; next = clamp(v, next); }
    if (v.type === 'toggle') next = x ? 1 : 0;
    if (v.type === 'choice' && !v.choices.includes(x)) return false;
    if (v.type === 'color') { if (!/^#[0-9a-f]{6}$/i.test(x)) return false; next = x.toUpperCase(); }
    values[path] = next;
    save('values', values);
    term?.update(path);
    if (!quiet) changed();
    return true;
  }
  function pending() {
    if (!rendered) return [];
    return vars.filter(v => !same(values[v.path], rendered[v.path])).map(v => v.path);
  }
  function changed() {
    const n = pending().length;
    renderBtn.dataset.pending = String(n);
    renderBtn.textContent = n ? `render · ${n} change${n === 1 ? '' : 's'}` : 'render';
    for (const v of vars) term?.update(v.path);
    if (auto && n) { clearTimeout(autoTimer); autoTimer = setTimeout(renderPreview, 600); }
  }
  function nonDefault() {
    return Object.fromEntries(vars.filter(v => !same(values[v.path], defaults[v.path])).map(v => [v.path, values[v.path]]));
  }

  // --- rendering ----------------------------------------------------------------------
  async function api(path, body) {
    const res = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data;
  }
  async function poll(id, onUpdate) {
    for (;;) {
      const job = await api(`/api/jobs/${id}`);
      onUpdate?.(job);
      if (['done', 'failed', 'superseded'].includes(job.state)) return job;
      await new Promise(r => setTimeout(r, job.kind === 'final' ? 1000 : 250));
    }
  }
  function status(text, err) {
    stateEl.textContent = text;
    stateEl.classList.toggle('err', Boolean(err));
    term?.status(text);
  }
  async function renderPreview() {
    clearTimeout(autoTimer);
    const snapshot = { ...values };
    rendered = snapshot;
    changed();
    document.body.classList.add('rendering');
    status('rendering preview…');
    let job;
    try { job = await api('/api/render', { kind: 'preview', values: snapshot }); }
    catch (e) { document.body.classList.remove('rendering'); status(`render refused: ${e.message}`, true); term?.print(e.message, 'err'); return; }
    previewJob = job.id;
    const started = performance.now();
    const done = await poll(job.id, j => {
      if (previewJob !== job.id) return;
      const secs = ((performance.now() - started) / 1000).toFixed(1);
      status(j.state === 'queued' ? `waiting for ${j.ahead} render${j.ahead === 1 ? '' : 's'} ahead…` : `rendering preview… ${secs} s`);
    }).catch(e => ({ state: 'failed', error: e.message }));
    if (previewJob !== job.id) return;
    document.body.classList.remove('rendering');
    if (done.state === 'done') {
      show(done.url);
      addHistory(done.url, snapshot);
      status(`preview ${done.size} px · ${done.seconds?.toFixed?.(1) ?? done.seconds} s · ${Object.keys(nonDefault()).length} values off default`);
    } else if (done.state === 'failed') {
      status(`render failed: ${done.error}`, true);
      term?.print(`render failed: ${done.error}`, 'err');
    }
  }
  function show(url) {
    img.src = url;
    for (const b of historyEl.children) b.classList.toggle('showing', b.dataset.url === url);
  }
  function addHistory(url, snapshot) {
    history = [{ url, values: snapshot, at: Date.now() }, ...history.filter(h => h.url !== url)].slice(0, 24);
    save('history', history);
    drawHistory();
  }
  function drawHistory() {
    historyEl.replaceChildren(...history.map(h => {
      const b = el('button');
      b.type = 'button';
      b.dataset.url = h.url;
      b.title = `${new Date(h.at).toLocaleTimeString()} · click to see it again and take back its settings`;
      const t = el('img'); t.src = h.url; t.alt = ''; t.loading = 'lazy';
      t.onerror = () => { history = history.filter(x => x.url !== h.url); save('history', history); b.remove(); };
      b.append(t);
      b.onclick = () => {
        for (const v of vars) if (h.values[v.path] !== undefined) setValue(v.path, h.values[v.path], true);
        rendered = { ...h.values };
        show(h.url);
        changed();
        term?.print(`back to the preview from ${new Date(h.at).toLocaleTimeString()}`, 'dim');
      };
      b.classList.toggle('showing', img.getAttribute('src') === h.url);
      return b;
    }));
  }
  // A file name from the settings: surface and base, then up to four other values off
  // their defaults, in the drawer's order (the server adds date, time and size).
  function finalName() {
    const off = vars.filter(v => !v.path.startsWith('render.') && !['ground.surface', 'pylon.base'].includes(v.path)
      && !same(values[v.path], defaults[v.path]));
    const parts = [values['ground.surface'], values['pylon.base'], ...off.slice(0, 4).map(v => `${v.key} ${fmt(v, values[v.path])}`)];
    if (off.length > 4) parts.push(`+${off.length - 4} more`);
    return parts.join(' ');
  }
  async function renderFinal(size, name) {
    const snapshot = { ...values };
    let job;
    try { job = await api('/api/render', { kind: 'final', size, name, values: snapshot }); }
    catch (e) { term.print(`final refused: ${e.message}`, 'err'); return; }
    term.print(`queued final "${name || 'tweak'}" at ${size} px (${size === 2160 ? 'about 3 minutes' : 'about 45 s'}); the renders tab shows it`);
    term.renders.refresh();
    const done = await poll(job.id).catch(e => ({ state: 'lost', error: e.message }));
    if (done.state === 'done') term.print(`saved renders/hyperreal/tweaks/${done.url.split('/').pop()} in ${Math.round(done.seconds)} s`);
    else if (done.state === 'lost') {
      // The server restarted: the final's settings are on disk, and it renders again on its own.
      term.print(`lost touch with final "${name || 'tweak'}" (the server restarted); it is still queued and will render, see the renders tab`, 'err');
      status(`final "${name || 'tweak'}" restarted with the server; see the renders tab`, true);
    } else term.print(`final failed: ${done.error}`, 'err');
    term.renders.refresh();
  }

  // --- drawer -------------------------------------------------------------------------
  function mountDrawer() {
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
          <div class="term-console">
            <div class="term-log" aria-live="polite"></div>
            <input class="term-file" type="file" accept="application/json,.json">
            <label class="term-prompt"><span>mini-pylon $</span><input spellcheck="false" autocomplete="off" autocapitalize="off" aria-label="Command"></label>
          </div>
          <div class="term-params"><div class="term-vars" role="list"></div></div>
          <div class="term-page-renders"><div class="finals"></div></div>
        </div>
      </section>`;
    document.body.append(root);
    const strip = root.querySelector('.term-strip');
    const tabs = root.querySelector('.term-tabs');
    const varsBox = root.querySelector('.term-vars');
    const log = root.querySelector('.term-log');
    const input = root.querySelector('.term-prompt input');
    const statusEl = root.querySelector('.term-status');
    const fileInput = root.querySelector('.term-file');
    const finalsBox = root.querySelector('.finals');
    const panes = { console: root.querySelector('.term-console'), params: root.querySelector('.term-params'), renders: root.querySelector('.term-page-renders') };
    const groups = schema.groups.map(g => g.name);
    let view = load('view', 'console');
    let group = load('group', groups[0]);
    if (!groups.includes(group)) group = groups[0];
    const rows = new Map();
    const historyLines = [];
    let historyIndex = 0;

    function print(text, cls = '') {
      for (const line of String(text).split('\n')) log.append(el('div', `term-line ${cls}`, line || ' '));
      while (log.childElementCount > 400) log.firstChild.remove();
      log.scrollTop = log.scrollHeight;
    }
    function renderTabs() {
      const tab = (label, on, about, click) => {
        const b = el('button', `term-tab${on ? ' active' : ''}`, label);
        b.type = 'button'; b.title = about; b.setAttribute('aria-pressed', on); b.onclick = click;
        return b;
      };
      tabs.replaceChildren(
        tab('mini-pylon', view === 'console', 'console: type help', () => setView('console')),
        ...schema.groups.map(g => tab(g.name, view === 'params' && group === g.name, g.about, () => { group = g.name; save('group', group); setView('params'); })),
        tab('renders', view === 'renders', 'finals made with /render', () => setView('renders')),
      );
    }
    function setView(next) {
      view = next; save('view', view);
      for (const [name, pane] of Object.entries(panes)) pane.hidden = name !== view;
      if (view === 'params') renderVars();
      if (view === 'renders') refreshFinals();
      renderTabs();
      if (view === 'console' && root.classList.contains('open')) input.focus({ preventScroll: true });
    }
    function renderVars() {
      rows.clear();
      const g = schema.groups.find(x => x.name === group);
      varsBox.replaceChildren(el('div', 'term-group-about', `# ${g.name}: ${g.about}`), ...g.vars.map(v => makeRow(byPath.get(`${g.name}.${v.key}`))));
    }
    function makeRow(v) {
      const row = el('div', 'term-row');
      row.setAttribute('role', 'listitem');
      row.dataset.path = v.path;
      row.title = v.about;
      const name = el('span', 'term-key', v.key);
      name.addEventListener('dblclick', () => { setValue(v.path, defaults[v.path]); print(`reset ${v.path}`, 'dim'); });
      const value = el('span', 'term-value');
      const about = el('span', 'term-about', v.about);
      let control;
      if (v.type === 'number') {
        control = el('span', 'term-bar');
        control.append(el('span', 'term-fill'));
        control.tabIndex = 0;
        control.setAttribute('role', 'slider');
        control.setAttribute('aria-label', v.path);
        control.setAttribute('aria-valuemin', v.min);
        control.setAttribute('aria-valuemax', v.max);
        const fromPointer = e => {
          const r = control.getBoundingClientRect();
          const t = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
          setValue(v.path, v.min + t * (v.max - v.min));
        };
        control.addEventListener('pointerdown', e => {
          control.setPointerCapture(e.pointerId); fromPointer(e); control.focus();
          const move = ev => fromPointer(ev);
          const up = () => { control.removeEventListener('pointermove', move); control.removeEventListener('pointerup', up); print(`set ${v.path} ${fmt(v, values[v.path])}`, 'dim'); };
          control.addEventListener('pointermove', move);
          control.addEventListener('pointerup', up);
        });
        control.addEventListener('keydown', e => {
          const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
          if (step) { e.preventDefault(); e.stopPropagation(); setValue(v.path, values[v.path] + step * v.step * (e.shiftKey ? 10 : 1)); }
          if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); setValue(v.path, defaults[v.path]); }
        });
      } else if (v.type === 'toggle') {
        control = el('button', 'term-toggle');
        control.type = 'button';
        control.setAttribute('aria-label', v.path);
        control.onclick = () => { setValue(v.path, values[v.path] ? 0 : 1); print(`${v.path} = ${fmt(v, values[v.path])}`, 'dim'); };
      } else if (v.type === 'choice') {
        control = el('span', 'term-choices');
        for (const c of v.choices) {
          const b = el('button', 'term-choice', c);
          b.type = 'button';
          b.onclick = () => { setValue(v.path, c); print(`${v.path} = ${c}`, 'dim'); };
          control.append(b);
        }
      } else {
        control = el('span', 'term-color');
        const pick = el('input');
        pick.type = 'color';
        pick.setAttribute('aria-label', v.path);
        pick.addEventListener('input', () => setValue(v.path, pick.value));
        control.append(pick);
      }
      row.append(name, control, value, about);
      rows.set(v.path, { row, control, value, v });
      update(v.path);
      return row;
    }
    function update(path) {
      const r = rows.get(path);
      if (!r) return;
      const { v, control, value, row } = r;
      const x = values[path];
      row.classList.toggle('changed', !same(x, defaults[path]));
      row.classList.toggle('unrendered', Boolean(rendered) && !same(x, rendered[path]));
      value.textContent = fmt(v, x);
      if (v.type === 'number') {
        control.firstChild.style.width = `${(x - v.min) / (v.max - v.min) * 100}%`;
        control.setAttribute('aria-valuenow', x);
      } else if (v.type === 'toggle') {
        control.textContent = x ? 'on' : 'off';
        control.classList.toggle('off', !x);
        control.setAttribute('aria-pressed', Boolean(x));
        value.textContent = '';
      } else if (v.type === 'choice') {
        for (const b of control.children) { b.classList.toggle('active', b.textContent === x); b.setAttribute('aria-pressed', b.textContent === x); }
        value.textContent = '';
      } else {
        control.firstChild.value = x.toLowerCase();
      }
    }

    // Renders tab.
    // The server's list is the truth: finals queued, rendering, failed, or done. While any is
    // still to come, the tab checks again every few seconds.
    let finalsTimer = 0;
    async function refreshFinals() {
      clearTimeout(finalsTimer);
      let finals = [];
      try { finals = await api('/api/finals'); } catch (e) { print(`renders: ${e.message}`, 'err'); }
      if (finals.some(f => f.state === 'queued' || f.state === 'running')) finalsTimer = setTimeout(refreshFinals, 3000);
      const cards = [
        ...finals.map(f => {
          if (f.state !== 'done') {
            const c = el('div', `final ${f.state === 'failed' ? 'failed' : 'queued'}`);
            const what = { queued: 'queued', running: 'rendering…', failed: `failed: ${f.error || 'unknown error'}` }[f.state] || f.state;
            c.append(el('span', 'final-name', f.name || 'tweak'), el('span', 'final-meta', `${f.size} px · ${what}`));
            return c;
          }
          const c = el('div', 'final');
          const a = el('a'); a.href = f.url; a.target = '_blank'; a.rel = 'noopener';
          const t = el('img'); t.src = f.url; t.alt = f.name; t.loading = 'lazy'; a.append(t);
          const actions = el('span', 'final-actions');
          const openLink = el('a', '', 'open'); openLink.href = f.url; openLink.target = '_blank'; openLink.rel = 'noopener';
          const take = el('button', '', 'load settings'); take.type = 'button';
          take.onclick = () => { applyValues(f.values, `settings of "${f.name}"`); };
          actions.append(openLink, take);
          c.append(a, el('span', 'final-name', f.name), el('span', 'final-meta', `${f.size} px · ${(f.rendered || '').replace('T', ' ').slice(0, 16)}`), actions);
          return c;
        }),
      ];
      finalsBox.replaceChildren(...(cards.length ? cards : [el('div', 'term-group-about', 'no finals yet: type /render 2160 <name> in the console')]));
    }

    function applyValues(obj, label) {
      let n = 0;
      for (const v of vars) {
        const x = obj[v.path] ?? defaults[v.path];
        if (!same(values[v.path], x) && setValue(v.path, x, true)) n++;
      }
      changed();
      print(`${label}: ${n} value${n === 1 ? '' : 's'} changed; press render (r) to see them`);
    }
    function resolve(name) {
      if (!name) return null;
      if (byPath.has(name)) return byPath.get(name);
      const inGroup = byPath.get(`${group}.${name}`);
      if (view === 'params' && inGroup) return inGroup;
      const hits = vars.filter(v => v.key === name);
      return hits.length === 1 ? hits[0] : null;
    }
    function listing(gname) {
      const g = schema.groups.find(x => x.name === gname);
      if (!g) return `no group ${gname}`;
      const w = Math.max(...g.vars.map(v => v.key.length));
      return [`# ${g.name}: ${g.about}`, ...g.vars.map(gv => {
        const v = byPath.get(`${g.name}.${gv.key}`);
        const x = values[v.path];
        const range = v.type === 'number' ? `[${v.min}..${v.max}]` : v.type === 'choice' ? `[${v.choices.join('|')}]` : '';
        return `${v.key.padEnd(w)}  ${fmt(v, x).padStart(8)}  ${range}${same(x, defaults[v.path]) ? '' : `  (default ${fmt(v, defaults[v.path])})`}`;
      })].join('\n');
    }
    function setCommand(args) {
      let [name, op, ...rest] = args;
      let raw = rest.join(' ');
      if (!rest.length) { raw = op; op = '='; }
      const v = resolve(name);
      if (!v) return print(`unknown variable: ${name ?? ''}  (try ls)`, 'err');
      if (v.type === 'toggle' && raw === undefined) raw = values[v.path] ? 'off' : 'on';
      let x = raw;
      if (v.type === 'number' || v.type === 'toggle') {
        const words = { on: 1, off: 0, true: 1, false: 0, yes: 1, no: 0 };
        x = raw in words ? words[raw] : Number(raw);
        if (!Number.isFinite(x)) return print(`not a number: ${raw}`, 'err');
        if (op === '+=') x = values[v.path] + x;
        if (op === '-=') x = values[v.path] - x;
      }
      if (!setValue(v.path, x)) return print(`${v.path}: ${raw} is not ${v.type === 'choice' ? `one of ${v.choices.join(', ')}` : `a ${v.type}`}`, 'err');
      const applied = values[v.path];
      print(`${v.path} = ${fmt(v, applied)}${v.type === 'number' && !same(applied, x) ? `  (clamped to ${v.min}..${v.max} step ${v.step})` : ''}`);
    }
    function saveConfig(name) {
      const data = { app: 'mini-pylon-tweak', version: 1, saved: new Date().toISOString(), values: nonDefault() };
      const stamp = data.saved.slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
      const file = `${name ? name.replace(/[^\w.-]+/g, '-') : 'mini-pylon-scene'}-${stamp}.json`;
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = el('a'); a.href = url; a.download = file; document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      print(`saved ${file} (works with render_hyperreal.py --config)`);
    }
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (!file) return;
      try { const data = JSON.parse(await file.text()); applyValues(data.values ?? data, `loaded ${file.name}`); }
      catch (e) { print(`load: ${e.message}`, 'err'); }
    });

    const builtins = {
      help: () => print([
        'commands',
        '  ls [group]               list variables (the active tab\'s, or a group)',
        '  <var> <value>            set a variable: lens 50, ground.surface studio, body #FF6A13',
        '  set <var> <value>        same; += and -= work too: haze += 1',
        '  get <var>                show a value and what it does',
        '  reset [var|group|all]    back to defaults',
        '  preset [name]            list presets, or apply one: preset dusk',
        '  render                   render a preview of every change at once (or r, or the button)',
        '  /render [1080|2160] [name]  queue a full-quality final; the renders tab lists it',
        '  auto [on|off]            render a preview by itself after each change (default off)',
        '  save [name] / load       download or load the settings as JSON (render_hyperreal.py --config)',
        '  export / import <json>   print and copy the settings / set them from JSON',
        '  on <group>               open a group\'s tab',
        '  clear · close',
        'keys: ` toggles the drawer · r renders · drag bars · arrows nudge (shift ×10) · double-click a name to reset',
      ].join('\n')),
      ls: ([g]) => {
        if (g) return print(listing(g));
        if (view === 'params') return print(listing(group));
        print(schema.groups.map(x => listing(x.name)).join('\n'));
      },
      get: ([name]) => {
        const v = resolve(name);
        if (!v) return print(`unknown variable: ${name ?? ''}`, 'err');
        const range = v.type === 'number' ? `range ${v.min}..${v.max}` : v.type === 'choice' ? `one of ${v.choices.join(', ')}` : v.type;
        print(`${v.path} = ${fmt(v, values[v.path])}  (default ${fmt(v, defaults[v.path])}, ${range})\n  ${v.about}`);
      },
      set: args => setCommand(args),
      reset: ([target]) => {
        if (!target || target === 'all') { for (const v of vars) setValue(v.path, defaults[v.path], true); changed(); return print('reset every variable to its default'); }
        const g = schema.groups.find(x => x.name === target);
        if (g) { for (const v of vars.filter(x => x.path.startsWith(`${target}.`))) setValue(v.path, defaults[v.path], true); changed(); return print(`reset ${target}`); }
        const v = resolve(target);
        if (!v) return print(`unknown: ${target}`, 'err');
        setValue(v.path, defaults[v.path]); print(`reset ${v.path} → ${fmt(v, defaults[v.path])}`);
      },
      preset: ([name]) => {
        if (!name) return print(Object.entries(schema.presets).map(([k, p]) => `${k.padEnd(10)}  ${p.about}`).join('\n'));
        const p = schema.presets[name];
        if (!p) return print(`no preset ${name}  (type preset to list them)`, 'err');
        // A preset sets the scene, not the preview quality.
        const keep = Object.fromEntries(vars.filter(v => v.path.startsWith('render.')).map(v => [v.path, values[v.path]]));
        applyValues({ ...p.values, ...keep }, `preset ${name}`);
      },
      render: () => renderPreview(),
      auto: ([w]) => {
        auto = w === undefined ? !auto : ['on', '1', 'true', 'yes'].includes(w);
        save('auto', auto);
        print(`auto render ${auto ? 'on: each change renders after a short pause' : 'off: press render (r) when ready'}`);
        if (auto) changed();
      },
      save: ([name]) => saveConfig(name),
      load: () => fileInput.click(),
      export: () => {
        const json = JSON.stringify(nonDefault(), null, 2);
        print(json);
        navigator.clipboard?.writeText(json).then(() => print('copied to clipboard', 'dim'), () => {});
      },
      import: args => {
        try { applyValues(JSON.parse(args.join(' ')), 'imported'); } catch (e) { print(`import: ${e.message}`, 'err'); }
      },
      on: ([name]) => { if (!groups.includes(name)) return print(`no group ${name ?? ''}`, 'err'); group = name; save('group', group); setView('params'); },
      clear: () => log.replaceChildren(),
      close: () => toggle(false),
      exit: () => toggle(false),
    };
    const slash = {
      render: ([size, ...name]) => {
        let px = Number(size);
        if (!size || !Number.isFinite(px)) { if (size) name.unshift(size); px = 2160; }
        if (![1080, 2160].includes(px)) return print('final size is 1080 or 2160', 'err');
        renderFinal(px, name.join(' '));
      },
      save: args => builtins.save(args),
      load: () => builtins.load(),
      reset: args => builtins.reset(args),
    };

    function run(line) {
      const text = line.trim();
      if (!text) return;
      print(`$ ${text}`, 'cmd');
      historyLines.push(text); historyIndex = historyLines.length;
      const isSlash = text.startsWith('/');
      const normalized = text.replace(/^\//, '').replace(/\s*(\+=|-=)\s*/, ' $1 ');
      const [head, ...rest] = normalized.split(/\s+/);
      try {
        if (isSlash && slash[head]) return slash[head](rest);
        if (builtins[head]) return builtins[head](rest);
        if (resolve(head)) return setCommand([head, ...rest]);
        print(`unknown command: ${head}  (try help)`, 'err');
      } catch (e) { print(String(e.message || e), 'err'); }
    }
    function complete() {
      const words = input.value.split(/\s+/);
      const word = words[words.length - 1];
      const pool = words.length > 1
        ? [...byPath.keys(), ...vars.map(v => v.key), ...groups, ...Object.keys(schema.presets), ...vars.flatMap(v => v.choices || [])]
        : [...Object.keys(builtins), ...vars.map(v => v.path), ...vars.map(v => v.key)];
      const hits = [...new Set(pool)].filter(c => c.startsWith(word));
      if (hits.length === 1) { words[words.length - 1] = hits[0]; input.value = words.join(' ') + ' '; }
      else if (hits.length > 1) print(hits.join('  '), 'dim');
    }
    input.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') { run(input.value); input.value = ''; }
      else if (e.key === 'Tab') { e.preventDefault(); complete(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); historyIndex = Math.max(0, historyIndex - 1); input.value = historyLines[historyIndex] ?? ''; }
      else if (e.key === 'ArrowDown') { e.preventDefault(); historyIndex = Math.min(historyLines.length, historyIndex + 1); input.value = historyLines[historyIndex] ?? ''; }
      else if (e.key === 'Escape') toggle(false);
      else if (e.key === '`') { e.preventDefault(); toggle(false); }
    });
    root.querySelector('.term-body').addEventListener('click', e => {
      if (view !== 'console' || e.target.closest('button, a, input')) return;
      if (String(getSelection?.() ?? '').length) return;
      input.focus({ preventScroll: true });
    });

    function toggle(open = !root.classList.contains('open')) {
      root.classList.toggle('open', open);
      strip.setAttribute('aria-expanded', open);
      document.body.classList.toggle('term-open', open);
      save('drawer', open);
      if (open && view === 'console') setTimeout(() => input.focus({ preventScroll: true }), 160);
      else if (root.contains(document.activeElement)) document.activeElement.blur();
    }
    strip.addEventListener('click', () => toggle());
    root.querySelector('.term-close').addEventListener('click', () => toggle(false));

    setView(view);
    print('mini-pylon tweak · change as many values as you like, then render (r) · type help · ` toggles this drawer', 'dim');
    if (load('drawer', false)) toggle(true);
    return { print, update, toggle, status: t => { statusEl.textContent = t; }, renders: { refresh: refreshFinals } };
  }

  // --- start --------------------------------------------------------------------------
  addEventListener('keydown', e => {
    if (e.target.closest?.('input, textarea')) return;
    if (e.key === '`' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); term?.toggle(); }
    else if (e.key === 'Escape') term?.toggle(false);
    else if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); renderPreview(); }
  });
  renderBtn.addEventListener('click', () => renderPreview());
  finalBtn.addEventListener('click', () => {
    if (!term) return;
    renderFinal(2160, finalName());
    finalBtn.textContent = 'queued ✓';
    setTimeout(() => { finalBtn.textContent = 'final 2160'; }, 1500);
  });

  (async () => {
    try { schema = await api('/api/schema'); }
    catch (e) { status(`cannot reach the tweak server: ${e.message}`, true); return; }
    for (const g of schema.groups) for (const v of g.vars) {
      const full = { ...v, path: `${g.name}.${v.key}` };
      vars.push(full); byPath.set(full.path, full); defaults[full.path] = v.default;
    }
    const stored = load('values', {});
    values = { ...defaults };
    for (const [path, x] of Object.entries(stored)) if (byPath.has(path)) setValue(path, x, true);
    save('values', values);
    term = mountDrawer();
    drawHistory();
    renderPreview();
  })();
})();
