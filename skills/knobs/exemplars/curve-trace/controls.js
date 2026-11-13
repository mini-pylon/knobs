// @ts-check
/** @type {import('knobs').Group[]} */
export const groups = [
  {
    name: 'motion',
    about: 'How a panel eases in.',
    controls: [
      { key: 'duration', type: 'number', value: 800, min: 100, max: 2000, step: 10, about: 'How long the move takes, in ms.' },
      { key: 'ease', type: 'select', value: 'spring', options: ['linear', 'ease-out', 'spring'], about: 'Which easing the move follows.' },
      { key: 'overshoot', type: 'number', value: 0.25, min: 0, max: 0.5, step: 0.01, about: 'How far a spring passes 1, as a fraction.' },
      { key: 'delay', type: 'number', value: 0, min: 0, max: 1000, step: 10, about: 'Wait before the move starts, in ms.' },
    ],
  },
];

export const probe = 'motion.duration';
