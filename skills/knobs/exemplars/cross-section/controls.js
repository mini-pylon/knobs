// @ts-check
/** @type {import('knobs').Group[]} */
export const groups = [
  {
    name: 'edge',
    about: 'How a soft edge falls off.',
    controls: [
      { key: 'radius', type: 'number', value: 32, min: 8, max: 56, step: 1, about: 'Distance from the centre to the edge, in px.' },
      { key: 'softness', type: 'number', value: 8, min: 1, max: 24, step: 1, about: 'Width of the falloff, in px.' },
      { key: 'noise', type: 'number', value: 0.1, min: 0, max: 0.5, step: 0.01, about: 'Density noise, as a fraction.' },
    ],
  },
];

export const probe = 'edge.radius';
