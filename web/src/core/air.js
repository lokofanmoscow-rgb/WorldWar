// Air war: wings based at airfields, air superiority, close air support, strategic bombing.
import { REG, NREG, distKm, distSeaRegionKm } from './world.js';
import { PLANE, AIR_EQ, EQ } from '../data/equip.js';
import { clamp, rnd } from './util.js';
import { mod } from './mods.js';
import { atWar, friendly, sameSide, enemies, news, cn } from './diplo.js';

export const WING_SIZE = 100;
export const BASE_CAP = 200;
const TIER = [0.7, 1, 1.3, 1.65, 2.1, 2.5];
const DEFAULT_MIS = { fighter: 'sup', cas: 'cas', tac: 'cas', strat: 'bomb', nav: 'nav' };

export function planeRange(c, type) { return PLANE[type].range * (1 + 0.12 * Math.max(0, (c.eqTier[type] || 1) - 1)); }
export function wingPower(G, w) {
  const c = G.ctr[w.o];
  return w.n * TIER[c.eqTier[w.t] || 0] * (1 + mod(c, 'airAttack')) * (c._short && c._short.oil > 0.5 ? 0.6 : 1);
}
export function baseLoad(G, r) {
  let n = 0;
  for (const w of G.wings) if (w.base === r) n += w.n;
  return n;
}
export function baseFree(G, r) { return G.reg[r].air * BASE_CAP - baseLoad(G, r); }

export function createWing(G, c, type, n, base, mis) {
  n = Math.min(n, Math.floor(c.stock[type] || 0));
  if (n <= 0) return null;
  c.stock[type] -= n;
  const w = { id: G.nextId++, o: c.tag, t: type, n, max: Math.max(n, WING_SIZE), base, mis: mis || DEFAULT_MIS[type], tgt: -1 };
  G.wings.push(w);
  return w;
}
export function disbandWing(G, w) {
  const c = G.ctr[w.o];
  c.stock[w.t] = (c.stock[w.t] || 0) + Math.floor(w.n);
  G.wings = G.wings.filter((x) => x !== w);
}
/** candidate airfields of a country (own controlled regions with an airbase) */
export function airfields(G, tag) {
  const out = [];
  for (let i = 0; i < NREG; i++) if (G.reg[i].air > 0 && (G.reg[i].c === tag || (friendly(G, tag, G.reg[i].c) && G.ctr[G.reg[i].c] && G.ctr[G.reg[i].c].over === tag))) out.push(i);
  return out;
}
/** form wings from planes in stock and put them on the best free airfields */
export function autoWings(G, c, focusRegions) {
  const fields = airfields(G, c.tag);
  if (!fields.length) return;
  const score = (i) => {
    let s = G.reg[i].air * 2 + (i === c.cap ? 3 : 0) + G.reg[i].vp * 0.1;
    if (focusRegions && focusRegions.length) {
      let best = 1e9;
      for (const f of focusRegions) best = Math.min(best, distKm(i, f));
      s += 60 - Math.min(60, best / 25);
    }
    return s;
  };
  for (const t of AIR_EQ) {
    let guard = 0;
    while ((c.stock[t] || 0) >= 20 && guard++ < 40) {
      const range = planeRange(c, t);
      let best = -1, bs = -1e9;
      for (const i of fields) {
        if (baseFree(G, i) < 20) continue;
        let s = score(i);
        if (focusRegions && focusRegions.length && !focusRegions.some((f) => distKm(i, f) <= range)) s -= 40;
        if (s > bs) { bs = s; best = i; }
      }
      if (best < 0) break;
      createWing(G, c, t, Math.min(WING_SIZE, baseFree(G, best)), best);
    }
  }
}

/**
 * Air effects on a land battle in region r. fa / fd = front line divisions (attackers / defenders).
 * Returns { a, d : attack bonuses (-0.25..0.25), casA, casD : extra hits on defenders / attackers }
 */
export function airSupport(G, r, fa, fd) {
  const res = { a: 0, d: 0, casA: 0, casD: 0 };
  if (!G.wings.length) return res;
  const ta = fa[0].o, td = fd[0].o;
  let fA = 0, fD = 0, gA = 0, gD = 0;
  const used = [];
  for (const w of G.wings) {
    if (w.n < 1 || (w.mis !== 'sup' && w.mis !== 'cas')) continue;
    let side = 0;
    if (w.o === ta || sameSide(G, w.o, ta)) side = 1;
    else if (w.o === td || sameSide(G, w.o, td)) side = 2;
    else continue;
    const c = G.ctr[w.o];
    if (distKm(w.base, r) > planeRange(c, w.t)) continue;
    const P = PLANE[w.t];
    const pw = wingPower(G, w) / Math.max(1, w._load || 1);
    w._cnt = (w._cnt || 0) + 1;
    if (w.mis === 'sup') { if (side === 1) fA += pw * P.atk; else fD += pw * P.atk; }
    else { const g = pw * P.ground * (1 + mod(c, 'casBonus')); if (side === 1) gA += g; else gD += g; }
    used.push([w, side]);
  }
  if (!used.length) return res;
  const adv = clamp((fA - fD) / (fA + fD + 80), -1, 1);
  res.a = 0.22 * adv; res.d = -0.22 * adv;
  const aaD = avgAA(G, fd), aaA = avgAA(G, fa);
  res.casA = gA * 0.03 * (0.55 + 0.45 * adv) * (1 - aaD);
  res.casD = gD * 0.03 * (0.55 - 0.45 * adv) * (1 - aaA);
  // attrition of aircraft
  for (const [w, side] of used) {
    const own = side === 1 ? fA : fD, foe = side === 1 ? fD : fA;
    const c = G.ctr[w.o];
    let rate = (w.t === 'fighter' ? 0.01 : 0.016) * (foe / (own + foe + 60)) / (1 + mod(c, 'airDefence') * 0.5) / Math.max(1, w._load || 1);
    if (w.mis === 'cas') rate += 0.012 * (side === 1 ? aaD : aaA) / Math.max(1, w._load || 1);
    const lost = w.n * rate * (0.6 + 0.8 * rnd(G));
    w.n = Math.max(0, w.n - lost);
    c.stats.planes = (c.stats.planes || 0) + lost;
  }
  return res;
}
function avgAA(G, divs) {
  let a = 0;
  for (const d of divs) a += G.ctr[d.o].tpl[d.t]._s.antiAir;
  return clamp(a / Math.max(1, divs.length) / 60, 0, 0.5);
}

/** fighter power of `tag`'s side able to reach region r */
function fightersOver(G, r, tag) {
  let p = 0;
  for (const w of G.wings) {
    if (w.t !== 'fighter' || w.mis !== 'sup' || w.n < 1) continue;
    if (w.o !== tag && !sameSide(G, w.o, tag)) continue;
    if (distKm(w.base, r) <= planeRange(G.ctr[w.o], 'fighter')) p += wingPower(G, w) * (1 + mod(G.ctr[w.o], 'airDefence'));
  }
  return p;
}

function pickBombTarget(G, w) {
  const c = G.ctr[w.o];
  const range = planeRange(c, w.t);
  let best = -1, bs = 0;
  for (let i = 0; i < NREG; i++) {
    const r = G.reg[i];
    if (!atWar(G, w.o, r.c)) continue;
    if (distKm(w.base, i) > range) continue;
    const v = (r.civ + r.mil * 1.5 + r.dock) * (0.9 - r.dmg);
    if (v > bs) { bs = v; best = i; }
  }
  return best;
}

/** naval strike power of tag's side over a sea zone */
export function navalAirPower(G, zone, tag) {
  let p = 0;
  for (const w of G.wings) {
    if (w.mis !== 'nav' || w.n < 1) continue;
    if (w.o !== tag && !sameSide(G, w.o, tag)) continue;
    const c = G.ctr[w.o];
    if (distSeaRegionKm(zone, w.base) <= planeRange(c, w.t) + 400) p += wingPower(G, w) * PLANE[w.t].naval;
  }
  return p;
}

export function nukeBlocker(G, c, target) {
  if (!(c.nukes > 0)) return 'Нет готовых атомных бомб';
  if (!atWar(G, c.tag, G.reg[target].c)) return 'Цель не на территории противника';
  const ok = G.wings.some((w) => w.o === c.tag && w.t === 'strat' && w.n >= 10 && distKm(w.base, target) <= planeRange(c, 'strat'));
  if (!ok) return 'Нет стратегических бомбардировщиков в радиусе действия';
  return null;
}
export function nukeStrike(G, c, target) {
  const err = nukeBlocker(G, c, target);
  if (err) return err;
  c.nukes--;
  const r = G.reg[target];
  const foe = G.ctr[r.c];
  r.dmg = 0.9;
  r.civ = Math.floor(r.civ * 0.6); r.mil = Math.floor(r.mil * 0.6);
  r.infra = Math.max(1, r.infra - 1);
  for (const id in G.divs) { const d = G.divs[id]; if (d.r === target && !d.sea) { d.str *= 0.5; d.org = 0; } }
  foe.ws = clamp(foe.ws - 0.12, 0, 1); foe.stab = clamp(foe.stab - 0.08, 0, 1);
  G.tension = clamp(G.tension + 5, 0, 100);
  news(G, `АТОМНЫЙ УДАР: ${cn(G, c.tag)} сбрасывает бомбу на ${REG[target].name}`, 'war', target);
  return null;
}

/** daily air update */
export function airTick(G) {
  // slow repair of bomb damage
  for (let i = 0; i < NREG; i++) { const r = G.reg[i]; if (r.dmg > 0) r.dmg = Math.max(0, r.dmg - 0.004); }
  for (const c of Object.values(G.ctr)) {
    c._bombed = (c._bombed || 0) * 0.97;
    if (c.unlocked.nuke && c.alive && !c.capit) {
      c.nukeP = (c.nukeP || 0) + 1;
      if (c.nukeP >= 180) { c.nukeP = 0; c.nukes = (c.nukes || 0) + 1; if (c.tag === G.player) news(G, 'Готова атомная бомба', 'tech'); }
    }
  }
  for (let k = G.wings.length - 1; k >= 0; k--) {
    const w = G.wings[k];
    const c = G.ctr[w.o];
    if (!c || !c.alive) { G.wings.splice(k, 1); continue; }
    w._load = Math.max(1, w._cnt || 1); w._cnt = 0;
    // lost airfield -> evacuate
    const ctl = G.reg[w.base].c;
    if (ctl !== w.o && !friendly(G, w.o, ctl)) {
      let best = -1, bd = 1e9;
      for (const i of airfields(G, w.o)) { const d = distKm(w.base, i); if (d < bd && baseFree(G, i) >= w.n * 0.5) { bd = d; best = i; } }
      if (best < 0) { G.wings.splice(k, 1); continue; }
      w.base = best; w.n *= 0.8; w.tgt = -1;
    }
    // replacements
    if (w.n < w.max && (c.stock[w.t] || 0) >= 1) {
      const add = Math.min(w.max - w.n, c.stock[w.t], 4);
      w.n += add; c.stock[w.t] -= add;
    }
    if (w.n < 1) { G.wings.splice(k, 1); continue; }
    if (w.mis !== 'bomb' || !enemies(G, w.o).length) continue;
    // strategic bombing
    if (w.tgt < 0 || !atWar(G, w.o, G.reg[w.tgt].c) || G.reg[w.tgt].dmg > 0.8 || (G.day + w.id) % 15 === 0) {
      if (!w.manualTgt || w.tgt < 0 || !atWar(G, w.o, G.reg[w.tgt].c)) { w.tgt = pickBombTarget(G, w); w.manualTgt = 0; }
    }
    if (w.tgt < 0) continue;
    const P = PLANE[w.t];
    const r = G.reg[w.tgt];
    const foe = G.ctr[r.c];
    const power = wingPower(G, w) * P.bomb * (1 + mod(c, 'bombBonus'));
    const fD = fightersOver(G, w.tgt, r.c), fA = fightersOver(G, w.tgt, w.o);
    const intercept = clamp(0.7 * fD / (fD + fA + power * 0.6 + 40), 0, 0.85);
    const eff = power * (1 - intercept) * (1 - 0.1 * r.aa);
    r.dmg = Math.min(0.75, r.dmg + eff * 0.00015);
    if (foe) foe._bombed = (foe._bombed || 0) + eff * 0.0004;
    const lost = w.n * (0.012 * intercept + 0.002 * r.aa) * (0.5 + rnd(G));
    w.n = Math.max(0, w.n - lost);
    c.stats.planes = (c.stats.planes || 0) + lost;
  }
}

export { EQ };
