---
title: control-drawer
kind: plan
target: knobs
topic: control-drawer
status: draft
written: 2026-11-11T05:41:49Z
by: claude
worktree: /home/jmo/linda/repos/knobs/.worktrees/spec-control-drawer
---

# control-drawer implementation plan

**Goal:** Ship `knobs`, a control drawer package extracted from wings-vdb with a value store, five control types, React reads and a Vite plugin, proven on a real project through a symlinked install.
**Architecture:** Plain ES modules with no build step and no framework in the core: a pure store and console parser, a drawer rendered in a shadow DOM, a React binding as its own entry point, and a Vite plugin whose endpoint is a plain request handler.
**Spec:** `/home/jmo/linda/repos/knobs/.worktrees/spec-control-drawer/docs/2026-11-11-knobs-spec-control-drawer.md`
**Base commit:** `5ffe803`
**Executor:** `run-plan`, one headless run per milestone
**Mode:** tests-first

## Global Constraints

- Base commit `5ffe803` on `spec-control-drawer`. It holds a README and `docs/`, with no `package.json` and no tests, so the starting test count is 0.
- Test counts when each milestone ends. Milestone 1: 102 unit (package 5, store 51, console 46). Milestone 2: 108 unit (adds index 3, instruments 3) and 44 browser (drawer 16, commands 22, instruments 6). Milestone 3: 146 unit (adds endpoint 27, vite-plugin 11) and 49 browser (adds vite 5). Milestone 4: 154 unit (adds react 6, types 2) and 58 browser (adds ssr 9). Milestone 5 adds the end-to-end run, in two modes. A count that differs is recorded and explained in the closing report.
- Every test in this plan was run against a throwaway reference implementation before the plan was written, and the key behaviours were broken on purpose to confirm a test fails. A test that seems impossible to pass means the implementation has drifted from the description. Stop and report it; never change the test.
- The source to port is frozen in `~/.cache/knobs/drawer-source/` (`terminal.js`, `params.js`, `viz.js`, `perf.js`, `style.css`, `vite.config.js`, `defaults.mjs`), because the wings-vdb drawer is still changing. Read those copies. Never read or edit `~/linda/repos/wings-vdb`. The probe in Task 1 pins them by hash.
- The live environment: `wings-vdb-dev.service` holds port 5350 and other services hold many ports around it. Tests ask the operating system for a free port and never use a fixed one. The real project in Task 11 is only ever copied to a temporary directory. Its dev config proxies `/dufs` to a live folder, so the run blocks those requests in the browser. Never run anything inside `~/linda/repos/drop`.
- Dependencies: a worktree starts with no `node_modules`, so run `npm ci --prefer-offline --ignore-scripts` first. Headless sandboxes may have no network, so the driver warms the npm cache before launching Milestone 1, in a fresh temporary directory holding a minimal `package.json`, with `npm install --ignore-scripts --save-dev --save-exact vite@8.3.8 react@19.3.1 react-dom@19.3.1 playwright@1.63.0 typescript@5.9.3`. Before Milestone 5 the driver also warms it with `npm ci --ignore-scripts` in a temporary copy of `drop` at `ff45f97`.
- Unit tests: `npm run test:unit`. They take under a few seconds and may run directly.
- The browser suite and the end-to-end run each run as a check job, never backgrounded by hand: `~/linda/skills/handoff-launch/scripts/launch-headless job --repo <worktree> --topic <topic> --cost 1 -- paced env KNOBS_CHROMIUM=/home/jmo/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome npm run test:browser`. Wait until `.status` in `<run dir>/meta.json` is not `running`; the output is `<run dir>/stdout.log`. Exit 8 means not admitted: report it rather than looping.
- Commits go through git-commit, staged by path. The last line of every commit message is exactly `Generated with wings.computer`, with no harness or model named. Never `git add -A`, never push.
- Use simple shell commands. If the tree has drifted from a task's assumption, stop and report; do not adapt silently. Never weaken, skip or delete a check or a test to make a red go green.
- For the driver: Task 1 commits a `.gitignore`. A checkout holding the untracked `.gitignore` that launch-headless wrote cannot fast-forward over it. That file holds only `.worktrees/`, which the committed one also lists. Ask Josh before removing it.

Where the spec was wrong or silent, this plan decided:

1. **Schema loading needs a stub for `knobs/react`.** The spec has the plugin import the controls file through a Vite module runner. Measured on a real project: `runnerImport` leaves bare imports to Node, Node resolves `knobs/react` to its real path in the linked checkout, and its `react` import fails with `Cannot find package 'react'`. The plugin therefore aliases `knobs/react` to `src/react-stub.js` while loading the schema. Validation needs only the control list, so nothing is lost.
2. **The plugin must not import `vite` statically.** Through a symlink, Node resolves it from the knobs checkout, not the project, which either fails or runs a different version. The plugin loads the project's copy with `createRequire` from the project root.
3. **`resolve.dedupe` only matters during server rendering.** In the browser, Vite maps a bare `react` straight to its pre-bundled copy, whatever the importer. Measured: removing dedupe changes nothing in a client-only project. Task 11 therefore adds a server-render stage and a mode where the linked package has its own React. Without dedupe that stage fails with `Cannot read properties of null (reading 'useCallback')`.
4. **`server.fs.allow` is kept as the spec says and covered by a unit test.** Vite 8 already serves modules it reached through an import, so no browser test depends on it. It still matters for a file requested directly.
5. **No extra file watcher.** Vite already watches files it imports from outside the root, so `handleHotUpdate` sees changes in the knobs checkout without one.
6. **The browser stores only what differs from the file value.** Otherwise a later edit to `knobs.values.json` would be masked by every value the browser ever held. A reset over a differing file value stores the default, so it survives a reload. A stored value equal to the file value is pruned on load.
7. **A file value that does not validate is ignored,** like a saved one, and numbers from the file clamp.
8. **Group names and control keys must match `\w+`,** so a path can be split from the console's `=`, `+=` and `-=`.
9. **"Editable field" means** a text-like `input`, a `textarea`, or anything `contenteditable`. A range, checkbox, color input or select is not one. The prompt is an editable field and takes focus when the console opens, so backtick there types a backtick and Escape closes the drawer.
10. **A text value is everything after one separating whitespace character,** trailing spaces included. A text control with no separator is an error, and with a separator and nothing after it sets an empty string. A `select` value takes the rest of the line the same way. A color takes the normal path and is refused unless it validates.
11. **The save endpoint refuses rather than clamps.** A number out of range or off its step is a 422, as the wings-vdb endpoint refuses out-of-range values, because the browser only ever sends normalized values.
12. **`export` and `download` carry only changed values,** matching the values file.
13. **A custom picture replaces the changed list** on its tab. The performance tab samples only while it shows, and its chart plots frame rate alone.
14. **The collapsed handle is left out.** wings-vdb hides it with `display: none`, so the drawer opens only by keyboard, as it does there. A phone has no way to open it.
15. **`mountKnobs` returns only the unmount function,** as the spec says, so `print`, `run` and `toggle` are not exposed.
16. **Tests pin Vite 8.3.8,** the major version this machine's React projects use. The peer range is `>=6.1`, and `runnerImport` exists in 6.4.5, but only Vite 8 is run.
17. **The real project is `drop` at `ff45f97`:** Vite 8, React 19, TypeScript and Tailwind's global reset, which is the CSS collision the spec worries about.
18. **The knobs skill is outside this build.** It belongs to another repository, so it cannot be a milestone of a run in this one. See After the build.

- Checked 2026-11-11 at 5ffe803: 11 apply blocks, 15 reds as quoted, 5 probes pass.

## Review Focus

1. The save endpoint on a shared dev server. Origin matching trusts `Host`; Vite's own `server.allowedHosts` is what stops a rebinding attack. Check that the plugin never loosens it, and look for a body or header the tests do not try.
2. What the port lost. Compare `src/drawer.js` against the frozen `terminal.js` for behaviour that went missing: history, tab completion, the slash menu's keys, double-click reset, the click-to-focus rule on the console.
3. Teardown. Look for a timer, frame loop, media query listener or store subscription that survives `unmount`, since React's strict mode mounts twice.
4. A controls file that imports more than `knobs`. The stub covers `knobs/react` only, so a controls file importing another linked package would still fail to load in Node.
5. Real browsers. Tests run only on Chromium. `all: initial !important` on the host, the `translate` property and a native color input inside a shadow root need a look in Safari.
6. Vite 6 and 7. Only Vite 8 is run, and the plugin reaches into `exports['.']` to find the project's copy.
7. Two saves at once. The file write is atomic, but the later request wins and nothing orders them.

## Milestones

- **Milestone 1: the store and console** (Tasks 1 to 3). Ends with the package shape, the value store and console parsing passing in Node with no browser. Reviewer brief: confirm `defineControls` touches no browser API at import or call time, that the store's returned functions work destructured, and that precedence matches the spec's Value precedence section.
- **Milestone 2: the drawer** (Tasks 4 to 6). Ends with the drawer running on a fixture page in a shadow DOM with every control type, command and key. Reviewer brief: check Review Focus 2, 3 and 5, confirm no string `wings-vdb` remains in `src/`, and confirm the page's `body` is never touched.
- **Milestone 3: the Vite plugin** (Tasks 7 and 8). Ends with `save` writing the values file and edits causing full reloads. Reviewer brief: check Review Focus 1 and 7, and confirm `src/vite.js` has no static import of `vite`.
- **Milestone 4: React and types** (Tasks 9 and 10). Ends with server-rendered React fixtures hydrating without a warning and a TypeScript consumer compiling. Reviewer brief: confirm only `src/react.js` imports React, and that `getServerSnapshot` never reads a saved value.
- **Milestone 5: a real project** (Task 11). Ends with the end-to-end run passing in both modes. Reviewer brief: check Review Focus 4 and 6, read both logs, and confirm nothing wrote inside the `drop` checkout.

### Task 1: the package shape

**Files:** create `package.json`, `package-lock.json`, `.gitignore`, `tests/unit/package.test.mjs`.

These facts must hold for the plan to work:

```bash probe
node --version
```

```expected
v24.
```

```bash probe
cd "$HOME/.cache/knobs/drawer-source" && cat terminal.js params.js viz.js perf.js style.css vite.config.js defaults.mjs | sha256sum
```

```expected
818b739fe6c052b01f8efaf63a7bb44430eed1ce3db3e366edc903f7a413427e
```

```bash probe
test -x "$HOME/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome" && echo present
```

```expected
present
```

```bash probe
git -C "$HOME/linda/repos/drop" rev-parse --short HEAD
```

```expected
ff45f97
```

```bash probe
grep -c "plugins: \[react(), tailwindcss()\]" "$HOME/linda/repos/drop/vite.config.ts"
```

```expected
1
```

```bash apply
mkdir -p tests/unit
cat > tests/unit/package.test.mjs <<'PLAN_EOF'
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

test('the package is private and an ES module', () => {
  assert.equal(pkg.name, 'knobs');
  assert.equal(pkg.private, true);
  assert.equal(pkg.type, 'module');
});

test('it has exactly the three entry points, each with types', () => {
  assert.deepEqual(Object.keys(pkg.exports).sort(), ['.', './react', './vite']);
  assert.deepEqual(pkg.exports['.'], { types: './types/index.d.ts', default: './src/index.js' });
  assert.deepEqual(pkg.exports['./react'], { types: './types/react.d.ts', default: './src/react.js' });
  assert.deepEqual(pkg.exports['./vite'], { types: './types/vite.d.ts', default: './src/vite.js' });
});

test('it has no runtime dependencies, and react and vite are optional peers', () => {
  assert.equal(pkg.dependencies, undefined);
  assert.deepEqual(Object.keys(pkg.peerDependencies).sort(), ['react', 'vite']);
  assert.deepEqual(pkg.peerDependenciesMeta, { react: { optional: true }, vite: { optional: true } });
});

test('it has no build step', () => {
  assert.equal(pkg.scripts.build, undefined);
  assert.equal(pkg.scripts.prepare, undefined);
  assert.deepEqual(pkg.files, ['src', 'types']);
});

test('the test tools are pinned exactly', () => {
  for (const name of ['vite', 'react', 'react-dom', 'playwright', 'typescript']) {
    assert.match(pkg.devDependencies[name], /^\d+\.\d+\.\d+$/, name);
  }
});
PLAN_EOF
```

```bash red
node --test tests/unit/package.test.mjs
```

```expected
no such file or directory
```

**Implementation.** Write `package.json` with `name` `knobs`, `version` `0.1.0`, `private` true, `type` `module`, and `files` of `src` and `types`. `exports` maps `.`, `./react` and `./vite` each to `types` under `./types/` and `default` under `./src/` (`index`, `react`, `vite`). `scripts` holds `test:unit` as `node --test "tests/unit/*.test.mjs"` and `test:browser` as `node --test --test-concurrency=1 "tests/browser/*.test.mjs"`, and no build or prepare script. `peerDependencies` are `react` `>=18` and `vite` `>=6.1`, both optional through `peerDependenciesMeta`. There are no `dependencies`. Install the dev tools exactly, with `npm install --prefer-offline --ignore-scripts --save-dev --save-exact vite@8.3.8 react@19.3.1 react-dom@19.3.1 playwright@1.63.0 typescript@5.9.3`. Write `.gitignore` with `node_modules/`, `tests/.tmp/` and `.worktrees/`.

**Check:** `node --test tests/unit/package.test.mjs` passes 5.

**Commit:** `feat(package): add the package shape`

### Task 2: the value store

**Files:** create `src/store.js`, `tests/unit/store.test.mjs`.

**Interfaces.** `normalize(control, value)` returns `{ ok: true, value }` or `{ ok: false }`. `defineControls(groups, fileValues = {})` returns a store with `groups`, `byPath`, `control(path)`, `fileValue(path)`, `onControl(path, fn)`, `subscribe(fn)`, `set(path, value)`, `reset(paths?)`, `changed()`, `attach(storage, key)` and `detach()`. Listeners are called as `fn(value, path)`. `onControl` and `subscribe` return a function that stops them.

```bash apply
mkdir -p tests/unit
cat > tests/unit/store.test.mjs <<'PLAN_EOF'
import test from 'node:test';
import assert from 'node:assert/strict';
import { defineControls, normalize } from '../../src/store.js';

const schema = () => [
  { name: 'hero', about: 'Homepage hero', controls: [
    { key: 'variant', type: 'select', value: 'split', options: ['split', 'full', 'stacked'] },
    { key: 'title', type: 'text', value: 'The original headline' },
    { key: 'overlay', type: 'number', value: 0.4, min: 0, max: 1, step: 0.01 },
    { key: 'badge', type: 'toggle', value: 1 },
    { key: 'accent', type: 'color', value: '#e8c547' },
  ] },
  { name: 'product', hidden: true, controls: [
    { key: 'price', type: 'number', value: 10, min: 0, max: 100, step: 1 },
  ] },
];

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
  };
}

function inBrowser(t) {
  globalThis.window = {};
  t.after(() => { delete globalThis.window; });
}

test('defineControls touches no browser API', () => {
  const trap = new Proxy({}, { get() { throw new Error('touched a browser API'); } });
  for (const name of ['document', 'localStorage', 'sessionStorage']) globalThis[name] = trap;
  try {
    const knobs = defineControls(schema(), {});
    assert.equal(knobs.control('hero.title'), 'The original headline');
  } finally {
    for (const name of ['document', 'localStorage', 'sessionStorage']) delete globalThis[name];
  }
});

test('reads work when destructured from the store', () => {
  const { control, onControl } = defineControls(schema());
  assert.equal(control('hero.variant'), 'split');
  assert.equal(typeof onControl('hero.variant', () => {}), 'function');
});

test('a read of an unknown path throws', () => {
  const knobs = defineControls(schema());
  assert.throws(() => knobs.control('hero.nope'), /unknown control: hero\.nope/);
  assert.throws(() => knobs.onControl('nope.nope', () => {}), /unknown control: nope\.nope/);
  assert.throws(() => knobs.fileValue('hero.nope'), /unknown control: hero\.nope/);
});

test('every control gets its path, group and default, and the schema is frozen', () => {
  const knobs = defineControls(schema());
  const c = knobs.byPath.get('product.price');
  assert.equal(c.path, 'product.price');
  assert.equal(c.group, 'product');
  assert.equal(c.default, 10);
  assert.ok(Object.isFrozen(c));
  assert.ok(Object.isFrozen(knobs.groups));
  assert.equal(knobs.groups[1].hidden, true);
  assert.equal(knobs.groups[0].hidden, false);
  assert.equal(knobs.groups[0].about, 'Homepage hero');
  assert.equal(knobs.groups[1].about, '');
});

for (const [name, bad, pattern] of [
  ['a duplicate control', [{ name: 'a', controls: [{ key: 'x', type: 'text', value: '' }, { key: 'x', type: 'text', value: '' }] }], /duplicate control a\.x/],
  ['an unknown type', [{ name: 'a', controls: [{ key: 'x', type: 'range', value: 1 }] }], /a\.x has unknown type range/],
  ['a number without a range', [{ name: 'a', controls: [{ key: 'x', type: 'number', value: 1 }] }], /a\.x needs min, max and step/],
  ['a select without options', [{ name: 'a', controls: [{ key: 'x', type: 'select', value: 'y' }] }], /a\.x needs options/],
  ['a default that does not validate', [{ name: 'a', controls: [{ key: 'x', type: 'select', value: 'y', options: ['z'] }] }], /a\.x has an invalid default/],
  ['a group name with a space', [{ name: 'a b', controls: [] }], /bad group name: a b/],
  ['a key with a dot', [{ name: 'a', controls: [{ key: 'x.y', type: 'text', value: '' }] }], /bad control key in a: x\.y/],
]) test(`defineControls refuses ${name}`, () => assert.throws(() => defineControls(bad), pattern));

const number = { type: 'number', min: 0, max: 1, step: 0.01 };
for (const [name, control, input, expected] of [
  ['a number in range', number, 0.5, { ok: true, value: 0.5 }],
  ['a number above its range clamps', number, 3, { ok: true, value: 1 }],
  ['a number below its range clamps', number, -3, { ok: true, value: 0 }],
  ['a number rounds to its step', number, 0.123, { ok: true, value: 0.12 }],
  ['NaN', number, NaN, { ok: false }],
  ['Infinity', number, Infinity, { ok: false }],
  ['a numeric string', number, '0.5', { ok: false }],
  ['toggle 1', { type: 'toggle' }, 1, { ok: true, value: 1 }],
  ['toggle true', { type: 'toggle' }, true, { ok: true, value: 1 }],
  ['toggle false', { type: 'toggle' }, false, { ok: true, value: 0 }],
  ['toggle 2', { type: 'toggle' }, 2, { ok: false }],
  ['an option', { type: 'select', options: ['a', 'b'] }, 'b', { ok: true, value: 'b' }],
  ['a value not in the options', { type: 'select', options: ['a', 'b'] }, 'c', { ok: false }],
  ['text', { type: 'text' }, 'a b = 2', { ok: true, value: 'a b = 2' }],
  ['empty text', { type: 'text' }, '', { ok: true, value: '' }],
  ['a number for text', { type: 'text' }, 2, { ok: false }],
  ['a colour', { type: 'color' }, '#a1b2c3', { ok: true, value: '#a1b2c3' }],
  ['an upper-case colour lowers', { type: 'color' }, '#A1B2C3', { ok: true, value: '#a1b2c3' }],
  ['a short colour', { type: 'color' }, '#abc', { ok: false }],
  ['a named colour', { type: 'color' }, 'red', { ok: false }],
]) test(`normalize: ${name}`, () => assert.deepEqual(normalize(control, input), expected));

test('a file value beats the default, and an invalid one is ignored', () => {
  const knobs = defineControls(schema(), { 'hero.title': 'From the file', 'hero.variant': 'gone', 'hero.overlay': 9, 'no.such': 1 });
  assert.equal(knobs.control('hero.title'), 'From the file');
  assert.equal(knobs.control('hero.variant'), 'split');
  assert.equal(knobs.control('hero.overlay'), 1);
});

test('a saved value beats the file value, which beats the default', t => {
  inBrowser(t);
  const knobs = defineControls(schema(), { 'hero.title': 'File', 'hero.accent': '#111111' });
  knobs.attach(memoryStorage({ k: JSON.stringify({ 'hero.title': 'Saved' }) }), 'k');
  assert.equal(knobs.control('hero.title'), 'Saved');
  assert.equal(knobs.control('hero.accent'), '#111111');
  assert.equal(knobs.control('hero.variant'), 'split');
  assert.equal(knobs.fileValue('hero.title'), 'File');
});

for (const [name, saved] of [
  ['a select value not in its options', { 'hero.variant': 'gone' }],
  ['a number that is not finite', { 'hero.overlay': null }],
  ['a color that is not #rrggbb', { 'hero.accent': 'red' }],
  ['a path not in the schema', { 'hero.gone': 'x' }],
]) test(`a saved value is ignored: ${name}`, t => {
  inBrowser(t);
  const knobs = defineControls(schema());
  let calls = 0;
  knobs.subscribe(() => calls++);
  knobs.attach(memoryStorage({ k: JSON.stringify(saved) }), 'k');
  assert.deepEqual(knobs.changed(), {});
  assert.equal(calls, 0);
});

test('a saved number clamps to its range', t => {
  inBrowser(t);
  const knobs = defineControls(schema());
  knobs.attach(memoryStorage({ k: JSON.stringify({ 'hero.overlay': 7 }) }), 'k');
  assert.equal(knobs.control('hero.overlay'), 1);
});

test('corrupt storage is treated as empty', t => {
  inBrowser(t);
  const knobs = defineControls(schema());
  knobs.attach(memoryStorage({ k: '{not json' }), 'k');
  assert.deepEqual(knobs.changed(), {});
});

test('attach notifies once per value that changed', t => {
  inBrowser(t);
  const knobs = defineControls(schema());
  const seen = [];
  knobs.onControl('hero.title', value => seen.push(['one', value]));
  knobs.subscribe((value, path) => seen.push(['all', path, value]));
  knobs.attach(memoryStorage({ k: JSON.stringify({ 'hero.title': 'New', 'hero.variant': 'split' }) }), 'k');
  assert.deepEqual(seen, [['one', 'New'], ['all', 'hero.title', 'New']]);
});

test('a set notifies with the value and path, and a stopped listener hears nothing', t => {
  inBrowser(t);
  const knobs = defineControls(schema());
  const seen = [];
  const stop = knobs.onControl('hero.badge', (value, path) => seen.push([path, value]));
  assert.equal(knobs.set('hero.badge', 0), true);
  stop();
  knobs.set('hero.badge', 1);
  assert.deepEqual(seen, [['hero.badge', 0]]);
});

test('a set to the same value does not notify', t => {
  inBrowser(t);
  const knobs = defineControls(schema());
  let calls = 0;
  knobs.onControl('hero.overlay', () => calls++);
  knobs.set('hero.overlay', 0.4);
  assert.equal(calls, 0);
});

test('a listener that stops itself does not break the others', t => {
  inBrowser(t);
  const knobs = defineControls(schema());
  const seen = [];
  const stop = knobs.onControl('hero.badge', () => { seen.push('first'); stop(); });
  knobs.onControl('hero.badge', () => seen.push('second'));
  knobs.set('hero.badge', 0);
  assert.deepEqual(seen, ['first', 'second']);
});

test('an invalid set returns false and changes nothing', t => {
  inBrowser(t);
  const knobs = defineControls(schema());
  assert.equal(knobs.set('hero.variant', 'gone'), false);
  assert.equal(knobs.control('hero.variant'), 'split');
});

test('a set of an unknown path throws', t => {
  inBrowser(t);
  assert.throws(() => defineControls(schema()).set('hero.nope', 1), /unknown control: hero\.nope/);
});

test('setting, resetting or attaching with no window throws', () => {
  const knobs = defineControls(schema());
  assert.throws(() => knobs.set('hero.badge', 0), /only change in a browser/);
  assert.throws(() => knobs.reset(), /only change in a browser/);
  assert.throws(() => knobs.attach(memoryStorage(), 'k'), /only change in a browser/);
  assert.equal(knobs.control('hero.badge'), 1);
});

test('reset restores the default in the controls file, even over a file value', t => {
  inBrowser(t);
  const storage = memoryStorage();
  const knobs = defineControls(schema(), { 'hero.title': 'File' });
  knobs.attach(storage, 'k');
  knobs.reset(['hero.title']);
  assert.equal(knobs.control('hero.title'), 'The original headline');
  const again = defineControls(schema(), { 'hero.title': 'File' });
  again.attach(storage, 'k');
  assert.equal(again.control('hero.title'), 'The original headline');
});

test('reset with no argument restores everything', t => {
  inBrowser(t);
  const knobs = defineControls(schema());
  knobs.set('hero.overlay', 0.9);
  knobs.set('product.price', 50);
  knobs.reset();
  assert.deepEqual(knobs.changed(), {});
});

test('changed lists only values that differ from the defaults', t => {
  inBrowser(t);
  const knobs = defineControls(schema(), { 'hero.title': 'File' });
  knobs.set('hero.overlay', 0.9);
  knobs.set('hero.badge', 1);
  assert.deepEqual(knobs.changed(), { 'hero.title': 'File', 'hero.overlay': 0.9 });
});

test('storage holds only what differs from the file, so a later file edit shows', t => {
  inBrowser(t);
  const storage = memoryStorage();
  const knobs = defineControls(schema(), { 'hero.title': 'File' });
  knobs.attach(storage, 'k');
  knobs.set('hero.overlay', 0.9);
  knobs.set('hero.title', 'File');
  assert.deepEqual(JSON.parse(storage.map.get('k')), { 'hero.overlay': 0.9 });
  const edited = defineControls(schema(), { 'hero.title': 'Edited file' });
  edited.attach(storage, 'k');
  assert.equal(edited.control('hero.title'), 'Edited file');
});

test('a saved value equal to the file value is pruned on attach', t => {
  inBrowser(t);
  const storage = memoryStorage({ k: JSON.stringify({ 'hero.title': 'File' }) });
  defineControls(schema(), { 'hero.title': 'File' }).attach(storage, 'k');
  assert.deepEqual(JSON.parse(storage.map.get('k')), {});
});
PLAN_EOF
```

```bash red
node --test tests/unit/store.test.mjs
```

```expected
src/store.js' imported from
```

**Implementation.** `normalize` follows the spec's rules: a number must be a finite number, clamps to its range and rounds to the decimals of its `step`; a toggle takes 0, 1, `true` or `false` and stores 0 or 1; a select must be in `options`; text must be a string; a color must match `#rrggbb` and is lowered. `defineControls` validates the schema and throws on a duplicate path, an unknown type, a number missing `min`, `max` or `step`, a select without options, an invalid default, or a group name or key not matching `\w+`, using the messages the tests quote. Each control gains `path`, `group` and `default`, and is frozen, as are the groups; a group always has `about` (empty if absent) and a boolean `hidden`.

Hold three things: the base values (a valid file value, else the default), the live values, and a saved map. Every method is a closure, so destructuring works. An unknown path throws `knobs: unknown control: <path>` from `control`, `fileValue`, `onControl` and `set`. `set`, `reset` and `attach` throw `knobs: values can only change in a browser` when `window` is undefined. `set` returns false for an invalid value, records it in the saved map (deleting the entry when it equals the base value), persists, and notifies only if the live value changed. `reset` sets each path to its `default`. `changed` returns live values that differ from their defaults. `attach` reads JSON from storage, treating corrupt data as empty, skips unknown paths and invalid values, applies the rest, notifies once per value that changed, and writes the pruned map back. Copy the listener set before iterating, so a listener can stop itself. `detach` forgets the storage.

**Check:** `node --test tests/unit/store.test.mjs` passes 51.

**Commit:** `feat(store): add the value store`

### Task 3: console parsing

**Files:** create `src/console.js`, `tests/unit/console.test.mjs`.

**Interfaces.** `parseLine(line, { resolve, builtins, commands })`, where `resolve(word)` returns a control or null and `builtins` and `commands` are sets of names. It returns one of `{ kind: 'empty' }`, `{ kind: 'builtin', name, args, rest }`, `{ kind: 'command', name, args, rest }`, `{ kind: 'set', control, op, raw }`, `{ kind: 'error', message }` or `{ kind: 'unknown', head }`. `coerce(control, op, raw, current)` returns `{ ok: true, value }` or `{ ok: false, message }`.

```bash apply
mkdir -p tests/unit
cat > tests/unit/console.test.mjs <<'PLAN_EOF'
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLine, coerce } from '../../src/console.js';

const controls = {
  'hero.title': { path: 'hero.title', key: 'title', type: 'text' },
  'hero.variant': { path: 'hero.variant', key: 'variant', type: 'select' },
  'hero.overlay': { path: 'hero.overlay', key: 'overlay', type: 'number' },
  'hero.badge': { path: 'hero.badge', key: 'badge', type: 'toggle' },
  'hero.accent': { path: 'hero.accent', key: 'accent', type: 'color' },
};
const resolve = name => controls[name] ?? Object.values(controls).find(c => c.key === name) ?? null;
const context = { resolve, builtins: new Set(['help', 'ls', 'get', 'reset', 'on', 'save', 'download', 'load', 'export', 'import', 'clear', 'close']), commands: new Set(['shot']) };
const parse = line => parseLine(line, context);
const setOf = (control, op, raw) => ({ kind: 'set', control: controls[control], op, raw });

test('an empty line', () => {
  assert.deepEqual(parse(''), { kind: 'empty' });
  assert.deepEqual(parse('   '), { kind: 'empty' });
  assert.deepEqual(parse('/'), { kind: 'empty' });
});

for (const [name, line, raw] of [
  ['spaces', 'hero.title Two words here', 'Two words here'],
  ['an equals sign', 'hero.title a = b', 'a = b'],
  ['a leading equals sign', 'hero.title = b', '= b'],
  ['a plus-equals', 'hero.title += 2', '+= 2'],
  ['digits', 'hero.title 12345', '12345'],
  ['repeated spaces', 'hero.title a   b', 'a   b'],
  ['extra leading spaces after the one separator', 'hero.title   a', '  a'],
  ['trailing spaces', 'hero.title a  ', 'a  '],
  ['nothing after the separator', 'hero.title ', ''],
  ['the key alone', 'title Two words', 'Two words'],
]) test(`a text value keeps ${name}`, () => assert.deepEqual(parse(line), setOf('hero.title', '=', raw)));

test('set takes a text value the same way', () => {
  assert.deepEqual(parse('set hero.title a = 2  b'), setOf('hero.title', '=', 'a = 2  b'));
});

test('a text control with no separator asks for a value', () => {
  assert.deepEqual(parse('hero.title'), { kind: 'error', message: 'hero.title: expected a value' });
});

test('compact = does not apply to a text control', () => {
  assert.deepEqual(parse('hero.title=x'), { kind: 'unknown', head: 'hero.title=x' });
});

test('a select value is the rest of the line', () => {
  assert.deepEqual(parse('hero.variant split view'), setOf('hero.variant', '=', 'split view'));
});

for (const [line, op, raw] of [
  ['hero.overlay 0.5', '=', '0.5'],
  ['overlay 0.5', '=', '0.5'],
  ['hero.overlay = 0.5', '=', '0.5'],
  ['hero.overlay=0.5', '=', '0.5'],
  ['hero.overlay += .2', '+=', '.2'],
  ['hero.overlay+=.2', '+=', '.2'],
  ['hero.overlay -= .2', '-=', '.2'],
  ['hero.overlay-=.2', '-=', '.2'],
  ['set overlay 0.5', '=', '0.5'],
  ['set hero.overlay += 1', '+=', '1'],
]) test(`number: ${line}`, () => assert.deepEqual(parse(line), setOf('hero.overlay', op, raw)));

test('a toggle with no value', () => assert.deepEqual(parse('hero.badge'), setOf('hero.badge', '=', undefined)));
test('a toggle with a word', () => assert.deepEqual(parse('badge off'), setOf('hero.badge', '=', 'off')));
test('a colour', () => assert.deepEqual(parse('accent #112233'), setOf('hero.accent', '=', '#112233')));

test('a builtin, with and without a slash', () => {
  assert.deepEqual(parse('reset hero'), { kind: 'builtin', name: 'reset', args: ['hero'], rest: 'hero' });
  assert.deepEqual(parse('/save'), { kind: 'builtin', name: 'save', args: [], rest: '' });
});

test('import keeps its JSON exactly', () => {
  const json = '{"hero.title":"a   b"}';
  assert.equal(parse(`import ${json}`).rest, json);
});

test('a project command', () => {
  assert.deepEqual(parse('shot 1200 wide'), { kind: 'command', name: 'shot', args: ['1200', 'wide'], rest: '1200 wide' });
});

test('an unknown word', () => assert.deepEqual(parse('nonsense 1'), { kind: 'unknown', head: 'nonsense' }));
test('set with nothing', () => assert.equal(parse('set').kind, 'error'));
test('set with an unknown control', () => assert.deepEqual(parse('set nope 1'), { kind: 'error', message: 'unknown control: nope  (try ls)' }));

const number = controls['hero.overlay'], toggle = controls['hero.badge'], text = controls['hero.title'], color = controls['hero.accent'];
for (const [name, args, expected] of [
  ['a number', [number, '=', '0.5', 0], { ok: true, value: 0.5 }],
  ['plus-equals', [number, '+=', '.25', 0.5], { ok: true, value: 0.75 }],
  ['minus-equals', [number, '-=', '.25', 0.5], { ok: true, value: 0.25 }],
  ['not a number', [number, '=', 'abc', 0], { ok: false, message: 'not a number: abc' }],
  ['a missing number', [number, '=', undefined, 0], { ok: false, message: 'not a number: ' }],
  ['a toggle flips with no value', [toggle, '=', undefined, 1], { ok: true, value: 0 }],
  ['toggle on', [toggle, '=', 'on', 0], { ok: true, value: 1 }],
  ['toggle no', [toggle, '=', 'no', 1], { ok: true, value: 0 }],
  ['text stays a string', [text, '=', '12', 'x'], { ok: true, value: '12' }],
  ['empty text', [text, '=', '', 'x'], { ok: true, value: '' }],
  ['a colour stays a string', [color, '=', '#112233', '#000000'], { ok: true, value: '#112233' }],
  ['a missing colour', [color, '=', undefined, '#000000'], { ok: false, message: 'hero.accent: expected a value' }],
]) test(`coerce: ${name}`, () => assert.deepEqual(coerce(...args), expected));
PLAN_EOF
```

```bash red
node --test tests/unit/console.test.mjs
```

```expected
src/console.js' imported from
```

**Implementation.** Strip leading whitespace and one leading `/`. Split the head from the rest at the first whitespace character, removing only that one character, so the rest keeps its spacing exactly. `set` parses what follows it as an assignment. Then builtins, then project commands, then an assignment, then unknown. In an assignment, a text or select control takes the rest verbatim with op `=`, and the error `<path>: expected a value` if there was no separator. Any other control trims the rest and reads a leading `=`, `+=` or `-=`, with `raw` undefined when nothing is left. If the first word is not a control, try the compact form (`name=2`, `name+=.2`) with a regular expression, but only for controls that are neither text nor select. `set` with an unknown name is the error `unknown control: <name>  (try ls)`. `args` is the rest split on whitespace, and `rest` is kept for `import`.

`coerce` returns text, select and color as they are, with `<path>: expected a value` when `raw` is undefined. A toggle with no value flips. Otherwise read the words `on off true false yes no`, or `Number(raw)`; a value that is not finite is `not a number: <raw>`, with an empty string after the colon when `raw` is undefined. Apply `+=` and `-=` to `current`.

**Check:** `npm run test:unit` passes 102.

**Commit:** `feat(console): parse the prompt`

### Task 4: the drawer in a shadow DOM

**Files:** create `src/drawer.js`, `src/style.js`, `src/instruments.js`, `src/performance.js`, `src/index.js`, `tests/browser/lib/harness.mjs`, `tests/browser/drawer.test.mjs`, `tests/unit/index.test.mjs`, `tests/unit/instruments.test.mjs`, and the fixture `tests/fixtures/plain/`.

**Interfaces.** `mountKnobs(store, { name, commands, status, onFocus, extras, pages, visuals, stats })` returns a function that unmounts the drawer. `src/index.js` exports exactly `defineControls`, `mountKnobs`, `makePen`, `canvasVisual`, `pixels`, `trace` and `fit`. The host element carries `data-knobs` set to `name`. These class names are what the tests read and must be kept: `term`, `open`, `term-drawer`, `term-tab`, `active`, `term-status`, `term-log`, `term-prompt`, `term-row` (with `data-path`), `term-key`, `term-value`, `term-viz`, `term-file`, `term-slash-name`, `perf-key`, `perf-value`, `viz-chart`. Row controls carry `aria-label` set to the control's path: a `[role=slider]` for a number, a `button` for a toggle, a `select`, and an `input` for text and color.

```bash apply
mkdir -p tests/browser tests/browser/lib tests/fixtures/plain tests/unit
cat > tests/browser/lib/harness.mjs <<'PLAN_EOF'
import { cp, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

export const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const scratch = join(repo, 'tests', '.tmp');

export function aliases() {
  return [
    { find: /^knobs\/react$/, replacement: join(repo, 'src/react.js') },
    { find: /^knobs\/vite$/, replacement: join(repo, 'src/vite.js') },
    { find: /^knobs$/, replacement: join(repo, 'src/index.js') },
  ];
}

// A private copy of a fixture, inside the repository so bare imports resolve.
export async function copyFixture(name) {
  await mkdir(scratch, { recursive: true });
  const root = await mkdtemp(join(scratch, `${name}-`));
  await cp(join(repo, 'tests', 'fixtures', name), root, { recursive: true });
  return { root, remove: () => rm(root, { recursive: true, force: true }) };
}

export function viteConfig(root, extra = {}) {
  const { plugins = [], ...rest } = extra;
  return {
    configFile: false,
    root,
    cacheDir: join(root, '.vite'),
    logLevel: 'error',
    plugins,
    resolve: { alias: aliases(), dedupe: ['react', 'react-dom'] },
    optimizeDeps: { include: ['react', 'react-dom/client'] },
    server: { host: '127.0.0.1', port: 0, strictPort: false, fs: { allow: [repo] } },
    ...rest,
  };
}

export async function serve(root, extra) {
  const server = await createServer(viteConfig(root, extra));
  await server.listen();
  const { port } = server.httpServer.address();
  return { server, url: `http://127.0.0.1:${port}/`, port, close: () => server.close() };
}

export function launch() {
  return chromium.launch({ executablePath: process.env.KNOBS_CHROMIUM || undefined });
}

export async function newPage(browser, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true, ...options });
  context.setDefaultTimeout(10000);
  return context.newPage();
}

// Console errors and uncaught exceptions on a page, as strings.
export function collectErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  return errors;
}

export async function openDrawer(page) {
  await page.keyboard.press('Backquote');
  await page.locator('.term.open .term-drawer').waitFor();
}

export async function type(page, line) {
  const prompt = page.locator('.term-prompt input');
  await prompt.fill(line);
  await prompt.press('Enter');
}

export const logText = page => page.locator('.term-log').innerText();
PLAN_EOF
cat > tests/browser/drawer.test.mjs <<'PLAN_EOF'
import '../../src/drawer.js';
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { collectErrors, copyFixture, launch, newPage, logText, openDrawer, serve, type } from './lib/harness.mjs';

let fixture, site, browser, page, errors;

before(async () => {
  fixture = await copyFixture('plain');
  site = await serve(fixture.root);
  browser = await launch();
});
after(async () => {
  await browser?.close();
  await site?.close();
  await fixture?.remove();
});

async function fresh() {
  await page?.context().close();
  page = await newPage(browser);
  errors = collectErrors(page);
  await page.goto(site.url);
  await page.locator('[data-knobs]').waitFor({ state: 'attached' });
}
const tab = name => page.locator('.term-tab', { hasText: new RegExp(`^${name}$`) });
const read = id => page.locator(`#read-${id}`).textContent();

test('the drawer mounts in a shadow DOM and leaves the page alone', async () => {
  await fresh();
  const facts = await page.evaluate(() => {
    const host = document.querySelector('[data-knobs]');
    return { shadow: Boolean(host.shadowRoot), light: document.querySelectorAll('.term').length, inside: host.shadowRoot.querySelectorAll('.term').length, name: host.dataset.knobs };
  });
  assert.deepEqual(facts, { shadow: true, light: 0, inside: 1, name: 'fixture' });
  await openDrawer(page);
  assert.equal(await page.evaluate(() => document.body.className), '');
  assert.deepEqual(errors, []);
});

test('the page\'s global CSS does not change the drawer', async () => {
  await fresh();
  await openDrawer(page);
  await tab('hero').click();
  const style = await page.evaluate(() => {
    const root = document.querySelector('[data-knobs]').shadowRoot;
    const read = selector => getComputedStyle(root.querySelector(selector));
    const host = getComputedStyle(document.querySelector('[data-knobs]'));
    return { tab: read('.term-tab').color, key: read('.term-key').color, keyDisplay: read('.term-key').display, value: read('.term-value').color, size: read('.term-key').fontSize, padding: read('.term-tab').paddingLeft, spacing: read('.term-key').letterSpacing, transform: read('.term-key').textTransform, z: host.zIndex, position: host.position, opacity: host.opacity };
  });
  assert.deepEqual(style, { tab: 'rgb(232, 197, 71)', key: 'rgb(232, 197, 71)', keyDisplay: 'block', value: 'rgb(216, 225, 232)', size: '12px', padding: '0px', spacing: 'normal', transform: 'none', z: '2147483647', position: 'fixed', opacity: '1' });
});

test('the drawer\'s CSS does not reach the page', async () => {
  await fresh();
  await openDrawer(page);
  const style = await page.evaluate(() => ({
    padding: getComputedStyle(document.getElementById('page-button')).paddingLeft,
    display: getComputedStyle(document.getElementById('page-row')).display,
  }));
  assert.deepEqual(style, { padding: '50px', display: 'block' });
});

test('the console tab is named after the project, then performance, then the groups', async () => {
  await fresh();
  await openDrawer(page);
  assert.deepEqual(await page.locator('.term-tab').allTextContents(), ['fixture', 'performance', 'hero', 'scene']);
  assert.equal(await page.locator('.term-prompt span').textContent(), 'fixture $');
});

test('a number row updates a read', async () => {
  await fresh();
  await openDrawer(page);
  await tab('hero').click();
  await page.locator('[role=slider][aria-label="hero.overlay"]').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await read('hero-overlay'), '0.41');
  await page.keyboard.press('Shift+ArrowLeft');
  assert.equal(await read('hero-overlay'), '0.31');
  await page.keyboard.press('Delete');
  assert.equal(await read('hero-overlay'), '0.4');
});

test('dragging a number row sets the value from the pointer', async () => {
  await fresh();
  await openDrawer(page);
  await tab('hero').click();
  await page.waitForTimeout(300);
  const bar = page.locator('[role=slider][aria-label="hero.overlay"]');
  const box = await bar.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  assert.equal(await read('hero-overlay'), '0.5');
});

test('a toggle row updates a read', async () => {
  await fresh();
  await openDrawer(page);
  await tab('hero').click();
  const toggle = page.locator('button[aria-label="hero.badge"]');
  assert.equal(await toggle.textContent(), 'on');
  await toggle.click();
  assert.equal(await toggle.textContent(), 'off');
  assert.equal(await read('hero-badge'), '0');
});

test('a select row is a native select and updates a read', async () => {
  await fresh();
  await openDrawer(page);
  await tab('hero').click();
  const select = page.locator('select[aria-label="hero.variant"]');
  assert.equal(await select.inputValue(), 'split');
  assert.deepEqual(await select.locator('option').allTextContents(), ['split', 'full', 'stacked']);
  await select.selectOption('stacked');
  assert.equal(await read('hero-variant'), 'stacked');
});

test('a text row is a single-line input and updates a read', async () => {
  await fresh();
  await openDrawer(page);
  await tab('hero').click();
  const field = page.locator('input[aria-label="hero.title"]');
  assert.equal(await field.getAttribute('type'), 'text');
  await field.fill('A new line = 2');
  assert.equal(await read('hero-title'), 'A new line = 2');
});

test('a color row is a native color input with its hex beside it', async () => {
  await fresh();
  await openDrawer(page);
  await tab('hero').click();
  const field = page.locator('input[aria-label="hero.accent"]');
  assert.equal(await field.getAttribute('type'), 'color');
  await field.fill('#112233');
  assert.equal(await read('hero-accent'), '#112233');
  assert.equal(await page.locator('[data-path="hero.accent"] .term-value').textContent(), '#112233');
});

test('a value set at the prompt shows in its row', async () => {
  await fresh();
  await openDrawer(page);
  await type(page, 'hero.title Typed at the prompt');
  await tab('hero').click();
  assert.equal(await page.locator('input[aria-label="hero.title"]').inputValue(), 'Typed at the prompt');
});

test('a text value at the prompt is the rest of the line', async () => {
  await fresh();
  await openDrawer(page);
  await type(page, 'hero.title a = b  12');
  assert.equal(await read('hero-title'), 'a = b  12');
});

test('a value that does not validate is refused at the prompt', async () => {
  await fresh();
  await openDrawer(page);
  await type(page, 'hero.variant nope');
  assert.match(await logText(page), /hero\.variant: invalid value: nope/);
  await type(page, 'hero.accent red');
  assert.match(await logText(page), /hero\.accent: invalid value: red/);
  assert.equal(await read('hero-variant'), 'split');
});

test('numbers clamp and += works at the prompt', async () => {
  await fresh();
  await openDrawer(page);
  await type(page, 'hero.overlay 3');
  assert.match(await logText(page), /hero\.overlay = 1\.00 {2}\(clamped to 0\.\.1\)/);
  await type(page, 'hero.overlay -= .5');
  assert.equal(await read('hero-overlay'), '0.5');
});

test('a hidden group has no tab and opens with on', async () => {
  await fresh();
  await openDrawer(page);
  assert.equal(await tab('product').count(), 0);
  await type(page, 'on product');
  assert.equal(await page.locator('[role=slider][aria-label="product.price"]').count(), 1);
  assert.equal(await tab('product').count(), 0);
});

test('labels you can act on are yellow and instrument labels are light grey', async () => {
  await fresh();
  await openDrawer(page);
  await page.locator('.term-tab').nth(1).click();
  await page.locator('.perf-key').first().waitFor();
  const colors = await page.evaluate(() => {
    const root = document.querySelector('[data-knobs]').shadowRoot;
    return { tab: getComputedStyle(root.querySelectorAll('.term-tab')[2]).color, perf: getComputedStyle(root.querySelector('.perf-key')).color };
  });
  assert.deepEqual(colors, { tab: 'rgb(232, 197, 71)', perf: 'rgb(216, 225, 232)' });
  assert.deepEqual(errors, []);
});
PLAN_EOF
cat > tests/unit/index.test.mjs <<'PLAN_EOF'
import test from 'node:test';
import assert from 'node:assert/strict';
import * as knobs from '../../src/index.js';

test('the main entry exports exactly the public names', () => {
  assert.deepEqual(Object.keys(knobs).sort(), ['canvasVisual', 'defineControls', 'fit', 'makePen', 'mountKnobs', 'pixels', 'trace']);
});

test('mountKnobs with no window is an error', () => {
  const store = knobs.defineControls([]);
  assert.throws(() => knobs.mountKnobs(store, { name: 'x' }), /needs a browser/);
});

test('mountKnobs needs a name', t => {
  globalThis.window = {};
  t.after(() => { delete globalThis.window; });
  assert.throws(() => knobs.mountKnobs(knobs.defineControls([]), {}), /needs a name/);
});
PLAN_EOF
cat > tests/unit/instruments.test.mjs <<'PLAN_EOF'
import test from 'node:test';
import assert from 'node:assert/strict';
import { fit, trace } from '../../src/instruments.js';

test('fit centres a rectangle in a panel, y up', () => {
  const map = fit([0, 10, 0, 10], 200, 0, 100);
  assert.equal(map.k, 10);
  assert.equal(map.x(0), 50);
  assert.equal(map.x(10), 150);
  assert.equal(map.y(10), 0);
  assert.equal(map.y(0), 100);
});

test('trace draws one line and breaks it at a gap', () => {
  const history = trace();
  for (const t of [0, 0.2, 0.4, 5, 5.2]) history.add(t, 0.5);
  const lines = [];
  history.draw({ plot: points => lines.push(points) }, 5.2, 300, 0, 100, 0);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].length, 3);
  assert.equal(lines[1].length, 2);
  assert.deepEqual(lines[1][1], [300, 50]);
});

test('trace ignores samples closer than a tenth of a second and forgets after 30 seconds', () => {
  const history = trace();
  history.add(0, 1);
  history.add(0.05, 1);
  history.add(0.2, 1);
  const lines = [];
  history.draw({ plot: points => lines.push(points) }, 0.2, 300, 0, 100, 0);
  assert.equal(lines[0].length, 2);
  history.add(31, 1);
  history.add(31.2, 1);
  lines.length = 0;
  history.draw({ plot: points => lines.push(points) }, 31.2, 300, 0, 100, 0);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].length, 2);
});
PLAN_EOF
cat > tests/fixtures/plain/index.html <<'PLAN_EOF'
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>knobs fixture</title>
    <link rel="icon" href="data:,">
    <link rel="stylesheet" href="/hostile.css">
  </head>
  <body>
    <button id="page-button" type="button">page button</button>
    <div class="term-row" id="page-row">page row</div>
    <input id="page-input">
    <textarea id="page-textarea"></textarea>
    <div id="page-editable" contenteditable="true">edit me</div>
    <output id="read-hero-variant"></output>
    <output id="read-hero-title"></output>
    <output id="read-hero-overlay"></output>
    <output id="read-hero-badge"></output>
    <output id="read-hero-accent"></output>
    <output id="read-listener"></output>
    <script type="module" src="/main.js"></script>
  </body>
</html>
PLAN_EOF
cat > tests/fixtures/plain/hostile.css <<'PLAN_EOF'
:root { --term-act: rgb(255, 0, 0); --term-fg: rgb(255, 0, 0); }
* { color: rgb(255, 0, 0) !important; font-size: 40px !important; }
button { padding: 50px; }
.term-key, .term-tab { display: none !important; }
body { letter-spacing: 9px; text-transform: uppercase; }
[data-knobs] { opacity: 0.1 !important; }
PLAN_EOF
cat > tests/fixtures/plain/controls.js <<'PLAN_EOF'
import { defineControls } from 'knobs';
import values from './knobs.values.json';

export const knobs = defineControls([
  { name: 'hero', about: 'Homepage hero', controls: [
    { key: 'variant', type: 'select', value: 'split', options: ['split', 'full', 'stacked'] },
    { key: 'title', type: 'text', value: 'The original headline' },
    { key: 'overlay', type: 'number', value: 0.4, min: 0, max: 1, step: 0.01 },
    { key: 'badge', type: 'toggle', value: 1 },
    { key: 'accent', type: 'color', value: '#e8c547' },
  ] },
  { name: 'scene', about: 'Has a custom picture', controls: [
    { key: 'speed', type: 'number', value: 1, min: 0, max: 5, step: 0.5 },
  ] },
  { name: 'product', hidden: true, controls: [
    { key: 'price', type: 'number', value: 10, min: 0, max: 100, step: 1 },
  ] },
], values);
export const { control, onControl } = knobs;
PLAN_EOF
cat > tests/fixtures/plain/knobs.values.json <<'PLAN_EOF'
{}
PLAN_EOF
cat > tests/fixtures/plain/main.js <<'PLAN_EOF'
import { canvasVisual, mountKnobs } from 'knobs';
import { knobs, control, onControl } from './controls.js';

// Accepting updates here means only the plugin can turn an edit into a full reload.
if (import.meta.hot) import.meta.hot.accept();

window.__boots = Number(sessionStorage.getItem('boots') ?? 0) + 1;
sessionStorage.setItem('boots', window.__boots);
const params = new URLSearchParams(location.search);
const paths = ['hero.variant', 'hero.title', 'hero.overlay', 'hero.badge', 'hero.accent'];
const show = path => { document.getElementById(`read-${path.replace('.', '-')}`).textContent = String(control(path)); };
for (const path of paths) { show(path); onControl(path, () => show(path)); }
onControl('hero.title', value => { document.getElementById('read-listener').textContent = value; });

window.__frames = 0;
const options = {
  name: 'fixture',
  commands: { ping: { usage: '[word]', about: 'answers pong', run: ([word]) => `pong ${word ?? ''}`.trim() } },
  status: () => 'status-ok',
  onFocus: state => { window.__focus = state; },
  extras: { get: () => ({ extra: 'kept' }), set: data => { window.__extras = data.extra; } },
  visuals: {
    scene: canvasVisual('A test picture', () => pen => { window.__frames++; window.__pen = { fg: pen.fg, dim: pen.dim }; }),
  },
};
if (params.has('stats')) options.stats = () => ({ renderer: 'test renderer', scene: 'test scene' });
const mount = () => mountKnobs(knobs, options);
window.__unmount = mount();
window.__mount = () => { window.__unmount = mount(); };
PLAN_EOF
```

```bash red
node --test tests/unit/index.test.mjs
```

```expected
src/index.js' imported from
```

```bash red
node --test tests/unit/instruments.test.mjs
```

```expected
src/instruments.js' imported from
```

```bash red
node --test tests/browser/drawer.test.mjs
```

```expected
src/drawer.js' imported from
```

**Implementation.** Port `terminal.js` from the frozen source into `src/drawer.js`, taking the store as an argument in place of the `params` import and using `name` for the prompt, greeting, console tab, file names and every storage key (`<name>:values`, `<name>:groups`, `<name>:drawer`). Throw `knobs: mountKnobs needs a browser` with no `window`, before anything else, and `knobs: mountKnobs needs a name` with no name. Append a host `div` to `document.body`, attach an open shadow root, and put a `style` element and the drawer inside it. Call `store.attach(localStorage, ...)` at mount. Never set a class on `body`. Drop the `term-strip` handle.

`src/style.js` exports the stylesheet as a string named `css`, ported from the drawer rules in the frozen `style.css`. The `:host` rule needs `all: initial !important` and then `display`, `position: fixed`, `inset` and `z-index: 2147483647`, each `!important`: a page rule such as `* { color: red !important }` matches the host, and only an important rule from inside the shadow tree beats it. It also defines the `--term-*` properties, `--drawer`, `--pad` and a generic `--mono` stack on the host, and carries its own `button` and `input, select` resets. `.term` has `position: relative`; it has no height of its own, so visibility is judged on `.term-drawer`.

Add rows for `select` (native), `text` (`type=text`, set on `input`) and `color` (native, set on `input`, hex in `.term-value`), and have `update` write a field's value only when it differs. Replace `resolve`, `run` and `setCommand` with `parseLine` and `coerce`: an invalid value prints `<path>: invalid value: <value>` in the error style, and a clamped number keeps today's `(clamped to min..max)` note. Tabs are the console, then `performance`, then any `pages`, then each group not `hidden`. `on <group>` works for a hidden group.

`src/instruments.js` carries `makePen`, `canvasVisual`, `pixels`, `trace` and `fit` from the frozen `viz.js`, with the `TRACE` constant, unchanged. `src/performance.js` is a page named `performance`, with `fps` measured from its own frame loop and `memory` rows. Its `show` and `hide` start and stop the loop, and `destroy` cancels it. Rows from `stats()` are added after those two.

**Check:** `node --test tests/unit/index.test.mjs tests/unit/instruments.test.mjs` passes 6, and the browser check job for `tests/browser/drawer.test.mjs` passes 16.

**Commit:** `feat(drawer): mount the drawer in a shadow DOM`

### Task 5: keys, storage and commands

**Files:** edit `src/drawer.js`; create `tests/browser/commands.test.mjs`.

```bash apply
mkdir -p tests/browser
cat > tests/browser/commands.test.mjs <<'PLAN_EOF'
import '../../src/drawer.js';
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { collectErrors, copyFixture, launch, newPage, logText, openDrawer, serve, type } from './lib/harness.mjs';

let fixture, site, browser, page, errors;

before(async () => {
  fixture = await copyFixture('plain');
  site = await serve(fixture.root);
  browser = await launch();
});
after(async () => {
  await browser?.close();
  await site?.close();
  await fixture?.remove();
});

async function fresh() {
  await page?.context().close();
  page = await newPage(browser);
  errors = collectErrors(page);
  await page.goto(site.url);
  await page.locator('[data-knobs]').waitFor({ state: 'attached' });
}
const isOpen = () => page.locator('.term.open').count().then(Boolean);
const read = id => page.locator(`#read-${id}`).textContent();

test('backtick toggles the drawer', async () => {
  await fresh();
  await page.keyboard.press('Backquote');
  assert.equal(await isOpen(), true);
  await page.locator('.term-prompt input').blur();
  await page.waitForTimeout(250);
  await page.locator('.term-prompt input').blur();
  await page.keyboard.press('Backquote');
  assert.equal(await isOpen(), false);
});

for (const id of ['page-input', 'page-textarea', 'page-editable']) {
  test(`backtick and tilde are ignored while typing in #${id}`, async () => {
    await fresh();
    await page.locator(`#${id}`).click();
    await page.keyboard.press('Backquote');
    await page.keyboard.press('Shift+Backquote');
    assert.equal(await isOpen(), false);
    const text = await page.locator(`#${id}`).evaluate(node => node.value ?? node.textContent);
    assert.match(text, /`~/);
  });
}

test('backtick is ignored while typing in a text control and at the prompt', async () => {
  await fresh();
  await openDrawer(page);
  await page.locator('.term-tab', { hasText: /^hero$/ }).click();
  const field = page.locator('input[aria-label="hero.title"]');
  await field.fill('');
  await field.press('Backquote');
  assert.equal(await isOpen(), true);
  assert.equal(await field.inputValue(), '`');
  await page.locator('.term-tab', { hasText: /^fixture$/ }).click();
  const prompt = page.locator('.term-prompt input');
  await prompt.press('Backquote');
  assert.equal(await isOpen(), true);
  assert.equal(await prompt.inputValue(), '`');
});

test('Escape closes the drawer from the prompt', async () => {
  await fresh();
  await openDrawer(page);
  await page.locator('.term-prompt input').press('Escape');
  assert.equal(await isOpen(), false);
});

test('tilde opens the performance tab, and closes it again', async () => {
  await fresh();
  await page.keyboard.press('Shift+Backquote');
  assert.equal(await isOpen(), true);
  assert.equal(await page.locator('.term').getAttribute('data-view'), 'performance');
  await page.keyboard.press('Shift+Backquote');
  assert.equal(await isOpen(), false);
});

test('onFocus reports the drawer and the showing group', async () => {
  await fresh();
  await openDrawer(page);
  assert.deepEqual(await page.evaluate(() => window.__focus), { open: true, groups: [] });
  await page.locator('.term-tab', { hasText: /^hero$/ }).click();
  assert.deepEqual(await page.evaluate(() => window.__focus), { open: true, groups: ['hero'] });
});

test('saved values survive a reload, under the project\'s name', async () => {
  await fresh();
  await openDrawer(page);
  await type(page, 'hero.title Kept across reloads');
  await type(page, 'hero.variant full');
  await page.reload();
  await page.locator('[data-knobs]').waitFor({ state: 'attached' });
  assert.equal(await read('hero-title'), 'Kept across reloads');
  assert.equal(await read('hero-variant'), 'full');
  const keys = await page.evaluate(() => Object.keys(localStorage));
  assert.deepEqual(keys, ['fixture:values']);
});

test('the open drawer and tab survive a reload', async () => {
  await fresh();
  await openDrawer(page);
  await page.locator('.term-tab', { hasText: /^scene$/ }).click();
  await page.reload();
  await page.locator('.term.open .term-drawer').waitFor();
  await page.locator('.term-tab', { hasText: /^fixture$/ }).click();
  await page.locator('.term-tab', { hasText: /^performance$/ }).click();
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('fixture:groups'))), ['scene']);
});

test('mountKnobs restores saved values and notifies a listener already subscribed', async () => {
  await fresh();
  await openDrawer(page);
  await type(page, 'hero.title Restored');
  await page.reload();
  await page.locator('[data-knobs]').waitFor({ state: 'attached' });
  assert.equal(await page.locator('#read-listener').textContent(), 'Restored');
});

test('unmounting removes the drawer and its key listener', async () => {
  await fresh();
  await page.evaluate(() => { window.__unmount(); window.__focus = 'untouched'; });
  assert.equal(await page.locator('[data-knobs]').count(), 0);
  await page.keyboard.press('Backquote');
  assert.equal(await page.evaluate(() => window.__focus), 'untouched');
  assert.deepEqual(errors, []);
});

test('mount, unmount, mount leaves one working drawer', async () => {
  await fresh();
  await page.evaluate(() => { window.__unmount(); window.__mount(); });
  assert.equal(await page.locator('[data-knobs]').count(), 1);
  await page.keyboard.press('Backquote');
  assert.equal(await isOpen(), true);
  await type(page, 'hero.title Second mount');
  assert.equal(await read('hero-title'), 'Second mount');
});

test('help names the built-ins and project commands, and not wings-vdb', async () => {
  await fresh();
  await openDrawer(page);
  await type(page, 'help');
  const text = await logText(page);
  for (const word of ['ls [group]', 'get <control>', 'set <control>', 'reset [control|group]', 'on <group>', 'save', 'download [name]', 'load', 'export', 'import <json>', 'clear', 'close', 'ping [word]']) assert.ok(text.includes(word), word);
  assert.doesNotMatch(text, /wings-vdb|\/shot|cycles the view/);
});

test('ls and get describe every type', async () => {
  await fresh();
  await openDrawer(page);
  await type(page, 'ls hero');
  await type(page, 'get hero.title');
  const text = await logText(page);
  assert.match(text, /# hero: Homepage hero/);
  assert.match(text, /variant +split +\[split full stacked\]/);
  assert.match(text, /overlay +0\.40 +\[0\.\.1\]/);
  assert.match(text, /hero\.title = The original headline {2}\(default The original headline\)/);
});

test('reset takes a control, a group or nothing', async () => {
  await fresh();
  await openDrawer(page);
  await type(page, 'hero.title Changed');
  await type(page, 'reset hero.title');
  assert.equal(await read('hero-title'), 'The original headline');
  await type(page, 'hero.overlay 0.9');
  await type(page, 'reset hero');
  assert.equal(await read('hero-overlay'), '0.4');
  await type(page, 'hero.badge off');
  await type(page, 'reset');
  assert.equal(await read('hero-badge'), '1');
});

test('export prints only what changed, and import keeps text exactly', async () => {
  await fresh();
  await openDrawer(page);
  await type(page, 'hero.overlay 0.9');
  await type(page, 'export');
  assert.match(await logText(page), /\{\s+"hero\.overlay": 0\.9\s+\}/);
  await type(page, 'import {"hero.title":"a   b"}');
  assert.equal(await read('hero-title'), 'a   b');
});

test('the / menu lists the built-in actions and project commands', async () => {
  await fresh();
  await openDrawer(page);
  await page.locator('.term-prompt input').fill('/');
  assert.deepEqual(await page.locator('.term-slash-name').allTextContents(), ['/save', '/download', '/load', '/reset', '/ping']);
});

test('a project command runs at the prompt', async () => {
  await fresh();
  await openDrawer(page);
  await type(page, 'ping there');
  assert.match(await logText(page), /pong there/);
});

test('the status line shows the project\'s status', async () => {
  await fresh();
  await openDrawer(page);
  await page.waitForFunction(() => document.querySelector('[data-knobs]').shadowRoot.querySelector('.term-status').textContent === 'status-ok');
});

test('download saves a JSON file, and load reads it back', async () => {
  await fresh();
  await openDrawer(page);
  await type(page, 'hero.title Downloaded');
  const [download] = await Promise.all([page.waitForEvent('download'), type(page, 'download my file')]);
  assert.match(download.suggestedFilename(), /^my-\d{8}-\d{4}\.json$/);
  const data = JSON.parse(await readFile(await download.path(), 'utf8'));
  assert.equal(data.app, 'fixture');
  assert.deepEqual(data.values, { 'hero.title': 'Downloaded' });
  assert.equal(data.extra, 'kept');
  await type(page, 'reset');
  await page.locator('.term-file').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
  await page.waitForFunction(() => document.getElementById('read-hero-title').textContent === 'Downloaded');
  assert.equal(await page.evaluate(() => window.__extras), 'kept');
});

test('save without the plugin says so', async () => {
  await fresh();
  await openDrawer(page);
  await type(page, 'save');
  await page.waitForFunction(() => document.querySelector('[data-knobs]').shadowRoot.querySelector('.term-log').textContent.includes('save needs the knobs Vite plugin'));
});
PLAN_EOF
```

```bash red
node --test tests/browser/commands.test.mjs
```

```expected
src/drawer.js' imported from
```

Once Task 4 is built, this file runs and the tests for what is still missing fail by name. Some may pass at once.

**Implementation.** One `keydown` listener on `window`. Escape closes an open drawer from anywhere. For backtick and `~`, do nothing with Ctrl or Meta held, or when `event.composedPath()[0]` is an editable field (decision 9); `event.target` is retargeted to the host and must not be used. `~` opens `performance`, or closes the drawer if it is already showing. Use `shadow.activeElement` where the source used `document.activeElement`.

Built-ins are `help`, `ls`, `get`, `reset`, `on`, `save`, `download [name]`, `load`, `export`, `import`, `clear` and `close`, plus `set` through the parser. `help` leaves out `/shot` and the `v` line. `import` parses the parser's `rest`, never the joined `args`, or it would collapse spaces inside a text value. `export` prints and copies `store.changed()`. `download` is the frozen source's `saveConfig`, with `values` from `store.changed()` and the anchor appended inside the shadow root. `load` keeps `extras.set`. `save` POSTs `{ values: store.changed() }` as JSON to `/__knobs/save` and prints `saved <n> values to knobs.values.json`; a 404 prints `save needs the knobs Vite plugin; use export`, and any other failure prints the server's `error`. The `/` menu lists `save`, `download`, `load` and `reset`, then each entry of `commands`.

Keep every other behaviour of the frozen source: history, tab completion, the slash menu's keys, double-click reset, the click-to-focus rule, the saved open state and group.

`unmount` clears the interval and focus timer, cancels frame loops, removes the `window` and media query listeners and the store subscription, calls each page's and visual's `destroy`, calls `store.detach()`, and removes the host.

**Check:** the browser check job for `tests/browser/commands.test.mjs` passes 22.

**Commit:** `feat(drawer): add keys, storage and commands`

### Task 6: the instrument side

**Files:** edit `src/drawer.js`, `src/performance.js`; create `tests/browser/instruments.test.mjs`.

```bash apply
mkdir -p tests/browser
cat > tests/browser/instruments.test.mjs <<'PLAN_EOF'
import '../../src/instruments.js';
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { collectErrors, copyFixture, launch, newPage, openDrawer, serve, type } from './lib/harness.mjs';

let fixture, site, browser, page, errors;

before(async () => {
  fixture = await copyFixture('plain');
  site = await serve(fixture.root);
  browser = await launch();
});
after(async () => {
  await browser?.close();
  await site?.close();
  await fixture?.remove();
});

async function fresh(query = '') {
  await page?.context().close();
  page = await newPage(browser);
  errors = collectErrors(page);
  await page.goto(site.url + query);
  await page.locator('[data-knobs]').waitFor({ state: 'attached' });
}
const tab = name => page.locator('.term-tab', { hasText: new RegExp(`^${name}$`) });

test('a tab with no picture shows what changed, live', async () => {
  await fresh();
  await openDrawer(page);
  await tab('hero').click();
  assert.equal(await page.locator('.term-viz').innerText(), 'nothing changed');
  await page.locator('button[aria-label="hero.badge"]').click();
  await page.locator('input[aria-label="hero.title"]').fill('New');
  const lines = await page.locator('.term-changes-line').allTextContents();
  assert.deepEqual(lines, ['title  The original headline → New', 'badge  on → off']);
  await page.locator('input[aria-label="hero.title"]').fill('The original headline');
  assert.deepEqual(await page.locator('.term-changes-line').allTextContents(), ['badge  on → off']);
});

test('the changed list ignores other groups', async () => {
  await fresh();
  await openDrawer(page);
  await type(page, 'product.price 50');
  await tab('hero').click();
  assert.equal(await page.locator('.term-viz').innerText(), 'nothing changed');
});

test('a custom picture draws only while its tab shows, inside the shadow root', async () => {
  await fresh();
  assert.equal(await page.evaluate(() => window.__frames), 0);
  await openDrawer(page);
  await tab('scene').click();
  await page.waitForFunction(() => window.__frames > 2);
  assert.equal(await page.locator('canvas.viz-chart').count(), 1);
  assert.deepEqual(await page.evaluate(() => window.__pen), { fg: '#d8e1e8', dim: '#7d8b96' });
  await tab('hero').click();
  await page.waitForTimeout(200);
  const before = await page.evaluate(() => window.__frames);
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => window.__frames), before);
  assert.equal(await page.locator('canvas.viz-chart').count(), 0);
});

test('performance shows frame rate and memory, and no renderer rows by default', async () => {
  await fresh();
  await page.keyboard.press('Shift+Backquote');
  await page.waitForFunction(() => Number(document.querySelector('[data-knobs]').shadowRoot.querySelector('.perf-value')?.textContent) > 0);
  assert.deepEqual(await page.locator('.perf-key').allTextContents(), ['fps', 'memory']);
  assert.deepEqual(errors, []);
});

test('performance adds rows the project supplies through stats', async () => {
  await fresh('?stats=1');
  await page.keyboard.press('Shift+Backquote');
  await page.locator('.perf-key', { hasText: 'renderer' }).waitFor();
  assert.deepEqual(await page.locator('.perf-key').allTextContents(), ['fps', 'memory', 'renderer', 'scene']);
  assert.equal(await page.locator('.perf-value').nth(2).textContent(), 'test renderer');
});

test('performance stops sampling when it is not showing', async () => {
  await fresh();
  await page.evaluate(() => {
    window.__raf = 0;
    const real = window.requestAnimationFrame;
    window.requestAnimationFrame = fn => { window.__raf++; return real(fn); };
  });
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.__raf), 0);
});
PLAN_EOF
```

```bash red
node --test tests/browser/instruments.test.mjs
```

```expected
src/instruments.js' imported from
```

**Implementation.** Each params tab's right side shows `visuals[group]` if the project gave one, otherwise a default panel. The panel lists every control in that group whose value differs from its default, one `.term-changes-line` each, as `<key>  <original> → <current>` with two spaces after the key, or `nothing changed` when there are none. It redraws from a store subscription limited to its group and stops on `destroy`. Only the showing tab's panel exists. It is hidden below 761 px, as the picture is today. A picture's `frame` runs only while its tab shows in an open drawer. The performance loop runs only while its tab shows.

**Check:** the check job for the whole browser suite passes 44, and `npm run test:unit` passes 108. `grep -rn "wings-vdb" src/` prints nothing.

**Commit:** `feat(drawer): add the changed list and performance page`

### Task 7: the save endpoint

**Files:** create `src/save-endpoint.js`, `tests/unit/endpoint.test.mjs`.

**Interfaces.** `SAVE_ROUTE` is `/__knobs/save`, `VALUES_FILE` is `knobs.values.json`, and `createSaveHandler({ root, loadStore, origins = [], limit = 1000000 })` returns `async (req, res)`. `loadStore` resolves to a store.

```bash apply
mkdir -p tests/unit
cat > tests/unit/endpoint.test.mjs <<'PLAN_EOF'
import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { request, createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSaveHandler, SAVE_ROUTE, VALUES_FILE } from '../../src/save-endpoint.js';
import { defineControls } from '../../src/store.js';

const store = defineControls([{ name: 'hero', controls: [
  { key: 'variant', type: 'select', value: 'split', options: ['split', 'full'] },
  { key: 'title', type: 'text', value: 'Original' },
  { key: 'overlay', type: 'number', value: 0.4, min: 0, max: 1, step: 0.01 },
] }]);
const PUBLIC = 'https://proto.example.test';
const BEFORE = '{"untouched":true}\n';
let root, server, port, file;

before(async () => {
  root = mkdtempSync(join(tmpdir(), 'knobs-endpoint-'));
  file = join(root, VALUES_FILE);
  const handle = createSaveHandler({ root, loadStore: async () => store, origins: [PUBLIC], limit: 2000 });
  server = createServer(handle);
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  port = server.address().port;
});
after(async () => {
  await new Promise(done => server.close(done));
  rmSync(root, { recursive: true, force: true });
});
beforeEach(() => writeFileSync(file, BEFORE));

function post({ body = JSON.stringify({ values: {} }), headers = {}, method = 'POST' } = {}) {
  const host = `127.0.0.1:${port}`;
  const all = { host, origin: `http://${host}`, 'content-type': 'application/json', ...headers };
  for (const key of Object.keys(all)) if (all[key] === null) delete all[key];
  return new Promise((done, fail) => {
    const req = request({ host: '127.0.0.1', port, method, path: SAVE_ROUTE, headers: all }, res => {
      let text = '';
      res.on('data', chunk => { text += chunk; });
      res.on('end', () => done({ status: res.statusCode, json: JSON.parse(text) }));
    });
    req.on('error', fail);
    req.end(method === 'POST' ? body : undefined);
  });
}
const values = v => JSON.stringify({ values: v });
const unchanged = () => assert.equal(readFileSync(file, 'utf8'), BEFORE);

test('the route and file name are fixed', () => {
  assert.equal(SAVE_ROUTE, '/__knobs/save');
  assert.equal(VALUES_FILE, 'knobs.values.json');
});

test('it keeps only values that differ from the defaults', async () => {
  const res = await post({ body: values({ 'hero.title': 'New words', 'hero.variant': 'split', 'hero.overlay': 0.5 }) });
  assert.deepEqual(res, { status: 200, json: { saved: 2 } });
  assert.equal(readFileSync(file, 'utf8'), '{\n  "hero.overlay": 0.5,\n  "hero.title": "New words"\n}\n');
});

test('nothing changed writes an empty object', async () => {
  const res = await post({ body: values({}) });
  assert.equal(res.status, 200);
  assert.equal(readFileSync(file, 'utf8'), '{}\n');
});

test('it writes only the fixed path, whatever the body says', async () => {
  await post({ body: JSON.stringify({ values: {}, path: '../evil.json', file: '../evil.json' }) });
  assert.equal(existsSync(join(root, '..', 'evil.json')), false);
});

test('it leaves no temporary file behind', async () => {
  await post({ body: values({ 'hero.title': 'x' }) });
  const { readdirSync } = await import('node:fs');
  assert.deepEqual(readdirSync(root), [VALUES_FILE]);
});

for (const [name, options, status] of [
  ['a GET', { method: 'GET' }, 405],
  ['a wrong content type', { headers: { 'content-type': 'text/plain' } }, 415],
  ['a form content type', { headers: { 'content-type': 'application/x-www-form-urlencoded' } }, 415],
  ['no content type', { headers: { 'content-type': null } }, 415],
  ['an unrelated origin', { headers: { origin: 'https://evil.example.test' } }, 403],
  ['no origin', { headers: { origin: null } }, 403],
  ['a null origin', { headers: { origin: 'null' } }, 403],
  ['a forwarded host that matches the origin', { headers: { origin: 'https://evil.example.test', 'x-forwarded-host': 'evil.example.test' } }, 403],
  ['an unknown path', { body: values({ 'hero.nope': 1 }) }, 422],
  ['a select value not in its options', { body: values({ 'hero.variant': 'gone' }) }, 422],
  ['a number out of range', { body: values({ 'hero.overlay': 2 }) }, 422],
  ['a number off its step', { body: values({ 'hero.overlay': 0.123 }) }, 422],
  ['a string for a number', { body: values({ 'hero.overlay': '0.5' }) }, 422],
  ['one bad value among good ones', { body: values({ 'hero.title': 'fine', 'hero.nope': 1 }) }, 422],
  ['a body that is not JSON', { body: '{nope' }, 400],
  ['a body with no values', { body: '{}' }, 400],
  ['values that are an array', { body: JSON.stringify({ values: [] }) }, 400],
  ['an oversized body', { body: values({ 'hero.title': 'x'.repeat(3000) }) }, 413],
]) test(`it refuses ${name} and leaves the file unchanged`, async () => {
  const res = await post(options);
  assert.equal(res.status, status);
  assert.equal(typeof res.json.error, 'string');
  unchanged();
});

test('it accepts a charset on the content type', async () => {
  const res = await post({ headers: { 'content-type': 'application/json; charset=utf-8' } });
  assert.equal(res.status, 200);
});

test('it accepts a listed public origin when Host differs', async () => {
  const res = await post({ headers: { origin: PUBLIC, host: 'internal.local:9999' }, body: values({ 'hero.title': 'Proxied' }) });
  assert.equal(res.status, 200);
  assert.match(readFileSync(file, 'utf8'), /Proxied/);
});

test('an origin whose host matches Host is allowed on any scheme', async () => {
  const res = await post({ headers: { origin: `https://127.0.0.1:${port}` } });
  assert.equal(res.status, 200);
});

test('a schema that cannot be loaded is a 500 and leaves the file unchanged', async () => {
  const broken = createServer(createSaveHandler({ root, loadStore: async () => { throw new Error('broken controls'); } }));
  await new Promise(done => broken.listen(0, '127.0.0.1', done));
  const p = broken.address().port;
  const status = await new Promise((done, fail) => {
    const req = request({ host: '127.0.0.1', port: p, method: 'POST', path: SAVE_ROUTE, headers: { origin: `http://127.0.0.1:${p}`, 'content-type': 'application/json' } }, res => { res.resume(); res.on('end', () => done(res.statusCode)); });
    req.on('error', fail);
    req.end(values({}));
  });
  await new Promise(done => broken.close(done));
  assert.equal(status, 500);
  unchanged();
});
PLAN_EOF
```

```bash red
node --test tests/unit/endpoint.test.mjs
```

```expected
src/save-endpoint.js' imported from
```

**Implementation.** Check in this order, answering JSON with an `error` string: not POST is 405; a content type other than `application/json`, ignoring parameters and case, is 415; an origin that is missing, unparsable, or neither matching `Host` by host nor listed in `origins` by origin is 403. Forwarded headers are never read. Read the body up to `limit`, answering 413 once it has ended if it went over. JSON that does not parse, or `values` that is missing, not an object, or an array, is 400. Call `loadStore`; any failure is 500. Each path must be in `store.byPath` and `normalize` must return the identical value, or the answer is 422 and nothing is written. Keep values that differ from the default, sorted by path. Write `JSON.stringify(kept, null, 2)` and a newline to a temporary file beside the target, rename it over `knobs.values.json`, and answer `{ saved: <count> }`.

**Check:** `node --test tests/unit/endpoint.test.mjs` passes 27.

**Commit:** `feat(vite): add the save endpoint`

### Task 8: the Vite plugin

**Files:** create `src/vite.js`, `src/react-stub.js`, `tests/unit/vite-plugin.test.mjs`, `tests/browser/vite.test.mjs`.

**Interfaces.** The default export `knobs({ controls, origins = [] })` returns a Vite plugin object with `name` `knobs`, `apply` `serve`, and the hooks `config`, `configResolved`, `configureServer` and `handleHotUpdate`. `src/react-stub.js` exports `bindReact`.

```bash apply
mkdir -p tests/browser tests/unit
cat > tests/unit/vite-plugin.test.mjs <<'PLAN_EOF'
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import knobs from '../../src/vite.js';

const repo = realpathSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..'));

// A project whose own copy of vite is a stub, so a test can tell whose copy ran.
function project(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'knobs-project-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'node_modules', 'vite'), { recursive: true });
  writeFileSync(join(root, 'package.json'), '{"name":"project"}');
  writeFileSync(join(root, 'node_modules', 'vite', 'package.json'), JSON.stringify({ name: 'vite', type: 'module', exports: { '.': { import: './stub.js' }, './package.json': './package.json' } }));
  writeFileSync(join(root, 'node_modules', 'vite', 'stub.js'), "export const searchForWorkspaceRoot = root => root + '/from-the-project';\nexport const runnerImport = async () => ({ module: {} });\n");
  return root;
}
function fakeServer() {
  const sent = [];
  return { sent, server: { ws: { send: message => sent.push(message) } } };
}

test('the controls path is required', () => {
  assert.throws(() => knobs(), /needs the controls file path/);
});

test('it runs only under the dev server', () => {
  const plugin = knobs({ controls: 'controls.js' });
  assert.equal(plugin.name, 'knobs');
  assert.equal(plugin.apply, 'serve');
});

test('its source never imports vite statically', () => {
  const source = readFileSync(join(repo, 'src', 'vite.js'), 'utf8');
  assert.doesNotMatch(source, /from\s+['"]vite['"]/);
});

test('it uses the project\'s copy of vite and restores workspace detection', async t => {
  const root = project(t);
  const config = await knobs({ controls: 'controls.js' }).config({ root });
  assert.deepEqual(config.server.fs.allow, [`${root}/from-the-project`, repo]);
});

test('it dedupes React', async t => {
  const config = await knobs({ controls: 'controls.js' }).config({ root: project(t) });
  assert.deepEqual(config.resolve.dedupe, ['react', 'react-dom']);
});

test('it adds nothing for server rendering or pre-bundling', async t => {
  const config = await knobs({ controls: 'controls.js' }).config({ root: project(t) });
  assert.equal(config.ssr, undefined);
  assert.equal(config.optimizeDeps, undefined);
});

for (const [name, file] of [
  ['the controls file', root => join(root, 'app', 'controls.ts')],
  ['the values file', root => join(root, 'knobs.values.json')],
  ['a file in the knobs checkout', () => join(repo, 'src', 'drawer.js')],
]) test(`a change to ${name} is a full reload`, async t => {
  const root = project(t);
  const plugin = knobs({ controls: 'app/controls.ts' });
  await plugin.config({ root });
  const { sent, server } = fakeServer();
  assert.deepEqual(plugin.handleHotUpdate({ file: file(root), server }), []);
  assert.deepEqual(sent, [{ type: 'full-reload' }]);
});

test('a change to any other file is left to Vite', async t => {
  const root = project(t);
  const plugin = knobs({ controls: 'controls.js' });
  await plugin.config({ root });
  const { sent, server } = fakeServer();
  assert.equal(plugin.handleHotUpdate({ file: join(root, 'src', 'App.jsx'), server }), undefined);
  assert.deepEqual(sent, []);
});

test('a sibling directory that only shares the knobs prefix is left to Vite', async t => {
  const root = project(t);
  const plugin = knobs({ controls: 'controls.js' });
  await plugin.config({ root });
  const { sent, server } = fakeServer();
  assert.equal(plugin.handleHotUpdate({ file: `${repo}-other/src/a.js`, server }), undefined);
  assert.deepEqual(sent, []);
});
PLAN_EOF
cat > tests/browser/vite.test.mjs <<'PLAN_EOF'
import '../../src/vite.js';
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { join } from 'node:path';
import knobs from '../../src/vite.js';
import { collectErrors, copyFixture, launch, newPage, openDrawer, serve, type } from './lib/harness.mjs';

let fixture, site, browser, page, errors;
const file = name => join(fixture.root, name);

before(async () => { browser = await launch(); });
after(async () => {
  await page?.context().close();
  await site?.close();
  await fixture?.remove();
  await browser?.close();
});

// Each test gets its own copy and server, so one test's file edits cannot
// reach the next test's page as a late reload.
async function fresh() {
  await page?.context().close();
  await site?.close();
  await fixture?.remove();
  fixture = await copyFixture('plain');
  writeFileSync(file('hostile.css'), '');
  site = await serve(fixture.root, { plugins: [knobs({ controls: 'controls.js' })] });
  page = await newPage(browser);
  errors = collectErrors(page);
  await page.goto(site.url);
  await page.locator('[data-knobs]').waitFor({ state: 'attached' });
}
const waitForBoot = n => page.waitForFunction(count => window.__boots === count, n);
const read = id => page.locator(`#read-${id}`).textContent();
const values = () => JSON.parse(readFileSync(file('knobs.values.json'), 'utf8'));

function post(body) {
  return new Promise((done, fail) => {
    const req = request({ host: '127.0.0.1', port: site.port, method: 'POST', path: '/__knobs/save', headers: { origin: site.url.slice(0, -1), 'content-type': 'application/json' } }, res => {
      res.resume();
      res.on('end', () => done(res.statusCode));
    });
    req.on('error', fail);
    req.end(JSON.stringify(body));
  });
}

test('save writes only the changed values and the page reloads with them', async () => {
  await fresh();
  await openDrawer(page);
  await type(page, 'hero.title Saved to the file');
  await type(page, 'hero.overlay 0.4');
  await type(page, 'save');
  await waitForBoot(2);
  assert.deepEqual(values(), { 'hero.title': 'Saved to the file' });
  await page.locator('[data-knobs]').waitFor({ state: 'attached' });
  assert.equal(await read('hero-title'), 'Saved to the file');
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('fixture:values'))), {});
  assert.deepEqual(errors, []);
});

test('editing the values file reloads the page and the new value shows', async () => {
  await fresh();
  writeFileSync(file('knobs.values.json'), '{ "hero.variant": "stacked" }\n');
  await waitForBoot(2);
  await page.waitForFunction(() => document.getElementById('read-hero-variant').textContent === 'stacked');
});

test('editing the controls file reloads the page and the drawer still drives it', async () => {
  await fresh();
  writeFileSync(file('controls.js'), readFileSync(file('controls.js'), 'utf8').replace('The original headline', 'An edited default'));
  await waitForBoot(2);
  await page.waitForFunction(() => document.getElementById('read-hero-title').textContent === 'An edited default');
  await page.locator('[data-knobs]').waitFor({ state: 'attached' });
  await openDrawer(page);
  await type(page, 'hero.title Still driven');
  assert.equal(await read('hero-title'), 'Still driven');
});

test('a save after a schema edit validates against the edited schema', async () => {
  await fresh();
  const original = readFileSync(file('controls.js'), 'utf8');
  assert.equal(await post({ values: { 'hero.variant': 'wide' } }), 422);
  writeFileSync(file('controls.js'), original.replace("'stacked']", "'stacked', 'wide']"));
  await waitForBoot(2);
  assert.equal(await post({ values: { 'hero.variant': 'wide' } }), 200);
  assert.deepEqual(values(), { 'hero.variant': 'wide' });
  await waitForBoot(3);
  writeFileSync(file('controls.js'), original);
  await waitForBoot(4);
  assert.equal(await post({ values: { 'hero.variant': 'wide' } }), 422);
});

test('the browser\'s copy of the schema is not trusted', async () => {
  await fresh();
  assert.equal(await post({ values: { 'made.up': 1 } }), 422);
  assert.deepEqual(values(), {});
});
PLAN_EOF
```

```bash red
node --test tests/unit/vite-plugin.test.mjs
```

```expected
src/vite.js' imported from
```

```bash red
node --test tests/browser/vite.test.mjs
```

```expected
src/vite.js' imported from
```

**Implementation.** Throw `knobs: the Vite plugin needs the controls file path` with no `controls`. There is no static import of `vite` (decision 2). In `config`, take the root from the user's config or the working directory, resolve `vite/package.json` with `createRequire` from the project root, read its `exports['.']` (a string, or an object's `import`, which may itself hold `default`), and import that file. Return `server.fs.allow` as the project copy's `searchForWorkspaceRoot(root)` plus the real path of this package's directory, and `resolve.dedupe` of `react` and `react-dom`. Return nothing for `ssr` or `optimizeDeps`.

`configureServer` mounts `createSaveHandler` on `SAVE_ROUTE`. Its `loadStore` calls the project copy's `runnerImport` on the controls file, fresh each time, with `configFile: false` and `logLevel: 'silent'`, the resolved config's aliases, and an alias placed first from `/^knobs\/react$/` to `src/react-stub.js` (decision 1). It throws if the module exports no `knobs` store.

`handleHotUpdate` sends `{ type: 'full-reload' }` and returns an empty list for the controls file, the values file, or a file under this package's directory, compared with a trailing separator so a sibling directory sharing the prefix does not match. Anything else returns undefined. `src/react-stub.js`'s `bindReact` returns a function that throws `knobs: useControl cannot run while the Vite plugin loads the schema`, and imports nothing.

**Check:** `npm run test:unit` passes 146, and the whole browser suite passes 49.

**Commit:** `feat(vite): add the plugin`

### Task 9: React reads and hydration

**Files:** create `src/react.js`, `tests/unit/react.test.mjs`, `tests/browser/ssr.test.mjs`, and the fixture `tests/fixtures/ssr/`.

**Interfaces.** `bindReact(store)` returns `useControl(path)`.

```bash apply
mkdir -p tests/browser tests/fixtures/ssr tests/unit
cat > tests/unit/react.test.mjs <<'PLAN_EOF'
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bindReact } from '../../src/react.js';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { defineControls } from '../../src/store.js';

const schema = [{ name: 'hero', controls: [{ key: 'title', type: 'text', value: 'Default' }] }];

test('useControl renders the default on the server', () => {
  const useControl = bindReact(defineControls(schema));
  const Title = () => h('h1', null, useControl('hero.title'));
  assert.equal(renderToString(h(Title)), '<h1>Default</h1>');
});

test('useControl renders the file value on the server', () => {
  const useControl = bindReact(defineControls(schema, { 'hero.title': 'From the file' }));
  const Title = () => h('h1', null, useControl('hero.title'));
  assert.equal(renderToString(h(Title)), '<h1>From the file</h1>');
});

test('the server snapshot ignores a saved value, whenever it arrived', t => {
  globalThis.window = {};
  t.after(() => { delete globalThis.window; });
  const store = defineControls(schema, { 'hero.title': 'From the file' });
  store.attach({ getItem: () => JSON.stringify({ 'hero.title': 'Saved' }), setItem() {} }, 'k');
  assert.equal(store.control('hero.title'), 'Saved');
  const useControl = bindReact(store);
  const Title = () => h('h1', null, useControl('hero.title'));
  assert.equal(renderToString(h(Title)), '<h1>From the file</h1>');
});

test('useControl throws on an unknown path', () => {
  const useControl = bindReact(defineControls(schema));
  const Title = () => h('h1', null, useControl('hero.nope'));
  assert.throws(() => renderToString(h(Title)), /unknown control: hero\.nope/);
});

test('only knobs/react imports React', () => {
  for (const name of ['index', 'store', 'console', 'drawer', 'instruments', 'performance', 'style', 'save-endpoint', 'vite', 'react-stub']) {
    const source = readFileSync(new URL(`../../src/${name}.js`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /from\s+['"]react/, name);
  }
});

test('the stub that stands in while the schema loads binds without React', async () => {
  const { bindReact: stub } = await import('../../src/react-stub.js');
  assert.throws(() => stub({})('hero.title'), /cannot run while the Vite plugin loads the schema/);
});
PLAN_EOF
cat > tests/browser/ssr.test.mjs <<'PLAN_EOF'
import '../../src/react.js';
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createServer as createHttp } from 'node:http';
import { createServer } from 'vite';
import { collectErrors, copyFixture, launch, newPage, openDrawer, type, viteConfig } from './lib/harness.mjs';

let fixture, vite, http, url, browser, page, errors;

before(async () => {
  fixture = await copyFixture('ssr');
  const base = viteConfig(fixture.root);
  vite = await createServer({ ...base, appType: 'custom', server: { ...base.server, middlewareMode: true, hmr: false, ws: false } });
  http = createHttp((req, res) => vite.middlewares(req, res, async () => {
    const path = req.url.split('?')[0];
    if (path !== '/root' && path !== '/document') { res.statusCode = 204; return res.end(); }
    const entry = await vite.ssrLoadModule('/entry-server.js');
    res.setHeader('content-type', 'text/html');
    res.end(path === '/root' ? entry.renderRoot() : entry.renderDocument());
  }));
  await new Promise(done => http.listen(0, '127.0.0.1', done));
  url = `http://127.0.0.1:${http.address().port}`;
  browser = await launch();
});
after(async () => {
  await browser?.close();
  await new Promise(done => http?.close(done));
  await vite?.close();
  await fixture?.remove();
});

async function visit(path, saved) {
  await page?.context().close();
  page = await newPage(browser);
  errors = collectErrors(page);
  if (saved) await page.addInitScript(values => localStorage.setItem('ssr:values', JSON.stringify(values)), saved);
  await page.goto(url + path);
  await page.locator('[data-knobs]').waitFor({ state: 'attached' });
}
const title = () => page.locator('#title').textContent();
const appeared = text => page.waitForFunction(value => document.getElementById('title').textContent === value, text);

for (const path of ['/root', '/document']) {
  test(`${path}: the server renders the file value or default`, async () => {
    const html = await (await fetch(url + path)).text();
    assert.match(html, /<h1 id="title">The original headline<\/h1>/);
  });

  test(`${path}: a saved value appears after hydration with no warning`, async () => {
    await visit(path, { 'hero.title': 'Saved in this browser' });
    await appeared('Saved in this browser');
    assert.deepEqual(errors, []);
  });

  test(`${path}: the page stays interactive and the drawer drives a useControl read`, async () => {
    await visit(path);
    await page.locator('#count').click();
    await page.waitForFunction(() => document.getElementById('count').textContent === '1');
    await openDrawer(page);
    await type(page, 'hero.title Driven by the drawer');
    await appeared('Driven by the drawer');
    assert.deepEqual(errors, []);
  });
}

test('/root: strict mode leaves one drawer', async () => {
  await visit('/root');
  assert.equal(await page.locator('[data-knobs]').count(), 1);
});

test('mountKnobs notifies an onControl listener and a useControl consumer already subscribed', async () => {
  await visit('/root', { 'hero.title': 'Restored for both' });
  await appeared('Restored for both');
  assert.equal(await page.evaluate(() => window.__heard), 'Restored for both');
});

test('a saved value survives a reload under hydration', async () => {
  await visit('/root');
  await openDrawer(page);
  await type(page, 'hero.title Across a reload');
  await page.reload();
  await appeared('Across a reload');
  assert.deepEqual(errors, []);
  assert.equal(await title(), 'Across a reload');
});
PLAN_EOF
cat > tests/fixtures/ssr/controls.js <<'PLAN_EOF'
import { defineControls } from 'knobs';
import { bindReact } from 'knobs/react';
import values from './knobs.values.json';

export const knobs = defineControls([
  { name: 'hero', controls: [
    { key: 'title', type: 'text', value: 'The original headline' },
    { key: 'badge', type: 'toggle', value: 1 },
  ] },
], values);
export const { control, onControl } = knobs;
export const useControl = bindReact(knobs);
PLAN_EOF
cat > tests/fixtures/ssr/knobs.values.json <<'PLAN_EOF'
{}
PLAN_EOF
cat > tests/fixtures/ssr/app.js <<'PLAN_EOF'
import { createElement as h, useEffect, useState } from 'react';
import { mountKnobs } from 'knobs';
import { knobs, useControl } from './controls.js';

export function App() {
  const title = useControl('hero.title');
  const [clicks, setClicks] = useState(0);
  useEffect(() => mountKnobs(knobs, { name: 'ssr' }), []);
  return h('main', null,
    h('h1', { id: 'title' }, title),
    h('button', { id: 'count', type: 'button', onClick: () => setClicks(n => n + 1) }, String(clicks)));
}

export function Document() {
  return h('html', null,
    h('head', null, h('title', null, 'knobs ssr')),
    h('body', null, h(App), h('script', { type: 'module', src: '/client-document.js' })));
}
PLAN_EOF
cat > tests/fixtures/ssr/entry-server.js <<'PLAN_EOF'
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { App, Document } from './app.js';

export const renderRoot = () => `<!doctype html><html><head><title>knobs ssr</title></head><body><div id="root">${renderToString(h(App))}</div><script type="module" src="/client-root.js"></script></body></html>`;
export const renderDocument = () => `<!doctype html>${renderToString(h(Document))}`;
PLAN_EOF
cat > tests/fixtures/ssr/client-root.js <<'PLAN_EOF'
import { createElement as h, StrictMode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { App } from './app.js';
import { onControl } from './controls.js';

onControl('hero.title', value => { window.__heard = value; });
hydrateRoot(document.getElementById('root'), h(StrictMode, null, h(App)));
PLAN_EOF
cat > tests/fixtures/ssr/client-document.js <<'PLAN_EOF'
import { createElement as h } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { Document } from './app.js';

hydrateRoot(document, h(Document));
PLAN_EOF
```

```bash red
node --test tests/unit/react.test.mjs
```

```expected
src/react.js' imported from
```

```bash red
node --test tests/browser/ssr.test.mjs
```

```expected
src/react.js' imported from
```

**Implementation.** `useControl` calls `useSyncExternalStore` with a `subscribe` memoized on `path` that wraps `store.onControl`, a client snapshot of `store.control(path)`, and a server snapshot of `store.fileValue(path)`. The server snapshot must never read a live value, so a saved value cannot cause a mismatch whenever it arrives. Only this file imports React.

**Check:** `node --test tests/unit/react.test.mjs` passes 6, and the whole browser suite passes 58.

**Commit:** `feat(react): add useControl`

### Task 10: type declarations

**Files:** create `types/index.d.ts`, `types/react.d.ts`, `types/vite.d.ts`, `tests/types/tsconfig.json`, `tests/types/consumer.ts`, `tests/unit/types.test.mjs`.

```bash apply
mkdir -p tests/types tests/unit
cat > tests/unit/types.test.mjs <<'PLAN_EOF'
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const path = name => fileURLToPath(new URL(`../../${name}`, import.meta.url));

test('the declarations exist', () => {
  for (const name of ['types/index.d.ts', 'types/react.d.ts', 'types/vite.d.ts']) assert.ok(readFileSync(path(name), 'utf8').length > 0, name);
});

test('a TypeScript consumer compiles and its expected errors are errors', () => {
  const tsc = path('node_modules/typescript/bin/tsc');
  const result = spawnSync(process.execPath, [tsc, '-p', path('tests/types/tsconfig.json')], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
PLAN_EOF
cat > tests/types/tsconfig.json <<'PLAN_EOF'
{
  "compilerOptions": {
    "noEmit": true, "strict": true, "target": "ES2022", "module": "ESNext", "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM"], "skipLibCheck": true, "types": [],
    "baseUrl": ".",
    "paths": { "knobs": ["../../types/index.d.ts"], "knobs/react": ["../../types/react.d.ts"], "knobs/vite": ["../../types/vite.d.ts"] }
  },
  "files": ["consumer.ts"]
}
PLAN_EOF
cat > tests/types/consumer.ts <<'PLAN_EOF'
import { canvasVisual, defineControls, fit, mountKnobs } from 'knobs';
import { bindReact } from 'knobs/react';
import plugin from 'knobs/vite';

export const knobs = defineControls([
  { name: 'hero', about: 'Homepage hero', controls: [
    { key: 'variant', type: 'select', value: 'split', options: ['split', 'full'] },
    { key: 'title', type: 'text', value: 'Words' },
    { key: 'overlay', type: 'number', value: 0.4, min: 0, max: 1, step: 0.01 },
    { key: 'badge', type: 'toggle', value: 1 },
    { key: 'accent', type: 'color', value: '#e8c547' },
  ] },
  { name: 'hidden', hidden: true, controls: [] },
], {});
export const { control, onControl } = knobs;
export const useControl = bindReact(knobs);
export const read: string | number = control('hero.title');
export const stop: () => void = onControl('hero.title', value => { void value; });
export const unmount: () => void = mountKnobs(knobs, { name: 'x', status: () => 'ok', visuals: { hero: canvasVisual('x', () => () => {}) }, stats: () => ({ a: 1 }) });
export const point: number = fit([0, 1, 0, 1], 10, 0, 10).x(0);
export const vitePlugin = plugin({ controls: 'controls.ts', origins: ['https://a.test'] });

// @ts-expect-error a number control needs a range
defineControls([{ name: 'a', controls: [{ key: 'x', type: 'number', value: 1 }] }]);
// @ts-expect-error a select control needs options
defineControls([{ name: 'a', controls: [{ key: 'x', type: 'select', value: 'y' }] }]);
// @ts-expect-error mounting needs a name
mountKnobs(knobs, {});
// @ts-expect-error the plugin needs the controls path
plugin({});
PLAN_EOF
```

```bash red
node --test tests/unit/types.test.mjs
```

```expected
no such file or directory
```

**Implementation.** Hand-written declarations. Controls are a union discriminated on `type`, so a number requires `min`, `max` and `step` and a select requires `options`. `Store` declares `control`, `fileValue`, `onControl`, `subscribe`, `set`, `reset` and `changed`; `control` returns `number | string`. `MountOptions` requires `name`. `types/react.d.ts` needs no React types. `types/vite.d.ts` imports `Plugin` from `vite` as a type and requires `controls`. The consumer's `@ts-expect-error` lines must each be a real error.

**Check:** `npm run test:unit` passes 154.

**Commit:** `feat(types): add type declarations`

### Task 11: one run on a real project

**Files:** create `tests/e2e/real-project.mjs`.

```bash apply
mkdir -p tests/e2e
cat > tests/e2e/real-project.mjs <<'PLAN_EOF'
// One end-to-end run on a real project through a symlinked install. It copies
// the project's committed tree and this repository's package (with no
// node_modules, as a fresh checkout has none) to a temporary directory, installs
// knobs as a file: dependency, wires it the way the skill will, and drives it.
// Run it both ways: with no flag the linked package has no node_modules at all,
// which proves nothing depends on packages beside it; with --own-react it has its
// own React, as a real checkout does, which proves React is deduped.
// usage: node tests/e2e/real-project.mjs <path to the drop checkout> [--own-react]
import '../../src/vite.js';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, cpSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const project = process.argv[2];
const ownReact = process.argv[3] === '--own-react';
if (!project) { console.error('usage: real-project.mjs <project checkout> [--own-react]'); process.exit(2); }
const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const work = realpathSync(mkdtempSync(join(tmpdir(), 'knobs-e2e-')));
const knobsDir = join(work, 'knobs'), app = join(work, 'app');
const say = text => console.log(`e2e: ${text}`);
const run = (file, args, cwd) => execFileSync(file, args, { cwd, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' });

function freePort() {
  return new Promise(done => {
    const probe = createServer().listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => done(port));
    });
  });
}
async function waitForServer(url) {
  for (let i = 0; i < 240; i++) {
    try { if ((await fetch(url)).ok) return; } catch {}
    await new Promise(done => setTimeout(done, 250));
  }
  throw new Error(`no server at ${url}`);
}

let server, browser;
try {
  mkdirSync(knobsDir);
  for (const name of ['src', 'types', 'package.json']) cpSync(join(repo, name), join(knobsDir, name), { recursive: true });
  if (ownReact) cpSync(join(repo, 'node_modules', 'react'), join(knobsDir, 'node_modules', 'react'), { recursive: true });
  mkdirSync(app);
  const archive = join(work, 'project.tar');
  run('git', ['-C', project, 'archive', '--format=tar', '-o', archive, 'HEAD']);
  run('tar', ['-xf', archive, '-C', app]);
  run('npm', ['ci', '--prefer-offline', '--ignore-scripts', '--no-audit', '--no-fund'], app);
  run('npm', ['install', '--prefer-offline', '--ignore-scripts', '--no-audit', '--no-fund', '--save-dev', 'file:../knobs'], app);
  assert.ok(lstatSync(join(app, 'node_modules', 'knobs')).isSymbolicLink(), 'knobs is a symlink');
  say('installed through a symlink');

  writeFileSync(join(app, 'knobs.values.json'), '{}\n');
  writeFileSync(join(app, 'src', 'controls.ts'), `import { defineControls } from 'knobs';
import { bindReact } from 'knobs/react';
import values from '../knobs.values.json';

export const knobs = defineControls([
  { name: 'hero', about: 'A real project', controls: [
    { key: 'title', type: 'text', value: 'The original headline' },
  ] },
], values);
export const { control, onControl } = knobs;
export const useControl = bindReact(knobs);
`);
  const config = join(app, 'vite.config.ts');
  const before = readFileSync(config, 'utf8');
  const after = before.replace('plugins: [react(), tailwindcss()]', "plugins: [react(), tailwindcss(), knobs({ controls: 'src/controls.ts' })]");
  assert.notEqual(after, before, 'the plugin was registered');
  writeFileSync(config, `import knobs from 'knobs/vite';\n${after}`);
  appendFileSync(join(app, 'src', 'main.tsx'), `
import { createElement as knobsH, useEffect as knobsEffect } from 'react';
import { createRoot as knobsRoot } from 'react-dom/client';
import { mountKnobs } from 'knobs';
import { knobs as knobsStore, useControl } from './controls';
(window as any).__boots = Number(sessionStorage.getItem('boots') ?? 0) + 1;
sessionStorage.setItem('boots', String((window as any).__boots));
function KnobsProbe() {
  const title = useControl('hero.title');
  knobsEffect(() => mountKnobs(knobsStore, { name: 'e2e' }), []);
  return knobsH('output', { id: 'knobs-probe' }, String(title));
}
const knobsHost = document.createElement('div');
document.body.append(knobsHost);
knobsRoot(knobsHost).render(knobsH(KnobsProbe));
`);

  const port = await freePort();
  const url = `http://127.0.0.1:${port}/`;
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: app, stdio: ['ignore', 'inherit', 'inherit'] });
  await waitForServer(url);
  say('dev server is up');

  browser = await chromium.launch({ executablePath: process.env.KNOBS_CHROMIUM || undefined });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.setDefaultTimeout(60000);
  const failures = [];
  page.on('pageerror', error => failures.push(error.message));
  page.on('console', message => { if (/Invalid hook call|more than one copy of React/.test(message.text())) failures.push(message.text()); });
  // Nothing from this run may reach the project's live backend.
  await page.route('**/dufs/**', route => route.abort());
  await page.goto(url);
  await page.locator('#knobs-probe').waitFor({ state: 'attached' });
  await page.locator('[data-knobs]').waitFor({ state: 'attached' });
  assert.equal(await page.locator('#knobs-probe').textContent(), 'The original headline');
  say('the drawer mounted and a useControl read rendered');

  await page.locator('body').press('Backquote');
  await page.locator('.term.open .term-drawer').waitFor();
  const prompt = page.locator('.term-prompt input');
  const style = await page.evaluate(() => getComputedStyle(document.querySelector('[data-knobs]').shadowRoot.querySelector('.term-tab:not(.active)')).color);
  assert.equal(style, 'rgb(232, 197, 71)', 'the project CSS does not reach the drawer');
  await prompt.fill('hero.title Set in a real project');
  await prompt.press('Enter');
  await page.waitForFunction(() => document.getElementById('knobs-probe').textContent === 'Set in a real project');
  say('the drawer drives the read');

  const urls = await page.evaluate(() => performance.getEntriesByType('resource').map(entry => entry.name));
  const paths = urls.map(name => new URL(name).pathname);
  const reacts = paths.filter(path => /\/deps\/react\.js$/.test(path));
  assert.equal(reacts.length, 1, 'one pre-bundled React');
  assert.ok(paths.some(path => path.endsWith('/knobs/src/react.js')), 'knobs/react was served from the linked checkout');
  assert.equal(paths.filter(path => path.includes('/knobs/node_modules/')).length, 0, 'nothing loaded from inside knobs');
  say('one copy of React');

  await prompt.fill('save');
  await prompt.press('Enter');
  await page.waitForFunction(() => window.__boots === 2, undefined, { timeout: 20000 }).catch(async error => {
    throw new Error(`save did not reload the page. The drawer said:\n${await page.locator('.term-log').innerText()}\n${error.message}`);
  });
  assert.deepEqual(JSON.parse(readFileSync(join(app, 'knobs.values.json'), 'utf8')), { 'hero.title': 'Set in a real project' });
  say('save wrote the values file and the page reloaded');

  await page.locator('[data-knobs]').waitFor({ state: 'attached' });
  await new Promise(done => setTimeout(done, 1000));
  appendFileSync(join(knobsDir, 'src', 'style.js'), '\n// edited by the end-to-end run\n');
  await page.waitForFunction(() => window.__boots === 3);
  await page.locator('[data-knobs]').waitFor({ state: 'attached' });
  assert.equal(await page.locator('#knobs-probe').textContent(), 'Set in a real project');
  say('a change in the knobs checkout reloaded the page');

  // In the browser a bare react import always maps to the pre-bundled copy, so
  // only server rendering shows whether the linked package's own React is deduped.
  writeFileSync(join(app, 'src', 'ssr-probe.ts'), `import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { useControl } from './controls';
function Probe() { return createElement('h1', null, String(useControl('hero.title'))); }
export const html = () => renderToString(createElement(Probe));
`);
  writeFileSync(join(app, 'ssr-probe.mjs'), `import { createServer } from 'vite';
const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error', cacheDir: 'node_modules/.vite-ssr-probe' });
const { html } = await vite.ssrLoadModule('/src/ssr-probe.ts');
console.log(html());
await vite.close();
process.exit(0);
`);
  assert.match(run(process.execPath, ['ssr-probe.mjs'], app), /<h1>Set in a real project<\/h1>/);
  say('server rendering used one copy of React');

  assert.deepEqual(failures, []);
  say('ok');
} finally {
  await browser?.close();
  server?.kill();
  rmSync(work, { recursive: true, force: true });
}
PLAN_EOF
```

```bash red
node tests/e2e/real-project.mjs
```

```expected
src/vite.js' imported from
```

This task adds no planned source. The spec names this run as the check that decides whether the Vite settings are complete, so if it fails, fix `src/vite.js`, or the file the failure names, and record what was wrong and why in the closing report. If it passes at once, say so.

**Check:** run it as two check jobs, using `-- paced env KNOBS_CHROMIUM=/home/jmo/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome node tests/e2e/real-project.mjs /home/jmo/linda/repos/drop`, and again with `--own-react` added. Each log ends `e2e: ok`. Then confirm `git -C /home/jmo/linda/repos/drop status --short` prints nothing.

**Commit:** `test(e2e): run the drawer on a real project`

## After the build

The driver writes the knobs skill once Milestone 5 is clean, with write-skill, on its own branch in the skills repository. Its description fires when a prototype is starting, or when asked to add a control drawer to a web project. It covers install (a `file:` dev dependency on this repository), propose (read the project and list the controls it would create, grouped as variants, variables and copy, then wait for Josh), wire (the controls file, an empty `knobs.values.json`, `knobs/vite` in the Vite config, a client-only mount, a read at each place in the code) and wrap-up (the spec's Coming back out section). It never adds knobs to a default branch. The handoff with the quick prototyping skill is agreed with the thread building it before the skill is written.
