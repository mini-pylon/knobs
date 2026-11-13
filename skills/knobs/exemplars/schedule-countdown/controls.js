// @ts-check
/** @type {import('knobs').Group[]} */
export const groups = [
  {
    name: 'spawn',
    about: 'How often something appears.',
    controls: [
      { key: 'interval', type: 'number', value: 12, min: 4, max: 48, step: 1, about: 'Time between spawns, in seconds.' },
      { key: 'jitter', type: 'number', value: 2.5, min: 0, max: 3, step: 0.1, about: 'How far a spawn can shift, in seconds.' },
      { key: 'burst', type: 'number', value: 2, min: 1, max: 5, step: 1, about: 'How many ticks stack at one spawn.' },
    ],
  },
];

export const probe = 'spawn.interval';
