// npm run playground [-- --port 5380 --host 127.0.0.1 --allow-host knobs.example.com]
// --allow-host (repeatable) lets a proxy in front reach it under that name.
// Serves the playground until stopped. Run it as a systemd user unit to keep
// it up; see playground/README.md.
import { parseArgs } from 'node:util';
import { servePlayground } from './server.mjs';

const { values } = parseArgs({ options: {
  port: { type: 'string', default: '5380' },
  host: { type: 'string', default: '127.0.0.1' },
  'allow-host': { type: 'string', multiple: true, default: [] },
} });
const site = await servePlayground({ host: values.host, port: Number(values.port), allowedHosts: values['allow-host'] });
console.log(`knobs playground: ${site.url}  (grid: ${site.url}grid.html)`);
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    try { await site.close(); } finally { process.exit(0); }
  });
}
