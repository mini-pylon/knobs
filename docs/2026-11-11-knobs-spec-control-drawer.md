---
title: control-drawer
kind: spec
target: knobs
topic: control-drawer
status: draft
written: 2026-11-11T04:21:48Z
by: claude
worktree: /home/jmo/linda/repos/knobs/.worktrees/spec-control-drawer
---

# control-drawer

## Goal

Josh can say "let's start a new prototype from `<repo>/<branch>`" about any web project, and the agent brings in a control drawer without being told. The agent reads the project and generates controls for component variants, object variables and copy overrides. Josh tunes them live, and what he chooses comes back out as a record that can feed a spec or plan.

Knobs is that drawer: a package extracted from the wings-vdb control drawer, plus a skill that installs it into a project and generates its controls. Josh sees it as one facet of a larger suite of tools. This spec gets the workflow right locally, on this machine. Publishing comes later.

## Current state

Checked 2026-11-10. Knobs base commit: `f37b19a chore: initialize knobs`, which holds a README and an empty `docs/`.

The source is the wings-vdb checkout on `dispersal-controls-prototype` at `10683b3`, plus uncommitted drawer work in its working tree. The files to extract from are:

- `src/terminal.js` (470 lines): the drawer UI, console and tabs. It already takes `commands`, `status`, `onFocus`, `extras`, `pages` and `visuals` as options. It imports `params.js` directly, hardcodes `wings-vdb` in its storage keys, prompt, file names and greeting, and hardcodes a set of hidden tabs.
- `src/params.js` (210 lines): the control schema and the value store in one file. The store handles numbers only, in `set` and in loading saved values. It also holds wings-vdb's name migrations and a rule that ties a group's `in` and `out` together when its `link` toggle is on.
- `src/viz.js` (514 lines): pictures specific to wings-vdb, on top of generic helpers (`makePen`, `canvasVisual`, `pixels`, `trace`, `fit`).
- `src/perf.js` (89 lines): the performance page, whose rows read the renderer's `getStats()`.
- `src/style.css`: the drawer's rules are global and include a bare `button` rule.
- `vite.config.js` and `scripts/defaults.mjs`: a dev-only endpoint that writes the drawer's values into `src/params.js`.

The drawer's backtick listener toggles the drawer even when focus is in a text field. The console splits a line on whitespace, so a value cannot contain a space.

Controls today are `number` and `toggle` only.

No quick prototyping skill exists yet in the skills repository. Another thread is starting on one.

## Design

### Parts and ownership

| Part | Lives in | Owns |
|---|---|---|
| The `knobs` package | this repository | the drawer, the value store, control types, reads, the Vite plugin, instrument helpers |
| The `knobs` skill | the skills repository | installing, proposing controls, wiring them, wrapping up |
| The quick prototyping skill (out of scope) | the skills repository | the "start a new prototype" trigger, the prototype branch, serving the dev server, reckoning with plan amendments |

The prototyping skill calls the knobs skill. wings-vdb keeps its own drawer for now, so this work does not touch its open plan.

### Workflow

When Josh says "let's start a new prototype from `<repo>/<branch>`":

1. **Branch** (prototyping skill). A worktree on a new prototype branch from that starting point.
2. **Install** (knobs skill). Knobs is added as a dev dependency from its local path on this machine, as a `file:` dependency, which npm installs as a symlink. A fix to knobs reaches every running prototype with a page reload.
3. **Read and propose** (knobs skill). The agent reads the project and lists the controls it would create, grouped as variants, variables and copy. Josh trims the list or says go.
4. **Wire** (knobs skill). The agent writes the controls file (`controls.js`, or `controls.ts` in a TypeScript project) and an empty `knobs.values.json` (`{}`), registers `knobs/vite` in the project's Vite config with the controls file's path, mounts the drawer from a client-only component, and adds a read at each place in the code, importing it from the controls file. Editing the project's component code on the prototype branch is intended.
5. **Serve** (prototyping skill). The dev server starts and Josh gets a link. Backtick opens the drawer.
6. **Keep** (knobs skill). Josh's values save to a file on the prototype branch.

### Controls file

One file lists every control, so the drawer shows controls for components not on the current page. It is the only place the schema is registered, and every read is imported from it, so a read can never run before registration. There is no global registry.

```js
import { defineControls } from 'knobs';
import { bindReact } from 'knobs/react';
import values from './knobs.values.json';

export const knobs = defineControls([
  { name: 'hero', about: 'Homepage hero', controls: [
    { key: 'variant', type: 'select', value: 'split', options: ['split', 'full', 'stacked'] },
    { key: 'title', type: 'text', value: 'The original headline' },
    { key: 'overlay', type: 'number', value: 0.4, min: 0, max: 1, step: 0.01 },
    { key: 'badge', type: 'toggle', value: 1 },
    { key: 'accent', type: 'color', value: '#e8c547' },
  ]},
], values);
export const { control, onControl } = knobs;
export const useControl = bindReact(knobs);
```

- `defineControls` returns a store bound to that schema. It touches no browser API. A project without React leaves out `bindReact`.
- Control types are `number`, `toggle`, `select`, `text` and `color`. `about` is optional on a group or control. Object variables are a group whose controls are that object's fields, such as `product.price`.
- Rows: `number` and `toggle` as today. `select` is a native select. `text` is a single-line input. `color` is a native color input with its hex value beside it.
- `hidden: true` on a group removes its tab. `on <group>` at the prompt still opens it.
- A control's `value` is its default. For a copy override, the default is the project's existing text, so an untouched control changes nothing. `reset` restores this default, and "original" in the changed list and the decisions note means this default.

### Reading a value

- `control('hero.variant')` returns the current value. `onControl(path, fn)` reports changes and returns a function that stops them.
- `useControl('hero.variant')` re-renders the component on change. React is an optional peer dependency, declared through `peerDependenciesMeta`, and only `knobs/react` imports it. Reads inside a React render must use `useControl`, not `control`.
- A read of a path not in the schema throws, so a typo fails where it is made.
- Setting a value throws when there is no `window`, so the store on a server holds only the immutable schema and file values, and requests cannot affect each other.

### Value precedence and hydration

A value resolves as: the browser's saved value, then `knobs.values.json`, then the default in the controls file.

`useControl` is built on React's `useSyncExternalStore`. Its `getServerSnapshot` returns the file value or default, and its `getSnapshot` returns the live value. React renders the server snapshot during hydration and re-renders once if the live value differs, so a saved value causes no hydration mismatch, whenever it arrives.

Before `mountKnobs` runs, every read returns the file value or default, because the storage namespace is not known yet. `mountKnobs` loads the browser's saved values from storage, applies them to the store, and notifies every existing subscriber, both `onControl` listeners and `useControl` consumers, once per value that changed.

A saved value that no longer validates is ignored: a `select` value not in its options, a `number` that is not finite, a `color` that is not `#rrggbb`. Numbers clamp to their range, as they do now.

### Mounting

```js
import { mountKnobs } from 'knobs';
import { knobs } from './controls';
useEffect(() => mountKnobs(knobs, { name: 'my-project', commands, status, onFocus, extras, pages, visuals }), []);
```

The skill calls `mountKnobs` from a `useEffect` in a client-only component, or after load in a project without React, so the drawer's DOM lands after hydration even in a framework that hydrates the whole document. It returns a function that unmounts the drawer. Calling it with no `window` is an error.

`name` namespaces every storage key and replaces each hardcoded `wings-vdb`. All other options keep their current meaning.

Built-in commands are `help`, `ls`, `get`, `set`, `reset`, `on`, `save`, `download [name]`, `load`, `export`, `import`, `clear` and `close`. `save` writes the values file through the Vite plugin. `download` is what wings-vdb's `save` does today, a JSON file to the browser. The `/` menu lists the built-in actions plus anything in `commands`. wings-vdb's `/shot` and the help line about `v` stay behind in wings-vdb. `~` opens the `performance` tab.

The console, tabs, status line and label colors carry over: yellow for anything you can act on, light grey for the instrument side.

### Safe in another project

- The drawer renders in a shadow DOM, so its CSS and the project's cannot collide. Its stylesheet defines its own custom properties on the shadow host, carries its own button reset, uses a generic monospace font stack, and sets a z-index at the top of the range. `getComputedStyle` reads in the instrument code read from inside the shadow root.
- The drawer sets no class on the page's `body`. A project that wants to react to it being open uses `onFocus`.
- Backtick and `~` do nothing while focus is in an editable field, inside or outside the drawer. Inside a shadow DOM the listener reads `event.composedPath()`, because `event.target` is retargeted to the host.
- For a `text` control, a value typed at the prompt is the rest of the line exactly. The console's `=`, `+=` and `-=` handling and its number coercion do not apply to it.
- wings-vdb's name migrations, the `link` rule, the shader `uniform` field and its page layout rules stay behind in wings-vdb.

### Vite plugin

`knobs/vite` does four jobs.

- **Save endpoint.** A dev-only endpoint behind `save`, built from the one behind wings-vdb's `defaults` command. It writes one fixed path under the project root, `knobs.values.json`, keeping only values that differ from the defaults. Because a dev server may be shared with other devices, it accepts only POST with `Content-Type: application/json` and an `Origin` whose host matches the request's `Host`, caps the body size, and refuses any path not in the schema or any value that does not validate. The content-type and origin rules stop another website from writing with a simple cross-origin request.
- **Schema loading.** The plugin is configured with the controls file's path, as `knobs({ controls: 'app/controls.ts' })`. On each save it imports that file fresh through a Vite module runner in Node, such as `runnerImport`, and validates against the store it exports as `knobs`. It does not use the project's server-rendering environment, which may not be Node. The browser's copy of the schema is never trusted.
- **Full reloads.** Its `handleHotUpdate` turns any change to the controls file, `knobs.values.json` or a file in the knobs checkout into a full page reload, so components and the drawer can never end up bound to different stores. Saved values restore after the reload. A project not on Vite reloads by hand.
- **Symlink settings.** `server.fs.allow` is `[searchForWorkspaceRoot(root), realpathSync(knobsDir)]`: setting `allow` turns off Vite's workspace detection, so the plugin has to restore it, and Vite serves the symlink's real path. `resolve.dedupe` for React is what prevents two copies of React, and is what the end-to-end run tests. A linked dependency is already left unexternalized in server rendering and is not pre-bundled, so `ssr.noExternal` and `optimizeDeps` need no entry.

A project not on Vite uses `export`, which copies the values as JSON.

### Package shape

Plain browser JavaScript as ES modules, with no build step and no framework in the core. Hand-written type declarations ship alongside, so TypeScript projects can import it. Entry points are `knobs`, `knobs/react` and `knobs/vite`.

### Instrument side

- Every tab gets a default panel: a live list of what has changed in that group, each line showing the original and current value.
- Custom pictures are opt-in through `visuals`, on request only. The generic drawing helpers from `viz.js` (`makePen`, `canvasVisual`, `pixels`, `trace`, `fit`) ship with the package. wings-vdb's own pictures stay behind.
- The `performance` tab shows frame rate and memory everywhere. Renderer and scene rows appear only if the project supplies them through a stats option.

### Coming back out

When Josh says the prototype is done, the knobs skill:

1. Saves `knobs.values.json`, keeping only what differs from the defaults.
2. Asks Josh to commit the prototype branch, since nothing commits without being asked.
3. Writes a short decisions note in the project's `docs/` with `wings-home docs new`: each changed control, its original value, what Josh chose, and where in the code it is read. The note names the commit from step 2, and is committed separately after it.
4. Leaves the prototype branch as the reference.

Production code gets the chosen values written in directly through a normal spec or plan. The drawer and its reads never reach production.

### The knobs skill

Written with write-skill in the skills repository. Its description fires when a prototype is starting, or when asked to add a control drawer to a web project. It covers install, propose, wire and wrap-up, and it never adds knobs to a default branch.

## Testing

- Unit tests with `node --test` for the store: each type's validation, clamping, precedence, change notification, a read of an unknown path, that a set with no `window` throws, and that `defineControls` touches no browser API. These pass values as objects rather than importing a JSON file.
- Unit tests for console parsing of `text` values containing spaces, `=` and digits, and for the plugin's endpoint: keeping only changed values, and refusing unknown paths, invalid values, an oversized body, a wrong content type and a mismatched origin, with the file left unchanged in each refusal.
- Browser tests with Playwright on a small fixture page in this repository: the drawer mounts in a shadow DOM; a project's global CSS does not change it and its CSS does not reach the page; each control type updates a read; backtick is ignored while typing in a field on the page and in a `text` control; `hidden` groups have no tab and open with `on`; saved values survive a reload.
- A browser test on server-rendered React fixtures, one that hydrates a root element and one that hydrates the whole document: no hydration warning with a saved value present, and the saved value appears after hydration.
- A browser test that editing the controls file or the values file causes a full reload, and that the drawer still drives the page afterward.
- A test that a save after a schema edit validates against the edited schema.
- A browser test that `mountKnobs` restores saved values and notifies both an `onControl` listener and a `useControl` consumer already subscribed.
- One end-to-end run on a real project, through a symlinked install, to prove the Vite settings. It is the check that decides whether those settings are complete.

## Out of scope

- Publishing to a registry, and who can install the package.
- Access for collaborators.
- The quick prototyping skill and its trigger.
- Moving wings-vdb onto the package.
- Build tools other than Vite, beyond `export`.
- Frameworks other than React, beyond the plain JS reads.
- Applying controls from outside a project's code, through CSS variables or text replacement by selector.
- Generating controls at runtime by inspecting a page, or from a description typed into the drawer.

## Follow-ups

- Publish, most likely under a scope, since the plain `knobs` name is taken on npm.
- Move wings-vdb onto the package, and record that on its plan's amendments list first, because its pinned browser scripts check the drawer.
- Agree the handoff between the prototyping skill and the knobs skill with the thread building the former.

## Open questions

- Whether `knobs` stays the name when published. It is a working name.
