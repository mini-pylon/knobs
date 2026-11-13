---
title: "knobs exemplars: example pictures and drawer extensions for the skill"
kind: spec
target: knobs
topic: exemplars
status: draft
written: 2026-11-13T04:32:25Z
by: claude
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

- **`controls.js`** exports `groups`, an array of plain `Group` objects (`{ name, about, controls }`). A picture exemplar has exactly one group, and its picture is keyed by that group's name. An extension exemplar may have more than one.
- **`visual.js`** has a default export `(store) => (host) => Visual`, normally `canvasVisual(label, () => (pen, w, h, now) => …)`. It reads values only through `store.control('<group>.<key>')`. The label is a real description of the picture, as `aria-label`.
- **`extension.js`** has a default export `(store) => ({ commands?, pages?, status? })`, spread into the `mountKnobs` options.
- Both files are plain JavaScript that starts with `// @ts-check` and types its parameters with JSDoc imports from `knobs`, so they drop into a JS or TS project and type-check against the public types.
- Taking the store as a parameter keeps an exemplar independent of any project's controls file. When adapting one, the agent replaces `store.control` with the project's own `control` import.
- **`README.md`**, at most 250 words, with exactly these sections:
  - `## When`: one sentence naming the kind of group or project it suits.
  - `## What makes it good`: three to five points, each checkable by looking at a screenshot of the drawer.
  - `## Adapting`: what to rename, which stand-in to replace with the project's own code, and what to keep.
  - An extension's README also links the knobs issue that would make it unnecessary ("if knobs grows this, prefer it").
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

### Skill changes (`skills/knobs/SKILL.md`)

- **Description** adds: "or when a control group needs a picture or a drawer command".
- **Step 3, Propose.**
  - For each group, name a picture: the closest exemplar from the index, or "none" where a picture adds nothing (copy text, a lone toggle).
  - Suggest an extension where the project fits one: `presets` when the user talks about distinct looks, `renders-tab` when a change is costly to see.
  - The user trims pictures and extensions with the controls.
- **New step 8, Pictures**, after Reads. Hand over becomes step 9.
  1. Read the chosen exemplar's README, then its code.
  2. Copy it into the project next to the mount component, as `knobs/<group>.js`. Replace `store.control` with the project's `control` import.
  3. Replace stand-in maths with the project's own. Where the page computes the value with a function, import that function, so the picture cannot drift from the page.
  4. Add the picture to `visuals`, or spread the extension into the mount options.
  5. **Check.**
     - Run the dev server, open it with the agent's own browser tool, press backtick, open the group, and screenshot the drawer at full width and at 390 px wide.
     - Compare each "What makes it good" point against the screenshots. Fix what fails and look again.
     - After three rounds, stop and show the user what is still off.
     - With no browser tool, ask the user to open the drawer and send a screenshot.
  6. Show the final screenshot with the hand-over.
- **Wrap up**, new step after the decisions note: **Share** (see Contributing).
- **Never** adds:
  - "Hand over a picture that has not been checked against its exemplar."
  - "Send anything about the user's project anywhere without their yes."
- **Exemplars index**, a section at the end: one line per exemplar with its name, kind and its README's "When" sentence. The index names every folder under `exemplars/` and nothing else.
- SKILL.md stays under about 1,000 words. The detail lives in the READMEs, read one at a time.

### Contributing

- **Issue form.** `.github/ISSUE_TEMPLATE/exemplar.yml` adds the label `exemplar`. Its fields, with these fixed ids:
  - `kind`: dropdown, picture or extension.
  - `when`: input.
  - `good`: textarea, "What makes it good".
  - `controls`: textarea, rendered as `js`.
  - `code`: textarea, rendered as `js`.
  - `screenshot`: textarea, for the image the user drops in.
  - `license`: a required checkbox, "This is my code and I can share it under the MIT license".
- **Share step.** For each picture that passed its check and that the user liked, the agent asks whether to share it.
  1. On a yes, it first offers to make the code generic: project names, copy text and identifying constants become neutral ones.
  2. It shows exactly what each field will hold.
  3. It gives the user a link to `https://github.com/mini-pylon/knobs/issues/new?template=exemplar.yml` with the title `exemplar: <a short name for the picture>` (`title=`) and every field prefilled by its id as a URL-encoded query parameter.
  4. The user opens the link, drops in the screenshot they have already seen, reads it through, and submits it themselves.
  5. If the link would exceed about 8,000 characters, the agent leaves `code` empty and names the file to paste from.
- The agent never files the issue itself: `gh` cannot attach an image, and the user's own submit is the consent.
- **Curation.** The maintainer turns a good submission into a new `exemplars/` folder as an ordinary pull request. The tests cover it from then on.
- **No telemetry.** Nothing is collected or sent passively.

## Testing

- **Fixture.** `tests/fixtures/exemplar/`: a page that reads `?name=<exemplar>`, loads that folder's `controls.js` and `visual.js` or `extension.js`, builds a store with `defineControls(groups)`, and mounts the drawer. Pictures go in as `visuals: { [group.name]: visual(store) }`; extensions are spread into the options. `tests/browser/lib/harness.mjs` gains the alias that lets the fixture import from `skills/knobs/exemplars/`. One server and one browser serve the whole file.
- **`tests/browser/exemplars.test.mjs`** lists every folder under `skills/knobs/exemplars/` and, for each, checks:
  - **Shape:** `README.md` has the three sections in order; `controls.js` exists; exactly one of `visual.js` and `extension.js` exists; `shot.png` exists.
  - **Mounts clean:** the page mounts with no page errors and no console errors.
  - **Pictures:**
    - with the drawer open on the group, the canvas is not blank after a few frames (some pixel differs from the drawer's background);
    - after one of its number controls is set to its maximum through the console, the canvas differs from before.
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
  - the skill's description mentions pictures.
- **TypeScript.** A third compile test, built like `tests/unit/types.test.mjs` (`tsc -p` on a project under `tests/types/`), checks `skills/knobs/exemplars/**/*.js` with `allowJs` and `checkJs` against the package's public types, and expects no errors.
- **Screenshots.** `npm run exemplars:shots` runs `tests/browser/exemplar-shots.mjs`, which writes each `shot.png`:
  - 1280×800 viewport, cropped to the drawer;
  - the clock frozen with Playwright's `page.clock`, so a rerun on one machine gives the same image.
  - The test suite never writes shots; it only checks that they exist. Regenerating is a deliberate step, committed with the change that needs it.
- **Install check.** Early in the build, confirm that `npx skills add mini-pylon/knobs` (from a branch or a local path) installs `exemplars/` with its PNGs, not only `SKILL.md`. If it does not, the index links each exemplar's GitHub URL instead, and this spec is amended.
- **The two issue-form behaviours,** prefill by id and the `exemplar` label, are checked by hand once the template is on the default branch, with a link the agent builds. They cannot be tested before merge.

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
