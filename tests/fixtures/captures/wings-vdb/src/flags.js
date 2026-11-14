// Stand-in for wings-vdb's src/flags.js: flags stored as JSON under
// wings-vdb:flags, read once on load.
export const FLAGS = ['waitlist'];
export const WAITLIST_URL = '#waitlist';
function stored() {
  try { return JSON.parse(localStorage.getItem('wings-vdb:flags') ?? '{}') ?? {}; } catch { return {}; }
}
export const flags = Object.fromEntries(FLAGS.map(name => [name, stored()[name] === true]));
