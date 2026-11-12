// General Staff: automatic deployment of divisions along fronts, attack planning, sea operations.
// Used by AI countries and by the player's own army when automation is switched on.
import { REG, NREG, TERRAIN, distKm } from './world.js';
import { COUNTRIES } from '../data/countries.js';
import { atWar, friendly, enemies, opinion, sameSide } from './diplo.js';
import { divsOf, divsIn, hostileDivs, orderMove, divPower, battleWidth } from './land.js';
import { orderSea, dominance, homeZone, canPass, routeBetween, bestPort } from './navy.js';
import { regionSupplyCap } from './supply.js';

export const STANCES = {
  none: { name: 'Не держать', w: 0 },
  hold: { name: 'Оборона', w: 1 },
  attack: { name: 'Наступление', w: 1.4 },
  blitz: { name: 'Прорыв', w: 1.7 },
};

export function frontOrder(c, enemy) {
  return c.staff.fronts[enemy] || { st: 'hold', pr: 2 };
}
function peaceWeight(G, c, other) {
  const s = c.staff.fronts[other];
  const o = G.ctr[other];
  if (!o || !o.alive) return 0;
  if (c.ai.prep && c.ai.prep[other] && c.ai.prepUntil > G.day) return 2.4;
  if (G.justify.some((j) => j.a === c.tag && j.b === other)) return 2.5;
  if (s) return s.st === 'none' ? 0 : 0.35 * s.pr;
  if ((G.wargoals[other + '>' + c.tag] || 0) > G.day || G.justify.some((j) => j.a === other && j.b === c.tag)) return 1;
  const op = opinion(G, c.tag, other);
  let w = op < -30 ? 0.5 : op < 0 ? 0.2 : 0.05;
  if (COUNTRIES[other].major && o.ideo !== c.ideo) w += 0.3;
  return w;
}

/** who holds what from the point of view of country c */
export function analyse(G, c) {
  const tag = c.tag;
  const pass = new Uint8Array(NREG);
  for (let i = 0; i < NREG; i++) { const ctl = G.reg[i].c; pass[i] = ctl === tag ? 1 : friendly(G, tag, ctl) ? 2 : 0; }
  const comp = new Int16Array(NREG).fill(-1);
  let nc = 0;
  for (let i = 0; i < NREG; i++) {
    if (!pass[i] || comp[i] >= 0) continue;
    const q = [i];
    comp[i] = nc;
    while (q.length) { const u = q.pop(); for (const v of REG[u].adj) if (pass[v] && comp[v] < 0) { comp[v] = nc; q.push(v); } }
    nc++;
  }
  const want = new Float32Array(NREG);
  const fw = new Float32Array(NREG);
  const contact = new Float32Array(nc);     // enemy contact weight per component
  const atwar = enemies(G, tag).some((e) => G.ctr[e].alive);
  for (let i = 0; i < NREG; i++) {
    if (!pass[i]) continue;
    let w = 0, hostile = false;
    for (const j of REG[i].adj) {
      if (pass[j]) continue;
      const ctl = G.reg[j].c;
      if (atWar(G, tag, ctl)) {
        const st = frontOrder(c, ctl);
        const sw = STANCES[st.st].w * st.pr * 0.5;
        if (sw <= 0) continue;
        hostile = true;
        w += sw * (1 + 0.5 * Math.min(6, hostileDivs(G, j, tag).length));
      } else if (pass[i] === 1) w += peaceWeight(G, c, ctl) * (atwar ? 0.25 : 1);
    }
    if (pass[i] === 2) w = hostile ? w * 0.7 : 0;
    if (hostile) { w += G.reg[i].vp * 0.05; contact[comp[i]] += w; fw[i] = w; }
    want[i] = w;
  }
  // second echelon: regions right behind an active front hold reserves
  for (let i = 0; i < NREG; i++) {
    if (pass[i] !== 1 || fw[i] > 0) continue;
    let m = 0;
    for (const j of REG[i].adj) if (fw[j] > m) m = fw[j];
    if (m > 0) want[i] += 0.3 * m;
  }
  if (c.cap >= 0 && pass[c.cap] === 1) want[c.cap] += atwar ? 0.8 : 0.5;
  if (atwar && c.staff.coast > 0) {
    for (let i = 0; i < NREG; i++) {
      const r = G.reg[i];
      if (pass[i] === 1 && REG[i].seas.length && (r.port > 0 || r.vp >= 5)) want[i] += 0.2 * c.staff.coast * (r.core === tag ? 1 : 0.5);
    }
  }
  return { pass, comp, nc, want, contact, atwar };
}

const dest = (d) => (d.path.length ? d.path[d.path.length - 1] : d.r);
const free = (d) => !d.sea && !d.ret && !d.man && !d.tr && d.amph === undefined;

function redeploy(G, c, A, divs) {
  const byComp = new Map();
  for (const d of divs) {
    const k = A.comp[d.r];
    if (k < 0) continue;
    (byComp.get(k) || byComp.set(k, []).get(k)).push(d);
  }
  const have = new Float32Array(NREG);
  for (const [k, list] of byComp) {
    let W = 0;
    const regs = [];
    for (let i = 0; i < NREG; i++) if (A.comp[i] === k && A.want[i] > 0) { W += A.want[i]; regs.push(i); }
    if (W <= 0) continue;
    const N = list.length;
    for (const i of regs) have[i] = 0;
    for (const d of list) have[dest(d)] = (have[dest(d)] || 0) + 1;
    // targets limited by what a region can supply (overflow spills to the other regions)
    const tg = new Map();
    let pool = N, active = regs.slice();
    for (let it = 0; it < 4 && pool > 0.5 && active.length; it++) {
      let Wa = 0;
      for (const i of active) Wa += A.want[i];
      const next = [];
      let used = 0;
      for (const i of active) {
        let others = 0;
        for (const o of divsIn(G, i)) if (o.o !== c.tag) others++;
        const cap = Math.max(1, Math.min(regionSupplyCap(G, i) / 0.95, (battleWidth(i, 2) / 20) * 2) - others);
        const cur = tg.get(i) || 0;
        const add = Math.min((pool * A.want[i]) / Wa, cap - cur);
        tg.set(i, cur + add); used += add;
        if (cur + add < cap - 0.01) next.push(i);
      }
      pool -= used; active = next;
    }
    const target = (i) => tg.get(i) || 0;
    const deficits = regs.map((i) => [target(i) - have[i], i]).filter((x) => x[0] >= 0.75).sort((a, b) => b[0] - a[0]);
    if (!deficits.length) continue;
    const movable = list.filter((d) => !G.battles[d.r] && !(d.path.length && hostileDivs(G, d.path[0], d.o).length));
    let moves = 0;
    const maxMoves = Math.max(3, Math.ceil(N * 0.25));
    for (const [, r] of deficits) {
      let need = Math.round(target(r) - have[r]);
      while (need > 0 && moves < maxMoves) {
        let best = null, bd = 1e9;
        for (const d of movable) {
          const dst = dest(d);
          if (dst === r || d._moved === G.day) continue;
          if (have[dst] - 1 < target(dst) - 0.3) continue;
          const dist = distKm(d.r, r);
          if (dist < bd) { bd = dist; best = d; }
        }
        if (!best) break;
        const dst = dest(best);
        best._moved = G.day;
        if (orderMove(G, best, r)) { have[dst]--; have[r]++; moves++; need--; } else { /* unreachable for this unit */ }
      }
    }
    for (const d of list) have[dest(d)] = 0;
  }
}

function planAttacks(G, c, A, divs) {
  const tag = c.tag;
  const at = new Map();             // region -> eligible divisions
  for (const d of divs) {
    if (d.sup <= 0) continue;
    (at.get(d.r) || at.set(d.r, []).get(d.r)).push(d);
  }
  const targets = new Map();
  for (const [i] of at) {
    for (const j of REG[i].adj) {
      if (A.pass[j]) continue;
      const ctl = G.reg[j].c;
      if (!atWar(G, tag, ctl)) continue;
      const st = frontOrder(c, ctl).st;
      if (st !== 'attack' && st !== 'blitz') continue;
      (targets.get(j) || targets.set(j, { st, src: [] }).get(j)).src.push(i);
    }
  }
  if (!targets.size) return;
  const list = [];
  for (const [t, info] of targets) {
    const defs = hostileDivs(G, t, tag);
    const T = TERRAIN[REG[t].terrain];
    let defP = 0;
    for (const d of defs) defP += divPower(G, d, true) * (1 + 0.02 * Math.min(10, d.ent));
    defP *= (1 / (1 + T.atk)) / Math.max(0.3, 1 - 0.12 * G.reg[t].fort);
    const foe = G.ctr[G.reg[t].c];
    const score = G.reg[t].vp + (foe && foe.cap === t ? 20 : 0) + (defs.length ? 0 : 6) + (G.reg[t].core === tag ? 4 : 0);
    list.push({ t, info, defs, defP, score });
  }
  list.sort((a, b) => b.score - a.score);
  const used = new Set();
  for (const x of list) {
    const { t, info, defs, defP } = x;
    const orgThr = info.st === 'blitz' ? 0.4 : 0.6;
    const cands = [];
    let committed = 0, nCommitted = 0;
    for (const s of info.src) {
      for (const d of at.get(s)) {
        if (used.has(d.id)) continue;
        if (d.path.length) { if (d.path[0] === t) { committed += divPower(G, d, false); nCommitted++; used.add(d.id); } continue; }
        const so = c.tpl[d.t]._s.org;
        if (d.org < so * orgThr) continue;
        cands.push(d);
      }
    }
    if (!defs.length) {
      if (committed > 0 || !cands.length) continue;
      // walk into an undefended region: fastest unit first; do not strip a threatened region bare
      cands.sort((a, b) => c.tpl[b.t]._s.spd - c.tpl[a.t]._s.spd);
      let n = G.reg[t].vp >= 5 ? 2 : 1;
      for (const d of cands) {
        if (n <= 0) break;
        const stay = at.get(d.r).filter((o) => !used.has(o.id) && !o.path.length).length;
        let threatened = false;
        for (const j of REG[d.r].adj) if (j !== t && !A.pass[j] && hostileDivs(G, j, tag).length) { threatened = true; break; }
        if (threatened && stay <= 1) continue;
        if (orderMove(G, d, t)) { used.add(d.id); n--; }
      }
      continue;
    }
    let ourP = committed;
    for (const d of cands) ourP += divPower(G, d, false);
    const ratio = info.st === 'blitz' ? 1.15 : 1.5;
    if (ourP < defP * ratio) continue;
    cands.sort((a, b) => divPower(G, b, false) - divPower(G, a, false));
    const keep = new Map();
    let power = committed, sent = 0;
    const maxDivs = Math.max(10, defs.length * 3) - nCommitted;
    for (const d of cands) {
      if (power >= defP * 2.6 || sent >= maxDivs) break;
      const k = keep.get(d.r) ?? (() => {
        let threatened = 0;
        for (const j of REG[d.r].adj) if (j !== t && !A.pass[j] && hostileDivs(G, j, tag).length) threatened = 1;
        return threatened;
      })();
      const stay = at.get(d.r).filter((o) => !used.has(o.id) && !o.path.length).length;
      keep.set(d.r, k);
      if (stay <= k) continue;
      if (orderMove(G, d, t)) { used.add(d.id); power += divPower(G, d, false); sent++; }
    }
  }
}

/** move idle formations across the sea: reinforce allies / colonies, or invade */
function seaOps(G, c, A, divs) {
  const tag = c.tag;
  if (!A.atwar || c.convoys < 12) return;
  const mine = G.invasions.filter((t) => t.o === tag);
  if (mine.length >= (COUNTRIES[tag].major ? 2 : 1)) return;
  // idle = divisions in components without enemy contact
  const idle = divs.filter((d) => A.comp[d.r] >= 0 && A.contact[A.comp[d.r]] <= 0 && !d.path.length);
  const garrison = Math.max(2, Math.round(divsOf(G, tag).length * 0.2));
  let spare = idle.length - garrison;
  if (spare < 2) return;
  const hz = homeZone(G, c);
  if (hz < 0) return;
  // --- choose a destination ---
  let target = -1, hostileTarget = false, want = 0;
  let bestScore = -1e9;
  for (let k = 0; k < A.nc; k++) {
    if (A.contact[k] <= 0) continue;
    // a friendly component under pressure: find its best harbour
    let have = 0;
    for (const d of divs) if (A.comp[d.r] === k) have++;
    for (let i = 0; i < NREG; i++) {
      if (A.comp[i] !== k || !REG[i].seas.length) continue;
      const s = A.contact[k] * 2 - have * 0.3 + G.reg[i].port * 2 + (A.pass[i] === 1 ? 1 : 0) - (A.want[i] > 0 ? 1 : 0);
      if (s > bestScore) { bestScore = s; target = i; want = Math.min(spare, 10); }
    }
  }
  if (target < 0) {
    // no land contact anywhere: plan a landing on a hostile shore
    const hp0 = bestPort(G, tag);
    if (hp0 < 0) return;
    for (let i = 0; i < NREG; i++) {
      if (A.pass[i] || !REG[i].seas.length) continue;
      const ctl = G.reg[i].c;
      if (!atWar(G, tag, ctl)) continue;
      const nd = hostileDivs(G, i, tag).length;
      const route = routeBetween(G, tag, c.ai.port ?? hp0, i);
      const len = route ? route.length : 99;
      if (len > 14) continue;
      const dom = dominance(G, REG[i].seas[0], tag);
      if (dom.foe > dom.own * 1.1 + 5) continue;
      const s = G.reg[i].port * 3 + G.reg[i].vp * 0.3 - nd * 3 - len * 0.7 + (G.reg[i].core === ctl ? 1 : 0) + (G.reg[i].core === tag ? 6 : 0);
      if (s > bestScore) { bestScore = s; target = i; hostileTarget = true; want = Math.min(spare, Math.max(3, nd * 3 + 2), 10); }
    }
  }
  if (target < 0 || want < 2) return;
  if (hostileTarget && want < 3) return;
  // --- gather at a port and embark ---
  const byReg = new Map();
  for (const d of idle) if (REG[d.r].seas.length) (byReg.get(d.r) || byReg.set(d.r, []).get(d.r)).push(d);
  let port = -1, best = 0;
  for (const [r, list] of byReg) {
    const v = list.length + G.reg[r].port * 0.5;
    if (v > best && routeBetween(G, tag, r, target)) { best = v; port = r; }
  }
  if (port < 0) {
    // march the idle troops to the best harbour first
    let hp = -1, hs = -1;
    for (let i = 0; i < NREG; i++) if (A.pass[i] === 1 && G.reg[i].port > 0 && REG[i].seas.length) {
      const s = G.reg[i].port * 3 + (i === c.cap ? 2 : 0) + (idle.some((d) => A.comp[d.r] === A.comp[i]) ? 5 : 0);
      if (s > hs) { hs = s; hp = i; }
    }
    if (hp >= 0) { let n = want; for (const d of idle) { if (n-- <= 0) break; if (A.comp[d.r] === A.comp[hp]) orderMove(G, d, hp); } c.ai.port = hp; }
    return;
  }
  const list = byReg.get(port);
  c.ai.port = port;
  if (list.length < Math.min(want, 3)) {
    let n = want - list.length;
    for (const d of idle) { if (n <= 0) break; if (d.r !== port && A.comp[d.r] === A.comp[port]) { if (orderMove(G, d, port)) n--; } }
    return;
  }
  const n = Math.min(want, list.length, Math.floor(c.convoys / 4));
  if (n < 2) return;
  orderSea(G, tag, list.slice(0, n), target);
}

/** one planning cycle for country c */
export function staffPlan(G, c, opts = {}) {
  const divs = divsOf(G, c.tag).filter(free);
  if (!divs.length) return;
  const A = analyse(G, c);
  if (A.atwar) planAttacks(G, c, A, divs);
  redeploy(G, c, A, divs.filter((d) => !d.path.length || !hostileDivs(G, d.path[0], d.o).length));
  c.ai.cyc = (c.ai.cyc || 0) + 1;
  if (opts.sea !== false && c.ai.cyc % 3 === 0) seaOps(G, c, A, divs);
}

/** AI: decide stance on every front from the local balance of forces */
export function aiStances(G, c) {
  const tag = c.tag;
  const our = {}, their = {};
  for (let i = 0; i < NREG; i++) {
    const ctl = G.reg[i].c;
    if (!atWar(G, tag, ctl)) continue;
    let touches = false;
    for (const j of REG[i].adj) { const o = G.reg[j].c; if (o === tag || friendly(G, tag, o)) { touches = true; break; } }
    if (!touches) continue;
    let p = 0;
    for (const d of divsIn(G, i)) if (atWar(G, tag, d.o)) p += divPower(G, d, true);
    their[ctl] = (their[ctl] || 0) + p;
    for (const j of REG[i].adj) {
      const o = G.reg[j].c;
      if (!(o === tag || friendly(G, tag, o))) continue;
      for (const d of divsIn(G, j)) if ((d.o === tag || sameSide(G, d.o, tag)) && d._cnt !== G.day + ctl) { d._cnt = G.day + ctl; our[ctl] = (our[ctl] || 0) + divPower(G, d, false); }
    }
  }
  for (const e of enemies(G, tag)) {
    if (!G.ctr[e].alive) continue;
    const prev = c.staff.fronts[e];
    const o = our[e] || 0, t = their[e] || 0;
    const ratio = (o + 1) / (t + 1);
    let st = 'hold';
    const was = prev && (prev.st === 'attack' || prev.st === 'blitz');
    // democracies are cautious, and slow to go over to the offensive at the start of a great war
    let aggr = c.ideo === 'fas' ? 1 : c.ideo === 'com' ? 0.9 : c.ideo === 'neu' ? 0.8 : 0.62;
    const w = G.war[tag < e ? tag + '|' + e : e + '|' + tag];
    if (c.ideo === 'dem' && COUNTRIES[e].major && w && G.day - w.start < 330 && w.att !== tag) aggr = 0.4;
    if (t <= 1 && o > 0) st = 'blitz';
    else if (ratio >= 1.8 / aggr) st = 'blitz';
    else if (ratio >= (was ? 0.85 : 1.1) / aggr) st = 'attack';
    let pr = 2;
    if (COUNTRIES[e].major) pr = 3;
    for (let i = 0; i < NREG && pr < 3; i++) if (G.reg[i].c === e && G.reg[i].core === tag) pr = 3;
    c.staff.fronts[e] = { st, pr };
  }
  for (const e of Object.keys(c.staff.fronts)) if (!atWar(G, tag, e)) delete c.staff.fronts[e];
}
export { canPass };
