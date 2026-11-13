---
title: "knobs exemplars: example pictures and drawer extensions for the skill"
kind: spec
target: knobs
topic: exemplars
status: draft
written: 2026-11-13T04:32:25Z
by: claude
approved_at: 2026-11-13T04:52:22Z
approved_by: josh
---

# knobs exemplars: example pictures and drawer extensions for the skill

## Goal

When the knobs skill wires a project, the agent gives each control group a picture that is as good as the best ones already drawn by hand, and adds a drawer extension where the project needs one. It does that from a small set of exemplars that ship with the skill: runnable, tested examples, each saying when to use it and what makes it good. The agent checks its own picture against the exemplar in a screenshot before handing it over. Users can offer a good picture back to mini-pylon/knobs, by their own hand, at wrap-up.

Knobs itself stays a small runtime. This work adds no runtime feature.

## Current state

Checked 2026-11-13. Base commit: `56f6edd Merge pull request #9 from mini-pylon/skill-in-repo` on `main`. The repository is public, MIT, tagged `v0.1.0` at that commit.

- `skills/knobs/SKILL.md` (about 690 words with its templates) installs knobs, proposes controls in three groups (variants, variables, copy), wires them, and wraps up with a decisions note. It says nothing about pictures or drawer extensions. `skills/knobs/templates/` holds `controls.ts`, `Knobs.tsx` and `decisions.md`.
- `tests/unit/skill.test.mjs` checks the skill's shape (4 tests).
- The runtime's extension points, from `types/index.d.ts`: `mountKnobs(store, { name, commands, status, onFocus, extras, pages, visuals, stats })`. `visuals` maps a group name to `(host: HTMLElement) => Visual`; a `Visual` has `frame(now)` and an optional `destroy()`. `canvasVisual(label, make)` wraps a `make() => (pen, w, h, now) => void` drawing into a `Visual`. The pen (`makePen`) draws text, lines, plots, dots, rings, boxes and fills in the drawer's colors; `pixels`, `trace` and `fit` help with per-pixel images, traces and fitting bounds. A `Command` is `{ usage?, about?, run(args) }`; a `Page` is `{ name, label?, about?, mount(el), show?, hide?, destroy? }`.
- The drawer already has double-click reset on a control's name and a per-control note (`about`), so neither is in scope.
- Open issues that touch this work: #4 (presets), #10 (staged changes with an apply step).
- Sources for the exemplars, read only: wings-vdb `src/viz.js` (`dive`: a curve over progress with a live trace; `scroll`: a track with snap zones and markers; `hover`: the same material at rest and hovered; `sunlight`: a sky dome with the sun and a lit ball; `birds`: a radar with five minutes of spawns and a countdown; `presence`: a material slice and its density profile) and mini-pylon `tools/tweak/tweak.js` (`preset [name]` applying a partial set while keeping the `render.` group; a render button with a pending-change count, an auto mode and a renders history). Both are Josh's code; the exemplars are rewritten from them, not copied.
- `package.json` `files` is `["src", "types"]`; the skill is not in the npm package and reaches users through `npx skills add mini-pylon/knobs` or a linked checkout.

## Design

### Layout

```
skills/knobs/
  SKILL.md
  pictures.md                     the Pictures step in full
  share.md                        the Share step in full
  templates/                      (unchanged)
  exemplars/
    <name>/
      README.md
      controls.js
      visual.js        (a picture)   or   extension.js   (an extension)
      shot.png
```

Each exemplar folder holds exactly one of `visual.js` and `extension.js`.

### Exemplar format

- **`controls.js`** exports `groups`, an array of plain `Group` objects (`{ name, about, controls }`). A picture exemplar has exactly one group, and its picture is keyed by that group's name. An extension exemplar may have more than one. A picture exemplar also exports `probe`, the path of one number control whose value visibly changes a still frame of the picture (the test sets it; see Testing).
- **`visual.js`** has a default export `(store) => (host) => Visual`, normally `canvasVisual(label, () => (pen, w, h, now) => …)`. It reads values only through `store.control('<group>.<key>')`. The label is a real description of the picture, as `aria-label`. `now` is in seconds: the drawer calls `frame(now / 1000)` from `requestAnimationFrame`, at most every 66 ms (`src/drawer.js`).
- **`extension.js`** has a default export `(store) => ({ commands?, pages?, status? })`, merged into the `mountKnobs` options: its `commands` into one command map, its `pages` onto one page list, and its `status` into one function, each shared with the project and any other extension. `mountKnobs` takes one of each, so a plain spread of two extensions keeps only the last one's commands and pages. Every command and page name is distinct across the project and its extensions, and is not a built-in command (`help`, `ls`, `get`, `set`, `reset`, `save`, `download`, `load`, `export`, `import`, `on`, `clear`, `close`) or a built-in view (`console`, `params`, `performance`): a built-in command runs instead of an extension's, and a later page with a name already used replaces the earlier one's pane. Rename on a clash. A page gets no drawer styles (the drawer stylesheet in `src/style.js` covers only its own classes and the performance page), so an extension's page appends its own `<style>` to its host or styles inline.
- Both files are plain JavaScript that starts with `// @ts-check` and types its parameters with JSDoc imports from `knobs`, so they type-check against the public types. In a JavaScript project the agent copies them as they are. In a TypeScript project it writes `knobs/<group>.ts`, turning the JSDoc types into annotations, because a relative `.js` import from `.tsx` fails type-checking without `allowJs`, which Vite's TypeScript templates do not set.
- Taking the store as a parameter keeps an exemplar independent of any project's controls file. When adapting one, the agent replaces `store.control` with the project's own `control` import.
- **The picture area.** A picture shows only when the viewport is at least 761 px wide (`src/drawer.js` checks `matchMedia('(min-width: 761px)')`; `src/style.js` hides `.term-viz` and `.term-status` at 760 px and below). The drawer is `min(30vh, 210px)` tall, so at 1280×800 the canvas is about 600 by 155 px: a short, wide strip. Side-by-side pictures (`before-after`, `cross-section`) are designed for that strip.
- **`README.md`**, at most 250 words, with exactly these sections:
  - `## When`: one sentence naming the kind of group or project it suits.
  - `## What makes it good`: three to five points. Each starts with **Look:** (checkable in a still screenshot of the drawer) or **Behaviour:** (followed by how to check it: for example "two screenshots a second apart differ only in the dot's position", or "move `jitter`: the ticks shift but keep their order"). Looping speed, a live countdown, stable randomness, preset isolation and typing during a render are behaviours.
  - `## Adapting`: what to rename, which stand-in to replace with the project's own code, and what to keep. An extension's Adapting section also links the knobs issue that would make it unnecessary ("if knobs grows this, prefer it"), and says that `commands`, `pages` and `status` are single mount options, so a project merges the extension's into its own: one command map, one page list, one status function.
- **`shot.png`**: the drawer open on the exemplar's group (or page, for `renders-tab`), cropped to the drawer, made by `npm run exemplars:shots`.

### The first eight

| Name | Kind | Groups and controls | What it draws or does | What makes it good |
|---|---|---|---|---|
| `curve-trace` | picture | `motion`: `duration` (ms), `ease` (select: linear, ease-out, spring), `overshoot`, `delay` (ms) | progress over time as a curve, a dot running along it at real speed, a fading trail behind the dot | the current point is marked; the axis ends carry units (0 and the duration in ms); overshoot shows against a 1.0 line; it loops at true speed |
| `timeline-zones` | picture | `scroll`: `sections`, `snap` (toggle), `snapWidth` (fraction of a section), `glide` (ms) | a track with a block per section, snap zones as bars, a tick at each centre, a marker at the current position | drawn to scale; the marker moves with the position; zones disappear when snap is off |
| `before-after` | picture | `hover`: `lift` (px), `scale`, `shadow` (blur px), `tint` (color) | the same card at rest and fully hovered, side by side | both sides share one scale and view; the difference reads at a glance; both sides are labelled |
| `angle-dial` | picture | `light`: `azimuth` (°), `elevation` (°), `intensity`, `color` | a top-down dial with the light's position, and a ball lit from that direction | 0° and the axes are labelled; the angle is shown as a number; the light's color is used |
| `schedule-countdown` | picture | `spawn`: `interval` (s), `jitter` (s), `burst` | the next few minutes as a strip of ticks, and "next in N s" | random draws come from a fixed seed, so a slider stretches the pattern instead of reshuffling it; the countdown is live; the time window is labelled |
| `cross-section` | picture | `edge`: `radius`, `softness`, `noise` | a small per-pixel slice of a soft shape, beside its density profile across the edge | the slice and the profile share one x scale; the threshold is marked; the slice uses `pixels()` and stays small enough to draw every frame |
| `presets` | extension | `look`: `background` (color), `accent` (color), `radius`, `spacing`; `quality`: `resolution`, `samples` | command `preset` lists presets with their `about`; `preset <name>` applies a partial set of `look` values and leaves `quality` as it is | lists each preset with its `about`; sets only the keys a preset names; never touches the kept group; `reset` still returns to the defaults; an unknown name prints an error. README links #4 |
| `renders-tab` | extension | `scene`: a few numbers and a color | page `renders`: a history of renders, newest first, each with its values and a thumbnail; command `render`; status `N changes since last render` | the pending count is in the status line; typing is not blocked while a render runs; the stand-in render function (a short delay, then a thumbnail drawn on a canvas) is marked as the part to replace with the project's real render. README links #10 |

Each exemplar uses a neutral subject a web prototype plausibly has. None mentions clouds, birds or any project of Josh's.

### Skill changes (`skills/knobs/`)

SKILL.md stays at most 1,000 words. The detailed procedures live in two new files beside it, read only when the step is reached: `skills/knobs/pictures.md` (the Pictures step) and `skills/knobs/share.md` (the Share step).

- **Description** adds: "or when a control group needs a picture or a drawer command".
- **Step 3, Propose.**
  - For each group, name a picture: the closest exemplar from the index, or "none" where a picture adds nothing (copy text, a lone toggle).
  - Suggest an extension where the project fits one: `presets` when the user talks about distinct looks, `renders-tab` when a change is costly to see.
  - The user trims pictures and extensions with the controls.
- **New step 8, Pictures**, after Reads; Hand over becomes step 9. In SKILL.md, one short paragraph: for each picture or extension the user kept, follow `pictures.md`. `pictures.md` holds:
  1. Read the chosen exemplar's README, then its code.
  2. Copy it into the project next to the mount component: `knobs/<group>.js` in a JavaScript project, `knobs/<group>.ts` with the JSDoc types turned into annotations in a TypeScript project. Replace `store.control` with the project's `control` import.
  3. Replace stand-in maths with the project's own. Where the page computes the value with a function, import that function, so the picture cannot drift from the page.
  4. Add the picture to `visuals`, or merge the extension into the mount options: its `commands` into one map with the project's and any other extension's, its `pages` onto one list, and its `status` into one function with any the project has. A plain spread keeps only the last extension's commands and pages. Leave out what the project does not have:
     ```js
     const added = [presets(store), rendersTab(store)];
     mountKnobs(store, {
       name,
       commands: Object.assign({}, ownCommands, ...added.map(item => item.commands)),
       pages: [...ownPages, ...added.flatMap(item => item.pages ?? [])],
       status: () => [ownStatus(), ...added.map(item => item.status?.() ?? '')].filter(Boolean).join('  '),
     });
     ```

     Every command and page name is distinct across the project and its extensions, and is not a built-in command (`help`, `ls`, `get`, `set`, `reset`, `save`, `download`, `load`, `export`, `import`, `on`, `clear`, `close`) or a built-in view (`console`, `params`, `performance`): a built-in command runs instead of an extension's, and a later page with a name already used replaces the earlier one's pane. Rename on a clash.
  5. **Check.**
     - Run the dev server and open it with the agent's own browser tool, at least 761 px wide: pictures and the status line are hidden below that.
     - Press backtick, open the group, and screenshot the drawer at 1280 px wide and at 761 px wide (the narrowest width that shows pictures, to catch clipping).
     - Check each **Look:** point against the screenshots, and each **Behaviour:** point by doing what it says (more screenshots over time, or a control changed between two). Fix what fails and look again.
     - After three rounds, stop and show the user what is still off.
     - With no browser tool, ask the user to open the drawer in a window at least 761 px wide and send a screenshot.
  6. Show the final screenshot with the hand-over.
- **Wrap up**, new step after the decisions note: **Share**. In SKILL.md, one line: offer to share each checked picture the user liked, following `share.md`.
- **Never** adds:
  - "Hand over a picture that has not been checked against its exemplar."
  - "Send anything about the user's project anywhere without their yes."
- **Exemplars index**, a section at the end of SKILL.md: one line per exemplar with its name, kind and its README's "When" sentence. The index names every folder under `exemplars/` and nothing else.

### Contributing

- **Issue form.** `.github/ISSUE_TEMPLATE/exemplar.yml` with `labels: [exemplar]`. A form's `labels` key applies only labels that already exist, so the `exemplar` label is created on mini-pylon/knobs as a manual step of the build (on Josh's yes). The form's fields, with these fixed ids:
  - `kind`: dropdown, picture or extension.
  - `when`: input.
  - `good`: textarea, "What makes it good".
  - `controls`: textarea, rendered as `js`.
  - `code`: textarea, rendered as `js`.
  - `screenshot`: textarea, for the image the user drops in.
  - `license`: a required checkbox, "This is my code and I can share it under the MIT license".
- **Share step** (`share.md`). For each picture that passed its check and that the user liked, the agent asks whether to share it.
  1. On a yes, it first offers to make the code generic: project names, copy text and identifying constants become neutral ones.
  2. It shows exactly what each field will hold.
  3. It builds a link to `https://github.com/mini-pylon/knobs/issues/new?template=exemplar.yml` with `title=exemplar: <a short name for the picture>` and the text fields `when`, `good`, `controls` and `code` prefilled by id as URL-encoded query parameters. GitHub prefills only text fields (inputs and textareas) from the URL ("Creating an issue from a URL query" in GitHub's documentation; community discussion 5288 reports dropdowns and checkboxes are not filled), so `kind` and `license` are left to the user, and the license tick is their own consent.
  4. It measures the encoded link. Above 6,000 bytes it leaves `code` (then `controls`) out of the link and names the file to paste from.
  5. The user opens the link, picks the kind, ticks the license, drops in the screenshot they have already seen, reads it through, and submits it themselves.
- The agent never files the issue itself: `gh` cannot attach an image, and the user's own submit is the consent.
- **Curation.** The maintainer turns a good submission into a new `exemplars/` folder as an ordinary pull request. The tests cover it from then on.
- **No telemetry.** Nothing is collected or sent passively.

## Testing

- **Fixture.** `tests/fixtures/exemplar/`: a page that reads `?name=<exemplar>` and mounts that exemplar.
  - `tests/browser/lib/harness.mjs` adds a string alias, `{ find: '@exemplars', replacement: <repo>/skills/knobs/exemplars }`. The fixture's `main.js` uses `import.meta.glob('@exemplars/*/*.js')` (lazy). Vite may return the keys relative to the fixture or as resolved paths rather than with `@exemplars` kept, so the fixture first rebuilds the map: for each key it matches `/([^/]+)\/(controls|visual|extension)\.js$/` and stores the loader under `<name>/<file>`. It then looks up `<name>/controls.js` and whichever of `<name>/visual.js` and `<name>/extension.js` exists. Vite does not analyse a dynamic `import()` whose path is a variable through an alias, so a template-string import is not used. If the glob does not resolve through the alias in Vite 8, the fallback is a `define` constant holding the `/@fs/` path of `skills/knobs/exemplars`, which `server.fs.allow: [repo]` already permits.
  - It builds a store with `defineControls(groups)` and mounts the drawer with `name: 'exemplar'`; `mountKnobs` attaches `localStorage` under `exemplar:values` (`src/drawer.js`), so a test seeds values with an init script before the page loads. Pictures go in as `visuals: { [group.name]: visual(store) }`; an extension is spread into the options, which is safe there because the fixture mounts one exemplar and has no options of its own. Exemplar files import `knobs` through the existing alias.
  - One server and one browser serve the whole test file, at 1280×800.
- **`tests/browser/exemplars.test.mjs`** lists every folder under `skills/knobs/exemplars/` and, for each, checks:
  - **Shape:** `README.md` has the three sections in order; `controls.js` exists; exactly one of `visual.js` and `extension.js` exists; `shot.png` exists; a picture's `controls.js` exports `probe`, naming a number control of its group.
  - **Mounts clean:** the page mounts with no page errors and no console errors.
  - **Pictures.** Each trial is a fresh page driven by the clock recipe in Screenshots below, so every trial has the same mount history and the same fake times. A trial ends by reading the canvas pixels.
    - **Not blank:** in a default trial, some pixel has alpha above zero (`canvasVisual` clears the canvas to transparent each frame, so the drawer background is behind it, not in it).
    - **Deterministic:** two default trials give identical pixels. This proves the procedure, so the next check means something.
    - **Reads the store:** a trial whose init script seeds `probe` at its maximum (in the fixture's saved values, before the page loads) gives pixels that differ from a default trial. Nothing else differs between the two, so animation alone cannot make this pass. The probe is never set through the console, because opening the console page tears the picture down.
  - **`presets`:**
    - `preset` prints every preset name;
    - `preset <name>` changes the `look` values it names and no `quality` value;
    - `preset nope` prints an error;
    - `reset` restores every default.
  - **`renders-tab`:**
    - after one change the status reads `1 change since last render`;
    - `render` adds one history entry and the status clears;
    - the console accepts input while the render runs.
- **`tests/unit/skill.test.mjs`** adds:
  - the SKILL.md exemplar index names every folder and nothing else;
  - each README is at most 250 words;
  - SKILL.md is at most 1,000 words, and names `pictures.md` and `share.md`, which exist;
  - the skill's description mentions pictures;
  - the existing "nothing in the skill depends on one machine or one person" test scans every file under `skills/knobs/` (exemplars, `pictures.md`, `share.md` included, PNGs excluded), and also rejects the words `wings-vdb`, `mini-pylon/tools`, `cloud` and `bird`.
- **TypeScript.** A third compile test, built like `tests/unit/types.test.mjs` (`tsc -p` on a project under `tests/types/`), checks `skills/knobs/exemplars/**/*.js` with `allowJs` and `checkJs` against the package's public types, and expects no errors.
- **Screenshots.** `npm run exemplars:shots` runs `tests/browser/exemplar-shots.mjs`, which writes each `shot.png`. Under `page.clock`, `requestAnimationFrame`, timers and `performance.now` are fake. A clock installed without a time starts at the real time and runs until paused, which makes a fixed pause target go stale and lets frames depend on how long navigation took. The recipe, shared with the picture tests:
  1. viewport 1280×800; `page.clock.install({ time: T0 })` with one fixed epoch `T0` in the script, then at once `page.clock.pauseAt(T0 + 1000)`, both before `goto`, so no fake time passes during navigation;
  2. `goto`, then `runFor(100)` so the page's start-up timers fire;
  3. open the drawer and the group (or page), `runFor(100)` for the drawer's own timers, then wait about 300 ms of real time for the 220 ms CSS slide, which the clock does not control;
  4. `runFor(500)` so the 66 ms frame throttle lets several frames draw from the same start, giving stateful pictures (trails, traces) the same history every time;
  5. screenshot the `.term-drawer` locator (the tests read the canvas pixels instead).
  - A rerun on one machine gives the same image. The test suite never writes shots; it only checks that they exist. Regenerating is a deliberate step, committed with the change that needs it.
- **Install check.** vercel-labs/skills installs a skill by copying its whole directory recursively (`copyDirectory` in its `src/installer.ts`, skipping only `metadata.json`, `.git`, `__pycache__` and `__pypackages__`), so `exemplars/` and its PNGs arrive. The build confirms it once with `npx skills add` from a local path. Its default mode keeps a copy under `.agents/skills/knobs` inside the user's project, so a project's broad `include` in tsconfig or eslint may pick up the exemplar files; `pictures.md` says so in one line.
- **The issue form,** text-field prefill and the `exemplar` label, is checked by hand once the template is on the default branch, with a link built as `share.md` describes. It cannot be tested before merge.

## Out of scope

- Telemetry of any kind, including opt-in metadata.
- Runtime changes to knobs: presets (#4) and staged changes (#10) stay open issues.
- The mini-pylon camera-rig picture.
- Pixel-diff screenshot tests.
- Shipping exemplars in the npm package or as a package entry point.
- Moving wings-vdb's drawer onto knobs.

## Follow-ups

- If contributions arrive, decide whether opt-in, metadata-only telemetry is worth its own spec (which exemplar was chosen, which control types, whether the check passed the first time), with a grill first.
- When #4 or #10 lands, update the `presets` or `renders-tab` exemplar to use it, or retire it.

## Open questions

None.
