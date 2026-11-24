// Detail views: what a click on an object opens (main.js setDive), keyed by
// the model's name. The blurb is the footer's description, centred, on the
// homepage and in the detail view (main.js updateLabels); render, when a program has one, fills #detail with that program's
// own content (none yet).
export const details = {
  // The opening sky: a description in the footer, but no detail view (no hit box).
  sky: {
    blurb: 'The agent runtime for design.',
  },
  loop: {
    blurb: 'Design skills for every agent.',
  },
  kits: {
    blurb: 'Domain knowledge you can extend.',
  },
  portal: {
    blurb: 'Private links for early feedback.',
  },
  machine: {
    blurb: 'One-click compute for design agents.',
  },
  // The closing wordmark: likewise no detail view.
  wings: {
    blurb: '© 2026 Wings Research, L.L.C.',
  },
};

// Fills the detail view for a model; empty when it has none.
export function renderDetail(root, name) {
  root.replaceChildren();
  details[name]?.render?.(root);
}
