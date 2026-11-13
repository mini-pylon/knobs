// Excerpt of wings-vdb's src/terminal.js: the lines the capture adapter reads.
const HIDDEN_TABS = new Set(['hover', 'birds', 'opening']);

  const slashActions = [
    { name: 'save', usage: '[name]', about: 'download the whole configuration as a JSON file' },
    { name: 'shot', usage: '[width]', about: 'download a high-res PNG of the current frame' },
    { name: 'load', usage: '', about: 'load a saved configuration file' },
  ];
