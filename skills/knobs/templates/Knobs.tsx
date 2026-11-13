// Mounts the drawer after hydration. Render <Knobs /> once near the root.
// Without React, call mountKnobs(knobs, { name }) after the page loads.
import { useEffect } from 'react';
import { mountKnobs } from 'knobs';
import { knobs } from './controls';

export function Knobs() {
  useEffect(() => mountKnobs(knobs, { name: 'PROJECT' }), []);
  return null;
}
