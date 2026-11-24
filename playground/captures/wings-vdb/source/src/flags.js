// Feature flags for the launch. Each flag is off unless the build turns it on
// (VITE_FLAGS=waitlist npm run build, names comma-separated) or this browser
// overrides it from the address bar: ?flag=waitlist turns it on, ?flag=-waitlist
// turns it off, ?flag=reset drops every override. Overrides stay in this
// browser's localStorage until reset, so a reload keeps them.
//
//   waitlist  the footer's ⌘K chat toggle becomes a "Join the waitlist" link,
//             and ⌘K no longer opens the chat.

export const FLAGS = ['waitlist'];
export const WAITLIST_URL = import.meta.env.VITE_WAITLIST_URL || '#waitlist';

const KEY = 'wings-vdb:flags';

function built() {
  const names = String(import.meta.env.VITE_FLAGS || '').split(',').map(s => s.trim());
  return Object.fromEntries(FLAGS.map(name => [name, names.includes(name)]));
}

function stored() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}

function fromAddress(overrides) {
  const asked = new URLSearchParams(location.search).getAll('flag');
  if (!asked.length) return overrides;
  let next = { ...overrides };
  for (const word of asked.flatMap(v => v.split(','))) {
    const name = word.trim().replace(/^-/, '');
    if (word.trim() === 'reset') next = {};
    else if (FLAGS.includes(name)) next[name] = !word.trim().startsWith('-');
  }
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  return next;
}

const overrides = fromAddress(stored());
export const flags = Object.fromEntries(
  Object.entries(built()).map(([name, on]) => [name, typeof overrides[name] === 'boolean' ? overrides[name] : on]),
);
