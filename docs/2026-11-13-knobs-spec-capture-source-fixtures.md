---
title: "knobs capture source fixtures: each project's own drawer, pictures and scene, vendored and served by the playground"
kind: spec
target: knobs
topic: capture-source-fixtures
status: draft
written: 2026-11-13T22:46:39Z
by: claude
worktree: /home/jmo/linda/repos/knobs/.worktrees/capture-source-fixtures
---

# knobs capture source fixtures: each project's own drawer, pictures and scene, vendored and served by the playground

## Goal

wings-vdb and mini-pylon become fixtures of knobs. The playground shows each project's own drawer, its controls and its right-hand pictures exactly as they appear in the source project, by running a dated, vendored snapshot of that project's front-end code unchanged. For wings-vdb that includes the cloud and the homepage environment behind the drawer, since the pictures read them; for mini-pylon it includes the preview pane, fed with recorded renders. The existing knobs translation of each drawer stays beside it, so the two can be compared tab by tab.

Decided with Josh on 2026-11-13 (design-first): the source's own drawer is vendored and run unchanged (not hosted inside the knobs drawer); wings-vdb keeps the cloud object and homepage environment but only what is consequential to the drawer UI; mini-pylon's images are recorded renders; wings-vdb's fonts load from the local checkout and are never committed; snapshots are made by `playground:capture`; the playground's own server serves them (approach 1 of 3); the vendored source is published in knobs under a NOTICE that it is not MIT.

## Current state

Checked 2026-11-13. Base commit: `ea8e929 Merge pull request #15 from mini-pylon/knobs-playground` on `main`. The repository is public and MIT (`LICENSE:1-3` at `ea8e929`).

Captures, knobs side:

- `npm run playground:capture -- <project> [checkout]` builds a capture with an adapter per project and writes `playground/captures/<project>/capture.json`, after removing the project's folder (`playground/capture.mjs:1`, `playground/capture.mjs:15`, `playground/capture.mjs:64-70` at `ea8e929`). `build()` returns `source`, `capturedAt`, `groups`, `valueSets`, `untranslated` and `shots` (`playground/adapters/common.mjs:45-48` at `ea8e929`); `source()` runs git with `--no-optional-locks` (`playground/adapters/common.mjs:11-12` at `ea8e929`).
- Shots are taken only when the project's dev server already answers; otherwise `shotsSkipped` says why (`playground/capture.mjs:68-69` at `ea8e929`). The wings-vdb adapter's dev server is `http://127.0.0.1:5350/`, with Vulkan flags for headless WebGL, the drawer opened by the backtick key and tabs at `.term-tabs .term-tab` (`playground/adapters/wings-vdb.mjs:18-23` at `ea8e929`); mini-pylon's is `http://127.0.0.1:5371/` (`playground/adapters/mini-pylon.mjs:16-20` at `ea8e929`). The mini-pylon adapter runs Python with `-B` (`playground/adapters/mini-pylon.mjs:34-35` at `ea8e929`).
- `untranslated` lists the wings-vdb pictures, perf page, wiring and drawer commands (`playground/adapters/wings-vdb.mjs:71-78` at `ea8e929`) and mini-pylon's renders tab, `/render`, `render` and preview pane (`playground/adapters/mini-pylon.mjs:54-60` at `ea8e929`).
- The playground server is one Vite server with `@captures` aliased to the captures folder (`playground/captures/`, `KNOBS_CAPTURES`, or the `captures` option) and `allowedHosts` for a proxy (`playground/server.mjs:83-94` at `ea8e929`).
- `capture:<name>` with `set=<value set>` mounts a capture's groups with that set's values in the knobs drawer (`playground/scenarios.js:31-46`, `playground/scenarios.js:112` at `ea8e929`); the shell's capture view shows the source line, the value-set picker and the original shots (`playground/shell.js:222-232` at `ea8e929`); the stage is an iframe in the shell (`playground/index.html:48` at `ea8e929`). `grid.html?set=captures` and `playground:shots --only captures` include every capture (`playground/grid.js:5`, `playground/grid.js:21`, `playground/shots.mjs:34` at `ea8e929`).
- Test fixtures for captures are small stand-in checkouts under `tests/fixtures/captures/` (`wings-vdb/src/{main,params,terminal}.js`, `mini-pylon/tools/scene_params.py`, one final's JSON, one browser report) (`tests/fixtures/captures/wings-vdb/src/main.js:1`, `tests/fixtures/captures/mini-pylon/tools/scene_params.py:1` at `ea8e929`); unit tests are in `tests/unit/playground-capture.test.mjs` and browser tests in `tests/browser/playground.test.mjs` (`tests/browser/playground.test.mjs:367-458` at `ea8e929`).
- knobs' drawer takes `visuals` keyed by group name and calls `visuals[group.name](vizBox)` (`src/drawer.js:36-46`, `src/drawer.js:247` at `ea8e929`): the same shape wings-vdb passes, but this design does not use it.
- knobs' drawer keeps its state under its `name`: `<name>:values`, `<name>:groups` in localStorage and `<name>:drawer` in sessionStorage (`src/drawer.js:115-120`, `src/drawer.js:205`, `src/drawer.js:664`, `src/drawer.js:698` at `ea8e929`). The stage names a capture's drawer after the project, so the knobs translation of wings-vdb uses the keys `wings-vdb:groups` and `wings-vdb:drawer`, and clears `wings-vdb:values` and `wings-vdb:groups` on every start (`playground/stage.js:13`, `playground/stage.js:19-20`, `playground/stage.js:32` at `ea8e929`).
- The test harness's `viteConfig(root)` sets `cacheDir` to `<root>/.vite`, `optimizeDeps.noDiscovery` and `fs.allow: [repo]` (`tests/browser/lib/harness.mjs:42-57` at `ea8e929`).

Vite (checked: `node_modules/vite/dist/node/chunks/node.js`, vite 8.3.8 from `package-lock.json`, 2026-11-13):

- In middleware mode the base middleware strips the base from a matching URL and passes any other request on unchanged (lines 16878-16881); with the default `appType: 'spa'`, the HTML fallback would answer root requests with the instance's own `index.html` if the instance saw them.
- In middleware mode without `server.ws.server`, the HMR client dials port 24678 (line 17233). With `ws.server` given, upgrades are accepted only where the pathname equals the instance's `base` (lines 24564-24576).
- With `cacheDir` unset, the cache goes to the nearest `package.json`'s `node_modules/.vite`, else `<root>/node_modules/.vite` or `<root>/.vite` (lines 37713-37720).

wings-vdb, read only (checked: `~/linda/repos/wings-vdb` working tree on `dispersal-controls-prototype` at `7f92902`, with uncommitted changes in `src/main.js`, `src/style.css`, `src/detail.js`, 2026-11-13):

- `index.html` holds the sky canvas, a fallback `<img src="/cloud-fallback.svg">`, the footer, the detail section and the chat section, and loads `<script type="module" src="/src/main.js">`.
- `src/main.js` imports `style.css`, `cloud-morph.js`, `terminal.js`, `perf.js`, `viz.js`, `params.js`, `shader.js`, `post.js`, `birds.js`, `chat.js`, `detail.js`, `dev-report.js` and `flags.js` (lines 1-13), builds `vizScene` from the live cloud, flocks and scroll (lines 304-319) and mounts the drawer with `pages: [perfPage(...)]` and `visuals: paramVisuals(vizScene)` (lines 320-322). It uses `import.meta.hot` (line 956), so it needs Vite.
- Module exports: `chat.js` `mountChatThread`, `respond`; `detail.js` `details`, `renderDetail`; `dev-report.js` `reportSettings`; `flags.js` `FLAGS`, `WAITLIST_URL`, `flags`. `main.js` imports `mountChatThread`, `details`, `renderDetail`, `reportSettings`, `flags`, `WAITLIST_URL` (lines 10-13).
- `main.js` uses the chat thread's return value when it lays out the chat: it reads `thread.empty` and `thread.expanded`, calls `thread.layoutPills({...})` and reads `.height` from its result, and passes `thread.fit(...)` to `Math.max` (lines 640-663).
- The `defaults` command prints the server's `errors` only from a 200 JSON body `{ changes, errors }`; any other status prints `defaults: only on the dev server (server said <status>)` (lines 459-471).
- Hidden chat commands are string literals that start with `/` but are not URLs: `'/clouds'`, `'/perf'` (lines 836-842).
- Absolute URLs at run time: `'/wings-wide.svg'` (`cloud-morph.js:39`), `fetch('/__wings/defaults')` (`main.js:461`), `'/__wings/report'` (`dev-report.js:14`), `url('/fonts/ABCArealVariable.woff2')` and `url('/fonts/ABCArealMonoVariable.woff2')` (`style.css:1-12`).
- Storage: values in `localStorage['wings-vdb:params']` (`params.js:139`, `params.js:178-185`), open tabs in `localStorage['wings-vdb:groups']` (`terminal.js:54-64`), drawer open in `sessionStorage['wings-vdb:drawer']` (`terminal.js:439`, `terminal.js:465`).
- `public/` is 6.9 MB (fonts, `options/` images and videos, two SVGs). The fonts are ABC Areal and ABC Areal Mono, commercial faces from Dinamo.

mini-pylon, read only (checked: `~/linda/repos/mini-pylon` working tree at `b984b47`; `tools/tweak/` and `tools/scene_params.py` are untracked, 2026-11-13):

- `tools/tweak/index.html` loads `tweak.css` and `tweak.js` by relative URL; `tweak.js` is a classic script that calls `/api/schema`, `/api/render` (`kind: 'preview'` or `'final'`), `/api/jobs/<id>` (polled until `done`, `failed` or `superseded`) and `/api/finals` (`tweak.js:65-75`, `tweak.js:91`, `tweak.js:152`, `tweak.js:329`, `tweak.js:571`). It stores `values`, `view`, `group`, `drawer`, `auto` and `history` under the prefix `mini-pylon-tweak:` (`tweak.js:5-7`, `tweak.js:22-25`, `tweak.js:200-201`, `tweak.js:542`, `tweak.js:551`, `tweak.js:577-580`).
- `tools/tweak_server.py` answers those routes and serves images at `/out/previews/` and `/out/finals/` (lines 293-321). A job's public fields are `id, kind, state, size, samples, url, seconds, error, name, ahead` (lines 196-200); a final in `/api/finals` has `name, file, state, url, size, queued, rendered, error, values` (lines 245-260). `--fake` draws a flat PNG whose colour is the first three bytes of the SHA-1 of the resolved values as sorted JSON, each `64 + b // 2`, at most 256 px (lines 77-95). Values are resolved against the schema's defaults (`scene_params.py:138-149`); a number keeps the type JSON gave it (int or float) unless it is clamped to a bound, when it takes the bound's type (`scene_params.py:119-124`). The page sends every value it holds, not only changes (`tweak.js:85`, `tweak.js:91`).
- Presets: `afternoon`, `overcast`, `dusk`, `wet-night`, `concrete`, `studio` (`scene_params.py:78`). Recorded renders exist only for the two finals in `renders/hyperreal/tweaks/` (one JSON and one 2160 px PNG of about 5.4 MB each); the defaults and presets have none.

## Design

### Layout

```
playground/captures/
  NOTICE.md                         the source/ folders are not MIT (below)
  <project>/
    capture.json                    as now, plus `vendored` and per-set `sourceValues`
    shots/                          as now: the live source drawer, when its server was up
    source/                         the vendored snapshot, served at /captures/<project>/source/
playground/fixtures/
  wings-vdb/stubs/{chat,dev-report}.js
  wings-vdb/vite.mjs                the wings-vdb fixture's Vite instance
  mini-pylon/api.mjs                the tweak_server.py stand-in, and static serving of its page
  routes.mjs                        the root-path table and the fonts route
playground/check-fixtures.mjs       npm run playground:check-fixtures
```

### Snapshots, made by capture

`npm run playground:capture -- <project>` keeps doing what it does now and also writes `source/`. It reads the checkout only, as now. Each adapter gains a `vendor` list and, where needed, a `record` step.

wings-vdb:

- Copied byte for byte: `index.html`; `src/main.js`, `terminal.js`, `viz.js`, `perf.js`, `params.js`, `birds.js`, `cloud-morph.js`, `shader.js`, `post.js`, `detail.js`, `flags.js`, `style.css`; `public/cloud-fallback.svg` and `public/wings-wide.svg` into `source/public/`, where the fixture's Vite serves them. No font, no `public/options/`, no `vite.config.js` is copied.
- Stubbed, not copied: `chat.js` (the scripted agent) and `dev-report.js` (browser reports to the dev server). The stubs live in `playground/fixtures/wings-vdb/stubs/`, and the fixture's Vite instance aliases the two imports to them.
  - `chat.js` stub: `mountChatThread()` returns `{ empty: true, expanded: false, send() {}, clear() {}, focus() {}, fit: () => 0, layoutPills: () => ({ height: 0, boxes: [] }) }`, with `empty` and `expanded` as getters, so `main.js` lays the chat out as a panel before its first message and never reaches the reply branch. `respond()` returns `{ blocks: [] }`. The chat toggle still opens the input; nothing answers.
  - `dev-report.js` stub: `reportSettings()` does nothing.
- Capture fails, naming the cause, when a copied file imports a relative module that is neither copied nor stubbed, or imports a name a stub does not export. Absolute URLs are checked at run time (Serving), not by scanning source.

mini-pylon:

- Copied byte for byte: `tools/tweak/index.html`, `tweak.js`, `tweak.css`.
- Recorded into `source/data/`: `schema.json` (the output of `schema()`, run with `python3 -B` as the adapter does now, with each number bound's Python type, int or float, beside it), `finals.json` (each final with a JSON side file, in the server's field order, with `url` pointing into the fixture) and `defaults.json` (the resolved defaults, scene and render).
- Each final's PNG is downscaled to the default `render.preview_size` into `source/renders/<file>.png`, by drawing it on a canvas in the Playwright Chromium capture already launches and saving the canvas as PNG. No other image tool is needed.
- `swatch.json` records Python's own answer for the swatch, for the test that pins the JavaScript port. Capture imports `tools/tweak_server.py` and `tools/scene_params.py` with `python3 -B` and, for each of two payloads, runs what the real `--fake` server runs: `json.loads` of the payload's JSON text as JavaScript writes it, `scene_params.resolve(..., include_render=True)`, the scene values without `render.*`, then the SHA-1 of `json.dumps(values, sort_keys=True)` and the colour rule from `write_swatch_png`. The two payloads are the defaults as the page sends them, and the defaults with one number pushed past a float bound so it clamps. Nothing is written into the checkout.

`capture.json` gains:

- `vendored`: `{ files: [{ path, from, sha256 }], stubs: [{ module, by }], recorded: [path, …] }`, where `from` is the path in the source checkout and `by` is the stub's path in knobs.
- `sourceValues` on each value set: the values in the source's own storage form, so nothing is translated back from knobs form.

`untranslated` stays as it is: it describes the knobs translation, which still exists.

### Serving

All of this runs inside the existing playground server process (`servePlayground`), so the `knobs-playground` unit and the portal link stay as they are.

- **wings-vdb: one Vite instance in middleware mode**, mounted on a connect route: `playgroundServer.middlewares.use('/captures/wings-vdb/source', fixture.middlewares)`, never a bare `use(...)`, so it never sees a root request. Its config: `root` at `source/`, `base` `/captures/wings-vdb/source/`, `appType: 'mpa'`, the stub aliases, `cacheDir` under `tests/.tmp/fixture-vite/wings-vdb`, `optimizeDeps.noDiscovery`, `fs.allow: [repo]`, and `server.ws.server` set to the playground's own HTTP server, so its HMR socket shares the playground's port and answers only on its base path. Vite joins the base onto `index.html`'s absolute `src` and `href` and onto rewritten imports, so `/src/main.js` and `/cloud-fallback.svg` load under the prefix without any transform. CSS `url('/fonts/…')` stays absolute, since the fonts are not in `source/public/`.
- **mini-pylon: static files**, no Vite: `/captures/mini-pylon/source/` serves `index.html`, `tweak.js`, `tweak.css` and `renders/` from `source/` with their content types.
- **The root-path table** in `playground/fixtures/routes.mjs` mounts each absolute path the vendored pages request at run time, owned by one fixture: `/wings-wide.svg` (from `source/public/`), `/fonts/` and `/__wings/` (wings-vdb), `/api/` (mini-pylon). None of them is a path the playground or Vite serves (`/__playground/draft`, `/@vite/`, `/@fs/`, `/@id/`). The check is at run time: the browser tests and `check-fixtures` record every request a source page makes and fail on a root path that is not in the table or under the page's prefix.
- **wings-vdb fonts**: `/fonts/ABCArealVariable.woff2` and `/fonts/ABCArealMonoVariable.woff2` are read from `public/fonts/` of the checkout recorded in `capture.json`, or from `KNOBS_WINGS_FONTS` when set, read only. When the files are not there the route answers 404 and the page falls back to its own CSS font stack. `GET /captures/wings-vdb/fonts` answers `{ "fonts": "local" | "fallback" }`.
- **`POST /__wings/defaults`** answers 200 with `{ "changes": [], "errors": ["defaults are not saved in the knobs fixture"] }`, which the drawer prints as `defaults: defaults are not saved in the knobs fixture`, then `defaults: nothing to change`. `POST /__wings/report` answers 204; it stays in the table though the stub never calls it.
- **The mini-pylon stand-in** (`playground/fixtures/mini-pylon/api.mjs`) answers from `source/data/`:
  - `GET /api/schema` and `GET /api/finals` return the recorded data. `GET /api/status` returns an idle status in the server's shape.
  - `POST /api/render` with `kind: 'preview'` resolves the values against `defaults.json` with the server's rules (clamping, and an unknown parameter answering 400 with the server's error text) and returns a job in the server's public fields, with `ahead: 0`. The job is `done` on its first poll, with `seconds: 0` and `size` the preview size. Its `url` is the final's downscaled render when the resolved scene values equal a recorded final's (ignoring `render.*`); otherwise it is a swatch PNG served from memory under `/captures/mini-pylon/source/out/`.
  - The swatch port reproduces `write_swatch_png`: the SHA-1 of the resolved scene values serialised as Python's `json.dumps(sort_keys=True)` would, with separators `', '` and `': '`, a number written as an int when JSON gave an int and as a Python float repr (so `2.0`, not `2`) when it came from a float or was clamped to a float bound (`schema.json` records each bound's type); then the colour `64 + b // 2` of the first three bytes, a square of `min(size, 256)` px, encoded with Node's `zlib` and `crypto`.
  - `POST /api/render` with `kind: 'final'` returns a job that is `failed` on its first poll with `error: 'finals are not made in the knobs fixture'`.

### Playground

- URL: `?s=capture:<project>&set=<value set>&tab=<group>&view=source|knobs`. `view` defaults to `knobs`, so existing links keep working.
- The knobs translation of a capture is mounted under the drawer name `knobs-<project>`, not the project's name, so its storage keys never touch the source page's. The stage's title and the `data-knobs` host follow that name.
- The capture view's header gets a `source | knobs` switch that changes `view` and keeps `set` and `tab`. In `source`, the stage frame loads `/captures/<project>/source/`. In `knobs`, the frame mounts the knobs translation as now.
- Before loading the source frame, the shell clears the project's storage keys and writes the chosen set's `sourceValues` and the tab through the source's own keys, in each page's own encoding:
  - wings-vdb: `localStorage['wings-vdb:params']` a JSON object keyed by path; `localStorage['wings-vdb:groups']` a JSON array of group names; `sessionStorage['wings-vdb:drawer']` the plain string `1`.
  - mini-pylon: each key under `mini-pylon-tweak:` holds JSON (`tweak.js:6-7`): `values` an object keyed by path, `view` the string `"params"`, `group` the group name as a JSON string, `drawer` `true`.
- A viewer's own edits in the source frame last until the shell seeds again: on a reload of the shell, or a choice of another set, tab or view.
- The source page keeps one open tab in one storage key, so a project's source view shows one tab at a time.
- The capture view adds a fixture line: snapshot source and capture date, the stubbed modules, what the stand-in refuses (finals, saving defaults), and for wings-vdb `fonts: local` or `fonts: fallback (ABC Areal is not in this checkout)`.
- `grid.html?set=captures` shows a row per tab of each capture with three cells: the source shot from `shots/` when there is one, the source view, and the knobs view. Because the source cells of one project share storage keys, the grid loads them one at a time: seed, load, wait until the page's drawer is open on that tab, then the next.
- `npm run playground:shots -- --only captures` also shoots each tab of each source view, one at a time, and labels those shots as fixture shots. wings-vdb's source view is shot with the Vulkan flags the adapter already uses.
- `npm run playground:check-fixtures` loads each committed source view headless, opens every tab, and fails when the page logs a console error, requests a root path outside the table, leaves a wings-vdb picture canvas blank, or fails to load the mini-pylon preview image. It runs as a check job after each capture; it is not part of `test:browser`.

### Notice

`playground/captures/NOTICE.md` says the `source/` folders are © their projects (wings-vdb, mini-pylon), all rights reserved, included in knobs as reference fixtures for the playground, and not covered by knobs' MIT licence. The README's Captures section links it. Capture never writes it; it is committed by hand.

### What becomes public

Committing the snapshots publishes, in public knobs: wings-vdb's front-end source listed above (about 300 KB, including the 1,777-line `shader.js` and the cloud), mini-pylon's tweak page, its schema, and about 1 MB of downscaled final renders. Josh approved this with the notice on 2026-11-13. No font file, `public/options/` media or `chat.js` copy is committed.

## Testing

Test-first. Tests read only `tests/fixtures/`; they never read the real projects or the committed `source/` snapshots.

- New stand-in checkouts under `tests/fixtures/captures/`: the wings-vdb-like one gains an `index.html` with an absolute `<script src="/src/main.js">` and `<img src="/cloud-fallback.svg">`, a `main.js` that imports `terminal.js` and `chat.js` and uses the thread as the real one does, a `viz.js` drawing one line on a canvas, a CSS `url('/fonts/…')`, and an absolute `fetch('/__wings/defaults')`; the mini-pylon-like one gains a `tools/tweak/` page that calls `/api/*`, and a small PNG beside its final's JSON.
- Unit (`tests/unit/playground-capture.test.mjs` and a new `tests/unit/playground-fixtures.test.mjs`):
  - capture copies the listed files byte for byte into `source/` and `source/public/` and records each one's sha256, source path and the stubs;
  - capture fails on a relative import that is neither copied nor stubbed, and on a name a stub does not export;
  - the `chat.js` stub has the stated shape, and `layoutPills` and `fit` return what `main.js` reads;
  - each value set carries `sourceValues`;
  - the stand-in: job fields match the server's public fields with a numeric `seconds`; a preview of a final's values returns that final's render; any other preview returns a swatch PNG whose colour matches each of `swatch.json`'s Python answers (defaults, and the clamped payload); a final fails with the stated error; an unknown parameter answers 400;
  - `/__wings/defaults` answers the stated body;
  - the fonts route answers `local` with the files present and `fallback` without them.
- Browser (`tests/browser/playground.test.mjs`):
  - the source view loads each stand-in page under its prefix with no console error, its absolute requests reach their owners, and no request goes to a root path outside the table;
  - the fixture's HMR socket connects through the playground's own port;
  - the playground's own pages (`/`, `/grid.html`, `/stage.html`) are still served by the playground while a fixture is mounted;
  - a value set and tab reach the page through its storage keys, in its encoding;
  - the knobs view of a capture uses `knobs-<project>` keys, and leaves the source page's keys alone;
  - the `source | knobs` switch keeps `set` and `tab`;
  - the fixture line shows the stubs, the refusals and the fonts state;
  - the grid loads a capture's source cells one at a time, each on its own tab;
  - no fixture run leaves files under `playground/captures/`.
- `npm run test:unit` and `npm run test:browser` run as check jobs. After a real capture, `npm run playground:check-fixtures` runs as a check job.

## Out of scope

- Hosting the source pictures inside the knobs drawer through `visuals`, and any knobs runtime change.
- The scripted agent and browser reports of the wings-vdb homepage, and saving defaults.
- Making new mini-pylon renders, or making finals in the fixture.
- Starting either project's dev server, or writing to either checkout.
- A pixel comparison between source shots and fixture shots.

## Follow-ups

- If Josh starts mini-pylon's tweak server, rerun `npm run playground:capture -- mini-pylon` to add its source shots (handoff Next 3).
- The long-control-key overlap at 640 px (handoff Next 4) is still to be offered to file-issue.

## Open questions

- none
