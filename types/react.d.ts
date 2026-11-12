import type { Store, Value } from './index.js';

export function bindReact(store: Store): (path: string) => Value;
