// @ts-check
/** @type {import('knobs').Group[]} */
export const groups = [
  {
    name: 'look',
    about: 'The colors and spacing of the surface.',
    controls: [
      { key: 'background', type: 'color', value: '#f7f4ef', about: 'Page background.' },
      { key: 'accent', type: 'color', value: '#3d6b8c', about: 'Accent color.' },
      { key: 'radius', type: 'number', value: 6, min: 0, max: 32, step: 1, about: 'Corner radius, in px.' },
      { key: 'spacing', type: 'number', value: 12, min: 0, max: 48, step: 1, about: 'Space between parts, in px.' },
    ],
  },
  {
    name: 'quality',
    about: 'How finely the picture is drawn.',
    controls: [
      { key: 'resolution', type: 'number', value: 2, min: 1, max: 4, step: 1, about: 'Draw resolution.' },
      { key: 'samples', type: 'number', value: 8, min: 1, max: 64, step: 1, about: 'Samples per pixel.' },
    ],
  },
];
