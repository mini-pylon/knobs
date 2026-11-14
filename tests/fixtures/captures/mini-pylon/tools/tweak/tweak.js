// Stand-in for mini-pylon's tools/tweak/tweak.js: the same storage keys under
// mini-pylon-tweak: (each value JSON), the same /api calls, and a drawer with
// the real one's classes: a console tab named mini-pylon, a tab per group and
// a renders tab. On load it renders a preview of every value, as the real one does.
(() => {
  'use strict';
  const STORE = 'mini-pylon-tweak:';
  const load = (key, fallback) => { try { const v = JSON.parse(localStorage.getItem(STORE + key)); return v ?? fallback; } catch { return fallback; } };
  const save = (key, value) => { try { localStorage.setItem(STORE + key, JSON.stringify(value)); } catch {} };
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  async function api(path, body) {
    const res = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data;
  }
  const img = document.querySelector('img.render');

  (async () => {
    const schema = await api('/api/schema');
    const values = {};
    for (const g of schema.groups) for (const v of g.vars) values[`${g.name}.${v.key}`] = v.default;
    for (const [path, value] of Object.entries(load('values', {}))) if (path in values) values[path] = value;
    save('values', values);
    let view = load('view', 'console');
    let group = load('group', schema.groups[0].name);

    const root = el('div', 'term');
    root.innerHTML = '<nav class="term-tabs"></nav><div class="term-vars"></div><div class="finals"></div>';
    document.body.append(root);
    const tabs = root.querySelector('.term-tabs');
    const varsBox = root.querySelector('.term-vars');
    const finalsBox = root.querySelector('.finals');
    function render() {
      const tab = (label, on, click) => { const b = el('button', `term-tab${on ? ' active' : ''}`, label); b.type = 'button'; b.onclick = click; return b; };
      tabs.replaceChildren(
        tab('mini-pylon', view === 'console', () => setView('console')),
        ...schema.groups.map(g => tab(g.name, view === 'params' && group === g.name, () => { group = g.name; save('group', group); setView('params'); })),
        tab('renders', view === 'renders', () => setView('renders')),
      );
      const g = schema.groups.find(x => x.name === group);
      varsBox.replaceChildren(...(view === 'params' && g ? g.vars.map(v => {
        const row = el('div', 'term-row');
        row.dataset.path = `${g.name}.${v.key}`;
        row.append(el('span', 'term-key', v.key), el('span', 'term-value', String(values[row.dataset.path])));
        return row;
      }) : []));
    }
    async function setView(next) {
      view = next;
      save('view', view);
      render();
      if (view !== 'renders') return;
      const finals = await api('/api/finals');
      finalsBox.replaceChildren(...finals.map(f => { const t = el('img'); t.src = f.url; t.alt = f.name; return t; }));
    }
    if (load('drawer', false)) root.classList.add('open');
    setView(view);

    const job = await api('/api/render', { kind: 'preview', values });
    for (;;) {
      const done = await api(`/api/jobs/${job.id}`);
      if (['done', 'failed', 'superseded'].includes(done.state)) {
        if (done.state === 'done') img.src = done.url;
        document.body.dataset.preview = `${done.state} ${done.size} ${done.seconds}`;
        break;
      }
      await new Promise(r => setTimeout(r, 250));
    }
  })().catch(error => { document.body.dataset.error = error.message; });
})();
