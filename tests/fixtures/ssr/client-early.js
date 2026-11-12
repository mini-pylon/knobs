// The saved value reaches the store before hydration, so the live value
// already differs from what the server rendered when React hydrates.
import { createElement as h } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { App } from './app.js';
import { knobs } from './controls.js';

window.__recoverable = [];
knobs.attach(localStorage, 'ssr:values');
window.__beforeHydration = knobs.control('hero.title');
hydrateRoot(document.getElementById('root'), h(App), {
  onRecoverableError: error => window.__recoverable.push(String(error?.message ?? error)),
});
