// Game state construction (world of 1 Jan 1936) and basic accessors.
import { REG, NREG, regionAtLonLat } from './world.js';
import { COUNTRIES, POP, DEPOSITS, NAVAL_BASES, FORTS, GARRISONS, FACTIONS } from '../data/countries.js';
import { TECHS, START_TECH } from '../data/techs.js';
import { EQ, TEMPLATES, SHIP_KEYS, AIR_EQ } from '../data/equip.js';
import { clamp, pairKey } from './util.js';
import { recalcMods, refreshTech } from './mods.js';
import { calcTemplate, spawnDivision, recalcNeeds } from './land.js';
import { createFleet } from './navy.js';
import { autoWings } from './air.js';
import { initFronts } from './diplo.js';

export const VERSION = 3;

export function C(G, tag) { return G.ctr[tag]; }
export const isMajor = (c) => !!COUNTRIES[c.tag].major;

/** apportion `total` integer items by weights (largest remainder) */
function apportion(total, weights) {
  const s = weights.reduce((a, b) => a + b, 0);
  if (s <= 0 || total <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / s);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; left > 0 && k < order.length; k++, left--) out[order[k][1]]++;
  return out;
}

function cityVP(pop) {
  if (pop < 150000) return 0;
  return Math.max(1, Math.round(Math.log2(pop / 150000)));
}

export function newCountry(tag) {
  const d = COUNTRIES[tag];
  const ideo = d.ideo;
  const sup = d.sup ? { ...d.sup } : { dem: 0.15, fas: 0.1, com: 0.08, neu: 0.1 };
  if (!d.sup) { sup[ideo] = 0.55; const rest = 0.45 / 3; for (const k of ['dem', 'fas', 'com', 'neu']) if (k !== ideo) sup[k] = rest; }
  const tier = d.major ? 3 : d.dev >= 3 ? 2 : d.dev === 2 ? 1 : 0;
  const tech = {};
  for (const t of START_TECH[tier]) tech[t] = 1;
  const total = ideo === 'fas' || ideo === 'com';
  return {
    tag, alive: true, capit: false, cap: -1, ideo, sup, lead: d.lead || '', fac: d.fac || null, over: d.over || null,
    pp: 60, stab: d.stab ?? 0.55, ws: d.ws ?? (total ? 0.45 : 0.25), mp: 0, mpLost: 0,
    laws: {
      eco: tag === 'GER' ? 2 : total || tag === 'JAP' ? 1 : 0,
      con: tag === 'USA' ? 0 : ideo === 'dem' ? 1 : 2,
      trd: tag === 'SOV' ? 3 : total ? 2 : 1,
    },
    adv: [], spirits: [],
    tech, rs: d.rs || 1, research: [], rbonus: [], eqTier: {}, shipTier: {}, unlocked: {},
    focus: { cur: null, p: 0, done: {} },
    build: [], lines: [], docks: [], stock: {}, fielded: {}, need: {},
    tpl: {}, train: [], convoys: 0, trade: { imp: {}, cost: 0, gain: 0 }, autoTrade: true,
    rel: {}, staff: { auto: true, fronts: {}, coast: 1 }, ai: {}, flags: {}, nukes: 0,
    stats: { lost: 0, killed: 0, divLost: 0 },
  };
}

/**
 * Build a fresh game. `playerTag` may be null for an all-AI simulation.
 */
export function newGame(playerTag, opts = {}) {
  const G = {
    v: VERSION, seed: opts.seed ?? 12345, day: 0, player: playerTag, diff: opts.diff || 'normal',
    reg: [], ctr: {}, divs: {}, nextId: 1, wings: [], fleets: [],
    factions: {}, war: {}, pacts: { nap: {}, guar: {}, access: {} }, wargoals: {}, justify: [],
    tension: 0, news: [], evq: [], flags: {}, battles: {}, invasions: [], truce: {},
    opts: { historical: opts.historical !== false, autosave: true },
  };

  // ---- countries --------------------------------------------------------------------------------
  for (const tag of Object.keys(COUNTRIES)) {
    const c = newCountry(tag);
    if (COUNTRIES[tag].dormant) c.alive = false;
    G.ctr[tag] = c;
  }
  for (const [id, f] of Object.entries(FACTIONS)) {
    G.factions[id] = { name: f.name, leader: f.leader, members: Object.values(G.ctr).filter((c) => c.fac === id).map((c) => c.tag) };
  }

  // ---- regions ----------------------------------------------------------------------------------
  const adm0W = {};
  for (const R of REG) {
    const w = R.popW + 30000 + R.area * 6;
    adm0W[R.adm0] = (adm0W[R.adm0] || 0) + w;
  }
  for (const R of REG) {
    const d = COUNTRIES[R.tag0];
    const core = !d.home || d.home.includes(R.adm0) || (d.homeSp && d.homeSp.includes(R.sp));
    const total = POP[R.adm0] ?? Math.round((R.popW * 0.35) / 1000) + 20;
    const pop = Math.max(1, Math.round((total * (R.popW + 30000 + R.area * 6)) / adm0W[R.adm0]));
    let vp = 0;
    for (const ci of R.cities) vp += cityVP(ci[1]);
    if (vp === 0 && pop >= 400) vp = 1;
    G.reg.push({
      o: R.tag0, c: R.tag0, core: core ? R.tag0 : null, pop, vp,
      civ: 0, mil: 0, dock: 0, syn: 0, infra: 1, air: 0, port: 0, fort: 0, aa: 0, slots: 1, res: {}, dmg: 0,
    });
  }
  // capitals
  for (const c of Object.values(G.ctr)) {
    const d = COUNTRIES[c.tag];
    if (d.dormant) continue;
    c.cap = regionAtLonLat(d.cap[0], d.cap[1]);
    if (G.reg[c.cap].o !== c.tag) {
      // fall back to most populous own region
      let best = -1;
      for (let i = 0; i < NREG; i++) if (G.reg[i].o === c.tag && (best < 0 || G.reg[i].pop > G.reg[best].pop)) best = i;
      c.cap = best;
    }
    G.reg[c.cap].vp += d.major ? 22 : 10;
  }
  // buildings
  for (const c of Object.values(G.ctr)) {
    const d = COUNTRIES[c.tag];
    if (d.dormant) continue;
    const own = [];
    for (let i = 0; i < NREG; i++) if (G.reg[i].o === c.tag) own.push(i);
    const cores = own.filter((i) => G.reg[i].core === c.tag);
    const wts = cores.map((i) => Math.pow(REG[i].popW + 60000, 0.85) * (i === c.cap ? 1.6 : 1));
    const civ = apportion(d.ind[0], wts), mil = apportion(d.ind[1], wts);
    const coastal = cores.filter((i) => REG[i].seas.length > 0);
    const dock = apportion(d.ind[2], coastal.map((i) => Math.pow(REG[i].popW + 60000, 0.7)));
    cores.forEach((i, k) => { G.reg[i].civ = civ[k]; G.reg[i].mil = mil[k]; });
    coastal.forEach((i, k) => { G.reg[i].dock = dock[k]; });
    for (const i of own) {
      const r = G.reg[i], R = REG[i];
      const isCore = r.core === c.tag;
      const rough = ['mountain', 'desert', 'jungle', 'tundra', 'marsh'].includes(R.terrain);
      r.infra = isCore ? clamp(d.dev + (R.popW > 1.5e6 ? 1 : 0) - (rough ? 1 : 0), 1, 5) : clamp(1 + (R.popW > 1e6 ? 1 : 0), 1, 5);
      const used = r.civ + r.mil + r.dock;
      r.slots = isCore ? Math.max(used + 1, clamp(Math.round(2 + r.pop / 1100), 2, 12)) : clamp(Math.round(1 + r.pop / 4000), 1, 4);
      const circle = R.adm0.startsWith('ISL_');
      if (isCore) r.air = R.popW >= 2e6 || i === c.cap ? 2 : R.popW >= 4e5 ? 1 : 0;
      else r.air = R.popW >= 1e6 || circle ? 1 : 0;
      if (i === c.cap && d.major) r.air = 3;
      if (R.seas.length) r.port = R.popW >= 1.5e6 ? 2 : R.popW >= 2.5e5 || circle ? 1 : 0;
    }
    // every coastal nation gets at least one port
    if (coastal.length && !own.some((i) => G.reg[i].port > 0)) {
      coastal.sort((a, b) => G.reg[b].pop - G.reg[a].pop);
      G.reg[coastal[0]].port = 1;
    }
  }
  for (const [lon, lat] of NAVAL_BASES) { const i = regionAtLonLat(lon, lat); if (REG[i].seas.length) G.reg[i].port = 3; }
  for (const [lon, lat, lvl] of FORTS) G.reg[regionAtLonLat(lon, lat)].fort = lvl;
  for (const [lon, lat, res, amt] of DEPOSITS) {
    const r = G.reg[regionAtLonLat(lon, lat)];
    r.res[res] = (r.res[res] || 0) + amt;
  }

  // ---- armed forces -----------------------------------------------------------------------------
  for (const c of Object.values(G.ctr)) {
    const d = COUNTRIES[c.tag];
    refreshTech(c);
    if (d.dormant) continue;
    for (const [key, t] of Object.entries(TEMPLATES)) {
      if (['inf', 'mil', 'gar', 'cav'].includes(key) || (d.army && d.army[key]) || (d.major && ['mot', 'ltk'].includes(key))) {
        c.tpl[key] = { name: t.name, bats: { ...t.bats }, sup: t.sup.filter((s) => c.unlocked[s]), icon: t.icon };
      }
    }
    // weaker starting infantry for backward armies
    if (!d.major && d.dev <= 2) c.tpl.inf.bats = { inf: 6, art: 1 };
    recalcMods(G, c);
    for (const k of Object.keys(c.tpl)) calcTemplate(c, c.tpl[k]);
    c.convoys = { ENG: 420, USA: 260, JAP: 190, FRA: 130, ITA: 110, GER: 100, HOL: 110, NOR: 100 }[c.tag] ?? 12 + d.ind[2] * 8;
    const army = { ...(d.army || {}) };
    for (const [lon, lat, n, tplKey] of GARRISONS[c.tag] || []) {
      const r = regionAtLonLat(lon, lat);
      for (let k = 0; k < n; k++) {
        const key = army[tplKey] > 0 ? tplKey : army.inf > 0 ? 'inf' : null;
        if (!key) break;
        army[key]--;
        spawnDivision(G, c, key, r);
      }
    }
    // remaining army: spread over core regions by victory points (the staff AI will redeploy)
    const cores = [];
    for (let i = 0; i < NREG; i++) if (G.reg[i].o === c.tag && G.reg[i].core === c.tag) cores.push(i);
    if (!cores.length) cores.push(c.cap);
    const wts = cores.map((i) => 1 + G.reg[i].vp);
    for (const [key, n] of Object.entries(army)) {
      const alloc = apportion(n, wts);
      cores.forEach((i, k) => { for (let j = 0; j < alloc[k]; j++) spawnDivision(G, c, key, i); });
    }
    recalcNeeds(G, c);
    const fill = d.major ? 0.97 : 0.88;
    for (const k of Object.keys(c.need)) { c.fielded[k] = c.need[k] * fill; c.stock[k] = Math.round(c.need[k] * 0.06); }
    for (const k of AIR_EQ) c.stock[k] = (d.air && d.air[k]) || 0;
    autoWings(G, c);
    if (d.navy) {
      const ports = [];
      for (let i = 0; i < NREG; i++) if (G.reg[i].o === c.tag && G.reg[i].port > 0) ports.push(i);
      ports.sort((a, b) => (G.reg[b].port - G.reg[a].port) || ((G.reg[b].core === c.tag) - (G.reg[a].core === c.tag)) || (G.reg[b].pop - G.reg[a].pop));
      if (ports.length) {
        const nf = d.major ? Math.min(ports.length, c.tag === 'ENG' ? 5 : c.tag === 'USA' || c.tag === 'JAP' ? 4 : 3) : 1;
        for (let f = 0; f < nf; f++) {
          const ships = {};
          for (const k of SHIP_KEYS) {
            const tot = d.navy[k] || 0;
            ships[k] = Math.floor(tot / nf) + (f < tot % nf ? 1 : 0);
          }
          createFleet(G, c, ships, ports[f % ports.length]);
        }
      }
    }
    c.mp = 0;
  }

  // ---- diplomacy at start -----------------------------------------------------------------------
  for (const a of Object.values(G.ctr)) {
    for (const b of Object.values(G.ctr)) {
      if (a.tag >= b.tag) continue;
      let v = 0;
      if (a.ideo === b.ideo) v += a.ideo === 'neu' ? 5 : 15;
      else if (a.ideo !== 'neu' && b.ideo !== 'neu') v -= 15;
      if (a.fac && a.fac === b.fac) v += 40;
      a.rel[b.tag] = v; b.rel[a.tag] = v;
    }
  }
  // Second Italo-Ethiopian war is already raging
  G.war[pairKey('ITA', 'ETH')] = { start: -90, att: 'ITA' };
  G.tension = 6;
  // Kwantung army sits in Manchukuo etc.: puppets grant access automatically (see diplo.canEnter)

  for (const c of Object.values(G.ctr)) { if (c.alive) { recalcMods(G, c); initFronts(G, c); } }
  return G;
}

/** strip caches for saving */
export function serialize(G) {
  return JSON.stringify(G, (k, v) => (k.length && k[0] === '_' ? undefined : v));
}
export function deserialize(str) {
  const G = JSON.parse(str);
  rebuildCaches(G);
  return G;
}
export function rebuildCaches(G) {
  for (const c of Object.values(G.ctr)) {
    refreshTech(c);
    recalcMods(G, c);
    for (const k of Object.keys(c.tpl)) calcTemplate(c, c.tpl[k]);
    recalcNeeds(G, c);
  }
  G._byReg = null;
}

export { TECHS, EQ };
