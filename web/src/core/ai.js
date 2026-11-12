// Country AI: research, construction, production, recruitment, politics, air and naval deployment.
// The same routines act as "ministers" for the player when an automation switch is on.
import { REG, NREG, SEA, distKm } from './world.js';
import { COUNTRIES } from '../data/countries.js';
import { TECHS, TECH_LIST } from '../data/techs.js';
import { EQ, SHIP, SHIP_KEYS, LAND_EQ, PLANE } from '../data/equip.js';
import { LAWS, ADVISORS, MAX_ADVISORS, BUILD } from '../data/laws.js';
import { rnd, yearOf, clamp } from './util.js';
import { mod, recalcMods } from './mods.js';
import { canResearch, startResearch, queueBuild, buildBlocker, regionSlots, usedSlots, freeMil, freeDock, addLine, setLineFac, addDockLine, lawBlocker, setLaw, availableCivs, maxManpower } from './economy.js';
import { divsOf, queueTraining, calcTemplate, recalcNeeds, tplFill } from './land.js';
import { atWar, enemies, isAtWar, joinFaction, sameSide, frontFlags, friendly } from './diplo.js';
import { autoWings, airfields, baseFree, planeRange, nukeStrike, nukeBlocker } from './air.js';
import { fleetPower, fleetSize, setFleetMission, homeZone, createFleet, mergeFleets } from './navy.js';
import { staffPlan, aiStances } from './staff.js';

const NAVAL = { ENG: 1, USA: 1, JAP: 1, FRA: 1, ITA: 1, GER: 1 };
const DOCTRINE = { GER: 'mw', SOV: 'ma', ENG: 'gb', FRA: 'gb', ITA: 'gb', JAP: 'gb', USA: 'sf', CHI: 'ma', POL: 'gb' };
const CIV_UNTIL = { GER: 1937.2, ITA: 1937.0, JAP: 1937.2, SOV: 1938.5, ENG: 1938.3, FRA: 1938.3, USA: 1940.3 };

function hash(tag) { let h = 0; for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0; return h; }

// ---- research ------------------------------------------------------------------------------------
function techWeight(G, c, t, year) {
  const major = !!COUNTRIES[c.tag].major;
  const id = t.id;
  const fam = id.replace(/\d+$/, '');
  let w = 1;
  switch (t.cat) {
    case 'ind': w = fam === 'syn' ? ((c._short && (c._short.oil > 0.2 || c._short.rub > 0.2)) ? 2.5 : 0.5) : fam === 'exc' ? 1.5 : 3; break;
    case 'ele': w = fam === 'comp' ? 3 : fam === 'radio' ? 2 : fam === 'radar' ? 1.2 : fam === 'atom' ? (c.tag === 'USA' && year >= 1941 ? 1.6 : major ? 0.4 : 0.03) : 1; break;
    case 'inf': w = fam === 'rifle' ? 2.5 : fam === 'supeq' ? 1.5 : fam === 'mot' ? (major ? 2 : 0.5) : fam === 'log' ? 0.8 : 1.3; break;
    case 'art': w = fam === 'art' ? 2.2 : fam === 'at' ? 1 : fam === 'aa' ? 0.8 : 1; break;
    case 'arm': w = fam === 'ltank' ? (major ? 2 : 0.4) : fam === 'mtank' ? (major ? 2.5 : 0.5) : (c.tag === 'SOV' || c.tag === 'GER' ? 1.4 : major ? 0.8 : 0.1); break;
    case 'air': w = fam === 'fighter' ? (major ? 2.2 : 1) : fam === 'cas' ? (major ? 1.3 : 0.3) : fam === 'tac' ? (major ? 1 : 0.3) : fam === 'strat' ? (c.tag === 'ENG' || c.tag === 'USA' ? 1.5 : 0.2) : (NAVAL[c.tag] ? 1 : 0.2); break;
    case 'nav': {
      const d = c._dock || 0;
      if (d < 3) w = 0.1;
      else if (fam === 'cv') w = c.tag === 'JAP' || c.tag === 'USA' || c.tag === 'ENG' ? 1.6 : 0.2;
      else if (fam === 'ss') w = c.tag === 'GER' ? 1.8 : 0.8;
      else if (fam === 'landing') w = c.tag === 'USA' || c.tag === 'ENG' || c.tag === 'JAP' ? 1.3 : 0.2;
      else w = NAVAL[c.tag] ? 1.1 : 0.5;
      break;
    }
    case 'doc': {
      const pre = id.slice(0, 2);
      if (['mw', 'sf', 'gb', 'ma'].includes(pre)) {
        const mine = DOCTRINE[c.tag] || ['gb', 'sf', 'ma', 'gb'][hash(c.tag) % 4];
        w = pre === mine ? 2 : 0;
      } else if (pre === 'ad') w = major ? 1.1 : 0.4;
      else w = NAVAL[c.tag] ? 1 : 0.2;
      break;
    }
    default:
  }
  const ahead = t.year - year;
  if (ahead > 0.4) w *= 0.12; else if (ahead < 0) w *= 1 + Math.min(1.5, -ahead * 0.3);
  return w;
}
export function aiResearch(G, c) {
  const year = yearOf(G.day);
  for (let s = 0; s < c.rs; s++) {
    if (c.research[s]) continue;
    let best = null, bs = 0;
    for (const t of TECH_LIST) {
      if (!canResearch(c, t.id)) continue;
      const w = techWeight(G, c, t, year) * (0.8 + 0.4 * rnd(G));
      if (w > bs) { bs = w; best = t.id; }
    }
    if (best) startResearch(G, c, best, s);
  }
}

// ---- construction --------------------------------------------------------------------------------
function bestBuildRegion(G, c, type) {
  const front = frontFlags(G);
  let best = -1, bs = -1e9;
  for (let i = 0; i < NREG; i++) {
    const r = G.reg[i];
    if (r.c !== c.tag || r.o !== c.tag) continue;
    if (buildBlocker(G, c, type, i)) continue;
    let s = r.infra * 2 + (r.core === c.tag ? 6 : 0) - (front[i] ? 8 : 0) + r.pop / 4000;
    if (type === 'infra') s = (r.civ + r.mil) * 3 - r.infra * 2 + (r.core === c.tag ? 3 : 0);
    if (type === 'air') s = (front[i] ? 6 : 0) + r.vp * 0.3 - r.air * 3;
    if (type === 'aa') s = (r.civ + r.mil) * 2 - r.aa * 3;
    if (type === 'fort') s = (front[i] ? 10 : 0) + r.vp - r.fort * 2;
    if (type === 'dock') s += r.port * 2;
    if (s > bs) { bs = s; best = i; }
  }
  return best;
}
export function aiConstruction(G, c) {
  const civs = availableCivs(c);
  const limit = Math.max(1, Math.min(6, Math.ceil(civs / 15)));
  let guard = 0;
  while (c.build.length < limit && guard++ < 6) {
    const year = yearOf(G.day);
    const war = isAtWar(G, c.tag);
    const n = (c.ai.bn = (c.ai.bn || 0) + 1);
    let type;
    const civUntil = CIV_UNTIL[c.tag] ?? (c.ideo === 'dem' ? 1938.8 : 1938.2);
    if (!war && year < civUntil && G.tension < 60) type = 'civ'; else type = 'mil';
    if (n % 6 === 0 && (NAVAL[c.tag] || c._dock >= 3) && c._dock < (COUNTRIES[c.tag].major ? 40 : 8)) type = 'dock';
    else if (n % 7 === 3) type = 'infra';
    else if (n % 9 === 5 && c.unlocked.syn && c._short && (c._short.oil > 0.25 || c._short.rub > 0.25)) type = 'syn';
    else if (war && n % 8 === 4) type = c._bombed > 0.15 && c.unlocked.aa ? 'aa' : 'air';
    let r = bestBuildRegion(G, c, type);
    if (r < 0 && type !== 'mil' && type !== 'civ') { type = war || year >= civUntil ? 'mil' : 'civ'; r = bestBuildRegion(G, c, type); }
    if (r < 0 && (type === 'mil' || type === 'civ')) { type = 'infra'; r = bestBuildRegion(G, c, type); }
    if (r < 0) break;
    if (queueBuild(G, c, type, r)) break;
  }
}

// ---- production ----------------------------------------------------------------------------------
export function aiProduction(G, c) {
  const M = c._mil;
  if (M <= 0) return;
  if (c._needDirty) recalcNeeds(G, c);
  const major = !!COUNTRIES[c.tag].major;
  const base = { rifle: 1, art: 0.55, sup: 0.3 };
  if (c.eqTier.at) base.at = 0.08;
  if (c.eqTier.aa) base.aa = 0.06;
  if (c.eqTier.truck) base.truck = major ? 0.3 : 0.08;
  if (c.eqTier.ltank && !c.eqTier.mtank) base.ltank = major ? 0.45 : 0.08;
  if (c.eqTier.mtank) base.mtank = major ? 0.7 : 0.15;
  if (c.eqTier.htank && major) base.htank = c.tag === 'SOV' || c.tag === 'GER' ? 0.25 : 0.1;
  if (c.eqTier.fighter) base.fighter = major ? 0.8 : 0.3;
  if (c.eqTier.cas && major) base.cas = 0.3;
  if (c.eqTier.tac && major) base.tac = 0.25;
  if (c.eqTier.strat && (c.tag === 'ENG' || c.tag === 'USA')) base.strat = 0.3;
  if (c.eqTier.nav && NAVAL[c.tag]) base.nav = 0.15;
  const w = {};
  let tot = 0, landTot = 0, airTot = 0;
  for (const k in base) {
    let v = base[k] * M * 0.05;
    if (EQ[k].kind === 'land') {
      const def = Math.max(0, (c.need[k] || 0) * 1.12 - (c.fielded[k] || 0) - (c.stock[k] || 0));
      v += (def * EQ[k].cost) / 400;
      // plenty in stock already -> slow down
      if ((c.stock[k] || 0) > (c.need[k] || 0) * 0.6 + 300) v *= 0.35;
      landTot += v;
    } else airTot += v;
    w[k] = v;
  }
  // the air force keeps a fixed share of industry whatever the army is short of
  const airShare = airTot > 0 ? (major ? 0.24 : 0.1) : 0;
  for (const k in w) {
    if (EQ[k].kind === 'land') w[k] = landTot > 0 ? (w[k] / landTot) * (1 - airShare) : 0;
    else w[k] = (w[k] / airTot) * airShare;
    tot += w[k];
  }
  const target = {};
  let assigned = 0;
  const keys = Object.keys(w).sort((a, b) => w[b] - w[a]);
  for (const k of keys) {
    let n = Math.round((M * w[k]) / tot);
    if (n === 0 && w[k] / tot > 0.04 && M >= 6) n = 1;
    n = Math.min(n, M - assigned);
    target[k] = n; assigned += n;
  }
  if (assigned < M) target[keys[0]] += M - assigned;
  // move towards the target a few factories at a time (retooling wastes efficiency)
  const step = Math.max(1, Math.round(M * 0.12));
  for (const l of c.lines) {
    const t = target[l.eq] || 0;
    if (l.fac > t) setLineFac(c, l, Math.max(t, l.fac - step));
  }
  c.lines = c.lines.filter((l) => l.fac > 0);
  for (const k of keys) {
    const t = target[k];
    if (!t) continue;
    const l = c.lines.find((x) => x.eq === k);
    const cur = l ? l.fac : 0;
    const add = Math.min(t - cur, freeMil(c));
    if (add > 0) addLine(c, k, add);
  }
  if (freeMil(c) > 0 && c.lines.length) setLineFac(c, c.lines[0], c.lines[0].fac + freeMil(c));
  aiDocks(G, c);
}
function aiDocks(G, c) {
  const D = c._dock;
  if (D <= 0) return;
  c.docks = c.docks.filter((l) => l.fac > 0);
  if (freeDock(c) <= 0) return;
  const major = !!COUNTRIES[c.tag].major;
  const war = isAtWar(G, c.tag);
  const plan = [];
  if (c.convoys < Math.max(30, (c._convoyNeed || 0) * 1.6)) plan.push(['convoy', Math.max(1, Math.round(D * 0.2))]);
  if (c.shipTier.dd) plan.push(['dd', Math.max(1, Math.round(D * 0.25))]);
  if (c.shipTier.ss && (c.tag === 'GER' || c.tag === 'ITA' || c.tag === 'SOV' || (major && war))) plan.push(['ss', Math.max(1, Math.round(D * (c.tag === 'GER' ? 0.45 : 0.15)))]);
  if (major && c.shipTier.cl) plan.push(['cl', Math.min(5, Math.max(1, Math.round(D * 0.15)))]);
  if (major && D >= 10) {
    const cv = (c.tag === 'JAP' || c.tag === 'USA' || c.tag === 'ENG') && c.shipTier.cv;
    plan.push([cv ? 'cv' : 'bb', 5]);
    if (D >= 22 && c.shipTier.bb) plan.push(['bb', 5]);
  }
  for (const [ship, n] of plan) {
    if (freeDock(c) <= 0) break;
    if (c.docks.some((l) => l.ship === ship)) continue;
    addDockLine(c, ship, n);
  }
  // leftover docks strengthen existing lines
  for (const l of c.docks) {
    const f = freeDock(c);
    if (f <= 0) break;
    const add = Math.min(f, SHIP[l.ship].maxDock - l.fac);
    if (add > 0) l.fac += add;
  }
}

// ---- army ----------------------------------------------------------------------------------------
export function aiTemplates(G, c) {
  const year = yearOf(G.day);
  const major = !!COUNTRIES[c.tag].major;
  let changed = false;
  const inf = c.tpl.inf;
  if (inf) {
    const want = major ? (year >= 1942.2 ? { inf: 9, art: 3 } : { inf: 7, art: 2 }) : COUNTRIES[c.tag].dev >= 3 || year >= 1940.5 ? { inf: 7, art: 2 } : { inf: 6, art: 1 };
    if ((inf.bats.inf || 0) < want.inf) { inf.bats = want; changed = true; }
    const sup = ['eng', 'sart', 'rec', 'log'].filter((s) => c.unlocked[s]).slice(0, major ? 3 : 2);
    if (sup.length > inf.sup.length) { inf.sup = sup; changed = true; }
  }
  if (c.unlocked.mtank && !c.tpl.mtk && major) { c.tpl.mtk = { name: 'Танковая дивизия', bats: { mtank: 4, mot: 4 }, sup: ['eng', 'rec'].filter((s) => c.unlocked[s]), icon: 'arm' }; changed = true; }
  if (c.unlocked.mot && !c.tpl.mot && major) { c.tpl.mot = { name: 'Моторизованная дивизия', bats: { mot: 6, art: 1 }, sup: [], icon: 'mot' }; changed = true; }
  if (c.unlocked.ltank && !c.tpl.ltk && major) { c.tpl.ltk = { name: 'Лёгкая танковая дивизия', bats: { ltank: 3, mot: 2 }, sup: [], icon: 'arm' }; changed = true; }
  if (changed) { for (const k in c.tpl) calcTemplate(c, c.tpl[k]); recalcNeeds(G, c); }
}
function canEquip(c, tpl, slack, pending) {
  const s = tpl._s;
  for (const e in s.need) {
    const gap = Math.max(0, (c.need[e] || 0) - (c.fielded[e] || 0));
    if ((c.stock[e] || 0) - gap - (pending[e] || 0) < s.need[e] * slack) return false;
  }
  return true;
}
export function aiRecruit(G, c) {
  const war = isAtWar(G, c.tag);
  const n = divsOf(G, c.tag).length + c.train.length;
  const base0 = c.ai.base ?? 6;
  const dem = c.ideo === 'dem';
  const cap = war ? base0 * (dem ? 1.1 : 1.3) + c._mil * (dem ? 0.7 : 1.8) + (dem ? 1 : 3) : base0 * (dem ? 1.05 : 1.15) + c._mil * (dem ? 0.3 : 0.8);
  if (n >= cap) return;
  const parallel = 2 + Math.floor(c._mil / 6) + (war ? 3 : 0);
  // equipment already promised to divisions in training
  const pending = {};
  for (const t of c.train) { const s = c.tpl[t.tpl] && c.tpl[t.tpl]._s; if (s) for (const e in s.need) pending[e] = (pending[e] || 0) + s.need[e]; }
  let guard = 0;
  while (c.train.length < parallel && guard++ < 6) {
    const opts = [];
    if (c.tpl.mtk && canEquip(c, c.tpl.mtk, 1, pending)) opts.push('mtk');
    else if (c.tpl.ltk && !c.tpl.mtk && canEquip(c, c.tpl.ltk, 1, pending)) opts.push('ltk');
    if (c.tpl.mot && canEquip(c, c.tpl.mot, 1, pending) && rnd(G) < 0.3) opts.push('mot');
    if (!opts.length && c.tpl.inf && canEquip(c, c.tpl.inf, war ? 0.6 : 0.9, pending)) opts.push('inf');
    if (!opts.length && war && c.tpl.mil && tplFill(c, c.tpl.mil) > 0.5 && c._lostRatio > 0.15 && canEquip(c, c.tpl.mil, 0.3, pending)) opts.push('mil');
    if (!opts.length) break;
    const key = opts[0];
    if (c.mp < (c.tpl[key]._s.mp / 1000) * (war ? 1.2 : 3)) break;
    if (queueTraining(G, c, key, -1)) break;
    const s = c.tpl[key]._s;
    for (const e in s.need) pending[e] = (pending[e] || 0) + s.need[e];
  }
}

// ---- politics ------------------------------------------------------------------------------------
export function aiPolitics(G, c) {
  if (c.pp < 150) return;
  const war = isAtWar(G, c.tag);
  if (c.laws.eco < LAWS.eco.list.length - 1 && !lawBlocker(G, c, 'eco', c.laws.eco + 1)) { c.pp -= 150; setLaw(G, c, 'eco', c.laws.eco + 1); return; }
  const low = c.mp < maxManpower(c) * 0.12 || (war && c.mp < 150);
  if ((war || low) && c.laws.con < (war && low ? 5 : 3) && !lawBlocker(G, c, 'con', c.laws.con + 1)) { c.pp -= 150; setLaw(G, c, 'con', c.laws.con + 1); return; }
  if (c.adv.length < MAX_ADVISORS) {
    const order = war ? ['ind_mil', 'gen_org', 'prop', 'ind_out', 'sci', 'gen_def'] : ['ind_civ', 'sci', 'ind_mil', 'ind_out', 'sec', 'dip'];
    const pick = order.find((a) => !c.adv.includes(a));
    if (pick && ADVISORS[pick]) { c.pp -= 150; c.adv.push(pick); recalcMods(G, c); return; }
  }
  if (war && c.laws.trd < 2) { c.pp -= 150; setLaw(G, c, 'trd', c.laws.trd + 1); }
}

// ---- air & navy ----------------------------------------------------------------------------------
function frontRegions(G, tag) {
  const out = [];
  const front = frontFlags(G);
  for (let i = 0; i < NREG; i++) if (front[i] && (G.reg[i].c === tag || friendly(G, tag, G.reg[i].c))) out.push(i);
  return out;
}
export function aiAir(G, c) {
  const war = isAtWar(G, c.tag);
  const fr = war ? frontRegions(G, c.tag) : [];
  autoWings(G, c, fr);
  if (!war) return;
  const fields = airfields(G, c.tag);
  // strategic targets: any enemy industry
  for (const w of G.wings) {
    if (w.o !== c.tag) continue;
    const range = planeRange(c, w.t);
    if (w.t === 'tac') {
      w.mis = fr.some((f) => distKm(w.base, f) <= range) ? 'cas' : 'bomb';
    }
    if (w.mis === 'bomb' || w.mis === 'nav') continue;
    if (!fr.length) continue;
    if (fr.some((f) => distKm(w.base, f) <= range * 0.8)) continue;
    // rebase closer to the fighting
    let best = -1, bs = 1e9;
    for (const i of fields) {
      if (i === w.base || baseFree(G, i) < w.n) continue;
      let d = 1e9;
      for (const f of fr) d = Math.min(d, distKm(i, f));
      if (d < bs) { bs = d; best = i; }
    }
    if (best >= 0 && bs < range) w.base = best;
  }
  if (c.nukes > 0) {
    let best = -1, bs = 0;
    for (let i = 0; i < NREG; i++) {
      const r = G.reg[i];
      if (!atWar(G, c.tag, r.c) || nukeBlocker(G, c, i)) continue;
      const v = r.civ + r.mil * 1.5 + r.vp;
      if (v > bs) { bs = v; best = i; }
    }
    if (best >= 0) nukeStrike(G, c, best);
  }
}
export function aiNavy(G, c) {
  const fleets = G.fleets.filter((f) => f.o === c.tag);
  if (!fleets.length) return;
  // submarines get their own flotillas
  if (!c.ai.navInit) {
    c.ai.navInit = 1;
    for (const f of fleets) {
      if (f.ships.ss > 0 && fleetSize(f) > f.ships.ss) {
        const sub = createFleet(G, c, { ss: f.ships.ss }, f.port, 'Подводные силы');
        sub.subs = 1; f.ships.ss = 0;
      }
    }
  }
  // fold reserve ships into the fleets in port
  const res = fleets.find((f) => f.reserve && fleetSize(f) >= 3);
  if (res) {
    const host = G.fleets.find((f) => f.o === c.tag && !f.reserve && f.zone === -1 && !f.subs);
    if (host) { const ss = res.ships.ss; res.ships.ss = 0; mergeFleets(G, host, res); if (ss) { const s = G.fleets.find((f) => f.o === c.tag && f.subs); if (s) s.ships.ss += ss; else createFleet(G, c, { ss }, host.port, 'Подводные силы').subs = 1; } }
  }
  const en = enemies(G, c.tag).filter((e) => G.ctr[e].alive);
  const mine = G.fleets.filter((f) => f.o === c.tag && !f.reserve);
  if (!en.length) { for (const f of mine) if (f.mis !== 'port') setFleetMission(G, f, 'port'); return; }
  const hz = homeZone(G, c);
  if (hz < 0) return;
  // enemy shipping lanes and fleets
  const laneScore = new Float32Array(SEA.length);
  const foePow = new Float32Array(SEA.length);
  for (const e of en) { const ec = G.ctr[e]; if (ec._lanes) for (const z in ec._lanes) laneScore[z] += Math.min(60, ec.convoys) * 0.05 + 1; }
  for (const f of G.fleets) if (f.zone >= 0 && atWar(G, c.tag, f.o)) foePow[f.zone] += fleetPower(G, f).surf;
  let k = 0;
  for (const f of mine) {
    if (f.rep > 0 || fleetSize(f) === 0) continue;
    const P = fleetPower(G, f);
    if (f.subs || (P.surf === 0 && P.sub > 0)) {
      let best = -1, bs = 0;
      for (let z = 0; z < SEA.length; z++) { const s = laneScore[z] - foePow[z] * 0.01 + ((z * 7 + f.id) % 5) * 0.1; if (laneScore[z] > 0 && s > bs) { bs = s; best = z; } }
      if (best >= 0) { if (f.tgt !== best || f.mis !== 'raid') setFleetMission(G, f, 'raid', best); } else if (f.mis !== 'port') setFleetMission(G, f, 'port');
      continue;
    }
    // surface fleets: first keeps home waters, others escort lanes or seek battle / support landings
    let zone = hz, mis = 'patrol';
    if (k > 0) {
      const inv = G.invasions.find((t) => t.o === c.tag && t.kind === 'inv');
      if (inv) zone = inv.path[inv.path.length - 1];
      else {
        let best = -1, bs = -1e9;
        for (const z of [hz, ...SEA[hz].adj, ...Object.keys(c._lanes || {}).map(Number)]) {
          const s = (foePow[z] > 0 && foePow[z] < P.surf * 1.2 ? 5 : 0) + (c._lanes && c._lanes[z] ? 2 : 0) - foePow[z] / Math.max(1, P.surf) * 3 + ((z + f.id) % 4) * 0.3;
          if (s > bs) { bs = s; best = z; }
        }
        if (best >= 0) zone = best;
        if (c._raided > 1 && k % 2 === 0) mis = 'escort';
      }
    } else if (c.ai.invZone !== undefined && c.ai.invZone >= 0) zone = c.ai.invZone;
    if (f.tgt !== zone || f.mis !== mis) setFleetMission(G, f, mis, zone);
    k++;
  }
  c._raided = 0;
}

// ---- diplomacy -----------------------------------------------------------------------------------
export function aiDiplomacy(G, c) {
  // a country at war joins the alliance that already fights its enemy
  if (c.over || !isAtWar(G, c.tag)) return;
  const myFac = c.fac && G.factions[c.fac];
  if (myFac && (myFac.leader === c.tag ? myFac.members.length > 1 : true)) return;
  let best = null, bs = 0;
  for (const id in G.factions) {
    const f = G.factions[id];
    const L = G.ctr[f.leader];
    if (!L || !L.alive || L.capit || f.leader === c.tag || !COUNTRIES[f.leader].major) continue;
    let common = 0;
    for (const e of enemies(G, c.tag)) if (G.ctr[e].alive && atWar(G, f.leader, e)) common++;
    if (!common) continue;
    if (enemies(G, c.tag).some((e) => G.ctr[e].fac === id)) continue;
    let s = common * 2;
    if (L.ideo === c.ideo) s += 2;
    if ((L.ideo === 'com' && c.ideo === 'fas') || (L.ideo === 'fas' && c.ideo === 'com')) s -= 10;
    if (COUNTRIES[c.tag].major && L.ideo !== c.ideo) s -= 3;
    if (s > bs) { bs = s; best = id; }
  }
  if (best) { if (myFac) return; joinFaction(G, c.tag, best); }
}

// ---- entry points --------------------------------------------------------------------------------
/** AI turn for one country; `day` staggering keeps the per-day cost flat */
export function aiCountry(G, c) {
  const h = hash(c.tag);
  const isPlayer = c.tag === G.player;
  const auto = isPlayer ? c.auto || {} : null;
  const on = (k) => !isPlayer || auto[k];
  const phase = (G.day + h) % 7;
  if (phase === 0) { if (on('research')) aiResearch(G, c); if (on('build')) aiConstruction(G, c); }
  if (phase === 2 && on('prod')) aiProduction(G, c);
  if (phase === 3) { if (on('recruit')) { if ((G.day + h) % 91 === 3 || !c.ai.tplInit) { c.ai.tplInit = 1; aiTemplates(G, c); } aiRecruit(G, c); } if (!isPlayer) aiPolitics(G, c); }
  if (phase === 4) { if (on('air')) aiAir(G, c); if (on('navy')) aiNavy(G, c); }
  if (phase === 5 && !isPlayer) { aiDiplomacy(G, c); }
  if (!isPlayer && phase === 1) aiStances(G, c);
  if ((G.day + h) % 2 === 0 && (!isPlayer || c.staff.auto)) staffPlan(G, c, { sea: !isPlayer });
}
export { TECHS, PLANE, BUILD, LAND_EQ, SHIP_KEYS, REG, usedSlots, regionSlots, mod, clamp, sameSide };
