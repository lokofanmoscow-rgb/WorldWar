// Headless all-AI simulation used to test and balance the game core.
//   npm run sim -- --years 10 --seed 7 [--quiet] [--player GER]
import { startGame, tick, serialize, deserialize } from '../../web/src/core/game.js';
import { fmtDate, dayOf } from '../../web/src/core/util.js';
import { divsOf } from '../../web/src/core/land.js';
import { enemies } from '../../web/src/core/diplo.js';
import { shipsTotal } from '../../web/src/core/navy.js';
import { COUNTRIES } from '../../web/src/data/countries.js';

const arg = (name, def) => { const i = process.argv.indexOf('--' + name); return i >= 0 ? process.argv[i + 1] : def; };
const years = Number(arg('years', 10));
const seed = Number(arg('seed', 1));
const quiet = process.argv.includes('--quiet');
const player = arg('player', null);

const t0 = Date.now();
let G = startGame(player, { seed });
if (player) G.opts.autoPeace = true;
console.log('world built in', Date.now() - t0, 'ms; divisions:', Object.keys(G.divs).length, 'wings:', G.wings.length, 'fleets:', G.fleets.length);
const majors = Object.keys(COUNTRIES).filter((t) => COUNTRIES[t].major);
let seen = 0;
const end = dayOf(1936 + years, 1, 1);
let worst = 0;
function check() {
  for (const c of Object.values(G.ctr)) {
    for (const k of ['pp', 'stab', 'ws', 'mp', 'convoys']) if (!Number.isFinite(c[k])) throw new Error(`NaN ${c.tag}.${k}`);
    for (const k in c.stock) if (!Number.isFinite(c.stock[k]) || c.stock[k] < -1e-6) throw new Error(`bad stock ${c.tag}.${k}=${c.stock[k]}`);
    for (const k in c.fielded) if (!Number.isFinite(c.fielded[k])) throw new Error(`bad fielded ${c.tag}.${k}`);
  }
  for (const id in G.divs) { const d = G.divs[id]; if (!Number.isFinite(d.org) || !Number.isFinite(d.str)) throw new Error('NaN division ' + JSON.stringify(d)); }
  for (const w of G.wings) if (!Number.isFinite(w.n)) throw new Error('NaN wing');
}
while (G.day < end) {
  const t1 = process.hrtime.bigint();
  tick(G);
  const ms = Number(process.hrtime.bigint() - t1) / 1e6;
  if (ms > worst) worst = ms;
  if (player) { // auto-answer events for a scripted "player"
    while (G.evq.length) G.evq.shift();
  }
  for (; seen < G.news.length; seen++) {
    const n = G.news[seen];
    if (!quiet && (n.k === 'war' || n.k === 'diplo')) console.log(`  ${fmtDate(n.d)}: ${n.t}`);
  }
  if (G.news.length >= 160) seen = Math.min(seen, G.news.length);
  if (G.day % 30 === 0) check();
  if (G.day % 365 === 0 || G.day === end) {
    // save/load round trip must not change anything visible
    const s = serialize(G);
    G = deserialize(s);
    seen = G.news.length;
    console.log(`=== ${fmtDate(G.day)} === tension ${G.tension.toFixed(0)}%, divisions ${Object.keys(G.divs).length}, save ${(s.length / 1024).toFixed(0)} KB`);
    for (const t of majors) {
      const c = G.ctr[t];
      if (!c.alive) { console.log(`  ${t}: —`); continue; }
      const sh = shipsTotal(G, t);
      const planes = G.wings.filter((w) => w.o === t).reduce((a, w) => a + w.n, 0);
      console.log(`  ${t}${c.capit ? '(cap)' : ''}: civ ${c._civ} mil ${c._mil} dock ${c._dock} | divs ${divsOf(G, t).length} train ${c.train.length} mp ${Math.round(c.mp)}k | planes ${Math.round(planes)} ships ${sh.dd + sh.cl + sh.bb + sh.cv + sh.ss} | regs ${c._regs} | war: ${enemies(G, t).filter((e) => G.ctr[e].alive).join(',') || '-'} | lost ${Math.round(c.stats.lost)}k`);
    }
  }
}
const alive = Object.values(G.ctr).filter((c) => c.alive).length;
console.log(`done: ${G.day} days in ${((Date.now() - t0) / 1000).toFixed(1)} s (${((Date.now() - t0) / G.day).toFixed(2)} ms/day, worst ${worst.toFixed(0)} ms); countries alive: ${alive}`);
