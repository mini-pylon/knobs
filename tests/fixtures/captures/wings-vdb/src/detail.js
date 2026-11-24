// Stand-in for wings-vdb's src/detail.js: footer copy, one entry.
export const details = { wings: 'Wings, the stand-in.' };
export function renderDetail(root, name) {
  root.className = 'detail';
  root.textContent = details[name] ?? '';
}
