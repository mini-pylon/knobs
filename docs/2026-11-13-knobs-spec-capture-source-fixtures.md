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

wings-vdb, read only (checked: `~/linda/repos/wings-vdb` working tree on `dispersal-controls-prototype` at `7f92902`, with uncommitted changes in `src/main.js`, `src/style.css`, `src/detail.js`, 2026-11-13):

- `index.html` holds the sky canvas, a fallback `<img src="/cloud-fallback.svg">`, the footer, the detail section and the chat section, and loads `<script type="module" src="/src/main.js">`.
- `src/main.js` imports `style.css`, `cloud-morph.js`, `terminal.js`, `perf.js`, `viz.js`, `params.js`, `shader.js`, `post.js`, `birds.js`, `chat.js`, `detail.js`, `dev-report.js` and `flags.js` (lines 1-13), builds `vizScene` from the live cloud, flocks and scroll (lines 304-319) and mounts the drawer with `pages: [perfPage(...)]` and `visuals: paramVisuals(vizScene)` (lines 320-322). It uses `import.meta.hot` (line 956), so it needs Vite.
- The stubbed modules' exports: `chat.js` `mountChatThread`, `respond`; `detail.js` `details`, `renderDetail`; `dev-report.js` `reportSettings`; `flags.js` `FLAGS`, `WAITLIST_URL`, `flags`. `main.js` imports `mountChatThread`, `details`, `renderDetail`, `reportSettings`, `flags`, `WAITLIST_URL` (lines 10-13).
- Absolute URLs at run time: `'/wings-wide.svg'` (`cloud-morph.js:39`), `fetch('/__wings/defaults')` (`main.js:461`), `'/__wings/report'` (`dev-report.js:14`), `url('/fonts/ABCArealVariable.woff2')` and `url('/fonts/ABCArealMonoVariable.woff2')` (`style.css:1-12`).
- Storage: values in `localStorage['wings-vdb:params']` (`params.js:139`, `params.js:178-185`), open tabs in `localStorage['wings-vdb:groups']` (`terminal.js:54-64`), drawer open in `sessionStorage['wings-vdb:drawer']` (`terminal.js:439`, `terminal.js:465`).
- `public/` is 6.9 MB (fonts, `options/` images and videos, two SVGs). The fonts are ABC Areal and ABC Areal Mono, commercial faces from Dinamo.

mini-pylon, read only (checked: `~/linda/repos/mini-pylon` working tree at `b984b47`; `tools/tweak/` and `tools/scene_params.py` are untracked, 2026-11-13):

- `tools/tweak/index.html` loads `tweak.css` and `tweak.js` by relative URL; `tweak.js` is a classic script that calls `/api/schema`, `/api/render` (`kind: 'preview'` or `'final'`), `/api/jobs/<id>` (polled until `done`, `failed` or `superseded`) and `/api/finals` (`tweak.js:65-75`, `tweak.js:91`, `tweak.js:152`, `tweak.js:329`, `tweak.js:571`). It stores `values`, `view`, `group`, `drawer`, `auto` and `history` under the prefix `mini-pylon-tweak:` (`tweak.js:5-7`, `tweak.js:22-25`, `tweak.js:200-201`, `tweak.js:542`, `tweak.js:551`, `tweak.js:577-580`).
- `tools/tweak_server.py` answers those routes and serves images at `/out/previews/` and `/out/finals/` (lines 293-321). A job's public fields are `id, kind, state, size, samples, url, seconds, error, name, ahead` (lines 196-200); a final in `/api/finals` has `name, file, state, url, size, queued, rendered, error, values` (lines 245-260). `--fake` draws a flat PNG whose colour is the first three bytes of the SHA-1 of the resolved values as sorted JSON, each `64 + b // 2`, at most 256 px (lines 77-95). Values are resolved against the schema's defaults (`scene_params.py:138-149`).
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
  wings-vdb/stubs/{chat,detail,dev-report,flags}.js
  mini-pylon/api.mjs                the tweak_server.py stand-in
  routes.mjs                        the absolute-path table and the fonts route
playground/check-fixtures.mjs       npm run playground:check-fixtures
```

### Snapshots, made by capture

`npm run playground:capture -- <project>` keeps doing what it does now and also writes `source/`. It reads the checkout only, as now. Each adapter gains a `vendor` list and, where needed, a `record` step.

wings-vdb:

- Copied byte for byte: `index.html`; `src/main.js`, `terminal.js`, `viz.js`, `perf.js`, `params.js`, `birds.js`, `cloud-morph.js`, `shader.js`, `post.js`, `style.css`; `public/cloud-fallback.svg`, `public/wings-wide.svg`. No font is copied.
- Stubbed, not copied: `chat.js`, `detail.js`, `dev-report.js`, `flags.js`. The stubs live in `playground/fixtures/wings-vdb/stubs/` and the fixture's Vite instance aliases the four imports to them. Each stub exports the names `main.js` imports: `mountChatThread` returns an object whose methods do nothing and the thread stays empty; `details` is `{}` and `renderDetail` does nothing; `reportSettings` does nothing; `flags` is `{}` (no flag on) and `WAITLIST_URL` is `'#waitlist'`. The chat toggle and panel are still in `index.html` and `main.js`, so they still open; nothing answers in them, and the footer shows no blurb for a shape.
- Capture fails, naming the cause, when a copied file imports a relative module that is neither copied nor stubbed, or imports a name a stub does not export.

mini-pylon:

- Copied byte for byte: `tools/tweak/index.html`, `tweak.js`, `tweak.css`.
- Recorded into `source/data/`: `schema.json` (the output of `schema()`, run with `python3 -B` as the adapter does now), `finals.json` (each final with a JSON side file, in the server's field order, with `url` pointing into the fixture), and `defaults.json` (the resolved defaults, scene and render). Each final's PNG is downscaled to the preview size into `source/renders/<file>.png`.
- `swatch.json` records the defaults' swatch colour, taken from mini-pylon's own code: capture imports `tools/tweak_server.py` with `python3 -B`, calls `write_swatch_png` for the resolved defaults into a temporary folder outside the checkout, and reads the pixel back. A unit test pins the JavaScript port against that answer.

`capture.json` gains:

- `vendored`: `{ files: [{ path, from, sha256 }], stubs: [{ module, by }], recorded: [path, …] }`, where `from` is the path in the source checkout and `by` is the stub's path in knobs.
- `sourceValues` on each value set: the values in the source's own storage form, so nothing is translated back from knobs form.

`untranslated` stays as it is: it describes the knobs translation, which still exists.

### Serving

All of this runs inside the existing playground server process (`servePlayground`), so the `knobs-playground` unit and the portal link stay as they are.

- One Vite instance per fixture, in middleware mode, with `root` at the fixture's `source/`, `base` at `/captures/<project>/source/` and the wings-vdb stub aliases. Requests under that prefix go to it.
- The absolute-path table in `playground/fixtures/routes.mjs` mounts each run-time absolute path at the root of the server, owned by one fixture: `/wings-wide.svg`, `/fonts/`, `/__wings/` (wings-vdb) and `/api/` (mini-pylon). Capture scans the vendored files for absolute URL strings and fails when one is not in the table, or when a table entry would shadow a path the playground itself serves.
- Fonts: `/fonts/ABCArealVariable.woff2` and `/fonts/ABCArealMonoVariable.woff2`, under the root and under the fixture's prefix, are read from `public/fonts/` of the checkout recorded in `capture.json`, or from `KNOBS_WINGS_FONTS` when set, read only. When the files are not there the route answers 404 and the page falls back to its own CSS font stack. `GET /captures/wings-vdb/fonts` answers `{ "fonts": "local" | "fallback" }`.
- `/__wings/defaults` answers an error the drawer prints: `defaults are not saved in the knobs fixture`. `/__wings/report` answers 204.
- The mini-pylon stand-in (`playground/fixtures/mini-pylon/api.mjs`) answers from `source/data/`:
  - `GET /api/schema` and `GET /api/finals` return the recorded data. `GET /api/status` returns an idle status in the server's shape.
  - `POST /api/render` with `kind: 'preview'` resolves the values against `defaults.json` with the server's rules and returns a job in the server's public fields. The job is `done` on its first poll. Its `url` is the final's downscaled render when the resolved scene values equal a recorded final's (ignoring `render.*`); otherwise it is a swatch PNG made by the ported `fake_renderer` rule (Node's `zlib` and `crypto`), served from memory under the fixture's prefix.
  - `POST /api/render` with `kind: 'final'` returns a job that is `failed` on its first poll with `error: 'finals are not made in the knobs fixture'`.
  - An unknown parameter answers 400 with the server's error text.

### Playground

- URL: `?s=capture:<project>&set=<value set>&tab=<group>&view=source|knobs`. `view` defaults to `knobs`, so existing links keep working.
- The capture view's header gets a `source | knobs` switch that changes `view` and keeps `set` and `tab`. In `source`, the stage frame loads `/captures/<project>/source/`. In `knobs`, the frame mounts the knobs translation as now.
- Before loading the source frame, the shell clears the project's storage keys and writes the chosen set's `sourceValues` and tab through the source's own keys. wings-vdb gets `localStorage['wings-vdb:params']`, `localStorage['wings-vdb:groups']` and `sessionStorage['wings-vdb:drawer'] = '1'`. mini-pylon gets `localStorage['mini-pylon-tweak:values']`, `…:view` = `params`, `…:group` and `…:drawer` = `true`. A viewer's own edits in the source frame last until they choose another set or tab.
- The capture view adds a fixture line: snapshot source and capture date, the stubbed modules, what the stand-in refuses (finals, saving defaults), and for wings-vdb `fonts: local` or `fonts: fallback (ABC Areal is not in this checkout)`.
- `grid.html?set=captures` shows three columns per tab: the source shot from `shots/` when there is one, the source view live, and the knobs view.
- `npm run playground:shots -- --only captures` also shoots each tab of each source view and labels those shots as fixture shots. wings-vdb's source view is shot with the Vulkan flags the adapter already uses.
- `npm run playground:check-fixtures` loads each committed source view headless, opens every tab, and fails when the page logs an error, a wings-vdb picture canvas is blank, or the mini-pylon preview image does not load. It runs as a check job after each capture; it is not part of `test:browser`.

### Notice

`playground/captures/NOTICE.md` says the `source/` folders are © their projects (wings-vdb, mini-pylon), all rights reserved, included in knobs as reference fixtures for the playground, and not covered by knobs' MIT licence. The README's Captures section links it. Capture never writes it; it is committed by hand.

### What becomes public

Committing the snapshots publishes, in public knobs: wings-vdb's front-end source listed above (about 300 KB, including the 1,777-line `shader.js` and the cloud), mini-pylon's tweak page, its schema, and about 1 MB of downscaled final renders. Josh approved this with the notice on 2026-11-13. No font file is committed.

## Testing

Test-first. Tests read only `tests/fixtures/`; they never read the real projects or the committed `source/` snapshots.

- New stand-in checkouts under `tests/fixtures/captures/`: a wings-vdb-like one gains an `index.html`, a `main.js` that imports `terminal.js` and a stubbed `chat.js`, a `viz.js` drawing one line on a canvas, and an absolute `fetch('/__wings/defaults')`; a mini-pylon-like one gains a `tools/tweak/` page that calls `/api/*`, and a small PNG beside its final's JSON.
- Unit (`tests/unit/playground-capture.test.mjs` and a new `tests/unit/playground-fixtures.test.mjs`):
  - capture copies the listed files byte for byte and records each one's sha256, source path and the stubs;
  - capture fails on a relative import that is neither copied nor stubbed, on a name a stub does not export, on an absolute URL not in the table, and on a table entry that shadows a playground path;
  - each value set carries `sourceValues`;
  - the stand-in: job fields match the server's public fields; a preview of a final's values returns that final's render; any other preview returns a swatch PNG whose colour matches `swatch.json`'s Python answer for the defaults; a final fails with the stated error; an unknown parameter answers 400;
  - the fonts route answers `local` with the files present and `fallback` without them.
- Browser (`tests/browser/playground.test.mjs`):
  - the source view loads each stand-in page under its prefix, and its absolute requests reach their owners;
  - a value set and tab reach the page through its storage keys;
  - the `source | knobs` switch keeps `set` and `tab`;
  - the fixture line shows the stubs, the refusals and the fonts state;
  - the grid shows three columns for a capture;
  - a request to a root path no fixture owns gets the playground's normal answer.
- `npm run test:unit` and `npm run test:browser` run as check jobs. After a real capture, `npm run playground:check-fixtures` runs as a check job.

## Out of scope

- Hosting the source pictures inside the knobs drawer through `visuals` (option 2 of the first question) and any knobs runtime change.
- The rest of the wings-vdb homepage: the scripted agent, the detail view, the waitlist flag, browser reports and saving defaults.
- Making new mini-pylon renders, or making finals in the fixture.
- Starting either project's dev server, or writing to either checkout.
- A pixel comparison between source shots and fixture shots.

## Follow-ups

- If Josh starts mini-pylon's tweak server, rerun `npm run playground:capture -- mini-pylon` to add its source shots (handoff Next 3).
- The long-control-key overlap at 640 px (handoff Next 4) is still to be offered to file-issue.

## Open questions

- Whether Vite with `base` rewrites `index.html`'s absolute `/src/main.js` and `/cloud-fallback.svg` under the prefix in middleware mode (unchecked). If it does not, the wings-vdb fixture's Vite instance gets an HTML transform that adds the prefix to those two attributes, and the copied file stays unchanged on disk.
- Whether the preview size for downscaled finals is `render.preview_size`'s default (read from `defaults.json` at capture) or a fixed size; this spec assumes the default (unchecked).
