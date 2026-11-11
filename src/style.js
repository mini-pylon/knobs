// Drawer rules from the frozen stylesheet. :host beats a page rule such as
// `* { color: red !important }`, which matches the host from outside.
export const css = `
:host {
  all: initial !important;
  display: block !important;
  position: fixed !important;
  inset: auto 0 0 !important;
  z-index: 2147483647 !important;
  --drawer: min(30vh, 210px);
  --term-bg: #13191f;
  --term-fg: #d8e1e8;
  --term-dim: #7d8b96;
  --term-act: #e8c547;
  --term-act-hi: #fff1a6;
  --term-line: rgba(255, 255, 255, .08);
  --term-err: #ff9a9a;
  --mono: ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, Consolas, monospace;
  --pad: 16px;
}
* { box-sizing: border-box; }
.term { position: relative; font: 12px/1.5 var(--mono); color: var(--term-fg); --pad: 16px; }
.term-drawer {
  position: absolute; inset: auto 0 0; height: var(--drawer); display: flex; flex-direction: column;
  background: var(--term-bg); border-top: 1px solid var(--term-line);
  translate: 0 100%; visibility: hidden; transition: translate .22s ease, visibility 0s .22s;
  padding-bottom: env(safe-area-inset-bottom);
}
.term.open .term-drawer { translate: 0 0; visibility: visible; transition: translate .22s ease; }
button { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; }
input, select { font: inherit; color: inherit; background: none; border: 0; padding: 0; }
.term-head { position: relative; display: flex; align-items: center; gap: 16px; padding: var(--pad) var(--pad) 10px; line-height: 1; }
.term-tabs { display: flex; gap: 16px; overflow-x: auto; }
.term-tab, .term-close { color: var(--term-act); }
.term-tab.active, .term-tab:hover, .term-close:hover { color: var(--term-act-hi); }
.term-close { margin-left: auto; font-size: 16px; line-height: 12px; }
.term-status { flex: 1; text-align: right; color: var(--term-fg); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.term-slash { background: var(--term-bg); border: 1px solid var(--term-line); border-radius: 4px; padding: 6px 0; }
.term-slash[hidden] { display: none; }
.term-empty { color: var(--term-dim); padding: 4px var(--pad); }
.term-body { flex: 1; min-height: 0; display: grid; grid-template-rows: minmax(0, 1fr); padding-bottom: var(--pad); }
.term-body > [hidden] { display: none; }
.term-vars { overflow-y: auto; overscroll-behavior: contain; min-height: 0; }
.term-params { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); gap: 24px; min-height: 0; }
.term-viz { min-width: 0; min-height: 0; padding-right: var(--pad); }
.viz-chart { width: 100%; height: 100%; min-height: 0; display: block; }
@media (max-width: 760px) { .term-params { grid-template-columns: 1fr; } .term-viz { display: none; } }
.term-row { display: grid; grid-template-columns: 18ch minmax(0, 24ch) 6ch; gap: 16px; align-items: center; padding: 1px var(--pad); white-space: nowrap; }
.term-key { color: var(--term-act); cursor: default; user-select: none; }
.term-row.changed .term-key, .term-row:hover .term-key { color: var(--term-act-hi); }
.term-about { display: none; }
.term-bar { position: relative; height: 14px; cursor: ew-resize; user-select: none; touch-action: none; outline: none; }
.term-bar::before { content: ''; position: absolute; inset: 6px 0; background: var(--term-line); }
.term-fill { position: absolute; left: 0; top: 6px; bottom: 6px; background: var(--term-fg); }
.term-bar:focus-visible::before { background: var(--term-dim); }
.term-toggle { justify-self: start; color: var(--term-act-hi); }
.term-toggle.off { color: var(--term-act); }
.term-toggle:focus-visible { outline: 1px solid var(--term-dim); outline-offset: 2px; }
.term-value { text-align: right; font-variant-numeric: tabular-nums; }
.term-row select, .term-row input[type="text"] { width: 100%; min-width: 0; }
.term-row input[type="color"] { width: 100%; height: 14px; }
.term-page-performance { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 24px; padding: 0 var(--pad); min-height: 0; }
.perf-stats { overflow-y: auto; overscroll-behavior: contain; min-height: 0; }
.perf-row { display: grid; grid-template-columns: 10ch minmax(0, 1fr); gap: 16px; white-space: nowrap; }
.perf-key { color: var(--term-fg); }
.perf-value { overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }
.perf-chart { width: 100%; height: 100%; min-height: 0; display: block; }
@media (max-width: 760px) { .term-page-performance { grid-template-columns: 1fr; } .perf-chart { display: none; } }
.term-console { position: relative; display: flex; flex-direction: column; min-height: 0; }
.term-slash { position: absolute; left: 8px; right: 8px; z-index: 2; }
.term-slash-item { display: grid; grid-template-columns: 7ch 13ch minmax(0, 1fr); gap: 10px; padding: 2px 10px; cursor: pointer; white-space: nowrap; }
.term-slash-item.active { background: var(--term-line); }
.term-slash-name { color: var(--term-act); }
.term-slash-usage, .term-slash-about { color: var(--term-dim); }
.term-slash-about { overflow: hidden; text-overflow: ellipsis; }
.term-log { flex: 1; overflow-y: auto; overscroll-behavior: contain; padding: 0 var(--pad); color: var(--term-dim); }
.term-line { white-space: pre-wrap; word-break: break-word; }
.term-line.cmd { color: var(--term-fg); }
.term-line.err { color: var(--term-err); }
.term-prompt { display: flex; gap: 8px; padding: 6px var(--pad) 0; color: var(--term-act); }
.term-prompt input { flex: 1; min-width: 0; font: inherit; color: var(--term-fg); background: none; border: 0; outline: none; caret-color: var(--term-fg); }
@media (max-width: 760px) {
  :host { --drawer: min(44vh, 320px); }
  .term-row { grid-template-columns: 17ch minmax(0, 1fr) 5ch; gap: 12px; padding: 3px var(--pad); }
  .term-status { display: none; }
  .term-head { gap: 12px; }
  .term-tabs { flex: 0 1 auto; min-width: 0; gap: 12px; }
  .term-prompt input { font-size: 16px; }
}
`;
