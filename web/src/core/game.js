// Game loop: start a scenario and advance the world one day at a time.
import { newGame, serialize, deserialize as loadState, VERSION } from './state.js';
import { recount, economyTick, weeklyTick, tradeTick } from './economy.js';
import { landTick, reinforceTick, trainTick, buildIndex, divsOf } from './land.js';
import { supplyTick } from './supply.js';
import { airTick } from './air.js';
import { navyTick, lanesTick, fleetSize } from './navy.js';
import { diploTick, checkCapitulations, geoCache, frontFlags, vpLost, isAtWar } from './diplo.js';
import { focusTick, aiFocus } from './focus.js';
import { eventsTick } from '../data/events.js';
import { aiCountry, aiProduction, aiResearch, aiTemplates } from './ai.js';
import { spirit } from './script.js';
import { recalcMods } from './mods.js';
import { PLANE } from '../data/equip.js';

export { serialize, VERSION };

/** restore a saved game and rebuild every derived cache */
export function deserialize(str) {
  const G = loadState(str);
  recount(G);
  buildIndex(G);
  tradeTick(G);
  for (const c of Object.values(G.ctr)) {
    if (!c.alive || c.capit) continue;
    c._vpLostCache = isAtWar(G, c.tag) ? vpLost(G, c.tag).ratio : 0;
    fuelTick(G, c);
    lanesTick(G, c);
    weeklyTick(G, c);
  }
  supplyTick(G);
  return G;
}

/** create a new world and prepare it for the first day */
export function startGame(playerTag, opts = {}) {
  const G = newGame(playerTag, opts);
  const U = G.ctr.USA;
  spirit(G, U, 'isolation', 'Изоляционизм', { warSupport: -0.2, mpFactor: -0.3 }, 'США не желают ввязываться в чужие войны');
  spirit(G, U, 'depression', 'Великая депрессия', { factoryOutput: -0.15, consumer: 0.1 }, 'Экономика ещё не оправилась от кризиса');
  U.flags.isolation = true;
  spirit(G, G.ctr.FRA, 'disunity', 'Политический раскол', { stability: -0.1, warSupport: -0.1, surrender: -0.3 }, 'Третья республика расколота');
  spirit(G, G.ctr.FRA, 'oldguard', 'Армия прошлой войны', { orgBonus: -0.12, landAttack: -0.1, landDefense: -0.05 }, 'Командование готовится к позиционной войне. Снимается реформой бронетанковых войск.');
  spirit(G, G.ctr.CHI, 'warlords', 'Разобщённость', { factoryOutput: -0.1, orgBonus: -0.1 }, 'Страна раздроблена между милитаристами');
  recount(G);
  buildIndex(G);
  for (const c of Object.values(G.ctr)) {
    if (!c.alive) continue;
    recalcMods(G, c);
    c.pp = c.tag === playerTag ? 100 : 60;
    c.ai.base = divsOf(G, c.tag).length;
    aiTemplates(G, c);
    aiProduction(G, c);
    for (const l of c.lines) l.eff = 0.3;
    if (c.tag !== playerTag) aiResearch(G, c);
    weeklyTick(G, c);
  }
  if (playerTag) {
    const p = G.ctr[playerTag];
    p.auto = { research: false, build: false, prod: false, recruit: false, air: true, navy: true };
  }
  tradeTick(G);
  supplyTick(G);
  return G;
}

function fuelTick(G, c) {
  let fuel = 0;
  for (const d of divsOf(G, c.tag)) fuel += c.tpl[d.t]._s.hard > 0.3 ? 0.35 : c.tpl[d.t]._s.spd > 8 ? 0.15 : 0;
  for (const w of G.wings) if (w.o === c.tag) fuel += (w.n / 100) * (PLANE[w.t].bomb >= 1 ? 2 : 1.2);
  for (const f of G.fleets) if (f.o === c.tag && f.zone !== -1) fuel += fleetSize(f) * 0.06;
  c._fuel = isAtWar(G, c.tag) ? fuel : fuel * 0.4;
}

/** advance the simulation by one day */
export function tick(G) {
  G.day++;
  recount(G);
  geoCache(G);
  frontFlags(G);
  const list = Object.values(G.ctr);
  const weekly = G.day % 7 === 0;
  for (const c of list) {
    if (!c.alive) continue;
    if (c.capit) { c.pp = Math.min(c.pp, 50); continue; }
    economyTick(G, c);
    trainTick(G, c);
    focusTick(G, c);
  }
  landTick(G);
  if (G.day % 2 === 0 || G._supDirty) { supplyTick(G); G._supDirty = false; }
  airTick(G);
  navyTick(G);
  checkCapitulations(G);
  diploTick(G);
  eventsTick(G);
  if (weekly) {
    tradeTick(G);
    for (const c of list) {
      if (!c.alive || c.capit) continue;
      c._vpLostCache = isAtWar(G, c.tag) ? vpLost(G, c.tag).ratio : 0;
      fuelTick(G, c);
      lanesTick(G, c);
      weeklyTick(G, c);
      reinforceTick(G, c);
    }
  }
  for (const c of list) {
    if (!c.alive || c.capit) continue;
    if (c.tag !== G.player) aiFocus(G, c);
    aiCountry(G, c);
  }
  if (!G._byReg) buildIndex(G);
}
