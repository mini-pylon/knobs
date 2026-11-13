// What the stage can mount, by the `s` query parameter:
//   exemplar:<name>  an exemplar from skills/knobs/exemplars, with its picture or extension
//   draft:<name>     a draft from the drafts folder (server.mjs), shaped like an exemplar
//   capture:<name>   a project's own drawer from the captures folder (capture.mjs);
//                    `set` names the value set it mounts with (defaults)
//   stress           every control type, at the edges of what each takes
//   random:<seed>    a seeded random schema (random.js); `g` sets the group count
//   json             a schema the shell put in sessionStorage (the source pane's editor)
// Each resolves to { groups, values?, capture?, options? }: values are file
// values for defineControls, and options are mountKnobs options (visuals,
// pages, commands, status) besides the name.
import { randomSchema } from './random.js';

export const JSON_KEY = 'knobs-playground:json';

// A folder's loaders by `<name>/<controls|visual|extension>`, and its names.
function folders(globbed) {
  const files = {};
  for (const [key, load] of Object.entries(globbed)) {
    const match = key.match(/([^/]+)\/(controls|visual|extension)\.js$/);
    if (match) files[`${match[1]}/${match[2]}`] = load;
  }
  const names = [...new Set(Object.keys(files).filter(k => k.endsWith('/controls')).map(k => k.split('/')[0]))].sort();
  return { files, names };
}
const exemplars = folders(import.meta.glob('../skills/knobs/exemplars/*/*.js'));
const drafts = folders(import.meta.glob('@drafts/*/*.js'));
export const exemplarNames = exemplars.names;
export const draftNames = drafts.names;

// Every capture.json by project name, and the URL of each shot beside it.
const captureFiles = import.meta.glob('@captures/*/capture.json', { eager: true, import: 'default' });
const shotUrls = import.meta.glob('@captures/*/shots/*.png', { eager: true, query: '?url', import: 'default' });
const captures = {};
for (const [key, capture] of Object.entries(captureFiles)) captures[key.split('/').at(-2)] = { key, capture };
export const captureNames = Object.keys(captures).sort();

function capture(name, set) {
  const found = captures[name];
  if (!found) throw new Error(`unknown capture: ${name}`);
  const { capture: data, key } = found;
  const valueSet = data.valueSets[set];
  if (!valueSet) throw new Error(`unknown value set: ${set}`);
  const folder = key.slice(0, -'capture.json'.length);
  const shots = data.shots.map(shot => ({ ...shot, url: shotUrls[folder + shot.file] }));
  return { groups: data.groups, values: valueSet.values, capture: { ...data, name, set, shots } };
}

export const stress = [
  { name: 'numbers', about: 'Ranges and steps at their edges', controls: [
    { key: 'plain', type: 'number', value: 0.4, min: 0, max: 1, step: 0.01, about: 'An ordinary 0 to 1 slider.' },
    { key: 'pinned', type: 'number', value: 3, min: 3, max: 3, step: 1, about: 'min equals max: the bar cannot move.' },
    { key: 'negative', type: 'number', value: -40, min: -120, max: -10, step: 1 },
    { key: 'huge', type: 'number', value: 250000, min: 0, max: 1000000, step: 1 },
    { key: 'fine', type: 'number', value: 0.0015, min: 0, max: 0.01, step: 0.0001 },
    { key: 'coarse', type: 'number', value: 50, min: 0, max: 100, step: 25 },
  ]},
  { name: 'choices', about: 'Selects and toggles', controls: [
    { key: 'only', type: 'select', value: 'one', options: ['one'], about: 'A select with a single option.' },
    { key: 'few', type: 'select', value: 'split', options: ['split', 'full', 'stacked'] },
    { key: 'many', type: 'select', value: 'opt-7', options: Array.from({ length: 18 }, (_, i) => `opt-${i}`) },
    { key: 'wordy', type: 'select', value: 'a much longer option label', options: ['short', 'a much longer option label', 'another fairly long option label here'] },
    { key: 'on', type: 'toggle', value: 1 },
    { key: 'off', type: 'toggle', value: 0 },
  ]},
  { name: 'copy', about: 'Text, from none to a paragraph', controls: [
    { key: 'empty', type: 'text', value: '' },
    { key: 'title', type: 'text', value: 'The headline as it is today' },
    { key: 'paragraph', type: 'text', value: 'A paragraph of copy long enough to wrap several times in the drawer, to see how the value column and the row height cope with text that keeps going well past the width of the bar beside it.' },
    { key: 'aVeryLongControlKeyThatPushesTheNameColumn', type: 'text', value: 'x', about: 'A key long enough to push its column.' },
  ]},
  { name: 'colors', about: 'Colors, light to dark', controls: [
    { key: 'paper', type: 'color', value: '#f7f4ef' },
    { key: 'ink', type: 'color', value: '#111111' },
    { key: 'accent', type: 'color', value: '#e8c547' },
  ]},
  { name: 'aGroupNameLongEnoughToCrowdTheTabRow', about: 'A long tab label', controls: [
    { key: 'value', type: 'number', value: 1, min: 0, max: 2, step: 1 },
  ]},
  { name: 'hidden', about: 'Hidden: no tab, but `on hidden` opens it', hidden: true, controls: [
    { key: 'secret', type: 'toggle', value: 1 },
  ]},
];

// An exemplar or a draft: controls.js, and a visual.js or an extension.js.
async function folder({ files }, kind, name) {
  const loadControls = files[`${name}/controls`];
  if (!loadControls) throw new Error(`unknown ${kind}: ${name}`);
  const { groups } = await loadControls();
  return {
    groups,
    // The picture or extension needs the store, so it is made after defineControls.
    async options(store) {
      if (files[`${name}/visual`]) {
        const { default: visual } = await files[`${name}/visual`]();
        return { visuals: { [groups[0].name]: visual(store) } };
      }
      if (files[`${name}/extension`]) {
        const { default: extension } = await files[`${name}/extension`]();
        return extension(store);
      }
      return {};
    },
  };
}

export async function resolveScenario(params) {
  const id = params.get('s') ?? 'stress';
  const [kind, arg] = id.split(/:(.*)/s);
  if (kind === 'exemplar') return folder(exemplars, 'exemplar', arg);
  if (kind === 'draft') return folder(drafts, 'draft', arg);
  if (kind === 'capture') return capture(arg, params.get('set') ?? 'defaults');
  if (kind === 'stress') return { groups: stress };
  if (kind === 'random') {
    const seed = Number(arg);
    if (!Number.isInteger(seed)) throw new Error(`bad seed: ${arg}`);
    const count = params.get('g') ? Number(params.get('g')) : undefined;
    return { groups: randomSchema(seed, { groups: count }) };
  }
  if (kind === 'json') {
    const text = sessionStorage.getItem(JSON_KEY);
    if (!text) throw new Error('no schema in the editor');
    return { groups: JSON.parse(text) };
  }
  throw new Error(`unknown scenario: ${id}`);
}
