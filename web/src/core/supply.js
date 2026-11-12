// Supply: divisions must trace a land route to the capital or to a friendly port.
import { REG, NREG, TERRAIN } from './world.js';
import { friendly } from './diplo.js';
import { divsOf, buildIndex } from './land.js';

export function regionSupplyCap(G, i) {
  const r = G.reg[i];
  return (8 + 7 * r.infra) * TERRAIN[REG[i].terrain].sup * (r.port > 0 ? 1.2 : 1);
}

/** recompute d.sup for every division (0 = cut off … 1 = fully supplied) */
export function supplyTick(G) {
  if (!G._byReg) buildIndex(G);
  // stacking: all divisions in a region share its capacity
  const use = new Float32Array(NREG);
  for (const id in G.divs) {
    const d = G.divs[id];
    if (d.sea) continue;
    use[d.r] += G.ctr[d.o].tpl[d.t]._s.sup;
  }
  const state = new Uint8Array(NREG);
  for (const c of Object.values(G.ctr)) {
    const divs = divsOf(G, c.tag);
    if (!divs.length) continue;
    state.fill(0);
    const q = [];
    const tag = c.tag;
    if (c.cap >= 0 && G.reg[c.cap].c === tag) { state[c.cap] = 2; q.push(c.cap); }
    // land network from the capital
    for (let h = 0; h < q.length; h++) {
      const u = q[h];
      for (const v of REG[u].adj) {
        if (state[v]) continue;
        const ctl = G.reg[v].c;
        if (ctl === tag || friendly(G, tag, ctl)) { state[v] = 2; q.push(v); }
      }
    }
    // overseas: friendly ports feed the land around them through convoys
    const eff = c._convoyEff ?? 1;
    const q2 = [];
    for (let i = 0; i < NREG; i++) {
      if (state[i] || G.reg[i].port <= 0) continue;
      const ctl = G.reg[i].c;
      if (ctl === tag || friendly(G, tag, ctl)) { state[i] = 1; q2.push(i); }
    }
    for (let h = 0; h < q2.length; h++) {
      const u = q2[h];
      for (const v of REG[u].adj) {
        if (state[v]) continue;
        const ctl = G.reg[v].c;
        if (ctl === tag || friendly(G, tag, ctl)) { state[v] = 1; q2.push(v); }
      }
    }
    for (const d of divs) {
      if (d.sea) { d.sup = 1; continue; }
      const st = state[d.r];
      let s = st === 2 ? 1 : st === 1 ? 0.35 + 0.65 * eff : 0;
      if (s > 0) {
        const cap = regionSupplyCap(G, d.r);
        if (use[d.r] > cap) s *= Math.max(0.4, cap / use[d.r]);
      }
      // grace: a division only counts as cut off after several days
      if (s === 0) { d.cut = (d.cut || 0) + 1; if (d.cut < 3) s = 0.5; } else d.cut = 0;
      d.sup = s;
    }
  }
}
