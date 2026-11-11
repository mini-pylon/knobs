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
2. **Install** (knobs skill). Knobs is added as a dev dependency from its local path on this machine, as a `file:` dependency, which npm installs as a symlink. A fix to knobs shows up in every running prototype.
3. **Read and propose** (knobs skill). The agent reads the project and lists the controls it would create, grouped as variants, variables and copy. Josh trims the list or says go.
4. **Wire** (knobs skill). The agent writes `controls.js` and an empty `knobs.values.json` (`{}`), mounts the drawer on the client only, and adds a read at each place in the code. Editing the project's component code on the prototype branch is intended.
5. **Serve** (prototyping skill). The dev server starts and Josh gets a link. Backtick opens the drawer.
6. **Keep** (knobs skill). Josh's values save to a file on the prototype branch.

### Controls file

One file lists every control, so the drawer shows controls for components not on the current page.

```js
import { defineControls } from 'knobs';
import values from './knobs.values.json';

export default defineControls([
  { name: 'hero', about: 'Homepage hero', controls: [
    { key: 'variant', type: 'select', value: 'split', options: ['split', 'full', 'stacked'] },
    { key: 'title', type: 'text', value: 'The original headline' },
    { key: 'overlay', type: 'number', value: 0.4, min: 0, max: 1, step: 0.01 },
    { key: 'badge', type: 'toggle', value: 1 },
    { key: 'accent', type: 'color', value: '#e8c547' },
  ]},
], values);
```

- `defineControls` registers the schema when the module is imported, on the server and in the browser. It touches no browser API.
- Control types are `number`, `toggle`, `select`, `text` and `color`. `about` is optional on a group or control. Object variables are a group whose controls are that object's fields, such as `product.price`.
- `hidden: true` on a group removes its tab. `on <group>` at the prompt still opens it.
- A control's `value` is its default. For a copy override, the default is the project's existing text, so an untouched control changes nothing.

### Reading a value

- `control('hero.variant')` returns the current value. `onControl(path, fn)` reports changes and returns a function that stops them.
- `useControl('hero.variant')`, from `knobs/react`, re-renders the component on change. React is a peer dependency of that entry only.
- A read of a path not in the schema throws, so a typo fails where it is made.

### Value precedence and hydration

A value resolves as: the browser's saved value, then `knobs.values.json`, then the default in `controls.js`.

On the server and through the first client render, reads return the file value or the default and never the browser's saved value. `mountKnobs` applies the browser's saved values after mount and notifies readers, so a server-rendered page does not hit a hydration mismatch.

A saved value that no longer validates is ignored: a `select` value not in its options, a `number` that is not finite, a `color` that is not `#rrggbb`. Numbers clamp to their range, as they do now.

### Mounting

```js
import { mountKnobs } from 'knobs';
mountKnobs({ name: 'my-project', commands, status, pages, visuals });
```

`name` namespaces every storage key and replaces each hardcoded `wings-vdb`. All other options keep their current meaning. Calling `mountKnobs` on the server is an error; the skill mounts it from client-only code.

The console, tabs, status line and label colors carry over: yellow for anything you can act on, light grey for the instrument side.

### Safe in another project

- The drawer renders in a shadow DOM, so its CSS and the project's cannot collide.
- Backtick and `~` do nothing while focus is in an editable field, inside or outside the drawer. Inside a shadow DOM the listener reads `event.composedPath()`, because `event.target` is retargeted to the host.
- A `text` value typed at the prompt takes the rest of the line, so it may contain spaces.
- wings-vdb's name migrations, the `link` rule and the shader `uniform` field stay behind in wings-vdb.

### Vite plugin

`knobs/vite` does two jobs.

- It adds a dev-only endpoint behind the drawer's `save` command, which writes `knobs.values.json`, keeping only values that differ from the defaults. It is built from the endpoint behind wings-vdb's `defaults` command.
- It configures Vite for a symlinked dependency: `server.fs.allow` for the knobs checkout, `resolve.dedupe` for React, and `ssr.noExternal` for knobs, because the package ships source with no build step.

A project not on Vite uses `export`, which copies the values as JSON.

### Package shape

Plain browser JavaScript as ES modules, with no build step and no framework in the core. Hand-written type declarations ship alongside, so TypeScript projects can import it. Entry points are `knobs`, `knobs/react` and `knobs/vite`.

### Instrument side

- Every tab gets a default panel: a live list of what has changed in that group, each line showing the original and current value.
- Custom pictures are opt-in through `visuals`, on request only. The drawing helpers from `viz.js` ship with the package.
- The `performance` tab shows frame rate and memory everywhere. Renderer and scene rows appear only if the project supplies them through a stats option.

### Coming back out

When Josh says the prototype is done, the knobs skill:

1. Saves `knobs.values.json`, keeping only what differs from the defaults.
2. Writes a short decisions note in the project's `docs/` with `wings-home docs new`: each changed control, its original value, what Josh chose, and where in the code it is read. The note names the prototype commit.
3. Leaves the prototype branch as the reference.

Production code gets the chosen values written in directly through a normal spec or plan. The drawer and its reads never reach production.

### The knobs skill

Written with write-skill in the skills repository. Its description fires when a prototype is starting, or when asked to add a control drawer to a web project. It covers install, propose, wire and wrap-up, and it never adds knobs to a default branch.

## Testing

- Unit tests with `node --test` for the store: registration, each type's validation, clamping, precedence, change notification, a read of an unknown path, and that `defineControls` touches no browser API.
- Unit tests for console parsing of `text` values with spaces, and for the plugin's write keeping only changed values.
- Browser tests on a small fixture page in this repository: the drawer mounts in a shadow DOM; a project's global CSS does not change it and its CSS does not reach the page; each control type updates a read; backtick is ignored while typing in a field on the page and in a `text` control; `hidden` groups have no tab and open with `on`; saved values survive a reload.
- A browser test on a fixture using server-rendered React: no hydration warning with a saved value present, and the saved value appears after mount.
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
