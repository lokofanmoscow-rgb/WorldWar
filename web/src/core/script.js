// Scripting helpers shared by national focuses and events.
import { REG, NREG, regionAtLonLat } from './world.js';
import { dayOf, clamp } from './util.js';
import { addSpirit, removeSpirit, recalcMods, refreshTech } from './mods.js';
import { declareWar, warBlocker, news, cn, joinFaction, createFaction, changeOpinion, addTension, frontFlags, atWar } from './diplo.js';
import { spawnDivision, recalcTemplates } from './land.js';
import { regionSlots, usedSlots } from './economy.js';

export const D = (y, m, d = 1) => dayOf(y, m, d);

/** registry of interactive events: key -> { title, text, opts:[{text, eff}], ai(G,e) -> option index } */
export const EVENTS = {};
export function defEvent(key, def) { EVENTS[key] = def; }
const val = (v, G, e) => (typeof v === 'function' ? v(G, e) : v);
export const evTitle = (G, e) => val(EVENTS[e.key].title, G, e);
export const evText = (G, e) => val(EVENTS[e.key].text, G, e);
export const evOpts = (G, e) => EVENTS[e.key].opts.filter((o) => !o.cond || o.cond(G, e));

/** deliver an event: the player gets a pop-up, the AI answers at once */
export function fireEvent(G, key, to, data = {}) {
  const ev = EVENTS[key];
  const e = { type: 'ev', key, to, ...data };
  const c = G.ctr[to];
  if (!c || !c.alive) return;
  if (to === G.player) { G.evq.push(e); return; }
  const opts = evOpts(G, e);
  const i = ev.ai ? clamp(ev.ai(G, e), 0, opts.length - 1) : 0;
  opts[i].eff(G, e);
}
export function chooseEvent(G, e, i) {
  const opts = evOpts(G, e);
  if (opts[i]) opts[i].eff(G, e);
}
/** purely informational pop-up for the player */
export function inform(G, title, text) {
  if (G.player) G.evq.push({ type: 'info', title, text });
}

// ---- effects ---------------------------------------------------------------------------------------
/** instantly add factories in the best own regions (opens building slots when needed) */
export function addFactories(G, c, type, n, near) {
  const front = frontFlags(G);
  for (let k = 0; k < n; k++) {
    let best = -1, bs = -1e9;
    for (let i = 0; i < NREG; i++) {
      const r = G.reg[i];
      if (r.o !== c.tag || r.c !== c.tag) continue;
      if (type === 'dock' && !REG[i].seas.length) continue;
      let s = r.infra * 2 + (r.core === c.tag ? 8 : 0) - (front[i] ? 6 : 0) - r[type] * 0.8 + (regionSlots(c, r) - usedSlots(r)) * 0.5;
      if (near) { const t = regionAtLonLat(near[0], near[1]); s -= Math.hypot(REG[i].c[0] - REG[t].c[0], REG[i].c[1] - REG[t].c[1]) / 60; }
      if (s > bs) { bs = s; best = i; }
    }
    if (best < 0) return;
    const r = G.reg[best];
    if (usedSlots(r) >= regionSlots(c, r)) r.slots += 1;
    r[type] += 1;
  }
}
export function addBuilding(G, c, type, lvl, lonlat) {
  const i = regionAtLonLat(lonlat[0], lonlat[1]);
  const r = G.reg[i];
  if (r.o === c.tag) r[type] = Math.min(type === 'port' ? 3 : 5, Math.max(r[type], lvl));
}
export function spirit(G, c, id, name, mods, desc, until) {
  addSpirit(G, c, { id, name, mods, desc, until: until || 0 });
}
export { removeSpirit };
export function rbonus(c, cat, pct, n = 2) { c.rbonus.push({ cat, pct, n }); }
export function grantTech(G, c, id) { c.tech[id] = 1; refreshTech(c); recalcMods(G, c); recalcTemplates(c); }
export function addEq(c, type, n) { c.stock[type] = (c.stock[type] || 0) + n; }
export function addDivs(G, c, tplKey, n, lonlat) {
  if (!c.tpl[tplKey]) tplKey = 'inf';
  let r = lonlat ? regionAtLonLat(lonlat[0], lonlat[1]) : c.cap;
  if (r < 0 || G.reg[r].c !== c.tag) r = c.cap;
  if (r < 0 || G.reg[r].c !== c.tag) return;
  const s = c.tpl[tplKey]._s;
  for (let k = 0; k < n; k++) spawnDivision(G, c, tplKey, r, { org: 0.6 });
  for (const e in s.need) c.stock[e] = (c.stock[e] || 0) + s.need[e] * n;
}
export function bump(c, key, v) { c[key] = clamp(c[key] + v, 0, key === 'pp' ? 2000 : 1); }
export function giveWargoal(G, a, b, days = 730) { G.wargoals[a + '>' + b] = G.day + days; }
/** scripted war: the AI attacks at once, a human player receives a war goal instead */
export function scriptedWar(G, a, b) {
  const A = G.ctr[a], B = G.ctr[b];
  if (!A.alive || !B || !B.alive || atWar(G, a, b)) return;
  if (a === G.player) { giveWargoal(G, a, b); news(G, `Получена цель войны: ${cn(G, b)}`, 'diplo'); return; }
  if (warBlocker(G, a, b, true)) return;
  declareWar(G, a, b, { callAll: true });
}
/** invite into a faction: AI decides by `ok`, the player is asked */
export function invite(G, tag, facId, ok = true) {
  const c = G.ctr[tag], f = G.factions[facId];
  if (!c || !c.alive || !f || c.fac === facId) return;
  if (tag === G.player) { G.evq.push({ type: 'ev', key: 'invite', to: tag, fac: facId }); return; }
  if (ok) joinFaction(G, tag, facId);
}
export function ensureAxis(G) {
  if (!G.factions.axis) createFaction(G, 'GER', 'Ось', 'axis');
  return 'axis';
}
export { changeOpinion, addTension, news, cn, joinFaction, createFaction, dayOf };
