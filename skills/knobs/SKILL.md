---
name: knobs
description: Use when a prototype of a web project is starting, when asked to add a control drawer or live controls to a web project, or when a prototype with a control drawer is done and needs wrapping up
---

# knobs

## Overview

Knobs (https://github.com/mini-pylon/knobs) is a control drawer for web
projects. This skill puts it on a prototype branch, proposes controls, wires
them, and wraps up. Knobs never reaches a default branch or production code.

Where your own instructions name a way to branch, commit or keep notes,
use it in place of the plain steps below.

**Announce at start:** "Using knobs."

## Start

1. **Branch.** Before the first change, leave the default branch: make a
   prototype branch named for the prototype (`proto-hero`), or a git
   worktree on one when another agent is working in the checkout. Every
   later step runs there.
2. **Install.** If `KNOBS_DIR` is set, the user keeps a knobs checkout:
   `npm install --save-dev file:$KNOBS_DIR`. npm links it, so a fix to
   knobs reaches the prototype on a reload; check that `node_modules/knobs`
   is a symlink. Otherwise:
   `npm install --save-dev github:mini-pylon/knobs#semver:^0.1.0`.
   A project not on Vite still gets the drawer, but `save` needs Vite;
   say that its values come out with `export` instead.
3. **Propose.** Read the parts the user named, or the first page a visitor
   sees, and list the controls you would create in three groups:
   - **Variants:** a component's alternative layouts or modes (`select`,
     `toggle`).
   - **Variables:** an object's fields and the numbers and colors that
     shape it (`number` with a range and step, `color` as `#rrggbb`,
     `toggle`).
   - **Copy:** visible text (`text`), each defaulting to the text the
     project has now, so an untouched control changes nothing.

   Give each control its `group.key`, type, default and the file that will
   read it. Then stop for the user to trim the list or say go.

## Wire

4. **Controls file.** From `templates/controls.ts`: `src/controls.ts` in a
   TypeScript project, `controls.js` otherwise, holding every group in one
   `defineControls` call. Leave out `bindReact` without React. Write
   `knobs.values.json` at the project root as `{}`.
5. **Plugin.** Add `knobs({ controls: '<controls path>' })` from
   `knobs/vite` to the Vite config's plugins. Behind a proxy that rewrites
   `Host`, add `origins: ['<public origin>']`.
6. **Mount.** From a client-only component, as `templates/Knobs.tsx`,
   rendered once near the root, with the project's name as `name`. Without
   React, call `mountKnobs` after load. Never at module top level: it
   throws where there is no `window`.
7. **Reads.** Replace each value with a read imported from the controls
   file: `useControl('group.key')` inside a React render, `control` or
   `onControl` elsewhere.
8. **Hand over.** Tell the user that backtick opens the drawer, `save`
   writes `knobs.values.json`, and `~` opens the performance tab.

## Wrap up

When the user says the prototype is done:

9. **Values.** Read `knobs.values.json`; it keeps only what differs from
   the defaults. If the user may have changes not yet saved, ask them to
   type `save` in the drawer first.
10. **Commit.** Ask whether to commit the prototype branch, naming what the
    commit would hold. On a yes, commit it. Stop until it is committed.
11. **Decisions note.** Fill `templates/decisions.md`: each changed
    control, its default, the user's choice and the file that reads it,
    naming the commit from step 10. Write it to `docs/knobs-<prototype
    branch>.md`, unless the project keeps such notes somewhere of its own.
    Ask before committing it, as its own commit.
12. **Leave** the prototype branch as the reference. Production gets the
    chosen values written in directly, as ordinary work on its own branch.

## Never

- Install or wire knobs on a default branch, or merge a prototype branch
  into one.
- Wire before the user has answered the proposal.
- Commit without asking, or write the decisions note before the commit it
  names.
- Strip the drawer, its reads or the dependency from the prototype branch,
  or write the chosen values into production code as part of wrap-up.
- Call `mountKnobs` or set a value where there is no `window`.
- Change knobs itself to suit a project. Offer to open an issue on
  `mini-pylon/knobs` instead, and open it only on the user's yes.
