// Land warfare: division templates, movement, battles, reinforcement, training.
import { REG, NREG, TERRAIN, distKm, findPath } from './world.js';
import { BAT, SUPC, EQ, TIER_ATK, TIER_DEF, LAND_EQ } from '../data/equip.js';
import { clamp, rnd } from './util.js';
import { mod } from './mods.js';
import { atWar, canEnter, friendly, onCapture, news } from './diplo.js';
import { airSupport } from './air.js';

const K_ORG = 0.62;      // organisation damage per hit per day
const K_HP = 0.3;        // hp damage per hit per day
const EMPTY = [];

// ---- templates -----------------------------------------------------------------------------------
/** compute cached stats tpl._s from battalions, equipment tiers and doctrine modifiers */
export function calcTemplate(c, tpl) {
  let sa = 0, ha = 0, df = 0, br = 0, hp = 0, orgSum = 0, cnt = 0, w = 0, spd = 99, hardSum = 0;
  let armMax = 0, armSum = 0, apMax = 0, apSum = 0, sup = 0, mp = 0, antiAir = 0;
  const need = {};
  const m = c._m || {};
  for (const k in tpl.bats) {
    const n = tpl.bats[k];
    if (!n) continue;
    const B = BAT[k];
    const tier = c.eqTier[B.main] || 0;
    const am = TIER_ATK[tier], dm = TIER_DEF[tier];
    const tank = k === 'ltank' || k === 'mtank' || k === 'htank';
    const atkMul = am * (tank ? 1 + (m.tankAttack || 0) : k === 'art' ? 1 + (m.artAttack || 0) : 1);
    sa += B.sa * atkMul * n; ha += B.ha * atkMul * n;
    df += B.df * dm * n * (k === 'mot' ? 1 + (m.motDefense || 0) : 1);
    br += B.br * am * n * (1 + (m.breakBonus || 0));
    hp += B.hp * n; orgSum += B.org * n; cnt += n;
    w += B.w * n * (k === 'inf' || k === 'mil' ? 1 + (m.widthInf || 0) : 1);
    spd = Math.min(spd, B.spd);
    hardSum += B.hard * n;
    const arm = B.arm * (1 + 0.25 * Math.max(0, tier - 1)), ap = B.ap * (1 + 0.3 * Math.max(0, tier - 1));
    armMax = Math.max(armMax, arm); armSum += arm * n;
    apMax = Math.max(apMax, ap); apSum += ap * n;
    sup += B.sup * n; mp += B.mp * n;
    if (B.antiAir) antiAir += B.antiAir * n;
    for (const e in B.eq) need[e] = (need[e] || 0) + B.eq[e] * n;
  }
  let ent = 0;
  for (const s of tpl.sup || []) {
    const S = SUPC[s];
    mp += S.mp;
    for (const e in S.eq) need[e] = (need[e] || 0) + S.eq[e];
    if (s === 'eng') { df *= 1.1; ent += 2; }
    if (s === 'rec') { spd *= 1.1; sa *= 1.05; }
    if (s === 'sart') sa += 12 * TIER_ATK[c.eqTier.art || 0] * (1 + (m.artAttack || 0));
    if (s === 'saa') antiAir += 10;
    if (s === 'log') sup *= 0.8;
  }
  cnt = Math.max(1, cnt);
  let cost = 0;
  for (const e in need) cost += need[e] * EQ[e].cost;
  const wt = {};
  for (const e in need) wt[e] = (need[e] * EQ[e].cost) / Math.max(1, cost);
  tpl._s = {
    sa, ha, df, br, hp: Math.max(1, hp), org: (orgSum / cnt) * (1 + (m.orgBonus || 0)), w: Math.max(1, w),
    spd: spd === 99 ? 4 : spd * (1 + (m.speedBonus || 0)), hard: hardSum / cnt,
    arm: 0.3 * armMax + 0.7 * (armSum / cnt), ap: 0.4 * apMax + 0.6 * (apSum / cnt),
    sup: sup * (1 + (m.supplyUse || 0)), mp, need, cost, wt, ent, antiAir,
  };
  return tpl._s;
}
export function recalcTemplates(c) {
  for (const k in c.tpl) calcTemplate(c, c.tpl[k]);
}
export function trainDays(c, tpl) {
  const s = tpl._s;
  const base = s.hard > 0.4 ? 120 : tpl.bats.mil ? 40 : 80;
  return Math.max(15, Math.round(base * (1 + mod(c, 'trainTime'))));
}

// ---- indexes -------------------------------------------------------------------------------------
export function buildIndex(G) {
  const byReg = new Array(NREG);
  const byOwner = {};
  for (const id in G.divs) {
    const d = G.divs[id];
    (byOwner[d.o] || (byOwner[d.o] = [])).push(d);
    if (d.sea) continue;
    (byReg[d.r] || (byReg[d.r] = [])).push(d);
  }
  G._byReg = byReg; G._byOwner = byOwner;
}
export function divsIn(G, r) {
  if (!G._byReg) buildIndex(G);
  return G._byReg[r] || EMPTY;
}
export function divsOf(G, tag) {
  if (!G._byReg) buildIndex(G);
  return G._byOwner[tag] || EMPTY;
}
function relocate(G, d, to) {
  const arr = G._byReg[d.r];
  if (arr) { const i = arr.indexOf(d); if (i >= 0) arr.splice(i, 1); }
  d.r = to;
  (G._byReg[to] || (G._byReg[to] = [])).push(d);
}

// ---- needs / equipment ---------------------------------------------------------------------------
export function recalcNeeds(G, c) {
  const need = {};
  for (const d of divsOf(G, c.tag)) {
    const s = c.tpl[d.t]._s;
    for (const e in s.need) need[e] = (need[e] || 0) + s.need[e];
  }
  c.need = need;
  for (const e of LAND_EQ) {
    if (c.fielded[e] === undefined) c.fielded[e] = 0;
    if (c.stock[e] === undefined) c.stock[e] = 0;
    const n = need[e] || 0;
    if (c.fielded[e] > n) { c.stock[e] += c.fielded[e] - n; c.fielded[e] = n; }
  }
  c._needDirty = false;
}
/** equipment fill ratio of a template (0..1) */
export function tplFill(c, tpl) {
  const s = tpl._s;
  let f = 0;
  for (const e in s.wt) {
    const n = c.need[e] || 0;
    f += s.wt[e] * (n > 0 ? Math.min(1, (c.fielded[e] || 0) / n) : 1);
  }
  return f;
}

const DIV_NAMES = { inf: 'пехотная дивизия', cav: 'кавалерийская дивизия', mot: 'моторизованная дивизия', arm: 'танковая дивизия' };
export function spawnDivision(G, c, tplKey, region, opts = {}) {
  const tpl = c.tpl[tplKey];
  const id = G.nextId++;
  c.divN = c.divN || {};
  const icon = tpl.icon || 'inf';
  const n = (c.divN[icon] = (c.divN[icon] || 0) + 1);
  const d = {
    id, o: c.tag, t: tplKey, r: region, str: opts.str ?? 1, org: tpl._s.org * (opts.org ?? 1), path: [], mp: 0, ent: 0,
    man: 0, ret: 0, sup: 1, name: `${n}-я ${DIV_NAMES[icon]}`,
  };
  G.divs[id] = d;
  if (G._byReg) {
    (G._byReg[region] || (G._byReg[region] = [])).push(d);
    (G._byOwner[c.tag] || (G._byOwner[c.tag] = [])).push(d);
  }
  c._needDirty = true;
  return d;
}
export function removeDivision(G, d) {
  delete G.divs[d.id];
  if (G._byReg) {
    const a = G._byReg[d.r]; if (a) { const i = a.indexOf(d); if (i >= 0) a.splice(i, 1); }
    const b = G._byOwner[d.o]; if (b) { const i = b.indexOf(d); if (i >= 0) b.splice(i, 1); }
  }
  G.ctr[d.o]._needDirty = true;
}
/** division wiped out: equipment and men are lost */
export function destroyDivision(G, d, killer) {
  const c = G.ctr[d.o];
  const s = c.tpl[d.t]._s;
  for (const e in s.need) c.fielded[e] = Math.max(0, (c.fielded[e] || 0) - s.need[e] * Math.min(1, d.str) * tplFill(c, c.tpl[d.t]));
  const men = (s.mp * d.str) / 1000;
  c.mpLost += men; c.stats.lost += men; c.stats.divLost++;
  if (killer && G.ctr[killer]) G.ctr[killer].stats.killed += men;
  removeDivision(G, d);
}
export function disbandDivision(G, d) {
  const c = G.ctr[d.o];
  const s = c.tpl[d.t]._s;
  const fill = tplFill(c, c.tpl[d.t]);
  for (const e in s.need) {
    const amt = s.need[e] * fill;
    c.fielded[e] = Math.max(0, (c.fielded[e] || 0) - amt);
    c.stock[e] = (c.stock[e] || 0) + amt;
  }
  removeDivision(G, d);
}

// ---- movement ------------------------------------------------------------------------------------
export function stepDays(G, d, a, b) {
  const c = G.ctr[d.o];
  const s = c.tpl[d.t]._s;
  const rb = G.reg[b];
  let kmDay = s.spd * 10 * TERRAIN[REG[b].terrain].move * (0.7 + 0.08 * rb.infra);
  if (d.sup < 0.5) kmDay *= 0.6;
  // rail movement deep inside friendly territory
  if (friendly(G, d.o, rb.c) && friendly(G, d.o, G.reg[a].c) && !G._frontReg?.[b]) kmDay *= 2.2;
  const dist = clamp(distKm(a, b), 60, 700);
  return Math.max(1, dist / kmDay);
}
export function hostileDivs(G, r, tag) {
  const arr = divsIn(G, r);
  if (!arr.length) return EMPTY;
  let out = null;
  for (const d of arr) if (!d.ret && d.o !== tag && atWar(G, tag, d.o)) (out || (out = [])).push(d);
  return out || EMPTY;
}
/** give a land move order; returns true when a path exists */
export function orderMove(G, d, target) {
  if (d.sea || d.ret) return false;
  if (d.r === target) { d.path = []; d.mp = 0; return true; }
  const tag = d.o;
  const path = findPath(d.r, target, (u, v) => {
    if (!canEnter(G, tag, v)) return Infinity;
    let c = stepDays(G, d, u, v);
    if (atWar(G, tag, G.reg[v].c)) c = c * 1.5 + 2;
    return c;
  });
  if (!path) return false;
  if (!d.path.length || d.path[0] !== path[0]) d.mp = 0;
  d.path = path;
  return true;
}

function enterRegion(G, d, to) {
  relocate(G, d, to);
  d.path.shift();
  d.mp = 0; d.ent = 0;
  const reg = G.reg[to];
  if (reg.c !== d.o && atWar(G, d.o, reg.c)) onCapture(G, to, d.o);
}

function retreat(G, d, killer) {
  // choose an adjacent friendly region without enemies
  const R = REG[d.r];
  let best = -1, bs = -1e9;
  const c = G.ctr[d.o];
  for (const v of R.adj) {
    const ctl = G.reg[v].c;
    if (!friendly(G, d.o, ctl)) continue;
    if (hostileDivs(G, v, d.o).length) continue;
    let s = divsIn(G, v).length * 2 + G.reg[v].infra;
    if (ctl === d.o) s += 3;
    if (c.cap >= 0) s -= distKm(v, c.cap) / 200;
    if (s > bs) { bs = s; best = v; }
  }
  if (best < 0) { destroyDivision(G, d, killer); return false; }
  d.ret = 1; d.path = [best]; d.mp = 0; d.ent = 0; d.org = Math.max(d.org, 0);
  return true;
}

function effStats(G, d) {
  const c = G.ctr[d.o];
  const tpl = c.tpl[d.t];
  const s = tpl._s;
  const fill = 0.25 + 0.75 * Math.min(d.str, tplFill(c, tpl));
  const sup = d.sup >= 1 ? 1 : 0.55 + 0.45 * d.sup;
  const atk = fill * sup * (1 + mod(c, 'landAttack'));
  const def = fill * (0.7 + 0.3 * sup) * (1 + mod(c, 'landDefense'));
  return { s, atk, def, c };
}

function pickFront(divs, width) {
  divs.sort((a, b) => b._orgf - a._orgf);
  const out = [];
  let w = 0;
  for (const d of divs) {
    if (out.length && w + d._w > width * 1.1) continue;
    out.push(d); w += d._w;
    if (w >= width) break;
  }
  return out;
}

function resolveBattle(G, r, atts) {
  let defs = [];
  const all = divsIn(G, r);
  for (const d of all) {
    if (d.ret) continue;
    for (const a of atts) if (atWar(G, a.o, d.o)) { defs.push(d); break; }
  }
  atts = atts.filter((a) => defs.some((d) => atWar(G, a.o, d.o)));
  if (!defs.length || !atts.length) return null;
  const T = TERRAIN[REG[r].terrain];
  const dirs = new Set();
  let amphAll = true;
  for (const a of atts) { if (a.amph === undefined) { dirs.add(a.r); amphAll = false; } else dirs.add(-1); }
  const width = (70 + 35 * (dirs.size - 1)) * T.width;
  for (const d of atts) { const s = G.ctr[d.o].tpl[d.t]._s; d._w = s.w; d._orgf = d.org / s.org; }
  for (const d of defs) { const s = G.ctr[d.o].tpl[d.t]._s; d._w = s.w; d._orgf = d.org / s.org; }
  const fa = pickFront(atts.slice(), width), fd = pickFront(defs.slice(), width);
  const reg = G.reg[r];
  const air = airSupport(G, r, fa, fd);
  const rollA = 0.85 + rnd(G) * 0.3, rollD = 0.85 + rnd(G) * 0.3;
  const fortPen = Math.max(0.25, 1 - 0.12 * reg.fort * (dirs.size >= 3 ? 0.6 : 1));
  // totals
  let aSA = 0, aHA = 0, aAP = 0, aW = 0, dSA = 0, dHA = 0, dAP = 0, dW = 0;
  const ea = fa.map((d) => effStats(G, d)), ed = fd.map((d) => effStats(G, d));
  fa.forEach((d, i) => {
    const e = ea[i];
    let m = e.atk * (1 + T.atk) * fortPen * rollA * (1 + air.a);
    if (d.amph !== undefined) m *= clamp(0.35 + mod(e.c, 'amphib'), 0.2, 1);
    aSA += e.s.sa * m; aHA += e.s.ha * m; aAP += e.s.ap * e.s.w; aW += e.s.w;
  });
  fd.forEach((d, i) => {
    const e = ed[i];
    const entMax = 10 + mod(e.c, 'entrench') + e.s.ent;
    const m = e.atk * rollD * (1 + air.d) * (1 + 0.02 * Math.min(d.ent, entMax));
    dSA += e.s.sa * m; dHA += e.s.ha * m; dAP += e.s.ap * e.s.w; dW += e.s.w;
  });
  aAP /= Math.max(1, aW); dAP /= Math.max(1, dW);
  const casToDef = air.casA / Math.max(1, fd.length), casToAtt = air.casD / Math.max(1, fa.length);

  const apply = (d, e, recvS, recvH, defv, enemyAP, cas, killerTag) => {
    const s = e.s;
    const eff = recvS * (1 - s.hard) + recvH * s.hard;
    let hits = Math.min(eff, defv) * 0.1 + Math.max(0, eff - defv) * 0.4;
    if (s.arm > enemyAP) hits *= 0.6;
    hits += cas;
    const orgD = hits * K_ORG;
    const strD = (hits * K_HP) / s.hp;
    d.org = Math.max(0, d.org - orgD);
    const lost = Math.min(d.str, strD);
    d.str -= lost;
    const c = e.c;
    const fill = tplFill(c, c.tpl[d.t]);
    for (const k in s.need) c.fielded[k] = Math.max(0, (c.fielded[k] || 0) - s.need[k] * lost * fill * 0.85);
    const men = (s.mp * lost * 0.6 * (1 + mod(c, 'casualties'))) / 1000;
    c.mpLost += men; c.stats.lost += men;
    if (G.ctr[killerTag]) G.ctr[killerTag].stats.killed += men;
  };
  fd.forEach((d, i) => {
    const e = ed[i];
    const share = e.s.w / dW;
    const entMax = 10 + mod(e.c, 'entrench') + e.s.ent;
    const defv = e.s.df * e.def * (1 + 0.025 * Math.min(d.ent, entMax)) * (1 + air.d * 0.5);
    apply(d, e, aSA * share, aHA * share, defv, aAP, casToDef, fa[0].o);
  });
  fa.forEach((d, i) => {
    const e = ea[i];
    const share = e.s.w / aW;
    const defv = e.s.br * e.def * (1 + air.a * 0.5);
    apply(d, e, dSA * share, dHA * share, defv, dAP, casToAtt, fd[0].o);
  });

  // outcomes
  const atkTag = fa[0].o, defTag = fd[0].o;
  let defLeft = 0;
  for (const d of defs) {
    if (d.str <= 0.03) { destroyDivision(G, d, atkTag); continue; }
    if (d.org <= 0.01) { if (retreat(G, d, atkTag)) continue; else continue; }
    defLeft++;
  }
  let attLeft = 0;
  for (const d of atts) {
    const s = G.ctr[d.o].tpl[d.t]._s;
    if (d.str <= 0.03) { destroyDivision(G, d, defTag); continue; }
    if (d.org < 0.08 * s.org) {
      d.path = []; d.mp = 0;
      if (d.amph !== undefined) abortLanding(G, d);
      continue;
    }
    attLeft++;
  }
  const old = G.battles[r];
  const b = old || { r, days: 0 };
  b.days++; b.att = atkTag; b.def = defTag; b.na = atts.length; b.nd = defs.length; b.day = G.day;
  let oa = 0, od = 0;
  for (const d of atts) oa += d.org; for (const d of defs) od += d.org;
  b.bal = oa / Math.max(1, oa + od);
  if (!defLeft || !attLeft) {
    delete G.battles[r];
    const pl = G.player;
    if (pl && (atkTag === pl || defTag === pl)) {
      const won = (atkTag === pl) === (defLeft === 0);
      news(G, `${won ? 'Победа' : 'Поражение'} в сражении за ${REG[r].name}`, won ? 'good' : 'bad', r);
    }
  } else G.battles[r] = b;
  return b;
}

function abortLanding(G, d) {
  // failed amphibious assault: survivors return to the port of departure
  const from = d.amphFrom;
  delete d.amph; delete d.amphFrom;
  d.sea = null;
  if (from !== undefined && friendly(G, d.o, G.reg[from].c)) { d.r = from; d.str *= 0.8; if (G._byReg) (G._byReg[from] || (G._byReg[from] = [])).push(d); } else destroyDivision(G, d, null);
}

/** daily land update */
export function landTick(G) {
  buildIndex(G);
  const attacks = new Map();
  const ids = Object.keys(G.divs);
  for (const id of ids) {
    const d = G.divs[id];
    if (!d) continue;
    const c = G.ctr[d.o];
    const s = c.tpl[d.t]._s;
    if (d.amph !== undefined) {
      // amphibious assault in progress (set up by navy.js)
      const tgt = d.amph;
      if (hostileDivs(G, tgt, d.o).length) { (attacks.get(tgt) || attacks.set(tgt, []).get(tgt)).push(d); continue; }
      delete d.amph; delete d.amphFrom; d.sea = null; d.r = tgt; d.path = []; d.mp = 0; d.ent = 0;
      (G._byReg[tgt] || (G._byReg[tgt] = [])).push(d);
      if (atWar(G, d.o, G.reg[tgt].c)) onCapture(G, tgt, d.o);
      continue;
    }
    if (d.sea) continue;
    if (!d.path.length) {
      d.ret = 0;
      if (d.ent < 15) d.ent++;
      if (d.org < s.org) d.org = Math.min(s.org, d.org + s.org * (0.1 + 0.1 * mod(c, 'orgRegain')) * (d.sup >= 1 ? 1 : 0.4 + 0.4 * d.sup));
      continue;
    }
    const next = d.path[0];
    if (!REG[d.r].adj.includes(next) || (!d.ret && !canEnter(G, d.o, next))) { d.path = []; d.mp = 0; d.ret = 0; continue; }
    d.ent = 0;
    if (d.ret) {
      // retreating: cannot be engaged; if the destination fell, look for another way out
      if (!friendly(G, d.o, G.reg[next].c) || hostileDivs(G, next, d.o).length) { d.ret = 0; d.path = []; if (!retreat(G, d, null)) continue; }
      d.mp += 1.6 / stepDays(G, d, d.r, d.path[0]);
      if (d.mp >= 1) { relocate(G, d, d.path[0]); d.path = []; d.mp = 0; d.ret = 0; }
      continue;
    }
    if (hostileDivs(G, next, d.o).length) {
      (attacks.get(next) || attacks.set(next, []).get(next)).push(d);
      d.mp = Math.min(0.9, d.mp + 0.3 / stepDays(G, d, d.r, next));
    } else {
      d.mp += 1 / stepDays(G, d, d.r, next);
      if (d.org < s.org) d.org = Math.min(s.org, d.org + s.org * 0.03);
      if (d.mp >= 1) enterRegion(G, d, next);
    }
  }
  for (const [r, atts] of attacks) resolveBattle(G, r, atts);
  for (const r in G.battles) if (G.battles[r].day !== G.day) delete G.battles[r];
}

/** weekly: reinforce divisions with men and move equipment from stock to the field */
export function reinforceTick(G, c) {
  if (c._needDirty) recalcNeeds(G, c);
  const rate = 0.08 * (1 + mod(c, 'reinforceRate'));
  for (const e of LAND_EQ) {
    const need = c.need[e] || 0;
    const gap = need - (c.fielded[e] || 0);
    if (gap > 0 && c.stock[e] > 0) {
      const t = Math.min(gap, c.stock[e], need * rate + 10);
      c.fielded[e] += t; c.stock[e] -= t;
    }
  }
  for (const d of divsOf(G, c.tag)) {
    if (d.sea) continue;
    // attrition when cut off
    if (d.sup <= 0) {
      d.str -= 0.05 * (1 + mod(c, 'attrition'));
      if (d.str <= 0.05) { destroyDivision(G, d, null); continue; }
    } else if (d.str < 1 && c.mp > 0) {
      const s = c.tpl[d.t]._s;
      const add = Math.min(1 - d.str, rate * 1.5 * d.sup);
      const cost = (s.mp * add) / 1000;
      if (c.mp >= cost) { d.str += add; c.mp -= cost; c._mpUsedDelta = (c._mpUsedDelta || 0) + cost; }
    }
  }
}

/** daily: advance training queue */
export function trainTick(G, c) {
  if (!c.train.length) return;
  for (let i = c.train.length - 1; i >= 0; i--) {
    const t = c.train[i];
    t.p++;
    if (t.p >= t.days) {
      let r = t.r;
      if (r === undefined || r < 0 || G.reg[r].c !== c.tag) r = c.cap >= 0 && G.reg[c.cap].c === c.tag ? c.cap : -1;
      if (r < 0) { for (let k = 0; k < NREG; k++) if (G.reg[k].c === c.tag && G.reg[k].o === c.tag) { r = k; break; } }
      if (r < 0) { t.p = t.days - 5; continue; }
      if (!c.tpl[t.tpl]) { c.train.splice(i, 1); continue; }
      spawnDivision(G, c, t.tpl, r, { org: 0.5 });
      c.train.splice(i, 1);
      if (c.tag === G.player) news(G, `Новая дивизия развёрнута: ${REG[r].name}`, 'info', r);
    }
  }
}

/** queue a division for training; returns error text or null */
export function queueTraining(G, c, tplKey, region) {
  const tpl = c.tpl[tplKey];
  if (!tpl) return 'Нет такого шаблона';
  const mp = tpl._s.mp / 1000;
  if (c.mp < mp) return 'Недостаточно призывников';
  c.mp -= mp;
  c.train.push({ tpl: tplKey, p: 0, days: trainDays(c, tpl), r: region ?? -1 });
  return null;
}

/** total manpower (thousands) serving in divisions and training */
export function manpowerInField(G, c) {
  let m = 0;
  for (const d of divsOf(G, c.tag)) m += (c.tpl[d.t]._s.mp * d.str) / 1000;
  for (const t of c.train) if (c.tpl[t.tpl]) m += c.tpl[t.tpl]._s.mp / 1000;
  return m;
}

/** rough combat value of a division for AI estimates */
export function divPower(G, d, defending) {
  const c = G.ctr[d.o];
  const s = c.tpl[d.t]._s;
  const base = defending ? s.df * 0.55 + s.sa * 0.9 + s.ha * 0.4 : s.sa * 1.2 + s.ha * 0.5 + s.br * 0.6 + s.df * 0.15;
  return base * (0.3 + 0.7 * d.str) * (0.35 + 0.65 * (d.org / s.org)) * (d.sup >= 1 ? 1 : 0.6);
}
