// Diplomacy and war state: hostility, factions, occupation, capitulation, peace.
import { REG, NREG } from './world.js';
import { COUNTRIES } from '../data/countries.js';
import { clamp, pairKey, fmtDate } from './util.js';
import { mod, recalcMods } from './mods.js';
import { divsOf, divsIn, removeDivision, spawnDivision, buildIndex, calcTemplate } from './land.js';

export const hooks = { capitulate: [], war: [], peace: [], capture: [] };

export function news(G, text, kind = 'info', region = -1) {
  G.news.push({ d: G.day, t: text, k: kind, r: region });
  if (G.news.length > 160) G.news.splice(0, G.news.length - 160);
  G._newsSeq = (G._newsSeq || 0) + 1;
}
export const cn = (G, tag) => (G.ctr[tag] && G.ctr[tag].name) || COUNTRIES[tag].n;

// ---- hostility ---------------------------------------------------------------------------------
export const atWar = (G, a, b) => a !== b && G.war[a < b ? a + '|' + b : b + '|' + a] !== undefined;

export function enemies(G, tag) {
  if (!G._en) {
    const en = {};
    for (const key in G.war) {
      const [a, b] = key.split('|');
      (en[a] || (en[a] = [])).push(b);
      (en[b] || (en[b] = [])).push(a);
    }
    G._en = en;
  }
  return G._en[tag] || [];
}
export const isAtWar = (G, tag) => enemies(G, tag).some((e) => G.ctr[e].alive);
/** enemies still able to fight */
export const activeEnemies = (G, tag) => enemies(G, tag).filter((e) => G.ctr[e].alive && !G.ctr[e].capit);

export function friendly(G, a, b) {
  if (a === b) return true;
  const ca = G.ctr[a], cb = G.ctr[b];
  if (!ca || !cb) return false;
  if (ca.fac && ca.fac === cb.fac) return true;
  if (ca.over === b || cb.over === a) return true;
  if (ca.over && ca.over === cb.over) return true;
  if (G.pacts.access[a + '>' + b]) return true;
  return false;
}
export function canEnter(G, tag, r) {
  const ctl = G.reg[r].c;
  return ctl === tag || atWar(G, tag, ctl) || friendly(G, tag, ctl);
}
export const sameSide = (G, a, b) => a === b || (G.ctr[a].fac && G.ctr[a].fac === G.ctr[b].fac) || G.ctr[a].over === b || G.ctr[b].over === a;

export function opinion(G, a, b) { return (G.ctr[a].rel[b] || 0) + mod(G.ctr[b], 'opinion'); }
export function changeOpinion(G, a, b, v) {
  G.ctr[a].rel[b] = clamp((G.ctr[a].rel[b] || 0) + v, -100, 100);
  G.ctr[b].rel[a] = clamp((G.ctr[b].rel[a] || 0) + v, -100, 100);
}
export function addTension(G, v, byTag) {
  const c = byTag && G.ctr[byTag];
  const k = c ? 1 + mod(c, 'tensionGain') : 1;
  G.tension = clamp(G.tension + v * k, 0, 100);
  if (c && v > 0) c.aggro = (c.aggro || 0) + v;
}

// ---- neighbours / fronts cache -------------------------------------------------------------------
/** rebuilt when control changes: neighbour sets and front flags */
export function geoCache(G) {
  if (G._geo && !G._ctlDirty) return G._geo;
  const nb = {};
  const count = {};
  for (let i = 0; i < NREG; i++) {
    const a = G.reg[i].c;
    count[a] = (count[a] || 0) + 1;
    for (const j of REG[i].adj) {
      const b = G.reg[j].c;
      if (a !== b) (nb[a] || (nb[a] = new Set())).add(b);
    }
  }
  G._geo = { nb, count };
  G._ctlDirty = false;
  G._frontDirty = true;
  return G._geo;
}
export function neighbours(G, tag) { return geoCache(G).nb[tag] || new Set(); }
export function regionCount(G, tag) { return geoCache(G).count[tag] || 0; }

/** Uint8Array: 1 when a region borders territory held by somebody its controller is at war with */
export function frontFlags(G) {
  geoCache(G);
  if (G._frontReg && !G._frontDirty) return G._frontReg;
  const f = new Uint8Array(NREG);
  for (let i = 0; i < NREG; i++) {
    const a = G.reg[i].c;
    for (const j of REG[i].adj) { if (atWar(G, a, G.reg[j].c)) { f[i] = 1; break; } }
  }
  G._frontReg = f; G._frontDirty = false;
  return f;
}
export function warChanged(G) { G._en = null; G._frontDirty = true; G._supDirty = true; }

// ---- factions ------------------------------------------------------------------------------------
export function createFaction(G, leader, name, id) {
  id = id || 'f_' + leader;
  if (G.factions[id]) return id;
  G.factions[id] = { name, leader, members: [leader] };
  G.ctr[leader].fac = id;
  return id;
}
export function joinFaction(G, tag, id) {
  const f = G.factions[id];
  const c = G.ctr[tag];
  if (!f || c.fac === id) return false;
  if (c.fac) leaveFaction(G, tag);
  c.fac = id;
  if (!f.members.includes(tag)) f.members.push(tag);
  for (const m of f.members) if (m !== tag) changeOpinion(G, tag, m, 30);
  // join the wars of the faction leader
  for (const e of enemies(G, f.leader).slice()) {
    if (e === tag || !G.ctr[e].alive || sameSide(G, e, tag)) continue;
    setWar(G, tag, e, f.leader === tag ? tag : e);
  }
  // puppets follow
  for (const p of Object.values(G.ctr)) if (p.over === tag && p.alive && p.fac !== id) joinFaction(G, p.tag, id);
  news(G, `${cn(G, tag)}: вступление в альянс «${f.name}»`, 'diplo');
  warChanged(G);
  return true;
}
export function leaveFaction(G, tag) {
  const c = G.ctr[tag];
  const f = G.factions[c.fac];
  c.fac = null;
  if (!f) return;
  f.members = f.members.filter((m) => m !== tag);
  if (!f.members.length) { for (const id in G.factions) if (G.factions[id] === f) delete G.factions[id]; return; }
  if (f.leader === tag) {
    let best = f.members[0];
    for (const m of f.members) if (strength(G, m) > strength(G, best)) best = m;
    f.leader = best;
  }
}
/** crude national strength: factories + divisions */
export function strength(G, tag) {
  const c = G.ctr[tag];
  if (!c || !c.alive) return 0;
  return (c._civ || 0) * 0.5 + (c._mil || 0) + divsOf(G, tag).length * 1.2;
}

// ---- war -----------------------------------------------------------------------------------------
function setWar(G, a, b, attacker) {
  if (a === b || atWar(G, a, b)) return;
  G.war[pairKey(a, b)] = { start: G.day, att: attacker };
  delete G.pacts.nap[pairKey(a, b)];
  delete G.pacts.access[a + '>' + b];
  delete G.pacts.access[b + '>' + a];
  delete G.pacts.guar[a + '>' + b];
  delete G.pacts.guar[b + '>' + a];
  G.ctr[a].rel[b] = -100; G.ctr[b].rel[a] = -100;
  G._en = null;
}
function closure(G, tag) {
  const set = new Set([tag]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const t of Array.from(set)) {
      const c = G.ctr[t];
      const add = [];
      if (c.fac && G.factions[c.fac]) add.push(...G.factions[c.fac].members);
      if (c.over) add.push(c.over);
      for (const p of Object.values(G.ctr)) if (p.over === t) add.push(p.tag);
      for (const x of add) if (G.ctr[x].alive && !set.has(x)) { set.add(x); grew = true; }
    }
  }
  return set;
}
/** why `a` may not declare war on `b` (null when allowed) */
export function warBlocker(G, a, b, scripted) {
  const ca = G.ctr[a], cb = G.ctr[b];
  if (a === b || !cb || !cb.alive) return 'Цель недоступна';
  if (atWar(G, a, b)) return 'Уже идёт война';
  if (sameSide(G, a, b)) return 'Это ваш союзник';
  if (ca.capit) return 'Страна капитулировала';
  if ((G.truce[pairKey(a, b)] || 0) > G.day) return `Перемирие до ${fmtDate(G.truce[pairKey(a, b)])}`;
  if (scripted) return null;
  const nap = G.pacts.nap[pairKey(a, b)];
  if (nap !== undefined && G.day - nap < 365) return 'Действует пакт о ненападении (не менее года)';
  if (!((G.wargoals[a + '>' + b] || 0) > G.day)) return 'Нет оправданной цели войны';
  return null;
}
export function declareWar(G, a, b, opts = {}) {
  if (warBlocker(G, a, b, true)) return false;
  const ca = G.ctr[a], cb = G.ctr[b];
  const att = closure(G, a);
  const def = closure(G, b);
  for (const key in G.pacts.guar) {
    const [g, t] = key.split('>');
    if (t === b && G.ctr[g].alive && !G.ctr[g].capit && !att.has(g)) for (const x of closure(G, g)) def.add(x);
  }
  for (const x of Array.from(att)) if (def.has(x) && x !== a) att.delete(x);
  def.delete(a);
  // faction members of the attacker only join when their leader starts the war (or they are puppets)
  if (ca.fac && G.factions[ca.fac] && G.factions[ca.fac].leader !== a && !opts.callAll) {
    for (const x of Array.from(att)) if (x !== a && G.ctr[x].over !== a) att.delete(x);
  }
  for (const x of att) for (const y of def) { if (x !== y && !sameSide(G, x, y)) setWar(G, x, y, a); }
  delete G.wargoals[a + '>' + b];
  const major = COUNTRIES[b].major;
  addTension(G, (major ? 14 : 7) * (ca.ideo === 'dem' ? 0.5 : 1), a);
  cb.ws = clamp(cb.ws + 0.15, 0, 1);
  for (const y of def) if (y !== b) G.ctr[y].ws = clamp(G.ctr[y].ws + 0.08, 0, 1);
  const others = Array.from(def).filter((y) => y !== b).map((y) => cn(G, y));
  news(G, `ВОЙНА: ${cn(G, a)} объявляет войну — ${cn(G, b)}${others.length ? ' (на стороне обороны: ' + others.slice(0, 6).join(', ') + (others.length > 6 ? '…' : '') + ')' : ''}`, 'war', cb.cap);
  warChanged(G);
  for (const h of hooks.war) h(G, a, b, att, def);
  return true;
}
export function makePeace(G, a, b, truceDays = 365) {
  delete G.war[pairKey(a, b)];
  G.truce[pairKey(a, b)] = G.day + truceDays;
  G.ctr[a].rel[b] = -30; G.ctr[b].rel[a] = -30;
  warChanged(G);
}

// ---- territory -----------------------------------------------------------------------------------
/** a division of `byTag` entered an enemy-held region */
export function onCapture(G, r, byTag) {
  const reg = G.reg[r];
  const prev = reg.c;
  let ctl = byTag;
  const owner = G.ctr[reg.o];
  if (reg.o !== byTag && owner && owner.alive && !atWar(G, byTag, reg.o) && friendly(G, byTag, reg.o)) ctl = reg.o;
  // puppets and junior partners hand conquests of enemy land to nobody: they keep what they take
  reg.c = ctl;
  reg.dmg = Math.min(0.7, reg.dmg + 0.12);
  G._ctlDirty = true; G._supDirty = true;
  (G._capCheck || (G._capCheck = new Set())).add(prev).add(reg.o);
  if (owner && owner.capit && ctl === reg.o && r === owner.cap) revive(G, reg.o);
  for (const h of hooks.capture) h(G, r, byTag, prev);
  const pl = G.player;
  if (pl && (prev === pl || byTag === pl || reg.o === pl) && reg.vp >= 3) {
    news(G, byTag === pl || ctl === pl ? `Наши войска заняли ${REG[r].name}` : `Потерян регион ${REG[r].name}`, byTag === pl || ctl === pl ? 'good' : 'bad', r);
  }
}

export function surrenderLimit(G, c) {
  return clamp(0.45 + 0.3 * c.ws + mod(c, 'surrender') + (COUNTRIES[c.tag].major ? 0.12 : 0), 0.3, 0.95);
}
/** share of own core victory points lost to enemies */
export function vpLost(G, tag) {
  let total = 0, lost = 0, held = 0;
  for (let i = 0; i < NREG; i++) {
    const r = G.reg[i];
    if (r.o !== tag) continue;
    const isCore = r.core === tag;
    const v = r.vp * (isCore ? 1 : 0.25) + 0.2;
    total += v;
    if (r.c !== tag && atWar(G, tag, r.c)) lost += v; else held++;
  }
  return { ratio: total > 0 ? lost / total : 1, held };
}
export function checkCapitulations(G) {
  if (!G._capCheck || !G._capCheck.size) return;
  const tags = Array.from(G._capCheck);
  G._capCheck.clear();
  for (const tag of tags) {
    const c = G.ctr[tag];
    if (!c || !c.alive || c.capit) continue;
    if (!enemies(G, tag).length) continue;
    const { ratio, held } = vpLost(G, tag);
    if (held === 0 || ratio >= surrenderLimit(G, c)) capitulate(G, tag);
  }
}

function mainOccupier(G, tag) {
  const score = {};
  for (let i = 0; i < NREG; i++) {
    const r = G.reg[i];
    if (r.o === tag && r.c !== tag && atWar(G, tag, r.c)) score[r.c] = (score[r.c] || 0) + r.vp + 0.5;
  }
  let best = null;
  for (const t in score) if (!best || score[t] > score[best]) best = t;
  if (!best) { for (const e of activeEnemies(G, tag)) if (!best || strength(G, e) > strength(G, best)) best = e; }
  return best;
}

export function capitulate(G, tag) {
  const c = G.ctr[tag];
  const main = mainOccupier(G, tag);
  if (!main) return;
  c.capit = true;
  c.train = []; c.build = [];
  for (const d of divsOf(G, tag).slice()) removeDivision(G, d);
  G.wings = G.wings.filter((w) => w.o !== tag);
  // ships: a part escapes to the faction leader
  const fac = c.fac && G.factions[c.fac];
  const exileTo = fac && fac.members.find((m) => m !== tag && G.ctr[m].alive && !G.ctr[m].capit && enemies(G, tag).some((e) => atWar(G, m, e)));
  const mine = G.fleets.filter((f) => f.o === tag);
  G.fleets = G.fleets.filter((f) => f.o !== tag);
  if (exileTo) {
    const host = G.fleets.find((f) => f.o === exileTo);
    if (host) for (const f of mine) for (const k in f.ships) host.ships[k] = (host.ships[k] || 0) + Math.floor(f.ships[k] * 0.4);
  }
  // territory: cores (or everything when nobody fights on) go to the occupiers
  const en = new Set(activeEnemies(G, tag));
  const flip = [];
  for (let i = 0; i < NREG; i++) {
    const r = G.reg[i];
    if (r.c !== tag) continue;
    if (r.core === tag || !exileTo || r.o !== tag) flip.push(i);
  }
  let guard = 0;
  while (flip.length && guard++ < 40) {
    for (let k = flip.length - 1; k >= 0; k--) {
      const i = flip[k];
      const cnt = {};
      for (const j of REG[i].adj) { const o = G.reg[j].c; if (en.has(o)) cnt[o] = (cnt[o] || 0) + 1; }
      let best = null;
      for (const t in cnt) if (!best || cnt[t] > cnt[best]) best = t;
      if (!best && guard > 20) best = main;
      if (best) {
        const r = G.reg[i];
        // enemy land that this country occupied is returned to its owner
        r.c = r.o !== tag && en.has(r.o) ? r.o : best;
        flip.splice(k, 1);
      }
    }
  }
  G._ctlDirty = true; G._supDirty = true;
  buildIndex(G);
  news(G, `КАПИТУЛЯЦИЯ: ${cn(G, tag)} прекращает сопротивление${exileTo ? ', правительство в изгнании продолжает борьбу' : ''}`, 'war', c.cap);
  addTension(G, 3, main);
  G.ctr[main].ws = clamp(G.ctr[main].ws + 0.05, 0, 1);
  for (const h of hooks.capitulate) h(G, tag, main, !!exileTo);
  if (!c.alive || !c.capit) return;       // a hook settled the peace already
  if (!exileTo) {
    if (main === G.player && !G.opts.autoPeace) G.evq.push({ type: 'peace', loser: tag, main });
    else peaceOut(G, tag, main, aiPeacePolicy(G, main, tag));
  }
  // if this was the last fighting member of a side, losers in exile are settled too
  for (const other of Object.values(G.ctr)) {
    if (!other.alive || !other.capit || other.tag === tag) continue;
    const still = other.fac && G.factions[other.fac] && G.factions[other.fac].members.some((m) => G.ctr[m].alive && !G.ctr[m].capit);
    if (!still && enemies(G, other.tag).length) {
      const mo = mainOccupier(G, other.tag);
      if (mo) { if (mo === G.player && !G.opts.autoPeace) G.evq.push({ type: 'peace', loser: other.tag, main: mo }); else peaceOut(G, other.tag, mo, aiPeacePolicy(G, mo, other.tag)); }
    }
  }
}

export function aiPeacePolicy(G, main, loser) {
  const m = G.ctr[main];
  if ((main === 'SPR' && loser === 'SPA') || (main === 'SPA' && loser === 'SPR')) return 'annex';
  if (m.ideo === 'dem') return 'puppet';
  if (m.ideo === 'com') return COUNTRIES[loser].major || G.ctr[loser]._pop > 12000 ? 'puppet' : 'annex';
  return 'annex';
}

export function revive(G, tag, opts = {}) {
  const c = G.ctr[tag];
  c.alive = true; c.capit = false;
  if (c.cap < 0 || G.reg[c.cap].o !== tag) {
    let best = -1;
    for (let i = 0; i < NREG; i++) if (G.reg[i].o === tag && (best < 0 || G.reg[i].vp > G.reg[best].vp)) best = i;
    c.cap = best;
  }
  if (c.cap >= 0 && !divsOf(G, tag).length) {
    recalcMods(G, c);
    if (!c.tpl.inf) c.tpl.inf = { name: 'Пехотная дивизия', bats: { inf: 6, art: 1 }, sup: [], icon: 'inf' };
    for (const k in c.tpl) calcTemplate(c, c.tpl[k]);
    const n = opts.divs ?? 3;
    for (let k = 0; k < n; k++) spawnDivision(G, c, 'inf', c.cap, { org: 0.5 });
    c.stock.rifle = (c.stock.rifle || 0) + 800 * n;
    c.stock.art = (c.stock.art || 0) + 40 * n;
  }
  news(G, `${cn(G, tag)}: государство восстановлено`, 'diplo', c.cap);
}

/** final settlement for a defeated country */
export function peaceOut(G, loser, main, policy) {
  const L = G.ctr[loser];
  const M = G.ctr[main];
  const revived = new Set();
  for (let i = 0; i < NREG; i++) {
    const r = G.reg[i];
    if (r.o === loser) {
      const holder = r.c === loser ? main : r.c;
      const core = r.core;
      if (core && core !== loser && G.ctr[core] && !atWar(G, holder, core) && core !== holder && (G.ctr[core].alive || friendly(G, holder, core) || G.ctr[holder].ideo === 'dem')) {
        r.o = core; r.c = core; revived.add(core);
      } else if (policy === 'puppet' && core === loser) {
        r.o = loser; r.c = loser;
      } else {
        r.o = holder; r.c = holder;
      }
    } else if (r.c === loser) {
      r.c = r.o;
      if (G.ctr[r.o] && (G.ctr[r.o].capit || !G.ctr[r.o].alive)) revived.add(r.o);
    }
  }
  for (const key of Object.keys(G.war)) {
    const [a, b] = key.split('|');
    if (a === loser || b === loser) { delete G.war[key]; G.truce[key] = G.day + 365; }
  }
  for (const d of divsOf(G, loser).slice()) removeDivision(G, d);
  G.wings = G.wings.filter((w) => w.o !== loser);
  G.fleets = G.fleets.filter((f) => f.o !== loser);
  if (L.fac) leaveFaction(G, loser);
  for (const p of Object.values(G.ctr)) if (p.over === loser) p.over = policy === 'annex' ? main : null;
  L.over = null;
  let hasLand = false;
  for (let i = 0; i < NREG; i++) if (G.reg[i].o === loser) { hasLand = true; break; }
  if (policy === 'puppet' && hasLand) {
    L.ideo = M.ideo;
    for (const k in L.sup) L.sup[k] = 0.1; L.sup[M.ideo] = 0.7;
    L.over = main; L.capit = false; L.alive = true; L.ws = 0.3; L.stab = 0.5;
    L.stock = {}; L.fielded = {}; L.lines = []; L.docks = []; L.build = []; L.train = [];
    warChanged(G); G._ctlDirty = true;
    buildIndex(G);
    revive(G, loser, { divs: 2 });
    if (M.fac) joinFaction(G, loser, M.fac);
    news(G, `МИР: ${cn(G, loser)} становится зависимым государством (${cn(G, main)})`, 'diplo', L.cap);
  } else {
    L.alive = false; L.capit = false;
    news(G, `МИР: ${cn(G, loser)} прекращает существование; победитель — ${cn(G, main)}`, 'diplo', L.cap);
  }
  warChanged(G); G._ctlDirty = true; G._supDirty = true;
  buildIndex(G);
  for (const t of revived) {
    const c = G.ctr[t];
    if (!c.alive || c.capit) {
      // back from exile / from the dead
      let cores = 0, back = 0;
      for (let i = 0; i < NREG; i++) if (G.reg[i].core === t) { cores++; if (G.reg[i].o === t && G.reg[i].c === t) back++; }
      if (back > 0) revive(G, t);
    }
  }
  addTension(G, policy === 'annex' ? 4 : 1, main);
  for (const h of hooks.peace) h(G, loser, main, policy);
}

/** peaceful transfer of regions (treaties, ultimatums) */
export function cedeRegions(G, from, to, filter) {
  let n = 0;
  for (let i = 0; i < NREG; i++) {
    const r = G.reg[i];
    if (r.o !== from || !filter(i, r)) continue;
    r.o = to; r.c = to; n++;
    // foreign troops leave
    for (const d of divsIn(G, i).slice()) {
      if (d.o === from || !canEnter(G, d.o, i)) {
        const home = G.ctr[d.o].cap;
        if (home >= 0 && G.reg[home].c === d.o) { d.r = home; d.path = []; d.mp = 0; } else removeDivision(G, d);
      }
    }
    if (G.ctr[from].cap === i) G.ctr[from].cap = -1;
  }
  if (n) {
    G._ctlDirty = true; G._supDirty = true; buildIndex(G);
    const c = G.ctr[from];
    if (c.cap < 0) { let best = -1; for (let i = 0; i < NREG; i++) if (G.reg[i].o === from && (best < 0 || G.reg[i].vp > G.reg[best].vp)) best = i; c.cap = best; if (best < 0) c.alive = false; }
  }
  return n;
}

/** whole country absorbed without a fight (Anschluss and the like) */
export function annexCountry(G, target, by) {
  const T = G.ctr[target], B = G.ctr[by];
  if (!T.alive) return;
  for (let i = 0; i < NREG; i++) {
    const r = G.reg[i];
    if (r.o === target) { r.o = by; if (r.c === target) r.c = by; }
    else if (r.c === target) r.c = r.o;
  }
  for (const d of divsOf(G, target).slice()) {
    const r = d.r, str = d.str;
    removeDivision(G, d);
    if (B.tpl.inf && G.reg[r].c === by) spawnDivision(G, B, T.tpl[d.t] && T.tpl[d.t].icon === 'cav' && B.tpl.cav ? 'cav' : 'inf', r, { str, org: 0.6 });
  }
  for (const k in T.stock) B.stock[k] = (B.stock[k] || 0) + T.stock[k];
  for (const k in T.fielded) B.stock[k] = (B.stock[k] || 0) + T.fielded[k];
  for (const w of G.wings) if (w.o === target) w.o = by;
  for (const f of G.fleets) if (f.o === target) f.o = by;
  B.convoys += T.convoys;
  for (const key of Object.keys(G.war)) { const [a, b] = key.split('|'); if (a === target || b === target) delete G.war[key]; }
  if (T.fac) leaveFaction(G, target);
  T.alive = false; T.capit = false;
  warChanged(G); G._ctlDirty = true; G._supDirty = true; buildIndex(G);
  addTension(G, 5, by);
}

// ---- treaties ------------------------------------------------------------------------------------
export function signNAP(G, a, b) { G.pacts.nap[pairKey(a, b)] = G.day; changeOpinion(G, a, b, 15); }
export function guarantee(G, a, b) { G.pacts.guar[a + '>' + b] = G.day; changeOpinion(G, a, b, 20); }
export function grantAccess(G, guest, host) { G.pacts.access[guest + '>' + host] = G.day; }
export const hasNAP = (G, a, b) => G.pacts.nap[pairKey(a, b)] !== undefined;

export function justifyDays(G, a, b) {
  const c = G.ctr[a];
  let d = 150 * (1 + mod(c, 'justifyTime'));
  if (c.ideo === 'dem') d *= 1.4;
  d *= 1 - G.tension / 250;
  return Math.max(30, Math.round(d));
}
export function justifyBlocker(G, a, b) {
  const ca = G.ctr[a], cb = G.ctr[b];
  if (!cb || !cb.alive || a === b) return 'Цель недоступна';
  if (atWar(G, a, b)) return 'Уже идёт война';
  if (sameSide(G, a, b)) return 'Это ваш союзник';
  if ((G.wargoals[a + '>' + b] || 0) > G.day) return 'Цель войны уже оправдана';
  if (G.justify.some((j) => j.a === a && j.b === b)) return 'Оправдание уже идёт';
  if (ca.ideo === 'dem' && G.tension < 50 && (cb.aggro || 0) < 10) return 'Демократии нужна напряжённость ≥50% или агрессивная цель';
  if (ca.flags.isolation) return 'Изоляционизм не позволяет';
  return null;
}
export function startJustify(G, a, b) {
  G.justify.push({ a, b, done: G.day + justifyDays(G, a, b) });
  changeOpinion(G, a, b, -30);
}
export function diploTick(G) {
  for (let i = G.justify.length - 1; i >= 0; i--) {
    const j = G.justify[i];
    if (G.day >= j.done) {
      G.justify.splice(i, 1);
      if (!G.ctr[j.a].alive || !G.ctr[j.b].alive) continue;
      G.wargoals[j.a + '>' + j.b] = G.day + 400;
      addTension(G, 2, j.a);
      if (j.a === G.player) news(G, `Цель войны оправдана: ${cn(G, j.b)}`, 'diplo');
      else if (j.b === G.player) news(G, `${cn(G, j.a)} оправдала цель войны против нас!`, 'bad');
    }
  }
}

/** default staff orders for every neighbour (filled lazily by the planner) */
export function initFronts(G, c) {
  if (!c.staff) c.staff = { auto: true, fronts: {}, coast: 1 };
}

/** countries able to act (alive, not capitulated) */
export const actors = (G) => Object.values(G.ctr).filter((c) => c.alive && !c.capit);
