// National focus trees. A focus: { id, name, desc, days, req[], excl[], cond(G,c), condText, eff(G,c), ai:[y,m,d] earliest AI date, w AI weight, br branch }
import { REG, NREG } from '../core/world.js';
import { D, addFactories, addBuilding, spirit, removeSpirit, rbonus, grantTech, addEq, addDivs, bump, fireEvent, scriptedWar, invite, ensureAxis, changeOpinion, addTension, news, cn, joinFaction } from '../core/script.js';
import { atWar, isAtWar, guarantee, signNAP, cedeRegions, annexCountry } from '../core/diplo.js';
import { recalcMods } from '../core/mods.js';
import { isAtWar as warNow } from '../core/diplo.js';

export const BRANCH = { pol: 'Политика', ind: 'Промышленность', mil: 'Армия', air: 'Авиация', nav: 'Флот', exp: 'Экспансия', dip: 'Дипломатия', war: 'Война' };

const alive = (G, t) => G.ctr[t] && G.ctr[t].alive && !G.ctr[t].capit;
function F(id, name, br, desc, o = {}) { return { id, name, br, desc, days: 70, req: [], ...o }; }

// ---------------------------------------------------------------------------------------------------
const GER = [
  F('ger_rhine', 'Ремилитаризация Рейнской области', 'pol', 'Ввести войска в демилитаризованную зону. +поддержка войны, +стабильность.', { ai: [1936, 1, 1], days: 35,
    eff: (G, c) => { bump(c, 'ws', 0.05); bump(c, 'stab', 0.05); bump(c, 'pp', 40); addTension(G, 4, 'GER'); } }),
  F('ger_4year', 'Четырёхлетний план', 'ind', '+4 гражданских завода, ускорение промышленных исследований.', { req: ['ger_rhine'], eff: (G, c) => { addFactories(G, c, 'civ', 4); rbonus(c, 'ind', 0.5, 2); } }),
  F('ger_autarky', 'Автаркия', 'ind', 'Синтетическое топливо: технология и 2 завода, +10% добыча ресурсов.', { req: ['ger_4year'],
    eff: (G, c) => { grantTech(G, c, 'syn1'); addFactories(G, c, 'syn', 2); spirit(G, c, 'autarky', 'Автаркия', { resOutput: 0.1 }, '+10% добыча ресурсов'); } }),
  F('ger_wehr', 'Создание вермахта', 'mil', '+3 военных завода, массовый призыв, ускорение исследований пехоты.', { req: ['ger_rhine'],
    eff: (G, c) => { addFactories(G, c, 'mil', 3); if (c.laws.con < 3) c.laws.con = 3; spirit(G, c, 'wehr', 'Кадровая армия', { orgBonus: 0.1, landAttack: 0.08, landDefense: 0.05 }, '+10% организация, +8% атака, +5% оборона'); rbonus(c, 'inf', 0.5, 2); rbonus(c, 'art', 0.5, 1); } }),
  F('ger_panzer', 'Танковые войска', 'mil', 'Ускорение исследований бронетехники, 2 новые танковые дивизии.', { req: ['ger_wehr'], eff: (G, c) => { rbonus(c, 'arm', 0.75, 2); addDivs(G, c, 'ltk', 3); spirit(G, c, 'panzer', 'Танковые клинья', { tankAttack: 0.15, breakBonus: 0.1 }, '+15% атака танков, +10% прорыв'); } }),
  F('ger_luft', 'Люфтваффе', 'air', '+2 военных завода, 200 истребителей, ускорение авиационных исследований.', { req: ['ger_wehr'], eff: (G, c) => { addFactories(G, c, 'mil', 2); addEq(c, 'fighter', 200); addEq(c, 'cas', 80); rbonus(c, 'air', 0.5, 2); } }),
  F('ger_kriegs', 'Кригсмарине', 'nav', '+3 верфи, ускорение морских исследований.', { req: ['ger_wehr'], eff: (G, c) => { addFactories(G, c, 'dock', 3); rbonus(c, 'nav', 0.5, 2); } }),
  F('ger_westwall', 'Западный вал', 'mil', 'Укрепления на границе с Францией.', { req: ['ger_wehr'], w: 0.5, eff: (G, c) => { addBuilding(G, c, 'fort', 3, [7.0, 49.3]); addBuilding(G, c, 'fort', 3, [8.5, 48.6]); } }),
  F('ger_axis', 'Ось Берлин — Рим', 'dip', 'Создать альянс «Ось» и сблизиться с Италией.', { req: ['ger_rhine'], ai: [1936, 8, 20],
    eff: (G, c) => { ensureAxis(G); changeOpinion(G, 'GER', 'ITA', 40); bump(c, 'pp', 30); } }),
  F('ger_anticom', 'Антикоминтерновский пакт', 'dip', 'Сближение с Японией против Коминтерна.', { req: ['ger_axis'], ai: [1936, 10, 1], days: 35,
    eff: (G, c) => { changeOpinion(G, 'GER', 'JAP', 40); changeOpinion(G, 'GER', 'SOV', -20); bump(c, 'pp', 50); } }),
  F('ger_anschluss', 'Аншлюс Австрии', 'exp', 'Потребовать присоединения Австрии.', { req: ['ger_axis'], ai: [1938, 1, 2], cond: (G) => G.ctr.AUS.alive && !atWar(G, 'GER', 'AUS'), condText: 'Австрия существует',
    eff: (G) => fireEvent(G, 'anschluss', 'AUS') }),
  F('ger_sudeten', 'Судетский кризис', 'exp', 'Потребовать у Чехословакии Судетскую область.', { req: ['ger_anschluss'], ai: [1938, 7, 20], cond: (G) => G.ctr.CZE.alive && !atWar(G, 'GER', 'CZE'), condText: 'Чехословакия существует',
    eff: (G) => fireEvent(G, 'munich', 'CZE') }),
  F('ger_czech', 'Конец Чехословакии', 'exp', 'Оккупировать остаток Чехословакии; Закарпатье отойдёт Венгрии.', { req: ['ger_sudeten'], ai: [1939, 1, 5], cond: (G) => G.ctr.CZE.alive && G.flags.munich && !atWar(G, 'GER', 'CZE'), condText: 'Мюнхенское соглашение заключено',
    eff: (G) => { if (G.ctr.HUN.alive) cedeRegions(G, 'CZE', 'HUN', (i) => REG[i].sp === 'ruthenia'); annexCountry(G, 'CZE', 'GER'); news(G, 'Германия оккупирует Чехословакию', 'diplo'); } }),
  F('ger_memel', 'Мемельский ультиматум', 'exp', 'Потребовать у Литвы Мемель.', { req: ['ger_czech'], ai: [1939, 2, 15], days: 35, cond: (G) => G.ctr.LIT.alive, condText: 'Литва существует', eff: (G) => fireEvent(G, 'memel', 'LIT') }),
  F('ger_mr', 'Пакт с Советским Союзом', 'dip', 'Предложить СССР договор о ненападении и раздел сфер влияния.', { prep: ['POL'],  req: ['ger_sudeten'], ai: [1939, 6, 14], cond: (G) => G.ctr.SOV.alive && !atWar(G, 'GER', 'SOV'), condText: 'Мир с СССР',
    eff: (G) => fireEvent(G, 'mrpact', 'SOV') }),
  F('ger_danzig', 'Данциг или война', 'exp', 'Предъявить Польше ультиматум. Отказ означает войну.', { prep: ['POL'],  req: ['ger_czech'], ai: [1939, 8, 23], days: 9, cond: (G) => G.ctr.POL.alive && !atWar(G, 'GER', 'POL'), condText: 'Польша существует',
    eff: (G, c) => { spirit(G, c, 'blitz', 'Блицкриг', { landAttack: 0.1, speedBonus: 0.1 }, '+10% атака и скорость', G.day + 75); fireEvent(G, 'danzig', 'POL'); } }),
  F('ger_weser', 'Удар на севере', 'war', 'Цели войны против Дании и Норвегии.', { prep: ['DEN'],  req: ['ger_danzig'], ai: [1940, 1, 30], cond: (G) => isAtWar(G, 'GER'), condText: 'Германия воюет',
    eff: (G) => { scriptedWar(G, 'GER', 'DEN'); scriptedWar(G, 'GER', 'NOR'); } }),
  F('ger_gelb', 'Удар на западе', 'war', 'Цели войны против Нидерландов, Бельгии и Люксембурга — в обход линии Мажино.', { prep: ['HOL', 'BEL', 'LUX'],  req: ['ger_danzig'], ai: [1940, 4, 9], days: 31, cond: (G) => isAtWar(G, 'GER'), condText: 'Германия воюет',
    eff: (G, c) => { scriptedWar(G, 'GER', 'HOL'); scriptedWar(G, 'GER', 'BEL'); scriptedWar(G, 'GER', 'LUX'); spirit(G, c, 'blitz', 'Блицкриг', { landAttack: 0.15, speedBonus: 0.15, breakBonus: 0.15 }, '+15% атака, прорыв и скорость', G.day + 150); } }),
  F('ger_tripartite', 'Тройственный пакт', 'dip', 'Пригласить в Ось Японию, Венгрию, Румынию и Болгарию.', { req: ['ger_axis'], ai: [1940, 7, 19], cond: (G) => isAtWar(G, 'GER'), condText: 'Германия воюет',
    eff: (G) => { const ax = ensureAxis(G); for (const t of ['JAP', 'HUN', 'ROM', 'BUL']) if (alive(G, t) && !atWar(G, 'GER', t) && (!G.ctr[t].fac || t === 'JAP')) invite(G, t, ax); } }),
  F('ger_balkan', 'Балканская кампания', 'war', 'Цели войны против Югославии и Греции.', { prep: ['YUG', 'GRE'],  req: ['ger_tripartite'], ai: [1941, 1, 26], cond: (G) => isAtWar(G, 'GER'), condText: 'Германия воюет',
    eff: (G) => { scriptedWar(G, 'GER', 'YUG'); scriptedWar(G, 'GER', 'GRE'); } }),
  F('ger_barb', 'План «Барбаросса»', 'war', 'Нападение на Советский Союз в нарушение пакта.', { prep: ['SOV'],  req: ['ger_tripartite'], ai: [1941, 4, 13], cond: (G) => G.ctr.SOV.alive && !atWar(G, 'GER', 'SOV'), condText: 'Мир с СССР',
    eff: (G, c) => { spirit(G, c, 'barb', 'Внезапный удар', { landAttack: 0.1, breakBonus: 0.1 }, '+10% атака и прорыв', G.day + 100); scriptedWar(G, 'GER', 'SOV'); } }),
  F('ger_total', 'Тотальная война', 'war', '+15% выпуск заводов, +2% призывного населения.', { req: ['ger_barb'], ai: [1942, 12, 1], cond: (G) => isAtWar(G, 'GER'), condText: 'Германия воюет',
    eff: (G, c) => spirit(G, c, 'total', 'Тотальная война', { factoryOutput: 0.15, recruitable: 0.02, warSupport: 0.1 }, '+15% выпуск, +2% призыв') }),
  F('ger_wunder', 'Оружие возмездия', 'air', 'Ускорение исследований электроники и авиации.', { req: ['ger_total'], eff: (G, c) => { rbonus(c, 'ele', 1, 2); rbonus(c, 'air', 1, 1); } }),
];

const SOV = [
  F('sov_plan', 'Вторая пятилетка', 'ind', '+4 гражданских завода.', { eff: (G, c) => addFactories(G, c, 'civ', 4) }),
  F('sov_heavy', 'Тяжёлая индустрия', 'ind', '+3 военных завода, ускорение промышленных исследований.', { req: ['sov_plan'], eff: (G, c) => { addFactories(G, c, 'mil', 3); rbonus(c, 'ind', 0.5, 2); } }),
  F('sov_ural', 'Урало-Кузнецкий комбинат', 'ind', '+2 гражданских и +2 военных завода на Урале.', { req: ['sov_heavy'], eff: (G, c) => { addFactories(G, c, 'civ', 2, [60.6, 56.8]); addFactories(G, c, 'mil', 2, [59, 53.4]); } }),
  F('sov_third', 'Третья пятилетка', 'ind', '+3 гражданских, +3 военных завода.', { req: ['sov_ural'], eff: (G, c) => { addFactories(G, c, 'civ', 3); addFactories(G, c, 'mil', 3); } }),
  F('sov_purge', 'Большая чистка', 'pol', '+стабильность и политвласть, но армия надолго ослаблена (−15% организация, −10% атака до середины 1941 г.).', { ai: [1937, 3, 1],
    eff: (G, c) => { bump(c, 'stab', 0.12); bump(c, 'pp', 120); spirit(G, c, 'purge', 'Последствия чистки', { orgBonus: -0.15, landAttack: -0.1 }, 'Командный состав обескровлен', D(1941, 9, 1)); } }),
  F('sov_reform', 'Реформа РККА', 'mil', 'Снять последствия чистки, ускорить исследования доктрин.', { req: ['sov_purge'], ai: [1940, 4, 1], eff: (G, c) => { removeSpirit(G, c, 'purge'); rbonus(c, 'doc', 0.75, 2); } }),
  F('sov_tank', 'Танковая промышленность', 'mil', '+2 военных завода, ускорение исследований бронетехники.', { req: ['sov_heavy'], eff: (G, c) => { addFactories(G, c, 'mil', 2); rbonus(c, 'arm', 0.75, 2); } }),
  F('sov_air', 'Сталинские соколы', 'air', '300 истребителей, ускорение авиационных исследований.', { req: ['sov_heavy'], eff: (G, c) => { addEq(c, 'fighter', 300); rbonus(c, 'air', 0.5, 2); } }),
  F('sov_fleet', 'Большой флот', 'nav', '+3 верфи.', { req: ['sov_heavy'], w: 0.4, eff: (G, c) => addFactories(G, c, 'dock', 3) }),
  F('sov_fin', 'Требования к Финляндии', 'exp', 'Потребовать Карельский перешеек.', { prep: ['FIN'],  ai: [1939, 9, 21], cond: (G) => G.flags.mr && G.ctr.FIN.alive && !atWar(G, 'SOV', 'FIN'), condText: 'Пакт с Германией подписан',
    eff: (G) => fireEvent(G, 'karelia', 'FIN') }),
  F('sov_baltic', 'Прибалтийский ультиматум', 'exp', 'Потребовать присоединения Эстонии, Латвии и Литвы.', { ai: [1940, 4, 5], cond: (G) => !!G.flags.mr, condText: 'Пакт с Германией подписан',
    eff: (G) => { for (const t of ['EST', 'LAT', 'LIT']) if (alive(G, t) && !G.ctr[t].fac) fireEvent(G, 'baltic', t); } }),
  F('sov_bess', 'Бессарабский вопрос', 'exp', 'Потребовать у Румынии Бессарабию.', { req: ['sov_baltic'], ai: [1940, 6, 15], days: 35, cond: (G) => G.ctr.ROM.alive && !atWar(G, 'SOV', 'ROM') && !G.ctr.ROM.fac, condText: 'Румыния вне альянсов',
    eff: (G) => fireEvent(G, 'bessarabia', 'ROM') }),
  F('sov_japan', 'Пакт о нейтралитете с Японией', 'dip', 'Обезопасить дальневосточные рубежи.', { ai: [1941, 2, 1], days: 35, cond: (G) => G.ctr.JAP.alive && !atWar(G, 'SOV', 'JAP'), condText: 'Мир с Японией',
    eff: (G) => { signNAP(G, 'SOV', 'JAP'); news(G, 'СССР и Япония подписали пакт о нейтралитете', 'diplo'); } }),
  F('sov_patriotic', 'Великая Отечественная война', 'war', '+5% призывного населения, +поддержка войны, +10% оборона, 15 дивизий ополчения.', { cond: (G) => atWar(G, 'SOV', 'GER'), condText: 'Война с Германией', days: 35, ai: [1941, 1, 1], w: 9,
    eff: (G, c) => { spirit(G, c, 'patriotic', 'Отечественная война', { recruitable: 0.05, warSupport: 0.25, landDefense: 0.1 }, 'Всё для фронта, всё для победы'); addDivs(G, c, 'mil', 15); if (c.laws.eco < 3) c.laws.eco = 3; if (c.laws.con < 4) c.laws.con = 4; recalcMods(G, c); } }),
  F('sov_evac', 'Эвакуация промышленности', 'war', '+6 военных заводов на Урале.', { req: ['sov_patriotic'], w: 8, eff: (G, c) => { addFactories(G, c, 'mil', 6, [60.6, 56.8]); } }),
  F('sov_guards', 'Гвардия', 'war', '+10% атака, +5% организация.', { req: ['sov_evac'], eff: (G, c) => spirit(G, c, 'guards', 'Гвардейские части', { landAttack: 0.1, orgBonus: 0.05 }, '+10% атака') }),
];

const ENG = [
  F('eng_appease', 'Политика умиротворения', 'pol', '+стабильность, +политвласть.', { ai: [1936, 1, 1], days: 35, eff: (G, c) => { bump(c, 'stab', 0.08); bump(c, 'pp', 80); } }),
  F('eng_rearm', 'Программа перевооружения', 'mil', '+2 военных завода.', { ai: [1936, 6, 1], eff: (G, c) => { addFactories(G, c, 'mil', 2); rbonus(c, 'inf', 0.5, 1); } }),
  F('eng_shadow', 'Теневые заводы', 'ind', '+3 военных завода.', { req: ['eng_rearm'], eff: (G, c) => addFactories(G, c, 'mil', 3) }),
  F('eng_civ', 'Промышленность метрополии', 'ind', '+3 гражданских завода.', { eff: (G, c) => addFactories(G, c, 'civ', 3) }),
  F('eng_radar', 'Радарная сеть', 'air', 'Технология радиолокации, ПВО Лондона.', { req: ['eng_rearm'], eff: (G, c) => { grantTech(G, c, 'radar1'); addBuilding(G, c, 'aa', 2, [-0.12, 51.5]); rbonus(c, 'ele', 0.5, 1); } }),
  F('eng_raf', 'Истребительное командование', 'air', '250 истребителей, ускорение авиационных исследований.', { req: ['eng_rearm'], eff: (G, c) => { addEq(c, 'fighter', 250); rbonus(c, 'air', 0.5, 2); } }),
  F('eng_navy', 'Владычица морей', 'nav', '+3 верфи, ускорение морских исследований.', { eff: (G, c) => { addFactories(G, c, 'dock', 3); rbonus(c, 'nav', 0.5, 2); } }),
  F('eng_guar', 'Гарантии Польше', 'dip', 'Гарантировать независимость Польши, Румынии и Греции.', { ai: [1939, 1, 20], days: 35, cond: (G) => G.tension >= 15, condText: 'Напряжённость ≥15%',
    eff: (G) => { for (const t of ['POL', 'ROM', 'GRE']) if (alive(G, t)) guarantee(G, 'ENG', t); news(G, 'Великобритания гарантирует независимость Польши', 'diplo'); } }),
  F('eng_cabinet', 'Военный кабинет', 'war', '+поддержка войны, +стабильность. Правительство возглавляет Черчилль.', { cond: (G) => isAtWar(G, 'ENG'), condText: 'Идёт война', days: 35, w: 9,
    eff: (G, c) => { bump(c, 'ws', 0.2); bump(c, 'stab', 0.1); c.lead = 'Уинстон Черчилль'; spirit(G, c, 'blood', 'Кровь, пот и слёзы', { warSupport: 0.15, factoryOutput: 0.05 }, 'Мы никогда не сдадимся'); } }),
  F('eng_empire', 'Мобилизация империи', 'war', '+2% призывного населения, 8 дивизий.', { req: ['eng_cabinet'], w: 8, eff: (G, c) => { spirit(G, c, 'empire', 'Силы империи', { recruitable: 0.02 }, '+2% призыв'); addDivs(G, c, 'inf', 8); } }),
  F('eng_bomber', 'Бомбардировочное командование', 'air', '150 стратегических бомбардировщиков.', { req: ['eng_cabinet'], eff: (G, c) => { addEq(c, 'strat', 150); rbonus(c, 'air', 0.5, 1); } }),
];

const FRA = [
  F('fra_front', 'Народный фронт', 'pol', '+стабильность, +политвласть.', { ai: [1936, 4, 1], days: 35, eff: (G, c) => { bump(c, 'stab', 0.1); bump(c, 'pp', 60); c.lead = 'Леон Блюм'; } }),
  F('fra_ind', 'Модернизация промышленности', 'ind', '+3 гражданских завода.', { eff: (G, c) => addFactories(G, c, 'civ', 3) }),
  F('fra_rearm', 'Перевооружение', 'mil', '+3 военных завода.', { ai: [1936, 9, 1], eff: (G, c) => { addFactories(G, c, 'mil', 3); rbonus(c, 'art', 0.5, 1); } }),
  F('fra_maginot', 'Продление линии Мажино', 'mil', 'Укрепления на бельгийской границе.', { req: ['fra_rearm'], eff: (G, c) => { addBuilding(G, c, 'fort', 2, [3.06, 50.63]); addBuilding(G, c, 'fort', 3, [5.5, 49.5]); } }),
  F('fra_air', 'Военно-воздушные силы', 'air', '200 истребителей.', { req: ['fra_rearm'], eff: (G, c) => { addEq(c, 'fighter', 200); rbonus(c, 'air', 0.5, 1); } }),
  F('fra_tank', 'Бронетанковые дивизии', 'mil', 'Реформа армии: снимает «Армию прошлой войны», ускоряет исследования бронетехники, +танковая дивизия.', { req: ['fra_rearm'], aiCond: (G) => G.day > 2000, eff: (G, c) => { rbonus(c, 'arm', 0.5, 2); addDivs(G, c, 'ltk', 1); removeSpirit(G, c, 'oldguard'); } }),
  F('fra_guar', 'Гарантии Польше', 'dip', 'Гарантировать независимость Польши.', { ai: [1939, 2, 1], days: 35, cond: (G) => G.tension >= 15, condText: 'Напряжённость ≥15%', eff: (G) => { if (alive(G, 'POL')) guarantee(G, 'FRA', 'POL'); } }),
  F('fra_union', 'Священный союз', 'war', '+поддержка войны, +стабильность.', { cond: (G) => isAtWar(G, 'FRA'), condText: 'Идёт война', days: 35, w: 9, eff: (G, c) => { bump(c, 'ws', 0.2); bump(c, 'stab', 0.15); } }),
  F('fra_colonial', 'Колониальные войска', 'war', '8 пехотных дивизий.', { req: ['fra_union'], w: 8, eff: (G, c) => addDivs(G, c, 'inf', 8) }),
];

const ITA = [
  F('ita_ind', 'Институт реконструкции', 'ind', '+3 гражданских завода.', { eff: (G, c) => addFactories(G, c, 'civ', 3) }),
  F('ita_arms', 'Военные заказы', 'mil', '+2 военных завода.', { eff: (G, c) => { addFactories(G, c, 'mil', 2); rbonus(c, 'inf', 0.5, 1); } }),
  F('ita_navy', 'Наше море', 'nav', '+3 верфи, ускорение морских исследований.', { eff: (G, c) => { addFactories(G, c, 'dock', 3); rbonus(c, 'nav', 0.5, 2); } }),
  F('ita_air', 'Королевская авиация', 'air', '150 истребителей.', { req: ['ita_arms'], eff: (G, c) => { addEq(c, 'fighter', 150); rbonus(c, 'air', 0.5, 1); } }),
  F('ita_empire', 'Провозглашение империи', 'pol', '+поддержка войны, +политвласть.', { cond: (G) => !G.ctr.ETH.alive, condText: 'Эфиопия покорена', days: 35, w: 5, eff: (G, c) => { bump(c, 'ws', 0.1); bump(c, 'pp', 100); } }),
  F('ita_steel', 'Стальной пакт', 'dip', 'Сближение с Германией.', { ai: [1939, 3, 10], cond: (G) => !!G.factions.axis && alive(G, 'GER'), condText: 'Существует Ось', eff: (G) => { changeOpinion(G, 'ITA', 'GER', 40); } }),
  F('ita_albania', 'Ультиматум Албании', 'exp', 'Потребовать протектората над Албанией.', { ai: [1939, 1, 25], cond: (G) => G.ctr.ALB.alive, condText: 'Албания существует', eff: (G) => fireEvent(G, 'albania', 'ALB') }),
  F('ita_war', 'Вступление в войну', 'war', 'Вступить в Ось и в войну на стороне Германии.', { req: ['ita_steel'], ai: [1940, 4, 1], cond: (G) => !!G.factions.axis && isAtWar(G, 'GER') && !atWar(G, 'ITA', 'GER'), condText: 'Германия воюет',
    eff: (G, c) => { if (c.tag === G.player) joinFaction(G, 'ITA', 'axis'); else joinFaction(G, 'ITA', 'axis'); } }),
  F('ita_greece', 'Вторжение в Грецию', 'exp', 'Цель войны против Греции.', { prep: ['GRE'],  req: ['ita_war'], ai: [1940, 8, 19], cond: (G) => G.ctr.GRE.alive && !atWar(G, 'ITA', 'GRE'), condText: 'Греция существует', eff: (G) => scriptedWar(G, 'ITA', 'GRE') }),
];

const JAP = [
  F('jap_zaibatsu', 'Поддержка дзайбацу', 'ind', '+3 гражданских завода.', { eff: (G, c) => addFactories(G, c, 'civ', 3) }),
  F('jap_army', 'Императорская армия', 'mil', '+2 военных завода, ускорение исследований пехоты.', { eff: (G, c) => { addFactories(G, c, 'mil', 2); rbonus(c, 'inf', 0.5, 2); } }),
  F('jap_navy', 'Императорский флот', 'nav', '+3 верфи, ускорение морских исследований.', { eff: (G, c) => { addFactories(G, c, 'dock', 3); rbonus(c, 'nav', 0.5, 2); } }),
  F('jap_air', 'Морская авиация', 'air', '150 морских бомбардировщиков, 100 истребителей.', { req: ['jap_navy'], eff: (G, c) => { addEq(c, 'nav', 150); addEq(c, 'fighter', 100); rbonus(c, 'air', 0.5, 1); } }),
  F('jap_china', 'Инцидент на мосту Марко Поло', 'exp', 'Начать войну с Китаем.', { prep: ['CHI', 'SHX'],  ai: [1937, 4, 28], cond: (G) => G.ctr.CHI.alive && !atWar(G, 'JAP', 'CHI'), condText: 'Мир с Китаем', eff: (G) => scriptedWar(G, 'JAP', 'CHI') }),
  F('jap_mobil', 'Закон о всеобщей мобилизации', 'war', '+2 военных завода, военная экономика.', { req: ['jap_china'], w: 6, eff: (G, c) => { addFactories(G, c, 'mil', 2); if (c.laws.eco < 3) c.laws.eco = 3; if (c.laws.con < 3) c.laws.con = 3; recalcMods(G, c); } }),
  F('jap_neutral', 'Пакт о нейтралитете с СССР', 'dip', 'Обезопасить северный фланг.', { ai: [1941, 2, 1], days: 35, cond: (G) => G.ctr.SOV.alive && !atWar(G, 'SOV', 'JAP'), condText: 'Мир с СССР', eff: (G) => { signNAP(G, 'SOV', 'JAP'); } }),
  F('jap_indochina', 'Продвижение в Индокитай', 'exp', 'Потребовать у Франции Индокитай.', { ai: [1940, 7, 14], cond: (G) => G.ctr.FRA.alive && G.ctr.FRA.capit && !atWar(G, 'JAP', 'FRA'), condText: 'Франция капитулировала', eff: (G) => fireEvent(G, 'indochina', 'FRA') }),
  F('jap_south', 'Удар на юг', 'war', 'Война против США, Великобритании и Нидерландов. Внезапный удар по Пёрл-Харбору.', { ai: [1941, 9, 28], cond: (G) => G.ctr.USA.alive && !atWar(G, 'JAP', 'USA'), condText: 'Мир с США',
    eff: (G, c) => {
      spirit(G, c, 'banzai', 'Стремительное наступление', { landAttack: 0.1, amphib: 0.3, navalAttack: 0.1 }, '+10% атака, успешные десанты', G.day + 180);
      scriptedWar(G, 'JAP', 'USA'); scriptedWar(G, 'JAP', 'ENG'); scriptedWar(G, 'JAP', 'HOL');
      if (c.tag !== G.player || atWar(G, 'JAP', 'USA')) {
        for (const f of G.fleets) if (f.o === 'USA' && REG[f.port].name === 'Гавайи') { f.ships.bb = Math.floor((f.ships.bb || 0) * 0.5); f.ships.cl = Math.floor((f.ships.cl || 0) * 0.8); }
        news(G, 'Японская авиация атаковала Пёрл-Харбор', 'war');
      }
    } }),
  F('jap_sphere', 'Сфера сопроцветания', 'dip', '+политвласть, +10% добыча ресурсов.', { req: ['jap_south'], eff: (G, c) => { bump(c, 'pp', 100); spirit(G, c, 'sphere', 'Сфера сопроцветания', { resOutput: 0.1 }, '+10% ресурсы'); } }),
];

const USA = [
  F('usa_newdeal', 'Новый курс', 'ind', '+5 гражданских заводов.', { ai: [1936, 1, 1], eff: (G, c) => addFactories(G, c, 'civ', 5) }),
  F('usa_wpa', 'Общественные работы', 'ind', '+4 гражданских завода, конец Великой депрессии.', { req: ['usa_newdeal'], eff: (G, c) => { addFactories(G, c, 'civ', 4); removeSpirit(G, c, 'depression'); } }),
  F('usa_neutral', 'Акты о нейтралитете', 'pol', '+политвласть, +стабильность.', { days: 35, eff: (G, c) => { bump(c, 'pp', 100); bump(c, 'stab', 0.05); } }),
  F('usa_prepared', 'Готовность к обороне', 'mil', '+4 военных завода, добровольческая армия.', { ai: [1939, 9, 5], cond: (G) => G.tension >= 25, condText: 'Напряжённость ≥25%', eff: (G, c) => { addFactories(G, c, 'mil', 4); if (c.laws.con < 1) c.laws.con = 1; recalcMods(G, c); } }),
  F('usa_twoocean', 'Флот двух океанов', 'nav', '+6 верфей, ускорение морских исследований.', { req: ['usa_prepared'], ai: [1940, 5, 1], eff: (G, c) => { addFactories(G, c, 'dock', 6); rbonus(c, 'nav', 0.5, 2); } }),
  F('usa_draft', 'Закон о воинской повинности', 'mil', 'Ограниченный призыв, 8 пехотных дивизий.', { req: ['usa_prepared'], ai: [1940, 7, 10], eff: (G, c) => { if (c.laws.con < 2) c.laws.con = 2; recalcMods(G, c); addDivs(G, c, 'inf', 8); } }),
  F('usa_arsenal', 'Арсенал демократии', 'dip', 'Ленд-лиз союзникам, +5 военных заводов, частичная мобилизация.', { req: ['usa_prepared'], ai: [1940, 10, 1], cond: (G) => isAtWar(G, 'ENG') || isAtWar(G, 'SOV') || isAtWar(G, 'USA'), condText: 'Союзники воюют',
    eff: (G, c) => { c.flags.lendlease = 1; addFactories(G, c, 'mil', 5); if (c.laws.eco < 2) c.laws.eco = 2; removeSpirit(G, c, 'depression'); recalcMods(G, c); news(G, 'США начинают поставки по ленд-лизу', 'diplo'); } }),
  F('usa_embargo', 'Нефтяное эмбарго', 'dip', 'Прекратить поставки нефти Японии.', { req: ['usa_arsenal'], ai: [1941, 5, 20], days: 35, cond: (G) => G.ctr.JAP.alive && isAtWar(G, 'JAP'), condText: 'Япония воюет',
    eff: (G) => { changeOpinion(G, 'USA', 'JAP', -70); spirit(G, G.ctr.JAP, 'embargo', 'Нефтяное эмбарго', { factoryOutput: -0.08 }, 'США прекратили поставки нефти'); news(G, 'США вводят нефтяное эмбарго против Японии', 'diplo'); } }),
  F('usa_giant', 'Пробуждение гиганта', 'war', '+10 военных заводов, +5 верфей, +3% призыва.', { cond: (G) => isAtWar(G, 'USA'), condText: 'США воюют', days: 35, w: 9,
    eff: (G, c) => { addFactories(G, c, 'mil', 10); addFactories(G, c, 'dock', 5); spirit(G, c, 'giant', 'Военная промышленность', { factoryOutput: 0.1, recruitable: 0.03 }, '+10% выпуск'); addDivs(G, c, 'inf', 10); } }),
  F('usa_manhattan', 'Манхэттенский проект', 'war', 'Атомные исследования втрое быстрее.', { req: ['usa_giant'], ai: [1942, 6, 1], eff: (G, c) => { grantTech(G, c, 'atom1'); rbonus(c, 'ele', 1.5, 3); } }),
  F('usa_air', 'Воздушная мощь', 'air', '300 истребителей, 150 стратегических бомбардировщиков.', { req: ['usa_giant'], eff: (G, c) => { addEq(c, 'fighter', 300); addEq(c, 'strat', 150); rbonus(c, 'air', 0.5, 2); } }),
];

// ---- generic tree for every other country ---------------------------------------------------------
const facFor = (G, c) => {
  for (const id in G.factions) { const L = G.ctr[G.factions[id].leader]; if (L && L.alive && !L.capit && L.ideo === c.ideo && id !== c.fac) return id; }
  return null;
};
const GEN = [
  F('gen_ind1', 'Развитие промышленности', 'ind', '+2 гражданских завода.', { eff: (G, c) => addFactories(G, c, 'civ', 2) }),
  F('gen_ind2', 'Индустриализация', 'ind', '+2 гражданских и +1 военный завод.', { req: ['gen_ind1'], eff: (G, c) => { addFactories(G, c, 'civ', 2); addFactories(G, c, 'mil', 1); } }),
  F('gen_ind3', 'Военные заказы', 'ind', '+2 военных завода.', { req: ['gen_ind2'], eff: (G, c) => addFactories(G, c, 'mil', 2) }),
  F('gen_infra', 'Дороги и мосты', 'ind', 'Инфраструктура столицы, +10% скорость строительства.', { eff: (G, c) => { if (c.cap >= 0) G.reg[c.cap].infra = Math.min(5, G.reg[c.cap].infra + 1); spirit(G, c, 'roads', 'Дорожная сеть', { buildSpeed: 0.1 }, '+10% строительство'); } }),
  F('gen_res', 'Геологоразведка', 'ind', '+15% добыча ресурсов.', { req: ['gen_infra'], eff: (G, c) => spirit(G, c, 'geo', 'Геологоразведка', { resOutput: 0.15 }, '+15% ресурсы') }),
  F('gen_sci', 'Университеты', 'ind', '+1 ячейка исследований.', { req: ['gen_ind2'], cond: (G, c) => c.rs < 4, condText: 'Меньше 4 ячеек', eff: (G, c) => { c.rs = Math.min(4, c.rs + 1); } }),
  F('gen_army1', 'Реформа армии', 'mil', '2 дивизии, ускорение исследований пехоты и артиллерии.', { eff: (G, c) => { addDivs(G, c, 'inf', 2); rbonus(c, 'inf', 0.5, 1); rbonus(c, 'art', 0.5, 1); } }),
  F('gen_army2', 'Военная доктрина', 'mil', '+5% организация, ускорение исследований доктрин.', { req: ['gen_army1'], eff: (G, c) => { spirit(G, c, 'doctrine', 'Военная школа', { orgBonus: 0.05 }, '+5% организация'); rbonus(c, 'doc', 1, 1); } }),
  F('gen_fort', 'Линия укреплений', 'mil', 'Укрепления столицы, +10% оборона.', { req: ['gen_army1'], eff: (G, c) => { if (c.cap >= 0) G.reg[c.cap].fort = Math.max(G.reg[c.cap].fort, 2); spirit(G, c, 'forts', 'Оборонительные рубежи', { landDefense: 0.1 }, '+10% оборона'); } }),
  F('gen_air', 'Военно-воздушные силы', 'air', '80 истребителей, авиабаза в столице.', { req: ['gen_army1'], eff: (G, c) => { addEq(c, 'fighter', 80); if (c.cap >= 0) G.reg[c.cap].air = Math.min(5, G.reg[c.cap].air + 1); if (!c.tech.fighter1) grantTech(G, c, 'fighter1'); } }),
  F('gen_navy', 'Морская программа', 'nav', '+2 верфи.', { cond: (G, c) => c.cap >= 0 && c._dock !== undefined && REG.some((R, i) => G.reg[i].o === c.tag && R.seas.length), condText: 'Есть выход к морю', w: 0.5, eff: (G, c) => addFactories(G, c, 'dock', 2) }),
  F('gen_dem', 'Курс на демократию', 'pol', 'Рост поддержки демократии.', { excl: ['gen_fas', 'gen_com', 'gen_neu'], cond: (G, c) => !c.over, condText: 'Независимая страна', w: 0.6, aiCond: (G, c) => c.ideo === 'dem',
    eff: (G, c) => { spirit(G, c, 'ideo', 'Либеральные реформы', { driftDem: 0.08, stability: 0.05 }, 'Рост поддержки демократии'); bump(c, 'pp', 50); } }),
  F('gen_fas', 'Национальное возрождение', 'pol', 'Рост поддержки фашизма, +поддержка войны.', { excl: ['gen_dem', 'gen_com', 'gen_neu'], cond: (G, c) => !c.over, condText: 'Независимая страна', w: 0.6, aiCond: (G, c) => c.ideo === 'fas',
    eff: (G, c) => { spirit(G, c, 'ideo', 'Национальное движение', { driftFas: 0.08, warSupport: 0.1 }, 'Рост поддержки фашизма'); } }),
  F('gen_com', 'Рабочее движение', 'pol', 'Рост поддержки коммунизма.', { excl: ['gen_dem', 'gen_fas', 'gen_neu'], cond: (G, c) => !c.over, condText: 'Независимая страна', w: 0.6, aiCond: (G, c) => c.ideo === 'com',
    eff: (G, c) => { spirit(G, c, 'ideo', 'Рабочие советы', { driftCom: 0.08, recruitable: 0.01 }, 'Рост поддержки коммунизма'); } }),
  F('gen_neu', 'Вооружённый нейтралитет', 'pol', '+10% стабильность, +5% оборона.', { excl: ['gen_dem', 'gen_fas', 'gen_com'], w: 0.6, aiCond: (G, c) => c.ideo === 'neu',
    eff: (G, c) => { spirit(G, c, 'ideo', 'Вооружённый нейтралитет', { stability: 0.1, landDefense: 0.05 }, '+10% стабильность'); } }),
  F('gen_ally', 'Поиск союзников', 'dip', 'Вступить в альянс близкой по идеологии державы.', { cond: (G, c) => !c.fac && !c.over && !!facFor(G, c), condText: 'Есть альянс с той же идеологией', w: 0.4, aiCond: () => false,
    eff: (G, c) => { const id = facFor(G, c); if (id) joinFaction(G, c.tag, id); } }),
];

export const FOCUS_TREES = { GER, SOV, ENG, FRA, ITA, JAP, USA };
export const GENERIC = GEN;
export function focusTree(tag) { return FOCUS_TREES[tag] || GEN; }
export const FOCUS_BY_ID = {};
for (const t of [GER, SOV, ENG, FRA, ITA, JAP, USA, GEN]) for (const f of t) FOCUS_BY_ID[f.id] = f;
export { D, NREG, cn, warNow };
