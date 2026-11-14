// Profiling helper: runs the world to --to (default 1941-09-01) then times --days more days.
import { startGame, tick } from '../../web/src/core/game.js';
import { dayOf, fmtDate } from '../../web/src/core/util.js';
const arg = (name, def) => { const i = process.argv.indexOf('--' + name); return i >= 0 ? process.argv[i + 1] : def; };
const [y, m, d] = arg('to', '1941-09-01').split('-').map(Number);
const G = startGame(null, { seed: 1 });
const t0 = Date.now();
while (G.day < dayOf(y, m, d)) tick(G);
console.log('warm-up to', fmtDate(G.day), (Date.now() - t0) / 1000, 's');
globalThis.__startProfile && globalThis.__startProfile();
const t1 = process.hrtime.bigint();
const n = Number(arg('days', 120));
for (let i = 0; i < n; i++) tick(G);
console.log('ms/day', (Number(process.hrtime.bigint() - t1) / 1e6 / n).toFixed(2), 'divs', Object.keys(G.divs).length);
