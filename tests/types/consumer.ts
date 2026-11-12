import { canvasVisual, defineControls, fit, mountKnobs } from 'knobs';
import { bindReact } from 'knobs/react';
import plugin from 'knobs/vite';

export const knobs = defineControls([
  { name: 'hero', about: 'Homepage hero', controls: [
    { key: 'variant', type: 'select', value: 'split', options: ['split', 'full'] },
    { key: 'title', type: 'text', value: 'Words' },
    { key: 'overlay', type: 'number', value: 0.4, min: 0, max: 1, step: 0.01 },
    { key: 'badge', type: 'toggle', value: 1 },
    { key: 'accent', type: 'color', value: '#e8c547' },
  ] },
  { name: 'hidden', hidden: true, controls: [] },
], {});
export const { control, onControl } = knobs;
export const useControl = bindReact(knobs);
export const read: string | number = control('hero.title');
export const stop: () => void = onControl('hero.title', value => { void value; });
export const unmount: () => void = mountKnobs(knobs, { name: 'x', status: () => 'ok', visuals: { hero: canvasVisual('x', () => () => {}) }, stats: () => ({ a: 1 }) });
export const point: number = fit([0, 1, 0, 1], 10, 0, 10).x(0);
export const vitePlugin = plugin({ controls: 'controls.ts', origins: ['https://a.test'] });

// @ts-expect-error a number control needs a range
defineControls([{ name: 'a', controls: [{ key: 'x', type: 'number', value: 1 }] }]);
// @ts-expect-error a select control needs options
defineControls([{ name: 'a', controls: [{ key: 'x', type: 'select', value: 'y' }] }]);
// @ts-expect-error mounting needs a name
mountKnobs(knobs, {});
// @ts-expect-error the plugin needs the controls path
plugin({});
