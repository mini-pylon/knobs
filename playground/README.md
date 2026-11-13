# knobs playground

A page for trying the drawer against any schema and looking at the system
from several sides. It is for working on knobs itself and is not in the
published package.

```bash
npm run playground                 # http://127.0.0.1:5380/
npm run playground:shots           # every tab of every scenario, plus the grid, to playground/.shots/
npm run playground:shots -- --only stress,random:42 --out /tmp/shots
npm run playground:capture -- wings-vdb   # a project's own drawer into playground/captures/
```

To keep it running, run it as a systemd user unit, not in a terminal:

```bash
systemd-run --user --unit=knobs-playground -p WorkingDirectory=$PWD $(command -v node) playground/serve.mjs
```

Behind a proxy that gives it a hostname, name that host with `--allow-host <name>`, or Vite
refuses the requests.

## Pages

- **`/`, the shell.** Pick a scenario. The stage shows the drawer mounted in a real page, at
  390, 768 or 1280 px or the full width. The source pane holds the schema as JSON; edit it and
  apply to remount. The right-hand views read the live stage:
  - **schema** lists every group and control, with type, range and default.
  - **state** shows what is changed from the defaults (what save would write) and every live value.
  - **events** logs each value change.
  - **commands** lists the pages, commands, pictures and status an extension adds.
  - **capture**, for a capture only: where it came from, a value-set picker, what did not
    translate, and shots of the project's own drawer beside the stage.
- **`/grid.html`, the grid.** Many stages side by side: `set=exemplars`, `set=seeds&from=1&n=12`,
  `set=drafts`, `set=captures`, `set=all`, or `ids=stress,random:7`. `tab=` opens every stage on
  the same tab.
- **`/stage.html`, the stage.** One scenario, which the other two pages frame. The drawer is
  titled with the exemplar's, draft's or capture's name, and `playground` for the other
  scenarios. Its `window.__stage` holds `{ id, groups, store, options, events, error, capture }`.

## Scenarios

| `s=` | What mounts |
|---|---|
| `stress` | Every control type at its edges: min equal to max, huge and negative ranges, fine steps, one-option and long selects, empty and paragraph text, a long tab name, a hidden group |
| `random:<seed>` | A seeded random schema (`random.js`). The same seed always gives the same schema. `g=` sets the group count |
| `exemplar:<name>` | An exemplar from `skills/knobs/exemplars/`, with its picture or extension |
| `draft:<name>` | A draft from the drafts folder: what an agent wrote for a project |
| `capture:<name>` | A project's own drawer from the captures folder. `set=` names the value set it mounts with (`defaults` if none) |
| `json` | The schema last applied from the source pane |

## Drafts

The drafts folder holds work an agent wrote, so you can check it next to the exemplars. A draft
is a folder shaped like an exemplar: `controls.js` exports `groups`, and either `visual.js` or
`extension.js` is beside it. The folder is `playground/drafts/` (gitignored), or `KNOBS_DRAFTS`.
Each draft becomes a scenario as soon as it is on disk.

To get a draft in:

- have the agent write the folder into the drafts folder, or
- paste the files into **paste a draft** in the shell's source pane, which saves them there and
  mounts the draft.

`/grid.html?set=drafts` shows every draft. `npm run playground:shots -- --only drafts` saves each
one's tabs.

## Captures

A capture is a dated snapshot of the drawer a real project built by hand, so it can be browsed
next to the exemplars. Captures are committed, in `playground/captures/<project>/` (or
`KNOBS_CAPTURES`):

- `capture.json`: `source` (repo, branch, commit, and whether the checkout had uncommitted
  changes), `capturedAt`, `groups` in knobs form, `valueSets`, `untranslated`, and `shots`.
- `shots/`: the project's own drawer, one PNG per tab.

```bash
npm run playground:capture -- wings-vdb [checkout]    # default ~/linda/repos/wings-vdb
npm run playground:capture -- mini-pylon [checkout]   # default ~/linda/repos/mini-pylon
```

Options: `--out <dir>` (default `playground/captures`), `--dev <url>` (the project's dev server),
`--scale <n>` (shot pixel ratio, default 1), and for wings-vdb `--reports <dir>`.

The command only reads the checkout: it imports or runs the schema (Python with `-B`), runs git
without optional locks, and writes nothing there. It never starts a dev server. When the
project's dev server is already up it opens the drawer with the backtick key and shoots each tab;
otherwise the capture has no shots and `shotsSkipped` says why. A capture run replaces the
project's folder.

A value set is `{ about, values, dropped? }`. `values` holds only what differs from the
defaults, checked by the store's own rules; a value the store would refuse, or a path it does
not know, is listed under `dropped` with the reason. `set=<name>` mounts the capture with those
values as file values (`defineControls(groups, values)`).

| Project | Schema | Value sets | Hidden | Not translated |
|---|---|---|---|---|
| wings-vdb | `src/params.js` (`groups`, each with `vars`; no type means number) | `defaults`, and one per browser report in `~/.cache/wings-vdb/browsers/<id>.json`, old names migrated by `migrate()` | `HIDDEN_TABS` in `src/terminal.js` | the `viz.js` pictures, the perf page, uniform/js/core wiring, each drawer command |
| mini-pylon | `schema()` in `tools/scene_params.py` (`choice` becomes `select`) | `defaults`, each preset in `PRESETS`, each final in `renders/hyperreal/tweaks/*.json` by its file stem | none | the renders tab, `/render`, `render`, the preview pane |

Their dev servers: wings-vdb on port 5350 (Chromium gets the Vulkan flags headless WebGL needs;
each shot takes about 20 seconds), mini-pylon's tweak server on 5371.

`/grid.html?set=captures` shows every capture, and `npm run playground:shots -- --only captures`
saves each one's tabs as knobs draws them.
