// @ts-check

/**
 * @typedef {{ about: string, values: Record<string, import('knobs').Value> }} Preset
 */

// `quality` is the kept group: no preset names one of its paths, so applying
// a preset leaves that group as the user set it. To keep a different group,
// leave every path of that group out of the presets below.
/** @type {Record<string, Preset>} */
export const presets = {
  dusk: {
    about: 'Dark surfaces with a warm accent.',
    values: {
      'look.background': '#1c1916',
      'look.accent': '#e0a15a',
      'look.radius': 10,
    },
  },
  airy: {
    about: 'Light surfaces with wide spacing.',
    values: {
      'look.background': '#fbfaf7',
      'look.accent': '#2f6f62',
      'look.spacing': 28,
    },
  },
};

/**
 * @param {import('knobs').Store} store
 * @returns {{ commands: { preset: import('knobs').Command } }}
 */
export default function presetsExtension(store) {
  return {
    commands: {
      preset: {
        usage: '[name]',
        about: 'List the presets, or apply one by name.',
        /**
         * @param {readonly string[]} args
         * @returns {string}
         */
        run(args) {
          const name = args[0];
          if (!name) {
            return Object.entries(presets).map(([key, preset]) => `${key}  ${preset.about}`).join('\n');
          }
          const preset = presets[name];
          if (!preset) {
            throw new Error(`unknown preset: ${name} (known: ${Object.keys(presets).join(', ')})`);
          }
          const paths = Object.keys(preset.values);
          for (const path of paths) store.set(path, preset.values[path]);
          return `applied ${name}: ${paths.join(', ')}`;
        },
      },
    },
  };
}
