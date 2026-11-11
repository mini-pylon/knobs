import { defineControls } from 'knobs';
import values from './knobs.values.json';

export const knobs = defineControls([
  { name: 'hero', about: 'Homepage hero', controls: [
    { key: 'variant', type: 'select', value: 'split', options: ['split', 'full', 'stacked'] },
    { key: 'title', type: 'text', value: 'The original headline' },
    { key: 'overlay', type: 'number', value: 0.4, min: 0, max: 1, step: 0.01 },
    { key: 'badge', type: 'toggle', value: 1 },
    { key: 'accent', type: 'color', value: '#e8c547' },
  ] },
  { name: 'scene', about: 'Has a custom picture', controls: [
    { key: 'speed', type: 'number', value: 1, min: 0, max: 5, step: 0.5 },
  ] },
  { name: 'product', hidden: true, controls: [
    { key: 'price', type: 'number', value: 10, min: 0, max: 100, step: 1 },
  ] },
  { name: 'edge', hidden: true, about: 'A bound finer than its step', controls: [
    { key: 'bound', type: 'number', value: 0.25, min: 0.25, max: 0.75, step: 1 },
  ] },
], values);
export const { control, onControl } = knobs;
