// Country modifiers: aggregated from laws, advisors, national spirits and technologies.
import { TECHS } from '../data/techs.js';
import { LAWS, ADVISORS } from '../data/laws.js';
import { SUPC } from '../data/equip.js';

export function refreshTech(c) {
  c.eqTier = {}; c.shipTier = {}; c.unlocked = { inf: 1, mil: 1, cav: 1 };
  for (const id of Object.keys(c.tech)) {
    const t = TECHS[id];
    if (!t) continue;
    if (t.eq) c.eqTier[t.eq[0]] = Math.max(c.eqTier[t.eq[0]] || 0, t.eq[1]);
    if (t.ship) c.shipTier[t.ship[0]] = Math.max(c.shipTier[t.ship[0]] || 0, t.ship[1]);
    if (t.unlockBat) c.unlocked[t.unlockBat] = 1;
    if (t.unlockSup) c.unlocked[t.unlockSup] = 1;
    if (t.unlock) c.unlocked[t.unlock] = 1;
  }
  if (c.tech.art1) { c.unlocked.art = 1; c.unlocked.sart = 1; }
  if (c.tech.aa1) c.unlocked.saa = 1;
  for (const k of Object.keys(SUPC)) if (c.tech[SUPC[k].tech]) c.unlocked[k] = 1;
}

function addMods(m, src, k = 1) {
  if (!src) return;
  for (const key in src) m[key] = (m[key] || 0) + src[key] * k;
}

/** recompute cached modifier table c._m */
export function recalcMods(G, c) {
  const m = {};
  addMods(m, LAWS.eco.list[c.laws.eco].mods);
  addMods(m, LAWS.con.list[c.laws.con].mods);
  addMods(m, LAWS.trd.list[c.laws.trd].mods);
  for (const a of c.adv) addMods(m, ADVISORS[a] && ADVISORS[a].mods);
  for (const s of c.spirits) addMods(m, s.mods);
  for (const id in c.tech) { const t = TECHS[id]; if (t && t.mod) addMods(m, t.mod); }
  // stability / war support effects
  m.factoryOutput = (m.factoryOutput || 0) + (c.stab - 0.5) * 0.3;
  m.ppGain = (m.ppGain || 0) + (c.stab - 0.5) * 0.3;
  m.landAttack = (m.landAttack || 0) + (c.ws - 0.5) * 0.1;
  m.landDefense = (m.landDefense || 0) + (c.ws - 0.5) * 0.1;
  // difficulty
  if (G.player) {
    const isPlayer = c.tag === G.player;
    if (G.diff === 'easy' && isPlayer) { m.factoryOutput += 0.2; m.landAttack += 0.15; m.landDefense += 0.15; m.researchSpeed = (m.researchSpeed || 0) + 0.15; }
    if (G.diff === 'hard' && !isPlayer) { m.factoryOutput += 0.2; m.landAttack += 0.12; m.landDefense += 0.12; m.researchSpeed = (m.researchSpeed || 0) + 0.1; }
  }
  c._consumer = Math.max(0.05, LAWS.eco.list[c.laws.eco].consumer + (m.consumer || 0));
  c._recruit = Math.max(0.005, LAWS.con.list[c.laws.con].mp + (m.recruitable || 0));
  c._export = LAWS.trd.list[c.laws.trd].exp;
  c._m = m;
  return m;
}

/** modifier accessor */
export const mod = (c, key) => (c._m && c._m[key]) || 0;

export function addSpirit(G, c, spirit) {
  c.spirits = c.spirits.filter((s) => s.id !== spirit.id);
  c.spirits.push(spirit);
  recalcMods(G, c);
}
export function removeSpirit(G, c, id) {
  const n = c.spirits.length;
  c.spirits = c.spirits.filter((s) => s.id !== id);
  if (c.spirits.length !== n) recalcMods(G, c);
}
export const hasSpirit = (c, id) => c.spirits.some((s) => s.id === id);
