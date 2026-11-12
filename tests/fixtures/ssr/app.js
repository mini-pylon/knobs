import { createElement as h, useEffect, useState } from 'react';
import { mountKnobs } from 'knobs';
import { knobs, useControl } from './controls.js';

export function App() {
  const title = useControl('hero.title');
  const [clicks, setClicks] = useState(0);
  useEffect(() => mountKnobs(knobs, { name: 'ssr' }), []);
  return h('main', null,
    h('h1', { id: 'title' }, title),
    h('button', { id: 'count', type: 'button', onClick: () => setClicks(n => n + 1) }, String(clicks)));
}

export function Document() {
  return h('html', null,
    h('head', null, h('title', null, 'knobs ssr')),
    h('body', null, h(App), h('script', { type: 'module', src: '/client-document.js' })));
}
