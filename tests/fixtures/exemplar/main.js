// Mounts one exemplar from skills/knobs/exemplars, named by ?name=: a picture
// keyed by its group's name, or an extension's options copied onto the mount
// options with Object.assign. Copying is safe here because the fixture mounts
// one extension and has no commands, pages or status of its own to lose; a
// project merges them, as pictures.md step 4 says.
import { defineControls, mountKnobs } from 'knobs';

// Vite may hand the keys back relative to this page or resolved, not with
// the alias kept, so the map is rebuilt as `<name>/<file>`.
const loaders = {};
for (const [key, load] of Object.entries(import.meta.glob('@exemplars/*/*.js'))) {
  const match = key.match(/([^/]+)\/(controls|visual|extension)\.js$/);
  if (match) loaders[`${match[1]}/${match[2]}.js`] = load;
}

async function start() {
  const name = new URLSearchParams(location.search).get('name');
  const loadControls = loaders[`${name}/controls.js`];
  if (!loadControls) throw new Error(`no exemplar: ${name}`);
  const { groups, probe } = await loadControls();
  const store = defineControls(groups);
  const options = { name: 'exemplar' };
  let module, target = groups[0].name;
  if (loaders[`${name}/visual.js`]) {
    module = await loaders[`${name}/visual.js`]();
    options.visuals = { [groups[0].name]: module.default(store) };
  } else if (loaders[`${name}/extension.js`]) {
    module = await loaders[`${name}/extension.js`]();
    Object.assign(options, module.default(store));
    if (options.pages?.length) target = options.pages[0].label ?? options.pages[0].name;
  } else throw new Error(`no visual.js or extension.js: ${name}`);
  window.__exemplar = { name, groups, probe, store, module, target };
  mountKnobs(store, options);
}

start().catch(error => {
  document.body.dataset.error = error.message;
  throw error;
});
