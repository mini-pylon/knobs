import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { App } from './app.js';

export const renderEarly = () => `<!doctype html><html><head><title>knobs ssr</title></head><body><div id="root">${renderToString(h(App))}</div><script type="module" src="/client-early.js"></script></body></html>`;
export { renderEarlyDocument } from './early-document.js';
