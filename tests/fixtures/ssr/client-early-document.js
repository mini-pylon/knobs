// As client-early.js, but hydrating the whole document.
import { createElement as h } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { EarlyDocument } from './early-document.js';
import { knobs } from './controls.js';

window.__recoverable = [];
knobs.attach(localStorage, 'ssr:values');
window.__beforeHydration = knobs.control('hero.title');
hydrateRoot(document, h(EarlyDocument), {
  onRecoverableError: error => window.__recoverable.push(String(error?.message ?? error)),
});
