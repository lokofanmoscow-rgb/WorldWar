// Historical events: ultimatums, treaties, civil war, reactions to wars.
import { REG, NREG, regionAtLonLat } from '../core/world.js';
import { COUNTRIES } from './countries.js';
import { defEvent, fireEvent, inform, D, scriptedWar, spirit, removeSpirit, bump, addEq, ensureAxis } from '../core/script.js';
import { hooks, news, cn, atWar, isAtWar, annexCountry, cedeRegions, signNAP, makePeace, joinFaction, changeOpinion, addTension, enemies, warChanged, vpLost } from '../core/diplo.js';
import { divsOf, removeDivision, spawnDivision, calcTemplate, recalcNeeds, buildIndex } from '../core/land.js';
import { recalcMods, refreshTech } from '../core/mods.js';

const sp = (name) => (i) => REG[i].sp === name;
const adm = (...codes) => (i) => codes.includes(REG[i].adm0);

defEvent('invite', {
  title: 'Приглашение в альянс',
  text: (G, e) => `Нас приглашают вступить в альянс «${G.factions[e.fac] ? G.factions[e.fac].name : ''}». Союзники будут воевать вместе с нами — но и их войны станут нашими.`,
  opts: [
    { text: 'Вступить в альянс', eff: (G, e) => { if (G.factions[e.fac]) joinFaction(G, e.to, e.fac); } },
    { text: 'Отказаться', eff: () => {} },
  ],
});

defEvent('anschluss', {
  title: 'Аншлюс',
  text: 'Германия требует присоединения Австрии к Рейху. Германские войска стоят у границы.',
  opts: [
    { text: 'Подчиниться', eff: (G) => { annexCountry(G, 'AUS', 'GER'); news(G, 'Аншлюс: Австрия присоединена к Германии', 'diplo', G.ctr.GER.cap); } },
    { text: 'Сопротивляться!', eff: (G) => { scriptedWar(G, 'GER', 'AUS'); } },
  ],
  ai: () => 0,
});
defEvent('munich', {
  title: 'Мюнхенское соглашение',
  text: 'Германия требует Судетскую область. Великобритания и Франция советуют уступить ради мира.',
  opts: [
    { text: 'Уступить Судеты', eff: (G) => { cedeRegions(G, 'CZE', 'GER', sp('sudeten')); G.flags.munich = 1; bump(G.ctr.CZE, 'stab', -0.15); addTension(G, 6, 'GER'); news(G, 'Мюнхенское соглашение: Судетская область передана Германии', 'diplo'); } },
    { text: 'Ни пяди земли!', eff: (G) => { scriptedWar(G, 'GER', 'CZE'); } },
  ],
  ai: () => 0,
});
defEvent('memel', {
  title: 'Мемельский ультиматум',
  text: 'Германия требует вернуть Мемельский край.',
  opts: [
    { text: 'Уступить', eff: (G) => { cedeRegions(G, 'LIT', 'GER', sp('memel')); addTension(G, 2, 'GER'); news(G, 'Литва передаёт Мемель Германии', 'diplo'); } },
    { text: 'Отказать', eff: (G) => { scriptedWar(G, 'GER', 'LIT'); } },
  ],
  ai: () => 0,
});
defEvent('mrpact', {
  title: 'Пакт о ненападении',
  text: 'Германия предлагает Советскому Союзу договор о ненападении и раздел сфер влияния в Восточной Европе.',
  opts: [
    { text: 'Подписать', eff: (G) => { signNAP(G, 'GER', 'SOV'); G.flags.mr = 1; changeOpinion(G, 'GER', 'SOV', 30); news(G, 'Германия и СССР подписали пакт о ненападении', 'diplo'); } },
    { text: 'Отклонить', eff: () => {} },
  ],
  ai: () => 0,
});
defEvent('danzig', {
  title: 'Данциг или война',
  text: 'Германия требует Данциг и экстерриториальный коридор в Восточную Пруссию.',
  opts: [
    { text: 'Польша не уступит!', eff: (G) => { scriptedWar(G, 'GER', 'POL'); } },
    { text: 'Уступить Данциг', eff: (G) => { cedeRegions(G, 'POL', 'GER', sp('danzig')); bump(G.ctr.POL, 'stab', -0.2); news(G, 'Польша уступает Данциг Германии', 'diplo'); } },
  ],
  ai: () => 0,
});
defEvent('albania', {
  title: 'Итальянский ультиматум',
  text: 'Италия требует установить протекторат над Албанией.',
  opts: [
    { text: 'Подчиниться', eff: (G) => { annexCountry(G, 'ALB', 'ITA'); news(G, 'Италия аннексирует Албанию', 'diplo'); } },
    { text: 'Сражаться', eff: (G) => { scriptedWar(G, 'ITA', 'ALB'); } },
  ],
  ai: () => 0,
});
defEvent('baltic', {
  title: 'Советский ультиматум',
  text: 'СССР требует сформировать дружественное правительство и допустить части Красной армии.',
  opts: [
    { text: 'Принять ультиматум', eff: (G, e) => { const n = cn(G, e.to); annexCountry(G, e.to, 'SOV'); news(G, `${n} включена в состав СССР`, 'diplo'); } },
    { text: 'Отвергнуть', eff: (G, e) => { scriptedWar(G, 'SOV', e.to); } },
  ],
  ai: () => 0,
});
defEvent('bessarabia', {
  title: 'Бессарабский вопрос',
  text: 'СССР требует передать Бессарабию и Северную Буковину.',
  opts: [
    { text: 'Уступить', eff: (G) => { cedeRegions(G, 'ROM', 'SOV', sp('bess')); bump(G.ctr.ROM, 'stab', -0.1); news(G, 'Румыния передаёт Бессарабию СССР', 'diplo'); } },
    { text: 'Отказать', eff: (G) => { scriptedWar(G, 'SOV', 'ROM'); } },
  ],
  ai: () => 0,
});
defEvent('karelia', {
  title: 'Советские требования',
  text: 'СССР требует отодвинуть границу от Ленинграда и передать Карельский перешеек.',
  opts: [
    { text: 'Отказать', eff: (G) => { G.flags.winterWar = G.day; scriptedWar(G, 'SOV', 'FIN'); } },
    { text: 'Уступить перешеек', eff: (G) => { cedeRegions(G, 'FIN', 'SOV', sp('karelia')); G.flags.kareliaCeded = 1; news(G, 'Финляндия уступает Карельский перешеек', 'diplo'); } },
  ],
  ai: () => 0,
});
defEvent('moscow_peace', {
  title: 'Московский мир',
  text: 'СССР предлагает мир в обмен на Карельский перешеек.',
  opts: [
    { text: 'Подписать мир', eff: (G) => { for (let i = 0; i < NREG; i++) { const r = G.reg[i]; if (r.o === 'FIN' && r.c === 'SOV' && REG[i].sp !== 'karelia') r.c = 'FIN'; if (r.o === 'SOV' && r.c === 'FIN') r.c = 'SOV'; } cedeRegions(G, 'FIN', 'SOV', sp('karelia')); makePeace(G, 'SOV', 'FIN', 400); G.flags.kareliaCeded = 1; G._ctlDirty = true; news(G, 'Московский мирный договор: Зимняя война окончена', 'diplo'); } },
    { text: 'Сражаться до конца', eff: () => {} },
  ],
  ai: () => 0,
});
defEvent('vienna', {
  title: 'Венский арбитраж',
  text: 'Германия и Италия требуют передать Северную Трансильванию Венгрии, а Южную Добруджу — Болгарии.',
  opts: [
    { text: 'Подчиниться арбитражу', eff: (G) => { if (G.ctr.HUN.alive) cedeRegions(G, 'ROM', 'HUN', sp('ntrans')); if (G.ctr.BUL.alive) cedeRegions(G, 'ROM', 'BUL', sp('sdob')); bump(G.ctr.ROM, 'stab', -0.1); news(G, 'Венский арбитраж: Румыния теряет Северную Трансильванию', 'diplo'); } },
    { text: 'Отказаться', eff: (G) => { changeOpinion(G, 'ROM', 'GER', -40); } },
  ],
  ai: () => 0,
});
defEvent('indochina', {
  title: 'Японский ультиматум',
  text: 'Япония требует разместить войска во Французском Индокитае.',
  opts: [
    { text: 'Уступить', eff: (G) => { cedeRegions(G, 'FRA', 'JAP', adm('VNM', 'LAO', 'KHM')); addTension(G, 4, 'JAP'); news(G, 'Япония занимает Французский Индокитай', 'diplo'); } },
    { text: 'Отказать', eff: (G) => { scriptedWar(G, 'JAP', 'FRA'); } },
  ],
  ai: () => 0,
});

// ---- Spanish civil war ---------------------------------------------------------------------------
function spanishCivilWar(G) {
  const R = G.ctr.SPR, N = G.ctr.SPA;
  N.alive = true; N.capit = false;
  N.tech = { ...R.tech }; N.rs = R.rs;
  refreshTech(N);
  N.tpl = {};
  for (const k in R.tpl) N.tpl[k] = { name: R.tpl[k].name, bats: { ...R.tpl[k].bats }, sup: R.tpl[k].sup.slice(), icon: R.tpl[k].icon };
  recalcMods(G, N);
  for (const k in N.tpl) calcTemplate(N, N.tpl[k]);
  N.cap = regionAtLonLat(-3.7, 42.34);
  let n = 0;
  for (let i = 0; i < NREG; i++) {
    const r = G.reg[i];
    if (r.o === 'SPR' && REG[i].sp === 'nat') { r.o = 'SPA'; r.c = 'SPA'; if (r.core === 'SPR') r.core = 'SPA'; n++; }
  }
  if (G.reg[N.cap].o !== 'SPA') { for (let i = 0; i < NREG; i++) if (G.reg[i].o === 'SPA') { N.cap = i; break; } }
  for (const d of divsOf(G, 'SPR').slice()) {
    if (G.reg[d.r].o === 'SPA') { const r = d.r, t = d.t; removeDivision(G, d); spawnDivision(G, N, N.tpl[t] ? t : 'inf', r, { org: 0.7 }); }
  }
  for (let k = 0; k < 14; k++) spawnDivision(G, N, 'inf', N.cap, { org: 0.9 });
  spirit(G, N, 'africa', 'Африканская армия', { landAttack: 0.15, orgBonus: 0.1 }, 'Кадровые части из Марокко', G.day + 900);
  spirit(G, R, 'militia', 'Разрозненные колонны', { orgBonus: -0.1, landAttack: -0.05 }, 'Нет единого командования', G.day + 900);
  for (const k in R.stock) { N.stock[k] = Math.round((R.stock[k] || 0) * 0.5); R.stock[k] = Math.round((R.stock[k] || 0) * 0.5); }
  recalcNeeds(G, N); recalcNeeds(G, R);
  for (const k in N.need) N.fielded[k] = N.need[k] * 0.9;
  addEq(N, 'rifle', 4000); addEq(N, 'art', 200); addEq(N, 'fighter', 80);
  addEq(R, 'rifle', 2500); addEq(R, 'art', 100); addEq(R, 'fighter', 50);
  N.pp = 100; N.stab = 0.6; N.ws = 0.7; R.ws = 0.7;
  N.convoys = 20;
  G._ctlDirty = true; G._supDirty = true;
  buildIndex(G);
  changeOpinion(G, 'SPA', 'GER', 40); changeOpinion(G, 'SPA', 'ITA', 40); changeOpinion(G, 'SPR', 'SOV', 40);
  scriptedWarForce(G, 'SPA', 'SPR');
  addTension(G, 3);
  news(G, 'Гражданская война в Испании: армия генерала Франко поднимает мятеж', 'war', N.cap);
  inform(G, 'Гражданская война в Испании', 'Военные во главе с генералом Франко подняли мятеж против республики. Германия и Италия поддерживают националистов, СССР — республиканцев.');
}
function scriptedWarForce(G, a, b) {
  G.war[a < b ? a + '|' + b : b + '|' + a] = { start: G.day, att: a };
  G.ctr[a].rel[b] = -100; G.ctr[b].rel[a] = -100;
  warChanged(G);
}

/** one-shot dated events */
const DATED = [
  { id: 'scw', day: D(1936, 7, 17), cond: (G) => G.ctr.SPR.alive && !G.ctr.SPA.alive && !isAtWar(G, 'SPR'), run: spanishCivilWar },
  { id: 'vienna', day: D(1940, 8, 30), cond: (G) => G.ctr.GER.alive && G.ctr.ROM.alive && G.ctr.HUN.alive && !atWar(G, 'GER', 'ROM') && G.ctr.GER.fac === 'axis' && !G.ctr.ROM.fac,
    run: (G) => fireEvent(G, 'vienna', 'ROM') },
  { id: 'end', day: D(1949, 1, 1), cond: () => true,
    run: (G) => inform(G, '1949 год', 'Эпоха великих потрясений подходит к концу. Вы можете продолжать игру сколько угодно — мир теперь таков, каким вы его сделали.') },
];

export function eventsTick(G) {
  for (const ev of DATED) {
    if (G.flags['ev_' + ev.id] || G.day < ev.day) continue;
    if (G.day > ev.day + 400) { G.flags['ev_' + ev.id] = 1; continue; }
    if (!ev.cond(G)) continue;
    G.flags['ev_' + ev.id] = 1;
    ev.run(G);
  }
  // Winter war settlement (checked daily so that it comes before a total collapse)
  if (G.flags.winterWar && atWar(G, 'SOV', 'FIN') && !G.flags.moscow && G.ctr.FIN.alive && !G.ctr.FIN.capit && !G.ctr.FIN.fac) {
    let kar = 0, held = 0;
    for (let i = 0; i < NREG; i++) if (REG[i].sp === 'karelia') { kar++; if (G.reg[i].c === 'SOV') held++; }
    const days = G.day - G.flags.winterWar;
    if ((held === kar && days >= 20) || days >= 105 || vpLost(G, 'FIN').ratio > 0.25) { G.flags.moscow = 1; fireEvent(G, 'moscow_peace', 'FIN'); }
  }
  if (G.day % 7 !== 3) return;
  // Lend-lease
  const U = G.ctr.USA;
  if (U.alive && U.flags.lendlease) {
    for (const t of ['ENG', 'SOV', 'CHI', 'FRA']) {
      const c = G.ctr[t];
      if (!c.alive || c.capit || t === 'USA' || !isAtWar(G, t) || atWar(G, 'USA', t)) continue;
      if (!enemies(G, t).some((e) => ['GER', 'JAP', 'ITA'].includes(e))) continue;
      for (const k of ['rifle', 'art', 'sup', 'truck', 'fighter', 'mtank']) {
        const amt = Math.floor((U.stock[k] || 0) * 0.04);
        if (amt > 0) { U.stock[k] -= amt; c.stock[k] = (c.stock[k] || 0) + amt; }
      }
    }
  }
}

// ---- reactions -----------------------------------------------------------------------------------
hooks.war.push((G, a, b, att, def) => {
  // Chinese united front
  if (def.has('CHI') && (a === 'JAP' || att.has('JAP'))) {
    for (const t of ['PRC', 'SHX', 'GXC', 'YUN', 'XSM']) {
      const c = G.ctr[t];
      if (c.alive && !c.fac && !atWar(G, t, 'CHI') && t !== G.player) joinFaction(G, t, 'china');
    }
  }
  // the sleeping giant
  if (def.has('USA')) {
    const U = G.ctr.USA;
    removeSpirit(G, U, 'isolation'); removeSpirit(G, U, 'depression');
    U.flags.isolation = false;
    bump(U, 'ws', 0.35); bump(U, 'stab', 0.1);
    if (U.laws.eco < 3) U.laws.eco = 3;
    if (U.laws.con < 3) U.laws.con = 3;
    recalcMods(G, U);
  }
  if (a === 'GER' && b === 'SOV') {
    const F = G.ctr.FIN;
    if (F.alive && !F.fac && !F.capit && (G.flags.winterWar || G.flags.kareliaCeded) && F.tag !== G.player && G.factions.axis && !atWar(G, 'FIN', 'GER')) joinFaction(G, 'FIN', 'axis');
    spirit(G, G.ctr.SOV, 'surprise', 'Внезапное нападение', { orgBonus: -0.15, landDefense: -0.1 }, 'Армия застигнута врасплох.', G.day + 75);
  }
  const big = COUNTRIES[a].major && (COUNTRIES[b].major || def.size > 2);
  if (G.player && (big || a === G.player || def.has(G.player) || att.has(G.player))) {
    inform(G, 'Война!', `${cn(G, a)} объявляет войну: ${cn(G, b)}.${def.size > 1 ? ' В войну на стороне обороняющихся вступают: ' + Array.from(def).filter((x) => x !== b).map((x) => cn(G, x)).slice(0, 8).join(', ') + '.' : ''}`);
  }
});
hooks.capitulate.push((G, tag, main) => {
  if (tag === 'POL' && G.flags.mr && G.ctr.SOV.alive && !isAtWar(G, 'SOV')) {
    const n = cedeRegions(G, 'POL', 'SOV', sp('east'));
    if (n) news(G, 'Красная армия занимает восточные области Польши', 'diplo');
  }
  if (G.player && (COUNTRIES[tag].major || tag === G.player || atWar(G, G.player, tag) || main === G.player)) {
    inform(G, 'Капитуляция', `${cn(G, tag)} капитулирует. Победитель — ${cn(G, main)}.`);
  }
});
hooks.peace.push((G, loser, main) => {
  if ((loser === 'SPR' && main === 'SPA') || (loser === 'SPA' && main === 'SPR')) {
    for (let i = 0; i < NREG; i++) if (G.reg[i].core === loser) G.reg[i].core = main;
    if (main === 'SPA') G.ctr.SPA.name = 'Испания';
    news(G, 'Гражданская война в Испании окончена', 'diplo', G.ctr[main].cap);
  }
  if (G.player && COUNTRIES[loser].major) {
    const mine = main === G.player || (G.ctr[G.player].fac && G.ctr[G.player].fac === G.ctr[main].fac);
    inform(G, mine ? 'Победа!' : 'Передел мира', `${cn(G, loser)} окончательно повержена. ${mine ? 'Это великая победа нашего оружия!' : 'Победитель — ' + cn(G, main) + '.'}`);
  }
});
