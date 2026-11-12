// Debug trace of a country's fronts. Usage: --a GER --from 1940-05-05 --days 90 --step 10 [--seed 1]
import { startGame, tick } from '../../web/src/core/game.js';
import { fmtDate, dayOf } from '../../web/src/core/util.js';
import { divsOf, divsIn, divPower } from '../../web/src/core/land.js';
import { atWar, vpLost, surrenderLimit, enemies, friendly } from '../../web/src/core/diplo.js';
import { REG, NREG } from '../../web/src/core/world.js';
const arg = (name, def) => { const i = process.argv.indexOf('--' + name); return i >= 0 ? process.argv[i + 1] : def; };
const A = arg('a', 'GER');
const [y, m, d] = arg('from', '1939-08-25').split('-').map(Number);
const from = dayOf(y, m, d), days = Number(arg('days', 60)), step = Number(arg('step', 5));
const G = startGame(null, { seed: Number(arg('seed', 1)) });
while (G.day < from) tick(G);
for (let k = 0; k <= days; k++) {
  if (k % step === 0) {
    const ca = G.ctr[A];
    const all = divsOf(G, A);
    let org = 0, low = 0, sea = 0, mov = 0;
    for (const dv of all) { org += dv.org / ca.tpl[dv.t]._s.org; if (dv.sup < 1) low++; if (dv.sea || dv.tr) sea++; if (dv.path.length) mov++; }
    console.log(`${fmtDate(G.day)} ${A}: divs ${all.length} org ${(org / Math.max(1, all.length)).toFixed(2)} lowsup ${low} moving ${mov} sea ${sea} mp ${Math.round(ca.mp)}k mil ${ca._mil} conv ${Math.round(ca.convoys)} fill ${Object.keys(ca.need).map((e) => e + ':' + ((ca.fielded[e] || 0) / Math.max(1, ca.need[e])).toFixed(2)).join(' ')}`);
    for (const e of enemies(G, A)) {
      const ce = G.ctr[e];
      if (!ce.alive) continue;
      let ours = 0, theirs = 0, op = 0, tp = 0, regs = 0;
      const seenO = new Set(), seenT = new Set();
      for (let i = 0; i < NREG; i++) {
        if (G.reg[i].c !== e) continue;
        let touch = false;
        for (const j of REG[i].adj) {
          const o = G.reg[j].c;
          if (o === A || friendly(G, A, o)) { touch = true; for (const dv of divsIn(G, j)) if (dv.o === A && !seenO.has(dv.id)) { seenO.add(dv.id); ours++; op += divPower(G, dv, false); } }
        }
        if (touch) { regs++; for (const dv of divsIn(G, i)) if (atWar(G, A, dv.o) && !seenT.has(dv.id)) { seenT.add(dv.id); theirs++; tp += divPower(G, dv, true); } }
      }
      if (!regs && !ce.capit) { continue; }
      const battles = Object.values(G.battles).filter((b) => G.reg[b.r].c === e || (b.def === A && b.att === e)).map((b) => `${REG[b.r].name}(${b.att}:${b.na}v${b.nd},${b.bal.toFixed(2)})`).join(' ');
      console.log(`    vs ${e}${ce.capit ? '(cap)' : ''}: front regs ${regs} ours ${ours} (${Math.round(op)}) theirs ${theirs} (${Math.round(tp)}) stance ${JSON.stringify(ca.staff.fronts[e] || null)} their divs ${divsOf(G, e).length} vp ${vpLost(G, e).ratio.toFixed(2)}/${surrenderLimit(G, ce).toFixed(2)} ${battles}`);
    }
  }
  tick(G);
}
