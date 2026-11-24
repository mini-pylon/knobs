// Stand-in for wings-vdb's src/main.js: the drawer commands the capture
// adapter lists, and the page's uses of what the fixture stubs or serves at
// the server root (the chat thread, /__wings/defaults, /wings-wide.svg).
import './style.css';
import { mountCloudMorph } from './cloud-morph.js';
import { mountTerminal } from './terminal.js';
import { perfPage } from './perf.js';
import { paramVisuals } from './viz.js';
import * as params from './params.js';
import { fragmentSource } from './shader.js';
import { postSource } from './post.js';
import { flockKinds } from './birds.js';
import { mountChatThread } from './chat.js';
import { details, renderDetail } from './detail.js';
import { reportSettings } from './dev-report.js';
import { flags, WAITLIST_URL } from './flags.js';

reportSettings();
document.body.dataset.waitlist = String(flags.waitlist);
document.body.dataset.modules = [fragmentSource, postSource, flockKinds.join(' '), WAITLIST_URL].join('|');
mountCloudMorph();

const terminal = mountTerminal({
  pages: [perfPage()],
  visuals: paramVisuals(),
  commands: {
    goto: { usage: '<progress|name>', about: 'scroll to a progress value or shape', run([arg]) {
      return `goto ${arg ?? ''}`;
    } },
    ui: { usage: 'on|off', about: 'show or hide the page\'s UI', run([arg]) {
      return `ui ${arg ?? ''}`;
    } },
    shot: { usage: '[width]', about: 'download a high-res PNG of the frame', run([arg]) {
      return `shot ${arg ?? ''}`;
    } },
    defaults: { usage: '[dry] [group|group.key ...]', about: 'make the current values the defaults in src/params.js', run(args) {
      fetch('/__wings/defaults', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ values: params.values, wants: args, dryRun: false }) })
        .then(r => (r.ok ? r.json() : Promise.reject(new Error(`server said ${r.status}`))))
        .then(({ changes, errors }) => {
          for (const e of errors) terminal.print(`defaults: ${e}`, 'err');
          if (!changes.length) terminal.print('defaults: nothing to change', 'dim');
        })
        .catch(error => terminal.print(`defaults: only on the dev server (${error.message})`, 'err'));
      return 'saving…';
    } },
  },
});
terminal.run('defaults');

// As the real page lays out its chat: the thread's getters, its pills and its fit.
const thread = mountChatThread({ thread: document.querySelector('.chat-thread'), pills: document.querySelector('.chat-pills'), input: document.querySelector('.chat input') });
const pills = thread.layoutPills({ width: 300, top: 0 });
const room = Math.max(0, thread.fit(120));
document.body.dataset.chat = `${thread.empty ? 'empty' : 'thread'} ${thread.expanded ? 'expanded' : 'panel'} ${pills.height + room} ${pills.boxes.length}`;
renderDetail(document.body.appendChild(document.createElement('section')), Object.keys(details)[0]);
