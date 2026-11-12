// Economy: factories, construction, production lines, resources & trade, research, politics.
import { REG, NREG, LANDMASS } from './world.js';
import { EQ, SHIP, RES_KEYS, LAND_EQ } from '../data/equip.js';
import { TECHS } from '../data/techs.js';
import { BUILD, LAWS, IDEO_KEYS, IDEO } from '../data/laws.js';
import { COUNTRIES } from '../data/countries.js';
import { clamp, yearOf } from './util.js';
import { mod, recalcMods, refreshTech } from './mods.js';
import { recalcTemplates, manpowerInField } from './land.js';
import { atWar, isAtWar, news, cn, opinion, enemies } from './diplo.js';
import { addShip } from './navy.js';

export const FACTORY_OUT = 4.5;
export const DOCK_OUT = 2.5;
export const CIV_BUILD = 5;
export const MAX_CIV_PER_PROJECT = 15;
export const MAX_FAC_PER_LINE = 30;
const OCC = 0.4;         // share of factories/resources usable in occupied territory

/** one pass over all regions: factories, resources, population per controller */
export function recount(G) {
  for (const c of Object.values(G.ctr)) {
    c._civ = 0; c._mil = 0; c._dock = 0; c._pop = 0; c._rec = 0; c._res = { oil: 0, steel: 0, alu: 0, rub: 0, tun: 0, chr: 0 };
    c._regs = 0; c._vp = 0;
  }
  for (let i = 0; i < NREG; i++) {
    const r = G.reg[i];
    const c = G.ctr[r.c];
    if (!c) continue;
    const own = r.o === r.c;
    const k = (own ? 1 : OCC) * (1 - r.dmg);
    c._civ += r.civ * k; c._mil += r.mil * k; c._dock += r.dock * k;
    c._regs++; c._vp += r.vp;
    const rk = (own ? 1 : OCC) * (0.6 + 0.1 * r.infra) * (1 + mod(c, 'resOutput'));
    for (const key in r.res) c._res[key] += r.res[key] * rk;
    if (r.syn) { const s = r.syn * (1 + mod(c, 'refineryOut')) * (1 - r.dmg); c._res.oil += 4 * s; c._res.rub += 2 * s; }
    if (own) {
      c._pop += r.pop;
      c._rec += r.pop * (r.core === r.o ? 1 : 0.08);
    }
  }
  for (const c of Object.values(G.ctr)) {
    c._civ = Math.floor(c._civ + 0.001); c._mil = Math.floor(c._mil + 0.001); c._dock = Math.floor(c._dock + 0.001);
    if (c.capit) { c._civ = 0; c._mil = 0; c._dock = 0; }
  }
}

export function maxManpower(c) { return c._rec * c._recruit * (1 + mod(c, 'mpFactor')); }

// ---- construction ----------------------------------------------------------------------------------
export function regionSlots(c, r) { return Math.floor(r.slots * (1 + mod(c, 'slotsPct')) + 0.001); }
export function usedSlots(r) { return r.civ + r.mil + r.dock + r.syn; }
export function buildBlocker(G, c, t, i) {
  const B = BUILD[t];
  const r = G.reg[i];
  if (r.c !== c.tag || r.o !== c.tag) return 'Строить можно только на своей территории';
  if (B.unlock && !c.unlocked[B.unlock]) return 'Нужна технология';
  if (B.coastal && !REG[i].seas.length) return 'Только в прибрежном регионе';
  const queued = c.build.filter((b) => b.r === i && b.t === t).length;
  if (B.slot) {
    const q = c.build.filter((b) => b.r === i && BUILD[b.t].slot).length;
    if (usedSlots(r) + q >= regionSlots(c, r)) return 'Нет свободных мест под застройку';
    if (r[t] + queued >= B.max) return 'Достигнут максимум';
  } else if (r[t] + queued >= B.max) return 'Достигнут максимальный уровень';
  return null;
}
export function queueBuild(G, c, t, i) {
  const err = buildBlocker(G, c, t, i);
  if (err) return err;
  c.build.push({ t, r: i, p: 0 });
  return null;
}
export function availableCivs(c) {
  return Math.max(0, Math.floor(c._civ * (1 - c._consumer)) - Math.ceil(c.trade.cost) + Math.floor(c.trade.gain));
}
function constructionTick(G, c) {
  let civs = availableCivs(c);
  c._civFree = civs;
  if (!c.build.length) return;
  for (let k = 0; k < c.build.length && civs > 0; k++) {
    const b = c.build[k];
    const B = BUILD[b.t];
    const r = G.reg[b.r];
    if (r.c !== c.tag || r.o !== c.tag) { c.build.splice(k--, 1); continue; }
    const use = Math.min(civs, MAX_CIV_PER_PROJECT);
    civs -= use;
    b.p += use * CIV_BUILD * (1 + mod(c, 'buildSpeed') + (B.mod ? mod(c, B.mod) : 0)) * (0.5 + 0.1 * r.infra);
    b._civ = use;
    if (b.p >= B.cost) {
      r[b.t] = Math.min(B.max, r[b.t] + 1);
      c.build.splice(k--, 1);
      if (c.tag === G.player) news(G, `Построено: ${B.name} — ${REG[b.r].name}`, 'info', b.r);
    }
  }
  c._civFree = civs;
}

// ---- production ------------------------------------------------------------------------------------
export function lineCap(c) { return 0.5 + mod(c, 'prodEffCap'); }
export function freeMil(c) { let u = 0; for (const l of c.lines) u += l.fac; return c._mil - u; }
export function freeDock(c) { let u = 0; for (const l of c.docks) u += l.fac; return c._dock - u; }
export function addLine(c, eq, fac) {
  if (EQ[eq].tech && !(c.eqTier[eq] >= 1)) return 'Нужна технология';
  fac = Math.min(fac, freeMil(c), MAX_FAC_PER_LINE);
  if (fac <= 0) return 'Нет свободных заводов';
  const ex = c.lines.find((l) => l.eq === eq);
  if (ex) { setLineFac(c, ex, ex.fac + fac); return null; }
  c.lines.push({ eq, fac, eff: 0.1, acc: 0 });
  return null;
}
export function setLineFac(c, line, n) {
  n = clamp(Math.round(n), 0, Math.min(MAX_FAC_PER_LINE, line.fac + freeMil(c)));
  if (n > line.fac) line.eff = (line.eff * line.fac + 0.1 * (n - line.fac)) / n;
  line.fac = n;
}
export function addDockLine(c, ship, fac) {
  const S = SHIP[ship];
  if (S.tech && !(c.shipTier[ship] >= 1)) return 'Нужна технология';
  fac = Math.min(fac, freeDock(c), S.maxDock);
  if (fac <= 0) return 'Нет свободных верфей';
  c.docks.push({ ship, fac, p: 0 });
  return null;
}
function resourceTick(c) {
  const need = { oil: 0, steel: 0, alu: 0, rub: 0, tun: 0, chr: 0 };
  for (const l of c.lines) { const R = EQ[l.eq].res; for (const k in R) need[k] += R[k] * l.fac * 0.5; }
  for (const l of c.docks) { const R = SHIP[l.ship].res; for (const k in R) need[k] += R[k] * l.fac * 0.5; }
  // fuel for mechanised forces, aircraft and ships
  need.oil += c._fuel || 0;
  const bal = {}, short = {};
  for (const k of RES_KEYS) {
    const have = c._res[k] * (1 - c._export) + (c.trade.imp[k] || 0) * (c._convoyEff ?? 1) + Math.max(0, c._res[k] * c._export - (c._sold?.[k] || 0));
    bal[k] = have - need[k];
    short[k] = need[k] > 0 ? clamp(-bal[k] / need[k], 0, 1) : 0;
  }
  c._need = need; c._bal = bal; c._short = short;
}
function lineFactor(c, res) {
  let worst = 0;
  for (const k in res) if (c._short[k] > worst) worst = c._short[k];
  return 1 - 0.7 * worst;
}
function productionTick(G, c) {
  // trim lines when factories were lost
  let over = -freeMil(c);
  for (let k = c.lines.length - 1; k >= 0 && over > 0; k--) { const cut = Math.min(over, c.lines[k].fac); c.lines[k].fac -= cut; over -= cut; }
  over = -freeDock(c);
  for (let k = c.docks.length - 1; k >= 0 && over > 0; k--) { const cut = Math.min(over, c.docks[k].fac); c.docks[k].fac -= cut; over -= cut; }
  const out = 1 + mod(c, 'factoryOutput');
  const cap = lineCap(c);
  for (const l of c.lines) {
    if (l.fac <= 0) continue;
    const E = EQ[l.eq];
    if (l.eff < cap) l.eff = Math.min(cap, l.eff + (0.001 * cap * cap) / Math.max(0.05, l.eff));
    else l.eff = cap;
    const f = lineFactor(c, E.res);
    l._out = (l.fac * FACTORY_OUT * l.eff * Math.max(0.2, out) * f) / E.cost;
    l.acc += l._out;
    if (l.acc >= 1) { const n = Math.floor(l.acc); c.stock[l.eq] = (c.stock[l.eq] || 0) + n; l.acc -= n; }
  }
  const dout = 1 + mod(c, 'dockOutput') + 0.5 * mod(c, 'factoryOutput');
  for (let k = c.docks.length - 1; k >= 0; k--) {
    const l = c.docks[k];
    if (l.fac <= 0) continue;
    const S = SHIP[l.ship];
    l._out = l.fac * DOCK_OUT * Math.max(0.2, dout) * lineFactor(c, S.res);
    l.p += l._out;
    while (l.p >= S.cost) {
      l.p -= S.cost;
      if (l.ship === 'convoy') c.convoys += 5; else addShip(G, c, l.ship);
      if (c.tag === G.player && l.ship !== 'convoy') news(G, `Спущен на воду корабль: ${S.name.toLowerCase().replace(/ы$/, '')}`, 'info');
    }
  }
}

// ---- trade -----------------------------------------------------------------------------------------
/** weekly: countries with shortages buy resources from exporters for civilian factories */
export function tradeTick(G) {
  const list = Object.values(G.ctr).filter((c) => c.alive && !c.capit);
  for (const c of list) { c.trade = { imp: {}, cost: 0, gain: 0, from: {} }; c._sold = {}; }
  for (const c of list) resourceTick(c);
  const order = list.slice().sort((a, b) => (b.tag === G.player) - (a.tag === G.player) || b._mil - a._mil);
  for (const c of order) {
    if (!c.autoTrade) continue;
    const budget = Math.floor(c._civ * (1 - c._consumer) * 0.5);
    let spent = 0;
    for (const k of RES_KEYS) {
      let want = -c._bal[k];
      if (want <= 0.5) continue;
      const cands = [];
      for (const e of list) {
        if (e === c || atWar(G, c.tag, e.tag)) continue;
        const market = e._res[k] * e._export - (e._sold[k] || 0);
        if (market < 1) continue;
        const op = opinion(G, c.tag, e.tag);
        if (op < -60) continue;
        cands.push([op + (e.fac && e.fac === c.fac ? 50 : 0) + (LANDMASS[e.cap] === LANDMASS[c.cap] ? 20 : 0) + Math.min(30, market), e, market]);
      }
      cands.sort((a, b) => b[0] - a[0]);
      for (const [, e, market] of cands) {
        if (want <= 0.5 || spent >= budget) break;
        const amt = Math.min(want, market, (budget - spent) * 8);
        if (amt <= 0) break;
        c.trade.imp[k] = (c.trade.imp[k] || 0) + amt;
        c.trade.from[e.tag] = (c.trade.from[e.tag] || 0) + amt;
        if (LANDMASS[e.cap] !== LANDMASS[c.cap]) c._seaImports = (c._seaImports || 0) + amt;
        e._sold[k] = (e._sold[k] || 0) + amt;
        const civ = amt / 8;
        c.trade.cost += civ; e.trade.gain += civ; spent += civ; want -= amt;
      }
    }
  }
  for (const c of list) resourceTick(c);
}

// ---- research --------------------------------------------------------------------------------------
export function canResearch(c, id) {
  const t = TECHS[id];
  if (!t || c.tech[id]) return false;
  if (c.research.some((r) => r && r.id === id)) return false;
  for (const q of t.req) if (!c.tech[q]) return false;
  if (t.excl) for (const x of t.excl) if (c.tech[x] || c.research.some((r) => r && r.id === x)) return false;
  // exclusive doctrine branches: a branch is locked when another branch has been started
  if (t.cat === 'doc' && /^(mw|sf|gb|ma)\d$/.test(id)) {
    const pre = id.slice(0, 2);
    for (const p of ['mw', 'sf', 'gb', 'ma']) if (p !== pre && (c.tech[p + '1'] || c.research.some((r) => r && r.id === p + '1'))) return false;
  }
  return true;
}
export function researchSpeed(G, c, id) {
  const t = TECHS[id];
  let sp = 1 + mod(c, 'researchSpeed');
  const b = c.rbonus.find((x) => x.cat === t.cat || x.cat === 'all');
  if (b) sp *= 1 + b.pct;
  const ahead = t.year - yearOf(G.day);
  if (ahead > 0) sp /= 1 + 2 * ahead;
  return sp;
}
export function startResearch(G, c, id, slot) {
  if (!canResearch(c, id)) return false;
  if (slot === undefined) { for (slot = 0; slot < c.rs; slot++) if (!c.research[slot]) break; }
  if (slot >= c.rs) return false;
  c.research[slot] = { id, p: 0 };
  return true;
}
function researchTick(G, c) {
  for (let s = 0; s < c.rs; s++) {
    const r = c.research[s];
    if (!r) continue;
    const t = TECHS[r.id];
    r.p += researchSpeed(G, c, r.id);
    if (r.p >= t.cost) {
      c.tech[r.id] = 1;
      c.research[s] = null;
      const bi = c.rbonus.findIndex((x) => x.cat === t.cat || x.cat === 'all');
      if (bi >= 0 && --c.rbonus[bi].n <= 0) c.rbonus.splice(bi, 1);
      refreshTech(c); recalcMods(G, c); recalcTemplates(c);
      if (t.eq) for (const l of c.lines) if (l.eq === t.eq[0]) l.eff = Math.max(0.1, l.eff * 0.75);
      if (c.tag === G.player) news(G, `Исследование завершено: ${t.name}`, 'tech');
    }
  }
}

// ---- politics --------------------------------------------------------------------------------------
export function lawBlocker(G, c, kind, idx) {
  const L = LAWS[kind].list[idx];
  if (!L) return 'Нет такого закона';
  if (c.laws[kind] === idx) return 'Уже действует';
  if (c.pp < 150) return 'Нужно 150 политической власти';
  const war = isAtWar(G, c.tag);
  const total = c.ideo === 'fas' || c.ideo === 'com';
  if (c.flags.isolation && kind !== 'trd' && idx > (kind === 'eco' ? 1 : 2)) return 'Изоляционизм не позволяет';
  switch (L.need) {
    case 'tension10': if (!(war || total || c.ideo === 'neu' || G.tension >= 10)) return 'Нужна мировая напряжённость ≥10%'; break;
    case 'tension25': if (!(war || total || G.tension >= 25)) return 'Нужна мировая напряжённость ≥25% или война'; break;
    case 'war': if (!(war || G.tension >= 60 || (total && G.tension >= 35))) return 'Нужна война или высокая напряжённость'; break;
    case 'totalwar': if (!(war && (c.ws >= 0.5 || total))) return 'Нужна война и поддержка войны ≥50%'; break;
    default:
  }
  return null;
}
export function setLaw(G, c, kind, idx) {
  c.laws[kind] = idx;
  recalcMods(G, c);
}
function politicsTick(G, c) {
  c.pp = Math.min(2000, c.pp + 2 * (1 + mod(c, 'ppGain')));
  const war = isAtWar(G, c.tag);
  // stability & war support drift to targets
  let st = 0.45 + (c.sup[c.ideo] - 0.4) * 0.5 + mod(c, 'stability');
  if (war) st -= 0.07;
  if (c._bombed > 0.2) st -= 0.05;
  let ws = 0.15 + mod(c, 'warSupport') + G.tension / 250;
  if (c.ideo === 'fas' || c.ideo === 'com') ws += 0.2;
  if (war) {
    ws += 0.35;
    if (c._lostRatio) ws -= c._lostRatio * 0.25;
    ws -= Math.min(0.2, c.stats.lost / Math.max(1, c._pop * 0.03) * 0.2);
  }
  if (c.flags.isolation) ws -= 0.15;
  st = clamp(st, 0.05, 1); ws = clamp(ws, 0.02, 1);
  c.stab += clamp(st - c.stab, -0.0015, 0.0015);
  c.ws += clamp(ws - c.ws, -0.002, 0.002);
  // ideology drift
  let moved = false;
  for (const k of IDEO_KEYS) {
    const drift = mod(c, 'drift' + k[0].toUpperCase() + k.slice(1));
    if (drift) { c.sup[k] = clamp(c.sup[k] + drift / 100, 0, 1); moved = true; }
  }
  if (moved) {
    let s = 0;
    for (const k of IDEO_KEYS) s += c.sup[k];
    for (const k of IDEO_KEYS) c.sup[k] /= s;
    let top = c.ideo;
    for (const k of IDEO_KEYS) if (c.sup[k] > c.sup[top]) top = k;
    if (top !== c.ideo && c.sup[top] >= 0.5 && !c.over) {
      c.ideo = top; c.stab = Math.max(0.3, c.stab - 0.1);
      news(G, `${cn(G, c.tag)}: смена режима — ${IDEO[top].name.toLowerCase()}`, 'diplo', c.cap);
    }
  }
  if (c.spirits.length) {
    const n = c.spirits.length;
    c.spirits = c.spirits.filter((s) => !s.until || s.until > G.day);
    if (c.spirits.length !== n) recalcMods(G, c);
  }
}

/** daily economy for one country */
export function economyTick(G, c) {
  politicsTick(G, c);
  resourceTick(c);
  constructionTick(G, c);
  productionTick(G, c);
  researchTick(G, c);
}
/** weekly bookkeeping for one country */
export function weeklyTick(G, c) {
  recalcMods(G, c);
  c.mpLost *= 0.997;
  c.mp = Math.max(0, maxManpower(c) - manpowerInField(G, c) - c.mpLost);
  const lost = c._vpLostCache;
  c._lostRatio = lost || 0;
}

export function totalDeficit(c) {
  let d = 0;
  for (const k of RES_KEYS) if (c._bal && c._bal[k] < 0) d += -c._bal[k];
  return d;
}
export { COUNTRIES, LAND_EQ, enemies };
