// Excerpt of wings-vdb's src/main.js: the drawer commands the capture adapter lists.
const terminal = mountTerminal({
  commands: {
    goto: { usage: '<progress|name>', about: 'scroll to a progress value or shape', run([arg]) {
    } },
    ui: { usage: 'on|off', about: 'show or hide the page\'s UI', run([arg]) {
    } },
    shot: { usage: '[width]', about: 'download a high-res PNG of the frame', run([arg]) {
    } },
    defaults: { usage: '[dry] [group|group.key ...]', about: 'make the current values the defaults in src/params.js', run(args) {
    } },
  },
});
