// Stand-in for wings-vdb's src/cloud-morph.js: it fetches the wordmark from
// the server root, as the real one's default svgUrl does.
export function mountCloudMorph({ svgUrl = '/wings-wide.svg' } = {}) {
  return fetch(svgUrl).then(r => r.text()).then(text => {
    document.body.dataset.wordmark = text.includes('<svg') ? 'loaded' : 'missing';
  });
}
