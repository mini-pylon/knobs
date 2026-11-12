import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { App, Document } from './app.js';

export const renderRoot = () => `<!doctype html><html><head><title>knobs ssr</title></head><body><div id="root">${renderToString(h(App))}</div><script type="module" src="/client-root.js"></script></body></html>`;
export const renderDocument = () => `<!doctype html>${renderToString(h(Document))}`;
