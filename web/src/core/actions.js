// Player commands that need validation or an answer from the AI (diplomacy, orders).
import { REG, NREG, LANDMASS } from './world.js';
import { COUNTRIES } from '../data/countries.js';
import { ADVISORS, ADVISOR_COST, MAX_ADVISORS, LAW_COST } from '../data/laws.js';
import { clamp, pairKey } from './util.js';
import { recalcMods } from './mods.js';
import {
  atWar, enemies, sameSide, opinion, changeOpinion, signNAP, guarantee, grantAccess, hasNAP, joinFaction, leaveFaction, createFaction,
  justifyBlocker, startJustify, justifyDays, warBlocker, declareWar, makePeace, news, cn, addTension, isAtWar, strength, vpLost, peaceOut, warChanged,
} from './diplo.js';
import { lawBlocker, setLaw } from './economy.js';
import { orderMove, divsIn, calcTemplate, recalcNeeds, disbandDivision } from './land.js';
import { orderSea } from './navy.js';
import { BAT, SUPC, MAX_BATS, MAX_WIDTH } from '../data/equip.js';

const ok = (msg) => ({ ok: true, msg });
const fail = (msg) => ({ ok: false, msg });

export const COST = { improve: 25, nap: 40, guarantee: 25, access: 25, invite: 50, join: 25, justify: 40, peace: 25, lease: 10 };

function pay(c, n) { if (c.pp < n) return false; c.pp -= n; return true; }

export function actImprove(G, a, b) {
  const c = G.ctr[a];
  if (atWar(G, a, b)) return fail('Идёт война');
  if ((c.rel[b] || 0) >= 80) return fail('Отношения уже превосходные');
  if (!pay(c, COST.improve)) return fail(`Нужно ${COST.improve} политвласти`);
  changeOpinion(G, a, b, 15);
  return ok(`Отношения улучшены: ${cn(G, b)}`);
}
export function actNAP(G, a, b) {
  const c = G.ctr[a], o = G.ctr[b];
  if (atWar(G, a, b)) return fail('Идёт война');
  if (hasNAP(G, a, b)) return fail('Пакт уже действует');
  if (c.pp < COST.nap) return fail(`Нужно ${COST.nap} политвласти`);
  const op = opinion(G, b, a);
  const hostile = (G.wargoals[b + '>' + a] || 0) > G.day || G.justify.some((j) => j.a === b && j.b === a) || (o.ai.prep && o.ai.prep[a] && o.ai.prepUntil > G.day);
  if (hostile || op < -15) { c.pp -= 10; return fail(`${cn(G, b)} отклоняет предложение`); }
  c.pp -= COST.nap;
  signNAP(G, a, b);
  news(G, `${cn(G, a)} и ${cn(G, b)} подписали пакт о ненападении`, 'diplo');
  return ok('Пакт о ненападении подписан');
}
export function actGuarantee(G, a, b) {
  const c = G.ctr[a];
  if (atWar(G, a, b)) return fail('Идёт война');
  if (G.pacts.guar[a + '>' + b]) return fail('Гарантии уже даны');
  if (c.flags.isolation) return fail('Изоляционизм не позволяет');
  if (c.ideo === 'dem' && G.tension < 15) return fail('Нужна напряжённость ≥15%');
  if (!pay(c, COST.guarantee)) return fail(`Нужно ${COST.guarantee} политвласти`);
  guarantee(G, a, b);
  news(G, `${cn(G, a)} гарантирует независимость: ${cn(G, b)}`, 'diplo');
  return ok('Гарантии независимости даны');
}
export function actAccess(G, a, b) {
  const c = G.ctr[a];
  if (atWar(G, a, b)) return fail('Идёт война');
  if (G.pacts.access[a + '>' + b]) return fail('Право прохода уже есть');
  if (c.pp < COST.access) return fail(`Нужно ${COST.access} политвласти`);
  const op = opinion(G, b, a);
  const o = G.ctr[b];
  const yes = op >= 35 || (o.ideo === c.ideo && op >= 10) || enemies(G, a).some((e) => atWar(G, b, e));
  if (!yes) { c.pp -= 5; return fail(`${cn(G, b)} отказывает в проходе войск (нужны отношения ≥35)`); }
  c.pp -= COST.access;
  grantAccess(G, a, b);
  return ok('Право прохода войск получено');
}

/** would country b agree to be in one alliance with a (leader or member)? */
function allianceOk(G, a, b) {
  const A = G.ctr[a], B = G.ctr[b];
  if (B.flags.isolation) return false;
  if ((A.ideo === 'fas' && B.ideo === 'com') || (A.ideo === 'com' && B.ideo === 'fas')) return false;
  const op = opinion(G, b, a);
  const common = enemies(G, a).some((e) => G.ctr[e].alive && atWar(G, b, e));
  if (common) return op >= -20;
  if (A.ideo === B.ideo && A.ideo !== 'neu') return op >= 20 && (G.tension >= 25 || !COUNTRIES[b].major);
  return op >= 60 && G.tension >= 40 && !COUNTRIES[b].major;
}
export function actInvite(G, a, b) {
  const c = G.ctr[a], o = G.ctr[b];
  if (atWar(G, a, b)) return fail('Идёт война');
  if (o.over && o.over !== a) return fail('Зависимая страна не решает сама');
  let fid = c.fac;
  if (fid && G.factions[fid].leader !== a) return fail('Приглашать может только лидер альянса');
  if (o.fac && G.factions[o.fac] && G.factions[o.fac].leader === b && G.factions[o.fac].members.length > 1) return fail('Это лидер другого альянса');
  if (c.pp < COST.invite) return fail(`Нужно ${COST.invite} политвласти`);
  if (!allianceOk(G, a, b)) { c.pp -= 10; return fail(`${cn(G, b)} отклоняет приглашение (нужны близкая идеология, общий враг или отношения ≥60)`); }
  c.pp -= COST.invite;
  if (!fid) fid = createFaction(G, a, `Союз (${cn(G, a)})`);
  joinFaction(G, b, fid);
  return ok(`${cn(G, b)} вступает в наш альянс`);
}
export function actJoin(G, a, fid) {
  const c = G.ctr[a], f = G.factions[fid];
  if (!f) return fail('Альянс не существует');
  if (c.fac === fid) return fail('Мы уже в этом альянсе');
  if (c.flags.isolation) return fail('Изоляционизм не позволяет');
  if (enemies(G, a).some((e) => G.ctr[e].fac === fid)) return fail('Мы воюем с этим альянсом');
  if (c.pp < COST.join) return fail(`Нужно ${COST.join} политвласти`);
  if (!allianceOk(G, f.leader, a) && !allianceOk(G, a, f.leader)) { c.pp -= 5; return fail(`${cn(G, f.leader)} не принимает нас в альянс`); }
  c.pp -= COST.join;
  joinFaction(G, a, fid);
  return ok(`Мы вступили в альянс «${f.name}»`);
}
export function actLeave(G, a) {
  const c = G.ctr[a];
  if (!c.fac) return fail('Мы не состоим в альянсе');
  if (isAtWar(G, a)) return fail('Нельзя выйти из альянса во время войны');
  leaveFaction(G, a);
  return ok('Мы вышли из альянса');
}
export function actJustify(G, a, b) {
  const c = G.ctr[a];
  const err = justifyBlocker(G, a, b);
  if (err) return fail(err);
  if (!pay(c, COST.justify)) return fail(`Нужно ${COST.justify} политвласти`);
  startJustify(G, a, b);
  return ok(`Оправдание войны займёт ${justifyDays(G, a, b)} дн.`);
}
export function actDeclare(G, a, b) {
  const err = warBlocker(G, a, b, false);
  if (err) return fail(err);
  declareWar(G, a, b, { callAll: true });
  return ok('Война объявлена');
}
/** white peace between two sides: everyone goes home */
export function peaceChance(G, a, b) {
  const A = G.ctr[a], B = G.ctr[b];
  const w = G.war[pairKey(a, b)];
  if (!w) return 0;
  const la = vpLost(G, a).ratio, lb = vpLost(G, b).ratio;
  const days = G.day - w.start;
  let s = (lb - la) * 2 + (strength(G, a) - strength(G, b)) / Math.max(20, strength(G, a) + strength(G, b)) + (days > 500 ? 0.2 : 0) - (B.ws - 0.5) * 0.5;
  if (w.att === a) s -= 0.25;
  if (COUNTRIES[b].major && B.ideo !== 'dem') s -= 0.2;
  void A;
  return clamp(s, 0, 1);
}
export function actPeace(G, a, b) {
  const c = G.ctr[a];
  if (!atWar(G, a, b)) return fail('Мы не воюем');
  const fa = c.fac && G.factions[c.fac], fb = G.ctr[b].fac && G.factions[G.ctr[b].fac];
  if (fa && fa.leader !== a) return fail('Мир заключает лидер альянса');
  if (fb && fb.leader !== b) return fail('Переговоры ведутся с лидером альянса противника');
  if (c.pp < COST.peace) return fail(`Нужно ${COST.peace} политвласти`);
  c.pp -= COST.peace;
  if (peaceChance(G, a, b) < 0.5) return fail(`${cn(G, b)} отвергает мирные предложения`);
  const sa = fa ? fa.members.slice() : [a], sb = fb ? fb.members.slice() : [b];
  for (const t of Object.values(G.ctr)) { if (t.over && sa.includes(t.over) && !sa.includes(t.tag)) sa.push(t.tag); if (t.over && sb.includes(t.over) && !sb.includes(t.tag)) sb.push(t.tag); }
  for (const x of sa) for (const y of sb) if (atWar(G, x, y)) makePeace(G, x, y, 365);
  for (let i = 0; i < NREG; i++) {
    const r = G.reg[i];
    if (r.c !== r.o && ((sa.includes(r.c) && sb.includes(r.o)) || (sb.includes(r.c) && sa.includes(r.o)))) r.c = r.o;
  }
  // troops left on foreign soil go home
  for (const id in G.divs) {
    const d = G.divs[id];
    if (d.sea) continue;
    const ctl = G.reg[d.r].c;
    if (ctl !== d.o && !sameSide(G, d.o, ctl) && !G.pacts.access[d.o + '>' + ctl]) { const home = G.ctr[d.o].cap; if (home >= 0) { d.r = home; d.path = []; d.mp = 0; } }
  }
  G._byReg = null; G._ctlDirty = true; G._supDirty = true;
  warChanged(G);
  news(G, `МИР: ${cn(G, a)} и ${cn(G, b)} заключили мир без аннексий`, 'diplo');
  return ok('Мир заключён');
}
export function actLendLease(G, a, b, eq, amount) {
  const c = G.ctr[a], o = G.ctr[b];
  if (atWar(G, a, b)) return fail('Идёт война');
  amount = Math.min(amount, Math.floor(c.stock[eq] || 0));
  if (amount <= 0) return fail('На складе пусто');
  if (!pay(c, COST.lease)) return fail(`Нужно ${COST.lease} политвласти`);
  c.stock[eq] -= amount;
  o.stock[eq] = (o.stock[eq] || 0) + amount;
  changeOpinion(G, a, b, 5);
  return ok(`Отправлено: ${amount}`);
}

// ---- government ------------------------------------------------------------------------------------
export function actLaw(G, tag, kind, idx) {
  const c = G.ctr[tag];
  const err = lawBlocker(G, c, kind, idx);
  if (err) return fail(err);
  c.pp -= LAW_COST;
  setLaw(G, c, kind, idx);
  return ok('Закон принят');
}
export function actAdvisor(G, tag, id) {
  const c = G.ctr[tag];
  if (!ADVISORS[id]) return fail('Нет такого советника');
  if (c.adv.includes(id)) return fail('Уже назначен');
  if (c.adv.length >= MAX_ADVISORS) return fail(`Не более ${MAX_ADVISORS} советников`);
  if (!pay(c, ADVISOR_COST)) return fail(`Нужно ${ADVISOR_COST} политвласти`);
  c.adv.push(id);
  recalcMods(G, c);
  return ok('Советник назначен');
}
export function actFireAdvisor(G, tag, id) {
  const c = G.ctr[tag];
  c.adv = c.adv.filter((a) => a !== id);
  recalcMods(G, c);
  return ok('Советник уволен');
}

// ---- army ------------------------------------------------------------------------------------------
/** order selected divisions to a region: by land when possible, else by sea */
export function actMove(G, tag, ids, target) {
  const divs = ids.map((id) => G.divs[id]).filter((d) => d && d.o === tag && !d.sea && !d.ret);
  if (!divs.length) return fail('Нет доступных дивизий');
  let moved = 0;
  const bySea = [];
  for (const d of divs) {
    if (d.tr) d.tr = 0;
    if (LANDMASS[d.r] === LANDMASS[target] && orderMove(G, d, target)) { d.man = 1; moved++; } else bySea.push(d);
  }
  if (!bySea.length) return ok(atWar(G, tag, G.reg[target].c) ? `Атака: ${REG[target].name}` : `Марш: ${REG[target].name}`);
  // group by region of departure
  const groups = new Map();
  for (const d of bySea) (groups.get(d.r) || groups.set(d.r, []).get(d.r)).push(d);
  let msg = '';
  for (const [, list] of groups) {
    const err = orderSea(G, tag, list, target);
    if (err) msg = err; else { moved += list.length; for (const d of list) d.man = 1; msg = atWar(G, tag, G.reg[target].c) ? `Готовится морской десант: ${REG[target].name}` : `Погрузка на транспорты: ${REG[target].name}`; }
  }
  return moved ? ok(msg) : fail(msg || 'Нет пути');
}
export function actStop(G, tag, ids) {
  for (const id of ids) { const d = G.divs[id]; if (d && d.o === tag && !d.ret && !d.sea) { d.path = []; d.mp = 0; d.tr = 0; } }
  return ok('Приказ отменён');
}
export function actSetManual(G, tag, ids, man) {
  for (const id of ids) { const d = G.divs[id]; if (d && d.o === tag) d.man = man ? 1 : 0; }
  return ok(man ? 'Дивизии под вашим прямым командованием' : 'Дивизии переданы Генштабу');
}
export function actDisband(G, tag, ids) {
  let n = 0;
  for (const id of ids) { const d = G.divs[id]; if (d && d.o === tag && !d.sea) { disbandDivision(G, d); n++; } }
  recalcNeeds(G, G.ctr[tag]);
  return ok(`Расформировано дивизий: ${n}`);
}
export function templateWidth(bats) { let w = 0, n = 0; for (const k in bats) { w += BAT[k].w * bats[k]; n += bats[k]; } return { w, n }; }
export function actSaveTemplate(G, tag, key, name, bats, sup) {
  const c = G.ctr[tag];
  const clean = {};
  for (const k in bats) if (bats[k] > 0 && BAT[k] && (c.unlocked[k] || k === 'inf' || k === 'mil' || k === 'cav' || k === 'art')) clean[k] = Math.round(bats[k]);
  const { w, n } = templateWidth(clean);
  if (n < 1) return fail('В дивизии должен быть хотя бы один батальон');
  if (n > MAX_BATS) return fail(`Не более ${MAX_BATS} батальонов`);
  if (w > MAX_WIDTH) return fail(`Ширина фронта не более ${MAX_WIDTH}`);
  const s = (sup || []).filter((x) => SUPC[x] && c.unlocked[x]).slice(0, 4);
  let org = 0;
  for (const k in clean) org += BAT[k].org * clean[k];
  if (org / n < 8) return fail('Слишком мало пехоты: дивизия не удержит строй');
  const tank = (clean.ltank || 0) + (clean.mtank || 0) + (clean.htank || 0);
  const icon = tank >= n * 0.3 ? 'arm' : (clean.mot || 0) >= n * 0.5 ? 'mot' : (clean.cav || 0) >= n * 0.5 ? 'cav' : 'inf';
  if (!key) { let i = 1; while (c.tpl['u' + i]) i++; key = 'u' + i; }
  c.tpl[key] = { name: (name || 'Новая дивизия').slice(0, 40), bats: clean, sup: s, icon };
  calcTemplate(c, c.tpl[key]);
  recalcNeeds(G, c);
  return { ok: true, msg: 'Шаблон сохранён', key };
}
export function actDeleteTemplate(G, tag, key) {
  const c = G.ctr[tag];
  for (const id in G.divs) if (G.divs[id].o === tag && G.divs[id].t === key) return fail('Есть дивизии этого шаблона');
  if (c.train.some((t) => t.tpl === key)) return fail('Дивизии этого шаблона обучаются');
  if (Object.keys(c.tpl).length <= 1) return fail('Нужен хотя бы один шаблон');
  delete c.tpl[key];
  return ok('Шаблон удалён');
}
export function actPeaceDeal(G, loser, main, policy) {
  if (!G.ctr[loser].alive) return ok('');
  peaceOut(G, loser, main, policy);
  return ok('Мирный договор подписан');
}
export { divsIn, addTension };
