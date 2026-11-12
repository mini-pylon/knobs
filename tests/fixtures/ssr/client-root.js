import { createElement as h, StrictMode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { App } from './app.js';
import { onControl } from './controls.js';

onControl('hero.title', value => { window.__heard = value; });
hydrateRoot(document.getElementById('root'), h(StrictMode, null, h(App)));
