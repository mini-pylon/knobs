// @ts-check
/** @type {import('knobs').Group[]} */
export const groups = [
  {
    name: 'scene',
    about: 'What an on-demand render draws.',
    controls: [
      { key: 'size', type: 'number', value: 48, min: 8, max: 96, step: 1, about: 'Size of each mark, in px.' },
      { key: 'count', type: 'number', value: 3, min: 1, max: 8, step: 1, about: 'How many marks to draw.' },
      { key: 'tint', type: 'color', value: '#7aa2c4', about: 'Color of the marks.' },
    ],
  },
];
