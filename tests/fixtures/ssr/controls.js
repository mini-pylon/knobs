import { defineControls } from 'knobs';
import { bindReact } from 'knobs/react';
import values from './knobs.values.json';

export const knobs = defineControls([
  { name: 'hero', controls: [
    { key: 'title', type: 'text', value: 'The original headline' },
    { key: 'badge', type: 'toggle', value: 1 },
  ] },
], values);
export const { control, onControl } = knobs;
export const useControl = bindReact(knobs);
