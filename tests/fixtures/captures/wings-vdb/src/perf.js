// Stand-in for wings-vdb's src/perf.js: an extra drawer page named perf.
export function perfPage() {
  return { name: 'perf', about: 'frame rate and shader cost', mount(el) { el.textContent = 'perf'; return {}; } };
}
