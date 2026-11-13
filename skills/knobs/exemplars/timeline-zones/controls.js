// @ts-check
/** @type {import('knobs').Group[]} */
export const groups = [
  {
    name: 'scroll',
    about: 'How paging through sections behaves.',
    controls: [
      { key: 'sections', type: 'number', value: 4, min: 2, max: 12, step: 1, about: 'How many sections the track holds.' },
      { key: 'snap', type: 'toggle', value: 1, about: 'Show a snap zone at each centre.' },
      { key: 'snapWidth', type: 'number', value: 0.4, min: 0, max: 1, step: 0.01, about: 'Zone width, as a fraction of a section.' },
      { key: 'glide', type: 'number', value: 800, min: 0, max: 2000, step: 10, about: 'How long the marker takes to reach a centre, in ms.' },
    ],
  },
];

export const probe = 'scroll.sections';
