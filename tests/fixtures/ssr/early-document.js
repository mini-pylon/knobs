// The whole document hydrated, with a script that attaches the saved value first.
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { App } from './app.js';

export function EarlyDocument() {
  return h('html', null,
    h('head', null, h('title', null, 'knobs ssr')),
    h('body', null, h(App), h('script', { type: 'module', src: '/client-early-document.js' })));
}

export const renderEarlyDocument = () => `<!doctype html>${renderToString(h(EarlyDocument))}`;
