// Seeds a captured project's own page through that page's storage keys, and
// maps a tab onto the other side. seedSource and openSourceTab name nothing
// outside their own bodies: page.evaluate sends the function text alone.
export const PREFIXES = ['wings-vdb:', 'mini-pylon-tweak:'];

export const SOURCES = {
  'wings-vdb': { console: 'wings-vdb', refuses: ['saving defaults'], fonts: true },
  'mini-pylon': { console: 'mini-pylon', refuses: ['finals'], fonts: false },
};

// Each project's source prefix, with its trailing slash, and the fonts-state
// path. The form without the slash is withoutTrailingSlash of this one.
export const SOURCE_MOUNTS = {
  'wings-vdb': { source: '/captures/wings-vdb/source/', fonts: '/captures/wings-vdb/fonts' },
  'mini-pylon': { source: '/captures/mini-pylon/source/', fonts: null },
};

export function withoutTrailingSlash(path) {
  return path.endsWith('/') ? path.slice(0, -1) : path;
}

export function sourceUrl(project) {
  const mount = SOURCE_MOUNTS[project];
  if (!mount) throw new Error(`no source side for ${project}`);
  return mount.source;
}

export function knobsConsole(project) {
  return `knobs-${project}`;
}

function visibleGroups(capture) {
  return (capture.groups ?? []).filter(group => !group.hidden).map(group => group.name);
}

// A tab the source page can show. perf is wings-vdb's page tab: the plan's
// seed keeps it, and omits the groups key so the page keeps its own view.
function knownSourceTab(project, capture, tab) {
  if (visibleGroups(capture).includes(tab)) return true;
  if (tab === SOURCES[project].console) return true;
  if (project === 'mini-pylon' && tab === 'renders') return true;
  if (project === 'wings-vdb' && tab === 'perf') return true;
  return false;
}

// A loaded source frame that is not the project's page. The snapshot 404 is
// JSON. A page still building its drawer (HTML, a script, no error JSON) is
// left for openSourceTab. Names nothing outside itself, so page.evaluate can
// carry it.
export function sourceDocumentError(doc = document) {
  const type = String(doc.contentType || '');
  const html = type === 'text/html' || type.startsWith('text/html;');
  if (html && doc.querySelector('.term')) return null;
  const raw = String(doc.body?.innerText ?? doc.documentElement?.textContent ?? '').trim();
  let quoted = '';
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(raw.slice(start, end + 1));
      if (parsed && typeof parsed.error === 'string') quoted = parsed.error;
    } catch { /* the body is not the snapshot's JSON */ }
  }
  if (html && doc.scripts?.length && !quoted) return null;
  if (quoted) return quoted;
  if (raw) return raw;
  return 'the source document is not the page';
}

export function defaultTab(capture) {
  const name = visibleGroups(capture)[0];
  if (!name) throw new Error('the capture has no visible group');
  return name;
}

export function sourceSeed(project, capture, setName, tab = defaultTab(capture)) {
  const source = SOURCES[project];
  if (!source) throw new Error(`no source side for ${project}`);
  const set = capture.valueSets?.[setName];
  if (!set) throw new Error(`unknown value set: ${setName}`);
  if (set.sourceValues == null) {
    throw new Error(`${project}: value set ${setName} has no sourceValues; run npm run playground:capture -- ${project}`);
  }
  if (!knownSourceTab(project, capture, tab)) throw new Error(`unknown tab: ${tab}`);
  const group = visibleGroups(capture).includes(tab);
  if (project === 'wings-vdb') {
    const local = { 'wings-vdb:params': JSON.stringify(set.sourceValues) };
    if (group) local['wings-vdb:groups'] = JSON.stringify([tab]);
    return { clear: PREFIXES, local, session: { 'wings-vdb:drawer': '1' } };
  }
  const view = group ? 'params' : tab === 'renders' ? 'renders' : 'console';
  const local = {
    'mini-pylon-tweak:values': JSON.stringify(set.sourceValues),
    'mini-pylon-tweak:view': JSON.stringify(view),
    'mini-pylon-tweak:drawer': 'true',
  };
  if (group) local['mini-pylon-tweak:group'] = JSON.stringify(tab);
  return { clear: PREFIXES, local, session: {} };
}

export function seedSource(seed, local = localStorage, session = sessionStorage) {
  const clear = storage => {
    for (let i = storage.length - 1; i >= 0; i--) {
      const key = storage.key(i);
      if (seed.clear.some(prefix => key.startsWith(prefix))) storage.removeItem(key);
    }
  };
  clear(local);
  clear(session);
  for (const [key, value] of Object.entries(seed.local)) local.setItem(key, value);
  for (const [key, value] of Object.entries(seed.session)) session.setItem(key, value);
}

export async function openSourceTab({ tab, timeout = 15000 } = {}, doc = document) {
  const start = Date.now();
  let clickedAt = -Infinity;
  for (;;) {
    const found = [...doc.querySelectorAll('.term-tabs .term-tab')].find(el => el.textContent.trim() === tab);
    if (found?.classList.contains('active') && doc.querySelector('.term.open')) return found;
    const now = Date.now();
    if (now - start >= timeout) {
      throw new Error(`the source drawer did not open on its ${tab} tab within ${timeout} ms`);
    }
    if (found && !found.classList.contains('active') && now - clickedAt >= 500) {
      found.click();
      clickedAt = now;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

export function otherSideTab(project, capture, tab, to) {
  if (tab == null) return null;
  if (visibleGroups(capture).includes(tab)) return tab;
  const source = SOURCES[project];
  if (source && to === 'source' && tab === knobsConsole(project)) return source.console;
  if (source && to === 'knobs' && tab === source.console) return knobsConsole(project);
  return null;
}
