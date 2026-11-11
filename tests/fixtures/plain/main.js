import { canvasVisual, mountKnobs } from 'knobs';
import { knobs, control, onControl } from './controls.js';

// Accepting updates here means only the plugin can turn an edit into a full reload.
if (import.meta.hot) import.meta.hot.accept();

window.__boots = Number(sessionStorage.getItem('boots') ?? 0) + 1;
sessionStorage.setItem('boots', window.__boots);
const params = new URLSearchParams(location.search);
const paths = ['hero.variant', 'hero.title', 'hero.overlay', 'hero.badge', 'hero.accent'];
const show = path => { document.getElementById(`read-${path.replace('.', '-')}`).textContent = String(control(path)); };
for (const path of paths) { show(path); onControl(path, () => show(path)); }
onControl('hero.title', value => { document.getElementById('read-listener').textContent = value; });

window.__frames = 0;
const options = {
  name: 'fixture',
  commands: { ping: { usage: '[word]', about: 'answers pong', run: ([word]) => `pong ${word ?? ''}`.trim() } },
  status: () => { window.__statusCalls = (window.__statusCalls ?? 0) + 1; return 'status-ok'; },
  onFocus: state => {
    window.__focusCalls = (window.__focusCalls ?? 0) + 1;
    if (params.has('lateFail') && state.open) throw new Error('focus failed');
    window.__focus = state;
  },
  extras: { get: () => ({ extra: 'kept' }), set: data => { window.__extras = data.extra; } },
  visuals: {
    scene: canvasVisual('A test picture', () => pen => { window.__frames++; window.__pen = { fg: pen.fg, dim: pen.dim }; }),
  },
};
if (params.has('stats')) options.stats = () => ({ renderer: 'test renderer', scene: 'test scene' });
if (params.has('pages')) options.pages = [{ name: 'notes', label: 'my notes', about: 'a project page', mount(el) { el.textContent = 'page body'; return { update() { window.__pageUpdates = (window.__pageUpdates ?? 0) + 1; } }; } }];
if (params.has('broken')) options.pages = [{ name: 'bad', mount() { throw new Error('mount failed'); } }];
const mount = () => mountKnobs(knobs, options);
window.__unmount = mount();
window.__mount = () => { window.__unmount = mount(); };
