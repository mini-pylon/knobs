// Declarations that must match what the runtime really builds and calls.
import { defineControls, mountKnobs } from 'knobs';
import type { PagePanel } from 'knobs';

const knobs = defineControls([
  { name: 'hero', controls: [
    { key: 'overlay', type: 'number', value: 0.4, min: 0, max: 1, step: 0.01 },
    { key: 'variant', type: 'select', value: 'split', options: ['split', 'full'] },
  ] },
]);

// A built control narrows on its type, as the store always sets the range and options.
const built = knobs.byPath.get('hero.overlay');
if (built?.type === 'number') {
  const range: [number, number, number, number] = [built.min, built.max, built.step, built.default];
  void range;
}
for (const control of knobs.groups[0].controls) {
  if (control.type === 'select') {
    const options: readonly string[] = control.options;
    const fallback: string = control.default;
    void options; void fallback;
  }
}
// @ts-expect-error a built group is frozen
knobs.groups[0].hidden = true;
if (built) {
  // @ts-expect-error a built control is frozen
  built.path = 'elsewhere';
}

// The drawer never calls a panel's destroy; teardown belongs to the page's own destroy.
// @ts-expect-error a panel has no destroy hook
const panel: PagePanel = { update() {}, destroy() {} };
mountKnobs(knobs, { name: 'x', pages: [{ name: 'p', mount: () => panel, destroy() {} }] });
