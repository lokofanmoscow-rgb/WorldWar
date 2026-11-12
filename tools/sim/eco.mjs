// economy snapshot of a country at given dates: --a GER --dates 1938-01-01,1939-09-01
import { startGame, tick } from '../../web/src/core/game.js';
import { fmtDate, dayOf } from '../../web/src/core/util.js';
import { divsOf } from '../../web/src/core/land.js';
import { availableCivs, maxManpower } from '../../web/src/core/economy.js';
const arg = (name, def) => { const i = process.argv.indexOf('--' + name); return i >= 0 ? process.argv[i + 1] : def; };
const tags = arg('a', 'GER').split(',');
const dates = arg('dates', '1938-01-01').split(',').map((s) => { const [y, m, d] = s.split('-').map(Number); return dayOf(y, m, d); });
const G = startGame(null, { seed: Number(arg('seed', 1)) });
for (const day of dates) {
  while (G.day < day) tick(G);
  for (const A of tags) {
    const c = G.ctr[A];
    const byT = {};
    for (const d of divsOf(G, A)) byT[d.t] = (byT[d.t] || 0) + 1;
    console.log(`--- ${fmtDate(G.day)} ${A}: civ ${c._civ} (free ${availableCivs(c)}, consumer ${c._consumer.toFixed(2)}, trade -${c.trade.cost.toFixed(1)} +${c.trade.gain.toFixed(1)}) mil ${c._mil} dock ${c._dock} pp ${Math.round(c.pp)} stab ${c.stab.toFixed(2)} ws ${c.ws.toFixed(2)} laws ${JSON.stringify(c.laws)} adv ${c.adv.join(',')}`);
    console.log(`    divs ${JSON.stringify(byT)} train ${c.train.map((t) => t.tpl).join(',')} mp ${Math.round(c.mp)}k / max ${Math.round(maxManpower(c))}k lost ${Math.round(c.mpLost)}k`);
    console.log(`    tpl inf ${JSON.stringify(c.tpl.inf.bats)} ${c.tpl.inf.sup} cost ${Math.round(c.tpl.inf._s.cost)}`);
    console.log('    lines ' + c.lines.map((l) => `${l.eq}:${l.fac}@${l.eff.toFixed(2)}=${(l._out || 0).toFixed(1)}/d`).join(' '));
    console.log('    docks ' + c.docks.map((l) => `${l.ship}:${l.fac}`).join(' ') + ' convoys ' + Math.round(c.convoys));
    console.log('    stock ' + Object.keys(c.stock).map((k) => `${k}:${Math.round(c.stock[k])}`).join(' '));
    console.log('    need  ' + Object.keys(c.need).map((k) => `${k}:${Math.round(c.need[k])}(${Math.round(c.fielded[k] || 0)})`).join(' '));
    console.log('    res ' + Object.keys(c._bal).map((k) => `${k}:${c._res[k].toFixed(0)}/${c._need[k].toFixed(0)}${c._short[k] > 0 ? '!' + c._short[k].toFixed(2) : ''}`).join(' ') + ' imp ' + JSON.stringify(c.trade.imp));
    console.log('    tech ' + Object.keys(c.tech).length + ' research ' + c.research.filter(Boolean).map((r) => r.id).join(',') + ' focus ' + c.focus.cur + ' build ' + c.build.map((b) => b.t).join(','));
  }
}
