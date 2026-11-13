// The controls file: the one place the schema is registered. Every read in
// the project is imported from here. Without React, leave out bindReact and
// useControl. In JavaScript, name it controls.js.
import { defineControls } from 'knobs';
import { bindReact } from 'knobs/react';
import values from '../knobs.values.json';

export const knobs = defineControls([
  // Group names are what the drawer's tabs show; keys are read as 'group.key'.
  { name: 'hero', about: 'Homepage hero', controls: [
    // Variant: the component's alternative layouts.
    { key: 'layout', type: 'select', value: 'split', options: ['split', 'full', 'stacked'] },
    // Copy: the default is the text the project has now.
    { key: 'title', type: 'text', value: 'The headline as it is today' },
    // Variables: numbers with a range, toggles as 1 or 0, colors as #rrggbb.
    { key: 'overlay', type: 'number', value: 0.4, min: 0, max: 1, step: 0.01 },
    { key: 'badge', type: 'toggle', value: 1 },
    { key: 'accent', type: 'color', value: '#e8c547' },
  ]},
  // An object's variables are a group whose controls are its fields.
  { name: 'product', about: 'The featured product', controls: [
    { key: 'price', type: 'number', value: 4.5, min: 0, max: 20, step: 0.25 },
  ]},
], values);

export const { control, onControl } = knobs;
export const useControl = bindReact(knobs);
