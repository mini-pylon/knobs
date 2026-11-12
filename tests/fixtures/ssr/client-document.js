import { createElement as h } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { Document } from './app.js';

hydrateRoot(document, h(Document));
