// Shows how the general staff of --a distributes its divisions on --date.
import { startGame, tick } from '../../web/src/core/game.js';
import { dayOf, fmtDate } from '../../web/src/core/util.js';
import { analyse } from '../../web/src/core/staff.js';
import { divsIn, divsOf } from '../../web/src/core/land.js';
import { REG, NREG } from '../../web/src/core/world.js';
import { regionSupplyCap } from '../../web/src/core/supply.js';
const arg = (name, def) => { const i = process.argv.indexOf('--' + name); return i >= 0 ? process.argv[i + 1] : def; };
const A = arg('a', 'GER');
const [y, m, d] = arg('date', '1940-08-17').split('-').map(Number);
const G = startGame(null, { seed: 1 });
while (G.day < dayOf(y, m, d)) tick(G);
const c = G.ctr[A];
const An = analyse(G, c);
const rows = [];
let W = 0;
for (let i = 0; i < NREG; i++) if (An.want[i] > 0) { W += An.want[i]; rows.push(i); }
rows.sort((a, b) => An.want[b] - An.want[a]);
const N = divsOf(G, A).length;
console.log(fmtDate(G.day), A, 'divs', N, 'W', W.toFixed(1), 'comps', An.nc, 'stances', JSON.stringify(c.staff.fronts));
for (const i of rows.slice(0, 30)) {
  const have = divsIn(G, i).filter((x) => x.o === A).length;
  console.log(`  ${REG[i].name.padEnd(24)} want ${An.want[i].toFixed(2).padStart(6)} share ${(N * An.want[i] / W).toFixed(1).padStart(5)} have ${String(have).padStart(3)} cap ${regionSupplyCap(G, i).toFixed(0)} ctl ${G.reg[i].c}`);
}
const byReg = {};
for (const dv of divsOf(G, A)) byReg[dv.r] = (byReg[dv.r] || 0) + 1;
console.log('actual top:', Object.entries(byReg).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([r, n]) => `${REG[r].name}:${n}`).join(', '));
