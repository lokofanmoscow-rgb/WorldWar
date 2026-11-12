// Naval war: fleets in sea zones, naval battles, convoy raiding, sea transport and invasions.
import { REG, NREG, SEA, NSEA, SEA_LINKS, LANDMASS, seaPath, distKm } from './world.js';
import { SHIP, SHIP_KEYS } from '../data/equip.js';
import { clamp, rnd } from './util.js';
import { mod } from './mods.js';
import { atWar, friendly, sameSide, enemies, news, cn } from './diplo.js';
import { divsOf, divsIn, destroyDivision } from './land.js';
import { navalAirPower } from './air.js';

const TIER = [0.75, 1, 1.25, 1.5, 1.8, 2.1];
const SCREEN_W = { dd: 2.0, cl: 1.5, bb: 1.0, cv: 0.5 };
export const FLEET_MIS = { port: 'В порту', patrol: 'Патрулирование', raid: 'Рейдерство', escort: 'Охрана конвоев' };

const LINK_CTRL = new Map();
for (const [a, b, r] of SEA_LINKS) { LINK_CTRL.set(a + '|' + b, r); LINK_CTRL.set(b + '|' + a, r); }
/** may ships of `tag` pass from zone u to v (canals and straits held by an enemy are closed) */
export function canPass(G, tag, u, v) {
  const r = LINK_CTRL.get(u + '|' + v);
  if (r === undefined || r < 0) return true;
  return !atWar(G, tag, G.reg[r].c);
}
export function routeBetween(G, tag, fromRegion, toRegion) {
  let best = null;
  for (const a of REG[fromRegion].seas) for (const b of REG[toRegion].seas) {
    const p = seaPath(a, b, (u, v) => canPass(G, tag, u, v));
    if (p && (!best || p.length < best.length)) best = p;
  }
  return best;
}

// ---- fleets ------------------------------------------------------------------------------------
export function createFleet(G, c, ships, port, name) {
  c.fleetN = (c.fleetN || 0) + 1;
  const f = { id: G.nextId++, o: c.tag, name: name || `${c.fleetN}-й флот`, ships: { dd: 0, cl: 0, bb: 0, cv: 0, ss: 0, ...ships }, dmg: {}, port, zone: -1, mis: 'port', tgt: -1, eta: 0, rep: 0 };
  G.fleets.push(f);
  return f;
}
export function bestPort(G, tag) {
  let best = -1, bs = -1;
  const c = G.ctr[tag];
  for (let i = 0; i < NREG; i++) {
    const r = G.reg[i];
    if (r.c !== tag || r.port <= 0) continue;
    const s = r.port * 10 + (r.core === tag ? 5 : 0) + (i === c.cap ? 3 : 0) + r.pop / 5000;
    if (s > bs) { bs = s; best = i; }
  }
  return best;
}
export function addShip(G, c, cls) {
  let f = G.fleets.find((x) => x.o === c.tag && x.zone === -1 && x.reserve);
  if (!f) {
    const port = bestPort(G, c.tag);
    if (port < 0) return;
    f = createFleet(G, c, {}, port, 'Резерв флота');
    f.reserve = 1;
  }
  f.ships[cls] = (f.ships[cls] || 0) + 1;
}
export function fleetSize(f) { let n = 0; for (const k of SHIP_KEYS) n += f.ships[k] || 0; return n; }
export function fleetPower(G, f) {
  const c = G.ctr[f.o];
  let surf = 0, sub = 0, asw = 0, hp = 0, hpSub = 0;
  const fuel = c._short && c._short.oil > 0.5 ? 0.7 : 1;
  for (const k of SHIP_KEYS) {
    const n = f.ships[k] || 0;
    if (!n) continue;
    const S = SHIP[k], t = TIER[c.shipTier[k] || 1];
    if (S.sub) { sub += n * S.pow * t * (1 + mod(c, 'subAttack')); hpSub += n * S.hp * t; }
    else { surf += n * S.pow * t; hp += n * S.hp * t; }
    asw += n * S.asw * t;
  }
  const na = (1 + mod(c, 'navalAttack')) * fuel;
  return { surf: surf * na, sub: sub * na, asw: asw * (1 + mod(c, 'convoyEscort')), hp: hp * (1 + mod(c, 'navalDefense')), hpSub };
}
export function setFleetMission(G, f, mis, zone) {
  if (mis === 'port' || zone === undefined || zone < 0) { f.mis = 'port'; f.tgt = -1; f.zone = -1; f.eta = 0; return true; }
  const from = REG[f.port].seas;
  let path = null;
  for (const a of from) { const p = seaPath(a, zone, (u, v) => canPass(G, f.o, u, v)); if (p && (!path || p.length < path.length)) path = p; }
  if (!path) return false;
  f.mis = mis; f.tgt = zone;
  if (f.zone !== zone) { f.zone = -2; f.eta = Math.max(1, Math.ceil(path.length * 0.8)); }
  return true;
}
export function mergeFleets(G, a, b) {
  for (const k of SHIP_KEYS) { a.ships[k] = (a.ships[k] || 0) + (b.ships[k] || 0); a.dmg[k] = (a.dmg[k] || 0) + (b.dmg[k] || 0); }
  G.fleets = G.fleets.filter((x) => x !== b);
}
export function splitFleet(G, f, part) {
  const c = G.ctr[f.o];
  const ships = {};
  let any = false;
  for (const k of SHIP_KEYS) { const n = Math.min(f.ships[k] || 0, Math.max(0, part[k] || 0)); ships[k] = n; f.ships[k] -= n; if (n) any = true; }
  if (!any) return null;
  const nf = createFleet(G, c, ships, f.port);
  return nf;
}

function hostileFleets(G, list, tag) { return list.filter((x) => atWar(G, tag, x.o)); }

/** naval dominance of tag's side and its enemies in a zone */
export function dominance(G, zone, tag) {
  let own = 0, foe = 0;
  for (const f of G.fleets) {
    if (f.zone !== zone) continue;
    const p = fleetPower(G, f).surf;
    if (f.o === tag || sameSide(G, f.o, tag)) own += p;
    else if (atWar(G, tag, f.o)) foe += p + fleetPower(G, f).sub * 0.3;
  }
  own += navalAirPower(G, zone, tag) * 0.5;
  for (const e of enemies(G, tag)) { foe += navalAirPower(G, zone, e) * 0.5; break; }
  return { own, foe };
}

function applyDamage(G, f, surfDmg, subDmg) {
  const c = G.ctr[f.o];
  const def = 1 + mod(c, 'navalDefense');
  let sunk = 0;
  if (surfDmg > 0) {
    let tw = 0;
    for (const k of ['dd', 'cl', 'bb', 'cv']) tw += (f.ships[k] || 0) * SHIP[k].hp * SCREEN_W[k];
    if (tw > 0) {
      for (const k of ['dd', 'cl', 'bb', 'cv']) {
        const n = f.ships[k] || 0;
        if (!n) continue;
        const hp = SHIP[k].hp * TIER[c.shipTier[k] || 1] * def;
        f.dmg[k] = (f.dmg[k] || 0) + (surfDmg * n * SHIP[k].hp * SCREEN_W[k]) / tw;
        while (f.dmg[k] >= hp && f.ships[k] > 0) { f.ships[k]--; f.dmg[k] -= hp; sunk++; c.stats.ships = (c.stats.ships || 0) + 1; }
        if (!f.ships[k]) f.dmg[k] = 0;
      }
    }
  }
  if (subDmg > 0 && f.ships.ss > 0) {
    const hp = SHIP.ss.hp * TIER[c.shipTier.ss || 1] * def;
    f.dmg.ss = (f.dmg.ss || 0) + subDmg;
    while (f.dmg.ss >= hp && f.ships.ss > 0) { f.ships.ss--; f.dmg.ss -= hp; sunk++; c.stats.ships = (c.stats.ships || 0) + 1; }
  }
  return sunk;
}

function battles(G) {
  const byZone = new Map();
  for (const f of G.fleets) { if (f.zone >= 0) (byZone.get(f.zone) || byZone.set(f.zone, []).get(f.zone)).push(f); }
  for (const [zone, list] of byZone) {
    if (list.length < 2) { for (const f of list) f.hp0 = 0; continue; }
    const pow = new Map();
    let fight = false;
    for (const f of list) pow.set(f, fleetPower(G, f));
    const airDone = new Set();
    const hits = new Map();
    for (const f of list) {
      const foes = hostileFleets(G, list, f.o);
      if (!foes.length) { f.hp0 = 0; continue; }
      fight = true;
      const P = pow.get(f);
      if (!f.hp0) f.hp0 = P.hp + P.hpSub;
      let air = 0;
      if (!airDone.has(f.o)) { air = navalAirPower(G, zone, f.o) * 0.8; airDone.add(f.o); }
      let thp = 0, tsub = 0;
      for (const t of foes) { const Q = pow.get(t); thp += Q.hp; tsub += Q.hpSub; }
      for (const t of foes) {
        const Q = pow.get(t);
        const h = hits.get(t) || hits.set(t, [0, 0]).get(t);
        // submarines on a raiding mission are hard to pin down
        const hidden = t.mis === 'raid' ? 0.5 : 1;
        if (thp > 0) h[0] += (P.surf + P.sub * 0.5 + air) * (Q.hp / thp) * 0.1 * (0.6 + 0.8 * rnd(G));
        if (tsub > 0) h[1] += (P.asw * 0.2 + air * 0.05) * (Q.hpSub / tsub) * hidden * (0.6 + 0.8 * rnd(G));
      }
    }
    if (!fight) continue;
    let sunkPlayer = 0, sunkFoe = 0;
    for (const [t, h] of hits) {
      const s = applyDamage(G, t, h[0], h[1]);
      if (s) { if (t.o === G.player) sunkPlayer += s; else if (G.player && atWar(G, G.player, t.o)) sunkFoe += s; }
    }
    if (G.player && (sunkPlayer || sunkFoe) && list.some((f) => f.o === G.player)) {
      news(G, `Морской бой, ${SEA[zone].name}: потоплено кораблей противника — ${sunkFoe}, наших — ${sunkPlayer}`, sunkFoe >= sunkPlayer ? 'good' : 'bad');
    }
    // retreats
    for (const f of list) {
      if (!f.hp0) continue;
      const P = fleetPower(G, f);
      const foes = hostileFleets(G, list, f.o);
      let fp = 0;
      for (const t of foes) { const Q = fleetPower(G, t); fp += Q.surf + Q.asw * (f.ships.ss ? 0.5 : 0); }
      const mine = P.surf + P.sub * 0.6;
      if (P.hp + P.hpSub < f.hp0 * 0.6 || (fp > mine * 3 && f.mis !== 'raid') || fleetSize(f) === 0) {
        f.zone = -1; f.rep = 25; f.hp0 = 0;
        if (f.o === G.player && fleetSize(f) > 0) news(G, `${f.name} выходит из боя и возвращается в порт`, 'bad');
      }
    }
  }
}

function raiding(G) {
  for (const f of G.fleets) {
    if (f.zone < 0 || f.mis !== 'raid') continue;
    const P = fleetPower(G, f);
    const raid = P.sub + P.surf * 0.25;
    if (raid <= 0) continue;
    for (const e of enemies(G, f.o)) {
      const c = G.ctr[e];
      if (!c.alive || !c._lanes || !c._lanes[f.zone] || c.convoys <= 0) continue;
      let esc = 0;
      for (const g of G.fleets) if (g.zone === f.zone && (g.o === e || sameSide(G, g.o, e)) && (g.mis === 'escort' || g.mis === 'patrol')) esc += fleetPower(G, g).asw;
      const sunk = (raid * 0.0012 * (0.5 + rnd(G))) / (1 + esc / 30);
      c.convoys = Math.max(0, c.convoys - sunk);
      c.stats.convoys = (c.stats.convoys || 0) + sunk;
      c._raided = (c._raided || 0) + sunk;
    }
  }
}

// ---- sea lanes ---------------------------------------------------------------------------------
export function homeZone(G, c) {
  if (c.cap >= 0 && REG[c.cap].seas.length && G.reg[c.cap].c === c.tag) return REG[c.cap].seas[0];
  const p = bestPort(G, c.tag);
  return p >= 0 ? REG[p].seas[0] : -1;
}
/** weekly: which sea zones carry this country's trade and overseas supply */
export function lanesTick(G, c) {
  const lanes = {};
  const H = homeZone(G, c);
  c._lanes = lanes; c._convoyNeed = 0; c._convoyEff = 1;
  if (H < 0) return;
  const dests = new Set();
  let need = 0;
  for (const t in c.trade.from || {}) {
    const p = G.ctr[t];
    if (!p || LANDMASS[p.cap] === LANDMASS[c.cap]) continue;
    const z = homeZone(G, p);
    if (z >= 0) { dests.add(z); need += c.trade.from[t] * 0.35; }
  }
  const seen = new Set();
  for (const d of divsOf(G, c.tag)) {
    if (d.sea) continue;
    const lm = LANDMASS[d.r];
    if (lm === LANDMASS[c.cap]) continue;
    need += 1.5;
    if (seen.has(lm)) continue;
    seen.add(lm);
    // nearest friendly port on that land mass
    let best = -1, bd = 1e9;
    for (let i = 0; i < NREG; i++) {
      if (LANDMASS[i] !== lm || !REG[i].seas.length || !friendly(G, c.tag, G.reg[i].c)) continue;
      const dist = distKm(i, d.r) - G.reg[i].port * 200;
      if (dist < bd) { bd = dist; best = i; }
    }
    if (best >= 0) dests.add(REG[best].seas[0]);
  }
  let k = 0;
  for (const z of dests) {
    if (k++ > 10) break;
    const p = seaPath(H, z, (u, v) => canPass(G, c.tag, u, v));
    if (!p) continue;
    for (const s of p) lanes[s] = 1;
    need += 3;
  }
  c._convoyNeed = need;
  c._convoyEff = need > 0 ? clamp(c.convoys / need, 0.15, 1) : 1;
}

// ---- transports / invasions ----------------------------------------------------------------------
export function seaOrderBlocker(G, tag, from, to, n) {
  if (!REG[from].seas.length) return 'Войска должны находиться в прибрежном регионе';
  if (!REG[to].seas.length) return 'Цель не имеет выхода к морю';
  const c = G.ctr[tag];
  const ctl = G.reg[to].c;
  if (!(ctl === tag || friendly(G, tag, ctl) || atWar(G, tag, ctl))) return 'Нет права прохода';
  if (c.convoys < n * 4) return `Нужно транспортов: ${n * 4} (есть ${Math.floor(c.convoys)})`;
  if (!routeBetween(G, tag, from, to)) return 'Нет морского пути';
  return null;
}
/** ship divisions (all standing in the same coastal region) to another coastal region */
export function orderSea(G, tag, divs, to) {
  if (!divs.length) return 'Нет дивизий';
  const from = divs[0].r;
  const err = seaOrderBlocker(G, tag, from, to, divs.length);
  if (err) return err;
  const c = G.ctr[tag];
  const hostile = atWar(G, tag, G.reg[to].c);
  const path = routeBetween(G, tag, from, to);
  const prep = hostile ? Math.max(5, Math.round((12 + 3 * divs.length) * (1 + mod(c, 'invasionPrep')))) : 2;
  const t = { id: G.nextId++, o: tag, divs: divs.map((d) => d.id), from, to, path, i: -1, kind: hostile ? 'inv' : 'move', prep, wait: 0 };
  for (const d of divs) { d.tr = t.id; d.path = []; d.mp = 0; }
  G.invasions.push(t);
  return null;
}
function transports(G) {
  for (let k = G.invasions.length - 1; k >= 0; k--) {
    const t = G.invasions[k];
    const c = G.ctr[t.o];
    let live = t.divs.map((id) => G.divs[id]).filter((d) => d && d.tr === t.id);
    if (!c || !c.alive || !live.length) { for (const d of live) { d.tr = 0; if (d.sea) destroyDivision(G, d, null); } G.invasions.splice(k, 1); continue; }
    if (t.i < 0) {
      // preparing in port
      live = live.filter((d) => d.r === t.from && !d.ret);
      t.divs = live.map((d) => d.id);
      if (!live.length) { G.invasions.splice(k, 1); continue; }
      if (--t.prep > 0) continue;
      const hostile = atWar(G, t.o, G.reg[t.to].c);
      if (t.kind === 'inv' && hostile) {
        const dom = dominance(G, t.path[t.path.length - 1], t.o);
        if (dom.foe > dom.own * 1.1 + 5) {
          if (++t.wait > 45) { for (const d of live) d.tr = 0; G.invasions.splice(k, 1); if (t.o === G.player) news(G, `Десант на ${REG[t.to].name} отменён: нет господства на море`, 'bad', t.to); }
          continue;
        }
      } else if (!hostile && !friendly(G, t.o, G.reg[t.to].c)) { for (const d of live) d.tr = 0; G.invasions.splice(k, 1); continue; }
      for (const d of live) { d.sea = t.id; d.path = []; d.ent = 0; }
      G._byReg = null;
      t.i = 0;
      continue;
    }
    // at sea
    const zone = t.path[Math.min(t.i, t.path.length - 1)];
    let foe = 0, own = 0;
    for (const f of G.fleets) {
      if (f.zone !== zone) continue;
      const P = fleetPower(G, f);
      if (atWar(G, t.o, f.o)) foe += P.surf + P.sub; else if (f.o === t.o || sameSide(G, f.o, t.o)) own += P.surf + P.asw;
    }
    if (foe > own * 1.5 + 10) {
      const loss = clamp(0.06 + 0.1 * (foe / (foe + own + 50)), 0, 0.2);
      for (const d of live) { d.str -= loss; if (d.str <= 0.1) destroyDivision(G, d, null); }
      c.convoys = Math.max(0, c.convoys - live.length * 0.5);
      if (t.o === G.player) news(G, `Транспорты атакованы в море (${SEA[zone].name})`, 'bad');
    }
    t.i++;
    if (t.i < Math.max(2, t.path.length)) continue;
    // arrival
    live = t.divs.map((id) => G.divs[id]).filter((d) => d && d.tr === t.id);
    const ctl = G.reg[t.to].c;
    for (const d of live) {
      d.tr = 0;
      if (ctl === t.o || friendly(G, t.o, ctl)) { d.sea = null; d.r = t.to; d.org *= 0.7; }
      else if (atWar(G, t.o, ctl)) { d.amph = t.to; d.amphFrom = t.from; }
      else { d.sea = null; d.r = t.from; }
    }
    G._byReg = null;
    if (t.kind === 'inv' && t.o === G.player) news(G, `Десант высаживается: ${REG[t.to].name}`, 'war', t.to);
    else if (t.kind === 'inv' && ctl === G.player) news(G, `Вражеский десант: ${REG[t.to].name}!`, 'bad', t.to);
    G.invasions.splice(k, 1);
  }
}

/** daily naval update */
export function navyTick(G) {
  for (let k = G.fleets.length - 1; k >= 0; k--) {
    const f = G.fleets[k];
    const c = G.ctr[f.o];
    if (!c || !c.alive || (fleetSize(f) === 0 && !f.reserve)) { G.fleets.splice(k, 1); continue; }
    // home port lost
    const ctl = G.reg[f.port].c;
    if (ctl !== f.o && !friendly(G, f.o, ctl)) {
      const p = bestPort(G, f.o);
      if (p < 0) { G.fleets.splice(k, 1); continue; }
      f.port = p; if (f.zone === -1) f.rep = Math.max(f.rep, 5);
    }
    if (f.zone === -1) {
      for (const key of SHIP_KEYS) if (f.dmg[key] > 0) f.dmg[key] = Math.max(0, f.dmg[key] - SHIP[key].hp * 0.04);
      if (f.rep > 0) { f.rep--; continue; }
      if (f.mis !== 'port' && f.tgt >= 0) setFleetMission(G, f, f.mis, f.tgt);
    } else if (f.zone === -2) {
      if (--f.eta <= 0) f.zone = f.tgt;
    }
  }
  battles(G);
  raiding(G);
  transports(G);
}

export function shipsTotal(G, tag) {
  const t = { dd: 0, cl: 0, bb: 0, cv: 0, ss: 0 };
  for (const f of G.fleets) if (f.o === tag) for (const k of SHIP_KEYS) t[k] += f.ships[k] || 0;
  return t;
}
export { NSEA, divsIn };
