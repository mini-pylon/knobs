// @ts-check
/** @type {import('knobs').Group[]} */
export const groups = [
  {
    name: 'light',
    about: 'Where a light sits around a point.',
    controls: [
      { key: 'azimuth', type: 'number', value: 135, min: 0, max: 360, step: 1, about: 'Direction around the point, in degrees.' },
      { key: 'elevation', type: 'number', value: 40, min: 0, max: 90, step: 1, about: 'Height of the light, in degrees.' },
      { key: 'intensity', type: 'number', value: 0.8, min: 0, max: 1, step: 0.01, about: 'How bright the light is, as a fraction.' },
      { key: 'color', type: 'color', value: '#f0c27a', about: 'Colour of the light.' },
    ],
  },
];

export const probe = 'light.azimuth';
