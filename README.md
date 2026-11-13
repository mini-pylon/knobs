# knobs

A control drawer for web prototypes. You declare controls for a page's
layout variants, the numbers and colors that shape it, and its copy. A
drawer then lets you change them live while the page runs, and saves what
you chose to `knobs.values.json`.

Knobs comes with an agent skill. You tell your coding agent "let's start a
new prototype", and it puts knobs on a prototype branch, reads the project,
proposes controls, and wires them once you say go. When you're done, it
writes down what you chose.

## With an agent

```
npx skills add mini-pylon/knobs
```

This installs the `knobs` skill for Claude Code, Codex, Cursor and the
other agents [`skills`](https://github.com/vercel-labs/skills) supports.
Then, in a project, ask your agent to start a prototype or to add a control
drawer. The skill installs the package itself.

If you keep a checkout of knobs, set `KNOBS_DIR` to its path. The skill
then links the package from there, so a change to knobs reaches your
prototype on a reload.

## By hand

```
npm install --save-dev github:mini-pylon/knobs#semver:^0.1.0
```

1. Write a controls file. [`skills/knobs/templates/controls.ts`](skills/knobs/templates/controls.ts)
   shows every control type: `select`, `text`, `number`, `toggle` and `color`.
2. Add the Vite plugin: `knobs({ controls: 'src/controls.ts' })` from `knobs/vite`.
3. Mount the drawer once, on the client: see [`templates/Knobs.tsx`](skills/knobs/templates/Knobs.tsx),
   or call `mountKnobs(knobs, { name })` after load without React.
4. Read values with `useControl('group.key')` in React, or `control` and
   `onControl` elsewhere.

In the page, backtick opens the drawer, `save` writes `knobs.values.json`,
and `~` opens the performance tab.

## Requirements

- Vite 8 for `save`. Vite 7 should work but is untested. Without Vite, the
  drawer still runs, and `export` prints the values.
- React 18 or later for `knobs/react`. It's optional.

## Development

```
npm install
npm run test:unit
npm run test:browser
```

The design is in [`docs/`](docs/).

## License

MIT
