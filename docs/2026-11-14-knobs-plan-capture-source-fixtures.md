---
title: knobs capture source fixtures implementation plan
kind: plan
target: knobs
topic: capture-source-fixtures
status: draft
written: 2026-11-14T01:39:25Z
by: claude
worktree: /home/jmo/linda/repos/knobs/.worktrees/capture-source-fixtures
---

# knobs capture source fixtures implementation plan

**Goal:** Make wings-vdb and mini-pylon fixtures of knobs: `playground:capture` vendors a dated snapshot of each project's own page, the playground serves it as the capture's source side beside the knobs translation, and the shell, the grid, the shots and a new `playground:check-fixtures` show and check it, with the real snapshots committed under a NOTICE that they are not MIT.
**Architecture:** Capture gains a snapshot step per adapter (copy, import check, and for mini-pylon a record step that runs its own Python); the playground's one Vite server gains a plugin that mounts a middleware-mode Vite instance for wings-vdb, plain files and a `tweak_server.py` stand-in for mini-pylon, and the root paths their pages ask for; one plain module seeds each page through its own storage keys for the shell, the grid, the shots and the check.
**Spec:** `/home/jmo/linda/repos/knobs/.worktrees/capture-source-fixtures/docs/2026-11-13-knobs-spec-capture-source-fixtures.md`
**Base commit:** `acb38aa`
**Executor:** `run-plan`, one headless run per milestone
**Mode:** tests-first

## Global Constraints

- Base commit `acb38aa` on `capture-source-fixtures`: the approved spec on top of `ea8e929` on `main`, with no code change. At the base, `npm run test:unit` gives 235 pass, 0 fail, and `npm run test:browser` gives 195 pass, 0 fail, in about 75 s.
- Counts when each milestone ends: Milestone 1, 257 unit and 196 browser; Milestone 2, 282 and 205; Milestone 3, 284 and 213; Milestone 4, the same. A count that differs is recorded and explained in the closing report.
- Every test in this plan was run before the plan was written, in a throwaway copy of the base, against a rough reference implementation of every task: 284 unit and 213 browser tests passed. Breaking the reference on purpose was caught each time: a clamp that keeps the value's type instead of the bound's fails the int-bound swatch; a wings-vdb tab seeded as a bare string fails the seed's encoding test; a stub whose names go unchecked passes a bad import; a seed that clears only `localStorage` leaves `wings-vdb:defaults-note`; floats printed as JavaScript prints them fail the `dumps` test (no payload the page can send reaches a whole-number float, so the swatch tests alone would not catch it); a capture that leaves a dead run's folder fails the capture test; a capture that does not put back a last capture a dead run left aside fails the recovery test. Three tests caught bugs in the reference itself: an int read from `-0` kept its sign, the grid's knobs cells lost their class, and the shell tests counted the expected font 404s as errors. The reference capture was also run read-only on the real checkouts (snapshots of 408 KB for wings-vdb and 796 KB for mini-pylon, its two finals downscaled to 480 px, and neither checkout's `git status` changed), and the reference check-fixtures passed on those real snapshots: mini-pylon 8 tabs, wings-vdb 7 tabs, fonts local.
- Build each task to its description and no further. A later task's tests fail until its own task, and that is expected. A test that seems impossible to pass means the implementation has drifted from the description: stop and report it. Never weaken, skip or delete a check or a test, and never edit a test to make it pass.
- Dependencies: a worktree starts with no `node_modules`. Run `npm ci --prefer-offline --ignore-scripts` first. Python 3 runs the stand-in checkout's `tools/*.py`; it is on the machine (`python3`).
- Unit tests take a few seconds and run directly: `npm run test:unit`, or `node --test tests/unit/<file>`.
- Browser tests run as check jobs, never backgrounded by hand. One file during a task: `~/linda/skills/handoff-launch/scripts/launch-headless job --repo <worktree> --topic capture-source-<task> --cost 1 -- paced node --test --test-concurrency=1 --test-timeout=60000 <file>` (add `--test-name-pattern='<pattern>'` where the task names one). The whole suite at a milestone's end: `~/linda/skills/handoff-launch/scripts/launch-headless job --repo <worktree> --topic capture-source-browser --cost 1 -- paced npm run test:browser`. Each prints `job <run dir>`. Wait in the foreground with `until [ "$(jq -r .status <run dir>/meta.json)" != running ]; do sleep 10; done`, rerunning it if the shell call times out. `exit:0` passes; the output is `<run dir>/stdout.log`. Exit 8 means not admitted (the machine is busy): wait a minute and launch it again, at most ten launches for one check. After the tenth refusal, stop at that task: do not commit it (a check that could not run has not passed), and end with the closing report, naming the check and the refusal reason the last launch printed on stderr. Never run the browser suite outside a job.
- The live environment. Tests ask the operating system for a free port and never use a fixed one. Tests read only `tests/fixtures/`, never the real projects or the committed `playground/captures/*/source/`: every `servePlayground` a test starts is given a `fonts` folder of the test's own, and every child process a test starts gets `KNOBS_WINGS_FONTS`, `KNOBS_CAPTURES` and `KNOBS_DRAFTS` pointing at the test's own folders under `tests/.tmp/`, which git ignores. Never write to `/home/jmo/linda/repos/wings-vdb` or `/home/jmo/linda/repos/mini-pylon`: both have uncommitted work by other sessions. Only Task 15 reads them, through `playground:capture`, which runs their Python with `-B` and git with `--no-optional-locks`. Never start their dev servers; `playground:capture` uses wings-vdb's on port 5350 only if it is already up. The `knobs-playground` systemd unit serves another worktree; leave it alone.
- Commits go through git-commit, staged by path. The last line of every commit message is exactly `Generated with wings.computer`, and no harness or model is named. Never `git add -A` or `git add .`, and never push.
- Each red's `expected` block is the failure `check-plan` sees when it replays the plan: the base plus every task's tests, with no implementation. An earlier task can change that failure: a file whose import failed at the base loads once an earlier task has made what it imports, and its tests then fail on their assertions. Where a task has an **At this task** line, that line gives the failure you see when you run the red at that task, and it replaces the `expected` text for you. Either way the red command exits non-zero and none of the tests the task adds passes before its implementation.
- Use simple shell commands. If the tree has drifted from a task's assumption (an apply block fails, a test the task adds passes before its implementation, or a red prints neither the failure its **At this task** line gives nor, for a task without one, its `expected` text), stop and report; do not adapt silently.

Defect classes this plan's code could commit (`~/linda/skills/references/defect-classes.md`), with where each applies:

- `strictest-reader`: a value is checked by the strictest rule any reader applies to it. The seed writes each key in the encoding its page reads: wings-vdb compares `wings-vdb:drawer` to the string `1`, and mini-pylon parses every key as JSON (checked: wings-vdb src/terminal.js line 465 at 7f92902, mini-pylon tools/tweak/tweak.js line 6 at b984b47, 2026-11-13); and the stand-in refuses what `tweak_server.py` refuses, with its text.
- `unwritten-contract`: data one component writes and another reads has one written format, and the reader checks it. `capture.json`'s `vendored` and `sourceValues`, and `source/data/*.json`: `sourceSeed` refuses a set without `sourceValues`, `typedVars` refuses a path missing from `types.json`, the shell disables the source side when `vendored` is missing.
- `one-fact-two-places`: a fact is stored in one place. The storage prefixes live in `PREFIXES` and reach the self-contained `seedSource` inside the seed (`clear`), never as a second literal; the root paths live in `ROOT_PATHS`, and the browser tests request every entry through the real server.
- `non-atomic-publish` and `crash-window`: the playground reads the captures folder while capture writes it. Capture builds into a dot folder beside the project's folder and renames it into place; a dot folder left by a run that died is removed by the next run.
- `orphaned-child`: capture's lazy Chromium, check-fixtures' and shots' browsers and servers, and the wings-vdb fixture's Vite instance are closed on every path (`finally`, and the playground's `closeServer` hook).
- `unbounded`: `openSourceTab` has a deadline; the stand-in keeps its newest 100 jobs and 40 swatches and refuses a body over 1 MB.
- `untrusted-input`: request paths and bodies reaching the fixtures. The fonts route serves only its two names, renders only plain `.png` names in `renders/`, a final's file name is checked before capture writes it, and bad JSON answers 400.
- `unknown-as-default`: an unknown value set, project, kind or parameter is refused with its name, never read as a default.
- `lost-error-context` and `partial-failure`: capture's errors name the project and the path; the grid marks each failed source cell with its reason and goes on; check-fixtures lists every failure.
- `version-pinned-expectation`: Python's float text and `json.dumps` output are taken from `python3` at test time, and `swatch.json` is recorded by running the stand-in checkout's own Python, never typed in.
- `complement-assertion`: the grid's one-at-a-time loading is asserted from each source cell's own start and ready times, and each page's state from its own storage and DOM.
- `prose-only-rule`: the NOTICE and the README's account of the source side are asserted by a unit test; "writes nothing in the checkout" and "nothing under the captures folder" by listings before and after.

Where the spec was silent or wrong, this plan decided:

1. **Python's types have their own file.** `source/data/schema.json` stays exactly what `/api/schema` answers (`scene_params.schema()`), and the types JSON loses go in `source/data/types.json`: for each path, the Python type name of its default, and of its `min` and `max` for a number (`int` or `float`). The defaults matter as much as the bounds: `ground.wetness` defaults to the float `0.0` (`tests/fixtures/captures/mini-pylon/tools/scene_params.py:27` at `acb38aa`).
2. **The swatch payloads are chosen from the schema.** The first number whose maximum is a float, pushed 1.25 past it (`ground.wear` to 2.75); the first whose maximum is an int, pushed 5.5 past it (`ground.wetness` to 6.5, which Python clamps to the int 1; the spec's `light.sun_elevation: 90.5` was an example of the rule); the first colour in lowercase with the first toggle sent as `true`. Each payload is `JSON.stringify({ kind: 'preview', values })` of every default as the page holds it, as the page sends it (checked: mini-pylon tools/tweak/tweak.js lines 85-91 at b984b47, 2026-11-13). The real and the stand-in `scene_params.py` are the same file (checked: `cmp` of the two, 2026-11-13), so the same four paths are chosen. The fourth payload's swatch equals the defaults' (upper-casing and `int(True)` give the default scene back), which is what Python answers and what the port must reproduce.
3. **Recording runs the project's own Python twice.** Once for the schema, types, defaults and finals; then once with the four payload texts JavaScript wrote from that schema. Finals are listed by calling `tweak_server.Renders.finals` on a stand-in object holding only `finals_dir`, so no queue thread starts and the server's own ordering is kept. The stand-in checkout's `tools/tweak_server.py` holds copies of the two parts capture calls (`write_swatch_png` and `Renders.finals`).
4. **The shell clicks the tab.** wings-vdb restores only its active group from `wings-vdb:groups`; its drawer always opens on the console (checked: `let view = 'console'` in wings-vdb src/terminal.js line 79 at 7f92902, 2026-11-13). So after the seed, the shell, the grid, the shots and the check open the tab by clicking it in the page (same origin), and wait until `.term.open` and that `.term-tab` has `.active`; both projects' drawers use these classes. The seed still writes the group, so the first paint is the asked group.
5. **mini-pylon's view follows the tab:** a group tab writes `view` `"params"` and `group`; `renders` writes `view` `"renders"`; the console tab (`mini-pylon`) writes `"console"`. The spec named only `"params"`.
6. **The source side's default tab** is the capture's first visible group, as on the knobs side.
7. **The switch maps tabs.** A visible group stays; the console tab becomes the other side's (`wings-vdb` and `knobs-wings-vdb`); any other tab (`perf`, `performance`, `renders`) is dropped, so the other side opens on its default.
8. **The fonts folder is not in `capture.json`.** `capture.json` is public, so it records no local path. The fonts route reads `KNOBS_WINGS_FONTS` when set, else `public/fonts/` of the wings-vdb adapter's default checkout (`playground/adapters/wings-vdb.mjs:15` at `acb38aa`). `servePlayground` takes a `fonts` option over both, and every test passes its own.
9. **Snapshots are mounted when the server starts.** A capture made while the playground runs shows after a restart (README). A project with no snapshot answers 404 under its prefix, naming the capture command, instead of falling through to the playground's own pages.
10. **Capture publishes atomically.** It builds into `<out>/.<project>-<random>`, which the playground's globs skip (Vite's `import.meta.glob` leaves dot folders out unless `exhaustive`; checked: `node_modules/vite/dist/node/chunks/node.js:27726`, vite 8.3.8, 2026-11-13), then moves the last capture aside to `<out>/.<project>-old-<random>`, renames the new one into place, and removes the old one. A failed capture leaves the last one as it was. A run that died between the two renames left no `<project>` folder and the last capture aside: the next run renames it back before anything else.
11. **Only a render wider than the preview size is downscaled;** a smaller one (the stand-in's 2×2 render) is copied as it is. Chromium is launched for it only when needed.
12. **Grid capture rows** are the capture's visible groups. Their cells default to 960×600, since wings-vdb hides its pictures below 761 px (checked: a `matchMedia` query with a 761 px minimum width in wings-vdb src/terminal.js line 84 at 7f92902, 2026-11-13). `set=all` keeps one knobs cell per capture, as now.
13. **check-fixtures reads the pictures' pixels in the page.** wings-vdb's pictures are 2D canvases (checked: `getContext` for a 2D context in wings-vdb src/viz.js lines 97 and 112 at 7f92902, 2026-11-13). On 2026-11-13 a Playwright screenshot of the live WebGL page stalled past 20 s with the Vulkan flags, on the fixture and on wings-vdb's own dev server alike, so the check takes no screenshot. It also skips a hidden canvas: wings-vdb keeps the last picture, hidden, on a tab without one.
14. **Tests are split by task**, so each task's tests import only what exists by then: unit tests in `playground-capture` (extended), `playground-snapshot`, `playground-python`, `playground-standin`, `playground-source-side`, `playground-routes` and `playground-notice`; browser tests in `capture-downscale`, `source-serve`, `source-shell` and `check-fixtures`, with `playground.test.mjs` changed where the spec names. The spec named two unit files and one browser file.
15. **The stand-in's edges:** a method other than GET or POST answers 405, `values` that is not an object 400, a body over 1 MB is refused; job ids are `<n>-fixture`; a final's job keeps the size it was asked for. `GET /captures/wings-vdb/fonts` doubles as the same-origin page shots and check-fixtures load to write a seed before opening a source page.
16. **The stubs are resolved by path,** by a `resolveId` plugin that maps the resolved `src/chat.js` and `src/dev-report.js` to the stubs whichever module imports them, not by a string alias on `./chat.js`.
17. **The stand-in wings-vdb checkout runs.** Its `src/main.js` and `src/terminal.js` become small working stand-ins that keep the lines the adapter reads (the four commands, `HIDDEN_TABS`, the slash actions), so the existing adapter tests hold. `lib/captures.mjs` gives it a second shot (tab `dispersal`), so the grid's shot cell is tested; the capture-view test reads the first.
18. **The real snapshots are committed in Milestone 4**, after check-fixtures passes on them. The spec's sizes were estimates: the reference made 408 KB for wings-vdb and 796 KB for mini-pylon (two 480 px renders of about 360 KB each).
- Checked 2026-11-14 at acb38aa: 37 apply blocks, 16 reds as quoted, 6 probes pass, 19 code citations, 12 checked, 0 unchecked.

## Review Focus

1. **The real pages, past what the stand-ins exercise.** The tests run the stand-in checkouts. The real wings-vdb `main.js` may call the chat thread in paths no test reaches: open the chat on the real snapshot, type a line, run `/clouds` and `/perf`, and watch the console. The stub's shape covers the uses in lines 640-663 of `main.js` (checked: wings-vdb src/main.js at 7f92902, 2026-11-13), not every caller.
2. **How alike the two sides look.** Nothing compares pixels (out of scope). Put the grid's three cells side by side for each tab of the real snapshots, at 960 px and at the shell's widths, and look for anything the source side draws differently from its shot: fonts, the cloud, the pictures, the preview pane.
3. **GPU stalls.** A screenshot of the live WebGL page stalled on this machine on 2026-11-13. `playground:shots` takes screenshots of the source side, and `playground:capture` of the dev server; on the real wings-vdb either can stall. Check how they fail (a Playwright timeout naming the page), and that check-fixtures, which takes none, still passes.
4. **Storage on the shared origin.** The seed clears every `wings-vdb:` and `mini-pylon-tweak:` key of the playground's origin, in both storages, and nothing else. Check that no knobs key (`knobs-*`, `knobs-playground:json`) is touched, and that a source page in a second tab is reseeded only when its own shell or grid loads.
5. **What becomes public.** Read the committed `source/` folders (Task 15) for secrets, tokens, private URLs or names that should not ship, beyond what the NOTICE covers. No font, no `public/options/` media and no `chat.js` may be among them.
6. **The Python port beyond the pinned payloads.** The four swatch payloads, the float texts and the `coerce` cases are pinned against Python. A value the page cannot send (an exponent, a huge int, a non-ASCII choice) is covered only by the port's rules; read `python.mjs` against `scene_params.py` and `json.dumps` for those.
7. **Restart after capture.** The fixtures are mounted at server start (decision 9). Check the README's instruction and what a stale server shows for a replaced snapshot.

## Milestones

- **Milestone 1: snapshots** (Tasks 1 to 4). Ends with `playground:capture` writing `source/` and `vendored` for both projects, value sets carrying `sourceValues`, and a capture that fails leaving the last one in place. Reviewer brief: run `npm run playground:capture -- mini-pylon tests/fixtures/captures/mini-pylon --out <tmp> --dev http://127.0.0.1:9/` and read what it wrote; check the import check against `imports()`'s regexes for a multi-line import, a comment and `import.meta`; check that recording leaves nothing in the checkout and runs Python only with `-B`.
- **Milestone 2: serving** (Tasks 5 to 8). Ends with the playground serving both source pages under their prefixes with their root paths, the wings-vdb fixture's HMR on the playground's port, and the stand-in answering as `tweak_server.py` does. Reviewer brief: check Review Focus 4 and 6; check that every route is added in the hook's body, that `closeServer` closes the fixture, and that no route serves a path outside its folder.
- **Milestone 3: the playground** (Tasks 9 to 14). Ends with the shell's source side and switch, the grid's capture rows, the source shots, check-fixtures, the NOTICE and the README. Reviewer brief: open the shell and the grid on the stand-in captures (`KNOBS_CAPTURES=<tmp> KNOBS_WINGS_FONTS=<empty tmp> npm run playground -- --port <free port>`) and check Review Focus 2 and 7; read the README's source-side section as a newcomer would.
- **Milestone 4: the real snapshots** (Task 15). Ends with both projects' real snapshots committed and passing check-fixtures. It does not run unattended: Task 15 needs wings-vdb's dev server up on port 5350, which only Josh starts, so the driver runs it with him once the server is up. Reviewer brief: check Review Focus 1, 3 and 5 on the committed snapshots, and that both checkouts' `git status` is as it was before the capture.

## Facts the plan relies on

The first probe installs the dependencies every later block needs:

```bash probe
npm ci --prefer-offline --ignore-scripts >/dev/null 2>&1 && echo installed
```

```expected
installed
```

```bash probe
node -p '"node " + process.versions.node.split(".")[0]'; python3 -c 'import sys; print("python", sys.version_info[0])'
```

```expected
node 24
python 3
```

`JSON.parse` hands a reviver each primitive's source text (the stand-in's `loads` reads ints and floats apart by it), and the pinned tool versions:

```bash probe
node -e 'console.log(JSON.parse("[1.0, 2]", (k, v, c) => c?.source ?? v).join(" "))'; node -p "require('vite/package.json').version + ' ' + require('playwright/package.json').version"
```

```expected
1.0 2
8.3.8 1.64.1
```

```bash probe
npm run test:unit 2>&1 | grep -E '^ℹ (tests|pass|fail) '
```

```expected
ℹ tests 235
ℹ pass 235
ℹ fail 0
```

Vite 8.3.8 runs each plugin's `closeServer` hook when a server closes, takes `server.ws.server` for the HMR socket, and leaves dot folders out of `import.meta.glob`:

```bash probe
grep -c 'getSortedPluginHooks("closeServer")' node_modules/vite/dist/node/chunks/node.js; grep -c 'const wsCustomServer = wsOptions?.server;' node_modules/vite/dist/node/chunks/node.js; sed -n 27726p node_modules/vite/dist/node/chunks/node.js
```

```expected
1
1
							dot: !!i.options.exhaustive,
```

The lines the playground tasks change, as they are at the base:

```bash probe
sed -n 13p playground/stage.js; sed -n 45p playground/shell.js; sed -n 84p playground/grid.js; sed -n 39p playground/shots.mjs; sed -n 38p playground/adapters/common.mjs
```

```expected
const NAME = /^(exemplar|draft|capture):/.test(id) ? id.slice(id.indexOf(':') + 1) : 'playground';
frame.src = `./stage.html?${stageQuery}`;
Promise.all(ids.map(cell)).then(() => { document.body.dataset.ready = '1'; });
    ids = await page.locator('.cell iframe').evaluateAll(frames => frames.map(f => f.title));
export function valueSet(groups, about, values, dropped = []) {
```

### Task 1: value sets carry the source's own values

**Files:** edit `playground/adapters/common.mjs`, `playground/adapters/wings-vdb.mjs`, `playground/adapters/mini-pylon.mjs` and `tests/unit/playground-capture.test.mjs`.

**Interfaces.**

- `valueSet(groups, about, values, dropped = [], sourceValues = values)` in `playground/adapters/common.mjs` returns `{ about, values, sourceValues, dropped? }`, keys in that order; `values` is checked as now (`playground/adapters/common.mjs:37-42` at `acb38aa`), `sourceValues` is the object given, unchanged.

The tests:

```bash apply
python3 - <<'PLAN_EOF'
# Edits tests/unit/playground-capture.test.mjs: each old text must be there exactly once.
path = 'tests/unit/playground-capture.test.mjs'
text = open(path, encoding='utf-8').read()
edits = [
    (r'''import { build, checkValues, source } from '../../playground/adapters/common.mjs';''',
     r'''import { build, checkValues, source, valueSet } from '../../playground/adapters/common.mjs';'''),
]
for old, new in edits:
    assert text.count(old) == 1, f'{path}: expected once: {old[:70]!r}'
    text = text.replace(old, new)
text += r'''
// The source side starts each project's own page with these, in its own form.
test('each value set carries the source\'s own values: wings-vdb\'s report as saved, mini-pylon\'s presets and finals as written', async () => {
  const wings = await wingsVdb.read(join(fixtures, 'wings-vdb'), { reports });
  assert.deepEqual(wings.valueSets.defaults.sourceValues, {});
  const report = JSON.parse(readFileSync(join(reports, 'fixture01.json'), 'utf8'));
  // Old names and all: the page migrates them itself.
  assert.deepEqual(wings.valueSets.fixture01.sourceValues, JSON.parse(report.storage['wings-vdb:params']));
  const pylon = await miniPylon.read(join(fixtures, 'mini-pylon'));
  assert.deepEqual(pylon.valueSets.defaults.sourceValues, {});
  assert.deepEqual(pylon.valueSets.dusk.sourceValues, {
    'light.sun_elevation': 4, 'light.sun_strength': 2.5, 'light.sun_warmth': 0.9, 'light.sky_fill': 0.12, 'light.sky_reflect': 0.5, 'light.haze': 4,
  });
  const final = JSON.parse(readFileSync(join(fixtures, 'mini-pylon', 'renders', 'hyperreal', 'tweaks', 'help-20261111-173007-2160.json'), 'utf8'));
  assert.deepEqual(pylon.valueSets['help-20261111-173007-2160'].sourceValues, final.values);
});

test('valueSet keeps the values it is given as sourceValues unless told otherwise', () => {
  const groups = [{ name: 'g', controls: [{ key: 'n', type: 'number', value: 1, min: 0, max: 2, step: 0.1 }] }];
  assert.deepEqual(valueSet(groups, 'a set', { 'g.n': 1.5 }), { about: 'a set', values: { 'g.n': 1.5 }, sourceValues: { 'g.n': 1.5 } });
  assert.deepEqual(valueSet(groups, 'a set', { 'g.n': 1.5 }, [], { 'old.n': 1.5 }).sourceValues, { 'old.n': 1.5 });
});
'''
open(path, 'w', encoding='utf-8').write(text)
PLAN_EOF
```

```bash red
node --test tests/unit/playground-capture.test.mjs
```

```expected
✖ each value set carries the source's own values
```

**Implementation.** In `playground/adapters/wings-vdb.mjs`, the defaults set passes `{}` as its `sourceValues`, and each browser report passes `saved`, the object parsed from the report's `wings-vdb:params` before `migrate()` (`playground/adapters/wings-vdb.mjs:58-62` at `acb38aa`): old names and all, since the page migrates them itself. In `playground/adapters/mini-pylon.mjs`, the defaults pass `{}`, each preset `preset.values ?? {}` and each final `final.values ?? {}` (`playground/adapters/mini-pylon.mjs:41-52` at `acb38aa`), the same objects their `values` come from. Update the comment above `valueSet`.

**Checks.** `node --test tests/unit/playground-capture.test.mjs` gives 17 pass; `npm run test:unit` gives 237 pass.

**Commit.** `feat(capture): keep each value set in its project's own form`, staging the four files.

### Task 2: the wings-vdb snapshot, its stubs, and PNG helpers

**Files:** create `playground/png.mjs`, `playground/fixtures/wings-vdb/stubs/chat.js`, `playground/fixtures/wings-vdb/stubs/dev-report.js` and `tests/unit/playground-snapshot.test.mjs`; edit `playground/adapters/common.mjs` and `playground/adapters/wings-vdb.mjs`; create and rewrite files of the stand-in checkout `tests/fixtures/captures/wings-vdb/`.

**Interfaces.**

- `playground/adapters/common.mjs` exports `repo` (the knobs checkout's absolute path, from `fileURLToPath(new URL('../..', import.meta.url))`), `imports(text)` and `snapshot(adapter, checkout, sourceDir, { downscale } = {})`.
- `imports(text)` returns `[{ specifier, names }]`: first every static `import` statement whose line starts with `import` (after spaces), in source order; then every `export { … } from` and `export * from`, in source order; then every dynamic `import('<literal>')`. `names` for an import clause: the names inside braces, each before any `as`, then `'default'` for a default binding; none for a namespace (`* as x`) or a side-effect import; for `export { f } from`, the names in the braces; for `export *` and dynamic imports, none. A commented-out import and `import.meta` are not imports.
- `snapshot(adapter, checkout, sourceDir, { downscale })` returns `{ files: [{ path, from, sha256 }], stubs: [{ module, by }], recorded }`, with `files` in the adapter's `vendor` order and `recorded` what `adapter.record` returned (`[]` without one).
- An adapter gains `vendor` (`[{ from, to }]`, paths in the checkout and under `source/`), `stubs` (`[{ module, by }]`: the checkout path a stub replaces, and the stub's path in knobs) and, optionally, `inputs` (checkout paths capture reads besides `vendor`) and `record(checkout, sourceDir, { downscale })`.
- `playground/png.mjs` exports `pngSize(buffer)` (`{ width, height }`), `encodePng(width, height, rgb)` and `decodePng(buffer)` (`{ width, height, channels, pixels }`).

The stand-in checkout: the drawer's stand-in pages and modules, each small, with the lines the adapter reads kept as they are.

```bash apply
mkdir -p tests/fixtures/captures/wings-vdb
cat > tests/fixtures/captures/wings-vdb/index.html <<'PLAN_EOF'
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Wings</title>
  <link rel="icon" href="data:,">
</head>
<body>
  <!-- Stand-in for wings-vdb's index.html: its absolute script and image URLs, which the fixture's Vite serves under its base. -->
  <div class="sky"><canvas id="cloud"></canvas><img class="fallback" src="/cloud-fallback.svg" alt=""></div>
  <section id="chat" class="chat"><form><input name="message"></form><div class="chat-thread"></div><div class="chat-pills"></div></section>
  <script type="module" src="/src/main.js"></script>
</body>
</html>
PLAN_EOF
```
```bash apply
mkdir -p tests/fixtures/captures/wings-vdb/src
cat > tests/fixtures/captures/wings-vdb/src/main.js <<'PLAN_EOF'
// Stand-in for wings-vdb's src/main.js: the drawer commands the capture
// adapter lists, and the page's uses of what the fixture stubs or serves at
// the server root (the chat thread, /__wings/defaults, /wings-wide.svg).
import './style.css';
import { mountCloudMorph } from './cloud-morph.js';
import { mountTerminal } from './terminal.js';
import { perfPage } from './perf.js';
import { paramVisuals } from './viz.js';
import * as params from './params.js';
import { fragmentSource } from './shader.js';
import { postSource } from './post.js';
import { flockKinds } from './birds.js';
import { mountChatThread } from './chat.js';
import { details, renderDetail } from './detail.js';
import { reportSettings } from './dev-report.js';
import { flags, WAITLIST_URL } from './flags.js';

reportSettings();
document.body.dataset.waitlist = String(flags.waitlist);
document.body.dataset.modules = [fragmentSource, postSource, flockKinds.join(' '), WAITLIST_URL].join('|');
mountCloudMorph();

const terminal = mountTerminal({
  pages: [perfPage()],
  visuals: paramVisuals(),
  commands: {
    goto: { usage: '<progress|name>', about: 'scroll to a progress value or shape', run([arg]) {
      return `goto ${arg ?? ''}`;
    } },
    ui: { usage: 'on|off', about: 'show or hide the page\'s UI', run([arg]) {
      return `ui ${arg ?? ''}`;
    } },
    shot: { usage: '[width]', about: 'download a high-res PNG of the frame', run([arg]) {
      return `shot ${arg ?? ''}`;
    } },
    defaults: { usage: '[dry] [group|group.key ...]', about: 'make the current values the defaults in src/params.js', run(args) {
      fetch('/__wings/defaults', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ values: params.values, wants: args, dryRun: false }) })
        .then(r => (r.ok ? r.json() : Promise.reject(new Error(`server said ${r.status}`))))
        .then(({ changes, errors }) => {
          for (const e of errors) terminal.print(`defaults: ${e}`, 'err');
          if (!changes.length) terminal.print('defaults: nothing to change', 'dim');
        })
        .catch(error => terminal.print(`defaults: only on the dev server (${error.message})`, 'err'));
      return 'saving…';
    } },
  },
});
terminal.run('defaults');

// As the real page lays out its chat: the thread's getters, its pills and its fit.
const thread = mountChatThread({ thread: document.querySelector('.chat-thread'), pills: document.querySelector('.chat-pills'), input: document.querySelector('.chat input') });
const pills = thread.layoutPills({ width: 300, top: 0 });
const room = Math.max(0, thread.fit(120));
document.body.dataset.chat = `${thread.empty ? 'empty' : 'thread'} ${thread.expanded ? 'expanded' : 'panel'} ${pills.height + room} ${pills.boxes.length}`;
renderDetail(document.body.appendChild(document.createElement('section')), Object.keys(details)[0]);
PLAN_EOF
```
```bash apply
mkdir -p tests/fixtures/captures/wings-vdb/src
cat > tests/fixtures/captures/wings-vdb/src/terminal.js <<'PLAN_EOF'
// Stand-in for wings-vdb's src/terminal.js: the lines the capture adapter
// reads (HIDDEN_TABS and the slash actions), and a drawer with the real one's
// classes and storage keys. Like the real one, it opens on the console and
// restores only its active group: wings-vdb:groups (a JSON array of names) in
// localStorage, and the drawer open when wings-vdb:drawer is '1' in
// sessionStorage.
import * as params from './params.js';

const HIDDEN_TABS = new Set(['hover', 'birds', 'opening']);

export function mountTerminal({ commands = {}, pages = [], visuals = {} } = {}) {
  const slashActions = [
    { name: 'save', usage: '[name]', about: 'download the whole configuration as a JSON file' },
    { name: 'shot', usage: '[width]', about: 'download a high-res PNG of the current frame' },
    { name: 'load', usage: '', about: 'load a saved configuration file' },
  ];
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  };
  const root = el('div', 'term');
  root.innerHTML = '<section class="term-drawer"><nav class="term-tabs"></nav><div class="term-vars"></div><div class="term-viz"></div><div class="term-log"></div><label class="term-prompt"><span>wings-vdb $</span><input></label></section>';
  document.body.append(root);
  const tabs = root.querySelector('.term-tabs');
  const varsBox = root.querySelector('.term-vars');
  const vizBox = root.querySelector('.term-viz');
  const log = root.querySelector('.term-log');
  const input = root.querySelector('.term-prompt input');

  const GROUPS = 'wings-vdb:groups';
  let active = params.groups[0].name;
  try {
    const saved = JSON.parse(localStorage.getItem(GROUPS));
    const name = Array.isArray(saved) && saved.map(params.migrateGroup).find(n => !HIDDEN_TABS.has(n) && params.groups.some(g => g.name === n));
    if (name) active = name;
  } catch {}
  let view = 'console';

  function renderTabs() {
    const tab = (label, on, click) => {
      const button = el('button', `term-tab${on ? ' active' : ''}`, label);
      button.type = 'button';
      button.onclick = click;
      return button;
    };
    tabs.replaceChildren(
      tab('wings-vdb', view === 'console', () => setView('console')),
      ...pages.map(page => tab(page.label ?? page.name, view === page.name, () => setView(page.name))),
      ...params.groups.filter(g => !HIDDEN_TABS.has(g.name)).map(g => tab(g.name, view === 'params' && active === g.name, () => {
        active = g.name;
        try { localStorage.setItem(GROUPS, JSON.stringify([active])); } catch {}
        setView('params');
      })),
    );
  }
  function renderVars() {
    const group = params.groups.find(g => g.name === active);
    varsBox.replaceChildren(...(view === 'params' ? group.vars.map(v => {
      const row = el('div', 'term-row');
      row.dataset.path = v.path;
      row.append(el('span', 'term-key', v.key), el('span', 'term-value', String(params.values[v.path])));
      return row;
    }) : []));
    vizBox.replaceChildren();
    const viz = view === 'params' && root.classList.contains('open') && visuals[active] ? visuals[active](vizBox) : null;
    viz?.frame(0);
  }
  function setView(next) {
    view = next;
    renderTabs();
    renderVars();
  }
  function toggle(open = !root.classList.contains('open')) {
    root.classList.toggle('open', open);
    try { sessionStorage.setItem('wings-vdb:drawer', open ? '1' : '0'); } catch {}
    renderVars();
  }
  function print(text, cls = '') {
    log.append(el('div', `term-line ${cls}`, text));
  }
  function run(line) {
    const [name, ...args] = line.trim().split(/\s+/);
    if (commands[name]) print(String(commands[name].run(args) ?? ''));
    else if (slashActions.some(a => a.name === name)) print(`/${name} is not in the stand-in`);
  }
  addEventListener('keydown', event => {
    if (event.key === '`') { event.preventDefault(); toggle(); }
  });
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') { run(input.value); input.value = ''; }
  });

  renderTabs();
  renderVars();
  try { if (sessionStorage.getItem('wings-vdb:drawer') === '1') toggle(true); } catch {}
  return { print, toggle, run };
}
PLAN_EOF
```
```bash apply
mkdir -p tests/fixtures/captures/wings-vdb/src
cat > tests/fixtures/captures/wings-vdb/src/viz.js <<'PLAN_EOF'
// Stand-in for wings-vdb's src/viz.js: one picture, for the dispersal tab, a
// line on a canvas that follows dispersal.curve.
import * as params from './params.js';

export function paramVisuals() {
  return {
    dispersal(box) {
      const canvas = document.createElement('canvas');
      canvas.width = 160;
      canvas.height = 90;
      box.append(canvas);
      const ctx = canvas.getContext('2d');
      return {
        frame() {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.strokeStyle = '#334';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(0, 80);
          ctx.lineTo(160, 80 - 70 * params.values['dispersal.curve'] / 8);
          ctx.stroke();
        },
      };
    },
  };
}
PLAN_EOF
```
```bash apply
mkdir -p tests/fixtures/captures/wings-vdb/src
cat > tests/fixtures/captures/wings-vdb/src/perf.js <<'PLAN_EOF'
// Stand-in for wings-vdb's src/perf.js: an extra drawer page named perf.
export function perfPage() {
  return { name: 'perf', about: 'frame rate and shader cost', mount(el) { el.textContent = 'perf'; return {}; } };
}
PLAN_EOF
```
```bash apply
mkdir -p tests/fixtures/captures/wings-vdb/src
cat > tests/fixtures/captures/wings-vdb/src/cloud-morph.js <<'PLAN_EOF'
// Stand-in for wings-vdb's src/cloud-morph.js: it fetches the wordmark from
// the server root, as the real one's default svgUrl does.
export function mountCloudMorph({ svgUrl = '/wings-wide.svg' } = {}) {
  return fetch(svgUrl).then(r => r.text()).then(text => {
    document.body.dataset.wordmark = text.includes('<svg') ? 'loaded' : 'missing';
  });
}
PLAN_EOF
```
```bash apply
mkdir -p tests/fixtures/captures/wings-vdb/src
cat > tests/fixtures/captures/wings-vdb/src/shader.js <<'PLAN_EOF'
// Stand-in for wings-vdb's src/shader.js.
export const fragmentSource = 'shader';
PLAN_EOF
```
```bash apply
mkdir -p tests/fixtures/captures/wings-vdb/src
cat > tests/fixtures/captures/wings-vdb/src/post.js <<'PLAN_EOF'
// Stand-in for wings-vdb's src/post.js.
export const postSource = 'post';
PLAN_EOF
```
```bash apply
mkdir -p tests/fixtures/captures/wings-vdb/src
cat > tests/fixtures/captures/wings-vdb/src/birds.js <<'PLAN_EOF'
// Stand-in for wings-vdb's src/birds.js.
export const flockKinds = ['none', 'gulls'];
PLAN_EOF
```
```bash apply
mkdir -p tests/fixtures/captures/wings-vdb/src
cat > tests/fixtures/captures/wings-vdb/src/detail.js <<'PLAN_EOF'
// Stand-in for wings-vdb's src/detail.js: footer copy, one entry.
export const details = { wings: 'Wings, the stand-in.' };
export function renderDetail(root, name) {
  root.className = 'detail';
  root.textContent = details[name] ?? '';
}
PLAN_EOF
```
```bash apply
mkdir -p tests/fixtures/captures/wings-vdb/src
cat > tests/fixtures/captures/wings-vdb/src/flags.js <<'PLAN_EOF'
// Stand-in for wings-vdb's src/flags.js: flags stored as JSON under
// wings-vdb:flags, read once on load.
export const FLAGS = ['waitlist'];
export const WAITLIST_URL = '#waitlist';
function stored() {
  try { return JSON.parse(localStorage.getItem('wings-vdb:flags') ?? '{}') ?? {}; } catch { return {}; }
}
export const flags = Object.fromEntries(FLAGS.map(name => [name, stored()[name] === true]));
PLAN_EOF
```
```bash apply
mkdir -p tests/fixtures/captures/wings-vdb/src
cat > tests/fixtures/captures/wings-vdb/src/chat.js <<'PLAN_EOF'
// Stand-in for wings-vdb's src/chat.js, the scripted agent. The fixture never
// serves this file: it serves playground/fixtures/wings-vdb/stubs/chat.js.
export function mountChatThread() {
  throw new Error('the real chat.js must not reach the fixture');
}
export function respond() {
  throw new Error('the real chat.js must not reach the fixture');
}
PLAN_EOF
```
```bash apply
mkdir -p tests/fixtures/captures/wings-vdb/src
cat > tests/fixtures/captures/wings-vdb/src/dev-report.js <<'PLAN_EOF'
// Stand-in for wings-vdb's src/dev-report.js. The fixture never serves this
// file: it serves playground/fixtures/wings-vdb/stubs/dev-report.js.
export function reportSettings() {
  throw new Error('the real dev-report.js must not reach the fixture');
}
PLAN_EOF
```
```bash apply
mkdir -p tests/fixtures/captures/wings-vdb/src
cat > tests/fixtures/captures/wings-vdb/src/style.css <<'PLAN_EOF'
/* Stand-in for wings-vdb's src/style.css: its two faces from /fonts/, at the server root. */
@font-face { font-family: 'ABC Areal'; src: url('/fonts/ABCArealVariable.woff2') format('woff2'); }
@font-face { font-family: 'ABC Areal Mono'; src: url('/fonts/ABCArealMonoVariable.woff2') format('woff2'); }
body { margin: 0; font-family: 'ABC Areal', system-ui, sans-serif; }
.term { position: fixed; right: 0; bottom: 0; width: 520px; background: #fff; display: none; }
.term.open { display: block; }
.term-log { font-family: 'ABC Areal Mono', ui-monospace, monospace; }
.term-tab.active { font-weight: bold; }
PLAN_EOF
```
```bash apply
mkdir -p tests/fixtures/captures/wings-vdb/public
cat > tests/fixtures/captures/wings-vdb/public/cloud-fallback.svg <<'PLAN_EOF'
<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="#ccd"/></svg>
PLAN_EOF
```
```bash apply
mkdir -p tests/fixtures/captures/wings-vdb/public
cat > tests/fixtures/captures/wings-vdb/public/wings-wide.svg <<'PLAN_EOF'
<svg xmlns="http://www.w3.org/2000/svg" width="8" height="2"><rect width="8" height="2" fill="#223"/></svg>
PLAN_EOF
```
```bash apply
mkdir -p tests/fixtures/captures/wings-vdb/public/fonts
cat > tests/fixtures/captures/wings-vdb/public/fonts/ABCArealVariable.woff2 <<'PLAN_EOF'
not a font
PLAN_EOF
```

The snapshot tests, for this task and Tasks 3 and 4. This task's are the ones named `wings-vdb: `, `imports: `, `stub: ` and `png: `:

```bash apply
mkdir -p tests/unit
cat > tests/unit/playground-snapshot.test.mjs <<'PLAN_EOF'
// Snapshots (playground/adapters, snapshot in common.mjs): a dated copy of a
// project's own page in <capture>/source/, which the playground serves as
// the capture's source side. Every test reads the stand-in checkouts under
// tests/fixtures/captures, never the real projects.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { imports, snapshot } from '../../playground/adapters/common.mjs';
import * as miniPylon from '../../playground/adapters/mini-pylon.mjs';
import * as wingsVdb from '../../playground/adapters/wings-vdb.mjs';
import { decodePng, encodePng, pngSize } from '../../playground/png.mjs';
import * as chat from '../../playground/fixtures/wings-vdb/stubs/chat.js';
import * as devReport from '../../playground/fixtures/wings-vdb/stubs/dev-report.js';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const fixtures = join(repo, 'tests', 'fixtures', 'captures');
const scratch = () => {
  mkdirSync(join(repo, 'tests', '.tmp'), { recursive: true });
  return mkdtempSync(join(repo, 'tests', '.tmp', 'snapshot-'));
};
// A private copy of a stand-in checkout, to break on purpose.
const copy = (dir, name) => {
  cpSync(join(fixtures, name), join(dir, name), { recursive: true });
  return join(dir, name);
};
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const files = dir => readdirSync(dir, { recursive: true }).filter(f => statSync(join(dir, f)).isFile()).sort();
const never = () => { throw new Error('downscale was not expected'); };

test('wings-vdb: the snapshot is the listed files byte for byte, each with its source path and sha256, and the stubs', async () => {
  const dir = scratch();
  try {
    const source = join(dir, 'source');
    const vendored = await snapshot(wingsVdb, join(fixtures, 'wings-vdb'), source, { downscale: never });
    const listed = ['index.html', ...['main', 'terminal', 'viz', 'perf', 'params', 'birds', 'cloud-morph', 'shader', 'post', 'detail', 'flags'].map(n => `src/${n}.js`), 'src/style.css', 'public/cloud-fallback.svg', 'public/wings-wide.svg'];
    assert.deepEqual(vendored.files.map(f => f.path), listed);
    assert.deepEqual(files(source), [...listed].sort());
    for (const file of vendored.files) {
      const original = readFileSync(join(fixtures, 'wings-vdb', file.from));
      assert.equal(file.from, file.path, 'every wings-vdb file keeps its path');
      assert.deepEqual(readFileSync(join(source, file.path)), original, file.path);
      assert.equal(file.sha256, sha256(original), file.path);
    }
    assert.deepEqual(vendored.stubs, [
      { module: 'src/chat.js', by: 'playground/fixtures/wings-vdb/stubs/chat.js' },
      { module: 'src/dev-report.js', by: 'playground/fixtures/wings-vdb/stubs/dev-report.js' },
    ]);
    assert.deepEqual(vendored.recorded, []);
    // No font, no chat.js, no dev-report.js.
    assert.ok(!existsSync(join(source, 'public', 'fonts')));
    assert.ok(!existsSync(join(source, 'src', 'chat.js')) && !existsSync(join(source, 'src', 'dev-report.js')));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('imports: each static, re-exported and dynamic import with the names it takes', () => {
  const text = [
    "import './style.css';",
    "import * as params from './params.js';",
    "import def, { a, b as c } from './x.js';",
    'import {\n  d,\n  e,\n} from "./y.js";',
    "export { f } from './z.js';",
    "export * from './w.js';",
    "const late = await import('./late.js');",
    "// import nope from './comment.js';",
    'if (import.meta.hot) import.meta.hot.accept();',
  ].join('\n');
  assert.deepEqual(imports(text), [
    { specifier: './style.css', names: [] },
    { specifier: './params.js', names: [] },
    { specifier: './x.js', names: ['a', 'b', 'default'] },
    { specifier: './y.js', names: ['d', 'e'] },
    { specifier: './z.js', names: ['f'] },
    { specifier: './w.js', names: [] },
    { specifier: './late.js', names: [] },
  ]);
});

test('stub: the chat.js stub is a thread that stays empty, with what main.js reads from it', () => {
  const thread = chat.mountChatThread({ thread: null, pills: null, input: null });
  for (const name of ['empty', 'expanded']) assert.equal(typeof Object.getOwnPropertyDescriptor(thread, name).get, 'function', `${name} is a getter`);
  assert.equal(thread.empty, true);
  assert.equal(thread.expanded, false);
  assert.equal(thread.fit(120), 0);
  assert.equal(Math.max(0, thread.fit()), 0);
  assert.deepEqual(thread.layoutPills({ width: 300 }), { height: 0, boxes: [] });
  for (const name of ['send', 'clear', 'focus']) assert.equal(thread[name]('x'), undefined, name);
  assert.deepEqual(chat.respond('/clouds'), { blocks: [] });
  assert.deepEqual(Object.keys(chat).sort(), ['mountChatThread', 'respond']);
});

test('stub: the dev-report.js stub reports nothing', () => {
  assert.deepEqual(Object.keys(devReport), ['reportSettings']);
  assert.equal(devReport.reportSettings(), undefined);
});

test('png: decodePng reads back what encodePng writes, and an RGBA file', () => {
  const rgb = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  const decoded = decodePng(encodePng(2, 2, rgb));
  assert.deepEqual([decoded.width, decoded.height, decoded.channels], [2, 2, 3]);
  assert.deepEqual(decoded.pixels, rgb);
  // A 1x1 RGBA PNG.
  const rgba = decodePng(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
  assert.deepEqual([rgba.width, rgba.height, rgba.channels], [1, 1, 4]);
  assert.throws(() => pngSize(Buffer.from('not a png at all, not at all')), /not a PNG/);
});

for (const [why, line, message] of [
  ['a relative import that is neither copied nor stubbed', "import './nope.js';", /wings-vdb: src\/main\.js imports \.\/nope\.js, which is neither copied nor stubbed/],
  ['a name the stub does not export', "import { bogus } from './chat.js';", /wings-vdb: src\/main\.js imports bogus from \.\/chat\.js, which its stub playground\/fixtures\/wings-vdb\/stubs\/chat\.js does not export/],
  ['a package import', "import * as three from 'three';", /wings-vdb: src\/main\.js imports three, a package; the fixture serves no packages/],
]) {
  test(`wings-vdb: the snapshot fails on ${why}, and writes nothing`, async () => {
    const dir = scratch();
    try {
      const checkout = copy(dir, 'wings-vdb');
      appendFileSync(join(checkout, 'src', 'main.js'), `\n${line}\n`);
      await assert.rejects(snapshot(wingsVdb, checkout, join(dir, 'source'), { downscale: never }), message);
      assert.ok(!existsSync(join(dir, 'source')));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}

test('wings-vdb: the snapshot fails on a listed file missing from the checkout', async () => {
  const dir = scratch();
  try {
    const checkout = copy(dir, 'wings-vdb');
    rmSync(join(checkout, 'src', 'perf.js'));
    await assert.rejects(snapshot(wingsVdb, checkout, join(dir, 'source'), { downscale: never }), /wings-vdb: src\/perf\.js is missing from the checkout/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('mini-pylon: the snapshot copies the tweak page and records what its server would answer', async () => {
  const dir = scratch();
  try {
    const source = join(dir, 'source');
    const vendored = await snapshot(miniPylon, join(fixtures, 'mini-pylon'), source, { downscale: never });
    assert.deepEqual(vendored.files.map(f => [f.path, f.from]), [['index.html', 'tools/tweak/index.html'], ['tweak.js', 'tools/tweak/tweak.js'], ['tweak.css', 'tools/tweak/tweak.css']]);
    for (const file of vendored.files) assert.deepEqual(readFileSync(join(source, file.path)), readFileSync(join(fixtures, 'mini-pylon', file.from)));
    assert.deepEqual(vendored.stubs, []);
    assert.deepEqual([...vendored.recorded].sort(), ['data/defaults.json', 'data/finals.json', 'data/schema.json', 'data/swatch.json', 'data/types.json', 'renders/help-20261111-173007-2160.png']);
    const data = name => JSON.parse(readFileSync(join(source, 'data', name), 'utf8'));
    // schema.json is what /api/schema answers: scene_params.schema(), as Python wrote it.
    const schema = data('schema.json');
    assert.deepEqual(Object.keys(schema), ['groups', 'presets']);
    assert.deepEqual(schema.groups.map(g => g.name), ['ground', 'clutter', 'light', 'camera', 'pylon', 'render']);
    // Python's types, which JSON alone loses: 0.0 is a float, 0 an int.
    const types = data('types.json');
    assert.deepEqual(types['ground.wetness'], { default: 'float', min: 'int', max: 'int' });
    assert.deepEqual(types['ground.wear'], { default: 'float', min: 'int', max: 'float' });
    assert.deepEqual(types['light.sun_elevation'], { default: 'int', min: 'int', max: 'int' });
    assert.deepEqual(types['light.lamp'], { default: 'int', min: 'int', max: 'int' });
    assert.deepEqual(types['pylon.body'], { default: 'str' });
    assert.deepEqual(types['ground.puddle'], { default: 'int' });
    assert.equal(Object.keys(types).length, schema.groups.flatMap(g => g.vars).length);
    const defaults = data('defaults.json');
    assert.equal(defaults['render.preview_size'], 480);
    assert.equal(defaults['pylon.body'], '#1F4BFF');
    // finals.json is what /api/finals answers, with the url pointing into the fixture.
    const finals = data('finals.json');
    assert.equal(finals.length, 1);
    assert.deepEqual(Object.keys(finals[0]), ['name', 'file', 'state', 'url', 'size', 'queued', 'rendered', 'error', 'values']);
    assert.equal(finals[0].url, '/captures/mini-pylon/source/renders/help-20261111-173007-2160.png');
    assert.equal(finals[0].state, 'done');
    // A render no wider than the preview is copied as it is.
    assert.deepEqual(readFileSync(join(source, 'renders', 'help-20261111-173007-2160.png')), readFileSync(join(fixtures, 'mini-pylon', 'renders', 'hyperreal', 'tweaks', 'help-20261111-173007-2160.png')));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('mini-pylon: swatch.json holds Python\'s own swatch for four payloads, as the page writes them', async () => {
  const dir = scratch();
  try {
    await snapshot(miniPylon, join(fixtures, 'mini-pylon'), join(dir, 'source'), { downscale: never });
    const swatches = JSON.parse(readFileSync(join(dir, 'source', 'data', 'swatch.json'), 'utf8'));
    assert.deepEqual(swatches.map(s => s.about), [
      'the defaults as the page sends them',
      'ground.wear past its float maximum',
      'ground.wetness past its int maximum by a non-integer',
      'pylon.body in lowercase and ground.puddle sent as true',
    ]);
    for (const s of swatches) {
      assert.deepEqual(Object.keys(s), ['about', 'payload', 'values', 'rgb', 'size']);
      assert.equal(s.size, 256);
      assert.equal(s.rgb.length, 3);
      for (const c of s.rgb) assert.ok(c >= 64 && c <= 191, `${s.about}: ${c}`);
      // The payload is the page's JSON text; the values are json.dumps of the scene, render.* left out.
      assert.equal(JSON.parse(s.payload).kind, 'preview');
      assert.ok(!s.values.includes('render.'), s.about);
    }
    const [defaults, floatClamp, intClamp, lower] = swatches;
    // JavaScript writes the default 0.0 as 0: Python reads an int and keeps it.
    assert.match(defaults.payload, /"ground\.wetness":0,/);
    assert.match(defaults.values, /"ground\.wetness": 0,/);
    assert.match(floatClamp.payload, /"ground\.wear":2\.75,/);
    assert.match(floatClamp.values, /"ground\.wear": 1\.5,/);
    // A non-integer past an int bound takes the bound's type.
    assert.match(intClamp.payload, /"ground\.wetness":6\.5,/);
    assert.match(intClamp.values, /"ground\.wetness": 1,/);
    assert.match(lower.payload, /"pylon\.body":"#1f4bff"/);
    assert.match(lower.payload, /"ground\.puddle":true,/);
    // Upper-cased and int(True): the same scene as the defaults.
    assert.equal(lower.values, defaults.values);
    assert.deepEqual(lower.rgb, defaults.rgb);
    assert.notDeepEqual(floatClamp.rgb, defaults.rgb);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('mini-pylon: a final wider than the preview size is downscaled to it, and the result is what is written', async () => {
  const dir = scratch();
  try {
    const checkout = copy(dir, 'mini-pylon');
    const wide = encodePng(960, 960, Buffer.alloc(960 * 960 * 3, 0x80));
    writeFileSync(join(checkout, 'renders', 'hyperreal', 'tweaks', 'help-20261111-173007-2160.png'), wide);
    const calls = [];
    const small = encodePng(480, 480, Buffer.alloc(480 * 480 * 3, 0x80));
    await snapshot(miniPylon, checkout, join(dir, 'source'), { downscale: async (png, width) => { calls.push([pngSize(png).width, width]); return small; } });
    assert.deepEqual(calls, [[960, 480]]);
    assert.deepEqual(readFileSync(join(dir, 'source', 'renders', 'help-20261111-173007-2160.png')), small);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

for (const input of ['tools/tweak_server.py', 'tools/scene_params.py', 'renders/hyperreal/tweaks', 'tools/tweak/tweak.js']) {
  test(`mini-pylon: the snapshot fails, naming it, when ${input} is missing`, async () => {
    const dir = scratch();
    try {
      const checkout = copy(dir, 'mini-pylon');
      rmSync(join(checkout, input), { recursive: true });
      await assert.rejects(snapshot(miniPylon, checkout, join(dir, 'source'), { downscale: never }), new RegExp(`mini-pylon: ${input.replace(/[./]/g, '\\$&')} is missing from the checkout`));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}

test('mini-pylon: recording runs Python without leaving bytecode in the checkout', async () => {
  const dir = scratch();
  try {
    const checkout = copy(dir, 'mini-pylon');
    await snapshot(miniPylon, checkout, join(dir, 'source'), { downscale: never });
    assert.ok(!existsSync(join(checkout, 'tools', '__pycache__')));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// Every file under a folder with its size and mtime, to show a run wrote nothing there.
const listing = dir => readdirSync(dir, { recursive: true }).sort().map(f => {
  const s = statSync(join(dir, f));
  return `${f} ${s.size} ${s.mtimeMs}`;
});
const capture = args => new Promise(resolve => execFile(process.execPath, [join(repo, 'playground', 'capture.mjs'), ...args], { timeout: 60000 },
  (error, stdout, stderr) => resolve({ code: error?.code ?? 0, stdout, stderr })));

test('capture.mjs writes source/ and records it as vendored in capture.json, leaving no partial folder, an old one removed, and nothing in the checkout', async () => {
  const dir = scratch();
  try {
    const checkout = copy(dir, 'wings-vdb');
    const before = listing(checkout);
    const out = join(dir, 'captures');
    // What a run that died would have left.
    mkdirSync(join(out, '.wings-vdb-died'), { recursive: true });
    const run = await capture(['wings-vdb', checkout, '--out', out, '--dev', 'http://127.0.0.1:9/', '--reports', join(fixtures, 'wings-vdb-browsers')]);
    assert.equal(run.code, 0, run.stderr);
    const written = JSON.parse(readFileSync(join(out, 'wings-vdb', 'capture.json'), 'utf8'));
    assert.deepEqual(Object.keys(written.vendored), ['files', 'stubs', 'recorded']);
    assert.equal(written.vendored.files.length, 15);
    assert.ok(existsSync(join(out, 'wings-vdb', 'source', 'src', 'main.js')));
    assert.deepEqual(written.valueSets.fixture01.sourceValues['dispersal.hang'], 1.5);
    assert.deepEqual(readdirSync(out), ['wings-vdb']);
    assert.deepEqual(listing(checkout), before);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('capture.mjs that fails leaves the last capture as it was, says why, and leaves no partial folder', async () => {
  const dir = scratch();
  try {
    const out = join(dir, 'captures');
    const good = await capture(['mini-pylon', join(fixtures, 'mini-pylon'), '--out', out, '--dev', 'http://127.0.0.1:9/']);
    assert.equal(good.code, 0, good.stderr);
    const last = listing(join(out, 'mini-pylon'));
    const checkout = copy(dir, 'mini-pylon');
    rmSync(join(checkout, 'tools', 'tweak_server.py'));
    const bad = await capture(['mini-pylon', checkout, '--out', out, '--dev', 'http://127.0.0.1:9/']);
    assert.notEqual(bad.code, 0);
    assert.match(bad.stderr, /capture failed: mini-pylon: tools\/tweak_server\.py is missing from the checkout/);
    assert.deepEqual(listing(join(out, 'mini-pylon')), last);
    assert.deepEqual(readdirSync(out), ['mini-pylon']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('capture.mjs after a run that died between its two renames puts the last capture back', async () => {
  const dir = scratch();
  try {
    const out = join(dir, 'captures');
    const good = await capture(['mini-pylon', join(fixtures, 'mini-pylon'), '--out', out, '--dev', 'http://127.0.0.1:9/']);
    assert.equal(good.code, 0, good.stderr);
    const last = listing(join(out, 'mini-pylon'));
    // What a run that died after moving the last capture aside would have left.
    renameSync(join(out, 'mini-pylon'), join(out, '.mini-pylon-old-died'));
    mkdirSync(join(out, '.mini-pylon-new-died'));
    const checkout = copy(dir, 'mini-pylon');
    rmSync(join(checkout, 'tools', 'tweak_server.py'));
    const bad = await capture(['mini-pylon', checkout, '--out', out, '--dev', 'http://127.0.0.1:9/']);
    assert.notEqual(bad.code, 0);
    assert.deepEqual(readdirSync(out), ['mini-pylon']);
    assert.deepEqual(listing(join(out, 'mini-pylon')), last);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
PLAN_EOF
```

```bash red
node --test --test-name-pattern='^(wings-vdb|imports|stub|png): ' tests/unit/playground-snapshot.test.mjs
```

```expected
/playground/png.mjs' imported from
```

**Implementation.**

1. `playground/png.mjs`, with no image library. `pngSize` reads width and height from the IHDR chunk and throws `not a PNG` unless the buffer starts with the PNG signature and its first chunk is IHDR. `encodePng` writes an 8-bit RGB PNG (colour type 2), filter 0 on every row, the rows deflated with `node:zlib`, each chunk with its CRC-32; it throws, naming the size, when `rgb` is not `width × height × 3` bytes. `decodePng` reads 8-bit RGB or RGBA (types 2 and 6), not interlaced, joining every IDAT chunk and undoing all five row filters (none, sub, up, average, Paeth); anything else throws, naming the depth and type.
2. `playground/fixtures/wings-vdb/stubs/chat.js` exports exactly `mountChatThread` and `respond`. `mountChatThread()` returns an object with `empty` and `expanded` as getters answering `true` and `false`, `send`, `clear` and `focus` that do nothing, `fit` returning `0`, and `layoutPills` returning `{ height: 0, boxes: [] }`, so the page lays its chat out as a panel and never reaches the reply branch (checked: wings-vdb src/main.js lines 640-663 at 7f92902, 2026-11-13). `respond()` returns `{ blocks: [] }`. A comment says what it stands in for and why. `stubs/dev-report.js` exports exactly `reportSettings`, which does nothing.
3. `playground/adapters/wings-vdb.mjs` gains `vendor`, in this order: `index.html`; `src/main.js`, `terminal.js`, `viz.js`, `perf.js`, `params.js`, `birds.js`, `cloud-morph.js`, `shader.js`, `post.js`, `detail.js`, `flags.js`; `src/style.css`; `public/cloud-fallback.svg`; `public/wings-wide.svg`. Each `to` equals its `from`. It gains `stubs`: `src/chat.js` by `playground/fixtures/wings-vdb/stubs/chat.js`, then `src/dev-report.js` by `playground/fixtures/wings-vdb/stubs/dev-report.js`. No `inputs`, no `record`. A comment says that no font and no `public/options/` media is copied.
4. `snapshot` in `playground/adapters/common.mjs`, in this order, so a failure writes nothing:
   1. An adapter without a `vendor` list throws `<adapter name>: the adapter lists no files to vendor` (mini-pylon's has none until Task 3). Each of `adapter.inputs`, then each `vendor` `from`, must exist in the checkout; otherwise throw `<adapter name>: <path> is missing from the checkout`.
   2. Read every vendored file and its sha256.
   3. Check the imports of every vendored `.js` file with `imports()`. A specifier that does not start with `.` throws `<name>: <from> imports <specifier>, a package; the fixture serves no packages`. Otherwise resolve it against the importing file's folder, as a checkout path (posix, normalized). A vendored `from` is fine. A path no stub's `module` names throws `<name>: <from> imports <specifier>, which is neither copied nor stubbed`. For a stubbed path, import the stub module (`join(repo, by)`) and require each imported name among its exports, else throw `<name>: <from> imports <name> from <specifier>, which its stub <by> does not export`.
   4. Write each file byte for byte to `sourceDir/<to>`, creating folders.
   5. `recorded` is `await adapter.record(checkout, sourceDir, { downscale })` when the adapter has `record`, else `[]`.
   Return `files` as `{ path: to, from, sha256 }`, and `stubs` as `{ module, by }` copies.

**Checks.** The red command gives 9 pass. `npm run test:unit` shows this file's `mini-pylon: ` and `capture.mjs ` tests failing (Tasks 3 and 4) and every other test passing; the adapter tests in `playground-capture.test.mjs` still pass with the rewritten stand-in `main.js` and `terminal.js`.

**Commit.** `feat(capture): snapshot wings-vdb's page with its chat and reports stubbed`, staging the files above.

### Task 3: the mini-pylon snapshot, recorded from its own Python

**Files:** edit `playground/adapters/mini-pylon.mjs`; create `tests/fixtures/captures/mini-pylon/tools/tweak/index.html`, `tweak.js`, `tweak.css`, `tests/fixtures/captures/mini-pylon/tools/tweak_server.py` and the final's render `tests/fixtures/captures/mini-pylon/renders/hyperreal/tweaks/help-20261111-173007-2160.png`.

**Interfaces.** `playground/adapters/mini-pylon.mjs` exports `vendor`, `stubs` (`[]`), `inputs`, `RENDERS_URL` (`'/captures/mini-pylon/source/renders/'`), `swatchPayloads(schema, types)` (`[{ about, payload }]`) and `record(checkout, sourceDir, { downscale } = {})` (the recorded paths). `downscale(png, width)` resolves to the PNG drawn at that width.

The stand-in checkout's tweak page (the real one's storage keys, `/api` calls and drawer classes), the two parts of `tweak_server.py` capture runs, copied as they are, and a 2×2 render beside the final's JSON:

```bash apply
mkdir -p tests/fixtures/captures/mini-pylon/tools/tweak
cat > tests/fixtures/captures/mini-pylon/tools/tweak/index.html <<'PLAN_EOF'
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Mini Pylon tweak</title>
  <link rel="icon" href="data:,">
  <link rel="stylesheet" href="tweak.css">
</head>
<body>
  <!-- Stand-in for mini-pylon's tools/tweak/index.html: its files by relative URL. -->
  <main id="view"><img class="render" alt="Preview render"></main>
  <script src="tweak.js"></script>
</body>
</html>
PLAN_EOF
```
```bash apply
mkdir -p tests/fixtures/captures/mini-pylon/tools/tweak
cat > tests/fixtures/captures/mini-pylon/tools/tweak/tweak.js <<'PLAN_EOF'
// Stand-in for mini-pylon's tools/tweak/tweak.js: the same storage keys under
// mini-pylon-tweak: (each value JSON), the same /api calls, and a drawer with
// the real one's classes: a console tab named mini-pylon, a tab per group and
// a renders tab. On load it renders a preview of every value, as the real one does.
(() => {
  'use strict';
  const STORE = 'mini-pylon-tweak:';
  const load = (key, fallback) => { try { const v = JSON.parse(localStorage.getItem(STORE + key)); return v ?? fallback; } catch { return fallback; } };
  const save = (key, value) => { try { localStorage.setItem(STORE + key, JSON.stringify(value)); } catch {} };
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  async function api(path, body) {
    const res = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data;
  }
  const img = document.querySelector('img.render');

  (async () => {
    const schema = await api('/api/schema');
    const values = {};
    for (const g of schema.groups) for (const v of g.vars) values[`${g.name}.${v.key}`] = v.default;
    for (const [path, value] of Object.entries(load('values', {}))) if (path in values) values[path] = value;
    save('values', values);
    let view = load('view', 'console');
    let group = load('group', schema.groups[0].name);

    const root = el('div', 'term');
    root.innerHTML = '<nav class="term-tabs"></nav><div class="term-vars"></div><div class="finals"></div>';
    document.body.append(root);
    const tabs = root.querySelector('.term-tabs');
    const varsBox = root.querySelector('.term-vars');
    const finalsBox = root.querySelector('.finals');
    function render() {
      const tab = (label, on, click) => { const b = el('button', `term-tab${on ? ' active' : ''}`, label); b.type = 'button'; b.onclick = click; return b; };
      tabs.replaceChildren(
        tab('mini-pylon', view === 'console', () => setView('console')),
        ...schema.groups.map(g => tab(g.name, view === 'params' && group === g.name, () => { group = g.name; save('group', group); setView('params'); })),
        tab('renders', view === 'renders', () => setView('renders')),
      );
      const g = schema.groups.find(x => x.name === group);
      varsBox.replaceChildren(...(view === 'params' && g ? g.vars.map(v => {
        const row = el('div', 'term-row');
        row.dataset.path = `${g.name}.${v.key}`;
        row.append(el('span', 'term-key', v.key), el('span', 'term-value', String(values[row.dataset.path])));
        return row;
      }) : []));
    }
    async function setView(next) {
      view = next;
      save('view', view);
      render();
      if (view !== 'renders') return;
      const finals = await api('/api/finals');
      finalsBox.replaceChildren(...finals.map(f => { const t = el('img'); t.src = f.url; t.alt = f.name; return t; }));
    }
    if (load('drawer', false)) root.classList.add('open');
    setView(view);

    const job = await api('/api/render', { kind: 'preview', values });
    for (;;) {
      const done = await api(`/api/jobs/${job.id}`);
      if (['done', 'failed', 'superseded'].includes(done.state)) {
        if (done.state === 'done') img.src = done.url;
        document.body.dataset.preview = `${done.state} ${done.size} ${done.seconds}`;
        break;
      }
      await new Promise(r => setTimeout(r, 250));
    }
  })().catch(error => { document.body.dataset.error = error.message; });
})();
PLAN_EOF
```
```bash apply
mkdir -p tests/fixtures/captures/mini-pylon/tools/tweak
cat > tests/fixtures/captures/mini-pylon/tools/tweak/tweak.css <<'PLAN_EOF'
/* Stand-in for mini-pylon's tools/tweak/tweak.css. */
body { margin: 0; font: 14px system-ui, sans-serif; }
img.render { width: 240px; height: 240px; background: #eee; }
.term { position: fixed; right: 0; bottom: 0; width: 480px; background: #fff; display: none; }
.term.open { display: block; }
.term-tab.active { font-weight: bold; }
PLAN_EOF
```
```bash apply
mkdir -p tests/fixtures/captures/mini-pylon/tools
cat > tests/fixtures/captures/mini-pylon/tools/tweak_server.py <<'PLAN_EOF'
"""Stand-in for mini-pylon's tools/tweak_server.py: the two parts the knobs
capture runs, copied as they are there. write_swatch_png draws the flat PNG
--fake renders, and Renders.finals lists the finals in
renders/hyperreal/tweaks/. The queue, Blender and the HTTP server are left out.
"""
import hashlib
import json
import struct
import sys
import zlib
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import scene_params  # noqa: E402,F401


def write_swatch_png(path, size, values):
    """A flat PNG whose colour follows the values: a stand-in render for --fake and tests."""
    digest = hashlib.sha1(json.dumps(values, sort_keys=True).encode()).digest()
    rgb = bytes(64 + b // 2 for b in digest[:3])
    raw = b"".join(b"\x00" + rgb * size for _ in range(size))

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

    png = (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_bytes(png)


class Renders:
    def __init__(self, finals_dir):
        self.finals_dir = Path(finals_dir)

    def finals(self):
        """Every final, newest queued first: done ones with their image, and the ones still
        queued, rendering, or failed."""
        out = []
        for side in self.finals_dir.glob("*.json"):
            png = side.with_suffix(".png")
            try:
                data = json.loads(side.read_text())
            except ValueError:
                continue
            state = data.get("state") or ("done" if png.exists() else "failed")
            done = state == "done" and png.exists()
            out.append({"name": data.get("name") or png.stem, "file": png.name, "state": state,
                        "url": f"/out/finals/{png.name}" if done else None, "size": data.get("size"),
                        "queued": data.get("queued"), "rendered": data.get("rendered"),
                        "error": data.get("error"), "values": data.get("values", {}),
                        "_order": data.get("queued") or data.get("rendered") or ""})
        out.sort(key=lambda f: (f.pop("_order"), f["file"]), reverse=True)
        return out
PLAN_EOF
```
```bash apply
mkdir -p tests/fixtures/captures/mini-pylon/renders/hyperreal/tweaks
base64 -d > tests/fixtures/captures/mini-pylon/renders/hyperreal/tweaks/help-20261111-173007-2160.png <<'PLAN_EOF'
iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGM4UaEBRAwQCgAp7gWhjAnOiAAAAABJRU5ErkJggg==
PLAN_EOF
```

The tests are the `mini-pylon: ` tests in `tests/unit/playground-snapshot.test.mjs`, written in Task 2:

```bash red
node --test --test-name-pattern='^mini-pylon: ' tests/unit/playground-snapshot.test.mjs
```

```expected
/playground/png.mjs' imported from
```

**At this task** the file loads (Task 2 made `playground/png.mjs`), and every `mini-pylon: ` test fails with `mini-pylon: the adapter lists no files to vendor`: mini-pylon's adapter has no `vendor` until this task.

**Implementation.**

1. `vendor`: `tools/tweak/index.html` to `index.html`, `tools/tweak/tweak.js` to `tweak.js`, `tools/tweak/tweak.css` to `tweak.css`. `inputs`: `tools/tweak_server.py`, `tools/scene_params.py`, `renders/hyperreal/tweaks`, in that order. `tweak.js` is a classic script with no imports.
2. One Python program, run with `execFileSync('python3', ['-B', '-c', <program>, <checkout>/tools, <checkout>/renders/hyperreal/tweaks])`, the checkout made absolute, `cwd` the checkout, `PYTHONDONTWRITEBYTECODE=1`, and a JSON array of payload texts on stdin. It puts the tools folder first on `sys.path`, imports `scene_params` and `tweak_server`, and prints one JSON object:
   - `schema`: `scene_params.schema()`.
   - `types`: for each var of `scene_params.variables(True)` by its path, `{ default }`, plus `min` and `max` for a number, each the Python type's `__name__` (`int`, `float`, `str`).
   - `defaults`: `scene_params.resolve({}, include_render=True)`.
   - `finals`: `tweak_server.Renders.finals(holder)`, where `holder` is a bare object with `finals_dir` set to the finals folder's `Path` (decision 3).
   - `swatches`: for each payload text, `json.loads` it, `scene_params.resolve(payload.get("values") or {}, include_render=True)`, the scene values without `render.*`, and `size = min(int(all_values["render.preview_size"]), 256)`; then `tweak_server.write_swatch_png` into a temporary folder outside the checkout, its first pixel read back (the IDAT chunk after the signature and IHDR, decompressed, bytes 1 to 3 of the first row), and the file and folder removed. Each entry: `{ payload, values: json.dumps(scene, sort_keys=True), rgb, size }`.
   A Python error makes `execFileSync` throw with its stderr, and the snapshot fails.
3. `swatchPayloads(schema, types)`, decision 2: the vars with their paths; every default as JavaScript parsed it; the first number with a `float` maximum, the first with an `int` maximum, the first colour and the first toggle, each else throwing `mini-pylon: the schema has no <what>`. The four, with these `about` texts: `the defaults as the page sends them`; `<path> past its float maximum` (its max plus 1.25); `<path> past its int maximum by a non-integer` (its max plus 5.5); `<colour path> in lowercase and <toggle path> sent as true`. Each `payload` is `JSON.stringify({ kind: 'preview', values })` over every default with that change.
4. `record`: run the program with no payloads; build the payloads from its schema and types; run it again with them for the swatches. Then, for each final with a `url` (done, with its PNG), check that its `file` matches `/^[\w.-]+\.png$/` (else throw `mini-pylon: a final's file is not a plain PNG name: <file>`), read the PNG from the finals folder, and write `renders/<file>`: the bytes as they are when `pngSize(png).width` is at most the default `render.preview_size`, else `await downscale(png, preview_size)`, throwing `mini-pylon: <file> is wider than <n> px and there is nothing to downscale it with` when no `downscale` was given. Set that final's `url` to `RENDERS_URL + file`. Then write `data/schema.json`, `data/types.json`, `data/defaults.json`, `data/finals.json` and `data/swatch.json`, each as `JSON.stringify(value, null, 2)` and a newline; `swatch.json`'s entries are `{ about, payload, values, rgb, size }` in that key order. Return the paths written, relative to `sourceDir`, in the order written.
5. Keep `read()` as it is; its comment gains a line on the snapshot.

**Checks.** The red command gives 8 pass; no `__pycache__` appears under `tests/fixtures/captures/mini-pylon/tools/` (`git status --short tests/fixtures` shows only this task's files).

**Commit.** `feat(capture): record what mini-pylon's tweak server answers, from its own Python`, staging the files above.

### Task 4: capture writes the snapshot, and publishes it whole

**Files:** edit `playground/capture.mjs`; create `tests/browser/lib/captures.mjs` and `tests/browser/capture-downscale.test.mjs`.

**Interfaces.** `tests/browser/lib/captures.mjs` (test code, below) exports `captureFixtures`, `PNG`, `writeCaptures(dir)` and `collectPageErrors(page)`, used by every later browser test.

The shared test helper and the downscale test; the unit tests are the `capture.mjs ` tests in `tests/unit/playground-snapshot.test.mjs`:

```bash apply
mkdir -p tests/browser/lib
cat > tests/browser/lib/captures.mjs <<'PLAN_EOF'
// A captures folder built from the stand-in checkouts under
// tests/fixtures/captures, as playground:capture writes one: each project's
// capture.json and source/ snapshot, and two shots of wings-vdb's drawer.
// Never the real projects.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { build, snapshot } from '../../../playground/adapters/common.mjs';
import * as miniPylon from '../../../playground/adapters/mini-pylon.mjs';
import * as wingsVdb from '../../../playground/adapters/wings-vdb.mjs';
import { repo } from './harness.mjs';

export const captureFixtures = join(repo, 'tests', 'fixtures', 'captures');
// A 1x1 PNG.
export const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
// The stand-ins' renders are smaller than the preview size, so nothing is downscaled.
const downscale = () => { throw new Error('a stand-in render needs no downscale'); };

export async function writeCaptures(dir) {
  const wings = await build(wingsVdb, join(captureFixtures, 'wings-vdb'), { reports: join(captureFixtures, 'wings-vdb-browsers') });
  mkdirSync(join(dir, 'wings-vdb', 'shots'), { recursive: true });
  writeFileSync(join(dir, 'wings-vdb', 'shots', '01-wings-vdb.png'), PNG);
  writeFileSync(join(dir, 'wings-vdb', 'shots', '02-dispersal.png'), PNG);
  wings.shots = [{ tab: 'wings-vdb', file: 'shots/01-wings-vdb.png' }, { tab: 'dispersal', file: 'shots/02-dispersal.png' }];
  wings.vendored = await snapshot(wingsVdb, join(captureFixtures, 'wings-vdb'), join(dir, 'wings-vdb', 'source'), { downscale });
  writeFileSync(join(dir, 'wings-vdb', 'capture.json'), JSON.stringify(wings));
  const pylon = await build(miniPylon, join(captureFixtures, 'mini-pylon'));
  pylon.shotsSkipped = 'the dev server at http://127.0.0.1:5371/ was not answering';
  pylon.vendored = await snapshot(miniPylon, join(captureFixtures, 'mini-pylon'), join(dir, 'mini-pylon', 'source'), { downscale });
  writeFileSync(join(dir, 'mini-pylon', 'capture.json'), JSON.stringify(pylon));
}

// Console errors and uncaught exceptions on a page and its frames, as
// harness.mjs collects them, less the font loads that fail on purpose: a
// test's fonts folder is empty, so wings-vdb's two faces answer 404.
export function collectPageErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const at = message.location().url ? new URL(message.location().url).pathname : '';
    if (!at.startsWith('/fonts/')) errors.push(`console: ${message.text()}${at ? ` (${at})` : ''}`);
  });
  return errors;
}
PLAN_EOF
```
```bash apply
mkdir -p tests/browser
cat > tests/browser/capture-downscale.test.mjs <<'PLAN_EOF'
// playground:capture (playground/capture.mjs) downscales a mini-pylon final
// wider than the preview size on a canvas in Chromium. Run on a copy of the
// stand-in checkout under tests/fixtures/captures.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { repo } from './lib/harness.mjs';
import { captureFixtures } from './lib/captures.mjs';
import { encodePng, pngSize } from '../../playground/png.mjs';

mkdirSync(join(repo, 'tests', '.tmp'), { recursive: true });

const node = (args, env = {}) => new Promise(resolve => execFile(process.execPath, args, { timeout: 120000, env: { ...process.env, ...env } },
  (error, stdout, stderr) => resolve({ code: error ? (error.code ?? 'killed') : 0, stdout, stderr })));

test('capture.mjs downscales a final wider than the preview size in Chromium', async () => {
  const dir = mkdtempSync(join(repo, 'tests', '.tmp', 'capture-'));
  try {
    const checkout = join(dir, 'mini-pylon');
    cpSync(join(captureFixtures, 'mini-pylon'), checkout, { recursive: true });
    const rgb = Buffer.alloc(960 * 960 * 3);
    for (let i = 0; i < rgb.length; i += 3) rgb.set([200, 120, 40], i);
    writeFileSync(join(checkout, 'renders', 'hyperreal', 'tweaks', 'help-20261111-173007-2160.png'), encodePng(960, 960, rgb));
    const run = await node([join(repo, 'playground', 'capture.mjs'), 'mini-pylon', checkout, '--out', join(dir, 'out'), '--dev', 'http://127.0.0.1:9/']);
    assert.equal(run.code, 0, run.stderr);
    assert.deepEqual(pngSize(readFileSync(join(dir, 'out', 'mini-pylon', 'source', 'renders', 'help-20261111-173007-2160.png'))), { width: 480, height: 480 });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
PLAN_EOF
```

```bash red
node --test --test-name-pattern='^capture\.mjs ' tests/unit/playground-snapshot.test.mjs
```

```expected
/playground/png.mjs' imported from
```

**At this task** the file loads, and the three `capture.mjs ` tests fail on their assertions: the capture of the base writes no `source/` or `vendored`, exits 0 on the checkout without `tools/tweak_server.py`, and leaves the dead runs' folders.

```bash red
node --test --test-concurrency=1 --test-timeout=60000 tests/browser/capture-downscale.test.mjs
```

```expected
/playground/png.mjs' imported from
```

**At this task** the file loads, and its one test fails on its assertions: the capture of the base downscales nothing.

**Implementation.** In `playground/capture.mjs` (`playground/capture.mjs:64-73` at `acb38aa` builds, removes the folder, then writes):

1. Make `out` (resolved) if needed. When `<out>/<project>` is missing and a folder named `.<project>-old-…` is there, a run died between its two renames (step 3): rename the newest such folder (by mtime) back to `<out>/<project>`. Then remove every entry of `out` whose name starts with `.<project>-`: what a run that died left behind.
2. Make a folder with `mkdtempSync(join(out, '.<project>-new-'))` (decision 10).
3. In a `try`: `build()` as now; `capture.vendored = await snapshot(adapter, checkout, join(partial, 'source'), { downscale })`; shots as now, but into the partial folder; write `capture.json` there. Then, when `<out>/<project>` exists, rename it to `<out>/.<project>-old-<8 random hex digits>`; rename the partial folder to `<out>/<project>`; and remove the old one. Print the `capture.json` path, the `source` path, each shot and the `no shots` line, as now.
4. On any error: remove the partial folder, print `capture failed: <message>` on stderr, and set the exit code to 1. The last capture is untouched.
5. `downscale(png, width)`: launch Chromium on first use only (`chromium.launch` with `KNOBS_CHROMIUM` as the shots do, no extra arguments), open a page, load the PNG as a data URL into an `Image`, wait for `decode()`, draw it on a canvas of that width and the height in proportion with `imageSmoothingQuality = 'high'`, and return the canvas's PNG (`toDataURL`) as a Buffer. Close the page each time, and the browser in a `finally` around the whole run.
6. Update the header comment: `source/`, `vendored`, and the folder moved into place only once complete.

**Checks.** Both reds pass (3 unit, 1 browser, the browser one as a check job). Milestone 1 ends: `npm run test:unit` gives 257 pass, and `npm run test:browser` (check job) 196 pass.

**Commit.** `feat(capture): write each project's snapshot and publish the capture whole`, staging `playground/capture.mjs` and the two test files.

### Task 5: the Python port

**Files:** create `playground/fixtures/mini-pylon/python.mjs` and `tests/unit/playground-python.test.mjs`.

**Interfaces.** `playground/fixtures/mini-pylon/python.mjs` exports:

- `class PyNum { constructor(value, type) }`, a number as Python holds it: `type` is `'int'` or `'float'`.
- `loads(text)`: `JSON.parse` with every number replaced by a `PyNum`, an `int` when its source text matches `/^-?\d+$/` (with `-0` read as `0`), a `float` otherwise.
- `floatRepr(x)`: Python's `float.__repr__`.
- `dumps(value)`: `json.dumps(value, sort_keys=True)` with the default `ensure_ascii`.
- `repr(value)`: Python's `repr()` of what `loads` gives, for error texts.
- `coerce(v, value)`: `scene_params._coerce` for a var `{ path, type, min?, max?, choices? }` whose bounds are `PyNum`.
- `typedVars(schema, types)`: every var of a `schema.json` with its `path`, its `default` (and, for a number, `min` and `max`) as `PyNum` by `types.json`.
- `resolve(vars, overrides)`: `scene_params.resolve(overrides, include_render=True)`, as an object of path to Python value.

```bash apply
mkdir -p tests/unit
cat > tests/unit/playground-python.test.mjs <<'PLAN_EOF'
// The mini-pylon stand-in's Python port (playground/fixtures/mini-pylon/python.mjs):
// json.loads, scene_params._coerce and resolve, and json.dumps(sort_keys=True),
// checked against python3 itself where Python's own text is the answer. The
// schema comes from a snapshot of the stand-in checkout under tests/fixtures/captures.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { snapshot } from '../../playground/adapters/common.mjs';
import * as miniPylon from '../../playground/adapters/mini-pylon.mjs';
import { coerce, dumps, floatRepr, loads, PyNum, resolve, typedVars } from '../../playground/fixtures/mini-pylon/python.mjs';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const fixtures = join(repo, 'tests', 'fixtures', 'captures');
mkdirSync(join(repo, 'tests', '.tmp'), { recursive: true });
const dir = mkdtempSync(join(repo, 'tests', '.tmp', 'fixtures-'));
const source = join(dir, 'mini-pylon-source');
const data = name => JSON.parse(readFileSync(join(source, 'data', name), 'utf8'));
before(() => snapshot(miniPylon, join(fixtures, 'mini-pylon'), source, { downscale: () => { throw new Error('no downscale'); } }));
after(() => rmSync(dir, { recursive: true, force: true }));
test('floatRepr prints every float as Python\'s float.__repr__ does', () => {
  const xs = [0.005, 1e16, 2, 0.00001, 123456789012345680000, 1.5e-7, 0.1 + 0.2, -0, 1e15, 0.0001, 0.52, 2.75, -18.4, 1e22, 5e-324, 1.7976931348623157e308, 100, 12345.678, -1e-7, 9.999999999999999e15];
  const python = execFileSync('python3', ['-B', '-c', 'import sys, json; print("\\n".join(repr(float(x)) for x in json.loads(sys.argv[1])))', JSON.stringify(xs.map(x => (Object.is(x, -0) ? '-0.0' : String(x))))], { encoding: 'utf8' }).trim().split('\n');
  assert.deepEqual(xs.map(floatRepr), python);
});

test('loads tells an int from a float by its text, as json.loads does', () => {
  const parsed = loads('{"a": 1, "b": 1.0, "c": 1e2, "d": -0, "e": 2.50, "f": "x", "g": true, "h": null, "i": [3, 4.5]}');
  assert.deepEqual(Object.fromEntries(['a', 'b', 'c', 'd', 'e'].map(k => [k, [parsed[k].value, parsed[k].type]])), {
    a: [1, 'int'], b: [1, 'float'], c: [100, 'float'], d: [0, 'int'], e: [2.5, 'float'],
  });
  assert.equal(parsed.f, 'x');
  assert.equal(parsed.g, true);
  assert.equal(parsed.h, null);
  assert.deepEqual(parsed.i.map(n => n.type), ['int', 'float']);
});

test('dumps writes json.dumps(sort_keys=True): sorted keys, Python separators, Python floats, ASCII only', () => {
  const values = { 'b.c': 'S', 'a.y': new PyNum(2, 'float'), 'a.x': new PyNum(1, 'int'), 'a.z': 'é"\\\n', 'a.w': new PyNum(1e-5, 'float') };
  const python = execFileSync('python3', ['-B', '-c', 'import json; print(json.dumps({"b.c": "S", "a.y": 2.0, "a.x": 1, "a.z": "\\u00e9\\"\\\\\\n", "a.w": 1e-05}, sort_keys=True))'], { encoding: 'utf8' }).trim();
  assert.equal(dumps(values), python);
  assert.equal(dumps(values), '{"a.w": 1e-05, "a.x": 1, "a.y": 2.0, "a.z": "\\u00e9\\"\\\\\\n", "b.c": "S"}');
});

test('coerce follows scene_params._coerce: clamps take the bound\'s type, toggles become ints, colours go upper-case', () => {
  const int = n => new PyNum(n, 'int');
  const float = n => new PyNum(n, 'float');
  const number = { path: 'g.n', type: 'number', min: int(1), max: int(85) };
  const show = v => (v instanceof PyNum ? [v.value, v.type] : v);
  assert.deepEqual(show(coerce(number, float(90.5))), [85, 'int']);
  assert.deepEqual(show(coerce(number, float(40.5))), [40.5, 'float']);
  assert.deepEqual(show(coerce(number, int(40))), [40, 'int']);
  // Equal to a bound: min and max keep the bound, so its type.
  assert.deepEqual(show(coerce(number, float(1))), [1, 'int']);
  assert.deepEqual(show(coerce({ ...number, max: float(1.5) }, int(9))), [1.5, 'float']);
  assert.throws(() => coerce(number, true), { message: 'g.n: not a number: True' });
  assert.throws(() => coerce(number, '3'), { message: "g.n: not a number: '3'" });
  const toggle = { path: 'g.t', type: 'toggle' };
  for (const [value, want] of [[true, 1], [false, 0], [float(1), 1], [int(0), 0]]) assert.deepEqual(show(coerce(toggle, value)), [want, 'int']);
  assert.throws(() => coerce(toggle, float(0.5)), { message: 'g.t: not on or off: 0.5' });
  const choice = { path: 'g.c', type: 'choice', choices: ['sky', 'studio'] };
  assert.equal(coerce(choice, 'sky'), 'sky');
  assert.throws(() => coerce(choice, 'moon'), { message: "g.c: 'moon' is not one of sky, studio" });
  const color = { path: 'g.k', type: 'color' };
  assert.equal(coerce(color, '#1f4bff'), '#1F4BFF');
  // Python's $ also matches before a final newline.
  assert.equal(coerce(color, '#aabbcc\n'), '#AABBCC\n');
  assert.throws(() => coerce(color, 'red'), { message: "g.k: not a #RRGGBB colour: 'red'" });
});

test('resolve gives every value with the defaults\' Python types, and refuses an unknown parameter', () => {
  const vars = typedVars(data('schema.json'), data('types.json'));
  const all = resolve(vars, {});
  assert.deepEqual([all['ground.wetness'].value, all['ground.wetness'].type], [0, 'float']);
  assert.deepEqual([all['light.lamp'].value, all['light.lamp'].type], [0, 'int']);
  assert.equal(all['render.preview_size'].value, 480);
  assert.throws(() => resolve(vars, { 'nope.x': new PyNum(1, 'int') }), { message: 'unknown parameter: nope.x' });
  assert.throws(() => typedVars(data('schema.json'), {}), /types\.json has no ground\.surface/);
});
PLAN_EOF
```

```bash red
node --test tests/unit/playground-python.test.mjs
```

```expected
/playground/fixtures/mini-pylon/python.mjs' imported from
```

**Implementation.** The rules, from `tests/fixtures/captures/mini-pylon/tools/scene_params.py:119-149` at `acb38aa` (the same file as mini-pylon's):

1. `floatRepr`: from `Math.abs(x).toExponential()` (the shortest digits that read back) take the digits and the exponent `e`. With `-4 <= e < 16`, write fixed notation from those digits with at least one digit after the point (`2.0`, `0.0001`, `1000000000000000.0`); otherwise `d.ddd` and `e`, a sign and at least two exponent digits (`1e-05`, `1e+16`, `1.5e-07`). Zero is `0.0` or `-0.0`; NaN and the infinities are `NaN`, `Infinity`, `-Infinity`.
2. `dumps`: an int `PyNum` as its digits, a float by `floatRepr`, a string in double quotes with `"`, `\`, `\n`, `\r`, `\t`, `\b`, `\f` escaped and every other code unit below 0x20 or above 0x7e as `\uXXXX`; `true`, `false`, `null`; arrays as `[a, b]`; objects with keys sorted, as `{"k": v, …}` with separators `, ` and `: `.
3. `repr`: an int's digits, a float by `floatRepr`, a string in single quotes (double when it holds a `'` and no `"`) with `\\`, the quote, `\n`, `\r`, `\t` and other control characters escaped; `True`, `False`, `None`; lists and dicts as Python prints them.
4. `coerce`, by type. A number must be a `PyNum` (a boolean or anything else throws `<path>: not a number: <repr>`); it is `max(min, value)` then `min(max, that)` as Python computes them: `max` keeps its first argument unless the second is greater, `min` keeps its first unless the second is less, so a value equal to or past a bound becomes the bound, with the bound's type. A toggle must equal 0 or 1 (a `PyNum` of either, or a boolean), else `<path>: not on or off: <repr>`, and becomes the int 0 or 1. A choice must be one of `choices`, else `<path>: <repr> is not one of <choices joined by ', '>`, and is returned as given. A colour must be a string matching `/^#[0-9A-Fa-f]{6}\n?$/` (Python's `$` also matches before a final newline), else `<path>: not a #RRGGBB colour: <repr>`, and is upper-cased.
5. `typedVars` throws `types.json has no <path>` for a var `types` lacks. `resolve` starts from every var's default and, for each override in order, throws `unknown parameter: <path>` for an unknown path, else sets the coerced value.

**Checks.** The red command gives 5 pass.

**Commit.** `feat(playground): port tweak_server's value rules and json.dumps to JavaScript`, staging the two files.

### Task 6: the mini-pylon stand-in

**Files:** create `playground/fixtures/mini-pylon/api.mjs` and `tests/unit/playground-standin.test.mjs`.

**Interfaces.** `playground/fixtures/mini-pylon/api.mjs` exports `PREFIX` (`'/captures/mini-pylon/source'`), `FINALS_REFUSED` (`'finals are not made in the knobs fixture'`), `swatch(values, size)` (a PNG Buffer) and `miniPylon(sourceDir)`, which returns `{ api, files }`, two connect handlers `(req, res)`: `api` mounted at `/api` and `files` at `PREFIX`, each seeing `req.url` with its prefix stripped.

```bash apply
mkdir -p tests/unit
cat > tests/unit/playground-standin.test.mjs <<'PLAN_EOF'
// The stand-in for mini-pylon's tools/tweak_server.py
// (playground/fixtures/mini-pylon/api.mjs), served over HTTP from a snapshot
// of the stand-in checkout under tests/fixtures/captures, whose swatch.json
// holds what Python drew for each pinned payload.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { snapshot } from '../../playground/adapters/common.mjs';
import * as miniPylon from '../../playground/adapters/mini-pylon.mjs';
import { FINALS_REFUSED, miniPylon as standIn, swatch } from '../../playground/fixtures/mini-pylon/api.mjs';
import { dumps, loads, PyNum, resolve, typedVars } from '../../playground/fixtures/mini-pylon/python.mjs';
import { decodePng, pngSize } from '../../playground/png.mjs';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const fixtures = join(repo, 'tests', 'fixtures', 'captures');
mkdirSync(join(repo, 'tests', '.tmp'), { recursive: true });
const dir = mkdtempSync(join(repo, 'tests', '.tmp', 'fixtures-'));
const source = join(dir, 'mini-pylon-source');
const data = name => JSON.parse(readFileSync(join(source, 'data', name), 'utf8'));
// A plain HTTP server with handlers mounted at prefixes, as connect mounts them: the prefix is stripped.
function mount(routes) {
  const server = createServer((req, res) => {
    for (const [prefix, handler] of routes) {
      if (req.url === prefix || req.url.startsWith(`${prefix}/`) || req.url.startsWith(`${prefix}?`)) {
        req.url = req.url.slice(prefix.length) || '/';
        if (!req.url.startsWith('/')) req.url = `/${req.url}`;
        return handler(req, res, () => { res.statusCode = 404; res.end('next'); });
      }
    }
    res.statusCode = 404;
    res.end('no route');
  });
  return new Promise(resolveServer => server.listen(0, '127.0.0.1', () => resolveServer({ server, url: `http://127.0.0.1:${server.address().port}` })));
}
const post = (url, body) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const getJson = async url => (await fetch(url)).json();

let pylon;
before(async () => {
  await snapshot(miniPylon, join(fixtures, 'mini-pylon'), source, { downscale: () => { throw new Error('no downscale'); } });
  const api = standIn(source);
  pylon = await mount([['/api', api.api], ['/captures/mini-pylon/source', api.files]]);
});
after(() => {
  pylon?.server.close();
  rmSync(dir, { recursive: true, force: true });
});
async function preview(payloadText) {
  const job = await (await post(`${pylon.url}/api/render`, payloadText)).json();
  return { job, done: await getJson(`${pylon.url}/api/jobs/${job.id}`) };
}
const swatchPayloads = () => data('swatch.json');
test('the stand-in answers the schema, the finals and the status as recorded', async () => {
  assert.deepEqual(await getJson(`${pylon.url}/api/schema`), data('schema.json'));
  const finals = await getJson(`${pylon.url}/api/finals`);
  assert.deepEqual(finals, data('finals.json'));
  assert.ok(finals[0].url.startsWith('/captures/mini-pylon/source/renders/'));
  assert.deepEqual(await getJson(`${pylon.url}/api/status`), { running: null, waiting: [] });
});

test('a preview is a job in the server\'s public fields, done on its first poll with numeric seconds', async () => {
  const { job, done } = await preview(swatchPayloads()[0].payload);
  const fields = ['id', 'kind', 'state', 'size', 'samples', 'url', 'seconds', 'error', 'name', 'ahead'];
  assert.deepEqual(Object.keys(job), fields);
  assert.deepEqual(Object.keys(done), fields);
  assert.equal(job.kind, 'preview');
  assert.equal(job.ahead, 0);
  assert.equal(done.state, 'done');
  assert.equal(done.seconds, 0);
  assert.equal(done.size, 480);
  assert.equal(done.samples, 24);
  assert.equal(done.error, null);
});

for (const [i, about] of ['the defaults', 'a float-bound clamp', 'an int-bound clamp of a non-integer', 'a lowercase colour and a toggle sent as true'].entries()) {
  test(`a preview of ${about} is the swatch Python draws for it`, async () => {
    const recorded = swatchPayloads()[i];
    const { done } = await preview(recorded.payload);
    assert.ok(done.url.startsWith('/captures/mini-pylon/source/out/previews/'), done.url);
    const response = await fetch(`${pylon.url}${done.url}`);
    assert.equal(response.headers.get('content-type'), 'image/png');
    const png = decodePng(Buffer.from(await response.arrayBuffer()));
    assert.equal(png.width, recorded.size);
    assert.equal(png.height, recorded.size);
    assert.deepEqual([...png.pixels.subarray(0, 3)], recorded.rgb);
    assert.deepEqual([...png.pixels.subarray(png.pixels.length - 3)], recorded.rgb);
    // The digest's input, character for character.
    const vars = typedVars(data('schema.json'), data('types.json'));
    const scene = Object.fromEntries(Object.entries(resolve(vars, loads(recorded.payload).values)).filter(([p]) => !p.startsWith('render.')));
    assert.equal(dumps(scene), recorded.values);
  });
}

test('a preview of a recorded final\'s values is that final\'s render', async () => {
  const [final] = data('finals.json');
  const { done } = await preview(JSON.stringify({ kind: 'preview', values: { ...final.values, 'render.preview_size': 240 } }));
  assert.equal(done.state, 'done');
  assert.equal(done.url, final.url);
  const response = await fetch(`${pylon.url}${final.url}`);
  assert.equal(response.status, 200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), readFileSync(join(source, 'renders', final.file)));
});

test('a final is refused on its first poll, and an unknown parameter or kind answers 400 with the server\'s text', async () => {
  const final = await (await post(`${pylon.url}/api/render`, { kind: 'final', size: 2160, name: 'x', values: {} })).json();
  assert.equal(final.kind, 'final');
  const polled = await getJson(`${pylon.url}/api/jobs/${final.id}`);
  assert.equal(polled.state, 'failed');
  assert.equal(polled.error, FINALS_REFUSED);
  assert.equal(FINALS_REFUSED, 'finals are not made in the knobs fixture');
  const unknown = await post(`${pylon.url}/api/render`, { kind: 'preview', values: { 'nope.x': 1 } });
  assert.equal(unknown.status, 400);
  assert.deepEqual(await unknown.json(), { error: 'unknown parameter: nope.x' });
  const kind = await post(`${pylon.url}/api/render`, { kind: 'other' });
  assert.equal(kind.status, 400);
  assert.deepEqual(await kind.json(), { error: 'kind must be preview or final' });
  const bad = await post(`${pylon.url}/api/render`, { kind: 'preview', values: { 'light.sun_elevation': 'high' } });
  assert.deepEqual(await bad.json(), { error: "light.sun_elevation: not a number: 'high'" });
  const none = await fetch(`${pylon.url}/api/jobs/999-nope`);
  assert.equal(none.status, 404);
  assert.deepEqual(await none.json(), { error: 'no such job' });
});

test('the stand-in serves the page\'s own files and nothing outside them', async () => {
  for (const [path, file, type] of [['/', 'index.html', 'text/html'], ['/tweak.js', 'tweak.js', 'text/javascript'], ['/tweak.css', 'tweak.css', 'text/css']]) {
    const response = await fetch(`${pylon.url}/captures/mini-pylon/source${path}`);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get('content-type'), new RegExp(type));
    assert.equal(await response.text(), readFileSync(join(source, file), 'utf8'));
  }
  for (const path of ['/data/schema.json', '/renders/..%2Fdata%2Fschema.json', '/renders/nope.png', '/out/previews/nope.png']) {
    assert.equal((await fetch(`${pylon.url}/captures/mini-pylon/source${path}`)).status, 404, path);
  }
});

test('swatch draws write_swatch_png\'s flat square, at most 256 px', () => {
  const png = swatch({ 'a.b': new PyNum(1, 'int') }, 480);
  assert.deepEqual(pngSize(png), { width: 256, height: 256 });
  assert.deepEqual(pngSize(swatch({}, 100)), { width: 100, height: 100 });
});
PLAN_EOF
```

```bash red
node --test tests/unit/playground-standin.test.mjs
```

```expected
/playground/fixtures/mini-pylon/api.mjs' imported from
```

**Implementation.** The server it stands in for is `tools/tweak_server.py` at b984b47 (routes at lines 293-321, a job's public fields at 196-200, the finals' at 245-260; checked 2026-11-13).

1. Read `source/data/*.json` on each request, so a replaced snapshot is read fresh.
2. `swatch(values, size)`: the SHA-1 of `dumps(values)`, the colour `64 + (b >> 1)` of its first three bytes, a flat square of `min(size, 256)` px through `encodePng`.
3. `api`, GET: `/schema` and `/finals` answer the recorded `schema.json` and `finals.json`; `/status` answers `{ running: null, waiting: [] }`; `/jobs/<id>` answers that job after its first poll, or 404 `{ error: 'no such job' }`; anything else 404 `{ error: 'not found' }`. A method other than GET, HEAD or POST answers 405. Every answer is JSON with `cache-control: no-store`, as the server's are.
4. `api`, `POST /render`: read the body (over 1 MB is refused), `loads` it (not JSON: 400 `{ error: 'the body is not JSON' }`; not an object: 400 `{ error: 'the body must be a JSON object' }`). `kind` defaults to `preview`; any other than `preview` or `final` answers 400 `{ error: 'kind must be preview or final' }`. `values` defaults to `{}` and must be an object (else 400 `{ error: 'values must be an object' }`). `resolve` it against `typedVars(schema.json, types.json)`; an error answers 400 `{ error: <its message> }`. Then a job, `id` `<n>-fixture`: `size` and `samples` the resolved `render.preview_size` and `render.preview_samples`, `seconds` `0`, `error` `null`, `name` the payload's when it is a string else `''`, `ahead` `0`. The POST answers it as `queued`; its first poll answers its end state.
   - A preview: when the resolved scene values (without `render.*`) equal, path by path and number by value, a recorded final's values resolved the same way, its `url` is that final's `url`; otherwise its `url` is `${PREFIX}/out/previews/preview-<id>.png` and the swatch of the scene values at that size is kept in memory under that path. Its end state is `done`.
   - A final keeps the size it was asked for (1080 when none) with 160 samples, and ends `failed` with `error` `FINALS_REFUSED` and no `url`.
   - A job is answered with exactly the fields `id, kind, state, size, samples, url, seconds, error, name, ahead`, in that order. Keep the newest 100 jobs and the newest 40 swatches.
5. `files`, GET or HEAD only (else 405): `/` and `/index.html` answer `index.html`, `/tweak.js` and `/tweak.css` their files, each with its content type and `cache-control: no-store`; a swatch kept in memory answers by its path; `/renders/<name>.png` answers that file when the name matches `/^[\w.-]+\.png$/` and the file is in `renders/`; both PNGs as `image/png` with `cache-control: max-age=86400`, as the server sends its page files and its `/out/` PNGs (`file` and `do_GET` in `tools/tweak_server.py` lines 288-312 at b984b47, checked 2026-11-14); anything else is 404.

**Checks.** The red command gives 10 pass.

**Commit.** `feat(playground): stand in for mini-pylon's tweak server from the recorded data`, staging the two files.

### Task 7: the source side's seed

**Files:** create `playground/fixtures/source-side.js` and `tests/unit/playground-source-side.test.mjs`.

**Interfaces.** `playground/fixtures/source-side.js`, plain JavaScript with no imports (the browser loads it through the playground, Node imports it, and two of its functions travel through `page.evaluate`), exports:

- `PREFIXES`: `['wings-vdb:', 'mini-pylon-tweak:']`.
- `SOURCES`: `{ 'wings-vdb': { console: 'wings-vdb', refuses: ['saving defaults'], fonts: true }, 'mini-pylon': { console: 'mini-pylon', refuses: ['finals'], fonts: false } }`.
- `sourceUrl(project)` (`/captures/<project>/source/`), `knobsConsole(project)` (`knobs-<project>`), `defaultTab(capture)` (the first visible group's name).
- `sourceSeed(project, capture, setName, tab = defaultTab(capture))` → `{ clear, local, session }`, the keys to clear and to write, as strings.
- `seedSource(seed, local = localStorage, session = sessionStorage)`.
- `async openSourceTab({ tab, timeout = 15000 }, doc = document)`, resolving to the tab.
- `otherSideTab(project, capture, tab, to)` → a tab name or `null`.

```bash apply
mkdir -p tests/unit
cat > tests/unit/playground-source-side.test.mjs <<'PLAN_EOF'
// The source side's seed (playground/fixtures/source-side.js): which storage
// keys a project's own page is started with, in its own encoding, and which
// tab survives a switch of side. The captures are built from the stand-in
// checkouts under tests/fixtures/captures.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../../playground/adapters/common.mjs';
import * as miniPylon from '../../playground/adapters/mini-pylon.mjs';
import * as wingsVdb from '../../playground/adapters/wings-vdb.mjs';
import { defaultTab, otherSideTab, PREFIXES, seedSource, SOURCES, sourceSeed, sourceUrl } from '../../playground/fixtures/source-side.js';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const fixtures = join(repo, 'tests', 'fixtures', 'captures');
const wings = await build(wingsVdb, join(fixtures, 'wings-vdb'), { reports: join(fixtures, 'wings-vdb-browsers') });
const pylon = await build(miniPylon, join(fixtures, 'mini-pylon'));

// A Storage with only what seedSource uses.
class MemoryStorage {
  constructor(entries = {}) { this.map = new Map(Object.entries(entries)); }
  get length() { return this.map.size; }
  key(i) { return [...this.map.keys()][i] ?? null; }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
  entries() { return Object.fromEntries(this.map); }
}

test('wings-vdb is seeded with its params as a JSON object, its tab as a JSON array, and the drawer open as the string 1', () => {
  assert.deepEqual(sourceSeed('wings-vdb', wings, 'defaults', 'scroll'), {
    clear: PREFIXES,
    local: { 'wings-vdb:params': '{}', 'wings-vdb:groups': '["scroll"]' },
    session: { 'wings-vdb:drawer': '1' },
  });
  const report = JSON.parse(readFileSync(join(fixtures, 'wings-vdb-browsers', 'fixture01.json'), 'utf8'));
  const seed = sourceSeed('wings-vdb', wings, 'fixture01', 'dispersal');
  assert.deepEqual(JSON.parse(seed.local['wings-vdb:params']), JSON.parse(report.storage['wings-vdb:params']));
  // The console and perf tabs are not groups: the page keeps its own.
  assert.ok(!('wings-vdb:groups' in sourceSeed('wings-vdb', wings, 'defaults', 'wings-vdb').local));
  assert.ok(!('wings-vdb:groups' in sourceSeed('wings-vdb', wings, 'defaults', 'perf').local));
  assert.equal(sourceSeed('wings-vdb', wings, 'defaults').local['wings-vdb:groups'], '["dispersal"]');
});

test('mini-pylon is seeded with every key as JSON: values, the view, the group, and the drawer open', () => {
  assert.deepEqual(sourceSeed('mini-pylon', pylon, 'dusk', 'light'), {
    clear: PREFIXES,
    local: {
      'mini-pylon-tweak:values': JSON.stringify(pylon.valueSets.dusk.sourceValues),
      'mini-pylon-tweak:view': '"params"',
      'mini-pylon-tweak:drawer': 'true',
      'mini-pylon-tweak:group': '"light"',
    },
    session: {},
  });
  assert.equal(sourceSeed('mini-pylon', pylon, 'defaults', 'renders').local['mini-pylon-tweak:view'], '"renders"');
  assert.equal(sourceSeed('mini-pylon', pylon, 'defaults', 'mini-pylon').local['mini-pylon-tweak:view'], '"console"');
  assert.ok(!('mini-pylon-tweak:group' in sourceSeed('mini-pylon', pylon, 'defaults', 'renders').local));
});

test('a seed refuses an unknown value set, a capture made before sourceValues, and an unknown project', () => {
  assert.throws(() => sourceSeed('wings-vdb', wings, 'nope'), /unknown value set: nope/);
  const old = structuredClone(pylon);
  delete old.valueSets.defaults.sourceValues;
  assert.throws(() => sourceSeed('mini-pylon', old, 'defaults'), /mini-pylon: value set defaults has no sourceValues; run npm run playground:capture -- mini-pylon/);
  assert.throws(() => sourceSeed('other', pylon, 'defaults'), /no source side for other/);
});

test('seedSource clears every key under both prefixes in both storages, and only those, before it writes', () => {
  const local = new MemoryStorage({ 'wings-vdb:flags': '{"waitlist":true}', 'wings-vdb:texture': 'grain', 'mini-pylon-tweak:history': '[]', 'knobs-playground:json': '[]', 'knobs-wings-vdb:groups': '["scroll"]' });
  const session = new MemoryStorage({ 'wings-vdb:defaults-note': 'x', 'knobs-wings-vdb:drawer': '1' });
  seedSource(sourceSeed('wings-vdb', wings, 'defaults', 'scroll'), local, session);
  assert.deepEqual(local.entries(), { 'knobs-playground:json': '[]', 'knobs-wings-vdb:groups': '["scroll"]', 'wings-vdb:params': '{}', 'wings-vdb:groups': '["scroll"]' });
  assert.deepEqual(session.entries(), { 'knobs-wings-vdb:drawer': '1', 'wings-vdb:drawer': '1' });
});

test('seedSource uses nothing outside itself, so page.evaluate can carry it', () => {
  // page.evaluate sends the function's text alone; a free name would break in the page.
  const run = new Function('seed', 'local', 'session', `return (${seedSource.toString()})(seed, local, session);`);
  const local = new MemoryStorage({ 'mini-pylon-tweak:x': '1' });
  run(sourceSeed('mini-pylon', pylon, 'defaults', 'ground'), local, new MemoryStorage());
  assert.equal(local.getItem('mini-pylon-tweak:x'), null);
  assert.equal(local.getItem('mini-pylon-tweak:group'), '"ground"');
});

test('switching side keeps a group tab, swaps the console tab for the other side\'s, and drops the rest', () => {
  assert.equal(otherSideTab('wings-vdb', wings, 'scroll', 'source'), 'scroll');
  assert.equal(otherSideTab('wings-vdb', wings, 'scroll', 'knobs'), 'scroll');
  assert.equal(otherSideTab('wings-vdb', wings, 'knobs-wings-vdb', 'source'), 'wings-vdb');
  assert.equal(otherSideTab('wings-vdb', wings, 'wings-vdb', 'knobs'), 'knobs-wings-vdb');
  assert.equal(otherSideTab('wings-vdb', wings, 'perf', 'knobs'), null);
  assert.equal(otherSideTab('wings-vdb', wings, 'birds', 'knobs'), null, 'a hidden group has no tab');
  assert.equal(otherSideTab('mini-pylon', pylon, 'renders', 'knobs'), null);
  assert.equal(otherSideTab('mini-pylon', pylon, null, 'source'), null);
});

test('each project\'s source page, default tab and fixture facts', () => {
  assert.equal(sourceUrl('wings-vdb'), '/captures/wings-vdb/source/');
  assert.equal(defaultTab(wings), 'dispersal');
  assert.equal(defaultTab(pylon), 'ground');
  assert.deepEqual(SOURCES, {
    'wings-vdb': { console: 'wings-vdb', refuses: ['saving defaults'], fonts: true },
    'mini-pylon': { console: 'mini-pylon', refuses: ['finals'], fonts: false },
  });
  assert.deepEqual(PREFIXES, ['wings-vdb:', 'mini-pylon-tweak:']);
});
PLAN_EOF
```

```bash red
node --test tests/unit/playground-source-side.test.mjs
```

```expected
/playground/fixtures/source-side.js' imported from
```

**Implementation.**

1. `sourceSeed` throws `unknown value set: <setName>` for a set the capture lacks, `<project>: value set <setName> has no sourceValues; run npm run playground:capture -- <project>` for a set without `sourceValues`, and `no source side for <project>` for another project. `clear` is `PREFIXES` itself. A tab is a group when it is one of the capture's visible groups.
   - wings-vdb: `local` holds `wings-vdb:params` (`JSON.stringify(sourceValues)`) and, for a group tab only, `wings-vdb:groups` (`JSON.stringify([tab])`); `session` holds `wings-vdb:drawer` `'1'`. The keys and encodings are the page's own (checked: wings-vdb src/params.js line 139, src/terminal.js lines 54-64 and 465 at 7f92902, 2026-11-13).
   - mini-pylon: `local` holds `mini-pylon-tweak:values` (`JSON.stringify(sourceValues)`), `mini-pylon-tweak:view` (`JSON.stringify` of `'params'` for a group tab, `'renders'` for `renders`, else `'console'`), `mini-pylon-tweak:drawer` (`'true'`), and for a group tab `mini-pylon-tweak:group` (`JSON.stringify(tab)`); `session` is empty (checked: mini-pylon tools/tweak/tweak.js lines 5-7 and 200-201 at b984b47, 2026-11-13).
2. `seedSource` uses nothing outside its own body: in each storage, from the last key to the first, remove every key that starts with one of `seed.clear`; then write `seed.local` and `seed.session`.
3. `openSourceTab` uses nothing outside its own body either. Until `timeout` ms have passed, every 50 ms: find the `.term-tabs .term-tab` whose trimmed text is `tab`; resolve when it has `active` and the page has a `.term.open`; click it when it shows and is not active, at most every 500 ms. After the deadline, throw `the source drawer did not open on its <tab> tab within <timeout> ms`.
4. `otherSideTab`: `null` for no tab; a visible group stays; the console tab of the side being left (`knobs-<project>` when going to the source side, `SOURCES[project].console` when going to the knobs side) becomes the other side's; anything else is `null`.
5. A header comment says what the module is, and why two functions are self-contained.

**Checks.** The red command gives 7 pass.

**Commit.** `feat(playground): seed a project's own page through its own storage keys`, staging the two files.

### Task 8: the playground serves the source fixtures

**Files:** create `playground/fixtures/routes.mjs`, `playground/fixtures/wings-vdb/vite.mjs`, `tests/unit/playground-routes.test.mjs` and `tests/browser/source-serve.test.mjs`; edit `playground/server.mjs`.

**Interfaces.**

- `playground/fixtures/wings-vdb/vite.mjs` exports `BASE` (`'/captures/wings-vdb/source/'`) and `wingsFixture({ sourceDir, httpServer, allowedHosts = [], logLevel = 'error' })`, resolving to a Vite dev server in middleware mode.
- `playground/fixtures/routes.mjs` exports `ROOT_PATHS` (`[{ path, owner }]`), `FONTS` (the two face file names), `DEFAULTS_REFUSED` (`'defaults are not saved in the knobs fixture'`), `allowedRequest(pathname, project)`, `fontState(fonts)` (`'local'` or `'fallback'`), `wingsRoutes({ sourceDir, fonts })` (`{ svg, fonts, fontState, wings }`, connect handlers) and `fixturesPlugin({ captures, fonts, allowedHosts = [], logLevel = 'error' })` (a Vite plugin).
- `servePlayground({ host, port, drafts, captures, fonts, logLevel, allowedHosts })` becomes `async`, takes `fonts`, and resolves to `serve()`'s result plus `captures` (the captures folder it uses).

```bash apply
mkdir -p tests/unit
cat > tests/unit/playground-routes.test.mjs <<'PLAN_EOF'
// wings-vdb's root routes and the root-path table (playground/fixtures/routes.mjs),
// served over HTTP with a fonts folder of the test's own.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allowedRequest, DEFAULTS_REFUSED, fontState, ROOT_PATHS, wingsRoutes } from '../../playground/fixtures/routes.mjs';

const repo = fileURLToPath(new URL('../..', import.meta.url));
mkdirSync(join(repo, 'tests', '.tmp'), { recursive: true });
const dir = mkdtempSync(join(repo, 'tests', '.tmp', 'routes-'));
// A plain HTTP server with handlers mounted at prefixes, as connect mounts them: the prefix is stripped.
function mount(routes) {
  const server = createServer((req, res) => {
    for (const [prefix, handler] of routes) {
      if (req.url === prefix || req.url.startsWith(`${prefix}/`) || req.url.startsWith(`${prefix}?`)) {
        req.url = req.url.slice(prefix.length) || '/';
        if (!req.url.startsWith('/')) req.url = `/${req.url}`;
        return handler(req, res, () => { res.statusCode = 404; res.end('next'); });
      }
    }
    res.statusCode = 404;
    res.end('no route');
  });
  return new Promise(resolveServer => server.listen(0, '127.0.0.1', () => resolveServer({ server, url: `http://127.0.0.1:${server.address().port}` })));
}
const post = (url, body) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const getJson = async url => (await fetch(url)).json();

let wings;
const fonts = join(dir, 'fonts');
const noFonts = join(dir, 'no-fonts');
before(async () => {
  mkdirSync(fonts);
  mkdirSync(noFonts);
  writeFileSync(join(fonts, 'ABCArealVariable.woff2'), 'areal');
  writeFileSync(join(fonts, 'ABCArealMonoVariable.woff2'), 'mono');
  const wingsSource = join(dir, 'wings-source');
  mkdirSync(join(wingsSource, 'public'), { recursive: true });
  writeFileSync(join(wingsSource, 'public', 'wings-wide.svg'), '<svg/>');
  const local = wingsRoutes({ sourceDir: wingsSource, fonts });
  const fallback = wingsRoutes({ sourceDir: wingsSource, fonts: noFonts });
  wings = await mount([
    ['/local/captures/wings-vdb/fonts', local.fontState], ['/local/fonts', local.fonts],
    ['/fallback/captures/wings-vdb/fonts', fallback.fontState], ['/fallback/fonts', fallback.fonts],
    ['/wings-wide.svg', local.svg], ['/__wings', local.wings],
  ]);
});
after(() => {
  wings?.server.close();
  rmSync(dir, { recursive: true, force: true });
});
test('POST /__wings/defaults answers what the drawer prints as a refusal, and /__wings/report takes a report', async () => {
  const defaults = await post(`${wings.url}/__wings/defaults`, { values: {}, wants: [], dryRun: false });
  assert.equal(defaults.status, 200);
  assert.deepEqual(await defaults.json(), { changes: [], errors: [DEFAULTS_REFUSED] });
  assert.equal(DEFAULTS_REFUSED, 'defaults are not saved in the knobs fixture');
  assert.equal((await post(`${wings.url}/__wings/report`, { storage: {} })).status, 204);
  assert.equal((await fetch(`${wings.url}/__wings/defaults`)).status, 405);
  assert.equal((await post(`${wings.url}/__wings/other`, {})).status, 404);
});

test('the fonts route serves the two faces from the fonts folder, and says local or fallback', async () => {
  assert.deepEqual(await getJson(`${wings.url}/local/captures/wings-vdb/fonts`), { fonts: 'local' });
  const face = await fetch(`${wings.url}/local/fonts/ABCArealVariable.woff2`);
  assert.equal(face.status, 200);
  assert.equal(face.headers.get('content-type'), 'font/woff2');
  assert.equal(await face.text(), 'areal');
  assert.deepEqual(await getJson(`${wings.url}/fallback/captures/wings-vdb/fonts`), { fonts: 'fallback' });
  assert.equal((await fetch(`${wings.url}/fallback/fonts/ABCArealVariable.woff2`)).status, 404);
  for (const path of ['/local/fonts/other.woff2', '/local/fonts/..%2Fsecret', '/local/fonts/']) assert.equal((await fetch(`${wings.url}${path}`)).status, 404, path);
  assert.equal(fontState(fonts), 'local');
  assert.equal(fontState(noFonts), 'fallback');
  assert.equal((await fetch(`${wings.url}/wings-wide.svg`)).headers.get('content-type'), 'image/svg+xml');
});

test('the root-path table names each path a page asks for outside its prefix, and whose it is', () => {
  assert.deepEqual(ROOT_PATHS, [
    { path: '/wings-wide.svg', owner: 'wings-vdb' },
    { path: '/fonts/', owner: 'wings-vdb' },
    { path: '/__wings/', owner: 'wings-vdb' },
    { path: '/api/', owner: 'mini-pylon' },
  ]);
  for (const path of ['/captures/wings-vdb/source/src/main.js', '/wings-wide.svg', '/fonts/ABCArealVariable.woff2', '/__wings/defaults']) assert.ok(allowedRequest(path, 'wings-vdb'), path);
  for (const path of ['/wings-wide.svgz', '/api/schema', '/captures/mini-pylon/source/', '/src/main.js', '/fonts', '/@vite/client']) assert.ok(!allowedRequest(path, 'wings-vdb'), path);
  for (const path of ['/api/schema', '/captures/mini-pylon/source/out/previews/p.png']) assert.ok(allowedRequest(path, 'mini-pylon'), path);
  for (const path of ['/fonts/ABCArealVariable.woff2', '/tweak.js', '/out/previews/p.png']) assert.ok(!allowedRequest(path, 'mini-pylon'), path);
});
PLAN_EOF
```
```bash apply
mkdir -p tests/browser
cat > tests/browser/source-serve.test.mjs <<'PLAN_EOF'
// The source fixtures as the playground serves them (playground/fixtures):
// each project's own page under /captures/<project>/source/, the root paths
// its page asks for, the wings-vdb fixture's Vite and its HMR on the
// playground's port, and the server's close. The captures are built from the
// stand-in checkouts under tests/fixtures/captures (lib/captures.mjs); the
// fonts folder is the test's own and empty.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { join } from 'node:path';
import { closeAll, launch, newPage, repo } from './lib/harness.mjs';
import { writeCaptures } from './lib/captures.mjs';
import { servePlayground } from '../../playground/server.mjs';
import { allowedRequest } from '../../playground/fixtures/routes.mjs';
import { openSourceTab, seedSource, sourceSeed } from '../../playground/fixtures/source-side.js';

mkdirSync(join(repo, 'tests', '.tmp'), { recursive: true });
const captures = mkdtempSync(join(repo, 'tests', '.tmp', 'captures-'));
const fonts = mkdtempSync(join(repo, 'tests', '.tmp', 'fonts-'));
const drafts = mkdtempSync(join(repo, 'tests', '.tmp', 'drafts-'));
// Every file under a folder with its size and mtime, to show a run wrote nothing there.
const listing = dir => readdirSync(dir, { recursive: true }).sort().map(f => {
  const s = statSync(join(dir, f));
  return `${f} ${s.size} ${s.mtimeMs}`;
});

let site, browser, written;
before(async () => {
  await writeCaptures(captures);
  written = listing(captures);
  site = await servePlayground({ drafts, captures, fonts, logLevel: 'error' });
  browser = await launch();
});
after(() => closeAll(() => browser?.close(), () => site?.close(), ...[captures, fonts, drafts].map(dir => () => rmSync(dir, { recursive: true, force: true }))));

const capture = project => JSON.parse(readFileSync(join(captures, project, 'capture.json'), 'utf8'));

// A project's own page, seeded as the shell seeds it and open on a tab, with
// what it requested and the console errors it logged (each with where from).
async function sourcePage(project, set, tab) {
  const page = await newPage(browser);
  const requests = [];
  const errors = [];
  page.on('request', r => requests.push(new URL(r.url())));
  page.on('pageerror', e => errors.push({ text: `pageerror: ${e.message}`, at: '' }));
  page.on('console', m => { if (m.type() === 'error') errors.push({ text: m.text(), at: m.location().url ? new URL(m.location().url).pathname : '' }); });
  const responses = new Map();
  page.on('response', r => responses.set(new URL(r.url()).pathname, r.status()));
  // Any page of the playground's origin will do to write the seed.
  await page.goto(`${site.url}captures/wings-vdb/fonts`);
  await page.evaluate(seedSource, sourceSeed(project, capture(project), set, tab));
  requests.length = 0;
  await page.goto(`${site.url}captures/${project}/source/`);
  await page.evaluate(openSourceTab, { tab });
  return { page, requests, errors, responses };
}
const origin = () => new URL(site.url).origin;
const outsideTable = (requests, project) => requests.filter(u => u.origin === origin() && !allowedRequest(u.pathname, project)).map(u => u.pathname);

test('the wings-vdb page loads under its prefix with its stubs, and each root path it asks for reaches its owner', async () => {
  const { page, requests, errors, responses } = await sourcePage('wings-vdb', 'defaults', 'dispersal');
  try {
    await page.locator('body[data-wordmark="loaded"]').waitFor();
    await page.locator('.term-log', { hasText: 'defaults: nothing to change' }).waitFor();
    const log = await page.locator('.term-log').innerText();
    assert.match(log, /defaults: defaults are not saved in the knobs fixture/);
    // The stub thread: empty, a panel, nothing to lay out.
    assert.equal(await page.locator('body').getAttribute('data-chat'), 'empty panel 0 0');
    assert.equal(await page.locator('.detail').innerText(), 'Wings, the stand-in.');
    assert.equal(await page.locator('.term-viz canvas').count(), 1);
    const paths = requests.filter(u => u.origin === origin()).map(u => u.pathname);
    for (const path of ['/captures/wings-vdb/source/src/main.js', '/captures/wings-vdb/source/cloud-fallback.svg', '/wings-wide.svg', '/__wings/defaults', '/fonts/ABCArealVariable.woff2']) assert.ok(paths.includes(path), `requested ${path}:\n${paths.join('\n')}`);
    assert.ok(paths.some(p => p.startsWith('/captures/wings-vdb/source/playground/fixtures/wings-vdb/stubs/chat.js') || p.endsWith('/stubs/chat.js')), `the chat stub is served:\n${paths.join('\n')}`);
    assert.ok(!paths.some(p => p.endsWith('/src/chat.js') || p.endsWith('/src/dev-report.js')), 'the real chat.js and dev-report.js are never asked for');
    assert.equal(responses.get('/wings-wide.svg'), 200);
    assert.equal(responses.get('/__wings/defaults'), 200);
    assert.equal(responses.get('/captures/wings-vdb/source/cloud-fallback.svg'), 200);
    // The test's fonts folder is empty: the faces fall back, and nothing else fails.
    assert.equal(responses.get('/fonts/ABCArealVariable.woff2'), 404);
    assert.deepEqual(errors.filter(e => !e.at.startsWith('/fonts/')).map(e => e.text), []);
    assert.deepEqual(outsideTable(requests, 'wings-vdb'), []);
  } finally { await page.context().close(); }
});

test('the mini-pylon page loads under its prefix, its /api calls reach the stand-in, and its preview shows', async () => {
  const { page, requests, errors } = await sourcePage('mini-pylon', 'defaults', 'ground');
  try {
    await page.locator('body[data-preview]').waitFor();
    assert.equal(await page.locator('body').getAttribute('data-preview'), 'done 480 0');
    assert.ok(await page.locator('img.render').evaluate(img => img.complete && img.naturalWidth === 256), 'the swatch loads');
    const paths = requests.filter(u => u.origin === origin()).map(u => u.pathname);
    for (const path of ['/captures/mini-pylon/source/tweak.js', '/captures/mini-pylon/source/tweak.css', '/api/schema', '/api/render']) assert.ok(paths.includes(path), `requested ${path}`);
    assert.ok(paths.some(p => p.startsWith('/api/jobs/')));
    assert.ok(paths.some(p => p.startsWith('/captures/mini-pylon/source/out/previews/')));
    assert.deepEqual(errors.map(e => e.text), []);
    assert.deepEqual(outsideTable(requests, 'mini-pylon'), []);
  } finally { await page.context().close(); }
});

test('the renders tab of the mini-pylon page shows each final from the fixture', async () => {
  const { page, errors } = await sourcePage('mini-pylon', 'defaults', 'renders');
  try {
    const img = page.locator('.finals img');
    await img.waitFor();
    assert.ok(await img.evaluate(i => i.src.includes('/captures/mini-pylon/source/renders/help-')));
    await page.waitForFunction(() => document.querySelector('.finals img').complete);
    assert.ok(await img.evaluate(i => i.naturalWidth === 2));
    assert.deepEqual(errors.map(e => e.text), []);
  } finally { await page.context().close(); }
});

test('the wings-vdb fixture\'s HMR client connects on the playground\'s own port, at the fixture\'s base', async () => {
  const page = await newPage(browser);
  try {
    const sockets = [];
    page.on('websocket', ws => sockets.push(new URL(ws.url())));
    await page.goto(`${site.url}captures/wings-vdb/source/`);
    await page.waitForFunction(() => document.querySelector('.term'));
    await page.waitForTimeout(500);
    assert.ok(sockets.length >= 1, 'an HMR socket opened');
    for (const url of sockets) {
      assert.equal(url.port, String(site.port), url.href);
      assert.equal(url.pathname, '/captures/wings-vdb/source/', url.href);
    }
  } finally { await page.context().close(); }
});

test('the playground\'s own pages are still the playground\'s while the fixtures are mounted', async () => {
  for (const [path, title] of [['', 'knobs playground'], ['grid.html', 'knobs grid'], ['stage.html', 'knobs stage']]) {
    const text = await (await fetch(`${site.url}${path}`)).text();
    assert.match(text, new RegExp(`<title>${title}</title>`), path || '/');
  }
  assert.equal((await fetch(`${site.url}shell.js`)).status, 200);
});

test('the source pages and their root paths answer a proxy\'s allowed host, and refuse any other', async () => {
  const proxied = await servePlayground({ drafts, captures, fonts, logLevel: 'error', allowedHosts: ['knobs.example.test'] });
  const call = (path, host) => new Promise((resolve, reject) => {
    const req = request(`${proxied.url.replace(/\/$/, '')}${path}`, { headers: { host } }, res => {
      let text = '';
      res.on('data', chunk => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, text }));
    });
    req.on('error', reject);
    req.end();
  });
  try {
    const page = await call('/captures/wings-vdb/source/', 'knobs.example.test');
    assert.equal(page.status, 200);
    assert.match(page.text, /src="\/captures\/wings-vdb\/source\/src\/main\.js"/);
    for (const path of ['/captures/wings-vdb/source/src/main.js', '/wings-wide.svg', '/api/schema', '/captures/mini-pylon/source/']) {
      assert.equal((await call(path, 'knobs.example.test')).status, 200, path);
    }
    assert.equal((await call('/captures/wings-vdb/source/', 'evil.example')).status, 403);
  } finally { await proxied.close(); }
});

test('the fonts route says local when the fonts folder holds both faces', async () => {
  const local = mkdtempSync(join(repo, 'tests', '.tmp', 'fonts-'));
  for (const face of ['ABCArealVariable.woff2', 'ABCArealMonoVariable.woff2']) writeFileSync(join(local, face), 'x');
  const served = await servePlayground({ drafts, captures, fonts: local, logLevel: 'error' });
  try {
    assert.deepEqual(await (await fetch(`${served.url}captures/wings-vdb/fonts`)).json(), { fonts: 'local' });
    assert.equal((await fetch(`${served.url}fonts/ABCArealVariable.woff2`)).status, 200);
  } finally { await closeAll(() => served.close(), () => rmSync(local, { recursive: true, force: true })); }
});

test('closing the playground closes the wings-vdb fixture too: the process exits on its own', async () => {
  const script = `
    import { servePlayground } from ${JSON.stringify(join(repo, 'playground', 'server.mjs'))};
    const site = await servePlayground({ captures: ${JSON.stringify(captures)}, drafts: ${JSON.stringify(drafts)}, fonts: ${JSON.stringify(fonts)}, logLevel: 'error' });
    await (await fetch(site.url + 'captures/wings-vdb/source/src/main.js')).text();
    await site.close();
    console.log('closed');
  `;
  const started = Date.now();
  const run = await new Promise(resolve => execFile(process.execPath, ['--input-type=module', '-e', script], { timeout: 20000 }, (error, stdout, stderr) => resolve({ error, stdout, stderr })));
  assert.equal(run.error, null, `the process did not exit by itself: ${run.error?.message}\n${run.stderr}`);
  assert.match(run.stdout, /closed/);
  assert.ok(Date.now() - started < 20000);
});

test('nothing a source page does writes under the captures folder', () => {
  assert.deepEqual(listing(captures), written);
});
PLAN_EOF
```

```bash red
node --test tests/unit/playground-routes.test.mjs
```

```expected
/playground/fixtures/routes.mjs' imported from
```

```bash red
node --test --test-concurrency=1 --test-timeout=60000 tests/browser/source-serve.test.mjs
```

```expected
/playground/fixtures/routes.mjs' imported from
```

**Implementation.**

1. `ROOT_PATHS`, in this order: `/wings-wide.svg` (wings-vdb), `/fonts/` (wings-vdb), `/__wings/` (wings-vdb), `/api/` (mini-pylon). `allowedRequest` is true for a path under `/captures/<project>/source/`, or one a `ROOT_PATHS` entry of that owner names: the same path, or, for an entry ending in `/`, any path under it. These are the absolute paths the real pages ask for (checked: wings-vdb src/cloud-morph.js line 39, src/main.js line 461, src/dev-report.js line 14 and src/style.css lines 1-12 at 7f92902, and mini-pylon tools/tweak/tweak.js lines 65-75 at b984b47, 2026-11-13).
2. `wingsRoutes`: `svg` answers `<sourceDir>/public/wings-wide.svg` as `image/svg+xml`, or 404. `fonts` answers only the two `FONTS` names (`ABCArealVariable.woff2`, `ABCArealMonoVariable.woff2`) from the fonts folder, as `font/woff2`, and 404 for any other path or a missing file. The `fontState` handler (named like the exported function it calls) answers `{ fonts: fontState(fonts) }`: `{ fonts: 'local' }` when both faces are in the folder, else `{ fonts: 'fallback' }`. `wings`: `/defaults` and `/report` take POST only (405 otherwise, 404 for any other path); `/defaults` answers 200 `{ changes: [], errors: [DEFAULTS_REFUSED] }`, which the drawer prints, then `nothing to change` (checked: wings-vdb src/main.js lines 461-471 at 7f92902, 2026-11-13); `/report` answers 204. Bodies are read to the end and not kept.
3. `wingsFixture`: `createServer` with `configFile: false`, `root` the source folder, `base` `BASE`, `appType: 'mpa'`, `cacheDir` `join(repo, 'tests', '.tmp', 'fixture-vite', 'wings-vdb')`, the given `logLevel`, `optimizeDeps: { noDiscovery: true, include: [] }`, and `server: { middlewareMode: true, ws: { server: httpServer }, allowedHosts, fs: { allow: [repo, sourceDir] } }`. One plugin, `enforce: 'pre'`, with a `resolveId(id, importer)` that, for a relative `id`, resolves it against the importer's folder (its query dropped) and returns the stub's absolute path when the result, relative to the source folder, is a `module` in the wings-vdb adapter's `stubs` (decision 16); otherwise `null`.
4. `fixturesPlugin`, named `knobs-playground-fixtures`. Its `configureServer` hook body (async, not a returned function, so its routes run before the playground's transform, HTML fallback and 404: `playground/server.mjs:42` mounts the draft route the same way at `acb38aa`):
   - When `<captures>/wings-vdb/source/index.html` exists, `await wingsFixture({ sourceDir, httpServer: server.httpServer, allowedHosts, logLevel })` and mount its `middlewares` with `server.middlewares.use('/captures/wings-vdb/source', …)`; otherwise mount there a handler answering 404 `{ error: 'no wings-vdb snapshot: run npm run playground:capture -- wings-vdb' }` (decision 9).
   - Mount `wingsRoutes`: `fontState` at `/captures/wings-vdb/fonts`, `svg` at `/wings-wide.svg`, `fonts` at `/fonts`, `wings` at `/__wings`.
   - When `<captures>/mini-pylon/source/data/schema.json` exists, mount `miniPylon(sourceDir)`'s `files` at `/captures/mini-pylon/source` and `api` at `/api`; otherwise both answer the same kind of 404, naming mini-pylon.
   - Its `closeServer` hook closes the wings-vdb fixture, if one was made.
5. `servePlayground`: the fonts folder is `fonts`, else `KNOBS_WINGS_FONTS`, else `public/fonts` of the wings-vdb adapter's `defaultCheckout` (decision 8), resolved; add `fixturesPlugin({ captures: capturesDir, fonts: fontsDir, allowedHosts, logLevel })` after the two plugins it has (`playground/server.mjs:83-95` at `acb38aa`); return `{ ...site, captures: capturesDir }`. Its callers already `await` it (`playground/serve.mjs:13`, `playground/shots.mjs:24` at `acb38aa`). Update its header comment with the source fixtures and `KNOBS_WINGS_FONTS`.

**Checks.** Both reds pass (3 unit; 9 browser as a check job). `playground.test.mjs` still passes (a check job with `--test-name-pattern='proxy|capture'`). Milestone 2 ends: `npm run test:unit` gives 281 pass, and `npm run test:browser` (check job) 205 pass.

**Commit.** `feat(playground): serve each captured project's own page beside its knobs translation`, staging the five files.

### Task 9: the knobs translation of a capture is named knobs-<project>

**Files:** edit `playground/stage.js` and `tests/browser/playground.test.mjs`.

The test changes: the captures come from `lib/captures.mjs` with their snapshots and a fonts folder of the test's own; the capture's drawer is titled `knobs-wings-vdb`; the capture view has two shots; and both shots tests start `shots.mjs` with the test's own captures, drafts and fonts, since from Task 8 its server mounts whatever captures folder it is given:

```bash apply
python3 - <<'PLAN_EOF'
# Edits tests/browser/playground.test.mjs: each old text must be there exactly once.
path = 'tests/browser/playground.test.mjs'
text = open(path, encoding='utf-8').read()
edits = [
    (r'''import { build } from '../../playground/adapters/common.mjs';
import * as miniPylon from '../../playground/adapters/mini-pylon.mjs';
import * as wingsVdb from '../../playground/adapters/wings-vdb.mjs';
''',
     r'''import { captureFixtures, collectPageErrors, writeCaptures } from './lib/captures.mjs';
'''),
    (r'''// A captures folder of the test's own, built from the fixture copies of both
// projects; wings-vdb's has one shot of its drawer.
const captures = mkdtempSync(join(repo, 'tests', '.tmp', 'captures-'));
const captureFixtures = join(repo, 'tests', 'fixtures', 'captures');
// A 1x1 PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
async function writeCaptures() {
  const wings = await build(wingsVdb, join(captureFixtures, 'wings-vdb'), { reports: join(captureFixtures, 'wings-vdb-browsers') });
  mkdirSync(join(captures, 'wings-vdb', 'shots'), { recursive: true });
  writeFileSync(join(captures, 'wings-vdb', 'shots', '01-wings-vdb.png'), PNG);
  wings.shots = [{ tab: 'wings-vdb', file: 'shots/01-wings-vdb.png' }];
  writeFileSync(join(captures, 'wings-vdb', 'capture.json'), JSON.stringify(wings));
  const pylon = await build(miniPylon, join(captureFixtures, 'mini-pylon'));
  pylon.shotsSkipped = 'the dev server at http://127.0.0.1:5371/ was not answering';
  mkdirSync(join(captures, 'mini-pylon'));
  writeFileSync(join(captures, 'mini-pylon', 'capture.json'), JSON.stringify(pylon));
}

let site, browser;
before(async () => {
  await writeCaptures();
  site = await servePlayground({ drafts, captures, logLevel: 'error' });
''',
     r'''// A captures folder of the test's own, built from the stand-in checkouts of
// both projects with their source snapshots (lib/captures.mjs); wings-vdb's
// has two shots of its drawer. The fonts folder is the test's own and empty.
const captures = mkdtempSync(join(repo, 'tests', '.tmp', 'captures-'));
const fonts = mkdtempSync(join(repo, 'tests', '.tmp', 'fonts-'));

let site, browser;
before(async () => {
  await writeCaptures(captures);
  site = await servePlayground({ drafts, captures, fonts, logLevel: 'error' });
'''),
    (r'''after(() => closeAll(() => browser?.close(), () => site?.close(), () => rmSync(drafts, { recursive: true, force: true }), () => rmSync(captures, { recursive: true, force: true })));''',
     r'''after(() => closeAll(() => browser?.close(), () => site?.close(), ...[drafts, captures, fonts].map(dir => () => rmSync(dir, { recursive: true, force: true }))));'''),
    (r'''  const proxied = await servePlayground({ drafts: proxiedDrafts, captures, logLevel: 'error', allowedHosts: ['knobs.example.test'] });''',
     r'''  const proxied = await servePlayground({ drafts: proxiedDrafts, captures, fonts, logLevel: 'error', allowedHosts: ['knobs.example.test'] });'''),
    (r'''test('the stage mounts a capture titled with its project, its hidden groups without tabs', async () => {
  const { page, errors } = await stage('s=capture:wings-vdb');
  try {
    assert.deepEqual(errors, []);
    const labels = await tabs(page);
    assert.equal(labels[0], 'wings-vdb');''',
     r'''test('the stage mounts a capture titled knobs-<project>, its hidden groups without tabs', async () => {
  const { page, errors } = await stage('s=capture:wings-vdb');
  try {
    assert.deepEqual(errors, []);
    const labels = await tabs(page);
    assert.equal(labels[0], 'knobs-wings-vdb');'''),
    (r'''    const shot = capture.locator('figure.shot img');
    await shot.waitFor();
    assert.ok(await shot.evaluate(img => img.complete && img.naturalWidth === 1), 'the shot loads');
    assert.match(await capture.locator('figure.shot figcaption').innerText(), /wings-vdb/);''',
     r'''    const shot = capture.locator('figure.shot img').first();
    await shot.waitFor();
    assert.ok(await shot.evaluate(img => img.complete && img.naturalWidth === 1), 'the shot loads');
    assert.deepEqual(await capture.locator('figure.shot figcaption').allInnerTexts(), ['wings-vdb', 'dispersal']);'''),
    (r'''      { timeout: 120000, env: { ...process.env, KNOBS_CAPTURES: captures, KNOBS_DRAFTS: drafts } },''',
     r'''      { timeout: 120000, env: { ...process.env, KNOBS_CAPTURES: captures, KNOBS_DRAFTS: drafts, KNOBS_WINGS_FONTS: fonts } },'''),
    (r'''      { timeout: 90000 }, (error''',
     r'''      { timeout: 90000, env: { ...process.env, KNOBS_CAPTURES: captures, KNOBS_DRAFTS: drafts, KNOBS_WINGS_FONTS: fonts } }, (error'''),
]
for old, new in edits:
    assert text.count(old) == 1, f'{path}: expected once: {old[:70]!r}'
    text = text.replace(old, new)
open(path, 'w', encoding='utf-8').write(text)
PLAN_EOF
```

```bash red
node --test --test-concurrency=1 --test-timeout=60000 --test-name-pattern='capture' tests/browser/playground.test.mjs
```

```expected
does not provide an export named 'snapshot'
```

**At this task** the file loads (Task 4 made `tests/browser/lib/captures.mjs`), and one test fails, `✖ the stage mounts a capture titled knobs-<project>, its hidden groups without tabs`, on its first tab's label (`wings-vdb`, not `knobs-wings-vdb`). The file's other tests that the pattern matches pass.

**Implementation.** In `playground/stage.js` (`playground/stage.js:11-13` at `acb38aa`), a `capture:<project>` scenario's drawer name is `knobs-<project>`; an exemplar's and a draft's stay their own name, and everything else `playground`. The title, the console tab, the prompt, the `data-knobs` host that `openTab` looks up, and the `<name>:values`, `<name>:groups` and `<name>:drawer` keys all follow the name, so the knobs side never touches the project's own page's keys. Update the comment above it.

**Checks.** The red command passes as a check job. `npm run test:browser` is left for the milestone's end.

**Commit.** `fix(playground): name a capture's knobs drawer knobs-<project>, apart from the project's own page`, staging the two files.

### Task 10: the shell's source side

**Files:** edit `playground/shell.js`; create `tests/browser/source-shell.test.mjs`.

```bash apply
mkdir -p tests/browser
cat > tests/browser/source-shell.test.mjs <<'PLAN_EOF'
// The shell on a capture's source side (playground/shell.js, side=source):
// the project's own page in the stage frame, seeded through its own storage
// keys; the capture pane built from the capture's data; the source | knobs
// switch; and the fixture line. The captures are built from the stand-in
// checkouts under tests/fixtures/captures (lib/captures.mjs); the fonts
// folder is the test's own and empty.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { closeAll, launch, newPage, repo } from './lib/harness.mjs';
import { captureFixtures, collectPageErrors, writeCaptures } from './lib/captures.mjs';
import { servePlayground } from '../../playground/server.mjs';

mkdirSync(join(repo, 'tests', '.tmp'), { recursive: true });
const captures = mkdtempSync(join(repo, 'tests', '.tmp', 'captures-'));
const fonts = mkdtempSync(join(repo, 'tests', '.tmp', 'fonts-'));
const drafts = mkdtempSync(join(repo, 'tests', '.tmp', 'drafts-'));

let site, browser;
before(async () => {
  await writeCaptures(captures);
  site = await servePlayground({ drafts, captures, fonts, logLevel: 'error' });
  browser = await launch();
});
after(() => closeAll(() => browser?.close(), () => site?.close(), ...[captures, fonts, drafts].map(dir => () => rmSync(dir, { recursive: true, force: true }))));

const capture = project => JSON.parse(readFileSync(join(captures, project, 'capture.json'), 'utf8'));

// The shell, on a capture's source side.
async function shell(query) {
  const page = await newPage(browser, { viewport: { width: 1600, height: 1000 } });
  const errors = collectPageErrors(page);
  await page.goto(`${site.url}?${query}`);
  return { page, errors };
}
const frame = page => page.frameLocator('iframe.stage');
// The stage frame, once it shows a source page.
const sourceFrame = page => page.frames().find(f => f.url().includes('/source/'));
const view = (page, name) => page.locator(`.views [data-view="${name}"]`);

test('side=source frames the project\'s page and builds the capture pane from the capture\'s data, without __stage', async () => {
  const { page, errors } = await shell('s=capture:wings-vdb&view=capture&side=source');
  try {
    await page.locator('body[data-source-ready="dispersal"]').waitFor();
    assert.equal(await page.locator('iframe.stage').getAttribute('src'), '/captures/wings-vdb/source/');
    assert.equal(await sourceFrame(page).evaluate(() => typeof window.__stage), 'undefined');
    const pane = view(page, 'capture');
    const text = await pane.innerText();
    for (const words of ['not in git', 'not translated', 'viz.js']) assert.ok(text.includes(words), `capture pane shows ${words}`);
    assert.deepEqual(await pane.locator('select.value-set option').evaluateAll(o => o.map(x => x.value)), ['defaults', 'fixture01']);
    // The editor holds the capture's knobs groups at once.
    const groups = JSON.parse(await page.locator('textarea[aria-label="Schema JSON"]').inputValue());
    assert.deepEqual(groups.map(g => g.name), capture('wings-vdb').groups.map(g => g.name));
    // The other panes say they describe the knobs side.
    await page.locator('.view-tabs button[data-for=schema]').click();
    assert.match(await view(page, 'schema').innerText(), /describes the knobs side/);
    assert.deepEqual(errors, []);
  } finally { await page.context().close(); }
});

test('a value set and a tab reach each source page through its own keys, in its own encoding', async () => {
  {
    const { page, errors } = await shell('s=capture:wings-vdb&set=fixture01&tab=scroll&side=source');
    try {
      await page.locator('body[data-source-ready="scroll"]').waitFor();
      const report = JSON.parse(readFileSync(join(captureFixtures, 'wings-vdb-browsers', 'fixture01.json'), 'utf8'));
      const stored = await sourceFrame(page).evaluate(() => ({ params: localStorage.getItem('wings-vdb:params'), groups: localStorage.getItem('wings-vdb:groups'), drawer: sessionStorage.getItem('wings-vdb:drawer') }));
      assert.deepEqual(JSON.parse(stored.params), JSON.parse(report.storage['wings-vdb:params']));
      assert.equal(stored.groups, '["scroll"]');
      assert.equal(stored.drawer, '1');
      // The page migrated dispersal.hang to scroll.hang itself.
      assert.equal(await frame(page).locator('.term-row[data-path="scroll.hang"] .term-value').innerText(), '1.5');
      assert.deepEqual(errors, []);
    } finally { await page.context().close(); }
  }
  {
    const { page, errors } = await shell('s=capture:mini-pylon&set=dusk&tab=light&side=source');
    try {
      await page.locator('body[data-source-ready="light"]').waitFor();
      assert.equal(await frame(page).locator('.term-row[data-path="light.sun_elevation"] .term-value').innerText(), '4');
      assert.equal(await sourceFrame(page).evaluate(() => localStorage.getItem('mini-pylon-tweak:view')), '"params"');
      assert.deepEqual(errors, []);
    } finally { await page.context().close(); }
  }
});

test('the seed starts a source page without the keys an earlier visit left', async () => {
  const page = await newPage(browser, { viewport: { width: 1600, height: 1000 } });
  try {
    await page.goto(`${site.url}captures/wings-vdb/fonts`);
    await page.evaluate(() => {
      localStorage.setItem('wings-vdb:flags', '{"waitlist":true}');
      localStorage.setItem('wings-vdb:texture', 'grain');
      localStorage.setItem('mini-pylon-tweak:history', '[]');
      sessionStorage.setItem('wings-vdb:defaults-note', 'old');
      localStorage.setItem('knobs-playground:json', '[]');
    });
    await page.goto(`${site.url}?s=capture:wings-vdb&side=source`);
    await page.locator('body[data-source-ready]').waitFor();
    // flags.js read no waitlist flag: it was gone before the page started.
    assert.equal(await page.frameLocator('iframe.stage').locator('body').getAttribute('data-waitlist'), 'false');
    const left = await page.evaluate(() => [...Array(localStorage.length).keys()].map(i => localStorage.key(i)).sort());
    assert.deepEqual(left, ['knobs-playground:json', 'wings-vdb:groups', 'wings-vdb:params']);
    assert.equal(await page.evaluate(() => sessionStorage.getItem('wings-vdb:defaults-note')), null);
  } finally { await page.context().close(); }
});

test('the knobs side of a capture keeps its state under knobs-<project> and leaves the source page\'s keys alone', async () => {
  const { page } = await shell('s=capture:wings-vdb&tab=scroll&side=source');
  try {
    await page.locator('body[data-source-ready="scroll"]').waitFor();
    // Same context, same storage: a stage of the knobs side.
    const knobs = await page.context().newPage();
    await knobs.goto(`${site.url}stage.html?s=capture:wings-vdb&tab=presence`);
    await knobs.locator('body[data-ready]').waitFor();
    assert.equal(await knobs.locator('.term-tab').first().innerText(), 'knobs-wings-vdb');
    const keys = await knobs.evaluate(() => ({
      local: Object.fromEntries([...Array(localStorage.length).keys()].map(i => localStorage.key(i)).map(k => [k, localStorage.getItem(k)])),
      session: Object.fromEntries([...Array(sessionStorage.length).keys()].map(i => sessionStorage.key(i)).map(k => [k, sessionStorage.getItem(k)])),
    }));
    assert.equal(keys.local['wings-vdb:groups'], '["scroll"]');
    assert.equal(keys.local['wings-vdb:params'], '{}');
    assert.equal(keys.local['knobs-wings-vdb:groups'], '["presence"]');
    assert.ok(Object.keys(keys.local).filter(k => k.startsWith('wings-vdb:')).every(k => ['wings-vdb:groups', 'wings-vdb:params'].includes(k)));
  } finally { await page.context().close(); }
});

test('the source | knobs switch keeps set, tab and view, and maps the console tab across', async () => {
  const { page, errors } = await shell('s=capture:wings-vdb&set=fixture01&tab=scroll&view=capture');
  try {
    const switcher = view(page, 'capture').locator('.side-switch');
    await switcher.waitFor();
    assert.equal(await switcher.locator('button.on').innerText(), 'knobs');
    await switcher.locator('button[data-side=source]').click();
    await page.waitForURL(url => new URLSearchParams(url.search).get('side') === 'source');
    const query = new URLSearchParams(new URL(page.url()).search);
    assert.deepEqual(['set', 'tab', 'view'].map(k => query.get(k)), ['fixture01', 'scroll', 'capture']);
    await page.locator('body[data-source-ready="scroll"]').waitFor();
    await view(page, 'capture').locator('.side-switch button[data-side=knobs]').click();
    await page.waitForURL(url => new URLSearchParams(url.search).get('side') === 'knobs');
    await page.frameLocator('iframe.stage').locator('body[data-ready]').waitFor();
    assert.equal(new URLSearchParams(new URL(page.url()).search).get('tab'), 'scroll');
    assert.deepEqual(errors, []);
  } finally { await page.context().close(); }
  const { page: other } = await shell('s=capture:wings-vdb&tab=wings-vdb&view=capture&side=source');
  try {
    await other.locator('body[data-source-ready="wings-vdb"]').waitFor();
    await view(other, 'capture').locator('.side-switch button[data-side=knobs]').click();
    await other.waitForURL(url => new URLSearchParams(url.search).get('side') === 'knobs');
    assert.equal(new URLSearchParams(new URL(other.url()).search).get('tab'), 'knobs-wings-vdb');
    await other.frameLocator('iframe.stage').locator('body[data-ready]').waitFor();
  } finally { await other.context().close(); }
});

test('the fixture line names the snapshot, the stubs, what the stand-in refuses and the fonts', async () => {
  {
    const { page } = await shell('s=capture:wings-vdb&view=capture&side=source');
    try {
      const line = view(page, 'capture').locator('.fixture');
      await line.getByText('fonts: fallback').waitFor();
      const text = await line.innerText();
      for (const words of ['snapshot of wings-vdb', 'stubbed: src/chat.js, src/dev-report.js', 'not in the fixture: saving defaults', 'fonts: fallback (ABC Areal is not in this checkout)']) assert.ok(text.includes(words), `fixture line shows ${words}:\n${text}`);
    } finally { await page.context().close(); }
  }
  {
    const { page } = await shell('s=capture:mini-pylon&view=capture');
    try {
      const text = await view(page, 'capture').locator('.fixture').innerText();
      for (const words of ['snapshot of mini-pylon', 'stubbed: none', 'not in the fixture: finals']) assert.ok(text.includes(words), `fixture line shows ${words}:\n${text}`);
      assert.ok(!text.includes('fonts'));
    } finally { await page.context().close(); }
  }
});
PLAN_EOF
```

```bash red
node --test --test-concurrency=1 --test-timeout=60000 tests/browser/source-shell.test.mjs
```

```expected
does not provide an export named 'snapshot'
```

**At this task** the file loads, and all six tests fail: the shell has no source side, so none reaches `data-source-ready` or the switch.

**Implementation.** In `playground/shell.js`:

1. Import `otherSideTab`, `openSourceTab`, `seedSource`, `SOURCES`, `sourceSeed` and `sourceUrl` from `./fixtures/source-side.js`, and `resolveScenario` from `./scenarios.js`.
2. For a `capture:<project>` scenario, `await resolveScenario(params)` before framing the stage (an error leaves it `null`; the stage reports it as now). `side` is `source` only when the query says `side=source` and the capture has `vendored`; otherwise `knobs`.
3. On the source side: write `sourceSeed(project, capture, capture.set, tab)` with `seedSource`, where `tab` is the query's (or the default), and set the frame's `src` to `sourceUrl(project)`. On the knobs side, frame `stage.html` exactly as now (`playground/shell.js:43-45` at `acb38aa`).
4. On the source side, the frame's `load` handler does not wait for `__stage` (`playground/shell.js:285-296` at `acb38aa`): it calls `openSourceTab({ tab }, frame.contentDocument)`, with `tab` the query's or the first visible group, and then sets `document.body.dataset.sourceReady` to the tab; a rejection goes to the error box. The schema editor is filled at once with the capture's groups (`rawGroups`), unless typed in.
5. `render()` on the source side: the capture pane is `renderCapture` of the resolved scenario, rendered once per view; every other pane shows one paragraph saying it describes the knobs side and how to switch.
6. `renderCapture`, on both sides, gains after the source lines:
   - a `side` heading and a `.side-switch` with two buttons, `source` and `knobs`, each with `data-side`, the current one with class `on`, `source` disabled when the capture has no `vendored`; a click calls `go({ side, tab: otherSideTab(project, capture, query tab, side) ?? '' })`, which keeps `set` and `view`;
   - without `vendored`, a line `no source snapshot: run npm run playground:capture -- <project>`;
   - with it, a `p.fixture` line: `fixture: snapshot of <the source line's text> · stubbed: <each stub's module, joined by ', ', or none> · not in the fixture: <SOURCES[project].refuses, joined>`, and for a project with `fonts`, a span that fetches `./captures/<project>/fonts` and reads ` · fonts: local` or ` · fonts: fallback (ABC Areal is not in this checkout)`.
7. Update the header comment: the `side` key, and the query keys that pick what is shown.

**Checks.** The red command passes as a check job (6 tests). `playground.test.mjs`'s shell and capture tests still pass (check job, `--test-name-pattern='shell|capture'`).

**Commit.** `feat(playground): show a capture's source side in the shell, beside its knobs side`, staging the two files.

### Task 11: the grid's capture rows

**Files:** edit `playground/grid.js`, `playground/grid.html`, `playground/scenarios.js` and `tests/browser/playground.test.mjs`.

**Interfaces.** `playground/scenarios.js` exports `captureOf(name)`: the capture's record as `capture:<name>` mounts it with its defaults, its shots with their URLs.

The captures grid test is rewritten for a row per tab (`tests/browser/playground.test.mjs:435-442` at `acb38aa`):

```bash apply
python3 - <<'PLAN_EOF'
# Edits tests/browser/playground.test.mjs: each old text must be there exactly once.
path = 'tests/browser/playground.test.mjs'
text = open(path, encoding='utf-8').read()
edits = [
    (r'''test('the grid shows the captures set', async () => {
  const { page, errors } = await grid('set=captures');
  try {
    assert.deepEqual((await captions(page)).map(c => c.split(/\s/)[0]), ['capture:mini-pylon', 'capture:wings-vdb']);
    assert.equal(await page.locator('.cell.failed').count(), 0);
    assert.deepEqual(errors, []);
  } finally { await page.context().close(); }
});

''',
     r'''test('the grid shows a row per tab of each capture: its shot, its source side and its knobs side', async () => {
  const page = await newPage(browser, { viewport: { width: 1600, height: 1000 } });
  const errors = collectPageErrors(page);
  await page.goto(`${site.url}grid.html?set=captures`);
  await page.locator('body[data-ready]').waitFor({ timeout: 30000 });
  try {
    const rows = await page.locator('.capture-row').evaluateAll(r => r.map(x => `${x.dataset.capture} ${x.dataset.tab}`));
    assert.deepEqual(rows, [
      ...['ground', 'clutter', 'light', 'camera', 'pylon', 'render'].map(t => `mini-pylon ${t}`),
      ...['dispersal', 'scroll', 'presence', 'sunlight', 'dive'].map(t => `wings-vdb ${t}`),
    ]);
    for (const row of await page.locator('.capture-row').all()) {
      assert.deepEqual(await row.locator('figure').evaluateAll(f => f.map(x => x.className)), ['cell shot', 'cell source', 'cell knobs']);
    }
    // wings-vdb's dispersal row has its shot; the others say they have none.
    const dispersal = page.locator('.capture-row[data-capture="wings-vdb"][data-tab="dispersal"]');
    assert.ok(await dispersal.locator('.shot img').evaluate(img => img.complete && img.naturalWidth === 1));
    assert.equal(await page.locator('.capture-row[data-tab="scroll"] .shot .why').innerText(), 'no shot of scroll');
    assert.equal(await page.locator('.cell.failed').count(), 0);
    // Each source cell ended open on its own tab, in its own page.
    for (const frame of page.frames().filter(f => f.url().includes('/source/'))) {
      const title = await frame.frameElement().then(e => e.getAttribute('title'));
      const tab = title.split(':')[2];
      assert.equal(await frame.locator('.term.open .term-tab.active').innerText(), tab, title);
    }
    // One at a time: each source cell started after the one before it was ready.
    const times = await page.locator('.cell.source').evaluateAll(f => f.map(x => [Number(x.dataset.started), Number(x.dataset.ready)]));
    assert.equal(times.length, 11);
    for (let i = 1; i < times.length; i++) assert.ok(times[i][0] >= times[i - 1][1], `source cell ${i} started before cell ${i - 1} was ready`);
    // The knobs cells are the knobs side, on the row's tab.
    assert.equal(await page.frameLocator('.capture-row[data-capture="wings-vdb"][data-tab="scroll"] .knobs iframe').locator('.term-tab.active').innerText(), 'scroll');
    assert.deepEqual(errors, []);
  } finally { await page.context().close(); }
});

'''),
]
for old, new in edits:
    assert text.count(old) == 1, f'{path}: expected once: {old[:70]!r}'
    text = text.replace(old, new)
open(path, 'w', encoding='utf-8').write(text)
PLAN_EOF
```

```bash red
node --test --test-concurrency=1 --test-timeout=60000 --test-name-pattern='row per tab' tests/browser/playground.test.mjs
```

```expected
does not provide an export named 'snapshot'
```

**At this task** the file loads, and its one test fails, `✖ the grid shows a row per tab of each capture: its shot, its source side and its knobs side`, on the missing source cells.

**Implementation.**

1. `captureOf(name)` in `scenarios.js` returns `capture(name, 'defaults').capture` (`playground/scenarios.js:38-47` at `acb38aa`).
2. In `grid.js`, `set=captures` with no `ids` builds rows instead of cells (`playground/grid.js:83-84` at `acb38aa`); `ids=` and every other set, `set=all` included, stay as now. For each capture name in order, and each visible group of that capture, a `section.capture-row` with `data-capture` and `data-tab`, a heading `capture:<name> · <tab>`, and three figures in this order:
   - `figure.cell.shot`: the shot whose `tab` is the row's, as an image, or `p.why` `no shot of <tab>`; caption `shot`.
   - `figure.cell.source`: an iframe titled `source:<name>:<tab>`, empty at first; caption `source` and a `.why` span.
   - `figure.cell.knobs`: the knobs stage of `capture:<name>` on the row's tab, made by the existing cell function, which takes the tab, the row to add to, the size and the extra class (its class is set once, `cell knobs`).
   Cells are `w`×`h` from the query, default 960×600 (decision 12).
3. The source cells load one at a time, in row order: set `data-started` (from `performance.now()`), write the seed of the capture's `defaults` set and the row's tab, set the iframe's `src` to `sourceUrl(name)`, wait for its `load`, `await openSourceTab({ tab }, frame.contentDocument)`, then set `data-ready`. A capture without `vendored` or a failure marks that figure `failed` with the message in `.why`, sets `data-ready`, and goes on to the next. The grid's `body[data-ready]` waits for every knobs cell and the whole source sequence.
4. `grid.html` styles `.capture-row` as a full-width wrapping row, its heading, and the shot image; update `grid.js`'s header comment for `set=captures`.

**Checks.** The red command passes as a check job. `playground.test.mjs`'s other grid tests still pass (`--test-name-pattern='grid'`).

**Commit.** `feat(playground): give the captures grid a row per tab, source beside knobs`, staging the four files.

### Task 12: the shots take the source side

**Files:** edit `playground/shots.mjs` and `tests/browser/playground.test.mjs`.

```bash apply
python3 - <<'PLAN_EOF'
# Edits tests/browser/playground.test.mjs: each old text must be there exactly once.
path = 'tests/browser/playground.test.mjs'
text = open(path, encoding='utf-8').read()
edits = [
    (r'''    assert.ok(files.some(f => f.startsWith('capture-mini-pylon-')) && files.some(f => f.startsWith('capture-wings-vdb-')), files.join(' '));
''',
     r'''    assert.ok(files.some(f => f.startsWith('capture-mini-pylon-')) && files.some(f => f.startsWith('capture-wings-vdb-')), files.join(' '));
    // The source side, one shot per tab of each capture.
    for (const tab of ['dispersal', 'scroll', 'presence', 'sunlight', 'dive']) assert.ok(files.includes(`capture-wings-vdb-source-${tab}.png`), `capture-wings-vdb-source-${tab}.png in ${files.join(' ')}`);
    for (const tab of ['ground', 'clutter', 'light', 'camera', 'pylon', 'render']) assert.ok(files.includes(`capture-mini-pylon-source-${tab}.png`), tab);
'''),
]
for old, new in edits:
    assert text.count(old) == 1, f'{path}: expected once: {old[:70]!r}'
    text = text.replace(old, new)
open(path, 'w', encoding='utf-8').write(text)
PLAN_EOF
```

```bash red
node --test --test-concurrency=1 --test-timeout=60000 --test-name-pattern='playground:shots takes' tests/browser/playground.test.mjs
```

```expected
does not provide an export named 'snapshot'
```

**At this task** the file loads, and its one test fails, `✖ playground:shots takes the captures set`, on the first `capture-wings-vdb-source-<tab>.png` it does not find.

**Implementation.** In `playground/shots.mjs`:

1. The ids read from a set's grid are the titles of `.cell:not(.source):not(.shot) iframe`, without repeats (`playground/shots.mjs:39` at `acb38aa`), so the captures set gives each capture once.
2. After the knobs stages, for each `capture:<project>` id: read `<site.captures>/<project>/capture.json`; without `vendored`, print `no source side for <id>: no snapshot` and go on. Launch a Chromium of its own, with the wings-vdb adapter's `dev.chromiumArgs` for wings-vdb and none for mini-pylon, at the run's viewport and scale. For each visible group: load `<site.url>captures/wings-vdb/fonts` (a page of the playground's origin), `page.evaluate(seedSource, sourceSeed(project, capture, 'defaults', tab))`, load the source page, `page.evaluate(openSourceTab, { tab })`, wait 800 ms, and save the screenshot as `capture-<project>-source-<tab>.png` (the tab with any character outside `[\w.-]` as `_`), printing its path. An uncaught exception on that page is a failure, as for the stages. Close that browser in a `finally`.
3. Update the header comment.

**Checks.** The red command passes as a check job.

**Commit.** `feat(playground): shoot each tab of a capture's source side`, staging the two files.

### Task 13: npm run playground:check-fixtures

**Files:** create `playground/check-fixtures.mjs` and `tests/browser/check-fixtures.test.mjs`; edit `package.json`.

```bash apply
mkdir -p tests/browser
cat > tests/browser/check-fixtures.test.mjs <<'PLAN_EOF'
// npm run playground:check-fixtures (playground/check-fixtures.mjs): it
// loads each captured project's source side headless and fails on what a
// broken snapshot does. Run here on captures built from the stand-in
// checkouts under tests/fixtures/captures, with the test's own empty fonts
// folder.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { closeAll, repo } from './lib/harness.mjs';
import { writeCaptures } from './lib/captures.mjs';

mkdirSync(join(repo, 'tests', '.tmp'), { recursive: true });
const captures = mkdtempSync(join(repo, 'tests', '.tmp', 'captures-'));
const fonts = mkdtempSync(join(repo, 'tests', '.tmp', 'fonts-'));
const drafts = mkdtempSync(join(repo, 'tests', '.tmp', 'drafts-'));

before(() => writeCaptures(captures));
after(() => closeAll(...[captures, fonts, drafts].map(dir => () => rmSync(dir, { recursive: true, force: true }))));

test('npm run playground:check-fixtures runs check-fixtures.mjs', () => {
  const { scripts } = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8'));
  assert.equal(scripts['playground:check-fixtures'], 'node playground/check-fixtures.mjs');
});

const node = (args, env = {}) => new Promise(resolve => execFile(process.execPath, args, { timeout: 120000, env: { ...process.env, ...env } },
  (error, stdout, stderr) => resolve({ code: error ? (error.code ?? 'killed') : 0, stdout, stderr })));

test('check-fixtures passes on the stand-in snapshots, and fails on a page that asks for a root path outside the table', async () => {
  const good = await node([join(repo, 'playground', 'check-fixtures.mjs'), '--captures', captures], { KNOBS_WINGS_FONTS: fonts, KNOBS_DRAFTS: drafts });
  assert.equal(good.code, 0, `${good.stdout}\n${good.stderr}`);
  assert.match(good.stdout, /mini-pylon: 8 tabs checked/);
  assert.match(good.stdout, /wings-vdb: 7 tabs checked/);
  assert.match(good.stdout, /^ok$/m);
  const broken = mkdtempSync(join(repo, 'tests', '.tmp', 'captures-'));
  try {
    cpSync(captures, broken, { recursive: true });
    appendFileSync(join(broken, 'wings-vdb', 'source', 'src', 'main.js'), "\nfetch('/elsewhere').catch(() => {});\n");
    const bad = await node([join(repo, 'playground', 'check-fixtures.mjs'), '--captures', broken], { KNOBS_WINGS_FONTS: fonts, KNOBS_DRAFTS: drafts });
    assert.notEqual(bad.code, 0);
    assert.match(bad.stderr, /wings-vdb: requested a root path outside the table: \/elsewhere/);
  } finally { rmSync(broken, { recursive: true, force: true }); }
});
PLAN_EOF
```

```bash red
node --test --test-concurrency=1 --test-timeout=60000 tests/browser/check-fixtures.test.mjs
```

```expected
does not provide an export named 'snapshot'
```

**At this task** the file loads, and both tests fail: `package.json` has no `playground:check-fixtures` and `playground/check-fixtures.mjs` does not exist.

**Implementation.**

1. `package.json` gains `"playground:check-fixtures": "node playground/check-fixtures.mjs"` after `playground:capture`.
2. `playground/check-fixtures.mjs [--captures dir]`: `servePlayground({ captures, logLevel: 'error' })` (so `KNOBS_CAPTURES` and `KNOBS_WINGS_FONTS` apply). For mini-pylon, then wings-vdb: read its `capture.json` from `site.captures`; without `vendored`, print `skip <project>: no snapshot`. Otherwise read the fonts state from `/captures/wings-vdb/fonts`, launch Chromium with `KNOBS_CHROMIUM` as its executable when set (as `capture.mjs` and the shots do) and the adapter's `dev.chromiumArgs`, open a 1440×900 page, and record failures as `<project>: <what>`:
   - a request to another origin (`requested another origin: <url>`), or a same-origin path that `allowedRequest` refuses and that is not `/favicon.ico` (`requested a root path outside the table: <path>`), counting only from the source page's load; `data:` and `blob:` URLs are ignored;
   - an uncaught exception (`uncaught: <message>`);
   - a console error (`console error: <text> (<path>)`), except one from a `/fonts/` path while the fonts state is `fallback`.
3. Load `/captures/wings-vdb/fonts`, write the seed of `defaults` and the default tab, load the source page, open that tab, then read every `.term-tabs .term-tab` label and open each in turn, waiting 600 ms. On wings-vdb, for each `.term-viz canvas` that has a box and is not hidden, read its pixels in the page through its 2D context (decision 13): one that is the same everywhere fails as `the picture on the <tab> tab is blank`, one without a 2D context as `… is unreadable`. On mini-pylon, `img.render` must be complete with a natural width within 15 s, else `the preview image never loaded`.
4. Print `<project>: <n> tabs checked (<the labels, joined>; fonts: <state>)` per project. Close the browser and, at the end, the server in `finally`. Print every failure under `failed:` on stderr and exit 1, or print `ok`.
5. A header comment says what it checks and when it runs (after each capture, as a check job; not part of `test:browser`).

**Checks.** The red command passes as a check job (2 tests).

**Commit.** `feat(playground): check each captured source page headless`, staging the three files.

### Task 14: the NOTICE and the README

**Files:** create `playground/captures/NOTICE.md` and `tests/unit/playground-notice.test.mjs`; edit `playground/README.md`.

```bash apply
mkdir -p tests/unit
cat > tests/unit/playground-notice.test.mjs <<'PLAN_EOF'
// The captures' licence notice and the playground README's account of the
// source side: the vendored source folders are not MIT, and the README says
// so, links the notice, and names what a reader needs to use the source side.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const read = path => readFileSync(join(repo, path), 'utf8');

test('the captures NOTICE says each source folder belongs to its project and is not under the MIT licence', () => {
  const notice = read('playground/captures/NOTICE.md');
  for (const words of ['wings-vdb/source/', 'mini-pylon/source/', 'All rights reserved', 'not covered', 'MIT', 'No font file']) assert.ok(notice.includes(words), `NOTICE says ${words}`);
});

test('the README\'s Captures section links the NOTICE and describes the source side', () => {
  const readme = read('playground/README.md');
  const captures = readme.slice(readme.indexOf('## Captures'));
  assert.ok(readme.includes('## Captures'));
  for (const words of ['](captures/NOTICE.md)', 'source/', 'side=source', 'sourceValues', 'vendored', 'KNOBS_WINGS_FONTS', 'npm run playground:check-fixtures', 'restart']) {
    assert.ok(captures.includes(words), `the Captures section names ${words}`);
  }
  // The knobs translation's drawer is named knobs-<project>.
  assert.match(readme, /knobs-<project>/);
  assert.doesNotMatch(readme, /titled with the exemplar's, draft's or capture's name/);
});
PLAN_EOF
```

```bash red
node --test tests/unit/playground-notice.test.mjs
```

```expected
/playground/captures/NOTICE.md'
```

**Implementation.**

1. `playground/captures/NOTICE.md`, one paragraph per line, says: each `<project>/source/` folder is a dated snapshot of another project's own front-end code, copied by `npm run playground:capture` so the playground can show that project's drawer, controls and pictures as it draws them; `wings-vdb/source/` is © wings-vdb and `mini-pylon/source/` © mini-pylon (its recorded renders included), all rights reserved; they are in knobs as reference fixtures for the playground only and are not covered by knobs' MIT licence (`LICENSE`), which covers the rest of the repository; a paragraph of its own starting `No font file is included` (wings-vdb's are read from a local checkout at run time, never committed); and each `capture.json` lists every vendored file with its source path and sha256, and the stubbed modules. Capture never writes this file.
2. `playground/README.md`: the shell's capture view gains the `source | knobs` switch and the fixture line, and `side=source` (`playground/README.md:32-33` at `acb38aa`); the stage's title sentence (`playground/README.md:37-39` at `acb38aa`) names `knobs-<project>` for a capture and why. In `## Captures`: `source/` beside `shots/`, linking [the notice](captures/NOTICE.md), and `vendored` in `capture.json`; the value set gains `sourceValues`; the grid's row per tab and the source shots' names. A new `### The source side` says: the URL keys; the stubs; the seed (the prefixes cleared, the set and tab written, edits lasting until the next load, one tab at a time); wings-vdb's Vite instance on the playground's port and its fonts from the checkout or `KNOBS_WINGS_FONTS`, falling back without them, and its refused `/defaults`; mini-pylon's plain files and stand-in, previews at once, finals refused; that the server mounts what is in the captures folder when it starts, so restart it after a capture (for the unit above, `systemctl --user restart knobs-playground`); and `npm run playground:check-fixtures` afterwards, with what it fails on.

**Checks.** The red command gives 2 pass. Milestone 3 ends: `npm run test:unit` gives 284 pass, and `npm run test:browser` (check job) 213 pass.

**Commit.** `docs(playground): add the captures notice and the source side to the README`, staging the three files.

### Task 15: the real snapshots

**Files:** replace `playground/captures/wings-vdb/` and `playground/captures/mini-pylon/` (each `capture.json`, `source/` and `shots/`).

The driver runs this task with Josh, once he has started wings-vdb's dev server (Milestone 4). It reads the real checkouts, read only, through `playground:capture` (the Global Constraints' live-environment rule). If reading `/home/jmo/linda/repos/wings-vdb` or `/home/jmo/linda/repos/mini-pylon` is denied, stop and report: the driver runs this task.

1. Record each checkout's state: `git --no-optional-locks -C /home/jmo/linda/repos/wings-vdb status --porcelain | sha256sum`, and the same for mini-pylon.
2. Is wings-vdb's dev server up? `curl -s -o /dev/null -w '%{http_code}\n' --max-time 2 http://127.0.0.1:5350/`. If it does not answer 200, stop and report: a capture now would drop the committed wings-vdb shots. Do not start it.
3. `npm run playground:capture -- wings-vdb`, then `npm run playground:capture -- mini-pylon` (its tweak server is not expected to be up; its capture keeps `shotsSkipped`, as it has now). mini-pylon's takes under a minute; wings-vdb's takes about 20 s per shot, seven shots, so two to three minutes. A shot that stalls fails with a Playwright timeout naming the page, and the last capture stays (decision 10): stop and report it, and do not retry (Review Focus 3).
4. Step 1's commands again: both hashes must be unchanged. If either changed, stop and report.
5. `npm run playground:check-fixtures` as a check job; it must exit 0. On a failure, stop and report its output; do not change the snapshot by hand.
6. Read each new shot as an image, and confirm `source/` holds what the spec's copy list names and nothing else (`git status --short playground/captures`): no `public/fonts/`, no `public/options/`, no `src/chat.js` or `src/dev-report.js`.

**Checks.** `npm run test:unit` gives 284 pass (the unit tests never read these folders); `npm run test:browser` is unchanged at 213.

**Commit.** `chore(captures): snapshot wings-vdb's and mini-pylon's own pages`, staging `playground/captures/wings-vdb/` and `playground/captures/mini-pylon/` by path.

