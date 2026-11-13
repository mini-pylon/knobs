// @ts-check
/** @type {import('knobs').Group[]} */
export const groups = [
  {
    name: 'hover',
    about: 'How a card responds to hover.',
    controls: [
      { key: 'lift', type: 'number', value: 8, min: 0, max: 16, step: 1, about: 'How far the card rises, in px.' },
      { key: 'scale', type: 'number', value: 1.06, min: 1, max: 1.2, step: 0.01, about: 'How much the card grows.' },
      { key: 'shadow', type: 'number', value: 18, min: 0, max: 40, step: 1, about: 'Shadow blur, in px.' },
      { key: 'tint', type: 'color', value: '#e2a15a', about: 'Fill of the hovered card.' },
    ],
  },
];

export const probe = 'hover.lift';
