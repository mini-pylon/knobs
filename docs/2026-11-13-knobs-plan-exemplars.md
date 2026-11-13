---
title: knobs exemplars implementation plan
kind: plan
target: knobs
topic: exemplars
status: draft
written: 2026-11-13T05:11:14Z
by: claude
---

# knobs exemplars implementation plan

**Goal:** Ship the knobs skill's first eight exemplars (six pictures and two drawer extensions), each runnable and tested, with the skill's new Pictures and Share steps and an issue form for offering exemplars back, and no runtime change to knobs.
**Architecture:** Each exemplar is a folder of plain `// @ts-check` JavaScript under `skills/knobs/exemplars/`. One test fixture mounts any of them through a Vite alias. A browser test file checks them under a paused fake clock, a TypeScript compile test type-checks them, and the skill's unit tests check the skill text that indexes them and the two step files it points to.
**Spec:** `/home/jmo/linda/repos/knobs/docs/2026-11-13-knobs-spec-exemplars.md`
**Base commit:** `837f5fa`
**Executor:** `run-plan`, one headless run per milestone
**Mode:** tests-first

## Global Constraints

- Base commit `837f5fa` on `spec-knobs-exemplars`, the same code as `56f6edd` on `main`. At the base, `npm run test:unit` gives 198 pass, 0 fail, and `npm run test:browser` gives 89 pass, 0 fail, in about 35 s.
- Counts when each milestone ends: Milestone 1, 200 unit and 94 browser; Milestone 2, 200 and 119; Milestone 3, 200 and 130; Milestone 4, 207 and 130. A count that differs is recorded and explained in the closing report.
- Every test in this plan was run before the plan was written, in a throwaway copy of the base, against rough reference versions of `curve-trace`, `presets` and `renders-tab`, rough skill text and a reference form. All passed. They were then broken on purpose, and each break was caught: `Math.random` in a picture fails `deterministic`; a picture that reads its probe but ignores the value fails `reads the store`; a preset that also resets the `look` keys it does not name fails the preset test; a render that finishes synchronously fails the console test; a type error fails the compile test. The same shot written twice was byte-identical. With the harness alias added, the whole browser suite ran with 105 pass (89 old and 16 new). `import.meta.glob('@exemplars/*/*.js')` resolves through the string alias in Vite 8.3.8, so the spec's `/@fs/` fallback is not needed.
- Build each task to its description and no further. A later exemplar's tests fail until its own task, and that is expected. A test that seems impossible to pass means the implementation has drifted from the description: stop and report it. Never weaken, skip or delete a check or a test, and never edit a test to make it pass.
- Dependencies: a worktree starts with no `node_modules`. Run `npm ci --prefer-offline --ignore-scripts` first.
- Unit tests take a few seconds and run directly: `npm run test:unit`, or `node --test tests/unit/<file>`.
- Browser tests run as check jobs, never backgrounded by hand. One exemplar during a task: `~/linda/skills/handoff-launch/scripts/launch-headless job --repo <worktree> --topic exemplars-<name> --cost 1 -- paced node --test --test-concurrency=1 --test-timeout=60000 --test-name-pattern='^<name>: ' tests/browser/exemplars.test.mjs`. The whole suite at a milestone's end: `~/linda/skills/handoff-launch/scripts/launch-headless job --repo <worktree> --topic exemplars-browser --cost 1 -- paced npm run test:browser`. Each prints `job <run dir>`. Wait in the foreground with `until [ "$(jq -r .status <run dir>/meta.json)" != running ]; do sleep 10; done`, rerunning it if the shell call times out. `exit:0` passes; the output is `<run dir>/stdout.log`. Exit 8 means not admitted (the machine is busy): wait a minute and launch it again, at most ten launches for one check. After the tenth refusal, stop at that task: do not commit it (a check that could not run has not passed), and end with the closing report, naming the check and the refusal reason the last launch printed on stderr. Never run the browser suite outside a job.
- The shots script is not a test. `npm run exemplars:shots -- <name>` takes a few seconds and runs directly. Each task regenerates only its own exemplar's shot. Read the PNG as an image and check each **Look:** point against it before committing it with the exemplar. If regenerating changes another exemplar's `shot.png`, stop and report it.
- The live environment: tests ask the operating system for a free port and never use a fixed one. The fixture is copied into `tests/.tmp/`, which git ignores. Never read or write `/home/jmo/linda/repos/wings-vdb` or any mini-pylon repository other than this one. The exemplars are written fresh from the spec's table and this plan, not copied from anywhere. Two steps need the network: `npm ci --prefer-offline` fetches whatever the npm cache lacks, and Task 10's install check fetches the `skills` CLI.
- Commits go through git-commit, staged by path. The last line of every commit message is exactly `Generated with wings.computer`, and no harness or model is named. Never `git add -A` or `git add .`, and never push.
- Use simple shell commands. If the tree has drifted from a task's assumption (an apply block fails, or a red prints something other than its expected text), stop and report; do not adapt silently.

Where the spec was silent, this plan decided:

1. **A list of shipped exemplars.** `tests/browser/exemplars.json` maps each shipped exemplar to its kind. The browser test covers every name in it plus every folder on disk, so a missing folder fails instead of going untested, and a folder curated later is still tested. Each exemplar's task adds its entry.
2. **Test names start with the exemplar**, as `<name>: <check>`, so `--test-name-pattern '^<name>: '` runs one exemplar.
3. **The shape check is stricter than the spec's list.** The folder holds exactly the four files. `shot.png` starts with the PNG signature. The README's `## ` sections are exactly When, What makes it good, Adapting, in that order. A `# <name>` title line above them is allowed. When is one sentence: it ends with a period and has no other period, so no "e.g.". It is also at most 15 words, because Task 9 copies it word for word into SKILL.md's index, where the 1,000-word cap leaves room for about that much; no test counts this, so the builder does. What makes it good has three to five bullets, each line starting `- **Look:** ` or `- **Behaviour:** `. An extension's Adapting section links a `https://github.com/mini-pylon/knobs/issues/<n>` URL and names `` `status` ``. The code file's first line is `// @ts-check`. A picture's `probe` names a number control of its one group whose default is below its maximum, because a probe that starts at its maximum changes nothing when the test sets it there. A picture reads values only through literal `store.control('<group>.<key>')` calls naming its own group's controls, its probe among them, so the reads are easy to find when adapting.
4. **A picture's label** (the canvas `aria-label`) has at least three words.
5. **The recipe waits for the mount.** The fixture loads the exemplar with dynamic imports, which can finish after `load`. So between `goto` and the first `runFor(100)`, the shared helper waits for `[data-knobs]`, or for `body[data-error]` when the exemplar is missing. Fake time does not move during that wait, so frame times are unchanged.
6. **What an extension's tests and shot open:** its first page if it has pages, otherwise its first group. Before the shot, the shots script types console lines from a small map: `render` for `renders-tab`, so its history is not empty. `presets` shows its `look` group at the defaults.
7. **The `presets` data is a named export.** `extension.js` also exports `presets`, an object mapping each preset's name to `about` (a string) and `values`. `values` is keyed by full path (`'look.accent'`) and holds values in the store's normalized form (lowercase `#rrggbb`, numbers on their step), so a test can compare them. It has at least two presets, and at least one of them names only part of `look`. A preset sets exactly the paths it names.
8. **An error from a command is a line in the drawer's error style.** The drawer prints a command's return value plainly and prints a thrown error's message in the error style (`src/drawer.js` line 612). So `preset nope` throws an `Error` whose message names the unknown preset and lists the known ones.
9. **The `renders-tab` details.** The page is named `renders`. Each history entry is an element with class `render-entry`, holding a `canvas` or `img` thumbnail and the text of every value it rendered, newest first. `render` returns a short line at once and finishes after a stand-in delay of 800 ms on `setTimeout`. A `render` typed while one runs prints `already rendering` and starts nothing. The pending count is the number of controls whose current value differs from the values the last finished render used; the values at mount count as the first such render. The status reads `''` at zero, `1 change since last render`, and `N changes since last render` above one.
10. **The fixture's handle for tests** is `window.__exemplar`: `name`, `groups`, `probe`, `store`, the loaded `module`, and `target` (the tab to open).
11. **The TypeScript compile test lands in Milestone 1**, not Milestone 4 as first suggested, so each exemplar is type-checked as it is written. `tests/types/tsconfig.exemplars.json` extends the existing config with `files: []` and an `include` of the exemplars. tsc passes silently when that include matches nothing, so the test also requires the file list to contain an exemplar's code file.
12. **The README word cap and the widened portability scan also land in Milestone 1**, in a rewrite of `tests/unit/skill.test.mjs` that keeps its four tests. The new words (`wings-vdb`, `mini-pylon/tools`, `cloud`, `bird`) match in any case. The original list keeps its exact case.
13. **The skill text's shape.** A word is a whitespace-separated token of the whole file, frontmatter included; SKILL.md has 691 at the base. The steps are renumbered 8 Pictures, 9 Hand over, 10 Values, 11 Commit, 12 Decisions note, 13 Share, 14 Leave. The index is a `## Exemplars` section, last in the file, with one line per exemplar: `` - `<name>` (picture|extension): `` followed by its README's When sentence, word for word. `pictures.md` names `761` and `.agents/skills/knobs`; `share.md` holds the full new-issue URL and `6,000`.
14. **The issue form gets a unit test** that the spec does not list. It checks the field ids, types and order, the label, `render: js`, and the required license tick, and that `share.md` names the four prefilled ids. The form uses GitHub's usual layout: a `body:` list at two spaces, with keys at four.
15. **The shots script** is `tests/browser/exemplar-shots.mjs`, run by `npm run exemplars:shots`. It takes optional exemplar names and writes only those. It shares the clock recipe with the tests through `tests/browser/lib/exemplar.mjs`.
16. **Probes, one per picture:** `motion.duration`, `scroll.sections`, `hover.lift`, `light.azimuth`, `spawn.interval`, `edge.radius`.
17. **No random numbers.** A picture never calls `Math.random`, `Date` or `performance.now`. All motion comes from `now`, and any randomness from a seeded generator in the file. The deterministic test fails otherwise.

The plan's author found nothing in the spec wrong. Its recipe and its alias-and-glob fixture worked as written, apart from the mount wait in decision 5.

- Checked 2026-11-13 at 837f5fa: 10 apply blocks, 11 reds as quoted, 6 probes pass.

## Review Focus

1. **How good the pictures are.** The tests prove that a picture mounts clean, draws, repeats exactly and reads the store. They do not prove it is good. Read every `shot.png` against the spec's table and the README's Look points: units on the axes, labels on both sides, one shared scale.
2. **Behaviour points no test covers:** `curve-trace` looping at true speed; `timeline-zones` dropping its zones when snap is off; `schedule-countdown` keeping its draws stable (moving `interval` stretches the ticks instead of reshuffling them) and counting down live; `cross-section` staying cheap enough to draw every frame. Check each by doing what its README says, on the fixture served the way the tests serve it: `npm run exemplars:serve` prints the URL, then open it at `?name=<name>` and stop the server with Ctrl-C.
3. **The 761 px width.** Tests and shots run at 1280×800. The side-by-side pictures (`before-after`, `cross-section`) and the dial are designed for the strip, and only a look at 761 px wide shows clipping.
4. **Neutral subjects.** The scan rejects `cloud` and `bird`, but not every name from the sources. Confirm that no exemplar, README or skill text names a project, a person, or a subject from the source code the spec lists.
5. **The skill text.** It stays under 1,000 words and must still read as one procedure: Propose names a picture per group, step 8 sends the agent to `pictures.md`, the Share line follows the decisions note, and the two Never lines are there. `pictures.md` and `share.md` must match the spec's numbered lists.
6. **The TypeScript path.** In a TypeScript project, the agent turns an exemplar's JSDoc into annotations. Nothing tests that; check that each exemplar's JSDoc maps plainly onto annotations.

## Milestones

- **Milestone 1: the exemplar bench and `curve-trace`** (Task 1). Ends with the fixture, the shared clock recipe, the shots script, the compile test and the widened skill scan in place, and one picture exemplar passing end to end. Reviewer brief: run the fixture by hand on `curve-trace` (`npm run exemplars:serve`) and check Review Focus 1 to 3 for it; confirm the harness change is the one alias line, and that the shots script writes only the names it is given.
- **Milestone 2: the other five pictures** (Tasks 2 to 6). Ends with six picture exemplars passing. Reviewer brief: check Review Focus 1 to 4 for each picture, and that no picture calls `Math.random`, `Date` or `performance.now`.
- **Milestone 3: the two extensions** (Tasks 7 and 8). Ends with `presets` and `renders-tab` passing their behaviour tests. Reviewer brief: check that each README links its issue (#4, #10) and says how to merge `status`, that the stand-in render is plainly marked as the part to replace, and that the `renders` page styles itself and needs no drawer class.
- **Milestone 4: the skill text, the issue form and the install check** (Tasks 9 and 10). Ends with the skill indexing all eight exemplars, `pictures.md` and `share.md` written, and the form in place. Reviewer brief: check Review Focus 5 and 6, read `pictures.md` and `share.md` against the spec's lists, and read the closing report for the install check's result.

### Task 1: the exemplar bench and `curve-trace`

**Files:** edit `tests/browser/lib/harness.mjs`, `tests/unit/skill.test.mjs` and `package.json`. Create `tests/fixtures/exemplar/index.html`, `tests/fixtures/exemplar/main.js`, `tests/browser/lib/exemplar.mjs`, `tests/browser/exemplars.json`, `tests/browser/exemplars.test.mjs`, `tests/browser/exemplar-shots.mjs`, `tests/browser/exemplar-serve.mjs`, `tests/types/tsconfig.exemplars.json`, `tests/unit/types-exemplars.test.mjs`, and `skills/knobs/exemplars/curve-trace/` (`README.md`, `controls.js`, `visual.js`, `shot.png`).

These facts must hold for the plan to work. The first probe installs the dependencies every later block needs:

```bash probe
npm ci --prefer-offline --ignore-scripts >/dev/null 2>&1 && echo installed
```

```expected
installed
```

```bash probe
node --version
```

```expected
v24.
```

```bash probe
node -p "require('vite/package.json').version + ' ' + require('playwright/package.json').version"
```

```expected
8.3.8 1.64.1
```

```bash probe
npm run test:unit 2>&1 | grep -E '^ℹ (tests|pass|fail) '
```

```expected
ℹ tests 198
ℹ pass 198
ℹ fail 0
```

The drawer facts the recipe and the tests rely on: pictures show from 761 px, a picture frame is throttled to 66 ms, a command's thrown error prints in the error style, and the status line refreshes every 250 ms.

```bash probe
grep -n "matchMedia('(min-width: 761px)')\|if (now - last < 66) return;\|catch (error) { print(String(error.message || error), 'err'); }\|}, 250);" src/drawer.js
```

```expected
214:    const wide = matchMedia('(min-width: 761px)');
251:        if (now - last < 66) return;
612:      } catch (error) { print(String(error.message || error), 'err'); }
691:    }, 250);
```

The widened scan passes on the skill as it stands, and SKILL.md's word count before this work:

```bash probe
grep -rliE 'wings-vdb|mini-pylon/tools|cloud|bird' skills/ || echo clean; wc -w < skills/knobs/SKILL.md
```

```expected
clean
691
```

The tests:

```bash apply
git apply <<'PLAN_EOF'
--- a/tests/browser/lib/harness.mjs
+++ b/tests/browser/lib/harness.mjs
@@ -12,6 +12,7 @@
     { find: /^knobs\/react$/, replacement: join(repo, 'src/react.js') },
     { find: /^knobs\/vite$/, replacement: join(repo, 'src/vite.js') },
     { find: /^knobs$/, replacement: join(repo, 'src/index.js') },
+    { find: '@exemplars', replacement: join(repo, 'skills/knobs/exemplars') },
   ];
 }
 
PLAN_EOF
mkdir -p tests/fixtures/exemplar
cat > tests/fixtures/exemplar/index.html <<'PLAN_EOF'
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>knobs exemplar</title>
    <link rel="icon" href="data:,">
    <style>body { margin: 0; background: #20262c; }</style>
  </head>
  <body>
    <script type="module" src="/main.js"></script>
  </body>
</html>
PLAN_EOF
cat > tests/fixtures/exemplar/main.js <<'PLAN_EOF'
// Mounts one exemplar from skills/knobs/exemplars, named by ?name=, the way
// the skill tells an agent to: a picture keyed by its group's name, or an
// extension spread into the mount options.
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
PLAN_EOF
cat > tests/browser/lib/exemplar.mjs <<'PLAN_EOF'
// What the exemplar tests and the shots script share: where the exemplars
// are, the fixture page, and the fake clock recipe that makes a picture's
// frames the same on every run.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { collectErrors, newPage, openDrawer, repo, type } from './harness.mjs';

export const exemplarsDir = join(repo, 'skills', 'knobs', 'exemplars');

// One fixed epoch, so every trial sees the same fake times.
export const T0 = Date.UTC(2026, 0, 1);

export function folders() {
  if (!existsSync(exemplarsDir)) return [];
  return readdirSync(exemplarsDir, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
}

export function kindOf(name) {
  const dir = join(exemplarsDir, name);
  if (existsSync(join(dir, 'visual.js'))) return 'picture';
  if (existsSync(join(dir, 'extension.js'))) return 'extension';
  return null;
}

export const loadControls = name => import(pathToFileURL(join(exemplarsDir, name, 'controls.js')).href);

// Recipe steps 1 and 2: a 1280x800 page whose clock is paused before it
// loads, the fixture mounted on one exemplar, then the start-up timers.
// `values` is seeded as the drawer's saved values before the page loads.
export async function openExemplar(browser, url, name, { values } = {}) {
  const page = await newPage(browser);
  const errors = collectErrors(page);
  if (values) await page.addInitScript(saved => localStorage.setItem('exemplar:values', saved), JSON.stringify(values));
  await page.clock.install({ time: T0 });
  await page.clock.pauseAt(T0 + 1000);
  await page.goto(`${url}?name=${encodeURIComponent(name)}`);
  await page.locator('[data-knobs], body[data-error]').first().waitFor({ state: 'attached' });
  const failed = await page.evaluate(() => document.body.dataset.error ?? null);
  if (failed) {
    await page.context().close();
    throw new Error(failed);
  }
  await page.clock.runFor(100);
  return { page, errors };
}

// Recipe steps 3 and 4: open the drawer, type any console lines first,
// open the exemplar's group or page, let the drawer's timers and its CSS
// slide finish, then let several frames draw from the same start.
export async function settle(page, lines = []) {
  await openDrawer(page);
  for (const line of lines) {
    await type(page, line);
    await page.clock.runFor(2000);
  }
  const target = await page.evaluate(() => window.__exemplar.target);
  await page.locator('.term-tab', { hasText: new RegExp(`^${target}$`) }).click();
  await page.clock.runFor(100);
  await page.waitForTimeout(300);
  await page.clock.runFor(500);
}

// The picture's canvas, reduced to its size, how many pixels have any
// alpha, and a hash of every byte.
export function readCanvas(page) {
  return page.locator('canvas.viz-chart').evaluate(canvas => {
    const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    let hash = 0x811c9dc5, painted = 0;
    for (let i = 0; i < data.length; i++) {
      hash = Math.imul(hash ^ data[i], 0x01000193) >>> 0;
      if (i % 4 === 3 && data[i] > 0) painted++;
    }
    return { width: canvas.width, height: canvas.height, painted, hash };
  });
}

// One picture trial: a fresh page through the whole recipe, ending with
// the canvas read.
export async function pictureTrial(browser, url, name, values) {
  const { page } = await openExemplar(browser, url, name, { values });
  try {
    await settle(page);
    return await readCanvas(page);
  } finally {
    await page.context().close();
  }
}
PLAN_EOF
cat > tests/browser/exemplars.json <<'PLAN_EOF'
{
  "curve-trace": "picture"
}
PLAN_EOF
cat > tests/browser/exemplars.test.mjs <<'PLAN_EOF'
// Every exemplar the knobs skill ships: its files, and that it mounts clean,
// draws, and reads the store in the drawer. The shipped ones are listed in
// exemplars.json, so a missing folder fails here instead of going untested;
// a folder that is not listed is tested all the same.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { closeAll, copyFixture, launch, logText, openDrawer, serve, type } from './lib/harness.mjs';
import { exemplarsDir, folders, kindOf, loadControls, openExemplar, pictureTrial, settle } from './lib/exemplar.mjs';

const shipped = JSON.parse(readFileSync(new URL('./exemplars.json', import.meta.url), 'utf8'));
const names = [...new Set([...Object.keys(shipped), ...folders()])].sort();

let fixture, site, browser;

before(async () => {
  fixture = await copyFixture('exemplar');
  site = await serve(fixture.root);
  browser = await launch();
});
after(() => closeAll(
  () => browser?.close(),
  () => site?.close(),
  () => fixture?.remove(),
));

// A README's `## ` sections, in order, each with its lines.
function sections(text) {
  const out = new Map();
  let current = null;
  for (const line of text.split('\n')) {
    const heading = line.match(/^## (.+)$/);
    if (heading) out.set(current = heading[1].trim(), []);
    else if (current) out.get(current).push(line);
  }
  return out;
}

const probeControl = (groups, probe) => groups[0].controls.find(control => `${groups[0].name}.${control.key}` === probe);

// The default trial is shared by the checks that compare against it.
const defaults = new Map();
function defaultTrial(name) {
  if (!defaults.has(name)) defaults.set(name, pictureTrial(browser, site.url, name));
  return defaults.get(name);
}

for (const name of names) {
  const dir = join(exemplarsDir, name);
  const kind = shipped[name] ?? kindOf(name);

  test(`${name}: shape`, async () => {
    assert.ok(existsSync(dir), `missing exemplar folder: ${name}`);
    assert.equal(kindOf(name), kind, `${name} is a ${kind}`);
    const code = kind === 'picture' ? 'visual.js' : 'extension.js';
    assert.deepEqual(readdirSync(dir).sort(), ['README.md', 'controls.js', code, 'shot.png'].sort());
    assert.deepEqual([...readFileSync(join(dir, 'shot.png')).subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], 'shot.png is a PNG');

    const parts = sections(readFileSync(join(dir, 'README.md'), 'utf8'));
    assert.deepEqual([...parts.keys()], ['When', 'What makes it good', 'Adapting']);
    const when = parts.get('When').join(' ').trim();
    assert.match(when, /^[^.]+\.$/, 'When is one sentence');
    const points = parts.get('What makes it good').filter(line => line.startsWith('- '));
    assert.ok(points.length >= 3 && points.length <= 5, `three to five points, not ${points.length}`);
    for (const point of points) assert.match(point, /^- \*\*(Look|Behaviour):\*\* \S/);
    if (kind === 'extension') {
      const adapting = parts.get('Adapting').join('\n');
      assert.match(adapting, /https:\/\/github\.com\/mini-pylon\/knobs\/issues\/\d+/, 'Adapting links the knobs issue');
      assert.match(adapting, /`status`/, 'Adapting says how to merge status');
    }

    const source = readFileSync(join(dir, code), 'utf8');
    assert.match(source, /^\/\/ @ts-check\n/);
    const { groups, probe } = await loadControls(name);
    assert.ok(Array.isArray(groups) && groups.length > 0, 'controls.js exports groups');
    if (kind !== 'picture') return;
    assert.equal(groups.length, 1, 'a picture exemplar has one group');
    const control = probeControl(groups, probe);
    assert.ok(control, `probe ${probe} names a control of ${groups[0].name}`);
    assert.equal(control.type, 'number', 'the probe is a number control');
    assert.ok(control.value < control.max, 'the probe starts below its maximum');
    const reads = [...source.matchAll(/store\.control\('([^']+)'\)/g)].map(match => match[1]);
    assert.ok(reads.includes(probe), 'the picture reads its probe');
    for (const path of reads) assert.ok(groups[0].controls.some(item => `${groups[0].name}.${item.key}` === path), `${path} is a control of ${groups[0].name}`);
  });

  test(`${name}: mounts clean`, async () => {
    const { page, errors } = await openExemplar(browser, site.url, name);
    try {
      await settle(page);
      if (kind === 'picture') {
        const label = await page.locator('canvas.viz-chart').getAttribute('aria-label');
        assert.ok(label.trim().split(/\s+/).length >= 3, `the picture has a real label, not "${label}"`);
      }
      assert.deepEqual(errors, []);
    } finally {
      await page.context().close();
    }
  });

  if (kind !== 'picture') continue;

  test(`${name}: not blank`, async () => {
    const { painted } = await defaultTrial(name);
    assert.ok(painted > 0, 'some pixel has alpha above zero');
  });

  test(`${name}: deterministic`, async () => {
    const first = await defaultTrial(name);
    assert.deepEqual(await pictureTrial(browser, site.url, name), first);
  });

  test(`${name}: reads the store`, async () => {
    const { groups, probe } = await loadControls(name);
    const first = await defaultTrial(name);
    const seeded = await pictureTrial(browser, site.url, name, { [probe]: probeControl(groups, probe).max });
    assert.notDeepEqual(seeded, first, `setting ${probe} to its maximum changes the picture`);
  });
}
PLAN_EOF
cat > tests/browser/exemplar-shots.mjs <<'PLAN_EOF'
// Writes each exemplar's shot.png: the drawer open on its group, or its page,
// under the same fake clock as the tests. `npm run exemplars:shots` writes
// them all; names after it write only those.
import { join } from 'node:path';
import { closeAll, copyFixture, launch, serve } from './lib/harness.mjs';
import { exemplarsDir, folders, openExemplar, settle } from './lib/exemplar.mjs';

// Console lines typed before the shot, so it shows the exemplar in use.
const DEMO = { 'renders-tab': ['render'] };

const names = process.argv.slice(2).length ? process.argv.slice(2) : folders();
const fixture = await copyFixture('exemplar');
const site = await serve(fixture.root);
const browser = await launch();
try {
  for (const name of names) {
    const { page, errors } = await openExemplar(browser, site.url, name);
    try {
      await settle(page, DEMO[name]);
      if (errors.length) throw new Error(`${name}: ${errors.join('\n')}`);
      const path = join(exemplarsDir, name, 'shot.png');
      await page.locator('.term-drawer').screenshot({ path });
      console.log(`wrote ${path}`);
    } finally {
      await page.context().close();
    }
  }
} finally {
  await closeAll(() => browser.close(), () => site.close(), () => fixture.remove());
}
PLAN_EOF
cat > tests/browser/exemplar-serve.mjs <<'PLAN_EOF'
// Serves the exemplar fixture for a look by hand, the way the tests serve it,
// until Ctrl-C. `npm run exemplars:serve`, then open the printed URL.
import { rmSync } from 'node:fs';
import { copyFixture, serve } from './lib/harness.mjs';

const fixture = await copyFixture('exemplar');
// Vite handles SIGTERM itself, closing the server and calling process.exit(),
// so the copy is removed on exit, whatever ends the process.
process.on('exit', () => rmSync(fixture.root, { recursive: true, force: true }));
const site = await serve(fixture.root);
console.log(`${site.url}?name=<exemplar>  (Ctrl-C to stop)`);
process.once('SIGINT', async () => {
  try {
    await site.close();
  } finally {
    process.exit(0);
  }
});
PLAN_EOF
cat > tests/types/tsconfig.exemplars.json <<'PLAN_EOF'
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "allowJs": true, "checkJs": true },
  "files": [],
  "include": ["../../skills/knobs/exemplars/**/*.js"]
}
PLAN_EOF
cat > tests/unit/types-exemplars.test.mjs <<'PLAN_EOF'
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const path = name => fileURLToPath(new URL(`../../${name}`, import.meta.url));

test('the exemplars type-check against the public types', () => {
  const tsc = path('node_modules/typescript/bin/tsc');
  const result = spawnSync(process.execPath, [tsc, '-p', path('tests/types/tsconfig.exemplars.json'), '--listFiles'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /skills\/knobs\/exemplars\/[\w-]+\/(visual|extension)\.js/, 'the check covers the exemplars');
});
PLAN_EOF
cat > tests/unit/skill.test.mjs <<'PLAN_EOF'
// The agent skill shipped in skills/knobs: installable by `npx skills add`,
// and free of anything that only works on one machine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dir = join(root, 'skills', 'knobs');
const skillPath = join(dir, 'SKILL.md');
const exemplarsDir = join(dir, 'exemplars');

const words = text => text.split(/\s+/).filter(Boolean).length;

function exemplarFolders() {
  if (!existsSync(exemplarsDir)) return [];
  return readdirSync(exemplarsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

// Every text file the skill ships: SKILL.md, the templates, the step files
// and the exemplars. Screenshots are left out.
function skillFiles() {
  return readdirSync(dir, { recursive: true })
    .map((f) => join(dir, f))
    .filter((f) => statSync(f).isFile() && !f.endsWith('.png'));
}

function frontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(m, 'SKILL.md starts with a --- frontmatter block');
  return Object.fromEntries(
    m[1].split('\n').map((line) => {
      const i = line.indexOf(':');
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
    }),
  );
}

test('the skill has a name matching its folder and a trigger description', () => {
  const fm = frontmatter(readFileSync(skillPath, 'utf8'));
  assert.equal(fm.name, 'knobs');
  assert.match(fm.description, /^Use when /);
  assert.ok(fm.description.length <= 1024, 'description fits the spec limit');
});

test('every template the skill names exists, and every template is named', () => {
  const text = readFileSync(skillPath, 'utf8');
  const named = [...text.matchAll(/templates\/([\w.-]+)/g)].map((m) => m[1]);
  assert.ok(named.length > 0, 'the skill names its templates');
  for (const f of named) assert.ok(existsSync(join(dir, 'templates', f)), `templates/${f} exists`);
  for (const f of readdirSync(join(dir, 'templates'))) assert.ok(named.includes(f), `templates/${f} is named in SKILL.md`);
});

test('nothing in the skill depends on one machine or one person', () => {
  const files = skillFiles();
  assert.ok(files.includes(skillPath), 'the scan reads SKILL.md');
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    assert.doesNotMatch(text, /\/home\/|~\/linda|\bJosh\b|wings-home|git-branch|git-commit|file-issue|sharing-dev-servers/, f);
    assert.doesNotMatch(text, /wings-vdb|mini-pylon\/tools|cloud|bird/i, f);
  }
});

test('the skill installs the package from $KNOBS_DIR or a tagged GitHub release', () => {
  const text = readFileSync(skillPath, 'utf8');
  assert.match(text, /file:\$KNOBS_DIR/);
  assert.match(text, /github:mini-pylon\/knobs#semver:\^0\.1\.0/);
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.version, '0.1.0', 'the semver range in the skill matches the package version');
});

test('each exemplar README is at most 250 words', () => {
  for (const name of exemplarFolders()) {
    const text = readFileSync(join(exemplarsDir, name, 'README.md'), 'utf8');
    assert.ok(words(text) <= 250, `${name}/README.md has ${words(text)} words`);
  }
});
PLAN_EOF
```

```bash red
node --test --test-concurrency=1 --test-timeout=60000 --test-name-pattern='^curve-trace: ' tests/browser/exemplars.test.mjs
```

```expected
missing exemplar folder: curve-trace
```

```bash red
node --test tests/unit/types-exemplars.test.mjs
```

```expected
the check covers the exemplars
```

The rewritten `skill.test.mjs` keeps its four tests (the scan now reads every file under `skills/knobs/` but PNGs, and rejects four more words) and adds the README word cap. Both pass before any exemplar exists, and guard every exemplar from here on.

**Implementation.**

- `package.json`: add the scripts `"exemplars:shots": "node tests/browser/exemplar-shots.mjs"` and `"exemplars:serve": "node tests/browser/exemplar-serve.mjs"` beside `test:browser`. Nothing else in the file changes, and `files` stays `["src", "types"]`.
- `skills/knobs/exemplars/curve-trace/controls.js`: starts with `// @ts-check`, then `/** @type {import('knobs').Group[]} */ export const groups`, holding one group, `motion`, whose `about` names what it shapes (for example how a panel eases in). Its controls: `duration` (number, ms, a range a UI animation uses, such as 100 to 2000, step 10), `ease` (select: `linear`, `ease-out`, `spring`), `overshoot` (number, 0 to about 0.5), `delay` (number, ms, starting at 0). Each `about` gives the unit. Export `probe = 'motion.duration'`.
- `visual.js`: starts with `// @ts-check`. Its default export takes `store` (JSDoc `import('knobs').Store`) and returns `canvasVisual(label, make)`, with a label describing the picture, such as "Progress over time, with a dot running along the curve". The drawing:
  - Progress over time as a curve across the strip, from 0 to the duration, with a dashed line at progress 1.0 so overshoot shows above it.
  - The ends of the time axis labelled `0 ms` and the duration in ms (`pen.ends`).
  - A dot on the curve at the current point, running at real speed. One loop is the delay, during which the dot holds at 0, then the duration, then a short rest. The time comes from `now` (seconds) only.
  - A fading trail of the dot's last few positions, kept in the closure that `make` returns. Each point is drawn dimmer the older it is.
  - The easing maths is a small stand-in function in the file (`linear`, a cubic ease-out, and a spring that overshoots by `overshoot` and settles), marked in a comment as the part to replace with the project's own easing.
  - Every read is a literal `store.control('motion.<key>')`, turned into a number with `Number(...)` where it is one, so the file type-checks under `strict`.
  - Type each point array with JSDoc, `/** @type {[number, number][]} */ const points = [];`. `Pen.plot` takes `ReadonlyArray<readonly [number, number]>`, and an untyped `[]` that is pushed to infers `number[][]`, which fails the compile test with an error that reads like a library bug. Every later picture does the same.
- `README.md`, at most 250 words, with a `# curve-trace` title, then:
  - `## When`: one sentence, such as "A group that shapes an animation over time: a duration, an easing and a delay."
  - `## What makes it good`, four points:
    - **Look:** the current point is marked with a dot on the curve.
    - **Look:** the time axis ends read `0 ms` and the duration in ms.
    - **Look:** with `spring` and some overshoot, the curve rises above the dashed 1.0 line.
    - **Behaviour:** it loops at true speed. Set `duration 2000` and `delay 0`: the dot takes about two seconds to cross.
  - `## Adapting`: rename the group and keys to the project's own, replace the stand-in easing with an import of the function the page animates with, and keep the dot, the trail, the 1.0 line and the units.
- Run `npm run exemplars:shots -- curve-trace`. Read `skills/knobs/exemplars/curve-trace/shot.png` and check the Look points against it.

**Checks:** `node --test tests/unit/types-exemplars.test.mjs tests/unit/skill.test.mjs`, then the serve script's cleanup: `timeout --signal=TERM 5s node tests/browser/exemplar-serve.mjs < <(sleep 10)` prints the URL and exits 124, and `ls tests/.tmp` afterwards lists no `exemplar-*` directory (Vite also stops when its stdin closes, so the check holds stdin open), then the `curve-trace` browser job as in Global Constraints (5 pass), then `npm run test:unit` (200 pass, 0 fail), then the whole browser suite as a job (94 pass, 0 fail).

**Commit:** `test(exemplars): add the exemplar bench and the curve-trace picture`

### Task 2: `timeline-zones`

**Files:** edit `tests/browser/exemplars.json`. Create `skills/knobs/exemplars/timeline-zones/` (`README.md`, `controls.js`, `visual.js`, `shot.png`).

```bash apply
cat > tests/browser/exemplars.json <<'PLAN_EOF'
{
  "curve-trace": "picture",
  "timeline-zones": "picture"
}
PLAN_EOF
```

```bash red
node --test --test-concurrency=1 --test-timeout=60000 --test-name-pattern='^timeline-zones: ' tests/browser/exemplars.test.mjs
```

```expected
missing exemplar folder: timeline-zones
```

**Implementation.** Same format as `curve-trace`.

- Group `scroll`: `sections` (number, a count, step 1, for example 2 to 12), `snap` (toggle, on), `snapWidth` (number, a fraction of a section, 0 to 1), `glide` (number, ms). `probe = 'scroll.sections'`.
- The picture is a horizontal track drawn to scale across the strip: one block per section, all the same width; a snap zone as a bar around each section's centre, `snapWidth` of a section wide, drawn only while `snap` is on; a tick at each centre; and a marker at the current position. The stand-in position moves on its own from `now`: it glides to each section's centre over `glide` ms, then rests. A comment marks it as the part to replace with the page's own scroll progress. The track is labelled at its ends (`0` and the number of sections).
- README:
  - When: a group that shapes scrolling or paging through sections.
  - Points:
    - **Look:** drawn to scale, with blocks of equal width and zones exactly `snapWidth` of a block.
    - **Look:** a tick marks each centre.
    - **Behaviour:** the marker moves with the position. Two screenshots a second apart differ only in the marker's place.
    - **Behaviour:** turn `snap` off and the zones disappear while the ticks stay.
  - Adapting: read the real scroll position in place of the stand-in.
- Shot: `npm run exemplars:shots -- timeline-zones`.

**Checks:** the `timeline-zones` browser job (5 pass), `npm run test:unit` (200 pass).

**Commit:** `test(exemplars): add the timeline-zones picture`

### Task 3: `before-after`

**Files:** edit `tests/browser/exemplars.json`. Create `skills/knobs/exemplars/before-after/` (`README.md`, `controls.js`, `visual.js`, `shot.png`).

```bash apply
cat > tests/browser/exemplars.json <<'PLAN_EOF'
{
  "curve-trace": "picture",
  "timeline-zones": "picture",
  "before-after": "picture"
}
PLAN_EOF
```

```bash red
node --test --test-concurrency=1 --test-timeout=60000 --test-name-pattern='^before-after: ' tests/browser/exemplars.test.mjs
```

```expected
missing exemplar folder: before-after
```

**Implementation.**

- Group `hover`: `lift` (number, px, 0 up to about 16), `scale` (number, about 1 to 1.2, step 0.01), `shadow` (number, blur px), `tint` (color). `probe = 'hover.lift'`.
- The picture shows the same card twice, side by side, in two panels (`pen.panels`): the card at rest on the left, and fully hovered on the right, with lift, scale, shadow (`ctx.shadowBlur` in the tint's direction or a neutral shade) and tint applied. Both panels use one scale (pixels per CSS px) and the same view, and each is labelled (`rest`, `hover`). A shared baseline under both cards makes the lift read at a glance. The card is a plain rounded box with two text bars, a stand-in for the project's component. Fit it to the roughly 155 px tall strip, and keep it legible at 761 px wide.
- README:
  - When: a group that tunes how an element responds to hover or focus.
  - Points:
    - **Look:** both sides are labelled.
    - **Look:** both are drawn at one scale over one baseline.
    - **Look:** the difference reads at a glance.
    - **Behaviour:** change `scale` and only the hover side changes.
  - Adapting: draw the project's card shape, and keep the shared scale and the labels.
- Shot: `npm run exemplars:shots -- before-after`.

**Checks:** the `before-after` browser job (5 pass), `npm run test:unit` (200 pass).

**Commit:** `test(exemplars): add the before-after picture`

### Task 4: `angle-dial`

**Files:** edit `tests/browser/exemplars.json`. Create `skills/knobs/exemplars/angle-dial/` (`README.md`, `controls.js`, `visual.js`, `shot.png`).

```bash apply
cat > tests/browser/exemplars.json <<'PLAN_EOF'
{
  "curve-trace": "picture",
  "timeline-zones": "picture",
  "before-after": "picture",
  "angle-dial": "picture"
}
PLAN_EOF
```

```bash red
node --test --test-concurrency=1 --test-timeout=60000 --test-name-pattern='^angle-dial: ' tests/browser/exemplars.test.mjs
```

```expected
missing exemplar folder: angle-dial
```

**Implementation.**

- Group `light`: `azimuth` (number, degrees, 0 to 360), `elevation` (number, degrees, 0 to 90), `intensity` (number), `color` (color). `probe = 'light.azimuth'`.
- Left panel: a top-down dial. A circle with 0° and the four axes labelled; the light as a dot at its azimuth, nearer the centre the higher its elevation; and the angles as numbers (`az 135°  el 40°`). Right panel: a ball lit from that direction, with its highlight offset toward the light (a radial gradient), tinted by `color`, and brighter with `intensity`. Both use the light's color.
- README:
  - When: a group that places a light, sun or any direction around a point.
  - Points:
    - **Look:** 0° and the axes are labelled.
    - **Look:** the angle is shown as a number.
    - **Look:** the light's color is used.
    - **Behaviour:** move `azimuth` and the dot circles the dial while the ball's highlight follows on the same side.
  - Adapting: keep the dial's 0° where the project's own 0° is, and say which way angles run.
- Shot: `npm run exemplars:shots -- angle-dial`.

**Checks:** the `angle-dial` browser job (5 pass), `npm run test:unit` (200 pass).

**Commit:** `test(exemplars): add the angle-dial picture`

### Task 5: `schedule-countdown`

**Files:** edit `tests/browser/exemplars.json`. Create `skills/knobs/exemplars/schedule-countdown/` (`README.md`, `controls.js`, `visual.js`, `shot.png`).

```bash apply
cat > tests/browser/exemplars.json <<'PLAN_EOF'
{
  "curve-trace": "picture",
  "timeline-zones": "picture",
  "before-after": "picture",
  "angle-dial": "picture",
  "schedule-countdown": "picture"
}
PLAN_EOF
```

```bash red
node --test --test-concurrency=1 --test-timeout=60000 --test-name-pattern='^schedule-countdown: ' tests/browser/exemplars.test.mjs
```

```expected
missing exemplar folder: schedule-countdown
```

**Implementation.**

- Group `spawn`: `interval` (number, s), `jitter` (number, s), `burst` (number, a count, step 1). `probe = 'spawn.interval'`.
- The picture is a fixed window of the next few minutes, labelled (for example `next 5 min`), drawn as a strip of ticks. Event `i` happens at `i * interval + jitter * r(i)`, where `r(i)` comes from a small seeded generator in the file, indexed by `i`. That way moving `interval` stretches the pattern and moving `jitter` shifts the ticks without reshuffling them. A burst draws stacked ticks. The text `next in N s` counts down live from `now`. The schedule repeats from time 0, so `now` alone places the window. No `Math.random`.
- README:
  - When: a group that sets how often something happens, with some randomness.
  - Points:
    - **Look:** the time window is labelled.
    - **Behaviour:** the countdown is live. Two screenshots a second apart show N one lower.
    - **Behaviour:** random draws come from a fixed seed. Move `jitter` and the ticks shift but keep their order; move `interval` and the pattern stretches.
  - Adapting: use the project's own seed and spawn rule, and keep the window's label.
- Shot: `npm run exemplars:shots -- schedule-countdown`.

**Checks:** the `schedule-countdown` browser job (5 pass), `npm run test:unit` (200 pass).

**Commit:** `test(exemplars): add the schedule-countdown picture`

### Task 6: `cross-section`

**Files:** edit `tests/browser/exemplars.json`. Create `skills/knobs/exemplars/cross-section/` (`README.md`, `controls.js`, `visual.js`, `shot.png`).

```bash apply
cat > tests/browser/exemplars.json <<'PLAN_EOF'
{
  "curve-trace": "picture",
  "timeline-zones": "picture",
  "before-after": "picture",
  "angle-dial": "picture",
  "schedule-countdown": "picture",
  "cross-section": "picture"
}
PLAN_EOF
```

```bash red
node --test --test-concurrency=1 --test-timeout=60000 --test-name-pattern='^cross-section: ' tests/browser/exemplars.test.mjs
```

```expected
missing exemplar folder: cross-section
```

**Implementation.**

- Group `edge`: `radius` (number, px, 8 to 56, default 32, step 1), `softness` (number, px, 1 to 24, default 8, step 1), `noise` (number, a density amplitude, 0 to 0.5, default 0.1, step 0.01). Each `about` gives the unit. `probe = 'edge.radius'`.
- Left: a small per-pixel slice (64 by 32 pixels, made once with `pixels()` and refilled each frame) across the edge of a soft round shape. The slice's x axis is distance from the shape's centre, 0 to 64 px, one slice pixel per px, so every `radius` in range, its maximum included, puts the edge inside the slice and moving the probe moves the edge. Density is a smooth step over the distance from the shape's centre minus `radius`, `softness` wide, plus noise from a fixed hash of the pixel's coordinates (not `Math.random`). The slice is drawn scaled up with `imageSmoothingEnabled = false`. Right: the density profile along the slice's middle row, as a line, with a dashed threshold at 0.5 marked and labelled. The slice and the profile cover the same distance range on one x scale, so the edge in the slice lines up with the profile's crossing. The density maths is the marked stand-in.
- README:
  - When: a group that shapes a soft edge, falloff or density.
  - Points:
    - **Look:** the slice and the profile share one x scale.
    - **Look:** the threshold is marked.
    - **Behaviour:** move `softness` and the edge blurs while the profile's slope flattens with it.
    - **Behaviour:** it stays cheap. With the group open, the performance tab's frame rate does not drop.
  - Adapting: import the project's density function, and keep the slice small.
- Shot: `npm run exemplars:shots -- cross-section`.

**Checks:** the `cross-section` browser job (5 pass), `npm run test:unit` (200 pass), then the whole browser suite as a job (119 pass, 0 fail).

**Commit:** `test(exemplars): add the cross-section picture`

### Task 7: `presets`

**Files:** edit `tests/browser/exemplars.json` and `tests/browser/exemplars.test.mjs`. Create `skills/knobs/exemplars/presets/` (`README.md`, `controls.js`, `extension.js`, `shot.png`).

```bash apply
cat > tests/browser/exemplars.json <<'PLAN_EOF'
{
  "curve-trace": "picture",
  "timeline-zones": "picture",
  "before-after": "picture",
  "angle-dial": "picture",
  "schedule-countdown": "picture",
  "cross-section": "picture",
  "presets": "extension"
}
PLAN_EOF
cat >> tests/browser/exemplars.test.mjs <<'PLAN_EOF'

// presets: `preset` applies part of the look group and keeps the quality group.
async function presetsDrawer() {
  const { page, errors } = await openExemplar(browser, site.url, 'presets');
  await openDrawer(page);
  const presets = await page.evaluate(() => window.__exemplar.module.presets);
  return { page, errors, presets };
}

// Sets each path to a valid value other than its current one, in the page,
// and returns the values the store now holds.
const nudge = (page, paths) => page.evaluate(list => {
  const store = window.__exemplar.store;
  for (const path of list) {
    const control = store.byPath.get(path);
    const value = store.control(path);
    let next = `${value}!`;
    if (control.type === 'number') next = value === control.max ? control.min : control.max;
    if (control.type === 'color') next = value === '#123456' ? '#654321' : '#123456';
    if (control.type === 'toggle') next = value ? 0 : 1;
    if (control.type === 'select') next = control.options.find(option => option !== value) ?? value;
    store.set(path, next);
  }
  return Object.fromEntries(list.map(path => [path, store.control(path)]));
}, paths);

const values = (page, paths) => page.evaluate(list => Object.fromEntries(list.map(path => [path, window.__exemplar.store.control(path)])), paths);

test('presets: preset lists every preset with its about', async () => {
  const { page, errors, presets } = await presetsDrawer();
  try {
    assert.ok(Object.keys(presets).length >= 2, 'at least two presets');
    await type(page, 'preset');
    const log = await logText(page);
    for (const [name, preset] of Object.entries(presets)) {
      assert.ok(log.includes(name), `lists ${name}`);
      assert.ok(log.includes(preset.about), `lists the about of ${name}`);
    }
    assert.deepEqual(errors, []);
  } finally {
    await page.context().close();
  }
});

test('presets: preset <name> sets the look values it names and nothing else', async () => {
  const { page, errors, presets } = await presetsDrawer();
  try {
    const { paths, defaults } = await page.evaluate(() => {
      const controls = [...window.__exemplar.store.byPath.values()];
      return { paths: controls.map(control => control.path), defaults: Object.fromEntries(controls.map(control => [control.path, control.default])) };
    });
    const look = paths.filter(path => path.startsWith('look.'));
    const quality = paths.filter(path => path.startsWith('quality.'));
    assert.ok(quality.length > 0, 'there is a quality group to keep');
    for (const [name, preset] of Object.entries(presets)) {
      for (const path of Object.keys(preset.values)) assert.ok(look.includes(path), `${name} names only look controls, not ${path}`);
    }
    const [name, preset] = Object.entries(presets).find(([, item]) => Object.keys(item.values).length < look.length) ?? [];
    assert.ok(name, 'some preset sets only part of look');
    assert.ok(Object.entries(preset.values).some(([path, value]) => !Object.is(value, defaults[path])), `${name} changes something`);

    const kept = [...look.filter(path => !(path in preset.values)), ...quality];
    const before = await nudge(page, kept);
    await type(page, `preset ${name}`);
    assert.deepEqual(await values(page, Object.keys(preset.values)), preset.values);
    assert.deepEqual(await values(page, kept), before);
    assert.deepEqual(errors, []);
  } finally {
    await page.context().close();
  }
});

test('presets: an unknown preset prints an error', async () => {
  const { page } = await presetsDrawer();
  try {
    await type(page, 'preset nope');
    assert.match(await page.locator('.term-line.err').last().textContent(), /nope/);
  } finally {
    await page.context().close();
  }
});

test('presets: reset still returns every default', async () => {
  const { page, presets } = await presetsDrawer();
  try {
    await type(page, `preset ${Object.keys(presets)[0]}`);
    assert.notDeepEqual(await page.evaluate(() => window.__exemplar.store.changed()), {});
    await type(page, 'reset');
    assert.deepEqual(await page.evaluate(() => window.__exemplar.store.changed()), {});
  } finally {
    await page.context().close();
  }
});
PLAN_EOF
```

```bash red
node --test --test-concurrency=1 --test-timeout=60000 --test-name-pattern='^presets: ' tests/browser/exemplars.test.mjs
```

```expected
missing exemplar folder: presets
```

**Implementation.**

- `controls.js`: two groups. `look`: `background` (color), `accent` (color), `radius` (number, px), `spacing` (number, px). `quality`: `resolution` (number), `samples` (number, step 1). No `probe`.
- `extension.js`: starts with `// @ts-check`. It has a named export `presets`, as in Global Constraints decision 7: at least two presets with plain names (for example `dusk` and `airy`), each with an `about` and a partial set of `look` values. Every preset changes at least one `look` value from its default, because the `reset` test applies the first one and expects something to have changed. Its default export takes `store` and returns `{ commands: { preset } }`:
  - `preset` with no argument returns one line per preset, with its name and `about`.
  - `preset <name>` calls `store.set` for exactly the paths the preset names and returns a line saying what it applied. It never touches `quality` or any `look` path the preset does not name.
  - An unknown name throws an `Error` naming it and listing the known names.
  - The command's `usage` is `[name]`, and its `about` says it lists or applies presets.
  - A comment marks `quality` as the kept group and says how to keep another.
- README:
  - When: a project whose user wants a few named looks to flip between.
  - Points:
    - **Behaviour:** `preset` lists each preset with its `about`.
    - **Behaviour:** `preset <name>` sets only the keys the preset names. Check with `ls look` before and after.
    - **Behaviour:** it never touches the kept group (`ls quality` is unchanged).
    - **Behaviour:** `reset` still returns every default.
    - **Behaviour:** an unknown name prints an error.
  - Adapting:
    - Name the presets after the project's looks, and keep one group out of them.
    - "If knobs grows this, prefer it", linking `https://github.com/mini-pylon/knobs/issues/4`.
    - `status` is a single mount option, so a project with its own status line merges the two into one function.
- Shot: `npm run exemplars:shots -- presets`.

**Checks:** the `presets` browser job (6 pass), `npm run test:unit` (200 pass).

**Commit:** `test(exemplars): add the presets extension`

### Task 8: `renders-tab`

**Files:** edit `tests/browser/exemplars.json` and `tests/browser/exemplars.test.mjs`. Create `skills/knobs/exemplars/renders-tab/` (`README.md`, `controls.js`, `extension.js`, `shot.png`).

```bash apply
cat > tests/browser/exemplars.json <<'PLAN_EOF'
{
  "curve-trace": "picture",
  "timeline-zones": "picture",
  "before-after": "picture",
  "angle-dial": "picture",
  "schedule-countdown": "picture",
  "cross-section": "picture",
  "presets": "extension",
  "renders-tab": "extension"
}
PLAN_EOF
cat >> tests/browser/exemplars.test.mjs <<'PLAN_EOF'

// renders-tab: a render command, a history page and a pending count. The
// clock stays paused, so a render finishes only when a test runs it on.
async function rendersDrawer() {
  const { page, errors } = await openExemplar(browser, site.url, 'renders-tab');
  await openDrawer(page);
  return { page, errors };
}

// The status line once the drawer's 250 ms status timer has run.
async function statusText(page) {
  await page.clock.runFor(300);
  return page.locator('.term-status').textContent();
}

const entries = page => page.locator('.term-page-renders .render-entry');

// Sets the scene group's first control of a type to a new valid value, in
// the page, and returns that value.
const change = (page, kind) => page.evaluate(kind => {
  const store = window.__exemplar.store;
  const control = store.groups.find(group => group.name === 'scene').controls.find(item => item.type === kind);
  const value = store.control(control.path);
  const next = kind === 'color' ? (value === '#123456' ? '#654321' : '#123456') : (value === control.max ? control.min : control.max);
  store.set(control.path, next);
  return store.control(control.path);
}, kind);

test('renders-tab: the status counts changes since the last render', async () => {
  const { page, errors } = await rendersDrawer();
  try {
    assert.equal(await statusText(page), '');
    await change(page, 'number');
    assert.equal(await statusText(page), '1 change since last render');
    await change(page, 'color');
    assert.equal(await statusText(page), '2 changes since last render');
    assert.deepEqual(errors, []);
  } finally {
    await page.context().close();
  }
});

test('renders-tab: render adds one history entry, newest first, and clears the status', async () => {
  const { page, errors } = await rendersDrawer();
  try {
    await change(page, 'color');
    await type(page, 'render');
    await page.clock.runFor(2000);
    assert.equal(await entries(page).count(), 1);
    assert.equal(await statusText(page), '');
    assert.ok(await entries(page).first().locator('canvas, img').count() > 0, 'the entry has a thumbnail');
    const newest = await change(page, 'color');
    await type(page, 'render');
    await page.clock.runFor(2000);
    assert.equal(await entries(page).count(), 2);
    assert.ok((await entries(page).first().textContent()).includes(newest), `the newest entry shows ${newest}`);
    assert.deepEqual(errors, []);
  } finally {
    await page.context().close();
  }
});

test('renders-tab: the console takes input while a render runs', async () => {
  const { page } = await rendersDrawer();
  try {
    await type(page, 'render');
    await type(page, 'ls scene');
    assert.match(await logText(page), /# scene/);
    assert.equal(await entries(page).count(), 0, 'the render is still running');
    await page.clock.runFor(2000);
    assert.equal(await entries(page).count(), 1);
  } finally {
    await page.context().close();
  }
});
PLAN_EOF
```

```bash red
node --test --test-concurrency=1 --test-timeout=60000 --test-name-pattern='^renders-tab: ' tests/browser/exemplars.test.mjs
```

```expected
missing exemplar folder: renders-tab
```

**Implementation.**

- `controls.js`: one group, `scene`, with two or three numbers (for example `size` and `count`) and one color (`tint`).
- `extension.js`: starts with `// @ts-check`. Its default export takes `store` and returns `{ commands: { render }, pages: [renders], status }`, as in Global Constraints decision 9:
  - `render` takes a snapshot of every value, starts the stand-in render and returns a short line (such as `rendering…`) at once. The stand-in waits 800 ms on `setTimeout`, then draws a small thumbnail on a canvas from the snapshot (shapes sized and coloured by the values). A comment marks the stand-in as the part to replace with the project's real render, and says the real one must not block the page while it runs. When it finishes, it records the snapshot as the last render and adds an entry.
  - A `render` typed while one runs prints `already rendering` and starts nothing.
  - The `renders` page (`name: 'renders'`, an `about` line) keeps a history, newest first. Each entry is an element with class `render-entry`, holding the thumbnail and a line of every value it used, each printed as text with `String(value)` exactly as the store returns it (a color stays lowercase `#rrggbb`, not a swatch alone), because a test looks for that text. The page appends its own `<style>` to its host, because the drawer's stylesheet does not cover pages. Before the first render, the page says there are no renders yet.
  - `status` returns `''` when nothing has changed, `1 change since last render`, or `N changes since last render`.
- README:
  - When: a project where a change is costly to see, so renders run on demand.
  - Points:
    - **Look:** the pending count is in the status line.
    - **Look:** each history entry shows its values and a thumbnail, newest first.
    - **Behaviour:** typing is not blocked while a render runs. Type `render`, then `ls` at once: the listing prints before the render lands.
    - **Behaviour:** after `render`, the status clears.
  - Adapting:
    - Replace the stand-in with the project's render.
    - Keep the snapshot, so changes made during a render count against the values it actually used.
    - "If knobs grows this, prefer it", linking `https://github.com/mini-pylon/knobs/issues/10`.
    - `status` is a single mount option, so merge it with any status the project has.
- Shot: `npm run exemplars:shots -- renders-tab`. The shots script types `render` first, so the shot has one entry.

**Checks:** the `renders-tab` browser job (5 pass), `npm run test:unit` (200 pass), then the whole browser suite as a job (130 pass, 0 fail).

**Commit:** `test(exemplars): add the renders-tab extension`

### Task 9: the skill's Pictures and Share steps

**Files:** edit `tests/unit/skill.test.mjs` and `skills/knobs/SKILL.md`. Create `skills/knobs/pictures.md` and `skills/knobs/share.md`.

```bash apply
cat >> tests/unit/skill.test.mjs <<'PLAN_EOF'

// A `## ` section of a markdown file, as its lines, or null.
function section(text, heading) {
  const lines = text.split('\n');
  const start = lines.indexOf(`## ${heading}`);
  if (start < 0) return null;
  const end = lines.findIndex((line, i) => i > start && line.startsWith('## '));
  return lines.slice(start + 1, end < 0 ? undefined : end);
}

// The text of numbered step n of SKILL.md, up to the next step or section.
function step(text, n) {
  const m = text.match(new RegExp(`^${n}\\. ([\\s\\S]*?)(?=^\\d+\\. |^## )`, 'm'));
  return m ? m[1].replace(/\s+/g, ' ').trim() : null;
}

test('SKILL.md is at most 1,000 words and names pictures.md and share.md, which exist', () => {
  const text = readFileSync(skillPath, 'utf8');
  assert.ok(words(text) <= 1000, `SKILL.md has ${words(text)} words`);
  for (const f of ['pictures.md', 'share.md']) {
    assert.ok(text.includes(f), `SKILL.md names ${f}`);
    assert.ok(existsSync(join(dir, f)), `${f} exists`);
  }
});

test('the description fires on pictures and drawer commands', () => {
  const fm = frontmatter(readFileSync(skillPath, 'utf8'));
  assert.match(fm.description, /or when a control group needs a picture or a drawer command/);
});

test('the exemplar index ends SKILL.md and names every exemplar folder and nothing else', () => {
  const text = readFileSync(skillPath, 'utf8');
  const lines = section(text, 'Exemplars');
  assert.ok(lines, 'SKILL.md has an ## Exemplars section');
  assert.equal([...text.matchAll(/^## (.+)$/gm)].pop()[1], 'Exemplars', 'the index is the last section');
  const entries = lines.filter((line) => line.startsWith('- ')).map((line) => {
    const m = line.match(/^- `([\w-]+)` \((picture|extension)\): (.+)$/);
    assert.ok(m, `an index line is "- \`name\` (kind): When sentence", not: ${line}`);
    return { name: m[1], kind: m[2], when: m[3] };
  });
  assert.deepEqual(entries.map((entry) => entry.name).sort(), exemplarFolders());
  for (const entry of entries) {
    const folder = join(exemplarsDir, entry.name);
    assert.equal(entry.kind, existsSync(join(folder, 'visual.js')) ? 'picture' : 'extension', `${entry.name} is listed as its kind`);
    const when = section(readFileSync(join(folder, 'README.md'), 'utf8'), 'When').join(' ').replace(/\s+/g, ' ').trim();
    assert.equal(entry.when, when, `${entry.name}: the index line is its README's When sentence`);
  }
});

test('the skill has the Pictures and Share steps and the two new Never lines', () => {
  const text = readFileSync(skillPath, 'utf8');
  assert.match(step(text, 8) ?? '', /^\*\*Pictures\.\*\* .*pictures\.md/);
  assert.match(step(text, 9) ?? '', /^\*\*Hand over\.\*\*/);
  assert.match(step(text, 12) ?? '', /^\*\*Decisions note\.\*\*/);
  assert.match(step(text, 13) ?? '', /^\*\*Share\.\*\* .*share\.md/);
  const never = (section(text, 'Never') ?? []).join(' ').replace(/\s+/g, ' ');
  assert.ok(never.includes('- Hand over a picture that has not been checked against its exemplar.'), 'Never: an unchecked picture');
  assert.ok(never.includes("- Send anything about the user's project anywhere without their yes."), 'Never: sending without a yes');
});

test('pictures.md and share.md carry the facts their steps rely on', () => {
  const pictures = readFileSync(join(dir, 'pictures.md'), 'utf8');
  assert.match(pictures, /761/, 'pictures.md names the narrowest width that shows pictures');
  assert.match(pictures, /\.agents\/skills\/knobs/, 'pictures.md warns about the installed copy');
  const share = readFileSync(join(dir, 'share.md'), 'utf8');
  assert.match(share, /https:\/\/github\.com\/mini-pylon\/knobs\/issues\/new\?template=exemplar\.yml/);
  assert.match(share, /6,000/, 'share.md caps the link length');
});
PLAN_EOF
```

```bash red
node --test tests/unit/skill.test.mjs
```

```expected
SKILL.md has an ## Exemplars section
```

**Implementation.** SKILL.md stays at most 1,000 words, so each change is short. It has 691 at the base, which leaves about 300 words for everything below. The eight index lines take about 150 of them (each When sentence is at most 15 words, decision 3), so the description, Propose, steps 8 and 13, the Never lines and the index's lead-in share about 150. If the file comes out over 1,000, shorten the Propose addition first, then trim existing wording in Start and Wire; never shorten an index line, which must match its README. The spec's Skill changes section is the source; this is what each place must say.

- **Description:** append ", or when a control group needs a picture or a drawer command" to the existing sentence.
- **Step 3, Propose:** after the three groups, add that each group gets a picture: the closest exemplar from the index at the end, or "none" where a picture adds nothing (copy text, a lone toggle). Also suggest an extension where the project fits one: `presets` when the user talks about distinct looks, and `renders-tab` when a change is costly to see. The user trims pictures and extensions with the controls.
- **Step 8, Pictures:** a new step after Reads, one short paragraph: for each picture or extension the user kept, follow `pictures.md`. Hand over becomes step 9 and also shows the final screenshot.
- **Wrap up:** Values, Commit and Decisions note become steps 10 to 12. Step 13 is **Share.**, one line: offer to share each checked picture the user liked, following `share.md`. Leave becomes step 14.
- **Never:** add `Hand over a picture that has not been checked against its exemplar.` and `Send anything about the user's project anywhere without their yes.`
- **`## Exemplars`**, the last section: a one-line lead-in, then one line per folder, in the format of decision 13. Each line's sentence is copied from the README's When section.
- **`pictures.md`:** the spec's six numbered steps in full:
  1. Read the exemplar's README, then its code.
  2. Copy it next to the mount component: `knobs/<group>.js`, or `knobs/<group>.ts` with the JSDoc turned into annotations, because `allowJs` is not set in Vite's TypeScript templates. Replace `store.control` with the project's `control` import.
  3. Replace the stand-in maths, importing the page's own function where there is one.
  4. Add the picture to `visuals`, or spread the extension into the mount options, merging `status`.
  5. The Check:
     - the dev server opened with the agent's own browser tool, at least 761 px wide;
     - backtick, the group, and screenshots at 1280 and at 761 px wide;
     - each Look point checked against the screenshots, and each Behaviour point checked by doing what it says;
     - three rounds at most, then show the user what is still off;
     - with no browser tool, ask the user for a screenshot of a window at least 761 px wide.
  6. Show the final screenshot with the hand-over.

  Add one line saying that the default install keeps a copy under `.agents/skills/knobs`, which a broad `include` in the project's tsconfig or eslint config may pick up.
- **`share.md`:** the spec's Share step in full:
  1. For each checked picture the user liked, ask whether to share it.
  2. On a yes, offer to make the code generic first.
  3. Show exactly what each field will hold.
  4. Build `https://github.com/mini-pylon/knobs/issues/new?template=exemplar.yml` with `title=exemplar: <short name>` and the text fields `` `when` ``, `` `good` ``, `` `controls` `` and `` `code` `` URL-encoded by id, because GitHub fills only text fields from the URL.
  5. Measure the link. Above 6,000 bytes, leave `code` out (then `controls`) and name the file to paste from.
  6. The user picks the kind, ticks the license, drops in the screenshot, reads it through and submits it themselves.

  End with the rule that the agent never files the issue itself.
- Nothing in these files names a person, a machine path or a project, and the portability scan holds.

**Checks:** `node --test tests/unit/skill.test.mjs` (10 pass), `npm run test:unit` (205 pass, 0 fail), `wc -w skills/knobs/SKILL.md` (at most 1000).

**Commit:** `feat(skill): add the Pictures and Share steps and the exemplar index`

### Task 10: the issue form and the install check

**Files:** create `tests/unit/exemplar-form.test.mjs` and `.github/ISSUE_TEMPLATE/exemplar.yml`.

```bash apply
cat > tests/unit/exemplar-form.test.mjs <<'PLAN_EOF'
// The issue form a user shares an exemplar through, and the link share.md
// tells the agent to build for it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const path = name => fileURLToPath(new URL(`../../${name}`, import.meta.url));

test('the exemplar form has the fixed fields in order and the exemplar label', () => {
  const form = readFileSync(path('.github/ISSUE_TEMPLATE/exemplar.yml'), 'utf8');
  assert.match(form, /^labels: \[exemplar\]$/m);
  const fields = form.split(/^ {2}- type: /m).slice(1).map(block => ({
    type: block.split('\n')[0].trim(),
    id: block.match(/^ {4}id: (\S+)$/m)?.[1],
    block,
  }));
  assert.deepEqual(fields.map(field => [field.id, field.type]), [
    ['kind', 'dropdown'],
    ['when', 'input'],
    ['good', 'textarea'],
    ['controls', 'textarea'],
    ['code', 'textarea'],
    ['screenshot', 'textarea'],
    ['license', 'checkboxes'],
  ]);
  const byId = Object.fromEntries(fields.map(field => [field.id, field.block]));
  assert.match(byId.kind, /- picture/);
  assert.match(byId.kind, /- extension/);
  assert.match(byId.good, /What makes it good/);
  assert.match(byId.controls, /render: js/);
  assert.match(byId.code, /render: js/);
  assert.match(byId.license, /This is my code and I can share it under the MIT license/);
  assert.match(byId.license, /required: true/);
});

test('share.md prefills the form by its text field ids', () => {
  const share = readFileSync(path('skills/knobs/share.md'), 'utf8');
  assert.match(share, /template=exemplar\.yml/);
  for (const id of ['when', 'good', 'controls', 'code']) assert.ok(share.includes(`\`${id}\``), `share.md names the ${id} field`);
});
PLAN_EOF
```

```bash red
node --test tests/unit/exemplar-form.test.mjs
```

```expected
ISSUE_TEMPLATE/exemplar.yml
```

**Implementation.**

- `.github/ISSUE_TEMPLATE/exemplar.yml`: a GitHub issue form with `name`, a one-line `description`, `title: "exemplar: "` and `labels: [exemplar]`. Its `body` has these fields, in order:
  - `kind`: a dropdown with the options `picture` and `extension`.
  - `when`: an input.
  - `good`: a textarea labelled "What makes it good".
  - `controls`: a textarea with `render: js`.
  - `code`: a textarea with `render: js`.
  - `screenshot`: a textarea that asks for the image the user drops in.
  - `license`: a checkboxes field with one required option, "This is my code and I can share it under the MIT license".

  The `body` holds these seven fields and nothing else: no `type: markdown` preamble or other block, because the test requires exactly this list. Give each field a short label and description. The form is not part of the npm package and needs no other change.
- **The install check**, once. It needs the network to fetch the `skills` CLI. In an empty temporary directory outside the repository, with `git init` run there, run `timeout 300 npx --yes skills add <worktree path> --skill knobs -y`, which installs the `knobs` skill into that project without prompting. A run has no terminal to answer a prompt on, so never run it without `-y` and the `timeout`. Then confirm that `.agents/skills/knobs/exemplars/` holds all eight folders, each with its `shot.png`, and that `pictures.md` and `share.md` are there. Delete the temporary directory. If the CLI cannot run here (no network, a non-zero exit, or the `timeout` ending it), do not work around it: say so in the closing report, and the driver runs it (After the build).

**Checks:** `node --test tests/unit/exemplar-form.test.mjs` (2 pass), `npm run test:unit` (207 pass, 0 fail), then the whole browser suite as a job (130 pass, 0 fail).

**Commit:** `feat(skill): add the exemplar issue form`

## After the build

For the driver, once Milestone 4 is clean:

1. On Josh's yes, create the `exemplar` label on mini-pylon/knobs. A form's `labels` key applies only labels that already exist:

   ```
   gh label create exemplar --repo mini-pylon/knobs --description "A picture or drawer extension offered to the knobs skill"
   ```

2. If Task 10's report says the install check could not run, run it as Task 10 describes.
3. Once the form is on the default branch, build one link as `share.md` describes, with short made-up text in each field. Open it and check that the title and the `when`, `good`, `controls` and `code` fields arrive filled, and that `kind` and the license tick do not. This cannot be checked before the merge.
